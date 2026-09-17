/**
 * Non-blocking advisories for the Pay Outstanding dashboard (Packet C4).
 *
 * 5zorro 2026-09-09: *"There should probably be a non-blocking warning emoji that makes a balloon
 * on click explaining that non-blocking validation."*
 *
 * 🔴 **Advisory means advisory.** Nothing here gates a button, hides a row, or changes a number.
 * HANDOFF invariant 7: the skin reflects a state, it does not gate on it. A clerk who wants to pay
 * a bill this module has opinions about must be able to, with one click and no argument.
 *
 * 🔴 **Two levels, and the distinction is load-bearing.** `info` explains something that is
 * *correct but looks broken*; `warn` reports something that is *actually off*. The flagship case
 * is `info`, not `warn`:
 *
 * > A vendor's bills paid by different methods will never batch together, because a Payment Entry
 * > carries one header `mode_of_payment`. The engine is right; it just looks like it failed to
 * > find an obvious saving.
 *
 * Answering the question the plan kept re-asking, because it is a recurring one: **no, mode of
 * payment is not fixed per vendor.** It lives on the `payment_schedule` row, so one vendor can have
 * a cheque bill and an ACH bill, and a single bill can carry two installments on different rails.
 *
 * 🔴 **Silence is the default.** Every rule here is written to stay quiet on correct data. A term
 * that states no grace, a bill with no discount, a due date that agrees with its term — none of
 * those produce anything. A chip on every row is a chip on no rows.
 */

import { classifyPaymentTermName, checkTermNameArithmetic } from "./payment-term-name-health.js";
import { derivePaymentDate } from "./payment-date-derivation.js";
import { paymentMethodLabel, describePaymentMethod } from "./payment-batch-prefs.js";
import { formatUsdAmount } from "./money.js";

/**
 * @typedef {import("./outstanding-bills.js").OutstandingBillRow} OutstandingBillRow
 * @typedef {{
 *   id: string,                 // stable per rule, for a test hook and a dedupe key
 *   level: "info"|"warn",
 *   title: string,              // the balloon's first line — the claim, in one clause
 *   body: string,               // why it is true and what, if anything, to do
 * }} Advisory
 */

/**
 * Advisories about one bill (or one installment).
 *
 * @param {Partial<OutstandingBillRow>|null|undefined} bill
 * @param {{ today?: string, prefs?: object }} [ctx] `today` defaults to nothing, which suppresses
 *   the expired-discount rule rather than guessing a clock — a pure module has no business
 *   reading one.
 * @returns {Advisory[]}
 */
export function billAdvisories(bill, ctx = {}) {
  const b = bill || {};
  /** @type {Advisory[]} */
  const out = [];

  const hasTerm = Boolean(b.paymentTerm) || Number.isFinite(b.creditDays);
  if (!hasTerm) {
    out.push({
      id: "no-term",
      level: "info",
      title: "No payment terms recorded on this bill",
      body:
        "The due date is whatever was typed on the bill, with nothing behind it saying why. The " +
        "dashboard can still schedule the payment; it just cannot explain the deadline.",
    });
  }

  if (!b.modeOfPayment) {
    const fee = describePaymentMethod(ctx.prefs || {}, null).fee;
    out.push({
      id: "no-method",
      level: "info",
      title: "No method of payment on this bill",
      body:
        `Priced at the cheque cost (${formatUsdAmount(fee)}) because that is the conservative guess — an ` +
        "unpriced payment would let the engine claim savings that do not exist. The bill itself " +
        "says nothing, so this one is an assumption, not a fact about the vendor.",
    });
  }

  const health = classifyPaymentTermName(b.paymentTerm);
  if (health.state === "malformed") {
    out.push({
      id: "term-name-malformed",
      level: "warn",
      title: "This term's name does not follow the naming convention",
      body:
        `${health.reason}` +
        (health.proposedName ? ` A name that would work: \`${health.proposedName}\`.` : "") +
        " The engine reads the term's `credit_days`, so the payment date is unaffected — but the " +
        "name is what a human reads, and this one says something the term does not do.",
    });
  }

  const arithmetic = checkTermNameArithmetic(b);
  if (arithmetic.state === "disagree") {
    out.push({
      id: "term-arithmetic",
      level: "warn",
      title: "The term's name and its credit period disagree",
      body: `${arithmetic.reason} Fix it by creating a correctly named term and using that from now on — never by renaming this one, which would rewrite every historical bill that used it.`,
    });
  }

  const derivation = derivePaymentDate(b);
  if (derivation.overridesTerm) {
    out.push({
      id: "due-date-overrides-terms",
      level: "warn",
      title: "DUE DATE OVERRIDING TERMS",
      body: derivation.steps[0].detail || "",
    });
  }

  if (ctx.today && b.discountDate && Number(b.discountAmount) > 0 && b.discountDate < ctx.today) {
    out.push({
      id: "discount-expired",
      level: "info",
      title: "The early-payment discount window has closed",
      body:
        `This bill offered ${formatUsdAmount(Number(b.discountAmount))} for payment by ${b.discountDate}, which has ` +
        "passed. The discount is no longer part of the comparison, so the bill is now scheduled on its due date alone.",
    });
  }

  return out;
}

/**
 * Advisories about a vendor's whole bill set — things no single row can see.
 *
 * @param {Array<Partial<OutstandingBillRow>>} bills one vendor's rows
 * @returns {Advisory[]}
 */
export function vendorAdvisories(bills) {
  const list = Array.isArray(bills) ? bills : [];
  /** @type {Advisory[]} */
  const out = [];

  // 🔴 The case the plan calls first and most important: already true, and until now invisible.
  const methods = [...new Set(list.map((b) => (b && b.modeOfPayment ? String(b.modeOfPayment).trim() : "")))];
  if (methods.length > 1) {
    const named = methods.map((m) => paymentMethodLabel(m)).join(", ");
    out.push({
      id: "mixed-methods",
      level: "info",
      title: "This vendor's bills are paid different ways, so they cannot all batch together",
      body:
        `Bills here are paid by ${named}. A Payment Entry carries one mode of payment, so bills on ` +
        "different rails physically cannot merge into one payment however good the arithmetic looks. " +
        "Each method is grouped and priced on its own — that is the engine working, not failing to " +
        "spot a saving. Mode of payment is set per schedule row, not per vendor, so one vendor " +
        "having several is normal.",
    });
  }

  return out;
}

/** The worst level in a set, or `""` when the set is empty. @param {Advisory[]} advisories */
export function advisoryLevel(advisories) {
  const list = Array.isArray(advisories) ? advisories : [];
  if (list.some((a) => a && a.level === "warn")) return "warn";
  return list.length ? "info" : "";
}
