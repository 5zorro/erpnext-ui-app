/**
 * How one bill's proposed payment date was arrived at, step by step (Packet C5 / B5).
 *
 * 5zorro 2026-09-09: *"It is difficult for me to audit the grouping bumps for each payment's
 * suggested schedule. (was it 2 weekend days, 1 blur day, 1 holiday, and 1 user entry OR was it
 * exactly on time)"* — the sharpest statement of the audit-trail requirement, and a **data-shape
 * requirement before it is a UI one**. ("blur day" is what B3 renamed to *bridge day* when the rule
 * itself was corrected — see `isBridgeDay`.) `effectivePayByDate` used to return a bare string, so the
 * answer was destroyed inside the loop that computed it. `explainPayByDate` now keeps the walk and
 * this module turns it into an ordered, renderable derivation.
 *
 * 🔴 **Everything starts from the stored `due_date`, never from `credit_days` arithmetic.** The
 * schedule row's own due date is the real obligation; the term is a *claim about* it, and they can
 * legally disagree. ERPNext will not tell you when they do — verified 2026-09-09 in
 * `party.py::validate_due_date_with_template`, which throws only when `due_date > template
 * default`. An **earlier** due date passes in complete silence, and holding the `credit_controller`
 * role downgrades even the late case from a throw to a notice. So a bill can carry
 * `NET_30_DAYS (POSTAL) +16` while its stored due date is posting + 10, with nothing anywhere
 * saying the term is not being obeyed. The first step this module emits says which of the two
 * situations you are in, and every step after it computes from the stored date, because that is
 * what the vendor is owed.
 *
 * 🔴 **There is no grace step, and that is not an omission.** Grace folds into the Payment Term's
 * `credit_days` (a Net 30 with +16 tolerance is a 46-day term — see the plan's 2026-09-09
 * reversal), so ERPNext has already applied it before the due date reaches us. A grace row here
 * would double-count it. The same reasoning deleted `applyGraceToDueDate`.
 *
 * 🔴 **There is no transit step either, for a different reason: we do not know the numbers.**
 * `transitDays` / `clearDays` decide when a payment must be released for a cheque to land on time,
 * and 5zorro has not supplied them. A guessed transit row would be a wrong date on screen, not a
 * placeholder. When the numbers arrive this is where the step goes — see `PaymentDateStep.rule`.
 */

import { explainPayByDate } from "./bank-business-days.js";

/**
 * @typedef {import("./outstanding-bills.js").OutstandingBillRow} OutstandingBillRow
 *
 * @typedef {"due-date"|"term-override"|"weekend"|"holiday"|"bridge"|"on-time"} PaymentDateRule
 *
 * @typedef {{
 *   rule: PaymentDateRule,
 *   label: string,        // the rule, in words, for the left column of the popup
 *   date: string,         // ISO — where the date stands AFTER this step
 *   deltaDays: number,    // signed days this step moved it; 0 for the opening row
 *   detail?: string,      // the specific fact that fired the rule
 *   severity?: "warn",    // present only on a step the clerk should actually look at
 * }} PaymentDateStep
 *
 * @typedef {{
 *   dueDate: string,                  // the stored obligation, as ERPNext holds it
 *   payOn: string,                    // the proposed date, identical to effectivePayByDate(dueDate)
 *   totalDeltaDays: number,           // payOn - dueDate, always <= 0 (the calendar only walks back)
 *   onTime: boolean,                  // true when nothing moved the date at all
 *   steps: PaymentDateStep[],         // never empty — see `on-time`
 *   countsByRule: Record<string, number>, // {weekend: 2, holiday: 1} — B1's one-line short form
 *   termImpliedDueDate?: string,      // what the term's own numbers imply, when computable
 *   overridesTerm: boolean,           // stored due date disagrees with the term
 *   obligation: "due-date"|"discount-window", // WHICH deadline `dueDate` holds — the summary and
 *                                     //   the on-time step both have to name it correctly, and a
 *                                     //   discount deadline called a "due date" is a wrong claim
 * }} PaymentDateDerivation
 */

const RULE_LABEL = Object.freeze({
  weekend: "Weekend",
  holiday: "Federal holiday",
  bridge: "Bridge day",
});

/**
 * The ordered derivation of one bill's proposed payment date.
 *
 * Pure and total: a row with an unusable `dueDate` yields a single explanatory step rather than a
 * throw, because this feeds a popup on a dashboard that must render whatever the ERP hands it.
 *
 * @param {Partial<OutstandingBillRow>|null|undefined} bill
 * @param {{ includeBridge?: boolean, billDate?: string, obligation?: "due-date"|"discount-window" }} [opts]
 *   `billDate` is the supplier's own invoice date when the caller has it — ERPNext derives the due
 *   date from `bill_date or posting_date` (`party.py::get_due_date`), so passing it makes the term
 *   comparison exact instead of merely indicative. `obligation: "discount-window"` says the date in
 *   `dueDate` is a discount deadline rather than the due date, which changes the opening step and
 *   suppresses the term comparison.
 * @returns {PaymentDateDerivation}
 */
