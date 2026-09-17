/**
 * Plan a new Payment Term + the single-row Template that wraps it (Packet C6).
 *
 * Pure: it produces the two documents and the copy that goes around them. Nothing here talks to
 * ERPNext — `main.js` inserts what this returns, so the shape is unit-testable and the modal, the
 * Bill Doc skin's picker and any future surface all build the same term.
 *
 * 🔴 **What this creates, and what it cannot touch.** It creates a **term master for future
 * bills**. Terms freeze at submit (`allow_on_submit = 0` on every payment-schedule field), so a
 * button on the payment dashboard cannot repair the bills displayed beneath it, and the obvious
 * naive implementation will look like it does. `affects` is the sentence that says so, and it is
 * part of the return value rather than the modal's markup precisely so it cannot be left off.
 *
 * 🔴 **Create-and-reassign, never rename.** `Payment Term` has `allow_rename: 1`, so renaming one
 * rewrites `payment_schedule.payment_term` on **every historical bill**
 * (`frappe/model/rename_doc.py::update_link_field_values`) — retroactively changing what past bills
 * say their terms were. 5zorro's house rule is to make a new term that is functionally the same
 * with a proper name. This module has no rename path at all; that is the enforcement.
 *
 * 🔴 **Grace folds into `credit_days`.** A Net 30 with +16 tolerance is a **46-day term**, and
 * ERPNext computes the due date from that (the 2026-09-09 reversal). The name still carries the
 * `+16` for humans, so `payment-term-name-health.js` can check the two against each other.
 *
 * The document shape mirrors `ops/sample-data/seed_corpus.py::_ensure_payment_terms`, which is the
 * shape proven to actually drive bills — including the non-obvious half: **the template detail row
 * needs its own explicit copy of every field**, because `get_payment_terms` reads the detail row
 * rather than the master and the detail's `fetch_from` only fires client-side.
 */

import { paymentMethodNameToken, paymentMethodLabel } from "./payment-batch-prefs.js";
import { withGraceSuffix } from "./payment-term-grace.js";

/** The two bases whose credit period is counted in days — the only ones grace can fold into. */
export const DAY_BASED_DUE_DATE_BASES = Object.freeze([
  "Day(s) after invoice date",
  "Day(s) after the end of the invoice month",
]);

/**
 * @typedef {{
 *   contractDays: number,          // the credit period the vendor's contract states
 *   graceDays?: number,            // signed tolerance; folded into credit_days, kept in the name
 *   method?: string,               // a `Mode of Payment` name — becomes both the (TOKEN) and the field
 *   dueDateBasedOn?: string,       // one of DAY_BASED_DUE_DATE_BASES
 *   description?: string,
 *   discountType?: "Percentage"|"Amount",
 *   discount?: number,
 *   discountValidity?: number,
 *   discountValidityBasedOn?: string,
 * }} PaymentTermInput
 *
 * @typedef {{
 *   ok: boolean,
 *   name: string,
 *   contractDays: number,
 *   graceDays: number,
 *   creditDays: number,            // contractDays + graceDays — what ERPNext actually uses
 *   fields: Record<string, unknown>,
 *   term: Record<string, unknown>,     // ready for frappe.client.insert
 *   template: Record<string, unknown>, // ready for frappe.client.insert
 *   errors: string[],              // blocking; `ok` is false when non-empty
 *   warnings: string[],            // advisory; never blocks
 *   affects: string,               // the sentence about which bills this does and does not change
 * }} PaymentTermPlan
 */

/**
 * The name a term with these numbers should carry: `CREDIT_PERIOD (METHOD) ±GRACE`, grace last.
 *
 * Reproduces the A5 fixtures exactly, including their one inconsistency: a discount term writes
 * `2%_10_NET_30` while a plain one writes `NET_30_DAYS`. Matching the corpus matters more than
 * internal tidiness here, because a clerk will be looking at both in the same list.
 *
 * @param {PaymentTermInput} input
 * @returns {string}
 */
export function paymentTermName(input) {
  const i = input || {};
  const days = Math.trunc(Number(i.contractDays));
  const monthEnd = i.dueDateBasedOn === "Day(s) after the end of the invoice month";
  const hasDiscount = Number(i.discount) > 0 && Number.isFinite(Number(i.discountValidity));

  let period;
  if (monthEnd) period = `NET_${days}TH`;
  else if (hasDiscount) period = `NET_${days}`;
  else period = `NET_${days}_DAYS`;

  const prefix =
    hasDiscount && i.discountType !== "Amount"
      ? `${trimNum(Number(i.discount))}%_${Math.trunc(Number(i.discountValidity))}_`
      : "";

  const token = paymentMethodNameToken(i.method);
  const base = `${prefix}${period}${token ? ` (${token})` : ""}`;
  return withGraceSuffix(base, Math.trunc(Number(i.graceDays) || 0));
}

/**
 * The full plan: name, folded credit period, both documents, and the copy.
 *
 * @param {PaymentTermInput} input
 * @param {{ existingNames?: string[] }} [opts] names already in ERPNext, for the collision message
 * @returns {PaymentTermPlan}
 */
