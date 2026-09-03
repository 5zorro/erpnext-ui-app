/**
 * Purchase Order field map — pure projectors for T4 Doc skin.
 * Museum: bind.js SPECS["Purchase Order"] + docs.js layout "purchase-order".
 */

import { relabelTerm } from "./doc-terms.js";
import {
  ERP_PAYMENT_TERMS_FIELD,
  ERP_FREEFORM_TERMS_FIELD,
  PAYMENT_TERMS_HEADER_LABEL,
  FREEFORM_TERMS_LABEL,
  plainTermsText,
} from "./doc-terms-fields.js";
import { stripHtml, sumBillLineQty, sumBillLineAmount, formatBillLineTotal } from "./bill-map.js";
import { formatAddressDisplay } from "./address-format.js";
import { formatDocLineNumber } from "./doc-item-sort.js";

export const PO_DOCTYPE = "Purchase Order";
export const PO_LAYOUT_KEY = "purchase-order";
export const PO_LIST_ROUTE = "/app/purchase-order";
export const PO_NEW_ROUTE = "/app/purchase-order/new";

/**
 * Header: Doc label → ERPNext field meta. Date Expected is scratch (stamps line schedule_date).
 * Layout mirrors Bill (`column`): Vendor + Billing left; dates + identity right; Ship* addresses row.
 * Identity (OI-121): ERP `name` is read-only; logbook PO# is editable `title`.
 * Address roles (OI-077): Ship from = supplier address (PO has no dispatch_* on many versions);
 * Ship to = shipping; Billing = company billing_address_display when present.
 */
export const PO_HEADER_FIELDS = [
  {
    label: "Vendor",
    field: "supplier",
    type: "text",
    linkDoctype: "Supplier",
    display: "supplier_name|supplier",
    column: "left",
  },
  {
    label: "Billing address",
    field: null,
    type: "textarea",
    readOnly: true,
    multiline: true,
    addressRole: "billing",
    display: "billing_address_display",
    column: "left",
  },
  { label: "Date", field: "transaction_date", type: "date", column: "right" },
  {
    label: "Date Expected",
    field: "__date_expected",
    type: "date",
    scratch: true,
    column: "right",
    validationHint:
      "Stamps every line’s Required By (ERP schedule_date). Applied when you leave this field and again before save.",
  },
  {
    label: "PO No.",
    field: "name",
    type: "text",
    readOnly: true,
    column: "right",
    validationHint: "ERP Purchase Order name (assigned on first save). Not the logbook PO#.",
  },
  {
    label: "PO# (logbook)",
    field: "title",
    type: "text",
    column: "right",
    validationHint: "Your logbook PO# (ERP title). Editable on drafts — distinct from ERP PO No.",
  },
  {
    label: PAYMENT_TERMS_HEADER_LABEL,
    field: ERP_PAYMENT_TERMS_FIELD,
    type: "text",
    linkDoctype: "Payment Terms Template",
    column: "right",
    validationHint: "Payment Terms Template (Net 30, etc.). Not the same as freeform comments below.",
  },
  {
    label: "Ship from",
    field: null,
    type: "textarea",
    readOnly: true,
    multiline: true,
    addressRole: "ship_from",
    display: "address_display",
    column: "addresses",
  },
  {
    label: "Ship to",
    field: null,
    type: "textarea",
    readOnly: true,
    multiline: true,
    addressRole: "ship_to",
    display: "shipping_address_display",
    column: "addresses",
  },
];

/** Drop-ship customer — edited inside Ship to address modal (not header column). */
export const PO_CUSTOMER_DROPSHIP = Object.freeze({
  field: "customer",
  label: "Customer (drop ship)",
  linkDoctype: "Customer",
  hint:
    "Optional. When set, Ship to lists this customer’s delivery addresses for drop-ship POs.",
});

/** PO SPECS: no memo block. */
export const PO_MEMO_FIELD = null;

/**
 * Museum cols + Required By (schedule_date). ERP mandates it per row; Date Expected
 * stamps it, and the column lets clerks see/override (dogfood 2026-07-21).
 * Drop ship is handled via Customer + Ship to address (not a per-line checkbox).
 * Leading Line = Purchase Order line number (ERP idx); headers are sortable (display-only).
 */
export const PO_ITEM_COLS = [
  {
    label: "Line",
    field: "__line_no",
    displayOnly: true,
    readOnly: true,
    sortKey: "lineNo",
  },
  { label: "Item", field: "item_code", linkDoctype: "Item", sortKey: "item_code" },
  { label: "Description", field: "description", sortKey: "description" },
  { label: "Qty", field: "qty", sortKey: "qty" },
  { label: "Rate", field: "rate", sortKey: "rate" },
  { label: "Sales Order", field: "sales_order", linkDoctype: "Sales Order", sortKey: "sales_order" },
  { label: "Required By", field: "schedule_date", type: "date", sortKey: "schedule_date" },
  { label: "Amount", field: null, displayOnly: true, sortKey: "amount" },
  {
    label: "Rec'd to Date",
    field: null,
    displayOnly: true,
    display: "received_qty",
    sortKey: "received_qty",
  },
];

