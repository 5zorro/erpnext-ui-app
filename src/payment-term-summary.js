/**
 * Turn a bill's payment-term structure into something a clerk recognises (Packet A, A2).
 *
 * The complaint this answers: the dashboard can say *"pay 2026-08-07, $7,500"* but cannot say
 * *"because this is Net 30 from a 2026-07-08 bill"*. Five of the fifteen `Payment Schedule` fields
 * were being read; the other ten are what turn an opaque date into an explanation.
 *
 * **Never invent a term that is not in the data.** Every function here returns `undefined` rather
 * than a plausible-sounding default when the row says nothing — a fabricated "Net 30" on a bill
 * whose terms were never recorded is worse than a blank, because it looks authoritative. This is
 * the same rule as `pickTermFields`' absent-stays-absent contract, carried one layer up.
 */

import { parsePaymentTermGrace, stripGraceSuffix } from "./payment-term-grace.js";

/**
 * @typedef {import("./outstanding-bills.js").OutstandingBillRow} OutstandingBillRow
 * @typedef {{
 *   label: string,             // short, for a cell or chip: "2/10 Net 30", "Net 30", "Due on receipt"
 *   graceDays?: number,        // parsed off the term name; absent when the name encodes none
 *   method?: string,           // mode_of_payment — the machine-readable method, not the name's "(ACH)"
 *   source: "name" | "derived",// where `label` came from — see paymentTermLabel
 *   description?: string,      // the term in the vendor's own words, if the row carries one
 * }} PaymentTermSummary
 */

/**
 * The short label for a term.
 *
 * Two sources, in priority order:
 * 1. **The Payment Term's own name**, with its grace suffix stripped — `NET_30_DAYS (POSTAL) -3`
 *    reads as `NET_30_DAYS (POSTAL)`. This is what the clerk picked, so it beats anything derived.
 * 2. **Derived from the numbers**, when the row carries no `payment_term` Link. This is not
 *    hypothetical: a Payment Terms Template row with a NULL `payment_term` still produces a
 *    schedule row with real `credit_days` (the sandbox's `NET 30 DAYS` template is exactly this),
 *    so the period is knowable even when nobody named it.
 *
 * @param {Partial<OutstandingBillRow>|null|undefined} row
 * @returns {{ label: string, source: "name"|"derived" }|undefined} `undefined` when nothing is known
 */
export function paymentTermLabel(row) {
  const r = row || {};

  const named = stripGraceSuffix(r.paymentTerm);
  if (named) return { label: named, source: "name" };

  const derived = deriveLabelFromNumbers(r);
  return derived ? { label: derived, source: "derived" } : undefined;
}

/**
 * `"2/10 Net 30"` / `"Net 30"` / `"Due on receipt"` from the raw numbers, or `""` when the row
 * states no credit period at all.
 *
 * The discount half is rendered in the conventional `d/v` shorthand only for a **Percentage**
 * discount, because that is what "2/10" means. An `Amount` discount has no shorthand, so it is
 * spelled out rather than mangled into a number that reads as a percent.
 *
 * @param {Partial<OutstandingBillRow>} r
 * @returns {string}
 */
function deriveLabelFromNumbers(r) {
  const period = creditPeriodLabel(r);
  if (!period) return "";

  const hasDiscount = Number.isFinite(r.discountValidity) && Number(r.discountAmount) > 0;
  if (!hasDiscount) return period;

  // `discountAmount` is already absolute dollars (outstanding-bills.js resolves Percentage against
  // the bill's grand total), so the percent has to come from the schedule row's own `discount`
  // when the caller kept it. Without it, say the window in words rather than guess a rate.
  return `Discount to day ${r.discountValidity}, then ${period}`;
}

/** @param {Partial<OutstandingBillRow>} r */
function creditPeriodLabel(r) {
  if (Number.isFinite(r.creditMonths) && Number(r.creditMonths) > 0) {
    const m = Number(r.creditMonths);
    return `Net ${m} month${m === 1 ? "" : "s"}`;
  }
  if (!Number.isFinite(r.creditDays)) return "";
  const d = Number(r.creditDays);
  return d === 0 ? "Due on receipt" : `Net ${d}`;
}

/**
 * Everything the surfaces need about one bill's term, in one object.
 *
 * Returns `undefined` when the row carries no term structure whatsoever — the caller renders
 * nothing rather than an empty chip. A row that has *only* a `mode_of_payment` still summarises,
 * because knowing the method without the period is genuinely useful on the check drawer.
 *
 * @param {Partial<OutstandingBillRow>|null|undefined} row
 * @returns {PaymentTermSummary|undefined}
 */
export function summarizePaymentTerm(row) {
  const r = row || {};
  const labelled = paymentTermLabel(r);
  const grace = parsePaymentTermGrace(r.paymentTerm);
  const method = typeof r.modeOfPayment === "string" && r.modeOfPayment ? r.modeOfPayment : undefined;
  const description =
    typeof r.termDescription === "string" && r.termDescription ? r.termDescription : undefined;

  if (!labelled && !method && !description) return undefined;

  /** @type {PaymentTermSummary} */
  const out = {
    label: labelled ? labelled.label : "",
    source: labelled ? labelled.source : "derived",
  };
  if (grace !== undefined) out.graceDays = grace;
  if (method) out.method = method;
  if (description) out.description = description;
  return out;
}

/**
 * The long form — one sentence per fact that actually moved the date, for the rationale popup and
 * the check drawer stub.
 *
 * Deliberately a **list of strings, not a paragraph**: B5 (the audit trail) needs every claim to be
 * separately attributable, and a pre-joined sentence cannot be re-ordered or filtered by a caller
 * that only has room for two lines. Callers join with the separator their surface wants.
 *
 * @param {Partial<OutstandingBillRow>|null|undefined} row
 * @returns {string[]} empty when the row explains nothing
 */
export function explainPaymentTerm(row) {
  const r = row || {};
  const summary = summarizePaymentTerm(r);
  if (!summary) return [];

  const lines = [];

  if (summary.label) {
    lines.push(
      summary.source === "name"
        ? `Term: ${summary.label}`
        : `Term: ${summary.label} (derived — no Payment Term recorded on this bill)`,
    );
  }

  if (r.dueDateBasedOn && Number.isFinite(r.creditDays)) {
    lines.push(`Due date: ${r.creditDays} ${lower(r.dueDateBasedOn)}`);
  } else if (r.dueDateBasedOn) {
    lines.push(`Due date: ${lower(r.dueDateBasedOn)}`);
  }

  if (summary.graceDays !== undefined && summary.graceDays !== 0) {
    lines.push(
      summary.graceDays > 0
        ? `Grace: ${summary.graceDays} days after the due date is still on time for this vendor`
        : `Grace: must land ${Math.abs(summary.graceDays)} days before the due date`,
    );
  }

  if (summary.method) lines.push(`Method: ${summary.method}`);

  if (Number.isFinite(r.paidAmount) && Number(r.paidAmount) > 0) {
    lines.push(`Already paid: ${Number(r.paidAmount)}`);
  }
  if (Number.isFinite(r.discountedAmount) && Number(r.discountedAmount) > 0) {
    lines.push(`Discount already taken: ${Number(r.discountedAmount)}`);
  }

  if (summary.description) lines.push(`Vendor's wording: ${summary.description}`);

  return lines;
}

/** @param {string} s ERPNext's Select options are sentence-case ("Day(s) after invoice date"). */
function lower(s) {
  const str = String(s);
  return str.charAt(0).toLowerCase() + str.slice(1);
}
