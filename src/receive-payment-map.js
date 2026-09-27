/**
 * Receive Payment (ERPNext Payment Entry, payment_type "Receive") — A/R Doc skin layout
 * (plan 2026-09-26, stage A1).
 *
 * The lines are the Payment Entry's `references` table: the customer's open invoices. The shell
 * never builds that list itself — picking a customer runs ERPNext's own
 * `get_outstanding_documents` (payment_entry.js), which also allocates the amount received
 * oldest-first the way Vanilla's "Get Outstanding Invoices" button does. The clerk changes the
 * split by typing in the Payment column (`allocated_amount`).
 *
 * This is a layout of the same doctype the Pay Bills dashboard serves, so it is chosen by layout
 * key, never by doctype (doc-skin-registry.js `layoutOnly`).
 */

import { salesMapHelpers } from "./sales-doc-map.js";

export const RECEIVE_PAYMENT_DOCTYPE = "Payment Entry";
export const RECEIVE_PAYMENT_LAYOUT_KEY = "receive-payment";
export const RECEIVE_PAYMENT_LIST_ROUTE = "/app/payment-entry";
export const RECEIVE_PAYMENT_NEW_ROUTE = "/app/payment-entry/new";

/**
 * Set on a blank Payment Entry before anything else. `payment_type` → Receive makes ERPNext's own
 * `set_default_party_type` pick Customer; `party_type` is written too so the order of the two
 * form scripts does not matter.
 */
export const RECEIVE_PAYMENT_NEW_DOC_DEFAULTS = Object.freeze([
  ["payment_type", "Receive"],
  ["party_type", "Customer"],
]);

/** @type {import("./sales-doc-map.js").SalesHeaderMeta[]} */
export const RECEIVE_PAYMENT_HEADER_FIELDS = [
  {
    label: "Customer",
    field: "party",
    type: "text",
    linkDoctype: "Customer",
    display: "party_name|party",
    column: "left",
  },
  {
    label: "Amount received",
    field: "paid_amount",
    type: "number",
    column: "left",
    validationHint: "ERPNext spreads this over the open invoices below, oldest first.",
  },
  {
    label: "Unapplied",
    field: "unallocated_amount",
    type: "number",
    readOnly: true,
    column: "left",
    validationHint: "What is not applied to an invoice stays on the customer's account as a credit.",
  },
  { label: "Date", field: "posting_date", type: "date", column: "right" },
  {
    label: "Method",
    field: "mode_of_payment",
    type: "text",
    linkDoctype: "Mode of Payment",
    column: "right",
    validationHint: "Check, cash, card… ERPNext picks the Deposit to account from it.",
  },
  {
    label: "Check / Ref No.",
    field: "reference_no",
    type: "text",
    column: "right",
    validationHint: "ERPNext requires this (and Ref date) when the money goes to a bank account.",
  },
  { label: "Ref date", field: "reference_date", type: "date", column: "right" },
  {
    label: "Deposit to",
    field: "paid_to",
    type: "text",
    linkDoctype: "Account",
    column: "right",
  },
  {
    label: "Payment No.",
    field: "name",
    type: "text",
    readOnly: true,
    column: "right",
    validationHint: "Assigned by ERPNext on first save.",
  },
];

/** @type {import("./sales-doc-map.js").SalesLineCol[]} */
export const RECEIVE_PAYMENT_ITEM_COLS = [
  { label: "Invoice", field: null, display: "reference_name", displayOnly: true, sortKey: "reference_name" },
  { label: "Due", field: null, display: "due_date", displayOnly: true, type: "date", sortKey: "due_date" },
  { label: "Original amt.", field: null, display: "total_amount", displayOnly: true, money: true, sortKey: "total_amount" },
  { label: "Open balance", field: null, display: "outstanding_amount", displayOnly: true, money: true, sortKey: "outstanding_amount" },
  { label: "Payment", field: "allocated_amount", money: true, sortKey: "allocated_amount" },
];

export const RECEIVE_PAYMENT_MEMO_FIELD = "remarks";

export const RECEIVE_PAYMENT_ASSUMPTIONS = [
  "Save = saved as a Draft; Submit records the payment (2 steps).",
  "Picking a customer lists their open invoices (ERPNext's own Get Outstanding Invoices).",
  "Amount received is applied to the oldest invoices first; type in Payment to split it differently.",
  "Anything not applied stays on the customer's account as a credit (ERPNext's Unallocated Amount).",
  "Method fills Deposit to; a bank account needs Check / Ref No. and Ref date.",
];

export const RECEIVE_PAYMENT_LAYOUT = Object.freeze({
  headerFields: RECEIVE_PAYMENT_HEADER_FIELDS,
  itemCols: RECEIVE_PAYMENT_ITEM_COLS,
  linesTable: "references",
});

/**
 * Σ Payment — what the lines apply. Replaces the item sums, which read `items`.
 * @param {object|null|undefined} doc
 * @returns {number}
 */
export function sumAppliedPayments(doc) {
  const rows = doc && Array.isArray(doc.references) ? doc.references : [];
  return rows.reduce((a, r) => a + (Number(r && r.allocated_amount) || 0), 0);
}

export const receivePaymentMap = {
  ...salesMapHelpers(RECEIVE_PAYMENT_LAYOUT),
  sumQty: () => 0,
  sumAmt: sumAppliedPayments,
};
