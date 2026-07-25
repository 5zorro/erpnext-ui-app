/**
 * Doc skin profiles for T4+ — SSoT for which layoutKey maps to which doctype/shell.
 * Bill keeps its dedicated bill.html; PO + IR share doc-form.html.
 */

import {
  BILL_DOCTYPE,
  BILL_LAYOUT_KEY,
  BILL_LIST_ROUTE,
  BILL_NEW_ROUTE,
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
} from "./receipt-map.js";

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
 *   },
 *   sourceKinds?: ("po"|"pr")[],
 * }} DocSkinProfile
 */

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
    shell: "bill",
    features: {
      amountDue: true,
      taxes: true,
      expensesTab: true,
      sourceModal: true,
      memo: true,
      lineTotals: true,
      dateExpected: false,
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
    },
    sourceKinds: ["po"],
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
 * @param {string|null|undefined} doctypeKey
 * @returns {DocSkinProfile|null}
 */
export function profileByDoctypeKey(doctypeKey) {
  if (!doctypeKey) return null;
  const key = String(doctypeKey).toLowerCase().replace(/_/g, "-");
  for (const p of Object.values(DOC_SKIN_PROFILES)) {
    if (p.doctypeKey === key) return p;
  }
  return null;
}

/** UI payload for doc-form.html (PO / IR). */
export function docFormUiPayload(profileId) {
  const p = DOC_SKIN_PROFILES[profileId];
  if (!p || p.shell !== "doc-form") return null;
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
      findLabel: "Find Purchase Order…",
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
      expenseNote: RECEIPT_EXPENSE_NOTE,
      leavingLabel: "leaving this Item Receipt",
      findLabel: "Find Item Receipt…",
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