export function derivePaymentDate(bill, opts = {}) {
  const row = bill || {};
  const dueDate = isoOrNull(row.dueDate);

  if (!dueDate) {
    return {
      dueDate: "",
      payOn: "",
      totalDeltaDays: 0,
      onTime: false,
      overridesTerm: false,
      countsByRule: {},
      obligation: opts.obligation === "discount-window" ? "discount-window" : "due-date",
      steps: [
        {
          rule: "due-date",
          label: "No due date",
          date: "",
          deltaDays: 0,
          severity: "warn",
          detail: "This bill carries no due date, so no payment date can be derived from it.",
        },
      ],
    };
  }

  /** @type {PaymentDateStep[]} */
  const steps = [openingStep(row, dueDate, opts)];
  const overridesTerm = steps[0].rule === "term-override";
  // Suppressed for a discount window: the term implies a *due* date, which is not the deadline
  // being derived here, and attaching it would invite a renderer to compare the two.
  const termImpliedDueDate = opts.obligation === "discount-window" ? "" : termImplied(row, opts);

  const walk = explainPayByDate(dueDate, { includeBridge: opts.includeBridge !== false });

  /** @type {Record<string, number>} */
  const countsByRule = {};
  let cursor = dueDate;
  for (const skip of walk.skipped) {
    const rule = skip.reasons[0]; // fixed order: weekend, holiday, bridge — see explainPayByDate
    cursor = addDaysIso(cursor, -1);
    countsByRule[rule] = (countsByRule[rule] || 0) + 1;
    steps.push({
      rule,
      label: RULE_LABEL[rule] || rule,
      date: cursor,
      deltaDays: -1,
      detail: skipDetail(skip),
    });
  }

  if (!walk.skipped.length) {
    steps.push({
      rule: "on-time",
      label: "Exactly on time",
      date: dueDate,
      deltaDays: 0,
      detail: `The ${deadlineNoun(opts)} is already a payable day — no weekend, holiday or bridge day in the way.`,
    });
  }

  const out = {
    dueDate,
    payOn: walk.date,
    totalDeltaDays: daysBetween(dueDate, walk.date),
    onTime: walk.skipped.length === 0,
    overridesTerm,
    obligation: opts.obligation === "discount-window" ? "discount-window" : "due-date",
    countsByRule,
    steps,
  };
  if (termImpliedDueDate) out.termImpliedDueDate = termImpliedDueDate;
  return out;
}

/**
 * The one-line version, for a chip or a node subtitle (B1's short form).
 *
 * `"2 weekend days + 1 federal holiday — 3 days earlier than the 2026-09-13 due date"`, or
 * `"Payable exactly on the 2026-09-11 due date"`. Never invents a rule that did not fire.
 *
 * @param {PaymentDateDerivation} derivation
 * @returns {string}
 */
export function summarizePaymentDate(derivation) {
  const d = derivation || {};
  if (!d.dueDate) return "No due date recorded.";
  const noun = d.obligation === "discount-window" ? "discount deadline" : "due date";
  if (d.onTime) return `Payable exactly on the ${d.dueDate} ${noun}.`;

  const parts = Object.entries(d.countsByRule || {}).map(
    ([rule, n]) => `${n} ${pluralRule(rule, n)}`,
  );
  const moved = Math.abs(d.totalDeltaDays);
  return `${parts.join(" + ")} — ${moved} day${moved === 1 ? "" : "s"} earlier than the ${d.dueDate} ${noun}.`;
}

/**
 * The first row: the stored due date, and whether the term agrees with it.
 * @param {Partial<OutstandingBillRow>} row @param {string} dueDate @param {object} opts
 * @returns {PaymentDateStep}
 */
