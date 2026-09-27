/**
 * Estimate (ERPNext Quotation) — A/R Doc skin layout (plan 2026-09-26, stage A1).
 * Doc skins say "Estimate"; Vanilla keeps "Quotation" (5zorro 2026-09-26, decision 3).
 *
 * ERPNext's Quotation names its party `party_name` (a Dynamic Link on `quotation_to`, which
 * defaults to Customer), not `customer` like every other selling document.
 */

import { ERP_PAYMENT_TERMS_FIELD, PAYMENT_TERMS_HEADER_LABEL } from "./doc-terms-fields.js";
import { salesMapHelpers } from "./sales-doc-map.js";

export const ESTIMATE_DOCTYPE = "Quotation";
export const ESTIMATE_LAYOUT_KEY = "estimate";
export const ESTIMATE_LIST_ROUTE = "/app/quotation";
export const ESTIMATE_NEW_ROUTE = "/app/quotation/new";

/** @type {import("./sales-doc-map.js").SalesHeaderMeta[]} */
export const ESTIMATE_HEADER_FIELDS = [
  {
    label: "Customer",
    field: "party_name",
    type: "text",
    linkDoctype: "Customer",
    display: "customer_name|party_name",
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
    label: "Valid until",
    field: "valid_till",
    type: "date",
    column: "right",
    validationHint: "The date this estimate expires (ERPNext marks it Expired after).",
  },
  {
    label: "Estimate No.",
    field: "name",
    type: "text",
    readOnly: true,
    column: "right",
    validationHint: "Assigned by ERPNext on first save.",
  },
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
];

/** @type {import("./sales-doc-map.js").SalesLineCol[]} */
export const ESTIMATE_ITEM_COLS = [
  { label: "Line", field: "__line_no", displayOnly: true, readOnly: true, sortKey: "lineNo" },
  { label: "Item", field: "item_code", linkDoctype: "Item", sortKey: "item_code" },
  { label: "Description", field: "description", sortKey: "description" },
  { label: "Qty", field: "qty", sortKey: "qty" },
  { label: "Rate", field: "rate", sortKey: "rate" },
  { label: "Amount", field: null, display: "amount", displayOnly: true, sortKey: "amount" },
];

export const ESTIMATE_ASSUMPTIONS = [
  "Save = saved as a Draft; Submit sends it (2 steps). A submitted estimate becomes a Sales Order from Vanilla's Create menu.",
  "Pick a customer first — ERPNext fills the price list, tax template, terms and address from them.",
  "Pick an item and ERPNext fills the description and the selling price (rate stays editable).",
  "Sales tax lines come from the customer's tax template and are shown read-only; change the template in the header.",
];

export const ESTIMATE_LAYOUT = Object.freeze({
  headerFields: ESTIMATE_HEADER_FIELDS,
  itemCols: ESTIMATE_ITEM_COLS,
});

export const estimateMap = salesMapHelpers(ESTIMATE_LAYOUT);
