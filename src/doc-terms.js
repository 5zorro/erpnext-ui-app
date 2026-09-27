/**
 * Doc Workflow term swaps (QB-style labels).
 * Subset of museum erpnext/doc-terms.json — SSoT for this public app.
 */

/** @type {Array<[string, string]>} ERPNext label → Doc label (longest-first apply) */
export const DOC_TERM_PAIRS = [
  ["Purchase Invoices", "Bills"],
  ["Purchase Invoice", "Bill"],
  ["Debit Note", "Vendor Credit"],
  ["Purchase Orders", "Purchase Orders"],
  ["Purchase Receipts", "Item Receipts"],
  ["Purchase Receipt", "Item Receipt"],
  ["Supplier Group", "Vendor Type"],
  ["Supplier Name", "Vendor Name"],
  ["Suppliers", "Vendors"],
  ["Supplier", "Vendor"],
  // ERPNext says Quotation; the Doc lens says Estimate (5zorro 2026-09-26). Vanilla keeps its word.
  ["Quotations", "Estimates"],
  ["Quotation", "Estimate"],
  // A/R invoice: the Doc skins say "Invoice", as "Bill" is its A/P twin (plan 2026-09-26, stage A1).
  ["Sales Invoices", "Invoices"],
  ["Sales Invoice", "Invoice"],
];

/**
 * @param {string} erpLabel
 * @param {Array<[string, string]>} [pairs=DOC_TERM_PAIRS]
 */
export function relabelTerm(erpLabel, pairs = DOC_TERM_PAIRS) {
  if (typeof erpLabel !== "string" || !erpLabel) return erpLabel;
  let out = erpLabel;
  for (const [from, to] of pairs) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

/**
 * Reverse lookup: Doc label → first matching ERPNext term (exact on Doc side).
 * @param {string} docLabel
 * @param {Array<[string, string]>} [pairs=DOC_TERM_PAIRS]
 */
export function erpTerm(docLabel, pairs = DOC_TERM_PAIRS) {
  if (typeof docLabel !== "string" || !docLabel) return docLabel;
  for (const [from, to] of pairs) {
    if (to === docLabel) return from;
  }
  return docLabel;
}
