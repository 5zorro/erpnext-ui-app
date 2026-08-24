/**
 * JIT Purchase Order bridge for Bill ↔ Sales Order (OI-134).
 * ERPNext stores sales_order on PO/PR lines, not PI lines — create or reuse a PO bridge.
 */

/**
 * Logbook title for auto-created bridge POs: JIT-{SO name}-{supplier ref on Bill}.
 * @param {string} salesOrderName
 * @param {string|null|undefined} supplierRefNo Bill `bill_no` when known
 * @returns {string}
 */
export function formatJitPoTitle(salesOrderName, supplierRefNo) {
  const so = salesOrderName == null ? "" : String(salesOrderName).trim();
  const ref = supplierRefNo == null ? "" : String(supplierRefNo).trim();
  if (!so && !ref) return "JIT";
  if (!so) return ref ? `JIT--${ref}` : "JIT";
  if (!ref) return `JIT-${so}`;
  return `JIT-${so}-${ref}`;
}

/**
 * Pick an open submitted PO for this vendor already tied to the SO (prefer unbilled).
 * @param {Array<{ name?: string, supplier?: string, per_billed?: number, docstatus?: number, title?: string }>} purchaseOrders
 * @param {Array<{ parent?: string, sales_order?: string }>} poItems
 * @param {string} supplier
 * @param {string} salesOrderName
 * @returns {{ name: string, title?: string }|null}
 */
export function findExistingBridgePo(purchaseOrders, poItems, supplier, salesOrderName) {
  const sup = supplier == null ? "" : String(supplier).trim();
  const so = salesOrderName == null ? "" : String(salesOrderName).trim();
  if (!sup || !so) return null;

  const parentsWithSo = new Set(
    (poItems || [])
      .filter((row) => row && String(row.sales_order || "").trim() === so && row.parent)
      .map((row) => String(row.parent)),
  );
  if (!parentsWithSo.size) return null;

  for (const po of purchaseOrders || []) {
    if (!po || !po.name) continue;
    if (String(po.supplier || "").trim() !== sup) continue;
    if (po.docstatus != null && Number(po.docstatus) !== 1) continue;
    if (!parentsWithSo.has(String(po.name))) continue;
    const billed = po.per_billed == null ? 0 : Number(po.per_billed);
    if (Number.isFinite(billed) && billed >= 100) continue;
    return { name: String(po.name), title: po.title != null ? String(po.title) : "" };
  }
  return null;
}

/**
 * Map Sales Order child rows to PO item stubs (server fills UOM/rate where missing).
 * @param {Array<{ name?: string, item_code?: string, qty?: number, rate?: number, uom?: string }>} soItems
 * @param {string} salesOrderName
 * @param {string} scheduleDate YYYY-MM-DD
 * @returns {object[]}
 */
export function jitPoItemsFromSalesOrder(soItems, salesOrderName, scheduleDate) {
  const so = salesOrderName == null ? "" : String(salesOrderName).trim();
  const sched = scheduleDate == null ? "" : String(scheduleDate).trim();
  /** @type {object[]} */
  const out = [];
  for (const row of soItems || []) {
    if (!row || !row.item_code) continue;
    const qty = Number(row.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    /** @type {Record<string, unknown>} */
    const item = {
      item_code: String(row.item_code),
      qty,
      schedule_date: sched || undefined,
      sales_order: so || undefined,
    };
    if (row.name) item.sales_order_item = String(row.name);
    if (row.uom) item.uom = String(row.uom);
    if (row.rate != null && Number.isFinite(Number(row.rate))) {
      item.rate = Number(row.rate);
    }
    out.push(item);
  }
  return out;
}
