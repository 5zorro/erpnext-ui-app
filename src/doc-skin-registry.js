/**
 * Doc skin profiles for T4+ — SSoT for which layoutKey maps to which doctype/shell.
 * Bill shares doc-form.html with PO + IR (tranche 10).
 */

import {
  BILL_DOCTYPE,
  BILL_LAYOUT_KEY,
  BILL_LIST_ROUTE,
  BILL_NEW_ROUTE,
  BILL_HEADER_FIELDS,
  BILL_ITEM_COLS,
  BILL_ASSUMPTIONS,
  BILL_MEMO_FIELD,
  BILL_MEMO_LABEL,
  BILL_EXPENSE_NOTE,
} from "./bill-map.js";
import {
  PO_DOCTYPE,
  PO_LAYOUT_KEY,
  PO_LIST_ROUTE,
  PO_NEW_ROUTE,
  PO_ASSUMPTIONS,
  PO_HEADER_FIELDS,
  PO_ITEM_COLS,
  PO_MEMO_FIELD,
  readPoHeader,
  readPoItemRows,
  sumPoLineQty,
  sumPoLineAmount,
  formatPoLineTotal,
  isDraftPoDoc,
  isEditablePoItemField,
} from "./po-map.js";
import {
  RECEIPT_DOCTYPE,
  RECEIPT_LAYOUT_KEY,
  RECEIPT_LIST_ROUTE,
  RECEIPT_NEW_ROUTE,
  RECEIPT_ASSUMPTIONS,
  RECEIPT_EXPENSE_NOTE,
  RECEIPT_HEADER_FIELDS,
  RECEIPT_ITEM_COLS,
  RECEIPT_MEMO_FIELD,
  RECEIPT_MEMO_LABEL,
  readReceiptHeader,
  readReceiptItemRows,
  sumReceiptLineQty,
  sumReceiptLineAmount,
  formatReceiptLineTotal,
  isDraftReceiptDoc,
  isEditableReceiptItemField,
} from "./receipt-map.js";
import {
  ESTIMATE_DOCTYPE,
  ESTIMATE_LAYOUT_KEY,
  ESTIMATE_LIST_ROUTE,
  ESTIMATE_NEW_ROUTE,
  ESTIMATE_ASSUMPTIONS,
  ESTIMATE_LAYOUT,
  estimateMap,
} from "./estimate-map.js";
import {
  SALES_ORDER_DOCTYPE,
  SALES_ORDER_LAYOUT_KEY,
  SALES_ORDER_LIST_ROUTE,
  SALES_ORDER_NEW_ROUTE,
  SALES_ORDER_ASSUMPTIONS,
  SALES_ORDER_LAYOUT,
  salesOrderMap,
} from "./sales-order-map.js";
import {
  SALES_INVOICE_DOCTYPE,
  SALES_INVOICE_LAYOUT_KEY,
  SALES_INVOICE_LIST_ROUTE,
  SALES_INVOICE_NEW_ROUTE,
  SALES_INVOICE_ASSUMPTIONS,
  SALES_INVOICE_LAYOUT,
  SALES_INVOICE_MEMO_FIELD,
  salesInvoiceMap,
} from "./sales-invoice-map.js";
import {
  RECEIVE_PAYMENT_DOCTYPE,
  RECEIVE_PAYMENT_LAYOUT_KEY,
  RECEIVE_PAYMENT_LIST_ROUTE,
  RECEIVE_PAYMENT_NEW_ROUTE,
  RECEIVE_PAYMENT_ASSUMPTIONS,
  RECEIVE_PAYMENT_LAYOUT,
  RECEIVE_PAYMENT_MEMO_FIELD,
  RECEIVE_PAYMENT_NEW_DOC_DEFAULTS,
  receivePaymentMap,
} from "./receive-payment-map.js";
import { findButtonLabel } from "./doctype-labels.js";

/**
 * @typedef {{
 *   id: string,
 *   doctype: string,
 *   doctypeKey: string,
 *   layoutKey: string,
 *   listRoute: string,
 *   newRoute: string,
 *   title: string,
 *   shell: "bill"|"doc-form",
 *   features: {
 *     amountDue: boolean,
 *     taxes: boolean,
 *     expensesTab: boolean,
 *     sourceModal: boolean,
 *     memo: boolean,
 *     lineTotals: boolean,
 *     dateExpected: boolean,
 *     addressPicker: boolean,
 *     sourceTerms: boolean,
 *     termsField: boolean,
 *     addLine?: boolean,
 *     taxesReadOnly?: boolean,
 *     progress?: boolean,
 *     keepTypedPostingDate?: boolean,
 *     fetchOutstandingOnParty?: boolean,
 *   },
 *   sourceKinds?: ("po"|"pr")[],
 *   desk?: "ap"|"ar",
 *   partyField?: string,
 *   layoutOnly?: boolean,
 * }} DocSkinProfile
 *
 * `layoutOnly`: the doctype is shared with another skin (Receive Payment and the Pay Bills pages
 * are both Payment Entry), so this profile is reached by its layout key and never answers
 * `profileByDoctypeKey`.
 */

