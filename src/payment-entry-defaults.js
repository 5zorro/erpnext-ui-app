/**
 * What the check drawer fills in before the clerk types anything (Packet C9): Mode of Payment,
 * Pay from account, check number / reference, and memo. Pure — takes facts already read from
 * ERPNext and returns, for each field, a value plus the sentence saying where it came from, so the
 * drawer can show its working rather than silently guessing.
 *
 * 5zorro 2026-09-14: *"the mode of payment and the pay from account did not autofill. Can they
 * autofill with the last account used and the last payment mode used? Maybe there is a way to
 * identify if the existing payment methods match the 'method per the terms' and autofill from
 * that?"* — and on numbering: *"normally there is a 'sequentially numbered document' control on
 * checks that aid in reconciliation. If im queuing up payments and submitting, I had better have
 * some check numbers or ach references or something that i don't have to manually enter."*
 *
 * Checked against ERPNext before any of this was decided (2026-09-14):
 *
 * - Vanilla fills Account Paid From from the Mode of Payment's per-company `default_account`
 *   (`payment_entry.js` → `get_payment_mode_account`). That is the first choice for the account
 *   here too; "last used" only fills the gap when no default is configured — which is every
 *   electronic method in the sandbox today.
 * - ERPNext keeps **no** check-number sequence: nothing on Bank Account, Cheque Print Template or
 *   Payment Entry. `reference_no` ("Cheque/Reference No") is free text and not unique. So the next
 *   number is derived from the reference numbers ERPNext already stores — no new field, Clean Core.
 * - Supplier carries `customer_numbers` (Customer Number At Supplier: `company`, `customer_number`)
 *   — our account number at that vendor, which is what the memo should say.
 */

import { paymentMethodNameToken } from "./payment-batch-prefs.js";

/**
 * The memo's length ceiling. The same text is printed on a cheque's memo line and sent as ACH
 * "Company Discretionary Data" (5zorro 2026-09-14), and the NACHA batch header gives that field 20
 * characters — the tighter of the two, so one memo fits both rails.
 */
export const MEMO_MAX_CHARS = 20;

/**
 * @typedef {{ name: string, party?: string, mode_of_payment?: string, paid_from?: string,
 *   reference_no?: string, docstatus?: number, creation?: string }} PastPayment
 * @typedef {{ name: string, type?: string, enabled?: number|boolean,
 *   accounts?: Array<{ company?: string, default_account?: string }> }} ModeRecord
 * @typedef {{
 *   company?: string,
 *   companyName?: string,
 *   abbr?: string,
 *   modes?: ModeRecord[],        // absent when the read failed: then nothing is filtered out
 *   history?: PastPayment[],     // this company's Pay entries, any docstatus
 *   customerNumbers?: Array<{ company?: string, customer_number?: string }>,
 * }} PaymentDefaultsFacts
 * @typedef {{ value: string, source: string, note: string }} ProposedField
 */

/** @param {unknown} v */
function text(v) {
  return v == null ? "" : String(v).trim();
}

/** @param {PastPayment[]|undefined} history newest first */
function newestFirst(history) {
  return (Array.isArray(history) ? history : [])
    .slice()
    .sort((a, b) => text(b && b.creation).localeCompare(text(a && a.creation)));
}

/**
 * A cheque rail, as opposed to an electronic one. Decides how the reference is numbered: cheques
 * count up per bank account (each account has its own cheque stock), electronic payments per
 * method. Matches `Check`, `Cheque` and `USPS_Check`.
 * @param {unknown} mode
 */
export function isChequeMode(mode) {
  return /check|cheque/i.test(text(mode));
}

/**
 * @param {PaymentDefaultsFacts} facts
 * @returns {(mode: string) => boolean}
 */
