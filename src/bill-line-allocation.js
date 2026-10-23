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
 * Split a Bill line's qty across the N Sales Orders it is assigned to, for the bridge PO's lines.
 *
 * Whole units when the qty is whole (review 10-19 R6b-4): the extra units go to the earliest
 * orders, so 7 over 3 is 3 / 2 / 2. The old even split to thousandths (2 over 3 = 0.666 / 0.666 /
 * 0.668) was refused by ERPNext for any whole-number unit such as Nos (`purchase_order.py`
 * `validate_uom_is_integer`). Fewer units than orders, or no qty at all, is refused here with the
 * reason, instead of the old 1 per order. A fractional qty (a unit that allows fractions) splits to
 * thousandths, the last order taking the rest.
 * @param {number} qty
 * @param {number} n
 * @returns {{ ok: true, parts: number[] } | { ok: false, reason: string }}
 */
export function splitQtyAcrossSalesOrders(qty, n) {
  const total = Number(qty);
  const count = Math.max(1, Math.floor(Number(n)) || 1);
  const orders = `${count} Sales Order${count === 1 ? "" : "s"}`;
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, reason: `the line has no quantity to split across ${orders}.` };
  }
  if (Number.isInteger(total)) {
    if (total < count) {
      return {
        ok: false,
        reason: `${total} unit${total === 1 ? "" : "s"} can't be split across ${orders} — assign fewer orders or split the line.`,
      };
    }
    const base = Math.floor(total / count);
    const extra = total % count;
    return { ok: true, parts: Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0)) };
  }
  const base = Math.floor((total / count) * 1000) / 1000;
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] = Math.round((total - base * (count - 1)) * 1000) / 1000;
  return { ok: true, parts };
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
