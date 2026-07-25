/**
 * Purchase Order field map — pure projectors for T4 Doc skin.
 * Museum: bind.js SPECS["Purchase Order"] + docs.js layout "purchase-order".
 */

import { relabelTerm } from "./doc-terms.js";
import { stripHtml, sumBillLineQty, sumBillLineAmount, formatBillLineTotal } from "./bill-map.js";

export const PO_DOCTYPE = "Purchase Order";
export const PO_LAYOUT_KEY = "purchase-order";
export const PO_LIST_ROUTE = "/app/purchase-order";
export const PO_NEW_ROUTE = "/app/purchase-order/new";

/** Header: Doc label → ERPNext field meta. Date Expected is scratch (stamps line schedule_date). */
export const PO_HEADER_FIELDS = [
  { label: "Vendor", field: "supplier", type: "text", linkDoctype: "Supplier", display: "supplier_name|supplier" },
  { label: "Date", field: "transaction_date", type: "date" },
  {
    label: "Date Expected",
    field: "__date_expected",
    type: "date",
    scratch: true,
    validationHint:
      "Stamps every line’s Required By (ERP schedule_date). Applied when you leave this field and again before save.",
  },
  {
    label: "Vendor Shipping Address",
    field: null,
    type: "text",
    readOnly: true,
    display: "address_display",
    stripHtml: true,
  },
  {
    label: "Ship To Address",
    field: null,
    type: "text",
    readOnly: true,
    display: "shipping_address_display",
    stripHtml: true,
  },
  { label: "P.O. No.", field: "name", type: "text", readOnly: true },
];

/** PO SPECS: no memo block. */
export const PO_MEMO_FIELD = null;

/**
 * Museum cols + Required By (schedule_date). ERP mandates it per row; Date Expected
 * stamps it, and the column lets clerks see/override (dogfood 2026-07-21).
 */
export const PO_ITEM_COLS = [
  { label: "Item", field: "item_code", linkDoctype: "Item" },
  { label: "Description", field: "description" },
  { label: "Qty", field: "qty" },
  { label: "Rate", field: "rate" },
  { label: "Sales Order", field: "sales_order", linkDoctype: "Sales Order" },
  { label: "Required By", field: "schedule_date", type: "date" },
  { label: "Amount", field: null, displayOnly: true },
  { label: "Rec'd to Date", field: null, displayOnly: true, display: "received_qty" },
];

export const PO_ITEM_EDIT_FIELDS = PO_ITEM_COLS.map((c) => c.field).filter(Boolean);

/**
 * @param {string} field
 * @returns {boolean}
 */
export function isEditablePoItemField(field) {
  return typeof field === "string" && PO_ITEM_EDIT_FIELDS.includes(field);
}

export const PO_ASSUMPTIONS = [
  "Save = saved as a Draft; you then Submit to issue the PO (2 steps).",
  "Warehouse defaults to Finished Goods.",
  "Pick a SKU and the item name, UOM, conversion factor, and a suggested rate auto-fill (rate stays editable).",
  "Required By is a planning date (when you need the goods) — it does NOT auto-close the PO when it passes; closing happens on full receipt/bill or via 'Mark as Closed'.",
  "New lines default Required By to Date Expected (or a week out if Date Expected is blank) — edit per line if needed.",
  "Date Expected stamps every line’s Required By when you leave the header field and again before save.",
  "From a submitted PO you can create the Item Receipt and the Bill (which then posts both).",
];

export const MUSEUM_PO_ASSUMPTION_TOPICS = Object.freeze([
  "draft_then_submit",
  "warehouse_finished_goods",
  "sku_autofill",
  "required_by_planning",
  "new_lines_week_out",
  "date_expected_stamps_lines",
  "from_po_create_ir_and_bill",
]);

export function getPoAnchor() {
  return {
    conceptId: "purchase-order",
    doctype: PO_DOCTYPE,
    layoutKey: PO_LAYOUT_KEY,
    listPath: PO_LIST_ROUTE,
    newPath: PO_NEW_ROUTE,
    title: relabelTerm(PO_DOCTYPE),
  };
}

/**
 * Default Date Expected: first line schedule_date, else today+7 (museum).
 * @param {object} doc
 * @param {{ dateExpected?: string|null }} [scratch]
 * @returns {string}
 */
export function resolvePoDateExpected(doc, scratch = {}) {
  if (scratch.dateExpected != null && String(scratch.dateExpected).trim() !== "") {
    return String(scratch.dateExpected).trim();
  }
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  for (const it of items) {
    if (it && it.schedule_date) return String(it.schedule_date);
  }
  return "";
}

