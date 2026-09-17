/**
 * DOM side of the check/ACH document (Packet 4b). Paints the check-doc.fragment.html markup
 * from an already-built CheckDocViewModel (check-doc-view.js), and (step 4) wires the write-
 * mode controls that turn a *proposal* into an actual Payment Entry. Two mounts share this file
 * unchanged: the pay-outstanding.html drawer (an unsaved proposal) and payment-doc.html (an
 * existing document, step 5) -- only the caller differs in which view-model builder it uses and
 * which mount helper it wires.
 *
 * All three paint modes are *forms* (step 7, 5zorro 2026-09-08). `view` disables its inputs only
 * because ERPNext forbids editing a submitted document -- read-only is never something this skin
 * imposes to feel more document-like.
 */
import { mountLinkPicker } from "./link-picker-ui.js";
import { checkDocLinkFilters } from "./payment-entry-link-filters.js";
import { formatUsdAmountHtml } from "./money.js";

/**
 * What the write-mode submit button acts on -- set by setCheckDocBatchSource, read by
 * mountCheckDocWrite's click handler. Irrelevant (stays null) on a read-only mount, which never
 * calls mountCheckDocWrite.
 */
let currentGroup = null;
let currentBills = [];
/** Which existing Payment Entry an edit-mode save acts on. Null on the proposal mount. */
let currentDocName = null;

/**
 * The Doc skins' amount format — `$1,234.56` with the cents underlined (5zorro 2026-09-12). Safe
 * HTML: assign with innerHTML.
 */
function moneyHtml(n) {
  return formatUsdAmountHtml(Number(n) || 0);
}

function field(root, testid) {
  return root.querySelector(`[data-testid="${testid}"]`);
}

/**
 * Show a check-face row only when it has a value, and blank it when it does not -- a repaint
 * must never leave the previous document's check number sitting on this one's face.
 * @param {Element} root
 * @param {string} rowTestid the element carrying `hidden`
 * @param {string} valueTestid the element carrying the text
 * @param {string|null|undefined} value
 */
function setOptionalRow(root, rowTestid, valueTestid, value) {
  const row = field(root, rowTestid);
  const target = field(root, valueTestid);
  const text = value == null ? "" : String(value);
  if (target) target.textContent = text;
  if (row) row.hidden = !text;
}


/**
 * mountLinkPicker calls `api.searchLink(doctype, txt)` with no filters, so the filters a
 * Payment Entry account picker needs are injected here instead of widening that shared helper.
 * Without this the Account picker offered group accounts and the clerk only found out at submit
 * ("group accounts cannot be used in transactions" — dogfood 2026-09-08).
 * @param {{ searchLink?: Function }|null|undefined} api
 * @param {{ paymentType?: string, partyType?: string, company?: string }} [opts]
 */
function withLinkFilters(api, opts = {}) {
  const base = api || {};
  if (typeof base.searchLink !== "function") return base;
  return {
    ...base,
    searchLink: (doctype, txt) => base.searchLink(doctype, txt, checkDocLinkFilters(doctype, opts)),
  };
}

/**
 * Register which existing Payment Entry the edit mount is showing, so a Save knows what to
 * write. The proposal mount never calls this (there is no document yet).
 * @param {string|null} name
 */
export function setCheckDocDocument(name) {
  currentDocName = name ? String(name) : null;
}

/**
 * Register what a later submit-click should act on. Call before/with paintCheckDoc when the
 * mount is an unsaved proposal; never call it for an existing-document mount.
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
 * @param {{ mode?: "proposal"|"edit"|"view", readOnly?: boolean, badgeText?: string }} [opts]
 *   `mode` (5zorro 2026-09-08 — "the doc skin is supposed to still be a form"):
 *   - `proposal` (default): the drawer's unsaved batch. Inputs blank and enabled, submit shown.
 *   - `edit`: an existing **Draft** document. Inputs prefilled and enabled, Save shown.
 *   - `view`: a Submitted or Cancelled document. Inputs prefilled and disabled — because ERP
 *     forbids editing one, **not** because a document skin should feel read-only.
 *   - `blank`: a brand-new payment. Payee and amount become inputs (the clerk supplies them),
 *     the remittance stub is hidden (nothing is being paid off yet), Create draft shown.
 *   `readOnly: true` is the old spelling of `view`, kept so nothing silently changes meaning.
 */
