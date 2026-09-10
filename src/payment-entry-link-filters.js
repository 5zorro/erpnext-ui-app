/**
 * Link-picker filters for a Payment Entry's account fields.
 *
 * Mirrors Vanilla's own `frm.set_query` in
 * `erpnext/accounts/doctype/payment_entry/payment_entry.js` (read 2026-09-08), rather than
 * being invented here — the check-doc drawer offered an unfiltered Account list, so a clerk
 * could pick a **group** account and only find out at submit time:
 *
 *   "Account Bank Accounts - HI is a Group Account and group accounts cannot be used in
 *    transactions"
 *
 * Vanilla never offers that row in the first place. The filters below are its `paid_from`
 * query verbatim:
 *
 *   account_type: ["in", ["Bank", "Cash"]]   // for payment_type Pay / Internal Transfer
 *   is_group: 0
 *   company: frm.doc.company
 *
 * `mode_of_payment` deliberately has **no** filters here: Vanilla has no `set_query` for it
 * either (checked in the same file), so filtering it would be us being stricter than the ERP.
 */

/** Account types Vanilla allows when paying out. */
export const PAY_FROM_ACCOUNT_TYPES = Object.freeze(["Bank", "Cash"]);

/**
 * Account types Vanilla allows on the *receiving* side. AR is unbuilt, but the AR mount of this
 * fragment will need this and the shape is already known — `party_account_types[party_type]`,
 * which for a Customer is "Receivable".
 * @type {Readonly<Record<string, string>>}
 */
export const RECEIVE_PARTY_ACCOUNT_TYPES = Object.freeze({
  Customer: "Receivable",
  Supplier: "Payable",
});

/**
 * @param {{ paymentType?: string, partyType?: string, company?: string }} [opts]
 * @returns {Record<string, unknown>} a Frappe filter dict for the Account link field
 */
export function paidFromAccountFilters(opts = {}) {
  const paymentType = opts.paymentType || "Pay";
  const types =
    paymentType === "Receive"
      ? [RECEIVE_PARTY_ACCOUNT_TYPES[opts.partyType || "Supplier"] || "Payable"]
      : [...PAY_FROM_ACCOUNT_TYPES];
  /** @type {Record<string, unknown>} */
  const filters = { account_type: ["in", types], is_group: 0 };
  // Company is only added when we actually know it — an empty string would filter everything out
  // and leave the clerk with an empty picker, which is worse than an unscoped one.
  if (opts.company) filters.company = opts.company;
  return filters;
}

/**
 * Filters for one of the check document's Link inputs, by doctype. Returns `null` when the field
 * should be searched unfiltered (Mode of Payment), so callers can pass the result straight
 * through without special-casing.
 * @param {string} doctype
 * @param {{ paymentType?: string, partyType?: string, company?: string }} [opts]
 * @returns {Record<string, unknown>|null}
 */
export function checkDocLinkFilters(doctype, opts = {}) {
  return String(doctype || "") === "Account" ? paidFromAccountFilters(opts) : null;
}
