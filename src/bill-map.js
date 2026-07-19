/**
 * Bill (Purchase Invoice) field map — pure projectors for M3 Doc skin.
 * Museum lesson: bind.js SPECS["Purchase Invoice"]; child writes later via set_value only.
 */

import { relabelTerm } from "./doc-terms.js";

export const BILL_DOCTYPE = "Purchase Invoice";
export const BILL_LAYOUT_KEY = "bill";
export const BILL_LIST_ROUTE = "/app/purchase-invoice";
export const BILL_NEW_ROUTE = "/app/purchase-invoice/new";

/** Header: Doc label → ERPNext field meta. */
export const BILL_HEADER_FIELDS = [
  { label: "Vendor Name", field: "supplier", type: "text", linkDoctype: "Supplier", display: "supplier_name|supplier" },
  { label: "Address", field: null, type: "text", readOnly: true, display: "address_display", stripHtml: true },
  { label: "Terms", field: "payment_terms_template", type: "text", linkDoctype: "Payment Terms Template" },
  { label: "Date", field: "posting_date", type: "date" },
  { label: "Ref No. (Supplier Invoice No.)", field: "bill_no", type: "text" },
  {
    label: "Amount Due",
    field: "__amount_due",
    type: "text",
    scratch: true,
    validationHint:
      "Total Amount Due (user) must match the sum of item extended amounts. Green/red checksum beside the field.",
  },
  { label: "Bill Due Date", field: "due_date", type: "date" },
];

export const BILL_MEMO_FIELD = "remarks";

/** Items tab columns; null = display-only Amount from ERPNext. */
export const BILL_ITEM_COLS = [
  { label: "Item", field: "item_code", linkDoctype: "Item" },
  { label: "Description", field: "description" },
  { label: "Qty", field: "qty" },
  { label: "Cost", field: "rate" },
  { label: "Amount", field: null, displayOnly: true },
  { label: "Customer:Job", field: "project", linkDoctype: "Project" },
];

/** ERPNext child fields safe to write via frappe.model.set_value (M3d). */
export const BILL_ITEM_EDIT_FIELDS = BILL_ITEM_COLS.map((c) => c.field).filter(Boolean);

/**
 * @param {string} field
 * @returns {boolean}
 */
export function isEditableBillItemField(field) {
  return typeof field === "string" && BILL_ITEM_EDIT_FIELDS.includes(field);
}
export const BILL_ASSUMPTIONS = [
  "Save = saved as a Draft; you then Submit to post it (2 steps).",
  "Warehouse defaults to Finished Goods.",
  "A Bill made FROM a Purchase Order posts BOTH the Bill and the Item Receipt.",
  "A Bill made FROM an existing Item Receipt posts ONLY the Bill.",
  "Amount Due must match the sum of item extended amounts (visible green/red checksum).",
  "This ERP is items-based — enter expenses as Chart-of-Accounts-mapped items, not direct GL lines here.",
];

export function getBillAnchor() {
  return {
    conceptId: "bill",
    doctype: BILL_DOCTYPE,
    layoutKey: BILL_LAYOUT_KEY,
    listPath: BILL_LIST_ROUTE,
    newPath: BILL_NEW_ROUTE,
    title: relabelTerm(BILL_DOCTYPE),
  };
}

/** Strip HTML to plain text (address_display, descriptions). */
export function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {object} doc ERPNext Purchase Invoice doc
 * @param {{ amountDue?: string|number|null }} [scratch]
 * @returns {Record<string, string|number>}
 */
export function readBillHeader(doc, scratch = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  const out = {};
  for (const meta of BILL_HEADER_FIELDS) {
    if (meta.field === "__amount_due") {
      const due = scratch.amountDue;
      if (due != null && due !== "") out[meta.label] = due;
      else out[meta.label] = d.grand_total != null ? d.grand_total : "";
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
    if (!meta.field) {
      out[meta.label] = "";
      continue;
    }
    out[meta.label] = d[meta.field] != null ? d[meta.field] : "";
  }
  out.Memo = d[BILL_MEMO_FIELD] != null ? d[BILL_MEMO_FIELD] : "";
  return out;
}

/**
 * @param {object} doc
 * @returns {Array<Array<string|number>>}
 */
export function readBillItemRows(doc) {
  const items = (doc && Array.isArray(doc.items) ? doc.items : []);
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

/**
 * Σ Qty — packing-slip / vendor hash check (OI-006 class).
 * @param {object|null|undefined} doc
 * @returns {number}
 */
export function sumBillLineQty(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  return items.reduce((a, it) => a + (Number(it && it.qty) || 0), 0);
}

/**
 * Σ Amount — sum of line extended amounts (amount, else qty×rate) (OI-010 class).
 * @param {object|null|undefined} doc
 * @returns {number}
 */
export function sumBillLineAmount(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  return items.reduce((a, it) => {
    if (!it) return a;
    const amt = Number(it.amount);
    if (Number.isFinite(amt) && amt !== 0) return a + amt;
    return a + (Number(it.qty) || 0) * (Number(it.rate) || 0);
  }, 0);
}

/**
 * Format a footer total for display (2 dp when non-integer).
 * @param {number} n
 * @returns {string}
 */
export function formatBillLineTotal(n) {
  const x = Number(n) || 0;
  if (Number.isInteger(x)) return String(x);
  return x.toFixed(2);
}

/**
 * Amount Due checksum (OI-002 class / 5zorro 2026-07-18).
 * Bills: user may type Total Amount Due; must match sum of item extended amounts (`grand_total`).
 * PO: no user Amount Due field — do not call this with a typed value (UI omits the input).
 *
 * @param {string|number|null|undefined} amountDue user-typed Total Amount Due
 * @param {string|number|null|undefined} grandTotal ERPNext computed total (item amounts)
 * @param {number} [eps=0.005]
 * @returns {"idle"|"match"|"mismatch"} idle = empty field (no enforcement yet); match/mismatch for UI chip
 */
export function amountDueChecksumStatus(amountDue, grandTotal, eps = 0.005) {
  if (amountDue == null || amountDue === "") return "idle";
  return amountDueMatchesGrandTotal(amountDue, grandTotal, eps) ? "match" : "mismatch";
}

/**
 * Save / gate helper: empty due is allowed; typed due must match grand_total.
 * @param {string|number|null|undefined} amountDue
 * @param {string|number|null|undefined} grandTotal
 * @param {number} [eps=0.005]
 */
export function amountDueMatchesGrandTotal(amountDue, grandTotal, eps = 0.005) {
  if (amountDue == null || amountDue === "") return true;
  const a = Number(String(amountDue).replace(/[^0-9.\-]/g, ""));
  const g = Number(grandTotal);
  if (Number.isNaN(a) || Number.isNaN(g)) return false;
  return Math.abs(a - g) <= eps;
}

/** Writable header fields (for Doc form wiring later). */
export function writableBillHeaderFields() {
  return BILL_HEADER_FIELDS.filter((f) => f.field && !f.readOnly);
}
