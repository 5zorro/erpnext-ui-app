/**
 * Normalize Vanilla ERP truth into the flat shape `payment-batch-economics.js` consumes (OI-161
 * Packet 1). Source is the existing Accounts Payable report (`frappe.desk.query_report.run`,
 * report_name=Accounts Payable) — same engine Vanilla's own report page uses. This module only
 * reshapes rows; it makes no ERP writes and re-derives no ageing/outstanding math ERP already owns.
 */

/**
 * @typedef {{
 *   invoice: string,          // Purchase Invoice name (report's voucher_no)
 *   supplier: string,         // report's party (shared AR/AP engine field name)
 *   postingDate: string,      // ISO
 *   dueDate: string,          // ISO — header due_date (last installment; bill-payment-schedule.js convention)
 *   invoiced: number,         // bill's own grand total — needed for Percentage discount math, not just display
 *   outstanding: number,      // party currency
 *   currency: string,
 *   discountDate?: string,    // ISO — earliest payment_schedule row with a discount, if any
 *   discountAmount?: number,  // absolute $ saved if paid by discountDate
 * }} OutstandingBillRow
 */

/**
 * @param {object} reportRow one row from the Accounts Payable report's `result`
 * @returns {OutstandingBillRow}
 */
export function normalizeAccountsPayableRow(reportRow) {
  const r = reportRow || {};
  return {
    invoice: strOrEmpty(r.voucher_no ?? r.name),
    supplier: strOrEmpty(r.party ?? r.supplier_name),
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