function enabledModeTest(facts) {
  if (!Array.isArray(facts.modes) || !facts.modes.length) return () => true;
  const enabled = new Set(facts.modes.filter((m) => m && m.enabled !== 0 && m.enabled !== false).map((m) => m.name));
  return (mode) => enabled.has(mode);
}

/**
 * The payment terms first — they are what the bill itself says — then the last method used for
 * this vendor, then the last method used at all.
 *
 * @param {PaymentDefaultsFacts} facts
 * @param {{ supplier?: string, termsMethod?: string }} ctx
 * @returns {ProposedField}
 */
export function proposeModeOfPayment(facts, ctx = {}) {
  const f = facts || {};
  const usable = enabledModeTest(f);
  const terms = text(ctx.termsMethod);
  if (terms && usable(terms)) {
    return { value: terms, source: "terms", note: `${terms} — the method on this bill's payment terms` };
  }
  const unusable = terms ? `; the terms say ${terms}, which is not an enabled Mode of Payment` : "";
  const past = newestFirst(f.history).filter((p) => p && text(p.mode_of_payment) && usable(text(p.mode_of_payment)));
  const supplier = text(ctx.supplier);
  const forSupplier = supplier ? past.find((p) => text(p.party) === supplier) : null;
  if (forSupplier) {
    const value = text(forSupplier.mode_of_payment);
    return { value, source: "last-supplier", note: `${value} — last used for ${supplier} (${forSupplier.name})${unusable}` };
  }
  if (past[0]) {
    const value = text(past[0].mode_of_payment);
    return { value, source: "last-any", note: `${value} — the last method used (${past[0].name})${unusable}` };
  }
  return { value: "", source: "", note: terms ? `The terms say ${terms}, which is not an enabled Mode of Payment` : "" };
}

/**
 * The Mode of Payment's own default account for this company — exactly what Vanilla does — then
 * the last account used with that method, then the last account used at all.
 *
 * @param {PaymentDefaultsFacts} facts
 * @param {{ mode?: string }} ctx
 * @returns {ProposedField}
 */
export function proposePaidFrom(facts, ctx = {}) {
  const f = facts || {};
  const mode = text(ctx.mode);
  const company = text(f.company);
  const record = mode && Array.isArray(f.modes) ? f.modes.find((m) => m && m.name === mode) : null;
  const configured = record && Array.isArray(record.accounts)
    ? record.accounts.find((a) => a && text(a.company) === company && text(a.default_account))
    : null;
  if (configured) {
    const value = text(configured.default_account);
    return { value, source: "mode-default", note: `${value} — ${mode}'s default account in ERPNext` };
  }
  const past = newestFirst(f.history).filter((p) => p && text(p.paid_from));
  const sameMode = mode ? past.find((p) => text(p.mode_of_payment) === mode) : null;
  if (sameMode) {
    const value = text(sameMode.paid_from);
    return { value, source: "last-mode", note: `${value} — last used with ${mode} (${sameMode.name})` };
  }
  if (past[0]) {
    const value = text(past[0].paid_from);
    return { value, source: "last-any", note: `${value} — the last account paid from (${past[0].name})` };
  }
  return { value: "", source: "", note: "" };
}

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The references that count as "used" for this rail. Every docstatus counts — a cancelled cheque
 * is a voided cheque, and its number was consumed on paper; handing it out again is exactly the
 * break in sequence the control exists to catch.
 *
 * @param {PaymentDefaultsFacts} facts
 * @param {{ mode: string, paidFrom?: string }} ctx
 * @returns {{ pattern: RegExp, rows: PastPayment[] }}
 */
function sequenceRows(facts, ctx) {
  const history = Array.isArray(facts.history) ? facts.history : [];
  if (isChequeMode(ctx.mode)) {
    const account = text(ctx.paidFrom);
    return {
      pattern: /^(\d+)$/,
      rows: history.filter((p) => p && text(p.paid_from) === account && isChequeMode(p.mode_of_payment)),
    };
  }
  const token = paymentMethodNameToken(ctx.mode) || "REF";
  return {
    pattern: new RegExp(`^${escapeRegExp(token)}-(\\d+)$`),
    rows: history.filter((p) => p && text(p.mode_of_payment) === text(ctx.mode)),
  };
}

