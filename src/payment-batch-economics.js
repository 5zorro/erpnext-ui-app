/**
 * The OI-161 math: suggest which outstanding Bills to combine into one payment, and when to pay
 * them, by comparing per-payment fees saved against the float cost of paying early. Pure — no ERP
 * writes, no fetch. Suggestion only; the caller decides whether to act (HANDOFF "auditable how").
 *
 * Business rule (locked intent, from OI-161): minimize all-in payment cost (fees + lost float), not
 * due-date slavishness. Never batch past the earliest due date in a group — paying late to save
 * postage is never on the table. A discount window always wins its own comparison first, ahead of
 * any batching decision.
 */

import { effectivePayByDate } from "./bank-business-days.js";

/** @param {string} isoDate "YYYY-MM-DD" */
function parseIso(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate).trim());
  if (!m) throw new Error(`Invalid ISO date: ${isoDate}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Whole calendar days from `fromIso` to `toIso` (positive when `toIso` is later). */
function daysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 86400000);
}

/** @param {number} x */
function round2(x) {
  return Math.round(x * 100) / 100;
}

/** @param {number} x */
function fmt(x) {
  return round2(x).toFixed(2);
}

/** @param {number} amount @param {number} apr @param {number} days cost of paying `days` before the due date */
function floatCost(amount, apr, days) {
  if (days <= 0) return 0;
  return amount * (apr / 365) * days;
}

/**
 * @typedef {import("./outstanding-bills.js").OutstandingBillRow} OutstandingBillRow
 * @typedef {{
 *   supplier: string,
 *   bills: string[],          // installmentKeys (outstanding-bills.js) — not always == invoice name
 *   payOn: string,
 *   totalAmount: number,
 *   feesSaved: number,
 *   floatCost: number,
 *   netBenefit: number,
 *   rationale: string,
 *   reason: "batch" | "discount-capture" | "pay-alone",
 * }} PaymentBatchGroup
 */

/**
 * @param {{
 *   bills: OutstandingBillRow[],
 *   perPaymentFee: number,
 *   apr: number,
 *   groupWindowDays?: number,
 * }} args
 * @returns {{ groups: PaymentBatchGroup[] }}
 */
export function paymentBatchEconomics(args) {
  const { bills, perPaymentFee, apr } = args || {};
  const groupWindowDays = Number.isFinite(args?.groupWindowDays) ? args.groupWindowDays : 7;
  const list = Array.isArray(bills) ? bills : [];

  /** @type {PaymentBatchGroup[]} */
  const groups = [];
  const candidates = [];

  // Pass 1: discount capture always wins its own comparison first, independent of any group the
  // bill could otherwise join (OI-161: "do not let batching logic bury it").
  for (const bill of list) {
    const effectiveDueDate = effectivePayByDate(bill.dueDate);
    const captured = tryDiscountCapture(bill, effectiveDueDate, apr);
    if (captured) {
      groups.push(captured);
      continue;
    }
    candidates.push({ ...bill, effectiveDueDate });
  }

  // Pass 2: cluster remaining candidates by supplier + due-date proximity, then decide per cluster
  // whether batching actually wins on the numbers (all-or-nothing per cluster — no subset search).
  const bySupplier = new Map();
  for (const bill of candidates) {
    if (!bySupplier.has(bill.supplier)) bySupplier.set(bill.supplier, []);
    bySupplier.get(bill.supplier).push(bill);
  }

  for (const supplierBills of bySupplier.values()) {
    for (const cluster of clusterByDueDateWindow(supplierBills, groupWindowDays)) {
      groups.push(...resolveCluster(cluster, perPaymentFee, apr));
    }
  }

  return { groups };
}

/**
 * @param {OutstandingBillRow} bill
 * @param {string} effectiveDueDate
 * @param {number} apr
 * @returns {PaymentBatchGroup|null}
 */
function tryDiscountCapture(bill, effectiveDueDate, apr) {
  if (!bill.discountDate || !(bill.discountAmount > 0)) return null;
  const discountPayOn = effectivePayByDate(bill.discountDate);
  const daysEarly = daysBetween(discountPayOn, effectiveDueDate);
  if (daysEarly < 0) return null; // malformed data — discount date after due date; ignore
  const cost = round2(floatCost(bill.outstanding, apr, daysEarly));
  if (!(bill.discountAmount > cost)) return null;
  const net = round2(bill.discountAmount - cost);
  return {
    supplier: bill.supplier,
    bills: [bill.installmentKey],
    payOn: discountPayOn,
    totalAmount: round2(bill.outstanding),
    feesSaved: 0,
    floatCost: cost,
    netBenefit: net,
    rationale: `Discount capture: pay by ${discountPayOn} to save $${fmt(bill.discountAmount)} (float cost $${fmt(cost)}) = $${fmt(net)} net`,
    reason: "discount-capture",
  };
}

/**
 * Greedy same-supplier clustering: sort by effective due date, start a new cluster whenever a bill
 * is more than `groupWindowDays` past the cluster's earliest (anchor) bill.
 * @param {Array<OutstandingBillRow & { effectiveDueDate: string }>} bills
 * @param {number} groupWindowDays
 */
function clusterByDueDateWindow(bills, groupWindowDays) {
  const sorted = bills.slice().sort((a, b) => a.effectiveDueDate.localeCompare(b.effectiveDueDate));
  const clusters = [];
  let current = [];
  let anchor = null;
  for (const bill of sorted) {
    if (current.length && daysBetween(anchor, bill.effectiveDueDate) > groupWindowDays) {
      clusters.push(current);
      current = [];
    }
    if (!current.length) anchor = bill.effectiveDueDate;
    current.push(bill);
  }
  if (current.length) clusters.push(current);
  return clusters;
}

/**
 * @param {Array<OutstandingBillRow & { effectiveDueDate: string }>} cluster
 * @param {number} perPaymentFee
 * @param {number} apr
 * @returns {PaymentBatchGroup[]}
 */
function resolveCluster(cluster, perPaymentFee, apr) {
  if (cluster.length === 1) {
    return [payAloneRow(cluster[0], null, null)];
  }

  const payOn = cluster[0].effectiveDueDate; // sorted ascending — earliest wins, never later
  const totalAmount = round2(cluster.reduce((s, b) => s + b.outstanding, 0));
  const feesSaved = round2((cluster.length - 1) * perPaymentFee);
  const cost = round2(
    cluster.reduce((s, b) => s + floatCost(b.outstanding, apr, daysBetween(payOn, b.effectiveDueDate)), 0),
  );
  const netBenefit = round2(feesSaved - cost);

  if (netBenefit > 0) {
    return [
      {
        supplier: cluster[0].supplier,
        bills: cluster.map((b) => b.installmentKey),
        payOn,
        totalAmount,
        feesSaved,
        floatCost: cost,
        netBenefit,
        rationale: `${cluster.length} bills batched: $${fmt(feesSaved)} fee saved vs $${fmt(cost)} float cost = $${fmt(netBenefit)} net`,
        reason: "batch",
      },
    ];
  }

  // Economics don't favor batching this cluster — every bill pays alone, on its own effective date.
  return cluster.map((b) => payAloneRow(b, feesSaved, cost));
}

/**
 * @param {OutstandingBillRow & { effectiveDueDate: string }} bill
 * @param {number|null} rejectedFeesSaved non-null when this bill was in a cluster that didn't batch
 * @param {number|null} rejectedFloatCost
 * @returns {PaymentBatchGroup}
 */
function payAloneRow(bill, rejectedFeesSaved, rejectedFloatCost) {
  const rationale =
    rejectedFeesSaved != null
      ? `Not batched: $${fmt(rejectedFloatCost)} float cost would exceed $${fmt(rejectedFeesSaved)} fee savings`
      : `Paid alone: no other ${bill.supplier} bills within the batching window`;
  return {
    supplier: bill.supplier,
    bills: [bill.installmentKey],
    payOn: bill.effectiveDueDate,
    totalAmount: round2(bill.outstanding),
    feesSaved: 0,
    floatCost: 0,
    netBenefit: 0,
    rationale,
    reason: "pay-alone",
  };
}
