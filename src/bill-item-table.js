/**
 * Bill items table — line numbers, PO line display, source wash, sort (OI-134 / doc-wash).
 */

import { DOC_WASH_COLORS } from "./doc-wash.js";
import {
  formatAllocationCustomer,
  formatAllocationSalesOrders,
  lineAllocationForRow,
  normalizeLineAllocation,
} from "./bill-line-allocation.js";

export const BILL_LINE_NO_FIELD = "__bill_line_no";
export const PO_LINE_NO_FIELD = "__po_line_no";

/** @typedef {{
 *   poName?: string,
 *   poLineIdx?: number|string,
 *   poDetail?: string,
 *   salesOrder?: string,
 *   customer?: string,
 *   customerName?: string,
 * }} PoLineMeta */

/**
 * @type {readonly { label: string, field: string, displayOnly?: boolean, readOnly?: boolean, sortKey?: string }[]}
 */
export const BILL_LINE_META_COLS = Object.freeze([
  { label: "Line", field: BILL_LINE_NO_FIELD, displayOnly: true, readOnly: true, sortKey: "lineNo" },
  { label: "PO line", field: PO_LINE_NO_FIELD, displayOnly: true, readOnly: true, sortKey: "poLine" },
]);

/**
 * Wash role for a Bill item row background (OI-125).
 * @param {object|null|undefined} item
 * @returns {"invoice"|"order"|"fulfill"}
 */
export function washRoleForBillItem(item) {
  const row = item && typeof item === "object" ? item : {};
  if (row.purchase_receipt || row.pr_detail) return "fulfill";
  if (row.purchase_order || row.po_detail) return "order";
  return "invoice";
}

/**
 * Clerk-facing bill line number (1-based display; ERP idx when present).
 * @param {number} rowIndex
 * @param {object|null|undefined} item
 */
export function formatBillLineNumber(rowIndex, item) {
  const row = item && typeof item === "object" ? item : {};
  const idx = Number(row.idx);
  if (Number.isFinite(idx) && idx > 0) return String(idx);
  return String(rowIndex + 1);
}

/**
 * PO line label — include PO name when multiple POs appear on the Bill.
 * @param {object|null|undefined} item
 * @param {PoLineMeta|null|undefined} meta
 * @param {boolean} multiPoOnBill
 */
export function formatPoLineDisplay(item, meta, multiPoOnBill) {
  const row = item && typeof item === "object" ? item : {};
  const po = (meta && meta.poName) || row.purchase_order || "";
  const lineIdx =
    meta && meta.poLineIdx != null && meta.poLineIdx !== ""
      ? meta.poLineIdx
      : row.idx != null && row.po_detail
        ? row.idx
        : "";
  if (!po && lineIdx === "") return "";
  if (multiPoOnBill && po) {
    return lineIdx !== "" ? `${po} · L${lineIdx}` : po;
  }
  return lineIdx !== "" ? `L${lineIdx}` : po;
}

/**
 * @param {object|null|undefined} doc
 */
export function billHasMultiplePurchaseOrders(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const pos = new Set(
    items.map((it) => (it && it.purchase_order ? String(it.purchase_order).trim() : "")).filter(Boolean),
  );
  return pos.size > 1;
}

/**
 * Merge shell allocation with linked PO metadata (reload hydration).
 * @param {import("./bill-line-allocation.js").LineAllocation|null|undefined} alloc
 * @param {PoLineMeta|null|undefined} meta
 */
export function mergeAllocationFromPoMeta(alloc, meta) {
  const base = normalizeLineAllocation(alloc);
  if (!meta) return base;
  const sos = base.salesOrders.length
    ? [...base.salesOrders]
    : meta.salesOrder
      ? [meta.salesOrder]
      : [];
  return normalizeLineAllocation({
    customer: base.customer || meta.customer || "",
    customerName: base.customerName || meta.customerName || base.customer || meta.customer || "",
    salesOrders: sos,
    bridgePo: base.bridgePo || meta.poName || "",
  });
}

/**
 * @param {object|null|undefined} doc
 * @param {Record<string|number, import("./bill-line-allocation.js").LineAllocation>} [byRow]
 * @param {Record<string|number, PoLineMeta>} [poMetaByRow]
 */
