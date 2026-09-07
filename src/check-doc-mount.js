/**
 * DOM side of the check/ACH document (Packet 4b). Paints the check-doc.fragment.html markup
 * from an already-built CheckDocViewModel (check-doc-view.js), and (step 4) wires the write-
 * mode controls that turn a *proposal* into an actual Payment Entry. Two mounts share this file
 * unchanged: the pay-outstanding.html drawer (an editable proposal) and payment-doc.html (a
 * read-only view of an existing document, step 5) -- only the caller differs in which view-model
 * builder it uses and whether it calls mountCheckDocWrite at all.
 */
import { mountLinkPicker } from "./link-picker-ui.js";

/**
 * What the write-mode submit button acts on -- set by setCheckDocBatchSource, read by
 * mountCheckDocWrite's click handler. Irrelevant (stays null) on a read-only mount, which never
 * calls mountCheckDocWrite.
 */
let currentGroup = null;
let currentBills = [];

function money(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function field(root, testid) {
  return root.querySelector(`[data-testid="${testid}"]`);
}

/**
 * Register what a later submit-click should act on. Call before/with paintCheckDoc when the
 * mount is an editable proposal; never call it for a read-only existing-document mount.
 * @param {import("./payment-batch-economics.js").PaymentBatchGroup|null} group
 * @param {import("./outstanding-bills.js").OutstandingBillRow[]} [bills]
 */
export function setCheckDocBatchSource(group, bills) {
  currentGroup = group || null;
  currentBills = bills || [];
}

/**
 * @param {Element|null|undefined} root the check-doc fragment's own container
 * @param {import("./check-doc-view.js").CheckDocViewModel|null|undefined} viewModel
 * @param {{ readOnly?: boolean, badgeText?: string }} [opts]
 */
export function paintCheckDoc(root, viewModel, opts = {}) {
  if (!root) return;
  const vm = viewModel || {};

  const badge = field(root, "check-doc-badge");
  if (badge) badge.textContent = opts.badgeText || "Preview — not yet saved";

  const payee = field(root, "check-doc-payee");
  if (payee) payee.textContent = vm.payTo || "";
  const amount = field(root, "check-doc-amount");
  if (amount) amount.textContent = money(vm.amount || 0);
  const date = field(root, "check-doc-date");
  if (date) date.textContent = vm.payOn || "";
  const memo = field(root, "check-doc-memo");
  if (memo) memo.textContent = vm.memo || "";

  const rowsEl = field(root, "check-doc-stub-rows");
  if (rowsEl) {
    rowsEl.innerHTML = "";
    for (const row of vm.stubRows || []) {
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
  if (total) total.textContent = `Total ${money(vm.amount || 0)}`;

  // taxes/deductions: a proposal carries neither, and this pass does not surface them for an
  // existing document either (draft-only fields, rare for AP per the architecture note) --
  // sections stay hidden either way, "rendered only when non-empty" trivially satisfied.

  const mop = field(root, "check-doc-mop");
  const acct = field(root, "check-doc-cash-account");
  const ref = field(root, "check-doc-reference-no");
  const status = field(root, "check-doc-write-status");
  const submit = field(root, "check-doc-submit");
  const actions = field(root, "check-doc-write-actions");

  if (opts.readOnly) {
    if (mop) {
      mop.value = vm.modeOfPayment || "";
      mop.disabled = true;
    }
    if (acct) {
      acct.value = vm.bankAccount || "";
      acct.disabled = true;
    }
    if (ref) {
      ref.value = vm.referenceNo || "";
      ref.disabled = true;
    }
    if (actions) actions.hidden = true;
  } else {
    if (mop) {
      mop.value = "";
      mop.disabled = false;
    }
    if (acct) {
      acct.value = "";
      acct.disabled = false;
    }
    if (ref) {
      ref.value = "";
      ref.disabled = false;
    }
    if (actions) actions.hidden = false;
    if (status) status.textContent = "";
    if (submit) submit.disabled = false;
  }
  root.hidden = false;
}

/** @param {Element|null|undefined} root */
export function closeCheckDoc(root) {
  if (root) root.hidden = true;
}

/**
 * Wire the write-mode controls once per fragment mount -- unlike paintCheckDoc, this does not
 * re-run on every group switch. mountLinkPicker refuses to double-mount the same input (its own
 * linkMounted WeakMap), so calling this once at page init is the correct lifetime. Never call
 * this for a read-only mount (payment-doc.html) -- there is nothing to submit there.
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
