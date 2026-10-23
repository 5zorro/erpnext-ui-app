/**
 * Bill line deal allocation — Customer + Sales order(s) display + Project (OI-134).
 * ERPNext persists `project` on PI items only; customer + multi-SO live in shell scratch until split/PO bridge.
 */

/**
 * @typedef {{
 *   customer?: string,
 *   customerName?: string,
 *   salesOrders?: string[],
 *   bridgePo?: string,
 * }} LineAllocation
 */

import { splitUnitsByWeights } from "./split-by-weights.js";

export const ALLOC_CUSTOMER_FIELD = "__alloc_customer";
export const ALLOC_SALES_ORDERS_FIELD = "__alloc_sales_orders";
export const JOB_COST_CENTER_FIELD = "project";
export const JOB_COST_CENTER_LABEL = "Project";

/** @type {readonly { label: string, field: string|null, linkDoctype?: string, displayOnly?: boolean, readOnly?: boolean, scratch?: boolean }[]} */
export const BILL_ALLOCATION_COLS = Object.freeze([
  {
    label: "Customer",
    field: ALLOC_CUSTOMER_FIELD,
    displayOnly: true,
    readOnly: true,
    scratch: true,
  },
  {
    label: "Sales order(s)",
    field: ALLOC_SALES_ORDERS_FIELD,
    displayOnly: true,
    readOnly: true,
    scratch: true,
  },
  {
    label: JOB_COST_CENTER_LABEL,
    field: JOB_COST_CENTER_FIELD,
    linkDoctype: "Project",
  },
]);

/**
 * @param {unknown} raw
 * @returns {LineAllocation}
 */
export function normalizeLineAllocation(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const salesOrders = Array.isArray(r.salesOrders)
    ? [...new Set(r.salesOrders.map((s) => String(s).trim()).filter(Boolean))]
    : [];
  return {
    customer: r.customer != null ? String(r.customer).trim() : "",
    customerName: r.customerName != null ? String(r.customerName).trim() : "",
    salesOrders,
    bridgePo: r.bridgePo != null ? String(r.bridgePo).trim() : "",
  };
}

/**
 * @param {LineAllocation|null|undefined} alloc
 * @param {string|null|undefined} projectName
 * @returns {string}
 */
export function formatAllocationCustomer(alloc, projectName) {
  const a = alloc || {};
  if (a.customerName) return a.customerName;
  if (a.customer) return a.customer;
  if (projectName) return "";
  return "";
}

/**
 * @param {string[]|null|undefined} salesOrders
 * @param {string|null|undefined} bridgePo
 * @returns {string}
 */
export function formatAllocationSalesOrders(salesOrders, bridgePo) {
  const list = Array.isArray(salesOrders) ? salesOrders.filter(Boolean) : [];
  if (!list.length && bridgePo) return `(via ${bridgePo})`;
  if (!list.length) return "";
  const joined = list.join(", ");
  if (bridgePo && list.length === 1) return `${joined} · PO ${bridgePo}`;
  return joined;
}

/**
 * @param {Record<string|number, LineAllocation>|null|undefined} byRow
 * @param {number} rowIndex
 * @returns {LineAllocation}
 */
export function lineAllocationForRow(byRow, rowIndex) {
  if (!byRow || typeof byRow !== "object") return normalizeLineAllocation(null);
  const direct = byRow[rowIndex] ?? byRow[String(rowIndex)];
  return normalizeLineAllocation(direct);
}

/**
 * Split a Bill line's qty across the N Sales Orders it is assigned to, for the bridge PO's lines.
 *
 * ERPNext's qty is a decimal everywhere; only a unit with *Must be Whole Number* ticked (Nos, Box,
 * Pair, Set, Unit — 5 of the 239 units here) refuses fractions (`validate_uom_is_integer`). So:
 * - **whole-number unit**: whole units, the extra to the earliest orders (7 over 3 = 3 / 2 / 2);
 *   fewer units than orders, or a qty that is not whole, is refused with the reason;
 * - **any other unit**: thousandths (ERPNext's qty precision here), the extra thousandths to the
 *   earliest orders (1 plate over 2 = 0.5 / 0.5; 1 over 3 = 0.334 / 0.333 / 0.333).
 * `wholeUnits` null (the unit could not be read): whole when the qty is whole, as a guess.
 * Review 10-19 R6b-4; the unit rule from 5zorro's plate example, 2026-10-22.
 * @param {number} qty
 * @param {number} n
 * @param {{ wholeUnits?: boolean|null }} [opts]
 * @returns {{ ok: true, parts: number[] } | { ok: false, reason: string }}
 */
export function splitQtyAcrossSalesOrders(qty, n, opts = {}) {
  const total = Number(qty);
  const count = Math.max(1, Math.floor(Number(n)) || 1);
  const orders = `${count} Sales Order${count === 1 ? "" : "s"}`;
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, reason: `the line has no quantity to split across ${orders}.` };
  }
  const whole = opts.wholeUnits == null ? Number.isInteger(total) : !!opts.wholeUnits;
  if (whole && !Number.isInteger(total)) {
    return { ok: false, reason: `${total} is not a whole number, and this item's unit allows only whole units.` };
  }
  const step = whole ? 1 : 1000; // units of 1, or thousandths
  const units = Math.round(total * step);
  if (units < count) {
    return {
      ok: false,
      reason: whole
        ? `${total} unit${total === 1 ? "" : "s"} can't be split across ${orders} — assign fewer orders or split the line.`
        : `${total} is too little to split across ${orders}.`,
    };
  }
  return { ok: true, parts: splitUnitsByWeights(units, Array(count).fill(1)).map((u) => u / step) };
}

/**
 * JIT PO title when multiple SOs selected on one line.
 * @param {string[]} salesOrders
 * @param {string} supplierRef
 */
export function jitPoTitleForSalesOrders(salesOrders, supplierRef) {
  const sos = (salesOrders || []).map((s) => String(s).trim()).filter(Boolean);
  const ref = supplierRef == null ? "" : String(supplierRef).trim();
  if (!sos.length) return ref ? `JIT--${ref}` : "JIT";
  const soBit = sos.length === 1 ? sos[0] : sos.join("+");
  if (!ref) return `JIT-${soBit}`;
  return `JIT-${soBit}-${ref}`;
}

/**
 * What the clerk reads when a line's bridge Purchase Order was not made (review 10-19 R2-2). The
 * allocation itself still lands; this says what is missing and whether anything was left behind.
 * A reply with no `step` means the ERP page died mid-script, so the PO may already exist.
 * @param {{ ok?: boolean, step?: string, reason?: string, draft?: string, draftDeleted?: boolean, notRun?: boolean }|null|undefined} r
 * @returns {string}
 */
export function bridgePoFailureText(r) {
  const why = (r && r.reason) || "no reason given";
  const lead = "The Purchase Order for it was not made";
  if (!r || (!r.step && !r.notRun)) {
    return `${lead} — lost contact mid-way (${why}), so it may already exist. Check this vendor's Purchase Orders before assigning again.`;
  }
  if (r.step === "submit" && r.draft && r.draftDeleted === false) {
    return `${lead}: ERPNext refused to submit it (${why}), and the draft ${r.draft} could not be removed — delete it in ERPNext before assigning again.`;
  }
  if (r.step === "submit") return `${lead}: ERPNext refused to submit it (${why}). Nothing was left behind.`;
  return `${lead}: ${why}`;
}