export function planPaymentTermCreate(input, opts = {}) {
  const i = input || {};
  const errors = [];
  const warnings = [];

  const contractDays = Math.trunc(Number(i.contractDays));
  const graceDays = Math.trunc(Number(i.graceDays) || 0);
  const dueDateBasedOn = i.dueDateBasedOn || DAY_BASED_DUE_DATE_BASES[0];

  if (!Number.isFinite(Number(i.contractDays))) {
    errors.push("Credit period must be a number of days.");
  } else if (contractDays < 0) {
    errors.push("A credit period cannot be negative — a bill cannot be due before it is issued.");
  }
  if (!Number.isFinite(Number(i.graceDays) || 0)) errors.push("Grace must be a whole number of days.");

  // 🔴 The month basis is refused rather than approximated. ERPNext counts it in `credit_months`
  // (`get_last_day(add_months(…))`), and a tolerance of ±N *days* has no representation in a month
  // count — folding it would change the term by a variable number of days depending on the month.
  if (!DAY_BASED_DUE_DATE_BASES.includes(dueDateBasedOn)) {
    errors.push(
      `"${dueDateBasedOn}" counts the credit period in months, and a grace period measured in days ` +
        `cannot fold into a month count. Use a day-based term, or record the tolerance outside this tool.`,
    );
  }

  const creditDays = contractDays + graceDays;
  if (creditDays < 0) {
    errors.push(
      `A ${contractDays}-day term with ${signed(graceDays)} days of grace is a ${creditDays}-day term, ` +
        `which would fall before the invoice date.`,
    );
  }

  const name = paymentTermName({ ...i, contractDays, graceDays, dueDateBasedOn });
  const existing = (opts.existingNames || []).map((n) => String(n));
  if (existing.includes(name)) {
    // Ahead of `unique: 1`'s traceback, which is what a clerk would otherwise see.
    errors.push(
      `A Payment Term called "${name}" already exists. Terms are named by their own numbers, so a ` +
        `second one with the same period, method and grace would be the same term. Use the existing ` +
        `one, or change a number.`,
    );
  }

  if (!i.method) {
    warnings.push(
      "No method of payment. The term will not say how the vendor is paid, and the dashboard cannot " +
        "price its payments at the right rail — unknown methods are costed as cheques.",
    );
  }
  if (graceDays > 0) {
    warnings.push(
      `Grace of +${graceDays} means paying up to ${graceDays} days after the contractual due date. ` +
        `ERPNext will compute a ${creditDays}-day due date and will not flag it as late.`,
    );
  }
  if (creditDays === 0) warnings.push("A 0-day term is due on receipt.");
  warnings.push(
    "To change this term later, create a new one and reassign. Renaming a Payment Term rewrites it " +
      "on every historical bill that used it, retroactively changing what those bills say their terms were.",
  );

  const fields = {
    invoice_portion: 100,
    mode_of_payment: i.method || null,
    due_date_based_on: dueDateBasedOn,
    credit_days: creditDays,
    credit_months: 0,
    description: i.description || defaultDescription({ ...i, contractDays, graceDays }),
  };
  if (Number(i.discount) > 0) {
    fields.discount_type = i.discountType || "Percentage";
    fields.discount = Number(i.discount);
    fields.discount_validity_based_on = i.discountValidityBasedOn || DAY_BASED_DUE_DATE_BASES[0];
    fields.discount_validity = Math.trunc(Number(i.discountValidity) || 0);
  }

  return {
    ok: errors.length === 0,
    name,
    contractDays,
    graceDays,
    creditDays,
    fields,
    term: { doctype: "Payment Term", payment_term_name: name, ...fields },
    template: {
      doctype: "Payment Terms Template",
      template_name: name,
      // The detail row carries its own explicit copy of every field: `get_payment_terms` reads the
      // TEMPLATE DETAIL when building a bill's payment_schedule, and the detail's `fetch_from` only
      // fires client-side. Setting both is what makes these values reach a server-side bill.
      terms: [{ payment_term: name, ...fields }],
    },
    errors,
    warnings,
    affects: AFFECTS_COPY,
  };
}

/**
 * 🔴 The sentence the modal must not drop. Terms freeze at submit, so this button changes nothing
 * about the bills on screen behind it — and a "create term" button on a dashboard full of bills
 * reads exactly like a fix for them.
 */
export const AFFECTS_COPY =
  "This creates a term for bills entered from now on. It changes nothing on the bills already on " +
  "this dashboard: a submitted bill's terms are frozen, so re-pointing one at a different term " +
  "means cancelling and amending that bill in ERPNext.";

/** @param {PaymentTermInput & { contractDays: number, graceDays: number }} i */
function defaultDescription(i) {
  const monthEnd = i.dueDateBasedOn === "Day(s) after the end of the invoice month";
  const period = monthEnd
    ? `Due ${i.contractDays} days after the end of the invoice month`
    : `Net ${i.contractDays} from invoice date`;
  const disc =
    Number(i.discount) > 0
      ? ` ${i.discountType === "Amount" ? `${i.discount} off` : `${trimNum(Number(i.discount))}%`} if paid within ${Math.trunc(Number(i.discountValidity) || 0)} days.`
      : "";
  const grace = i.graceDays
    ? ` Vendor tolerance ${signed(i.graceDays)} days, folded into the ${i.contractDays + i.graceDays}-day credit period.`
    : "";
  const method = i.method ? ` Paid by ${paymentMethodLabel(i.method, { long: true }).toLowerCase()}.` : "";
  return `${period}.${disc}${method}${grace}`;
}

/** `2` not `2.0`, `2.5` kept — the name must reproduce what a clerk typed. @param {number} n */
function trimNum(n) {
  return String(Number(n));
}

/** @param {number} n */
function signed(n) {
  return n < 0 ? String(n) : `+${n}`;
}