/** Features every A/R layout shares (plan 2026-09-26, stage A1). */
const AR_FEATURES = Object.freeze({
  amountDue: false,
  taxes: true,
  taxesReadOnly: true,
  expensesTab: false,
  sourceModal: false,
  memo: false,
  lineTotals: true,
  dateExpected: false,
  addressPicker: false,
  sourceTerms: false,
  termsField: true,
  addLine: true,
});

/** @type {Record<string, DocSkinProfile>} */
export const DOC_SKIN_PROFILES = {
  bill: {
    id: "bill",
    doctype: BILL_DOCTYPE,
    doctypeKey: "purchase-invoice",
    layoutKey: BILL_LAYOUT_KEY,
    listRoute: BILL_LIST_ROUTE,
    newRoute: BILL_NEW_ROUTE,
    title: "Bill",
    shell: "doc-form",
    features: {
      amountDue: true,
      taxes: true,
      expensesTab: true,
      sourceModal: true,
      memo: true,
      lineTotals: true,
      dateExpected: false,
      addressPicker: true,
      sourceTerms: true,
      termsField: false,
    },
    sourceKinds: ["po", "pr"],
  },
  po: {
    id: "po",
    doctype: PO_DOCTYPE,
    doctypeKey: "purchase-order",
    layoutKey: PO_LAYOUT_KEY,
    listRoute: PO_LIST_ROUTE,
    newRoute: PO_NEW_ROUTE,
    title: "Purchase Order",
    shell: "doc-form",
    features: {
      amountDue: false,
      taxes: false,
      expensesTab: false,
      sourceModal: false,
      memo: false,
      lineTotals: true,
      dateExpected: true,
      addressPicker: true,
      sourceTerms: false,
      termsField: true,
    },
  },
  receipt: {
    id: "receipt",
    doctype: RECEIPT_DOCTYPE,
    doctypeKey: "purchase-receipt",
    layoutKey: RECEIPT_LAYOUT_KEY,
    listRoute: RECEIPT_LIST_ROUTE,
    newRoute: RECEIPT_NEW_ROUTE,
    title: "Item Receipt",
    shell: "doc-form",
    features: {
      amountDue: false,
      taxes: true,
      expensesTab: true,
      sourceModal: true,
      memo: true,
      lineTotals: true,
      dateExpected: false,
      addressPicker: false,
      sourceTerms: true,
      termsField: false,
    },
    sourceKinds: ["po"],
  },
  // --- A/R (plan 2026-09-26, stage A1). Layouts live in the *-map.js files as data. ---
  estimate: {
    id: "estimate",
    doctype: ESTIMATE_DOCTYPE,
    doctypeKey: "quotation",
    layoutKey: ESTIMATE_LAYOUT_KEY,
    listRoute: ESTIMATE_LIST_ROUTE,
    newRoute: ESTIMATE_NEW_ROUTE,
    title: "Estimate",
    shell: "doc-form",
    desk: "ar",
    partyField: "party_name",
    features: { ...AR_FEATURES },
  },
  "sales-order": {
    id: "sales-order",
    doctype: SALES_ORDER_DOCTYPE,
    doctypeKey: "sales-order",
    layoutKey: SALES_ORDER_LAYOUT_KEY,
    listRoute: SALES_ORDER_LIST_ROUTE,
    newRoute: SALES_ORDER_NEW_ROUTE,
    title: "Sales Order",
    shell: "doc-form",
    desk: "ar",
    partyField: "customer",
    features: { ...AR_FEATURES, progress: true },
  },
  invoice: {
    id: "invoice",
    doctype: SALES_INVOICE_DOCTYPE,
    doctypeKey: "sales-invoice",
    layoutKey: SALES_INVOICE_LAYOUT_KEY,
    listRoute: SALES_INVOICE_LIST_ROUTE,
    newRoute: SALES_INVOICE_NEW_ROUTE,
    title: "Invoice",
    shell: "doc-form",
    desk: "ar",
    partyField: "customer",
    features: { ...AR_FEATURES, memo: true, keepTypedPostingDate: true },
  },
  "receive-payment": {
    id: "receive-payment",
    doctype: RECEIVE_PAYMENT_DOCTYPE,
    doctypeKey: "payment-entry",
    layoutKey: RECEIVE_PAYMENT_LAYOUT_KEY,
    listRoute: RECEIVE_PAYMENT_LIST_ROUTE,
    newRoute: RECEIVE_PAYMENT_NEW_ROUTE,
    title: "Receive Payment",
    shell: "doc-form",
    desk: "ar",
    partyField: "party",
    layoutOnly: true,
    features: {
      ...AR_FEATURES,
      taxes: false,
      termsField: false,
      memo: true,
      addLine: false,
      // The item sums (Σ Qty / subtotal) mean nothing on a payment; Unapplied is in the header.
      lineTotals: false,
      fetchOutstandingOnParty: true,
    },
  },
};

