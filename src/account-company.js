/**
 * Account ↔ Bill company mismatch helpers (Doc Bill / Account link pickers).
 * ERP validates tax/cash-bank accounts belong to the Bill company on save;
 * Doc surfaces mismatches earlier without hiding other-company accounts.
 */

/**
 * @typedef {{
 *   value: string,
 *   description?: string,
 *   company?: string,
 *   companyMismatch?: boolean,
 *   activity?: string,
 *   action?: string,
 * }} AccountLinkOption
 */

/**
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 */
export function companiesEqual(a, b) {
  return String(a || "").trim() === String(b || "").trim() && !!String(a || "").trim();
}

/**
 * Annotate + sort Account link rows: Bill company first, others muted (still selectable).
 * @param {AccountLinkOption[]} options
 * @param {string|null|undefined} billCompany
 * @returns {AccountLinkOption[]}
 */
export function annotateAccountLinkOptions(options, billCompany) {
  const bill = String(billCompany || "").trim();
  const list = Array.isArray(options) ? options : [];
  /** @type {AccountLinkOption[]} */
  const out = list.map((o) => {
    if (!o || !o.value) return o;
    const company = o.company != null ? String(o.company).trim() : "";
    if (!bill || !company) {
      return { ...o, company: company || o.company, companyMismatch: false };
    }
    const mismatch = !companiesEqual(company, bill);
    return { ...o, company, companyMismatch: mismatch };
  });
  out.sort((a, b) => {
    const am = a && a.companyMismatch ? 1 : 0;
    const bm = b && b.companyMismatch ? 1 : 0;
    if (am !== bm) return am - bm;
    return String(a && a.value).localeCompare(String(b && b.value));
  });
  return out;
}

/**
 * Clerk-facing warning when picking a wrong-company Account.
 * @param {{ account?: string, accountCompany?: string, billCompany?: string }} opts
 */
export function accountCompanyMismatchPickMessage(opts = {}) {
  const account = String(opts.account || "").trim() || "This account";
  const accountCompany = String(opts.accountCompany || "").trim() || "another company";
  const billCompany = String(opts.billCompany || "").trim() || "this Bill’s company";
  return (
    `${account} belongs to ${accountCompany} — this Bill is ${billCompany}. ` +
    `That causes a company mismatch and will block Save until you pick an account for ${billCompany}.`
  );
}

/**
 * Save-gate blockers for Account fields that must match Bill company.
 * @param {{
 *   billCompany?: string|null,
 *   accountHeads?: Array<string|null|undefined>,
 *   cashBankAccount?: string|null,
 *   accountCompanyByName?: Record<string, string>|Map<string, string>|null,
 * }} ctx
 * @returns {string[]}
 */
export function listAccountCompanyMismatchBlockers(ctx = {}) {
  const bill = String(ctx.billCompany || "").trim();
  if (!bill) return [];
  const map = ctx.accountCompanyByName;
  /** @param {string} name */
  const companyOf = (name) => {
    if (!map) return "";
    if (map instanceof Map) return String(map.get(name) || "").trim();
    return String(/** @type {Record<string, string>} */ (map)[name] || "").trim();
  };
  /** @type {string[]} */
  const blockers = [];
  const seen = new Set();
  const heads = Array.isArray(ctx.accountHeads) ? ctx.accountHeads : [];
  heads.forEach((raw, i) => {
    const name = String(raw || "").trim();
    if (!name || seen.has(`tax:${name}`)) return;
    const co = companyOf(name);
    if (!co) return; // unknown — ERP still validates
    if (!companiesEqual(co, bill)) {
      seen.add(`tax:${name}`);
      blockers.push(
        `Taxes and Charges row ${i + 1}: Account ${name} belongs to ${co}, not Bill company ${bill}.`,
      );
    }
  });
  const cash = String(ctx.cashBankAccount || "").trim();
  if (cash) {
    const co = companyOf(cash);
    if (co && !companiesEqual(co, bill)) {
      blockers.push(
        `Cash / Bank Account ${cash} belongs to ${co}, not Bill company ${bill}.`,
      );
    }
  }
  return blockers;
}

/**
 * Collect Account names from a Purchase Invoice-like doc.
 * @param {object|null|undefined} doc
 * @returns {string[]}
 */
export function accountNamesOnBillDoc(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  /** @type {string[]} */
  const names = [];
  const taxes = Array.isArray(d.taxes) ? d.taxes : [];
  for (const t of taxes) {
    const h = t && t.account_head != null ? String(t.account_head).trim() : "";
    if (h) names.push(h);
  }
  const cash = d.cash_bank_account != null ? String(d.cash_bank_account).trim() : "";
  if (cash) names.push(cash);
  return [...new Set(names)];
}
