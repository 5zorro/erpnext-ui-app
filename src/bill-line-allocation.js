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
 * Split line qty across N sales orders (ponytail: equal split; remainder on last).
 * @param {number} qty
 * @param {number} n
 * @returns {number[]}
 */
export function splitQtyAcrossSalesOrders(qty, n) {
  const total = Number(qty);
  const count = Math.max(1, Math.floor(Number(n)) || 1);
  if (!Number.isFinite(total) || total <= 0) {
    return Array.from({ length: count }, () => 1);
  }
  const base = Math.floor((total / count) * 1000) / 1000;
  const parts = Array.from({ length: count }, () => base);
  const sum = parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] += total - sum;
  return parts;
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