/**
 * The next check number or electronic reference, derived from what ERPNext already stores.
 *
 * - **Cheque:** the highest all-digit reference on this bank account, plus one, keeping its zero
 *   padding. With no earlier number the field stays empty and says so — nothing here can know
 *   where a cheque stock starts, and inventing a number would put a wrong one on paper.
 * - **Electronic:** `ACH-000124`-style, per method, counting up from the highest one issued. ERPNext
 *   has no trace number to offer (the bank assigns that when the file is sent), so this is the
 *   internal sequence the clerk reconciles against.
 *
 * @param {PaymentDefaultsFacts} facts
 * @param {{ mode?: string, paidFrom?: string }} ctx
 * @returns {ProposedField}
 */
export function proposeReferenceNo(facts, ctx = {}) {
  const f = facts || {};
  const mode = text(ctx.mode);
  if (!mode) return { value: "", source: "", note: "" };
  const cheque = isChequeMode(mode);
  if (cheque && !text(ctx.paidFrom)) return { value: "", source: "", note: "" };

  const { pattern, rows } = sequenceRows(f, { mode, paidFrom: ctx.paidFrom });
  let best = null;
  for (const row of rows) {
    const m = pattern.exec(text(row.reference_no));
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isSafeInteger(n)) continue;
    if (!best || n > best.n) best = { n, digits: m[1], row };
  }

  if (cheque) {
    const account = text(ctx.paidFrom);
    if (!best) {
      return {
        value: "",
        source: "needs-first",
        note: `No earlier check number on ${account} in ERPNext — type the first one, and later checks count up from it`,
      };
    }
    const value = String(best.n + 1).padStart(best.digits.length, "0");
    return {
      value,
      source: "next-cheque",
      note: `${value} — the next check number on ${account}, after ${best.digits} (${best.row.name})`,
    };
  }

  const token = paymentMethodNameToken(mode) || "REF";
  if (!best) {
    const value = `${token}-000001`;
    return { value, source: "first-electronic", note: `${value} — the first ${mode} reference in ERPNext` };
  }
  const value = `${token}-${String(best.n + 1).padStart(Math.max(6, best.digits.length), "0")}`;
  return {
    value,
    source: "next-electronic",
    note: `${value} — the next ${mode} reference, after ${text(best.row.reference_no)} (${best.row.name})`,
  };
}

/**
 * The earlier payment already carrying this reference on the same rail, if any. ERPNext will accept
 * a duplicate without complaint, so this is the only thing that will notice two cheques with one
 * number.
 *
 * @param {PaymentDefaultsFacts} facts
 * @param {unknown} value
 * @param {{ mode?: string, paidFrom?: string, currentName?: string }} ctx
 * @returns {PastPayment|null}
 */
export function referenceNoInUse(facts, value, ctx = {}) {
  const ref = text(value);
  const mode = text(ctx.mode);
  if (!ref || !mode) return null;
  if (isChequeMode(mode) && !text(ctx.paidFrom)) return null;
  const { rows } = sequenceRows(facts || {}, { mode, paidFrom: ctx.paidFrom });
  return rows.find((p) => text(p.reference_no) === ref && p.name !== ctx.currentName) || null;
}

const COMPANY_SUFFIXES = [
  [/\s+limited liability company$/i, " LLC"],
  [/\s+incorporated$/i, " Inc"],
  [/\s+corporation$/i, " Corp"],
  [/\s+company$/i, " Co"],
  [/\s+limited$/i, " Ltd"],
];

/**
 * "ABC Company" → "ABC Co", "HECSANDBOX INCORPORATED" → "HECSANDBOX Inc". Only the legal suffix
 * is abbreviated; the name itself is never rewritten.
 * @param {unknown} name
 */
