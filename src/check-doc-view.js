/**
 * View-model for the check/ACH document preview (Packet 4b step 2). Pure: takes an already-
 * computed PaymentBatchGroup (payment-batch-economics.js) plus the OutstandingBillRow list it
 * was derived from, and returns the shape the check-doc fragment renders. No ERP write happens
 * before this point, so fields a real Payment Entry would compute on save (in_words, check no.,
 * bank account) are not invented here -- the fragment shows them as "assigned when saved."
 */

/**
 * @typedef {{
 *   payTo: string,
 *   amount: number,
 *   payOn: string,
 *   memo: string,
 *   stubRows: Array<{ invoice: string, dueDate: string, amount: number }>,
 *   modeOfPayment?: string,
 *   bankAccount?: string,
 *   referenceNo?: string,
 *   status?: "Draft"|"Submitted"|"Cancelled",
 * }} CheckDocViewModel
 */

/**
 * @param {import("./payment-batch-economics.js").PaymentBatchGroup} group
 * @param {import("./outstanding-bills.js").OutstandingBillRow[]} bills
 * @returns {CheckDocViewModel}
 */
export function buildCheckDocViewModel(group, bills) {
  const g = group || {};
  const byKey = new Map((bills || []).map((b) => [b.installmentKey, b]));
  const stubRows = (g.bills || []).map((key) => {
    const bill = byKey.get(key);
    return {
      invoice: bill ? bill.invoice : key,
      dueDate: bill ? bill.dueDate : "",
      amount: bill ? bill.outstanding : 0,
    };
  });
  return {
    payTo: g.supplier || "",
    amount: g.totalAmount || 0,
    payOn: g.payOn || "",
    memo: g.rationale || "",
    stubRows,
  };
}

/**
 * @param {number|string|null|undefined} docstatus ERP docstatus: 0 Draft, 1 Submitted, 2 Cancelled
 * @returns {"Draft"|"Submitted"|"Cancelled"}
 */
export function paymentEntryStatusLabel(docstatus) {
  const n = Number(docstatus);
  if (n === 1) return "Submitted";
  if (n === 2) return "Cancelled";
  return "Draft";
}

/**
 * View-model for an *existing* Payment Entry (Packet 4b step 5 -- the full-page mount).
 * Unlike buildCheckDocViewModel (a proposal that has not been written yet), a real document
 * already carries the fields a proposal has to leave blank: reference_no, mode_of_payment, and
 * the bank block ERPNext auto-fills from paid_from.
 *
 * @param {{
 *   party?: string,
 *   paid_amount?: number,
 *   reference_date?: string,
 *   remarks?: string,
 *   mode_of_payment?: string,
 *   paid_from?: string,
 *   reference_no?: string,
 *   docstatus?: number,
 *   references?: Array<{ reference_name?: string, due_date?: string, allocated_amount?: number }>,
 * }} peDoc
 * @returns {CheckDocViewModel}
 */
export function buildCheckDocViewModelFromPaymentEntry(peDoc) {
  const d = peDoc && typeof peDoc === "object" ? peDoc : {};
  const stubRows = (Array.isArray(d.references) ? d.references : []).map((r) => ({
    invoice: (r && r.reference_name) || "",
    dueDate: (r && r.due_date) || "",
    amount: (r && Number(r.allocated_amount)) || 0,
  }));
  return {
    payTo: d.party || "",
    amount: Number(d.paid_amount) || 0,
    payOn: d.reference_date || "",
    memo: d.remarks || "",
    stubRows,
    modeOfPayment: d.mode_of_payment || "",
    bankAccount: d.paid_from || "",
    referenceNo: d.reference_no || "",
    status: paymentEntryStatusLabel(d.docstatus),
  };
}
