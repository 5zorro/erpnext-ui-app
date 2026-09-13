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
 *   id: string,               // unique per group — `payOn` is NOT unique; see assignGroupIds
 *   supplier: string,
 *   bills: string[],          // installmentKeys (outstanding-bills.js) — not always == invoice name
 *   payOn: string,
 *   totalAmount: number,
 *   feesSaved: number,
 *   floatCost: number,
 *   netBenefit: number,
 *   rationale: string,
 *   reason: "batch" | "discount-capture" | "pay-alone",
 *   method?: string,          // Mode of Payment this group is paid by — present only when the
 *                             //   caller supplied `feeForMethod`; absent for a NULL-method bill
 *   perPaymentFee?: number,   // the fee this group was actually priced at. Recorded rather than
 *                             //   recomputed so the audit trail (B5) can show the input, not just
 *                             //   the arithmetic — a $0.40 ACH saving and a $25 wire saving are
 *                             //   indistinguishable once collapsed into `feesSaved`
 * }} PaymentBatchGroup
 */

/**
 * @param {{
 *   bills: OutstandingBillRow[],
 *   perPaymentFee: number,
 *   apr: number,
 *   groupWindowDays?: number,
 *   feeForMethod?: (method: string) => number,
 * }} args `feeForMethod` opts into per-method pricing (Packet B2b) — pass
 *   `paymentMethodFeeResolver(prefs)` from `payment-batch-prefs.js`. Omit it and behaviour is
 *   byte-identical to before: one partition, one flat `perPaymentFee`.
 * @returns {{ groups: PaymentBatchGroup[] }}
 */
export function paymentBatchEconomics(args) {
  const { bills, perPaymentFee, apr, feeForMethod } = args || {};
  const byMethodPricing = typeof feeForMethod === "function";
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

  // Pass 2: partition by METHOD, then cluster by supplier + due-date proximity, then decide per
  // cluster whether batching actually wins on the numbers (all-or-nothing per cluster — no subset
  // search, except the free one `coalesceSameDayPayAlone` picks up afterwards).
  //
  // 🔴 Method partitioning is a hard constraint, not an optimisation (Packet B2b): a **Payment
  // Entry carries one header `mode_of_payment`**, so bills paid different ways physically cannot
  // merge into one payment however good the arithmetic looks. Clustering by supplier alone would
  // propose an impossible batch the moment a vendor's bills carry different terms — which Packet A
  // makes normal rather than exotic. Partitioning first also means each partition is priced at its
  // own fee, which matters enormously: ACH is $0.40 and an international wire is $50.
  const byMethod = new Map();
  for (const bill of candidates) {
    const key = byMethodPricing ? methodKeyOf(bill) : "";
    if (!byMethod.has(key)) byMethod.set(key, []);
    byMethod.get(key).push(bill);
  }

  for (const [method, methodBills] of byMethod) {
    const fee = byMethodPricing ? resolveMethodFee(feeForMethod, method, perPaymentFee) : perPaymentFee;

    const bySupplier = new Map();
    for (const bill of methodBills) {
      if (!bySupplier.has(bill.supplier)) bySupplier.set(bill.supplier, []);
      bySupplier.get(bill.supplier).push(bill);
    }

    /** @type {PaymentBatchGroup[]} */
    const methodGroups = [];
    for (const supplierBills of bySupplier.values()) {
      for (const cluster of clusterByDueDateWindow(supplierBills, groupWindowDays)) {
        methodGroups.push(...resolveCluster(cluster, fee, apr));
      }
    }

    // Coalescing is per-partition too — two same-day pay-alone bills paid different ways are still
    // two payments, so the "free" merge is only free within one method.
    for (const g of coalesceSameDayPayAlone(methodGroups, fee)) {
      groups.push(byMethodPricing ? tagMethod(g, method, fee) : g);
    }
  }

  return { groups: assignGroupIds(groups) };
}

/**
 * The partition key for a bill: its `Mode of Payment`, or `""` when the bill does not state one.
 *
 * NULL-method bills legitimately share a partition — that is every row in the sandbox today, and
 * they are all priced at the caller's fallback fee. They must not be silently folded in with a
 * named method: "unknown" and "ACH" are different claims, and merging them would batch a cheque
 * with an ACH push.
 *
 * @param {OutstandingBillRow} bill
 * @returns {string}
 */
function methodKeyOf(bill) {
  const m = bill && bill.modeOfPayment;
  return m == null ? "" : String(m).trim();
}