export function paintCheckDoc(root, viewModel, opts = {}) {
  if (!root) return;
  const vm = viewModel || {};

  const badge = field(root, "check-doc-badge");
  if (badge) badge.textContent = opts.badgeText || "Preview — not yet saved";

  const payee = field(root, "check-doc-payee");
  if (payee) payee.textContent = vm.payTo || "";
  const amount = field(root, "check-doc-amount");
  if (amount) amount.innerHTML = moneyHtml(vm.amount || 0);
  const date = field(root, "check-doc-date");
  if (date) date.textContent = vm.payOn || "";
  const memo = field(root, "check-doc-memo");
  if (memo) memo.textContent = vm.memo || "";

  // Rendered only when the document actually carries them (an unsaved proposal does not) --
  // Packet 4b's "sections render only when non-empty", applied per row rather than per section.
  setOptionalRow(root, "check-doc-words-row", "check-doc-words", vm.inWords);
  setOptionalRow(root, "check-doc-no-field", "check-doc-no", vm.referenceNo);
  const bankLine = [vm.bankName, vm.bankAccountNo].filter(Boolean).join(" · ");
  setOptionalRow(root, "check-doc-bank-row", "check-doc-bank", bankLine);

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
      amt.innerHTML = moneyHtml(row.amount);
      el.appendChild(inv);
      el.appendChild(due);
      el.appendChild(amt);
      rowsEl.appendChild(el);
    }
  }
  const total = field(root, "check-doc-stub-total");
  // One span, not loose text + the cents span: `.check-doc-stub-total` is a flex box, and each loose
  // child would become its own flex item — rendering "Total $5,750." and "50" as separate pieces.
  if (total) total.innerHTML = `<span>Total ${moneyHtml(vm.amount || 0)}</span>`;

  // taxes/deductions: a proposal carries neither, and this pass does not surface them for an
  // existing document either (draft-only fields, rare for AP per the architecture note) --
  // sections stay hidden either way, "rendered only when non-empty" trivially satisfied.

  const mop = field(root, "check-doc-mop");
  const acct = field(root, "check-doc-cash-account");
  const ref = field(root, "check-doc-reference-no");
  const memoInput = field(root, "check-doc-memo-input");
  const status = field(root, "check-doc-write-status");
  const submit = field(root, "check-doc-submit");
  const save = field(root, "check-doc-save");
  const actions = field(root, "check-doc-write-actions");

  const mode = opts.mode || (opts.readOnly ? "view" : "proposal");
  const blank = mode === "blank";
  const prefill = mode === "edit" || mode === "view";
  const disabled = mode === "view";

  // Blank mode swaps the payee/amount *display* for inputs — the one mount where those two come
  // from the clerk rather than from a batch or a saved document.
  const payeeInput = field(root, "check-doc-payee-input");
  const amountInput = field(root, "check-doc-amount-input");
  if (payee) payee.hidden = blank;
  if (payeeInput) {
    // mountLinkPicker moves the input inside a .link-wrap and adds its chevron as a *sibling*,
    // so hiding the input alone left an orphan dropdown button sitting on the check face in
    // proposal/edit/view mode (found 2026-09-08). Hide whatever the picker actually wrapped.
    const shell = (typeof payeeInput.closest === "function" && payeeInput.closest(".link-wrap")) || payeeInput;
    shell.hidden = !blank;
    payeeInput.hidden = !blank;
    if (blank) payeeInput.value = "";
  }
  if (amount) amount.hidden = blank;
  if (amountInput) {
    amountInput.hidden = !blank;
    if (blank) amountInput.value = "";
  }
  // Nothing is being paid off on a blank check, so an empty "Remittance" heading would be noise.
  const stub = field(root, "check-doc-stub");
  if (stub) stub.hidden = blank;
  const pairs = [
    [mop, vm.modeOfPayment],
    [acct, vm.bankAccount],
    [ref, vm.referenceNo],
    [memoInput, vm.memo],
  ];
  for (const [el, value] of pairs) {
    if (!el) continue;
    el.value = prefill ? value || "" : "";
    el.disabled = disabled;
    // A repaint starts from nothing the app filled in: the next applyCheckDocDefaults decides again.
    if (el.dataset) delete el.dataset.autofilled;
  }
  const autofill = field(root, "check-doc-autofill");
  if (autofill) {
    autofill.innerHTML = "";
    autofill.hidden = true;
  }
  // A submitted document has nothing to act on; a draft is saved; a proposal is created.
  if (actions) actions.hidden = disabled;
  if (submit) {
    submit.hidden = mode !== "proposal";
    submit.disabled = false;
  }
  if (save) {
    save.hidden = mode !== "edit";
    save.disabled = false;
  }
  const create = field(root, "check-doc-create");
  if (create) {
    create.hidden = !blank;
    create.disabled = false;
  }
  if (status) status.textContent = "";
  root.hidden = false;
}

