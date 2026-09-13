/**
 * Doc Bill “Already paid” (OI-135).
 *
 * Draft: remember intent on the Purchase Invoice via `is_paid` + MoP / cash-bank / paid_amount
 * so Save draft does not forget card-at-entry.
 *
 * Doc Submit: clear `is_paid` before Submit (so Vanilla does not post pay GL on the PI), then
 * create+submit a just-in-time Payment Entry allocated to the Bill (editable pay doc).
 */

import { isAmountDueEntered } from "./bill-map.js";
import { isCreditMemoBill, CREDIT_MEMO_LABEL } from "./credit-memo.js";

/** ERP header fields for on-Bill pay-at-entry memory (draft). */
export const BILL_PAID_ERP_FIELDS = Object.freeze([
  "is_paid",
  "mode_of_payment",
  "cash_bank_account",
  "paid_amount",
]);

export const DEFAULT_CREDIT_CARD_MODE_OF_PAYMENT = "Credit Card";

/**
 * @param {string} field
 */
export function isBillPaidErpField(field) {
  return typeof field === "string" && BILL_PAID_ERP_FIELDS.includes(field);
}

/**
 * Prefer Amount Due when typed; else rounded_total / grand_total.
 * @param {object|null|undefined} doc
 * @param {string|number|null|undefined} amountDueScratch
 * @returns {number}
 */
export function defaultPaidAmountForIsPaid(doc, amountDueScratch) {
  if (isAmountDueEntered(amountDueScratch)) {
    const a = Number(String(amountDueScratch).replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(a) && a > 0) return a;
  }
  const d = doc && typeof doc === "object" ? doc : {};
  const rounded = Number(d.rounded_total);
  if (Number.isFinite(rounded) && rounded !== 0) return rounded;
  const g = Number(d.grand_total);
  return Number.isFinite(g) ? g : 0;
}

/**
 * Field writes when the clerk toggles Already paid.
 * Caller applies via setHeader in order; mode_of_payment may fill cash_bank_account in Vanilla.
 *
 * @param {object|null|undefined} doc
 * @param {boolean} checked
 * @param {{
 *   amountDue?: string|number|null,
 *   preferredModeOfPayment?: string,
 * }} [opts]
 * @returns {Array<{ field: string, value: string|number }>}
 */
export function isPaidToggleWrites(doc, checked, opts = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  /** @type {Array<{ field: string, value: string|number }>} */
  const writes = [];
  if (checked) {
    writes.push({ field: "is_paid", value: 1 });
    const mop = String(d.mode_of_payment || "").trim();
    const preferred = String(opts.preferredModeOfPayment || DEFAULT_CREDIT_CARD_MODE_OF_PAYMENT).trim();
    if (!mop && preferred) {
      writes.push({ field: "mode_of_payment", value: preferred });
    }
    const paid = Number(d.paid_amount);
    if (!Number.isFinite(paid) || paid === 0) {
      writes.push({
        field: "paid_amount",
        value: defaultPaidAmountForIsPaid(d, opts.amountDue),
      });
    }
  } else {
    writes.push({ field: "is_paid", value: 0 });
    writes.push({ field: "paid_amount", value: 0 });
  }
  return writes;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
export function isPaidChecked(v) {
  return v === true || v === 1 || v === "1";
}

/**
 * Snapshot of Already-paid intent before clearing `is_paid` for JIT PE.
 * @typedef {{
 *   modeOfPayment: string,
 *   cashBankAccount: string,
 *   paidAmount: number,
 * }} AlreadyPaidIntent
 */

/**
 * @param {object|null|undefined} doc
 * @returns {AlreadyPaidIntent|null}
 */
export function captureAlreadyPaidIntent(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  if (!isPaidChecked(d.is_paid)) return null;
  const paidAmount = Number(d.paid_amount);
  return {
    modeOfPayment: String(d.mode_of_payment || "").trim(),
    cashBankAccount: String(d.cash_bank_account || "").trim(),
    paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0,
  };
}

/**
 * Clear PI pay-at-entry flags so Submit does not post payment GL on the Bill.
 * Keeps MoP / cash-bank on the PI as display memory only (harmless once is_paid=0);
 * paid_amount zeroed with is_paid.
 * @returns {Array<{ field: string, value: string|number }>}
 */
export function clearIsPaidForJitPeWrites() {
  return [
    { field: "is_paid", value: 0 },
    { field: "paid_amount", value: 0 },
  ];
}

/**
 * Preflight before Submit+JIT PE. Empty list = ok.
 * @param {AlreadyPaidIntent|null|undefined} intent
 * @returns {string[]}
 */
export function listJitPaymentEntryBlockers(intent) {
  if (!intent) return [];
  const blockers = [];
  if (!(intent.paidAmount > 0)) {
    blockers.push("Already paid requires Paid Amount > 0 before Submit.");
  }
  if (!intent.cashBankAccount) {
    blockers.push("Already paid requires Cash / Bank Account before Submit (JIT Payment Entry).");
  }
  return blockers;
}

/**
 * Project Payment Entry Reference rows for the Doc Bill payments table (OI-139).
 * @param {Array<object|null|undefined>|null|undefined} rows
 * @returns {Array<{
 *   paymentEntry: string,
 *   postingDate: string,
 *   modeOfPayment: string,
 *   allocatedAmount: number,
 *   paidAmount: number,
 *   status: string,
 *   docstatus: number,
 * }>}
 */
export function projectBillPaymentRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((r) => {
      const pe = r && typeof r === "object" ? r : {};
      const allocated = Number(pe.allocated_amount != null ? pe.allocated_amount : pe.allocatedAmount);
      const paid = Number(pe.paid_amount != null ? pe.paid_amount : pe.paidAmount);
      const ds = Number(pe.docstatus);
      return {
        paymentEntry: String(pe.payment_entry || pe.paymentEntry || pe.name || "").trim(),
        postingDate: String(pe.posting_date || pe.postingDate || "").trim(),
        modeOfPayment: String(pe.mode_of_payment || pe.modeOfPayment || "").trim(),
        allocatedAmount: Number.isFinite(allocated) ? allocated : 0,
        paidAmount: Number.isFinite(paid) ? paid : 0,
        status: String(pe.status || "").trim(),
        docstatus: Number.isFinite(ds) ? ds : 0,
      };
    })
    .filter((r) => r.paymentEntry);
}

