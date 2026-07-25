/**
 * Item Receipt (Purchase Receipt) field map — pure projectors for T4 Doc skin.
 * Museum: bind.js SPECS["Purchase Receipt"] + docs.js layout "item-receipt".
 */

import { relabelTerm } from "./doc-terms.js";
import {
  stripHtml,
  sumBillLineQty,
  sumBillLineAmount,
  formatBillLineTotal,
  formatUsdAmount,
  BILL_EXPENSE_NOTE,
} from "./bill-map.js";

export const RECEIPT_DOCTYPE = "Purchase Receipt";
export const RECEIPT_LAYOUT_KEY = "item-receipt";
export const RECEIPT_LIST_ROUTE = "/app/purchase-receipt";
export const RECEIPT_NEW_ROUTE = "/app/purchase-receipt/new";

/** Header: Doc label → ERPNext field meta. Total Amount is display-only.
 * Packing List / BOL ref only — clerks rarely have a supplier invoice # at receive time
 * (dogfood 2026-07-21; museum had Supplier Invoice Ref — dropped as business mismatch).
 */
export const RECEIPT_HEADER_FIELDS = [
  { label: "Vendor Name", field: "supplier", type: "text", linkDoctype: "Supplier", display: "supplier_name|supplier" },
  { label: "Date", field: "posting_date", type: "date" },
  { label: "Packing List / BOL Ref No.", field: "lr_no", type: "text" },
  {
    label: "Total Amount",
    field: null,
    type: "text",
    readOnly: true,
    display: "grand_total",
  },
];

export const RECEIPT_MEMO_FIELD = "remarks";

/** Same ITEM_COLS pattern as Bill (museum itemColFields). */
export const RECEIPT_ITEM_COLS = [
  { label: "Item", field: "item_code", linkDoctype: "Item" },
  { label: "Description", field: "description" },
  { label: "Qty", field: "qty" },
  { label: "Cost", field: "rate" },
  { label: "Amount", field: null, displayOnly: true },
  { label: "Customer:Job", field: "project", linkDoctype: "Project" },
];

export const RECEIPT_ITEM_EDIT_FIELDS = RECEIPT_ITEM_COLS.map((c) => c.field).filter(Boolean);

/**
 * @param {string} field
 * @returns {boolean}
 */
export function isEditableReceiptItemField(field) {
  return typeof field === "string" && RECEIPT_ITEM_EDIT_FIELDS.includes(field);
}

export const RECEIPT_ASSUMPTIONS = [
  "Save = saved as a Draft; you then Submit to post inventory (2 steps).",
  "Warehouse defaults to Finished Goods.",
  "An Item Receipt records goods-in (stock + valuation); the Bill (Purchase Invoice) records the payable separately.",
];

/** Reuse Bill expenses wording (museum tabNotes Expenses). */
export const RECEIPT_EXPENSE_NOTE = BILL_EXPENSE_NOTE;

export const MUSEUM_RECEIPT_ASSUMPTION_TOPICS = Object.freeze([
  "draft_then_submit",
  "warehouse_finished_goods",
  "receipt_vs_bill",
]);

export function getReceiptAnchor() {
  return {
    conceptId: "item-receipt",
    doctype: RECEIPT_DOCTYPE,
    layoutKey: RECEIPT_LAYOUT_KEY,
    listPath: RECEIPT_LIST_ROUTE,
    newPath: RECEIPT_NEW_ROUTE,
    title: relabelTerm(RECEIPT_DOCTYPE),
  };
}

/**
 * @param {object} doc
 * @returns {Record<string, string|number>}
 */
export function readReceiptHeader(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const out = {};
  for (const meta of RECEIPT_HEADER_FIELDS) {
    if (meta.display === "supplier_name|supplier") {
      out[meta.label] = d.supplier_name || d.supplier || "";
      continue;
    }
    if (meta.display === "grand_total") {
      const n = d.grand_total != null ? d.grand_total : d.total;
      out[meta.label] = n != null && n !== "" ? formatUsdAmount(n) : "";
      continue;
    }
    if (!meta.field) {
      out[meta.label] = "";
      continue;
    }
    out[meta.label] = d[meta.field] != null ? d[meta.field] : "";
  }
  out.Memo = d[RECEIPT_MEMO_FIELD] != null ? d[RECEIPT_MEMO_FIELD] : "";
  return out;
}

/**
 * @param {object} doc
 * @returns {Array<Array<string|number>>}
 */
export function readReceiptItemRows(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  return items.map((it) => {
    const row = it || {};
    return [
      row.item_code || "",
      stripHtml(row.description),
      row.qty != null ? row.qty : "",
      row.rate != null ? row.rate : "",
      row.amount != null ? row.amount : "",
      row.project || "",
    ];
  });
}

/** OI-010 — Σ Qty / Σ Amount on IR lines. */
export const sumReceiptLineQty = sumBillLineQty;
export const sumReceiptLineAmount = sumBillLineAmount;
export const formatReceiptLineTotal = formatBillLineTotal;

/**
 * @returns {string[]}
 */
export function writableReceiptHeaderFields() {
  return RECEIPT_HEADER_FIELDS.filter((m) => m.field && !m.scratch && !m.readOnly).map(
    (m) => m.field,
  );
}

/**
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function isDraftReceiptDoc(doc) {
  if (!doc || typeof doc !== "object") return true;
  const ds = doc.docstatus;
  return ds == null || Number(ds) === 0;
}

/**
 * @returns {string[]}
 */
export function receiptAssumptionTopicsCovered() {
  const text = RECEIPT_ASSUMPTIONS.join(" ").toLowerCase();
  const covered = [];
  if (/draft/.test(text) && /submit/.test(text)) covered.push("draft_then_submit");
  if (/warehouse/.test(text) && /finished goods/.test(text)) covered.push("warehouse_finished_goods");
  if (/item receipt/.test(text) && /bill/.test(text)) covered.push("receipt_vs_bill");
  return covered;
}