/**
 * Fill the check's Mode of Payment, Pay from account, reference and memo from
 * `proposePaymentEntryDefaults` (Packet C9), and list where each value came from beneath them.
 *
 * Only fields the clerk has not typed into are touched. What the app fills is marked
 * `data-autofilled`; typing into a field or picking a value removes the mark. So a later call — a
 * different method picked, which changes the account and the number sequence — refreshes what the
 * app wrote and never what the clerk wrote. Filling a field does not mark the drawer dirty: nothing
 * the clerk entered would be lost by closing it.
 *
 * @param {Element|null|undefined} root
 * @param {ReturnType<typeof import("./payment-entry-defaults.js").proposePaymentEntryDefaults>|null|undefined} proposal
 * @param {{ warning?: string }} [opts] a line to show first, e.g. a duplicate check number
 */
export function applyCheckDocDefaults(root, proposal, opts = {}) {
  if (!root || !proposal) return;
  const slots = [
    ["check-doc-mop", proposal.modeOfPayment],
    ["check-doc-cash-account", proposal.paidFrom],
    ["check-doc-reference-no", proposal.referenceNo],
    ["check-doc-memo-input", proposal.memo],
  ];
  const notes = [];
  for (const [testid, proposed] of slots) {
    const el = field(root, testid);
    if (!el || !proposed || el.disabled) continue;
    const ours = el.value.trim() === "" || el.dataset.autofilled === "1";
    if (!ours) continue;
    el.value = proposed.value || "";
    if (proposed.value) el.dataset.autofilled = "1";
    else delete el.dataset.autofilled;
    // A note with no value still matters: "type the first check number" is an instruction.
    if (proposed.note) notes.push(proposed.note);
  }

  // Mirror onto the check face, so the document shows what will be written.
  const memoInput = field(root, "check-doc-memo-input");
  const memoFace = field(root, "check-doc-memo");
  if (memoInput && memoFace) memoFace.textContent = memoInput.value;
  const refInput = field(root, "check-doc-reference-no");
  if (refInput) setOptionalRow(root, "check-doc-no-field", "check-doc-no", refInput.value.trim());

  const list = field(root, "check-doc-autofill");
  if (!list) return;
  list.innerHTML = "";
  const lines = opts.warning ? [[opts.warning, "warn"], ...notes.map((n) => [n, ""])] : notes.map((n) => [n, ""]);
  for (const [line, cls] of lines) {
    const li = document.createElement("li");
    if (cls) li.className = cls;
    li.textContent = line;
    list.appendChild(li);
  }
  list.hidden = lines.length === 0;
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
 *   onFieldEdited?: (testid: string) => void,
 * }} [deps] `onFieldEdited` (C9) fires after the clerk types into or picks one of the four
 *   write fields — the page re-proposes the others from it (a new method changes the account and
 *   the number sequence).
 */