/**
 * @param {object} doc
 * @param {{ dateExpected?: string|null }} [scratch]
 * @returns {Record<string, string|number>}
 */
export function readPoHeader(doc, scratch = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  const out = {};
  for (const meta of PO_HEADER_FIELDS) {
    if (meta.field === "__date_expected") {
      out[meta.label] = resolvePoDateExpected(d, scratch);
      continue;
    }
    if (meta.display === "supplier_name|supplier") {
      out[meta.label] = d.supplier_name || d.supplier || "";
      continue;
    }
    if (meta.display === "address_display") {
      out[meta.label] = stripHtml(d.address_display);
      continue;
    }
    if (meta.display === "shipping_address_display") {
      out[meta.label] = stripHtml(d.shipping_address_display);
      continue;
    }
    if (!meta.field) {
      out[meta.label] = "";
      continue;
    }
    out[meta.label] = d[meta.field] != null ? d[meta.field] : "";
  }
  return out;
}

/**
 * @param {object} doc
 * @returns {Array<Array<string|number>>}
 */
export function readPoItemRows(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  return items.map((it) => {
    const row = it || {};
    return [
      row.item_code || "",
      stripHtml(row.description),
      row.qty != null ? row.qty : "",
      row.rate != null ? row.rate : "",
      row.sales_order || "",
      row.schedule_date || "",
      row.amount != null ? row.amount : "",
      row.received_qty != null ? row.received_qty : "",
    ];
  });
}

/**
 * Museum default: today + 7 days (YYYY-MM-DD).
 * @param {Date} [today]
 * @returns {string}
 */
export function defaultPoScheduleDate(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Date to stamp onto line Required By: header Date Expected, else week-out default.
 * @param {string|null|undefined} dateExpected
 * @param {Date} [today]
 * @returns {string}
 */
export function resolvePoStampDate(dateExpected, today = new Date()) {
  const v = dateExpected != null ? String(dateExpected).trim() : "";
  return v || defaultPoScheduleDate(today);
}

/**
 * Row indexes whose schedule_date should be updated to `stampIso`.
 * Stamps every row that differs (museum: Date Expected overwrites line Required By).
 *
 * @param {object|null|undefined} doc
 * @param {string} stampIso YYYY-MM-DD
 * @returns {number[]}
 */
export function poRowsNeedingScheduleStamp(doc, stampIso) {
  const expected = stampIso != null ? String(stampIso).trim() : "";
  if (!expected) return [];
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const prev = items[i] && items[i].schedule_date != null ? String(items[i].schedule_date).trim() : "";
    if (prev !== expected) out.push(i);
  }
  return out;
}

/** OI-006 — Σ Qty on PO lines. */
export const sumPoLineQty = sumBillLineQty;
/** OI-010 class — Σ Amount on PO lines. */
export const sumPoLineAmount = sumBillLineAmount;
export const formatPoLineTotal = formatBillLineTotal;

/**
 * Writable ERP header fields (excludes scratch + read-only).
 * @returns {string[]}
 */
export function writablePoHeaderFields() {
  return PO_HEADER_FIELDS.filter((m) => m.field && !m.scratch && !m.readOnly).map((m) => m.field);
}

/**
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function isDraftPoDoc(doc) {
  if (!doc || typeof doc !== "object") return true;
  const ds = doc.docstatus;
  return ds == null || Number(ds) === 0;
}

/**
 * Topics covered by PO_ASSUMPTIONS (for museum parity tests).
 * @returns {string[]}
 */
export function poAssumptionTopicsCovered() {
  const text = PO_ASSUMPTIONS.join(" ").toLowerCase();
  const covered = [];
  if (/draft/.test(text) && /submit/.test(text)) covered.push("draft_then_submit");
  if (/warehouse/.test(text) && /finished goods/.test(text)) covered.push("warehouse_finished_goods");
  if (/sku/.test(text) || /auto-fill/.test(text)) covered.push("sku_autofill");
  if (/required by/.test(text) && /planning/.test(text)) covered.push("required_by_planning");
  if (/week/.test(text)) covered.push("new_lines_week_out");
  if (/date expected/.test(text) && /stamp/.test(text)) covered.push("date_expected_stamps_lines");
  if (/item receipt/.test(text) && /bill/.test(text)) covered.push("from_po_create_ir_and_bill");
  return covered;
}