export const PO_ITEM_EDIT_FIELDS = PO_ITEM_COLS.map((c) => c.field).filter(
  (f) => typeof f === "string" && f && !f.startsWith("__"),
);

/**
 * @param {string} field
 * @returns {boolean}
 */
export function isEditablePoItemField(field) {
  return typeof field === "string" && PO_ITEM_EDIT_FIELDS.includes(field);
}

export const PO_ASSUMPTIONS = [
  "Pick a vendor before choosing an address.",
  "Save = saved as a Draft; you then Submit to issue the PO (2 steps).",
  "Drop ship: set Customer (optional) inside Ship to, then pick the receiving address.",
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

/** Header label when line Required By dates diverge (OI-069). */
export const PO_MULTIPLE_DATES_LABEL = "Multiple dates";

/**
 * Distinct non-empty line schedule_date values (sorted).
 * @param {object|null|undefined} doc
 * @returns {string[]}
 */
export function distinctPoScheduleDates(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const set = new Set();
  for (const it of items) {
    const s = it && it.schedule_date != null ? String(it.schedule_date).trim() : "";
    if (s) set.add(s);
  }
  return [...set].sort();
}

/**
 * OI-069 — what the Date Expected header should show.
 * Line divergence wins over stale scratch (clerk edited Required By after a stamp).
 * @param {object|null|undefined} doc
 * @param {{ dateExpected?: string|null }} [scratch]
 * @returns {{ mode: "empty"|"single"|"multiple", value: string, display: string }}
 */
export function poDateExpectedHeaderDisplay(doc, scratch = {}) {
  const dates = distinctPoScheduleDates(doc);
  if (dates.length >= 2) {
    return { mode: "multiple", value: "", display: PO_MULTIPLE_DATES_LABEL };
  }
  if (scratch.dateExpected != null && String(scratch.dateExpected).trim() !== "") {
    const v = String(scratch.dateExpected).trim();
    return { mode: "single", value: v, display: v };
  }
  if (dates.length === 1) {
    return { mode: "single", value: dates[0], display: dates[0] };
  }
  return { mode: "empty", value: "", display: "" };
}

/**
 * Should save / mandatory preflight re-stamp all Required By from Date Expected?
 * Never when lines already diverge (OI-069) — that would wipe per-line edits.
 * Explicit header Date Expected always stamps (see poDateExpectedStampPolicy).
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function shouldStampPoDateExpectedOnSave(doc) {
  return distinctPoScheduleDates(doc).length < 2;
}

/**
 * Stamp policy for Date Expected → Required By.
 * @param {"explicit-header"|"auto-save"|"auto-add-line"} trigger
 * @param {object|null|undefined} doc
 * @returns {{ stamp: boolean, force: boolean }}
 */
export function poDateExpectedStampPolicy(trigger, doc) {
  if (trigger === "explicit-header") {
    return { stamp: true, force: true };
  }
  return { stamp: shouldStampPoDateExpectedOnSave(doc), force: false };
}

/**
 * Default Date Expected: first line schedule_date, else today+7 (museum).
 * When lines diverge and scratch is empty, returns "" (header shows Multiple dates via display helper).
 * @param {object} doc
 * @param {{ dateExpected?: string|null }} [scratch]
 * @returns {string}
 */
export function resolvePoDateExpected(doc, scratch = {}) {
  const shown = poDateExpectedHeaderDisplay(doc, scratch);
  if (shown.mode === "multiple") return "";
  return shown.value;
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
      out[meta.label] = poDateExpectedHeaderDisplay(d, scratch).display;
      continue;
    }
    if (meta.display === "supplier_name|supplier") {
      out[meta.label] = d.supplier_name || d.supplier || "";
      continue;
    }
    if (meta.addressRole && meta.display) {
      const sup = String(d.supplier || "").trim();
      if (!sup) {
        out[meta.label] = "";
        continue;
      }
      out[meta.label] = formatAddressDisplay(d[meta.display]);
      continue;
    }
    if (!meta.field) {
      out[meta.label] = "";
      continue;
    }
    out[meta.label] = d[meta.field] != null ? d[meta.field] : "";
  }
  out[FREEFORM_TERMS_LABEL] = plainTermsText(d[ERP_FREEFORM_TERMS_FIELD]);
  return out;
}

/**
 * @param {object} doc
 * @returns {Array<Array<string|number>>}
 */
export function readPoItemRows(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  return items.map((it, ri) => {
    const row = it || {};
    return [
      formatDocLineNumber(ri, row),
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
