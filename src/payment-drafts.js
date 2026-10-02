/**
 * Draft Payment Entries on the Pay Outstanding board (plan 2026-09-26, DF-01 D).
 *
 * A draft Payment Entry writes no ledger, so the Accounts Payable report — the board's only source —
 * shows the bills it covers as fully unpaid. Left alone, a draft is a payment the board cannot see
 * and a bill it will happily offer to pay twice. This module reshapes the drafts and says which bills
 * each one covers; it makes no ERP calls.
 */

import { formatUsdAmount } from "./money.js";

/**
 * @typedef {{ doctype: string, name: string, allocated: number }} DraftPaymentReference
 * @typedef {{
 *   name: string,
 *   party: string,
 *   postingDate: string,
 *   paidAmount: number,
 *   modeOfPayment: string,
 *   referenceNo: string,
 *   references: DraftPaymentReference[],
 * }} DraftPayment
 */

const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One `frappe.client.get` Payment Entry → the board's shape. Anything that is not a draft paying a
 * supplier is dropped (null): a submitted payment is already in the AP report, and a receipt is the
 * A/R side's business.
 * @param {any} doc
 * @returns {DraftPayment|null}
 */
export function normalizeDraftPayment(doc) {
  if (!doc || typeof doc !== "object") return null;
  if (Number(doc.docstatus) !== 0) return null;
  if (str(doc.payment_type) !== "Pay" || str(doc.party_type) !== "Supplier") return null;
  const name = str(doc.name);
  if (!name) return null;
  const references = (Array.isArray(doc.references) ? doc.references : [])
    .map((r) => ({
      doctype: str(r && r.reference_doctype),
      name: str(r && r.reference_name),
      allocated: num(r && r.allocated_amount),
    }))
    .filter((r) => r.name);
  return {
    name,
    party: str(doc.party),
    postingDate: str(doc.posting_date),
    paidAmount: num(doc.paid_amount),
    modeOfPayment: str(doc.mode_of_payment),
    referenceNo: str(doc.reference_no),
    references,
  };
}

/**
 * @param {unknown[]} docs
 * @returns {DraftPayment[]} oldest first, so the draft most likely forgotten is on top
 */
export function normalizeDraftPayments(docs) {
  return (Array.isArray(docs) ? docs : [])
    .map(normalizeDraftPayment)
    .filter(Boolean)
    .sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.name.localeCompare(b.name));
}

/**
 * Purchase Invoice name → the drafts that cover it. A bill can sit on more than one draft, which is
 * exactly the double-payment the panel exists to surface.
 * @param {DraftPayment[]} drafts
 * @returns {Map<string, string[]>}
 */
export function draftPaymentsByInvoice(drafts) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const d of drafts || []) {
    for (const r of d.references || []) {
      if (r.doctype && r.doctype !== "Purchase Invoice") continue;
      const list = out.get(r.name) || [];
      if (!list.includes(d.name)) list.push(d.name);
      out.set(r.name, list);
    }
  }
  return out;
}

/**
 * The row advisory for a bill one or more drafts cover. Advisory only (invariant 7): the bill can
 * still be paid from the board.
 * @param {string[]} draftNames
 * @returns {{ id: string, level: "warn", title: string, body: string }|null}
 */
export function draftPaymentAdvisory(draftNames) {
  const names = (draftNames || []).filter(Boolean);
  if (!names.length) return null;
  const which = names.join(", ");
  return {
    id: "draft-payment",
    level: "warn",
    title:
      names.length === 1
        ? `A draft payment (${which}) covers this bill`
        : `${names.length} draft payments (${which}) cover this bill`,
    body:
      "A draft is not posted, so this bill still shows as unpaid here. Submit the draft or delete it " +
      "in Draft payments at the top of the board — paying the bill again from here would pay it twice " +
      "once the draft is submitted.",
  };
}

/**
 * Confirm text before a Submit or Delete, naming what it touches.
 * @param {DraftPayment} draft
 * @param {"submit"|"delete"} action
 * @returns {string}
 */
export function draftPaymentConfirmText(draft, action) {
  const d = draft || /** @type {DraftPayment} */ ({});
  const amount = formatUsdAmount(d.paidAmount);
  const bills = (d.references || []).map((r) => r.name).filter(Boolean);
  const covers = bills.length ? `It covers ${bills.join(", ")}.` : "It is not applied to any bill.";
  if (action === "delete") {
    return (
      `Delete draft payment ${d.name} (${d.party}, ${amount})?\n\n${covers}\n\n` +
      "The draft is removed from ERPNext; nothing was posted, so no ledger changes."
    );
  }
  return (
    `Submit payment ${d.name} (${d.party}, ${amount}${d.modeOfPayment ? `, ${d.modeOfPayment}` : ""})?\n\n` +
    `${covers}\n\nSubmitting posts it to the ledger. Undoing it afterwards means cancelling the payment.`
  );
}
