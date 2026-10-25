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
 * @typedef {{ salesOrder: string, salesOrderItem: string, open: number, held?: string }} SalesOrderOpenLine
 *   one Sales Order line for the Bill line's item, and what it still needs ordered
 *   (`qty − ordered_qty / conversion_factor`, as ERPNext's own `make_purchase_order`); a Sales Order
 *   with no line for the item comes as `salesOrderItem: ""`, `open: 0`. `held` is the order's status
 *   when it is *On Hold* or *Closed*
 * @typedef {{ salesOrder: string, salesOrderItem: string, open: number, held?: string, gets: number, diff: number, fromStock: boolean }} SalesOrderSplitRow
 *   `diff` = gets − open: below 0, that much of the order is filled from stock instead
 */

/**
 * How a Bill line's qty goes to the Sales Orders it is assigned to — by need (review 10-19 R6b-4,
 * 5zorro 2026-10-22: "weighted by need is exactly what 99% of the use cases will want").
 *
 * - Each open Sales Order line is weighted by what it still needs; the qty is split with the one
 *   rule (`splitUnitsByWeights`) in the item's unit: whole units for a *Must be Whole Number* unit,
 *   thousandths for any other (ERPNext's qty is a decimal; only those units refuse fractions).
 * - An order ticked **from stock** takes nothing from this Bill: what it needs is filled from stock.
 * - More than the orders need: each gets what it needs and the rest is **to stock** — a PO line for
 *   no order, since ERPNext refuses ordering past a Sales Order line's qty (allowance 0 % here).
 * - Anything but an exact fill is a **costing assumption** (stock is costed at its own rate, or a
 *   fallback rate when it runs negative), so it needs the clerk's "Okay" (`needsConfirm`).
 * - An order **On Hold or Closed** needs nothing — ERPNext's own count of what open orders need
 *   (`get_reserved_qty`, the Bin's Reserved Qty) leaves such orders out, and Desk offers no
 *   Purchase Order from one. It takes nothing and is shown, and the clerk is asked (it was picked
 *   while open and paused since, or the Bill line remembers it).
 *
 * @param {{ qty: number, wholeUnits?: boolean|null, lines: SalesOrderOpenLine[], fromStock?: string[] }} opts
 *   `wholeUnits` null (unit unknown): whole when the qty is whole; `fromStock` = Sales Order names
 * @returns {{ ok: true, rows: SalesOrderSplitRow[], toStock: number, needsConfirm: boolean, key: string } | { ok: false, reason: string }}
 */
export function planSalesOrderSplit(opts) {
  const total = Number(opts && opts.qty);
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, reason: "the line has no quantity to assign." };
  }
  const whole = opts.wholeUnits == null ? Number.isInteger(total) : !!opts.wholeUnits;
  if (whole && !Number.isInteger(total)) {
    return { ok: false, reason: `${total} is not a whole number, and this item's unit allows only whole units.` };
  }
  const step = whole ? 1 : 1000; // whole units, or thousandths
  const units = Math.round(total * step);
  const stockSet = new Set((opts.fromStock || []).map(String));
  const lines = (Array.isArray(opts.lines) ? opts.lines : []).map((l) => ({
    salesOrder: String((l && l.salesOrder) || ""),
    salesOrderItem: String((l && l.salesOrderItem) || ""),
    open: Math.max(0, Number(l && l.open) || 0),
    ...(l && l.held ? { held: String(l.held) } : {}),
  }));
  // A held order's need is 0, as ERPNext counts it; its own open qty is still shown.
  const openUnits = lines.map((l) => (l.held ? 0 : whole ? Math.floor(l.open + 1e-9) : Math.round(l.open * 1000)));
  const takes = lines.map((l, i) => !stockSet.has(l.salesOrder) && !!l.salesOrderItem && openUnits[i] > 0);
  const weights = openUnits.map((u, i) => (takes[i] ? u : 0));
  const need = weights.reduce((a, b) => a + b, 0);
  const getsUnits = units <= need ? splitUnitsByWeights(units, weights) : weights.slice();
  const toStockUnits = Math.max(0, units - need);
  const rows = lines.map((l, i) => ({
    ...l,
    gets: getsUnits[i] / step,
    diff: (getsUnits[i] - openUnits[i]) / step,
    fromStock: stockSet.has(l.salesOrder),
  }));
  const needsConfirm = toStockUnits > 0 || getsUnits.some((g, i) => g !== openUnits[i]) || lines.some((l) => l.held);
  const held = lines.map((l) => l.held || "");
  const key = JSON.stringify({ g: getsUnits, o: openUnits, s: toStockUnits, f: [...stockSet].sort(), h: held });
  return { ok: true, rows, toStock: toStockUnits / step, needsConfirm, key };
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