/**
 * What the Doc form page and main.js ask of a layout, instead of `profileId === "po"` branches.
 * The A/P entries point at their hand-written readers; the A/R ones are built from the layout.
 */
export const DOC_FORM_MAPS = Object.freeze({
  po: {
    readHeader: readPoHeader,
    readItemRows: readPoItemRows,
    sumQty: sumPoLineQty,
    sumAmt: sumPoLineAmount,
    formatTotal: formatPoLineTotal,
    isDraft: isDraftPoDoc,
    isEditableItemField: isEditablePoItemField,
  },
  receipt: {
    readHeader: readReceiptHeader,
    readItemRows: readReceiptItemRows,
    sumQty: sumReceiptLineQty,
    sumAmt: sumReceiptLineAmount,
    formatTotal: formatReceiptLineTotal,
    isDraft: isDraftReceiptDoc,
    isEditableItemField: isEditableReceiptItemField,
  },
  estimate: estimateMap,
  "sales-order": salesOrderMap,
  invoice: salesInvoiceMap,
  "receive-payment": receivePaymentMap,
});

/**
 * @param {string|null|undefined} profileId
 * @returns {(typeof DOC_FORM_MAPS)[keyof typeof DOC_FORM_MAPS]|null}
 */
export function docFormMapFor(profileId) {
  if (!profileId) return null;
  return /** @type {Record<string, any>} */ (DOC_FORM_MAPS)[String(profileId)] || null;
}

/**
 * The A/R layouts' page payload, keyed by profile id. Same shape the A/P branches build by hand.
 * @type {Record<string, object>}
 */
const AR_UI = {
  estimate: {
    layout: ESTIMATE_LAYOUT,
    assumptions: ESTIMATE_ASSUMPTIONS,
    memoField: null,
    newLabel: "New Estimate",
    hint: "Use the ▾ / search on Customer, Terms, Sales tax and Item (type a few letters).",
  },
  "sales-order": {
    layout: SALES_ORDER_LAYOUT,
    assumptions: SALES_ORDER_ASSUMPTIONS,
    memoField: null,
    newLabel: "New Sales Order",
    hint:
      "Use the ▾ / search on Customer, Terms, Sales tax and Item (type a few letters). " +
      "Ship by in the header sets every line.",
  },
  invoice: {
    layout: SALES_INVOICE_LAYOUT,
    assumptions: SALES_INVOICE_ASSUMPTIONS,
    memoField: SALES_INVOICE_MEMO_FIELD,
    memoLabel: "Memo",
    newLabel: "New Invoice",
    hint: "Use the ▾ / search on Customer, Terms, Sales tax and Item (type a few letters).",
  },
  "receive-payment": {
    layout: RECEIVE_PAYMENT_LAYOUT,
    assumptions: RECEIVE_PAYMENT_ASSUMPTIONS,
    memoField: RECEIVE_PAYMENT_MEMO_FIELD,
    memoLabel: "Memo",
    newLabel: "New Payment",
    newDocDefaults: RECEIVE_PAYMENT_NEW_DOC_DEFAULTS,
    hint:
      "Pick a customer to list their open invoices, then type the amount received. " +
      "Type in Payment to apply it differently.",
  },
};

/**
 * @param {string|null|undefined} layoutKeyOrId
 * @returns {DocSkinProfile|null}
 */
export function profileByLayoutKey(layoutKeyOrId) {
  if (!layoutKeyOrId) return null;
  const key = String(layoutKeyOrId);
  if (DOC_SKIN_PROFILES[key]) return DOC_SKIN_PROFILES[key];
  for (const p of Object.values(DOC_SKIN_PROFILES)) {
    if (p.layoutKey === key || p.doctypeKey === key) return p;
  }
  return null;
}

/**
 * The profile that owns a doctype. `layoutOnly` profiles never answer — they share their doctype
 * with another skin and are reached by layout key (see the DocSkinProfile note).
 * @param {string|null|undefined} doctypeKey
 * @returns {DocSkinProfile|null}
 */