/**
 * The fee for one method partition, falling back to the flat `perPaymentFee` when the resolver
 * declines. Never falls back to `0` — a free payment would make the engine invent fee savings.
 *
 * @param {(method: string) => number} feeForMethod
 * @param {string} method
 * @param {number} fallback
 * @returns {number}
 */
function resolveMethodFee(feeForMethod, method, fallback) {
  let fee;
  try {
    fee = feeForMethod(method);
  } catch {
    fee = undefined;
  }
  if (Number.isFinite(fee) && Number(fee) >= 0) return Number(fee);
  return Number.isFinite(fallback) && Number(fallback) >= 0 ? Number(fallback) : 0;
}

/**
 * Record what this group was priced as, for the audit trail (B5).
 * @param {PaymentBatchGroup} g @param {string} method @param {number} fee
 * @returns {PaymentBatchGroup}
 */
function tagMethod(g, method, fee) {
  const out = { ...g, perPaymentFee: fee };
  if (method) out.method = method;
  return out;
}

/**
 * The one subset `resolveCluster` must never leave on the table: two bills of the same supplier
 * whose **effective pay dates are already identical**. Batching them moves no payment by a single
 * day, so the float cost is exactly zero and the fee saving is pure — one check instead of two is
 * strictly better, with nothing to weigh. `resolveCluster` is all-or-nothing per cluster, so when a
 * cluster's overall economics fail it emits a separate pay-alone group per bill, same-day ones
 * included.
 *
 * Found 2026-09-08 dogfooding SUP-DAILY-LG: the bank calendar pulls a Saturday and a Sunday due
 * date back onto the same Friday (and a pre-holiday Friday back onto the same Thursday), so 13 of
 * that vendor's dates carried 2–5 separate proposed checks. 5zorro saw the symptom from the other
 * end — *"separate payments visible, but on hover, a group of more than 1 lights up"*.
 *
 * Only pay-alone groups coalesce. A discount capture keeps its own identity even when it lands on
 * a shared date: its rationale and its deduction are per-bill, and OI-161 locks it as an
 * independent comparison ahead of any batching decision.
 *
 * @param {PaymentBatchGroup[]} groups
 * @param {number} perPaymentFee
 * @returns {PaymentBatchGroup[]} new array; input groups are never mutated
 */
function coalesceSameDayPayAlone(groups, perPaymentFee) {
  /** @type {Map<string, PaymentBatchGroup[]>} */
  const buckets = new Map();
  for (const g of groups) {
    if (g.reason !== "pay-alone") continue;
    const key = `${g.supplier} ${g.payOn}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }

  /** @type {Map<PaymentBatchGroup, PaymentBatchGroup>} first-of-bucket -> merged replacement */
  const mergedFor = new Map();
  const absorbed = new Set();
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const bills = bucket.flatMap((g) => g.bills);
    const feesSaved = round2((bucket.length - 1) * perPaymentFee);
    mergedFor.set(bucket[0], {
      ...bucket[0],
      bills,
      totalAmount: round2(bucket.reduce((s, g) => s + g.totalAmount, 0)),
      feesSaved,
      floatCost: 0,
      netBenefit: feesSaved,
      rationale: `${bucket.length} bills already payable on ${bucket[0].payOn}: one payment saves $${fmt(feesSaved)} in fees at no float cost`,
      reason: "batch",
    });
    for (const g of bucket.slice(1)) absorbed.add(g);
  }

  // Rebuild in place so output order is unchanged apart from the removals.
  return groups.filter((g) => !absorbed.has(g)).map((g) => mergedFor.get(g) || g);
}

/**
 * A stable, unique id per group. The view needs one to tell two proposed payments apart — it used
 * `payOn`, which is not unique (see `coalesceSameDayPayAlone`), so hovering one same-day check lit
 * every other check on that date and their ribbons with it.
 *
 * Every bill lands in exactly one group (a discount capture removes its bill from `candidates`), so
 * the first member's `installmentKey` is already globally unique; pairing it with `payOn` just keeps
 * the id readable in the DOM. Deterministic — the same inputs give the same ids, so a re-render
 * from a prefs change does not silently move a pinned focus onto a different payment.
 *
 * @param {PaymentBatchGroup[]} groups
 * @returns {PaymentBatchGroup[]}
 */
function assignGroupIds(groups) {
  return groups.map((g, i) => ({ ...g, id: `${g.payOn}#${(g.bills && g.bills[0]) || `g${i}`}` }));
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
  // Any two of these that share an effective date are re-merged by `coalesceSameDayPayAlone`: that
  // subset costs no float at all, so it was never part of this cluster-wide comparison.
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