function openingStep(row, dueDate, opts) {
  // A discount capture is not paying a due date early — it is meeting a *different* deadline, the
  // one the discount window sets. Comparing that date against the term's credit period would
  // report every 2/10-net-30 bill as overriding its own terms, which is both wrong and exactly the
  // kind of false warning C7 is written to avoid.
  if (opts && opts.obligation === "discount-window") {
    return {
      rule: "due-date",
      label: "Discount window closes",
      date: dueDate,
      deltaDays: 0,
      detail: `${dueDate} is the last day the early-payment discount can be taken.`,
    };
  }

  const implied = termImplied(row, opts);
  const termName = typeof row.paymentTerm === "string" && row.paymentTerm ? row.paymentTerm : "";

  if (implied && implied !== dueDate) {
    const delta = daysBetween(implied, dueDate);
    return {
      rule: "term-override",
      label: "DUE DATE OVERRIDING TERMS",
      date: dueDate,
      deltaDays: 0,
      severity: "warn",
      detail:
        `The stored due date is ${dueDate}, but ${termName ? `\`${termName}\`` : "this bill's term"} implies ` +
        `${implied} (${signed(delta)} days). Everything below is computed from ${dueDate}, because the stored ` +
        `date is what the vendor is owed. ERPNext does not flag this: it only objects when a due date is ` +
        `**later** than the term allows.` +
        (opts && opts.billDate
          ? ""
          : " Computed from the posting date — a supplier invoice date earlier than the posting date would also explain the gap."),
    };
  }

  return {
    rule: "due-date",
    label: "Due date",
    date: dueDate,
    deltaDays: 0,
    detail: implied
      ? `${dueDate}, from ${termName ? `\`${termName}\`` : "the bill's term"} — the term and the stored date agree.`
      : `${dueDate}, as stored on the bill.`,
  };
}

/**
 * What the bill's own term numbers imply the due date should be, or `""` when not computable.
 *
 * Mirrors `party.py::get_due_date_from_template` for a **single** term row, including its
 * `max(due_date, …)` floor, which is what stops a negative credit period from landing before the
 * invoice. Read from the running ERPNext source 2026-09-11 rather than reconstructed from the
 * doctype's Select options — the "Month(s)" branch takes the last day of the shifted month, which
 * is not what its label suggests.
 *
 * @param {Partial<OutstandingBillRow>} row @param {{ billDate?: string }} opts
 * @returns {string}
 */
function termImplied(row, opts) {
  const base = isoOrNull((opts && opts.billDate) || row.postingDate);
  if (!base) return "";
  const basis = typeof row.dueDateBasedOn === "string" ? row.dueDateBasedOn : "";
  if (!basis) return "";

  let candidate = "";
  if (basis === "Day(s) after invoice date") {
    if (!Number.isFinite(row.creditDays)) return "";
    candidate = addDaysIso(base, Number(row.creditDays));
  } else if (basis === "Day(s) after the end of the invoice month") {
    if (!Number.isFinite(row.creditDays)) return "";
    candidate = addDaysIso(lastDayOfMonthIso(base), Number(row.creditDays));
  } else {
    if (!Number.isFinite(row.creditMonths)) return "";
    candidate = lastDayOfMonthIso(addMonthsIso(base, Number(row.creditMonths)));
  }
  return candidate < base ? base : candidate; // ERPNext's max(due_date, …) floor
}

/** The deadline being walked back from, in words. @param {{ obligation?: string }} opts */
function deadlineNoun(opts) {
  return opts && opts.obligation === "discount-window" ? "discount deadline" : "due date";
}

/** @param {{ date: string, reasons: string[] }} skip */
function skipDetail(skip) {
  const named = skip.reasons.map((r) => (RULE_LABEL[r] || r).toLowerCase());
  const extra = named.length > 1 ? ` (also ${named.slice(1).join(", ")})` : "";
  return `${skip.date} is not a payable day${extra}.`;
}

/** @param {string} rule @param {number} n */
function pluralRule(rule, n) {
  const one = { weekend: "weekend day", holiday: "federal holiday", bridge: "bridge day" }[rule] || rule;
  if (n === 1) return one;
  return one === "federal holiday" ? "federal holidays" : `${one}s`;
}

/** @param {unknown} v @returns {string} "" when not an ISO date */
function isoOrNull(v) {
  const s = v == null ? "" : String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** @param {string} iso */
function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** @param {Date} d */
function formatYmd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** @param {string} iso @param {number} n */
function addDaysIso(iso, n) {
  const d = parseIso(iso);
  return formatYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n)));
}

/**
 * Frappe's `add_months` clamps to the end of the shorter month (Jan 31 + 1 month = Feb 28), which
 * `Date.UTC` does not — it rolls over into March. Only the clamped answer matches ERPNext.
 * @param {string} iso @param {number} n
 */
function addMonthsIso(iso, n) {
  const d = parseIso(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return formatYmd(
    new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), lastDay))),
  );
}

/** @param {string} iso */
function lastDayOfMonthIso(iso) {
  const d = parseIso(iso);
  return formatYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** @param {string} fromIso @param {string} toIso */
function daysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 86400000);
}

/** @param {number} n */
function signed(n) {
  return n < 0 ? String(n) : `+${n}`;
}