export function profileByDoctypeKey(doctypeKey) {
  if (!doctypeKey) return null;
  const key = String(doctypeKey).toLowerCase().replace(/_/g, "-");
  for (const p of Object.values(DOC_SKIN_PROFILES)) {
    if (p.doctypeKey === key && !p.layoutOnly) return p;
  }
  return null;
}

/** UI payload for doc-form.html (Bill / PO / IR / the A/R layouts). */
export function docFormUiPayload(profileId) {
  const p = DOC_SKIN_PROFILES[profileId];
  if (!p || p.shell !== "doc-form") return null;
  const ar = AR_UI[profileId];
  if (ar) {
    return {
      profileId: p.id,
      title: p.title,
      doctype: p.doctype,
      doctypeKey: p.doctypeKey,
      desk: "ar",
      partyField: p.partyField,
      features: p.features,
      assumptions: ar.assumptions,
      headerFields: ar.layout.headerFields,
      itemCols: ar.layout.itemCols,
      linesTable: ar.layout.linesTable || "items",
      progress: ar.layout.progress || null,
      memoField: ar.memoField,
      memoLabel: ar.memoLabel,
      expenseNote: null,
      newDocDefaults: ar.newDocDefaults || null,
      leavingLabel: `leaving this ${p.title}`,
      findLabel: findButtonLabel(p.doctypeKey),
      newLabel: ar.newLabel,
      sourceLabel: null,
      attachTitle: `Opens Vanilla Desk attach for this ${p.title} (save draft first if new).`,
      addressHint: "Read-only. Addresses come from the customer — change them in Vanilla, then Refresh.",
      hint: ar.hint,
    };
  }
  if (profileId === "bill") {
    return {
      profileId: "bill",
      title: p.title,
      doctype: p.doctype,
      doctypeKey: p.doctypeKey,
      features: p.features,
      assumptions: BILL_ASSUMPTIONS,
      headerFields: BILL_HEADER_FIELDS,
      itemCols: BILL_ITEM_COLS,
      memoField: BILL_MEMO_FIELD,
      memoLabel: BILL_MEMO_LABEL,
      expenseNote: BILL_EXPENSE_NOTE,
      leavingLabel: "leaving this Bill",
      findLabel: findButtonLabel(p.doctypeKey),
      newLabel: "New Bill",
      sourceLabel: "Select PO / source",
      attachTitle: "Opens Vanilla Desk attach for this Bill (save draft first if new).",
      hint:
        "Use the ▾ / search on Vendor, Terms, Item, Project, and Tax Account (type a few letters). " +
        "Amount Due must match Grand total — checksum chip shows the difference.",
    };
  }
  if (profileId === "po") {
    return {
      profileId: "po",
      title: p.title,
      doctype: p.doctype,
      doctypeKey: p.doctypeKey,
      features: p.features,
      assumptions: PO_ASSUMPTIONS,
      headerFields: PO_HEADER_FIELDS,
      itemCols: PO_ITEM_COLS,
      memoField: PO_MEMO_FIELD,
      expenseNote: null,
      leavingLabel: "leaving this Purchase Order",
      findLabel: findButtonLabel(p.doctypeKey),
      newLabel: "New Purchase Order",
      sourceLabel: null,
      attachTitle: "Opens Vanilla Desk attach for this Purchase Order (save draft first if new).",
      hint:
        "Use the ▾ / search on Vendor, Item, and Sales Order (type a few letters). " +
        "Σ Qty helps packing-slip checks. Date Expected stamps each line’s Required By " +
        "(visible in the grid); edit a line to override.",
    };
  }
  if (profileId === "receipt") {
    return {
      profileId: "receipt",
      title: p.title,
      doctype: p.doctype,
      doctypeKey: p.doctypeKey,
      features: p.features,
      assumptions: RECEIPT_ASSUMPTIONS,
      headerFields: RECEIPT_HEADER_FIELDS,
      itemCols: RECEIPT_ITEM_COLS,
      memoField: RECEIPT_MEMO_FIELD,
      memoLabel: RECEIPT_MEMO_LABEL,
      expenseNote: RECEIPT_EXPENSE_NOTE,
      leavingLabel: "leaving this Item Receipt",
      findLabel: findButtonLabel(p.doctypeKey),
      newLabel: "New Item Receipt",
      sourceLabel: "Select PO",
      attachTitle: "Opens Vanilla Desk attach for this Item Receipt (save draft first if new).",
      hint:
        "Use the ▾ / search on Vendor, Item, Project, and Tax Account (type a few letters). " +
        "Select PO pulls open Purchase Order lines into this receipt.",
    };
  }
  return null;
}