export function mountCheckDocWrite(root, deps = {}) {
  if (!root) return;
  const { api, linkMounted, onDirty, onSubmitted, onFieldEdited } = deps;
  const mopInput = field(root, "check-doc-mop");
  const acctInput = field(root, "check-doc-cash-account");
  const refInput = field(root, "check-doc-reference-no");
  const submitBtn = field(root, "check-doc-submit");
  const statusEl = field(root, "check-doc-write-status");

  const markDirty = () => {
    if (onDirty) onDirty(true);
  };
  /** The clerk owns this field now: stop treating it as autofilled, and let the page re-propose. */
  const edited = (el) => {
    if (el && el.dataset) delete el.dataset.autofilled;
    markDirty();
    if (onFieldEdited && el) onFieldEdited(el.dataset.testid || "");
  };
  const linkDeps = {
    api: withLinkFilters(api, deps.linkFilterContext),
    linkMounted: linkMounted || new WeakMap(),
    setStatus: (text) => {
      if (statusEl) statusEl.textContent = text || "";
    },
  };
  if (mopInput) mountLinkPicker(mopInput, "Mode of Payment", async () => edited(mopInput), linkDeps);
  if (acctInput) mountLinkPicker(acctInput, "Account", async () => edited(acctInput), linkDeps);
  if (mopInput) mopInput.addEventListener("input", () => edited(mopInput));
  if (acctInput) acctInput.addEventListener("input", () => edited(acctInput));
  const memoInput = field(root, "check-doc-memo-input");
  const memoFace = field(root, "check-doc-memo");
  if (refInput) {
    refInput.addEventListener("input", () => {
      setOptionalRow(root, "check-doc-no-field", "check-doc-no", refInput.value.trim());
      edited(refInput);
    });
  }
  if (memoInput) {
    memoInput.addEventListener("input", () => {
      if (memoFace) memoFace.textContent = memoInput.value;
      edited(memoInput);
    });
  }

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
      // C9: the memo box used to be ignored on this path — typed, shown, and never sent.
      memo: memoInput ? memoInput.value.trim() : "",
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

/**
 * Wire the check as an **editable form** over an existing Draft Payment Entry (Packet 4b
 * step 7). 5zorro 2026-09-08: *"the doc skin ... is supposed to still be a form, but ... easier
 * for humans who handle documents. I don't want to force the lens of the form to be read-only to
 * make it more 'document-like'."* So a Draft is edited here; only ERP's own docstatus rule makes
 * a Submitted document read-only, and that is the document's state talking, not the skin's.
 *
 * Scope of this pass: the check-face fields — Mode of Payment, Pay-from account, check no. and
 * memo. Amount and the remittance allocations are **not** editable here; changing those means
 * re-running ERPNext's own allocation/`difference_amount` machinery, which is its own step.
 *
 * Same lifetime rule as {@link mountCheckDocWrite}: call once per fragment mount, not per paint.
 *
 * @param {Element|null|undefined} root
 * @param {{
 *   api?: { searchLink?: Function, savePaymentEntry?: Function },
 *   linkMounted?: WeakMap<Element, true>,
 *   onDirty?: (dirty: boolean) => void,
 *   onSaved?: (result: { ok: true, doc?: object }) => void,
 * }} [deps]
 */
export function mountCheckDocEdit(root, deps = {}) {
  if (!root) return;
  const { api, linkMounted, onDirty, onSaved } = deps;
  const mopInput = field(root, "check-doc-mop");
  const acctInput = field(root, "check-doc-cash-account");
  const refInput = field(root, "check-doc-reference-no");
  const memoInput = field(root, "check-doc-memo-input");
  const saveBtn = field(root, "check-doc-save");
  const statusEl = field(root, "check-doc-write-status");

  const markDirty = () => {
    if (onDirty) onDirty(true);
  };
  const linkDeps = {
    api: withLinkFilters(api, deps.linkFilterContext),
    linkMounted: linkMounted || new WeakMap(),
    setStatus: (text) => {
      if (statusEl) statusEl.textContent = text || "";
    },
  };
  if (mopInput) mountLinkPicker(mopInput, "Mode of Payment", async () => markDirty(), linkDeps);
  if (acctInput) mountLinkPicker(acctInput, "Account", async () => markDirty(), linkDeps);
  if (refInput) refInput.addEventListener("input", markDirty);
  if (memoInput) memoInput.addEventListener("input", markDirty);

  if (!saveBtn) return;
  saveBtn.addEventListener("click", async () => {
    if (!currentDocName) return;
    if (!api || !api.savePaymentEntry) {
      if (statusEl) statusEl.textContent = "Shell bridge unavailable.";
      return;
    }
    // Only the fields this form actually owns are sent. A patch, never the whole document --
    // anything else on the Payment Entry stays exactly as ERPNext last computed it.
    const patch = {
      mode_of_payment: mopInput ? mopInput.value.trim() : "",
      paid_from: acctInput ? acctInput.value.trim() : "",
      reference_no: refInput ? refInput.value.trim() : "",
      remarks: memoInput ? memoInput.value.trim() : "",
    };
    saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Saving…";
    const result = await api.savePaymentEntry(currentDocName, patch).catch((e) => ({
      ok: false,
      reason: String((e && e.message) || e),
    }));
    saveBtn.disabled = false;
    if (!result || !result.ok) {
      if (statusEl) statusEl.textContent = (result && result.reason) || "Save failed.";
      return;
    }
    if (statusEl) statusEl.textContent = "Saved.";
    if (onDirty) onDirty(false);
    if (onSaved) onSaved(result);
  });
}

/**
 * Wire the blank-check mount: a brand-new payment with no bills behind it (5zorro 2026-09-08 --
 * the drawer's closed state should offer "a blank and ready to enter doc-skin payment entry
 * form"). Creates a **Draft**, never a submitted document: a payment nobody has reviewed should
 * not post itself, and Packet 0 already confirmed zero-reference Payment Entries are ordinary
 * ERPNext usage (advances, deposits), not an edge case.
 *
 * Same once-per-mount lifetime as the other two wiring helpers.
 *
 * @param {Element|null|undefined} root
 * @param {{
 *   api?: { searchLink?: Function, createBlankPaymentEntry?: Function },
 *   linkMounted?: WeakMap<Element, true>,
 *   linkFilterContext?: { paymentType?: string, partyType?: string, company?: string },
 *   onDirty?: (dirty: boolean) => void,
 *   onCreated?: (result: { ok: true, name?: string }) => void,
 *   onPayeePicked?: (supplier: string) => void,
 * }} [deps] `onPayeePicked` (C9): once the payee is known the page can propose the rest.
 */
export function mountCheckDocBlank(root, deps = {}) {
  if (!root) return;
  const { api, linkMounted, onDirty, onCreated, onPayeePicked } = deps;
  const payeeInput = field(root, "check-doc-payee-input");
  const amountInput = field(root, "check-doc-amount-input");
  const mopInput = field(root, "check-doc-mop");
  const acctInput = field(root, "check-doc-cash-account");
  const refInput = field(root, "check-doc-reference-no");
  const memoInput = field(root, "check-doc-memo-input");
  const dateEl = field(root, "check-doc-date");
  const createBtn = field(root, "check-doc-create");
  const statusEl = field(root, "check-doc-write-status");

  const markDirty = () => {
    if (onDirty) onDirty(true);
  };
  const linkDeps = {
    api: withLinkFilters(api, deps.linkFilterContext),
    linkMounted: linkMounted || new WeakMap(),
    setStatus: (text) => {
      if (statusEl) statusEl.textContent = text || "";
    },
  };
  // Supplier is this mount's own picker; Mode of Payment / Account are already mounted by
  // mountCheckDocWrite on the same fragment, and mountLinkPicker refuses to double-mount.
  if (payeeInput) {
    mountLinkPicker(
      payeeInput,
      "Supplier",
      async (value) => {
        markDirty();
        if (onPayeePicked) onPayeePicked(String(value || "").trim());
      },
      linkDeps,
    );
  }
  // Reference and memo already mark dirty through mountCheckDocWrite's listeners on the same inputs.
  if (amountInput) amountInput.addEventListener("input", markDirty);

  if (!createBtn) return;
  createBtn.addEventListener("click", async () => {
    if (!api || !api.createBlankPaymentEntry) {
      if (statusEl) statusEl.textContent = "Shell bridge unavailable.";
      return;
    }
    const party = payeeInput ? payeeInput.value.trim() : "";
    const amountValue = Number(amountInput ? amountInput.value : 0);
    const cashBankAccount = acctInput ? acctInput.value.trim() : "";
    // Checked here so the clerk is told which field is missing, rather than getting ERPNext's
    // own validation message back after a round trip.
    if (!party) {
      if (statusEl) statusEl.textContent = "Pick who this payment is to.";
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      if (statusEl) statusEl.textContent = "Enter an amount greater than zero.";
      return;
    }
    if (!cashBankAccount) {
      if (statusEl) statusEl.textContent = "Pick a Pay from account first.";
      return;
    }
    const intent = {
      party,
      amount: amountValue,
      payOn: dateEl ? (dateEl.textContent || "").trim() : "",
      modeOfPayment: mopInput ? mopInput.value.trim() : "",
      cashBankAccount,
      referenceNo: refInput ? refInput.value.trim() : "",
      memo: memoInput ? memoInput.value.trim() : "",
    };
    createBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Creating draft…";
    const result = await api.createBlankPaymentEntry(intent).catch((e) => ({
      ok: false,
      reason: String((e && e.message) || e),
    }));
    createBtn.disabled = false;
    if (!result || !result.ok) {
      if (statusEl) statusEl.textContent = (result && result.reason) || "Could not create the payment.";
      return;
    }
    if (statusEl) statusEl.textContent = `Created ${result.name || "draft"}.`;
    if (onDirty) onDirty(false);
    if (onCreated) onCreated(result);
  });
}
