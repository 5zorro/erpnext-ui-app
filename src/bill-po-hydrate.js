/**
 * Hydrate Bill line allocation scratch from linked PO / PO Item rows (OI-134).
 * Pure — ERP fetch lives in electron/main.js.
 */

import { mergeAllocationFromPoMeta } from "./bill-item-table.js";

/**
 * @typedef {import("./bill-item-table.js").PoLineMeta} PoLineMeta
 */

/**
 * Build per-row PO metadata from ERP PO Item + PO header rows.
 * @param {object|null|undefined} doc
 * @param {Record<string, { idx?: number|string, sales_order?: string, customer?: string }>} [poItemsByName] keyed by PO Item name (po_detail)
 * @param {Record<string, { customer?: string, customer_name?: string }>} [poHeadersByName] keyed by PO name
 * @returns {Record<number, PoLineMeta>}
 */
export function indexPoLineMeta(doc, poItemsByName = {}, poHeadersByName = {}) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  /** @type {Record<number, PoLineMeta>} */
  const out = {};
  items.forEach((it, idx) => {
    const row = it || {};
    const poDetail = row.po_detail != null ? String(row.po_detail).trim() : "";
    const poName = row.purchase_order != null ? String(row.purchase_order).trim() : "";
    const poi = poDetail ? poItemsByName[poDetail] : null;
    const poh = poName ? poHeadersByName[poName] : null;
    if (!poDetail && !poName && !poi) return;
    const salesOrder =
      (poi && poi.sales_order != null ? String(poi.sales_order).trim() : "") || "";
    const customer =
      (poh && poh.customer != null ? String(poh.customer).trim() : "") ||
      (poi && poi.customer != null ? String(poi.customer).trim() : "") ||
      "";
    const customerName =
      (poh && poh.customer_name != null ? String(poh.customer_name).trim() : "") || "";
    out[idx] = {
      poName,
      poLineIdx: poi && poi.idx != null ? poi.idx : "",
      poDetail,
      salesOrder,
      customer,
      customerName,
    };
  });
  return out;
}

/**
 * Merge linked PO customer/SO into shell scratch (scratch wins when already set).
 * @param {object|null|undefined} doc
 * @param {Record<string|number, import("./bill-line-allocation.js").LineAllocation>} [scratchByRow]
 * @param {Record<string|number, PoLineMeta>} [poMetaByRow]
 * @returns {Record<number, import("./bill-line-allocation.js").LineAllocation>}
 */
export function hydrateBillLineAllocations(doc, scratchByRow = {}, poMetaByRow = {}) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  /** @type {Record<number, import("./bill-line-allocation.js").LineAllocation>} */
  const out = {};
  items.forEach((_, idx) => {
    const scratch = scratchByRow[idx] ?? scratchByRow[String(idx)];
    const meta = poMetaByRow[idx] ?? poMetaByRow[String(idx)];
    out[idx] = mergeAllocationFromPoMeta(scratch, meta);
  });
  return out;
}

/**
 * Collect PO Item names and PO header names to fetch for a Bill doc.
 * @param {object|null|undefined} doc
 */
export function poFetchKeysForBillDoc(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const poDetails = [];
  const poNames = new Set();
  for (const it of items) {
    if (!it) continue;
    const pd = it.po_detail != null ? String(it.po_detail).trim() : "";
    const po = it.purchase_order != null ? String(it.purchase_order).trim() : "";
    if (pd) poDetails.push(pd);
    if (po) poNames.add(po);
  }
  return { poDetails, poNames: [...poNames] };
}