export function shortCompanyName(name) {
  let s = text(name).replace(/[.,]+$/, "");
  for (const [re, short] of COMPANY_SUFFIXES) {
    if (re.test(s)) return s.replace(re, short);
  }
  return s;
}

/**
 * The memo: who is paying, and under which account at the vendor — *"ABC Co Cust#1234"* (5zorro
 * 2026-09-14). Never longer than `limit`.
 *
 * The customer number is the part the vendor applies the payment by, so it is the part that
 * survives: the short company name is tried first, then the company abbreviation, and only then is
 * anything cut. A number that already labels itself (`CUST-44192`, `ACCT#9`) is not labelled twice.
 *
 * @param {{ companyName?: string, abbr?: string, customerNumber?: string, limit?: number }} input
 */
export function paymentMemo(input = {}) {
  const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : MEMO_MAX_CHARS;
  const number = text(input.customerNumber);
  const tail = !number ? "" : /^[A-Za-z]+[-#]/.test(number) ? number : `Cust#${number}`;
  const names = [...new Set([shortCompanyName(input.companyName), text(input.abbr)].filter(Boolean))];
  for (const name of names) {
    const candidate = tail ? `${name} ${tail}` : name;
    if (candidate.length <= limit) return candidate;
  }
  if (tail) return tail.slice(0, limit);
  return (names[0] || "").slice(0, limit).trimEnd();
}

/**
 * @param {PaymentDefaultsFacts} facts
 * @param {{ supplier?: string }} ctx
 * @returns {ProposedField}
 */
export function proposeMemo(facts, ctx = {}) {
  const f = facts || {};
  const supplier = text(ctx.supplier);
  if (!supplier) return { value: "", source: "", note: "" };
  const company = text(f.company);
  const rows = Array.isArray(f.customerNumbers) ? f.customerNumbers : [];
  const row =
    rows.find((r) => r && text(r.company) === company && text(r.customer_number)) ||
    rows.find((r) => r && !text(r.company) && text(r.customer_number));
  const customerNumber = row ? text(row.customer_number) : "";
  const value = paymentMemo({ companyName: f.companyName || company, abbr: f.abbr, customerNumber });
  if (!value) return { value: "", source: "", note: "" };
  const limit = `${MEMO_MAX_CHARS} characters, the ACH Company Discretionary Data limit`;
  return customerNumber
    ? {
        value,
        source: "customer-number",
        note: `${value} — ${customerNumber} is our customer number at ${supplier} (its Customer Numbers table); ${limit}`,
      }
    : {
        value,
        source: "company-only",
        note: `${value} — ${supplier} has no customer number for ${company} in its Customer Numbers table; add one there and it goes on every payment`,
      };
}

/**
 * All four proposals, chained: the account is proposed for the method that will actually be used,
 * and the reference for that method and account. `ctx.mode` / `ctx.paidFrom` are what the clerk
 * has already chosen, and win over any proposal.
 *
 * @param {PaymentDefaultsFacts} facts
 * @param {{ supplier?: string, termsMethod?: string, mode?: string, paidFrom?: string }} ctx
 * @returns {{ modeOfPayment: ProposedField, paidFrom: ProposedField, referenceNo: ProposedField, memo: ProposedField }}
 */
export function proposePaymentEntryDefaults(facts, ctx = {}) {
  const f = facts || {};
  const modeOfPayment = proposeModeOfPayment(f, ctx);
  const mode = text(ctx.mode) || modeOfPayment.value;
  const paidFrom = proposePaidFrom(f, { mode });
  const account = text(ctx.paidFrom) || paidFrom.value;
  return {
    modeOfPayment,
    paidFrom,
    referenceNo: proposeReferenceNo(f, { mode, paidFrom: account }),
    memo: proposeMemo(f, ctx),
  };
}
