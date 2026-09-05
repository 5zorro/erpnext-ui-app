/**
 * Hydrate Bill line allocation scratch from linked PO / PR rows (OI-134).
 * Pure — ERP fetch lives in electron/main.js.
 */

import { mergeAllocationFromPoMeta } from "./bill-item-table.js";
import { maxBillableQtyForSourceItem } from "./bill-po-qty-split.js";

/**
 * @typedef {import("./bill-item-table.js").PoLineMeta} PoLineMeta
 */

/**
 * Build per-row source metadata from ERP PO Item / PR Item + PO header rows.
 * @param {object|null|undefined} doc
 * @param {Record<string, { idx?: number|string, sales_order?: string, customer?: string, qty?: unknown, rate?: unknown, amount?: unknown, billed_amt?: unknown }>} [poItemsByName] keyed by PO Item name (po_detail)
 * @param {Record<string, { customer?: string, customer_name?: string }>} [poHeadersByName] keyed by PO name
 * @param {Record<string, { idx?: number|string, parent?: string, qty?: unknown, rate?: unknown, amount?: unknown, billed_amt?: unknown }>} [prItemsByName] keyed by PR Item name (pr_detail)
 * @returns {Record<number, PoLineMeta>}
 */
export function indexPoLineMeta(doc, poItemsByName = {}, poHeadersByName = {}, prItemsByName = {}) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  /** @type {Record<number, PoLineMeta>} */
  const out = {};
  items.forEach((it, idx) => {
    const row = it || {};
    const poDetail = row.po_detail != null ? String(row.po_detail).trim() : "";
    const prDetail = row.pr_detail != null ? String(row.pr_detail).trim() : "";
    const poName = row.purchase_order != null ? String(row.purchase_order).trim() : "";
    const prName = row.purchase_receipt != null ? String(row.purchase_receipt).trim() : "";
    const poi = poDetail ? poItemsByName[poDetail] : null;
    const pri = prDetail ? prItemsByName[prDetail] : null;
    const poh = poName ? poHeadersByName[poName] : null;
    if (!poDetail && !prDetail && !poName && !prName && !poi && !pri) return;
    const salesOrder =
      (poi && poi.sales_order != null ? String(poi.sales_order).trim() : "") || "";
    const customer =
      (poh && poh.customer != null ? String(poh.customer).trim() : "") ||
      (poi && poi.customer != null ? String(poi.customer).trim() : "") ||
      "";
    const customerName =
      (poh && poh.customer_name != null ? String(poh.customer_name).trim() : "") || "";
    /** @type {number|undefined} */
    let maxBillableQty;
    if (prDetail && pri) {
      const cap = maxBillableQtyForSourceItem(pri);
      if (cap != null) maxBillableQty = cap;
    } else if (poDetail && poi) {
      const cap = maxBillableQtyForSourceItem(poi);
      if (cap != null) maxBillableQty = cap;
    }
    out[idx] = {
      poName,
      poLineIdx: poi && poi.idx != null ? poi.idx : "",
      poDetail,
      prName,
      prLineIdx: pri && pri.idx != null ? pri.idx : "",
      prDetail,
      salesOrder,
      customer,
      customerName,
      ...(maxBillableQty != null ? { maxBillableQty } : {}),
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
 * Collect PO Item names, PO header names, and PR Item names to fetch for a Bill doc.
 * @param {object|null|undefined} doc
 */
export function poFetchKeysForBillDoc(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const poDetails = [];
  const prDetails = [];
  const poNames = new Set();
  const prNames = new Set();
  for (const it of items) {
    if (!it) continue;
    const pd = it.po_detail != null ? String(it.po_detail).trim() : "";
    const prd = it.pr_detail != null ? String(it.pr_detail).trim() : "";
    const po = it.purchase_order != null ? String(it.purchase_order).trim() : "";
    const pr = it.purchase_receipt != null ? String(it.purchase_receipt).trim() : "";
    if (pd) poDetails.push(pd);
    if (prd) prDetails.push(prd);
    if (po) poNames.add(po);
    if (pr) prNames.add(pr);
  }
  return { poDetails, prDetails, poNames: [...poNames], prNames: [...prNames] };
}

/**
 * Extract PO Item rows from parent Purchase Order docs (avoids child-doctype list API).
 * @param {object[]} parentDocs
 * @param {string[]} poDetails po_detail names to keep
 */
export function poItemsAndHeadersFromParentDocs(parentDocs, poDetails) {
  const want = new Set(poDetails);
  /** @type {Record<string, object>} */
  const poItemsByName = {};
  /** @type {Record<string, object>} */
  const poHeadersByName = {};
  for (const parent of parentDocs || []) {
    if (!parent || parent.name == null) continue;
    const poName = String(parent.name);
    poHeadersByName[poName] = parent;
    const rows = Array.isArray(parent.items) ? parent.items : [];
    for (const row of rows) {
      if (row && row.name != null && want.has(String(row.name))) {
        poItemsByName[String(row.name)] = row;
      }
    }
  }
  return { poItemsByName, poHeadersByName };
}

/**
 * Extract PR Item rows from parent Purchase Receipt docs.
 * @param {object[]} parentDocs
 * @param {string[]} prDetails pr_detail names to keep
 */
export function prItemsFromParentDocs(parentDocs, prDetails) {
  const want = new Set(prDetails);
  /** @type {Record<string, object>} */
  const prItemsByName = {};
  for (const parent of parentDocs || []) {
    const rows = Array.isArray(parent.items) ? parent.items : [];
    for (const row of rows) {
      if (row && row.name != null && want.has(String(row.name))) {
        prItemsByName[String(row.name)] = row;
      }
    }
  }
  return prItemsByName;
}
