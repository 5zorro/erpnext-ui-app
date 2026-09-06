/**
 * DOM side of the check/ACH document preview (Packet 4b step 2). Populates the
 * check-doc.fragment.html markup from a chosen PaymentBatchGroup -- read-only, no inputs, no
 * write. Pure view-model logic lives in check-doc-view.js; this file only touches the DOM.
 */
import { buildCheckDocViewModel } from "./check-doc-view.js";

function money(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function field(root, testid) {
  return root.querySelector(`[data-testid="${testid}"]`);
}

/**
 * @param {Element|null|undefined} root the check-doc fragment's own container
 * @param {import("./payment-batch-economics.js").PaymentBatchGroup} group
 * @param {import("./outstanding-bills.js").OutstandingBillRow[]} bills
 */
export function paintCheckDoc(root, group, bills) {
  if (!root) return;
  const vm = buildCheckDocViewModel(group, bills);

  const payee = field(root, "check-doc-payee");
  if (payee) payee.textContent = vm.payTo;
  const amount = field(root, "check-doc-amount");
  if (amount) amount.textContent = money(vm.amount);
  const date = field(root, "check-doc-date");
  if (date) date.textContent = vm.payOn;
  const memo = field(root, "check-doc-memo");
  if (memo) memo.textContent = vm.memo;

  const rowsEl = field(root, "check-doc-stub-rows");
  if (rowsEl) {
    rowsEl.innerHTML = "";
    for (const row of vm.stubRows) {
      const el = document.createElement("div");
      el.className = "check-doc-stub-row";
      el.dataset.testid = "check-doc-stub-row";
      const inv = document.createElement("span");
      inv.className = "check-doc-stub-invoice";
      inv.textContent = row.invoice;
      const due = document.createElement("span");
      due.className = "check-doc-stub-due";
      due.textContent = row.dueDate;
      const amt = document.createElement("span");
      amt.className = "check-doc-stub-amount";
      amt.textContent = money(row.amount);
      el.appendChild(inv);
      el.appendChild(due);
      el.appendChild(amt);
      rowsEl.appendChild(el);
    }
  }
  const total = field(root, "check-doc-stub-total");
  if (total) total.textContent = `Total ${money(vm.amount)}`;

  // taxes/deductions: a proposal carries neither (ERPNext only computes them once a real
  // Payment Entry exists) -- sections stay hidden, "rendered only when non-empty" trivially
  // satisfied here. Left as an explicit no-op rather than deleted, so the write path (step 4)
  // has an obvious place to fill these in once real documents flow through this same fragment.
  root.hidden = false;
}

/** @param {Element|null|undefined} root */
export function closeCheckDoc(root) {
  if (root) root.hidden = true;
}