/**
 * Submitted Bill with balance still due — show “Add payment” (OI-139).
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function billCanAddPayment(doc) {
  if (!doc || typeof doc !== "object") return false;
  if (Number(doc.docstatus) !== 1) return false;
  const badge = billDocStatusBadge(doc);
  if (badge && (badge.tone === "paid" || badge.tone === "cancelled")) return false;
  const outstanding = Number(doc.outstanding_amount);
  if (Number.isFinite(outstanding)) return outstanding > 0.005;
  const lower = String(doc.status || "").toLowerCase();
  if (lower === "paid" || lower.includes("debit note")) return false;
  if (
    lower === "unpaid" ||
    lower === "overdue" ||
    lower.includes("partly") ||
    lower.includes("partial")
  ) {
    return true;
  }
  // Submitted, outstanding not hydrated yet — show until proven paid.
  return !!(badge && (badge.tone === "submitted" || badge.tone === "unpaid" || badge.tone === "partial"));
}

/**
 * Banner badge beside “Bill” (Vanilla-style status pill).
 * @param {object|null|undefined} doc
 * @returns {{ label: string, tone: "draft"|"submitted"|"paid"|"partial"|"unpaid"|"cancelled"|"neutral"|"credit-memo" }|null}
 */
export function billDocStatusBadge(doc) {
  if (!doc || typeof doc !== "object") return null;
  const ds = Number(doc.docstatus);
  if (ds === 2) return { label: "Cancelled", tone: "cancelled" };
  if (ds === 0 || !Number.isFinite(ds)) {
    const name = String(doc.name || "").trim();
    if (!name || /^new-/i.test(name)) return { label: "Draft", tone: "draft" };
    return { label: "Draft", tone: "draft" };
  }
  // Credit memo relabel wins over the raw ERP status string (e.g. "Return") — OI-082.
  if (isCreditMemoBill(doc)) return { label: CREDIT_MEMO_LABEL, tone: "credit-memo" };
  let status = String(doc.status || "").trim();
  let lower = status.toLowerCase();
  // docstatus is authoritative — savedocs can return status "Draft" before ERP refreshes it.
  if (lower === "draft") {
    status = "";
    lower = "";
  }
  if (lower === "paid" || lower === "debit note issued") {
    return { label: status || "Paid", tone: "paid" };
  }
  if (lower.includes("partly") || lower.includes("partial")) {
    return { label: status || "Partly Paid", tone: "partial" };
  }
  if (lower === "unpaid" || lower === "overdue") {
    return { label: status || "Unpaid", tone: "unpaid" };
  }
  if (status) return { label: status, tone: "submitted" };
  const outstanding = Number(doc.outstanding_amount);
  if (Number.isFinite(outstanding) && outstanding <= 0.005) {
    return { label: "Paid", tone: "paid" };
  }
  return { label: "Submitted", tone: "submitted" };
}