export function buildBillItemRowModels(doc, byRow = {}, poMetaByRow = {}) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const multiPo = billHasMultiplePurchaseOrders(doc);
  return items.map((it, idx) => {
    const row = it || {};
    const meta = poMetaByRow[idx] ?? poMetaByRow[String(idx)];
    const alloc = mergeAllocationFromPoMeta(lineAllocationForRow(byRow, idx), meta);
    const project = row.project != null ? String(row.project) : "";
    return {
      rowIndex: idx,
      item: row,
      washRole: washRoleForBillItem(row),
      cells: [
        row.item_code || "",
        stripHtml(row.description),
        row.qty != null ? row.qty : "",
        row.rate != null ? row.rate : "",
        row.amount != null ? row.amount : "",
        formatAllocationCustomer(alloc, project),
        formatAllocationSalesOrders(alloc.salesOrders, alloc.bridgePo || row.purchase_order),
        project,
      ],
      lineNo: formatBillLineNumber(idx, row),
      poLine: formatPoLineDisplay(row, meta, multiPo),
      alloc,
      meta: meta || null,
    };
  });
}

/**
 * @param {object|null|undefined} doc
 * @param {Record<string|number, import("./bill-line-allocation.js").LineAllocation>} [byRow]
 * @param {Record<string|number, PoLineMeta>} [poMetaByRow]
 * @returns {Array<Array<string|number>>}
 */
export function readBillItemRowsWithAllocation(doc, byRow = {}, poMetaByRow = {}) {
  return buildBillItemRowModels(doc, byRow, poMetaByRow).map((m) => [
    m.lineNo,
    m.poLine,
    ...m.cells,
  ]);
}

/**
 * @param {ReturnType<typeof buildBillItemRowModels>} models
 * @param {string} sortKey
 * @param {boolean} asc
 */
export function sortBillItemRowModels(models, sortKey, asc = true) {
  const key = sortKey || "lineNo";
  const dir = asc ? 1 : -1;
  const sorted = [...models].sort((a, b) => {
    const cmp = compareBillItemModels(a, b, key);
    return cmp * dir;
  });
  return sorted;
}

/**
 * @param {object} a
 * @param {object} b
 * @param {string} sortKey
 */
function compareBillItemModels(a, b, sortKey) {
  const va = valueForSortKey(a, sortKey);
  const vb = valueForSortKey(b, sortKey);
  if (typeof va === "number" && typeof vb === "number") {
    if (va === vb) return a.rowIndex - b.rowIndex;
    return va - vb;
  }
  const sa = String(va).toLowerCase();
  const sb = String(vb).toLowerCase();
  if (sa === sb) return a.rowIndex - b.rowIndex;
  return sa < sb ? -1 : 1;
}

/**
 * @param {object} model
 * @param {string} sortKey
 */
function valueForSortKey(model, sortKey) {
  switch (sortKey) {
    case "lineNo":
      return Number(model.lineNo) || model.rowIndex + 1;
    case "poLine":
      return model.poLine || "";
    case "item_code":
      return model.cells[0] || "";
    case "description":
      return model.cells[1] || "";
    case "qty":
      return Number(model.cells[2]) || 0;
    case "rate":
      return Number(model.cells[3]) || 0;
    case "amount":
      return Number(model.cells[4]) || 0;
    case "customer":
      return model.cells[5] || "";
    case "salesOrders":
      return model.cells[6] || "";
    case "project":
      return model.cells[7] || "";
    case "washRole":
      return model.washRole || "";
    default:
      return model.rowIndex;
  }
}

/** @type {readonly { label: string, sortKey: string }[]} */
export const BILL_ITEM_SORTABLE_HEADERS = Object.freeze([
  { label: "Line", sortKey: "lineNo" },
  { label: "PO line", sortKey: "poLine" },
  { label: "Item", sortKey: "item_code" },
  { label: "Description", sortKey: "description" },
  { label: "Qty", sortKey: "qty" },
  { label: "Cost", sortKey: "rate" },
  { label: "Amount", sortKey: "amount" },
  { label: "Customer", sortKey: "customer" },
  { label: "Sales order(s)", sortKey: "salesOrders" },
  { label: "Project", sortKey: "project" },
]);

export { DOC_WASH_COLORS };

function stripHtml(html) {
  if (html == null) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}
