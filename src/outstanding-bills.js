/**
 * Normalize Vanilla ERP truth into the flat shape `payment-batch-economics.js` consumes (OI-161
 * Packet 1). Source is the existing Accounts Payable report (`frappe.desk.query_report.run`,
 * report_name=Accounts Payable) — same engine Vanilla's own report page uses. This module only
 * reshapes rows; it makes no ERP writes and re-derives no ageing/outstanding math ERP already owns.
 */

/**
 * @typedef {{
 *   invoice: string,          // Purchase Invoice name (report's voucher_no) — NOT always unique; see installmentKey
 *   installmentKey: string,   // unique per row: `invoice` normally, `${invoice}#${n}` for an exploded installment
 *   supplier: string,         // report's party (shared AR/AP engine field name)
 *   billNo: string,           // the vendor's own invoice no. (report's bill_no) — OI-170, "" when not typed
 *   postingDate: string,      // ISO
 *   dueDate: string,          // ISO — header due_date (last installment; bill-payment-schedule.js convention)
 *   invoiced: number,         // bill's own grand total — needed for Percentage discount math, not just display
 *   outstanding: number,      // party currency
 *   currency: string,
 *   discountDate?: string,    // ISO — earliest payment_schedule row with a discount, if any
 *   discountAmount?: number,  // absolute $ saved if paid by discountDate
 *
 *   // --- Payment-term structure (Packet A1). Every field below is OPTIONAL and ABSENT when the
 *   // schedule row does not state it — never "" and never 0. Callers must be able to tell "no term
 *   // recorded" from "Net 0", which is the whole point of reading them.
 *   paymentTerm?: string,     // Payment Term Link name, e.g. "NET_30_DAYS (POSTAL) -3" — carries
 *                             //   the grace suffix (see payment-term-grace.js) and the human method
 *   termDescription?: string, // the term in the vendor's own words
 *   modeOfPayment?: string,   // Mode of Payment Link — the METHOD, and the machine-readable SSoT
 *                             //   for it (the "(POSTAL)" in the name is for humans only)
 *   invoicePortion?: number,  // % of the bill this installment is
 *   paymentAmount?: number,   // scheduled amount (vs `outstanding`, which nets off payments)
 *   paidAmount?: number,      // partial-payment truth
 *   discountedAmount?: number,// discount already taken
 *   creditDays?: number,      // the credit period itself
 *   creditMonths?: number,
 *   dueDateBasedOn?: string,  // how ERPNext derived the due date
 *   discountValidity?: number,
 *   discountValidityBasedOn?: string,
 * }} OutstandingBillRow
 */

/**
 * The `payment_schedule` child-row fields Packet A carries onto a bill row, and the camelCase name
 * each takes. Read-only: this tranche never writes back (see the plan's Packet A non-goals).
 *
 * Split by type so the copier can reject the wrong shape per field rather than trusting the row —
 * `frappe.client.get` returns Currency/Float as numbers but Int as numbers too, and a NULL Link
 * arrives as `null`, which must not become the string "null".
 */
const TERM_STRING_FIELDS = Object.freeze({
  payment_term: "paymentTerm",
  description: "termDescription",
  mode_of_payment: "modeOfPayment",
  due_date_based_on: "dueDateBasedOn",
  discount_validity_based_on: "discountValidityBasedOn",
});

const TERM_NUMBER_FIELDS = Object.freeze({
  invoice_portion: "invoicePortion",
  payment_amount: "paymentAmount",
  paid_amount: "paidAmount",
  discounted_amount: "discountedAmount",
  credit_days: "creditDays",
  credit_months: "creditMonths",
  discount_validity: "discountValidity",
});

/** The Payment Schedule fields the board reads (one `get_list`, review 10-19 R10b-1). */
export const OUTSTANDING_SCHEDULE_FIELDS = Object.freeze([
  "parent",
  "idx",
  "due_date",
  "discount_date",
  "discount_type",
  "discount",
  ...Object.keys(TERM_STRING_FIELDS),
  ...Object.keys(TERM_NUMBER_FIELDS),
]);

/**
 * The term fields present on one `payment_schedule` row, as a partial `OutstandingBillRow`.
 *
 * **Absent stays absent.** A field is copied only when the row actually states it: empty strings,
 * `null`, `undefined` and non-finite numbers are all dropped rather than normalized to `""`/`0`.
 * Zero *is* kept when genuinely present (`credit_days: 0` means "due on receipt", which is a real
 * term and not the same as an unrecorded one).
 *
 * @param {Record<string, unknown>|null|undefined} scheduleRow
 * @returns {Partial<OutstandingBillRow>}
 */
