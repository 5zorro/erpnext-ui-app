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
 * @typedef {{
 *   ok: boolean,
 *   templateName: string,
 *   plans: PaymentTermPlan[],          // one per installment, in order
 *   terms: Record<string, unknown>[],  // ready for frappe.client.insert, in order
 *   template: Record<string, unknown>, // one template, N detail rows
 *   portions: number[],
 *   errors: string[],
 *   warnings: string[],
 *   affects: string,
 * }} PaymentTermsPlan
 */

/**
 * Plan an **installment** template: N Payment Terms and the one Template whose rows split the
 * invoice between them (P4e, 5zorro 2026-09-16: *"the ability to have installment payments.
 * vanilla supports this"*).
 *
 * One installment is the ordinary case and stays byte-identical to `planPaymentTermCreate` — same
 * name for the term and the template, same documents. Only N > 1 changes shape.
 *
 * 🔴 **Three server rules are enforced here rather than met as a traceback.** Verified against
 * `payment_terms_template.py` 2026-09-16:
 * 1. `validate_invoice_portion` — the portions must total exactly 100.00 to two decimals. It is a
 *    `msgprint(raise_exception=1)`, so the clerk would otherwise lose the modal's contents to a
 *    dialog that does not say which row is wrong.
 * 2. `validate_terms` — the tuple `(payment_term, credit_days, credit_months, due_date_based_on)`
 *    must be unique per row. Because a term's name is derived from its own numbers, two rows with
 *    the same period, method and grace collapse to the same name and trip this. Three equal
 *    installments 30 days apart are fine; three at the same offset are not a payment plan.
 * 3. `payment_term` is mandatory per row when the template allocates by terms, which is why every
 *    row here creates a real master rather than inline numbers.
 *
 * @param {{ installments?: PaymentTermInput[] } & PaymentTermInput & { templateName?: string }} input
 * @param {{ existingNames?: string[], existingTemplateNames?: string[] }} [opts]
 * @returns {PaymentTermsPlan}
 */
export function planPaymentTermsCreate(input, opts = {}) {
  const i = input || {};
  const rows = Array.isArray(i.installments) && i.installments.length ? i.installments : [i];
  const single = rows.length === 1;
  const errors = [];
  const warnings = [];

  // Shared header values live on the input, not on every row, so the modal cannot produce a
  // template whose rows disagree about how the vendor is paid.
  const shared = { method: i.method, dueDateBasedOn: i.dueDateBasedOn };
  const plans = rows.map((row, n) => {
    const plan = planPaymentTermCreate({ ...shared, ...row }, { existingNames: opts.existingNames || [] });
    for (const e of plan.errors) errors.push(single ? e : `Payment ${n + 1}: ${e}`);
    for (const w of plan.warnings) if (!warnings.includes(w)) warnings.push(w);
    return plan;
  });

  const portions = rows.map((row, n) => {
    const raw = single && row.portion == null ? 100 : Number(row.portion);
    if (!Number.isFinite(raw) || raw <= 0) {
      errors.push(`Payment ${n + 1}: the share of the invoice must be a number above zero.`);
      return 0;
    }
    return round2(raw);
  });

  const total = round2(portions.reduce((a, b) => a + b, 0));
  if (total !== 100) {
    errors.push(
      `The payments add up to ${total}% of the invoice, not 100%. ERPNext refuses a template whose ` +
        `rows do not total exactly 100.`,
    );
  }

  const seen = new Map();
  plans.forEach((plan, n) => {
    if (seen.has(plan.name)) {
      errors.push(
        `Payments ${seen.get(plan.name) + 1} and ${n + 1} are the same term — ${plan.name}. Two ` +
          `installments on the same day are one payment; change a credit period so they fall apart.`,
      );
    } else seen.set(plan.name, n);
  });

  const templateName = String(i.templateName || "").trim() || defaultTemplateName(plans, i.method, single);
  const existingTemplates = (opts.existingTemplateNames || []).map((n) => String(n));
  if (existingTemplates.includes(templateName)) {
    errors.push(`A Payment Terms Template called "${templateName}" already exists. Give this one a different name.`);
  }

  if (!single) {
    warnings.push(
      `The invoice is split ${portions.map((x) => `${x}%`).join(" / ")} across ${plans.length} payments. ` +
        `Each one gets its own row on the bill's payment schedule, and the dashboard treats them as ` +
        `separate obligations — which is what makes them payable separately.`,
    );
  }

  // Unique term documents only: a repeated name is already an error above, and inserting it twice
  // would turn one readable message into a database traceback.
  const terms = [];
  const emitted = new Set();
  for (const plan of plans) {
    if (emitted.has(plan.name)) continue;
    emitted.add(plan.name);
    terms.push(plan.term);
  }

  return {
    ok: errors.length === 0,
    templateName,
    plans,
    terms,
    template: {
      doctype: "Payment Terms Template",
      template_name: templateName,
      // Same rule as the single-row case: the detail row carries its own explicit copy of every
      // field, because `get_payment_terms` reads the detail and its `fetch_from` is client-side.
      terms: plans.map((plan, n) => ({ payment_term: plan.name, ...plan.fields, invoice_portion: portions[n] })),
    },
    portions,
    errors,
    warnings,
    affects: AFFECTS_COPY,
  };
}

/**
 * A template's own name. One installment keeps the term's name, exactly as before. Several get a
 * name that reads as a plan — `3_PAYMENTS_30_60_90 (ACH)` — because a clerk picks this from a link
 * field and the periods are what tells the plans apart.
 *
 * @param {PaymentTermPlan[]} plans @param {string|undefined} method @param {boolean} single
 */
function defaultTemplateName(plans, method, single) {
  if (single) return plans[0] ? plans[0].name : "";
  const days = plans.map((p) => p.creditDays).join("_");
  const suffix = method ? ` (${method})` : "";
  return `${plans.length}_PAYMENTS_${days}${suffix}`;
}

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100;
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
