/**
 * DOM side of the check/ACH document (Packet 4b). Populates the check-doc.fragment.html markup
 * from a chosen PaymentBatchGroup, and (step 4) wires the write-mode controls that turn that
 * preview into an actual Payment Entry. Pure view-model logic lives in check-doc-view.js and
 * payment-entry-batch.js; this file only touches the DOM.
 */
import { buildCheckDocViewModel } from "./check-doc-view.js";
import { mountLinkPicker } from "./link-picker-ui.js";

/** The group/bills paintCheckDoc most recently painted -- what the submit button acts on. */
let currentGroup = null;
let currentBills = [];

function money(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function field(root, testid) {
  return root.querySelector(`[data-testid="${testid}"]`);
}

function resetWriteInputs(root) {
  const mop = field(root, "check-doc-mop");
  if (mop) mop.value = "";
  const acct = field(root, "check-doc-cash-account");
  if (acct) acct.value = "";
  const ref = field(root, "check-doc-reference-no");
  if (ref) ref.value = "";
  const status = field(root, "check-doc-write-status");
  if (status) status.textContent = "";
  const submit = field(root, "check-doc-submit");
  if (submit) submit.disabled = false;
}

/**
 * @param {Element|null|undefined} root the check-doc fragment's own container
 * @param {import("./payment-batch-economics.js").PaymentBatchGroup} group
 * @param {import("./outstanding-bills.js").OutstandingBillRow[]} bills
 */
export function paintCheckDoc(root, group, bills) {
  if (!root) return;
  currentGroup = group || null;
  currentBills = bills || [];
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
  // satisfied here.
  resetWriteInputs(root);
  root.hidden = false;
}

/** @param {Element|null|undefined} root */
export function closeCheckDoc(root) {
  if (root) root.hidden = true;
}

/**
 * Wire the write-mode controls once per fragment mount -- unlike paintCheckDoc, this does not
 * re-run on every group switch. mountLinkPicker refuses to double-mount the same input (its own
 * linkMounted WeakMap), so calling this once at page init is the correct lifetime.
 *
 * @param {Element|null|undefined} root
 * @param {{
 *   api?: { searchLink?: Function, createBatchPaymentEntry?: Function },
 *   linkMounted?: WeakMap<Element, true>,
 *   onDirty?: (dirty: boolean) => void,
 *   onSubmitted?: (result: { ok: true, name: string|null }) => void,
 * }} [deps]
 */
export function mountCheckDocWrite(root, deps = {}) {
  if (!root) return;
  const { api, linkMounted, onDirty, onSubmitted } = deps;
  const mopInput = field(root, "check-doc-mop");
  const acctInput = field(root, "check-doc-cash-account");
  const refInput = field(root, "check-doc-reference-no");
  const submitBtn = field(root, "check-doc-submit");
  const statusEl = field(root, "check-doc-write-status");

  const markDirty = () => {
    if (onDirty) onDirty(true);
  };
  const linkDeps = {
    api: api || {},
    linkMounted: linkMounted || new WeakMap(),
    setStatus: (text) => {
      if (statusEl) statusEl.textContent = text || "";
    },
  };
  if (mopInput) mountLinkPicker(mopInput, "Mode of Payment", async () => markDirty(), linkDeps);
  if (acctInput) mountLinkPicker(acctInput, "Account", async () => markDirty(), linkDeps);
  if (refInput) refInput.addEventListener("input", markDirty);

  if (!submitBtn) return;
  submitBtn.addEventListener("click", async () => {
    if (!currentGroup) return;
    if (!api || !api.createBatchPaymentEntry) {
      if (statusEl) statusEl.textContent = "Shell bridge unavailable.";
      return;
    }
    const cashBankAccount = acctInput ? acctInput.value.trim() : "";
    if (!cashBankAccount) {
      if (statusEl) statusEl.textContent = "Pick a Pay from account first.";
      return;
    }
    const intent = {
      modeOfPayment: mopInput ? mopInput.value.trim() : "",
      cashBankAccount,
      referenceNo: refInput ? refInput.value.trim() : "",
      payOn: currentGroup.payOn,
    };
    const groupBillKeys = new Set(currentGroup.bills || []);
    const bills = currentBills.filter((b) => groupBillKeys.has(b.installmentKey));

    submitBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Creating Payment Entry…";
    const result = await api.createBatchPaymentEntry(bills, intent).catch((e) => ({
      ok: false,
      reason: String((e && e.message) || e),
    }));
    submitBtn.disabled = false;
    if (!result || !result.ok) {
      if (statusEl) statusEl.textContent = (result && result.reason) || "Payment Entry create failed.";
      return;
    }
    if (statusEl) statusEl.textContent = `Created ${result.name || "Payment Entry"}.`;
    if (onDirty) onDirty(false);
    if (onSubmitted) onSubmitted(result);
  });
}