export function pickTermFields(scheduleRow) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (!scheduleRow || typeof scheduleRow !== "object") return out;
  const row = /** @type {Record<string, unknown>} */ (scheduleRow);

  for (const [erpField, key] of Object.entries(TERM_STRING_FIELDS)) {
    const v = row[erpField];
    if (v == null) continue;
    const str = String(v).trim();
    if (str) out[key] = str;
  }
  for (const [erpField, key] of Object.entries(TERM_NUMBER_FIELDS)) {
    const v = row[erpField];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

/**
 * Term fields from the bill's *first* schedule row, merged onto a non-exploded bill row.
 *
 * The first row is the right source here precisely because this path is only taken when
 * `explodeInstallments` declined — i.e. there is at most one distinct unpaid due date, so every row
 * is describing the same obligation and they carry the same term.
 *
 * @param {OutstandingBillRow} row
 * @param {Array<Record<string, unknown>>} paymentScheduleRows
 * @returns {OutstandingBillRow}
 */
export function attachTermFields(row, paymentScheduleRows) {
  const rows = Array.isArray(paymentScheduleRows) ? paymentScheduleRows : [];
  return { ...row, ...pickTermFields(rows[0]) };
}

/**
 * @param {object} reportRow one row from the Accounts Payable report's `result`
 * @returns {OutstandingBillRow}
 */
export function normalizeAccountsPayableRow(reportRow) {
  const r = reportRow || {};
  const invoice = strOrEmpty(r.voucher_no ?? r.name);
  return {
    invoice,
    installmentKey: invoice,
    supplier: strOrEmpty(r.party ?? r.supplier_name),
    billNo: strOrEmpty(r.bill_no).trim(),
    postingDate: strOrEmpty(r.posting_date),
    dueDate: strOrEmpty(r.due_date),
    invoiced: numOrZero(r.invoiced),
    outstanding: numOrZero(r.outstanding),
    currency: strOrEmpty(r.currency),
  };
}

/**
 * Earliest-`discount_date` Payment Schedule row with an active discount, merged onto the bill row.
 * Pure — returns a new object; `row` is never mutated. No qualifying row → row returned unchanged
 * (no `discountDate`/`discountAmount` keys), so callers can tell "no discount offered" from "$0".
 *
 * `discount_type: "Percentage"` computes off the **bill's own `invoiced` grand total**, not the
 * schedule row's `payment_amount` — matches ERPNext's own early-payment-discount formula
 * (`payment_entry.py::apply_early_payment_discount`: `grand_total * discount / 100`). A
 * `payment_amount`-based calc is only coincidentally right for single-installment bills.
 *
 * @param {OutstandingBillRow} row
 * @param {Array<{ discount_date?: string, discount_type?: "Percentage"|"Amount", discount?: number }>} paymentScheduleRows
 * @returns {OutstandingBillRow}
 */
export function attachDiscountWindow(row, paymentScheduleRows) {
  const candidates = (Array.isArray(paymentScheduleRows) ? paymentScheduleRows : [])
    .filter((s) => s && s.discount_date && Number(s.discount) > 0)
    .slice()
    .sort((a, b) => String(a.discount_date).localeCompare(String(b.discount_date)));

  if (!candidates.length) return { ...row };

  const win = candidates[0];
  const discountAmount =
    win.discount_type === "Amount"
      ? round2(Number(win.discount))
      : round2(row.invoiced * (Number(win.discount) / 100));

  return {
    ...row,
    discountDate: strOrEmpty(win.discount_date),
    discountAmount,
  };
}

/**
 * The Accounts Payable report is invoice-level: one row per Purchase Invoice, header `due_date`
 * (last installment), full remaining `outstanding`. A multi-installment Bill's earlier due dates
 * are invisible to a batching engine unless exploded here — confirmed against Packet G's
 * SUP-DAILY fixture, whose whole point (90 distinct payable obligations) collapsed to one $4,500
 * row due on the last day when run straight through `normalizeAccountsPayableRow`.
 *
 * Returns `null` when there's only one distinct unpaid `due_date` (the common case, including
 * every single-installment Bill) — the caller should use `attachDiscountWindow(row, ...)` instead,
 * unchanged. When there are ≥2 distinct due dates, returns one row per unpaid installment with its
 * own `outstanding` and its own discount fields (from *that* schedule row — not "earliest across
 * the whole invoice," which stops being correct once installments are split apart).
 *
 * @param {OutstandingBillRow} row
 * @param {Array<{
 *   due_date?: string,
 *   outstanding?: number,
 *   discount_date?: string,
 *   discount_type?: "Percentage"|"Amount",
 *   discount?: number,
 * }>} paymentScheduleRows
 * @returns {OutstandingBillRow[]|null}
 */
export function explodeInstallments(row, paymentScheduleRows) {
  const unpaid = (Array.isArray(paymentScheduleRows) ? paymentScheduleRows : [])
    .filter((s) => s && s.due_date && Number(s.outstanding) > 0);
  const distinctDates = new Set(unpaid.map((s) => String(s.due_date)));
  if (distinctDates.size < 2) return null;

  return unpaid
    .slice()
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .map((s, i) => {
      const installment = {
        ...row,
        // Per-installment, not the header's: once installments are split apart, a bill with two
        // terms (50% on order by wire, 50% net 30 by ACH) must not report one term for both.
        ...pickTermFields(s),
        installmentKey: `${row.invoice}#${i + 1}`,
        dueDate: strOrEmpty(s.due_date),
        outstanding: round2(Number(s.outstanding)),
      };
      if (s.discount_date && Number(s.discount) > 0) {
        installment.discountDate = strOrEmpty(s.discount_date);
        installment.discountAmount =
          s.discount_type === "Amount"
            ? round2(Number(s.discount))
            : round2(row.invoiced * (Number(s.discount) / 100));
      }
      return installment;
    });
}

/**
 * Convenience entry point — what Packet 4's IPC layer should call per invoice, so nobody forgets
 * the explode step. Pure; `reportRow`/`paymentScheduleRows` are the raw shapes from ERP HTTP calls.
 * @param {object} reportRow
 * @param {Parameters<typeof explodeInstallments>[1]} paymentScheduleRows
 * @returns {OutstandingBillRow[]}
 */
export function buildOutstandingBillRows(reportRow, paymentScheduleRows) {
  const base = normalizeAccountsPayableRow(reportRow);
  const exploded = explodeInstallments(base, paymentScheduleRows);
  if (exploded) return exploded;
  return [attachTermFields(attachDiscountWindow(base, paymentScheduleRows), paymentScheduleRows)];
}

/**
 * The schedule rows, each carrying the outstanding ERPNext's A/P report gives its term (matched by
 * due date — ERPNext refuses two rows on one date). Rows the report no longer lists are paid (0).
 * When some are still owed, only those are returned, so a paid installment's term or discount is
 * never put on what is left.
 * @param {Array<Record<string, unknown>>} schedule
 * @param {Array<Record<string, unknown>>} termRows the report's rows for this invoice
 * @returns {Array<Record<string, unknown>>}
 */
export function scheduleWithReportOutstanding(schedule, termRows) {
  const rows = Array.isArray(schedule) ? schedule : [];
  const owed = new Map();
  for (const t of Array.isArray(termRows) ? termRows : []) {
    if (t && t.due_date) owed.set(String(t.due_date), numOrZero(t.outstanding));
  }
  const out = rows.map((s) => ({ ...s, outstanding: owed.get(String(s && s.due_date)) ?? 0 }));
  const unpaid = out.filter((s) => Number(s.outstanding) > 0);
  return unpaid.length ? unpaid : rows;
}

/**
 * Every bill row for the board from the Accounts Payable report run **with
 * `based_on_payment_terms: 1`** (review 10-19 R10a-1). In that mode ERPNext splits each invoice
 * into one row per unpaid term and assigns payments and debit notes to the terms itself, earliest
 * due first (`accounts_receivable.py` `allocate_outstanding_based_on_payment_terms`). The schedule
 * rows' own `outstanding` is kept up to date only when the terms template allocates by term, so
 * reading it (as this module did) overstated a part-paid installment bill.
 *
 * Rows that are not money owed (an unallocated payment, an overpaid invoice's credit) pass through
 * as they are; the batching engine sets them aside as `unschedulable`.
 * @param {Array<Record<string, unknown>>} reportRows the report's `result` rows (with `voucher_no`)
 * @param {Record<string, Array<Record<string, unknown>>>} schedulesByInvoice Payment Schedule rows by parent
 * @returns {OutstandingBillRow[]}
 */
export function buildBillRowsFromTermReport(reportRows, schedulesByInvoice) {
  const bySchedule = schedulesByInvoice && typeof schedulesByInvoice === "object" ? schedulesByInvoice : {};
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const owed = new Map();
  /** @type {Array<{ voucher?: string, row?: Record<string, unknown> }>} */
  const order = [];
  for (const r of Array.isArray(reportRows) ? reportRows : []) {
    if (!r || !r.voucher_no) continue;
    const v = String(r.voucher_no);
    if (!(numOrZero(r.outstanding) > 0) || !r.due_date) {
      order.push({ row: r });
      continue;
    }
    if (!owed.has(v)) {
      owed.set(v, []);
      order.push({ voucher: v });
    }
    owed.get(v).push(r);
  }
  /** @type {OutstandingBillRow[]} */
  const out = [];
  for (const o of order) {
    if (o.row) {
      out.push(normalizeAccountsPayableRow(o.row));
      continue;
    }
    const terms = owed.get(o.voucher);
    const last = terms.reduce((a, t) => (String(t.due_date) > String(a.due_date) ? t : a), terms[0]);
    const invoiceRow = {
      ...last,
      // A term row's `invoiced` is the term's share; the bill's total is what a % discount is of.
      invoiced: last.invoice_grand_total ?? last.invoiced,
      outstanding: round2(terms.reduce((a, t) => a + numOrZero(t.outstanding), 0)),
    };
    out.push(
      ...buildOutstandingBillRows(invoiceRow, scheduleWithReportOutstanding(bySchedule[o.voucher] || [], terms)),
    );
  }
  return out;
}

/** @param {unknown} v */
function strOrEmpty(v) {
  return v == null ? "" : String(v);
}

/** @param {unknown} v */
function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** @param {number} x */
function round2(x) {
  return Math.round(x * 100) / 100;
}
