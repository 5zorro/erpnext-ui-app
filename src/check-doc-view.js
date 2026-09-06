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
