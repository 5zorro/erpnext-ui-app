/**
 * Sales Order — A/R Doc skin layout (plan 2026-09-26, stage A1).
 *
 * 5zorro 2026-09-26: the Sales Order is "both a dashboard and a form entry", and will likely end
 * up as involved as the Bill. A1 is the form plus a read-only progress strip (delivered / billed
 * / status); the dashboard half is left for dogfood to shape.
 *
 * "Ship by" is ERPNext's own header `delivery_date`: the Sales Order form script copies it onto
 * every line when it changes (sales_order.js `delivery_date`), so unlike the PO's Date Expected it
 * needs no shell-side stamping.
 */

import { ERP_PAYMENT_TERMS_FIELD, PAYMENT_TERMS_HEADER_LABEL } from "./doc-terms-fields.js";
import { salesMapHelpers } from "./sales-doc-map.js";

export const SALES_ORDER_DOCTYPE = "Sales Order";
export const SALES_ORDER_LAYOUT_KEY = "sales-order";
export const SALES_ORDER_LIST_ROUTE = "/app/sales-order";
export const SALES_ORDER_NEW_ROUTE = "/app/sales-order/new";

/** @type {import("./sales-doc-map.js").SalesHeaderMeta[]} */
export const SALES_ORDER_HEADER_FIELDS = [
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
  { label: "Date", field: "transaction_date", type: "date", column: "right" },
  {
    label: "Ship by",
    field: "delivery_date",
    type: "date",
    column: "right",
    validationHint: "Sets every line's Ship by date (ERPNext's own rule). Edit a line to override.",
  },
  {
    label: "SO No.",
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
export const SALES_ORDER_ITEM_COLS = [
  { label: "Line", field: "__line_no", displayOnly: true, readOnly: true, sortKey: "lineNo" },
  { label: "Item", field: "item_code", linkDoctype: "Item", sortKey: "item_code" },
  { label: "Description", field: "description", sortKey: "description" },
  { label: "Qty", field: "qty", sortKey: "qty" },
  { label: "Rate", field: "rate", sortKey: "rate" },
  { label: "Ship by", field: "delivery_date", type: "date", sortKey: "delivery_date" },
  { label: "Amount", field: null, display: "amount", displayOnly: true, sortKey: "amount" },
  { label: "Delivered", field: null, display: "delivered_qty", displayOnly: true, sortKey: "delivered_qty" },
  { label: "Billed", field: null, display: "billed_amt", displayOnly: true, money: true, sortKey: "billed_amt" },
];

/** The read-only progress strip — the first sliver of the Sales Order's dashboard half. */
export const SALES_ORDER_PROGRESS = [
  { label: "Delivered", field: "per_delivered", percent: true },
  { label: "Billed", field: "per_billed", percent: true },
  { label: "Status", field: "status" },
];

export const SALES_ORDER_ASSUMPTIONS = [
  "Save = saved as a Draft; Submit confirms the order (2 steps).",
  "Pick a customer first — ERPNext fills the price list, tax template, terms and addresses from them.",
  "Ship by in the header sets every line's Ship by; a line can be changed on its own after.",
  "Every line needs a Ship by date before ERPNext will save the order.",
  "Delivered and Billed are ERPNext's running totals — they fill in as deliveries and invoices are made against this order.",
  "Sales tax lines come from the customer's tax template and are shown read-only; change the template in the header.",
];

export const SALES_ORDER_LAYOUT = Object.freeze({
  headerFields: SALES_ORDER_HEADER_FIELDS,
  itemCols: SALES_ORDER_ITEM_COLS,
  progress: SALES_ORDER_PROGRESS,
});

export const salesOrderMap = salesMapHelpers(SALES_ORDER_LAYOUT);
