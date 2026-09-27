/**
 * Invoice (ERPNext Sales Invoice) — A/R Doc skin layout (plan 2026-09-26, stage A1).
 * The Doc skin says "Invoice" (the Doc skins' word, as "Bill" on the A/P side); Vanilla keeps "Sales Invoice".
 *
 * `posting_date` is the invoice date. ERPNext resets it to today on save unless
 * `set_posting_time` is ticked, so a date the clerk types here ticks it first
 * (profile feature `keepTypedPostingDate`, carried out in erp-form-bridge-page.js setHeader).
 */

import { ERP_PAYMENT_TERMS_FIELD, PAYMENT_TERMS_HEADER_LABEL } from "./doc-terms-fields.js";
import { salesMapHelpers } from "./sales-doc-map.js";

export const SALES_INVOICE_DOCTYPE = "Sales Invoice";
export const SALES_INVOICE_LAYOUT_KEY = "invoice";
export const SALES_INVOICE_LIST_ROUTE = "/app/sales-invoice";
export const SALES_INVOICE_NEW_ROUTE = "/app/sales-invoice/new";

/** @type {import("./sales-doc-map.js").SalesHeaderMeta[]} */
export const SALES_INVOICE_HEADER_FIELDS = [
  {
    label: "Customer",
    field: "customer",
    type: "text",
    linkDoctype: "Customer",
    display: "customer_name|customer",
    column: "left",
  },
  {
    label: "Bill to",
    field: null,
    type: "textarea",
    readOnly: true,
    multiline: true,
    display: "address_display",
    column: "left",
  },
  { label: "Date", field: "posting_date", type: "date", column: "right" },
  {
    label: "Due date",
    field: "due_date",
    type: "date",
    column: "right",
    validationHint: "Filled from the payment terms; type a date to override.",
  },
  {
    label: "Invoice No.",
    field: "name",
    type: "text",
    readOnly: true,
    column: "right",
    validationHint: "Assigned by ERPNext on first save.",
  },
  { label: "Customer PO No.", field: "po_no", type: "text", column: "right" },
  {
    label: PAYMENT_TERMS_HEADER_LABEL,
    field: ERP_PAYMENT_TERMS_FIELD,
    type: "text",
    linkDoctype: "Payment Terms Template",
    column: "right",
  },
  {
    label: "Sales tax",
    field: "taxes_and_charges",
    type: "text",
    linkDoctype: "Sales Taxes and Charges Template",
    column: "right",
    validationHint: "Filled from the customer. The tax lines below follow this template.",
  },
  {
    label: "Ship to",
    field: null,
    type: "textarea",
    readOnly: true,
    multiline: true,
    display: "shipping_address",
    column: "addresses",
  },
];

/** @type {import("./sales-doc-map.js").SalesLineCol[]} */
export const SALES_INVOICE_ITEM_COLS = [
  { label: "Line", field: "__line_no", displayOnly: true, readOnly: true, sortKey: "lineNo" },
  { label: "Item", field: "item_code", linkDoctype: "Item", sortKey: "item_code" },
  { label: "Description", field: "description", sortKey: "description" },
  { label: "Qty", field: "qty", sortKey: "qty" },
  { label: "Rate", field: "rate", sortKey: "rate" },
  { label: "Amount", field: null, display: "amount", displayOnly: true, sortKey: "amount" },
  { label: "Sales Order", field: null, display: "sales_order", displayOnly: true, sortKey: "sales_order" },
];

export const SALES_INVOICE_MEMO_FIELD = "remarks";

export const SALES_INVOICE_ASSUMPTIONS = [
  "Save = saved as a Draft; Submit posts it to the customer's account (2 steps).",
  "Pick a customer first — ERPNext fills the price list, tax template, terms, due date and addresses from them.",
  "A date you type in Date is kept; otherwise ERPNext uses today when it saves.",
  "Invoicing from a Sales Order: open the order in Vanilla and use Create → Sales Invoice; the Sales Order column then shows where each line came from.",
  "Sales tax lines come from the customer's tax template and are shown read-only; change the template in the header.",
];

export const SALES_INVOICE_LAYOUT = Object.freeze({
  headerFields: SALES_INVOICE_HEADER_FIELDS,
  itemCols: SALES_INVOICE_ITEM_COLS,
});

export const salesInvoiceMap = salesMapHelpers(SALES_INVOICE_LAYOUT);
