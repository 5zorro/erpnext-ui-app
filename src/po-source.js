/**
 * Which ERPNext mapper fills a Doc skin from a picked source (plan 2026-10-12 S3). Each mapper
 * returns an **unsaved** document whose lines the form takes (`mergeFromMapped`); the lines keep
 * their link back (`material_request_item`, `supplier_quotation_item`, `sales_order_item`).
 *
 * The Sales Order is the odd one: its `make_purchase_order` *saves* each PO it builds for a named
 * vendor (v16 `if doc.supplier: doc.insert()`), so the PO's picker asks it with no vendor — it then
 * returns the PO unsaved (proven on the sandbox 2026-10-12) — and keeps the vendor already on the
 * form. It also needs the lines spelled out (`selected_items`, one per item code).
 */

/** @type {Record<string, Record<string, string>>} skin → source kind → whitelisted method */
export const DOC_SOURCE_MAPPERS = Object.freeze({
  receipt: Object.freeze({ po: "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt" }),
  po: Object.freeze({
    mr: "erpnext.stock.doctype.material_request.material_request.make_purchase_order",
    sq: "erpnext.buying.doctype.supplier_quotation.supplier_quotation.make_purchase_order",
    so: "erpnext.selling.doctype.sales_order.sales_order.make_purchase_order",
  }),
});

/** What each source is called in messages. */
export const SOURCE_KIND_NOUN = Object.freeze({
  po: "Purchase Order",
  pr: "Item Receipt",
  mr: "Material Request",
  sq: "Supplier Quotation",
  so: "Sales Order",
});

/**
 * @param {string|null|undefined} skinId
 * @param {string|null|undefined} kind
 * @returns {string|null} the mapper method, or null when this skin takes no such source
 */
export function docSourceMapper(skinId, kind) {
  const bySkin = DOC_SOURCE_MAPPERS[String(skinId || "")];
  return (bySkin && bySkin[String(kind || "")]) || null;
}

/**
 * Why a picked source brought in nothing: every line of it is already on an Item Receipt (the PO
 * mapper copies only lines with `received_qty < qty`) or otherwise used up. The merge refuses it
 * rather than clear the form's lines (review R7-1).
 * @param {string|null|undefined} skinId
 * @param {string|null|undefined} kind
 * @param {string} name
 * @returns {string}
 */
export function emptySourceReason(skinId, kind, name) {
  if (skinId === "receipt" && kind === "po") return `Every line of ${name} is already received — nothing to bring in.`;
  const noun = SOURCE_KIND_NOUN[String(kind || "")] || "That document";
  return `${noun} ${name} has no lines left to bring in.`;
}

/**
 * The Sales Order mapper's `selected_items`: each item still to order, **with no vendor** (so the
 * mapper does not save a PO of its own). One entry per item code — ERPNext maps by item code.
 * @param {Array<{ itemCode: string, pendingQty: number }>} pendingLines from poPendingLines
 * @returns {Array<{ item_code: string, supplier: null }>}
 */
export function soSelectedItemsWithoutVendor(pendingLines) {
  const seen = new Set();
  const out = [];
  for (const l of Array.isArray(pendingLines) ? pendingLines : []) {
    if (!l || !(l.pendingQty > 0) || seen.has(l.itemCode)) continue;
    seen.add(l.itemCode);
    out.push({ item_code: l.itemCode, supplier: null });
  }
  return out;
}

/**
 * Trim mapped Sales Order lines to what is not already on a draft PO (ERPNext counts only submitted
 * POs as ordered), dropping lines with nothing left.
 * @param {Array<Record<string, any>>} items the mapped PO's lines
 * @param {Record<string, number>} pendingByRow Sales Order line name → quantity still to order
 * @returns {Array<Record<string, any>>}
 */
export function trimMappedSoLines(items, pendingByRow) {
  const left = pendingByRow || {};
  return (Array.isArray(items) ? items : [])
    .map((it) => {
      const want = left[it && it.sales_order_item];
      if (want == null || !(Number(want) < Number(it.qty))) return it;
      const qty = Math.max(0, Number(want));
      return { ...it, qty, stock_qty: qty * (Number(it.conversion_factor) || 1) };
    })
    .filter((it) => it && Number(it.qty) > 0);
}
