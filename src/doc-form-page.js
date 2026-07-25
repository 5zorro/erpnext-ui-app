/**
 * Doc-form page controller (PO / Item Receipt) — imported by electron/doc-form.html.
 */

import {
  readPoHeader,
  readPoItemRows,
  sumPoLineQty,
  sumPoLineAmount,
  formatPoLineTotal,
  isDraftPoDoc,
} from "./po-map.js";
import {
  readReceiptHeader,
  readReceiptItemRows,
  sumReceiptLineQty,
  sumReceiptLineAmount,
  formatReceiptLineTotal,
  isDraftReceiptDoc,
} from "./receipt-map.js";
import { readBillTaxRows, billMoneyStack } from "./bill-map.js";
import {
  formatGroupedNumber,
  formatUsdAmountHtml,
  parseMoney,
} from "./money.js";
import {
  linkOptionLabel,
  withEmptySearchActions,
  isCreateSupplierLinkAction,
} from "./link-search.js";
import {
  initialLinkHighlightIndex,
  nextLinkHighlightIndex,
  resolveLinkPickIndex,
  linkPickerKeyAction,
  nextFieldAfterLinkPick,
} from "./link-picker-policy.js";
import { shouldOpenSourceModalAfterVendorPick } from "./bill-source-flow.js";
import {
  valuesMeaningfullyEqual,
  dirtyCompareKindForField,
  normalizeEditableText,
} from "./dirty-gate.js";
import {
  filterDateInputValue,
  isAllowedDateInputChar,
  parseDocDate,
  formatDocDateDisplay,
} from "./doc-date.js";
import {
  shouldOpenCommitGate,
  normalizeCommitGateChoice,
  commitGateAllowsAction,
  commitGateChoiceEnabled,
} from "./bill-toolbar.js";
import {
  billExpensesTaxOrientation,
  commitGateProgressLabel,
  commitGateSuccessLabel,
  nextAfterGate,
} from "./bill-action-flow.js";
import {
  listDocFormSaveBlockers,
  docGateTriggerLabel,
  docCommitGateSaveWarning,
  docCommitGateErpFailureView,
  commitGateSaveEnabled,
  reduceCommitGatePhase,
  linkDoctypeForDocField,
  focusTargetAfterDocSourceModal,
  splitHeaderColumns,
} from "./doc-action-flow.js";
import { mergeSaveBlockers } from "./erp-form-bridge.js";
import { isSelectableSourceItem } from "./source-modal.js";

const api = window.erpDoc;

/** @type {import("./doc-skin-registry.js").ReturnType<import("./doc-skin-registry.js").docFormUiPayload>} */
let ui = null;
let lastDoc = null;
/** @type {{ dateExpected?: string }} */
let scratch = {};
let painting = false;
let userEdited = false;
/** @type {import("./bill-action-flow.js").GateTrigger|null} */
let pendingGate = null;
/** @type {string[]} */
let metaBlockers = [];
let metaPreflightSeq = 0;
/** @type {WeakMap<HTMLElement, true>} */
const linkMounted = new WeakMap();
let sourceModalOpen = false;
/** @type {Record<string, HTMLInputElement|HTMLTextAreaElement>} */
const headerInputs = {};
/** @type {{ qtyIdx: number, amtIdx: number }} */
let totalsLayout = { qtyIdx: 2, amtIdx: 4 };

const el = {
  status: document.getElementById("status"),
  title: document.getElementById("doc-title"),
  itemsHead: document.getElementById("items-head-row"),
  items: document.getElementById("items-body"),
  lineTotals: document.getElementById("line-totals"),
  save: document.getElementById("btn-save"),
  submit: document.getElementById("btn-submit"),
  revert: document.getElementById("btn-revert"),
  find: document.getElementById("btn-find"),
  newDoc: document.getElementById("btn-new"),
  print: document.getElementById("btn-print"),
  dirtyPill: document.getElementById("dirty-pill"),
  commitGate: document.getElementById("commit-gate"),
  commitGateBackdrop: document.getElementById("commit-gate-backdrop"),
  commitGateTitle: document.getElementById("commit-gate-title"),
  commitGateValidation: document.getElementById("commit-gate-validation"),
  commitGateValidationTitle: document.getElementById("commit-gate-validation-title"),
  commitGateBlockers: document.getElementById("commit-gate-blockers"),
  commitGateHint: document.getElementById("commit-gate-hint"),
  addLine: document.getElementById("btn-add-line"),
  clearQty: null,
  attach: document.getElementById("btn-attach"),
  attachToolbar: document.getElementById("btn-attach-toolbar"),
  taxesBlock: document.getElementById("doc-taxes-block"),
  taxesBody: document.getElementById("taxes-body"),
  taxesAdd: document.getElementById("taxes-add"),
  taxAccount: document.getElementById("f-tax-account"),
  taxAmount: document.getElementById("f-tax-amount"),
  addTax: document.getElementById("btn-add-tax"),
  msItems: document.getElementById("ms-items"),
  msTaxes: document.getElementById("ms-taxes"),
  msGrand: document.getElementById("ms-grand"),
  msNote: document.getElementById("ms-note"),
  lineTabs: document.querySelector("[data-testid='doc-line-tabs']"),
  tabItems: document.getElementById("tab-items"),
  tabExpenses: document.getElementById("tab-expenses"),
  panelItems: document.getElementById("panel-items"),
  panelExpenses: document.getElementById("panel-expenses"),
  expenseNote: document.querySelector("[data-testid='doc-expense-note']"),
  memoBlock: document.getElementById("memo-block"),
  memo: document.getElementById("f-memo"),
  hint: document.getElementById("doc-hint"),
  selectSource: document.getElementById("btn-select-source"),
  headerLeft: document.getElementById("header-left"),
  headerRight: document.getElementById("header-right"),
};

function mapHelpers() {
  if (!ui) {
    return {
      readHeader: () => ({}),
      readItemRows: () => [],
      sumQty: () => 0,
      sumAmt: () => 0,
      formatTotal: (n) => String(n),
      isDraft: () => true,
    };
  }
  if (ui.profileId === "po") {
    return {
      readHeader: readPoHeader,
      readItemRows: readPoItemRows,
      sumQty: sumPoLineQty,
      sumAmt: sumPoLineAmount,
      formatTotal: formatPoLineTotal,
      isDraft: isDraftPoDoc,
    };
  }
  return {
    readHeader: readReceiptHeader,
    readItemRows: readReceiptItemRows,
    sumQty: sumReceiptLineQty,
    sumAmt: sumReceiptLineAmount,
    formatTotal: formatReceiptLineTotal,
    isDraft: isDraftReceiptDoc,
  };
}

function gateLabels() {
  return {
    leaving: (ui && ui.leavingLabel) || "leaving this document",
    find: (ui && ui.findLabel) || "Find…",
    new: (ui && ui.newLabel) || "New",
    print: "Print",
  };
}

function docTitle() {
  return (ui && ui.title) || "Document";
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugLabel(label) {
  return String(label || "field")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function supplierInput() {
  return headerInputs["Vendor"] || headerInputs["Vendor Name"] || null;
}

function editable() {
  return mapHelpers().isDraft(lastDoc);
}

function setStatus(text, cls) {
  el.status.textContent = text;
  el.status.className = "status" + (cls ? " " + cls : "");
}

function paintDirtyPill() {
  if (!el.dirtyPill) return;
  el.dirtyPill.textContent = userEdited ? "Unsaved changes" : "All saved";
  el.dirtyPill.className = "dirty-pill" + (userEdited ? " is-dirty" : "");
}

function noteUserEdit() {
  userEdited = true;
  paintDirtyPill();
}

function currentSaveBlockers() {
  const sup = supplierInput();
  return mergeSaveBlockers(
    listDocFormSaveBlockers({
      doc: lastDoc,
      supplier: sup && sup.value,
    }),
    metaBlockers,
  );
}

function hideCommitGate() {
  pendingGate = null;
  if (el.commitGate) el.commitGate.hidden = true;
  setGateBusy(false);
}

function gateIsNewDoc() {
  return !!(
    lastDoc &&
    (lastDoc.__islocal ||
      !lastDoc.name ||
      String(lastDoc.name).startsWith("new") ||
      lastDoc.name === "new")
  );
}

function setGateBusy(busy) {
  if (!el.commitGate) return;
  const action = pendingGate && pendingGate.kind === "toolbar" ? pendingGate.action : "";
  const isNew = gateIsNewDoc();
  el.commitGate.querySelectorAll("[data-gate]").forEach((btn) => {
    const choice = btn.getAttribute("data-gate");
    if (busy) {
      btn.disabled = true;
      return;
    }
    if (!commitGateChoiceEnabled(action, choice, { isNew })) {
      btn.disabled = true;
      if (choice === "discard" && action === "print" && isNew) {
        btn.title = `Discarding a new ${docTitle()} leaves nothing to print — Save draft or Cancel.`;
      }
      return;
    }
    btn.title = "";
    if (choice === "save" || choice === "submit") {
      btn.disabled = !commitGateSaveEnabled(currentSaveBlockers());
    } else {
      btn.disabled = false;
    }
  });
}

function paintCommitGateValidation(opts = {}) {
  if (!el.commitGateHint) return;
  const blockers = Array.isArray(opts.blockers) ? opts.blockers.filter(Boolean) : [];
  const blocked = opts.blocked != null ? !!opts.blocked : blockers.length > 0;
  const title = docTitle();
  if (el.commitGateValidation) {
    el.commitGateValidation.className =
      "commit-gate-validation " + (blocked ? "blocked" : "ready");
  }
  if (el.commitGateValidationTitle) {
    el.commitGateValidationTitle.textContent =
      opts.title ||
      (blocked ? "Save is blocked by:" : `${title} + live ERP meta preflight passed`);
  }
  if (el.commitGateBlockers) {
    el.commitGateBlockers.replaceChildren(
      ...blockers.map((blocker) => {
        const item = document.createElement("li");
        item.textContent = blocker;
        return item;
      }),
    );
    el.commitGateBlockers.hidden = blockers.length === 0;
  }
  el.commitGateHint.textContent =
    opts.hint ||
    (blocked
      ? `Choose Cancel to return to the ${title} and fix these fields.`
      : docCommitGateSaveWarning(blockers, title));
  el.commitGateHint.className = "hint" + (blocked ? " warn" : "");
}

function refreshCommitGateHint() {
  const blockers = currentSaveBlockers();
  const title = docTitle();
  paintCommitGateValidation({
    blockers,
    blocked: blockers.length > 0,
    title: blockers.length ? "Save is blocked by:" : `${title} + live ERP meta preflight passed`,
    hint: blockers.length
      ? `Choose Cancel to return to the ${title} and fix these fields.`
      : docCommitGateSaveWarning(blockers, title),
  });
  setGateBusy(false);
}

function openGate(trigger) {
  if (
    pendingGate &&
    pendingGate.kind === "nav" &&
    pendingGate.navToken &&
    !(trigger && trigger.kind === "nav" && trigger.navToken === pendingGate.navToken) &&
    api &&
    api.resolveNavGate
  ) {
    api.resolveNavGate(pendingGate.navToken, false);
  }
  pendingGate = trigger;
  if (el.commitGateTitle) {
    el.commitGateTitle.textContent = `Unsaved changes — before ${docGateTriggerLabel(trigger, gateLabels())}`;
  }
  refreshCommitGateHint();
  if (el.commitGate) el.commitGate.hidden = false;
  if (api && api.focusSurface) api.focusSurface();
  requestAnimationFrame(() => {
    const cancel = el.commitGate && el.commitGate.querySelector("[data-gate='cancel']");
    if (cancel) cancel.focus();
  });
  void refreshMetaPreflight();
}

function cancelCommitGateFromOutside() {
  if (!el.commitGate || el.commitGate.hidden) return;
  const cancel = el.commitGate.querySelector("[data-gate='cancel']");
  if (cancel && !cancel.disabled) resolveCommitGate("cancel");
}

async function refreshMetaPreflight() {
  if (!api || !api.listMandatory) return;
  const seq = ++metaPreflightSeq;
  try {
    await flushDateExpectedFromInput();
    const res = await api.listMandatory();
    if (seq !== metaPreflightSeq) return;
    metaBlockers = res && Array.isArray(res.blockers) ? res.blockers : [];
    if (res && res.doc) {
      paint(res.doc, (res.scratch || scratch));
    }
  } catch {
    if (seq !== metaPreflightSeq) return;
    metaBlockers = [];
  }
  if (pendingGate && el.commitGate && !el.commitGate.hidden) {
    refreshCommitGateHint();
  }
}

async function runPendingAction(action) {
  if (!api) return;
  if (action === "find") {
    setStatus(`Opening ${docTitle()} list…`);
    const res = await api.findDocs();
    if (!(res && res.ok)) setStatus((res && res.reason) || "Find failed.", "err");
    else setStatus(`${docTitle()} list opened.`);
    return;
  }
  if (action === "new") {
    setStatus(`Starting new ${docTitle()}…`);
    const res = await api.newDoc();
    if (res && res.ok) setStatus(`New ${docTitle()}.`);
    else setStatus((res && res.reason) || "New failed.", "err");
    return;
  }
  if (action === "print") {
    setStatus("Opening print…");
    const res = await api.printDoc();
    if (res && res.ok) setStatus(res.reason || "Print opened.");
    else setStatus((res && res.reason) || "Print failed.", "err");
  }
}

async function requestToolbarAction(action) {
  if (!api) return;
  if (!shouldOpenCommitGate(userEdited)) {
    hideCommitGate();
    await runPendingAction(action);
    return;
  }
  openGate({ kind: "toolbar", action });
}

async function resolveCommitGate(choiceRaw) {
  const choice = normalizeCommitGateChoice(choiceRaw);
  const trigger = pendingGate;
  const navToken = trigger && trigger.kind === "nav" ? trigger.navToken : null;

  if (!trigger || !choice || choice === "cancel") {
    hideCommitGate();
    if (navToken && api && api.resolveNavGate) api.resolveNavGate(navToken, false);
    return;
  }

  if (trigger.kind === "toolbar") {
    const isNew = gateIsNewDoc();
    const allow = commitGateAllowsAction(trigger.action, choice, { isNew });
    if (!allow.ok) {
      setStatus(allow.reason || "Cannot continue.", "warn");
      return;
    }
  }

  const plan = nextAfterGate(trigger, choice);
  if (plan.then === "close") {
    hideCommitGate();
    if (navToken && api && api.resolveNavGate) api.resolveNavGate(navToken, false);
    return;
  }

  if (choice === "discard") {
    setGateBusy(true);
    setStatus("Discarding unsaved changes…");
    const res = await api.revertUnsaved();
    if (!(res && res.ok)) {
      setStatus((res && res.reason) || "Discard failed.", "err");
      setGateBusy(false);
      return;
    }
    userEdited = false;
    paint(res.doc, res.scratch || {});
    paintDirtyPill();
  } else if (choice === "save" || choice === "submit") {
    const blockers = currentSaveBlockers();
    if (!commitGateSaveEnabled(blockers)) {
      refreshCommitGateHint();
      setStatus(blockers[0] || "Fix save prerequisites first.", "warn");
      return;
    }
    reduceCommitGatePhase("idle", { type: "start-save", choice });
    setGateBusy(true);
    const saveRes = await doSave(choice === "submit");
    if (!(saveRes && saveRes.ok)) {
      const reason = (saveRes && saveRes.reason) || "Save failed.";
      reduceCommitGatePhase("saving", { type: "error", reason });
      setGateBusy(false);
      if (saveRes && Array.isArray(saveRes.blockers) && saveRes.blockers.length) {
        metaBlockers = saveRes.blockers;
        paintCommitGateValidation({
          blockers: mergeSaveBlockers(
            listDocFormSaveBlockers({
              doc: lastDoc,
              supplier: supplierInput() && supplierInput().value,
            }),
            saveRes.blockers,
          ),
          blocked: true,
          title: "Save is blocked by:",
          hint: `Choose Cancel to return to the ${docTitle()} and fix these fields.`,
        });
      } else {
        paintCommitGateValidation(docCommitGateErpFailureView(reason, docTitle()));
      }
      return;
    }
  }

  hideCommitGate();
  if (plan.then === "proceed-nav") {
    if (navToken && api && api.resolveNavGate) api.resolveNavGate(navToken, true);
  } else {
    await runPendingAction(trigger.action);
  }
}

function mountLinkPicker(input, doctype, onPicked) {
  if (!input || linkMounted.get(input)) return;
  linkMounted.set(input, true);
  const wrap = document.createElement("div");
  wrap.className = "link-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "link-btn";
  btn.textContent = "▾";
  btn.title = `Search ${doctype}`;
  btn.tabIndex = -1;
  wrap.appendChild(btn);
  const dd = document.createElement("div");
  dd.className = "link-dd";
  dd.hidden = true;
  wrap.appendChild(dd);

  let timer = null;
  /** @type {HTMLButtonElement[]} */
  let opts = [];
  let hi = -1;

  function setHi(i) {
    opts.forEach((b) => b.classList.remove("active"));
    hi = i;
    if (hi >= 0 && opts[hi]) opts[hi].classList.add("active");
  }

  async function pickValue(v) {
    if (isCreateSupplierLinkAction(v)) {
      dd.hidden = true;
      hi = -1;
      if (api && api.openVendorAdd) {
        setStatus("Opening Vendor add in Vanilla…");
        api.openVendorAdd();
      } else {
        setStatus("Vendor add API missing — restart the shell.", "err");
      }
      return;
    }
    input.value = v;
    dd.hidden = true;
    hi = -1;
    await onPicked(v);
  }

  async function runSearch(q) {
    if (!api || !api.searchLink) {
      dd.hidden = false;
      dd.innerHTML = `<div class="link-muted">Search API missing — restart the shell.</div>`;
      return;
    }
    dd.hidden = false;
    dd.innerHTML = `<div class="link-muted">Searching ${escapeHtml(doctype)}…</div>`;
    const res = await api.searchLink(doctype, q || "");
    if (!res || !res.ok) {
      dd.innerHTML = `<div class="link-muted">${escapeHtml((res && res.reason) || "Search failed — is Vanilla logged in?")}</div>`;
      opts = [];
      return;
    }
    const rows = withEmptySearchActions(res.results || [], doctype);
    if (!rows.length) {
      dd.innerHTML = `<div class="link-muted">No matches${q ? ` for “${escapeHtml(q)}”` : ""}</div>`;
      opts = [];
      return;
    }
    dd.innerHTML = rows
      .map(
        (o) =>
          `<button type="button" class="link-opt${isCreateSupplierLinkAction(o) ? " link-action" : ""}" tabindex="-1" data-value="${escapeHtml(o.value)}">${escapeHtml(linkOptionLabel(o))}</button>`,
      )
      .join("");
    opts = [...dd.querySelectorAll(".link-opt")];
    hi = initialLinkHighlightIndex(opts.length);
    if (hi === 0) opts[0].classList.add("active");
    opts.forEach((b) => {
      b.onclick = async () => pickValue(b.getAttribute("data-value") || "");
    });
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(input.value), 280);
  });
  input.addEventListener("keydown", async (ev) => {
    const act = linkPickerKeyAction(ev.key, {
      dropdownOpen: !dd.hidden,
      optionCount: opts.length,
    });
    if (act === "close") {
      dd.hidden = true;
      hi = -1;
      return;
    }
    if (act === "search") {
      ev.preventDefault();
      await runSearch(input.value || "");
      return;
    }
    if (act === "none") return;
    if (act === "pick") {
      ev.preventDefault();
      const idx = resolveLinkPickIndex(hi, opts.length);
      const pick = idx >= 0 ? opts[idx] : null;
      if (pick) await pickValue(pick.getAttribute("data-value") || "");
      else {
        dd.hidden = true;
        hi = -1;
      }
      return;
    }
    if (act === "move_down") {
      ev.preventDefault();
      setHi(nextLinkHighlightIndex(hi, opts.length, "down"));
    }
    if (act === "move_up") {
      ev.preventDefault();
      setHi(nextLinkHighlightIndex(hi, opts.length, "up"));
    }
  });
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    runSearch(input.value || "");
  });
  document.addEventListener("click", (ev) => {
    if (!wrap.contains(/** @type {Node} */ (ev.target))) dd.hidden = true;
  });
}

function focusItemCell(rowIndex, field) {
  const tryFocus = () => {
    const inp = el.items.querySelector(`input[data-row="${rowIndex}"][data-field="${field}"]`);
    if (!inp) return false;
    try {
      inp.focus({ preventScroll: false });
      if (typeof inp.select === "function") inp.select();
    } catch {
      try {
        inp.focus();
      } catch {
        /* ignore */
      }
    }
    return true;
  };
  if (tryFocus()) return;
  requestAnimationFrame(() => {
    tryFocus();
    setTimeout(tryFocus, 50);
  });
}

function focusHeaderField(fieldName) {
  if (!fieldName) return;
  const inp = document.querySelector(`[data-field="${fieldName}"]`);
  if (!inp) return;
  try {
    inp.focus({ preventScroll: false });
    if (typeof inp.select === "function") inp.select();
  } catch {
    try {
      inp.focus();
    } catch {
      /* ignore */
    }
  }
}

function buildLineTotalsFoot(cols) {
  if (!el.lineTotals) return;
  const qtyIdx = cols.findIndex((c) => c.field === "qty");
  const amtIdx = cols.findIndex(
    (c) => c.displayOnly || (c.label && /amount/i.test(c.label)),
  );
  totalsLayout = {
    qtyIdx: qtyIdx >= 0 ? qtyIdx : 2,
    amtIdx: amtIdx >= 0 ? amtIdx : Math.max(0, cols.length - 2),
  };
  const cells = [];
  for (let i = 0; i < cols.length + 1; i++) {
    if (i === totalsLayout.qtyIdx) {
      cells.push(`<td class="tot-cell">
        <span class="tot-label">Σ Qty</span><b id="tot-qty">0</b>
        <button type="button" class="clear-qty" id="btn-clear-qty" data-testid="doc-clear-qty"
          title="Set every line quantity to 0 (packing-slip hash check). Descriptions and costs stay.">Clear all qty</button>
      </td>`);
    } else if (i === totalsLayout.amtIdx) {
      cells.push(
        `<td class="tot-cell"><span class="tot-label">Item subtotal</span><b id="tot-amt">0.00</b></td>`,
      );
    } else {
      cells.push("<td></td>");
    }
  }
  el.lineTotals.innerHTML = `<tr>${cells.join("")}</tr>`;
  el.clearQty = document.getElementById("btn-clear-qty");
  if (el.clearQty) {
    el.clearQty.onclick = async () => {
      if (!api || !editable()) return;
      setStatus("Clearing all quantities…");
      const res = await api.clearAllQty();
      if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, scratch);
        setStatus("All line quantities set to 0.");
      } else {
        setStatus((res && res.reason) || "Clear qty failed.", "err");
      }
    };
  }
}

function paintLineTotals(doc) {
  if (!el.lineTotals || !ui || !ui.features.lineTotals) return;
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const totQty = document.getElementById("tot-qty");
  const totAmt = document.getElementById("tot-amt");
  if (!items.length) {
    el.lineTotals.hidden = true;
    return;
  }
  el.lineTotals.hidden = false;
  const helpers = mapHelpers();
  if (totQty) totQty.textContent = helpers.formatTotal(helpers.sumQty(doc));
  if (totAmt) {
    totAmt.innerHTML =
      formatUsdAmountHtml(helpers.sumAmt(doc)) || helpers.formatTotal(helpers.sumAmt(doc));
  }
}

function paintMoneyStack(doc) {
  if (!ui || !ui.features.taxes) return;
  const stack = billMoneyStack(doc);
  const fmt = (n) => formatUsdAmountHtml(n) || "$0.00";
  if (el.msItems) el.msItems.innerHTML = fmt(stack.itemSubtotal);
  if (el.msTaxes) el.msTaxes.innerHTML = fmt(stack.taxesTotal);
  if (el.msGrand) {
    el.msGrand.innerHTML = stack.grandTotal != null ? fmt(stack.grandTotal) : "—";
  }
  if (el.msNote) {
    if (stack.note) {
      el.msNote.hidden = false;
      el.msNote.textContent = stack.note;
    } else {
      el.msNote.hidden = true;
      el.msNote.textContent = "";
    }
  }
}

function paintTaxes(doc) {
  if (!el.taxesBody || !ui || !ui.features.taxes) return;
  const rows = readBillTaxRows(doc);
  const canEdit = editable();
  if (el.taxesAdd) el.taxesAdd.style.display = canEdit ? "" : "none";
  if (!rows.length) {
    el.taxesBody.innerHTML =
      `<tr><td colspan="7" class="link-muted">No tax/charge rows yet.</td></tr>`;
    paintMoneyStack(doc);
    return;
  }
  el.taxesBody.innerHTML = rows
    .map((r) => {
      if (!canEdit) {
        return `<tr>
          <td>${escapeHtml(r.account_head)}</td>
          <td>${escapeHtml(r.description)}</td>
          <td>${escapeHtml(r.charge_type)}</td>
          <td class="num">${escapeHtml(r.rate === "" ? "" : String(r.rate))}</td>
          <td class="num">${formatUsdAmountHtml(r.tax_amount) || escapeHtml(String(r.tax_amount ?? ""))}</td>
          <td>${escapeHtml(r.add_deduct_tax)}</td>
          <td></td>
        </tr>`;
      }
      const rateShown = r.rate === "" || r.rate == null ? "" : formatGroupedNumber(r.rate);
      const amtShown =
        r.tax_amount === "" || r.tax_amount == null ? "" : formatGroupedNumber(r.tax_amount);
      return `<tr data-taxidx="${r.idx}">
        <td><input type="text" data-tax-row="${r.idx}" data-tax-field="account_head" value="${escapeHtml(r.account_head)}" data-testid="doc-tax-${r.idx}-account" /></td>
        <td><input type="text" data-tax-row="${r.idx}" data-tax-field="description" value="${escapeHtml(r.description)}" data-testid="doc-tax-${r.idx}-desc" /></td>
        <td><span class="ro">${escapeHtml(r.charge_type)}</span></td>
        <td class="num"><input type="text" inputmode="decimal" class="money-cost" data-tax-row="${r.idx}" data-tax-field="rate" value="${escapeHtml(rateShown)}" data-testid="doc-tax-${r.idx}-rate" /></td>
        <td class="num"><input type="text" inputmode="decimal" class="money-cost" data-tax-row="${r.idx}" data-tax-field="tax_amount" value="${escapeHtml(amtShown)}" data-testid="doc-tax-${r.idx}-amount" /></td>
        <td>
          <select data-tax-row="${r.idx}" data-tax-field="add_deduct_tax" data-testid="doc-tax-${r.idx}-adddeduct">
            <option value="Add"${r.add_deduct_tax === "Add" ? " selected" : ""}>Add</option>
            <option value="Deduct"${r.add_deduct_tax === "Deduct" ? " selected" : ""}>Deduct</option>
          </select>
        </td>
        <td><button type="button" class="del" data-tax-del="${r.idx}" title="Remove tax row" data-testid="doc-tax-del-${r.idx}">×</button></td>
      </tr>`;
    })
    .join("");

  el.taxesBody.querySelectorAll("[data-tax-row]").forEach((inp) => {
    const field = inp.getAttribute("data-tax-field");
    const ri = Number(inp.getAttribute("data-tax-row"));
    const apply = async (value) => {
      if (!api || painting || !api.setTax) return;
      setStatus(`Updating tax ${field}…`);
      const res = await api.setTax(ri, field, value);
      if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, res.scratch || scratch);
        setStatus("Tax row updated.");
      } else {
        setStatus((res && res.reason) || "Tax update failed.", "err");
        await refresh();
      }
    };
    if (field === "account_head") {
      mountLinkPicker(inp, "Account", apply);
    }
    if (field === "rate" || field === "tax_amount") {
      inp.addEventListener("focus", () => {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = String(n);
      });
      inp.addEventListener("blur", () => {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = formatGroupedNumber(n);
      });
    }
    inp.addEventListener("change", async () => {
      if (!api || painting) return;
      const kind = dirtyCompareKindForField(field);
      let next = kind === "number" ? inp.value : normalizeEditableText(inp.value);
      if (field === "rate" || field === "tax_amount") {
        const n = parseMoney(inp.value);
        next = n == null ? "" : String(n);
        if (n != null) inp.value = formatGroupedNumber(n);
      }
      await apply(next);
    });
  });
  el.taxesBody.querySelectorAll("[data-tax-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!api || !api.deleteTax) return;
      const ri = Number(btn.getAttribute("data-tax-del"));
      setStatus("Removing tax row…");
      const res = await api.deleteTax(ri);
      if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, res.scratch || scratch);
        setStatus("Tax row removed.");
      } else {
        setStatus((res && res.reason) || "Delete tax failed.", "err");
      }
    });
  });
  paintMoneyStack(doc);
}

function paintItems(doc) {
  if (!ui) return;
  const cols = ui.itemCols;
  const rows = mapHelpers().readItemRows(doc);
  const canEdit = editable();
  el.items.innerHTML = rows
    .map((r, ri) => {
      const cells = cols
        .map((col, ci) => {
          const val = r[ci] ?? "";
          if (col.displayOnly || col.field == null) {
            const html = /amount|rec'd|received/i.test(col.label || "")
              ? formatUsdAmountHtml(val)
              : "";
            return `<td class="num"><span class="ro money-amt" data-testid="doc-amt-${ri}">${html || escapeHtml(val)}</span></td>`;
          }
          if (col.field === "rate") {
            const shown = val === "" || val == null ? "" : formatGroupedNumber(val);
            if (!canEdit) {
              return `<td class="num"><span class="ro money-cost">${escapeHtml(shown)}</span></td>`;
            }
            return `<td class="num"><input type="text" inputmode="decimal" class="money-cost" data-row="${ri}" data-field="rate" value="${escapeHtml(shown)}" data-testid="doc-cell-${ri}-rate" /></td>`;
          }
          if (col.type === "date" || col.field === "schedule_date") {
            const shown = formatDocDateDisplay(val) || val || "";
            if (!canEdit) {
              return `<td><span class="ro">${escapeHtml(shown)}</span></td>`;
            }
            return `<td><input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" data-row="${ri}" data-field="${col.field}" data-date="1" value="${escapeHtml(shown)}" data-testid="doc-cell-${ri}-${col.field}" autocomplete="off" /></td>`;
          }
          if (!canEdit) {
            return `<td><span class="ro">${escapeHtml(val)}</span></td>`;
          }
          const type = col.field === "qty" ? "number" : "text";
          const step = col.field === "qty" ? ' step="any"' : "";
          return `<td><input type="${type}"${step} data-row="${ri}" data-field="${col.field}" value="${escapeHtml(val)}" data-testid="doc-cell-${ri}-${col.field}" /></td>`;
        })
        .join("");
      const del = canEdit
        ? `<td><button type="button" class="del" data-del="${ri}" title="Remove line" data-testid="doc-del-${ri}">×</button></td>`
        : `<td></td>`;
      return `<tr data-rowidx="${ri}">${cells}${del}</tr>`;
    })
    .join("");

  paintLineTotals(doc);

  el.items.querySelectorAll("input[data-row]").forEach((inp) => {
    const field = inp.getAttribute("data-field");
    const ri = Number(inp.getAttribute("data-row"));
    const linkDt = linkDoctypeForDocField(field, ui.headerFields, ui.itemCols);
    const apply = async (value) => {
      if (!api || painting) return;
      setStatus(`Updating ${field}…`);
      const res = await api.setItem(ri, field, value);
      if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, res.scratch || scratch);
        setStatus("Line updated.");
        const nextField = nextFieldAfterLinkPick(field);
        if (nextField) focusItemCell(ri, nextField);
      } else {
        setStatus((res && res.reason) || "Line update failed.", "err");
        await refresh();
      }
    };
    if (linkDt) {
      mountLinkPicker(inp, linkDt, apply);
    }
    if (inp.dataset.date === "1") {
      wireDateField(inp);
    }
    if (field === "rate") {
      inp.addEventListener("focus", () => {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = String(n);
      });
      inp.addEventListener("blur", () => {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = formatGroupedNumber(n);
        else if (normalizeEditableText(inp.value) === "") inp.value = "";
      });
    }
    inp.addEventListener("change", async () => {
      if (!api || painting) return;
      const kind = dirtyCompareKindForField(field);
      let next = kind === "number" ? inp.value : normalizeEditableText(inp.value);
      if (field === "rate") {
        const n = parseMoney(inp.value);
        next = n == null ? "" : String(n);
        if (n != null) inp.value = formatGroupedNumber(n);
      }
      if (inp.dataset.date === "1") {
        const raw = filterDateInputValue(inp.value).trim();
        if (!raw) {
          inp.value = formatDocDateDisplay(
            (lastDoc && lastDoc.items && lastDoc.items[ri] && lastDoc.items[ri][field]) || "",
          );
          return;
        }
        const parsed = parseDocDate(raw);
        if (!parsed.ok) {
          setStatus(parsed.reason || "Invalid date — use MM/DD/YYYY", "warn");
          inp.value = formatDocDateDisplay(
            (lastDoc && lastDoc.items && lastDoc.items[ri] && lastDoc.items[ri][field]) || "",
          );
          return;
        }
        next = parsed.iso;
        inp.value = parsed.display;
      }
      const prev = (lastDoc && lastDoc.items && lastDoc.items[ri] && lastDoc.items[ri][field]) ?? "";
      if (valuesMeaningfullyEqual(prev, next, { kind })) {
        if (field === "rate" && parseMoney(prev) != null) {
          inp.value = formatGroupedNumber(prev);
        } else if (inp.dataset.date === "1") {
          inp.value = formatDocDateDisplay(prev) || "";
        } else if (kind !== "number") {
          inp.value = normalizeEditableText(String(prev ?? ""));
        }
        return;
      }
      await apply(next);
    });
  });
  el.items.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!api) return;
      const ri = Number(btn.getAttribute("data-del"));
      setStatus("Removing line…");
      const res = await api.deleteItem(ri);
      if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, res.scratch || scratch);
        setStatus("Line removed.");
      } else {
        setStatus((res && res.reason) || "Delete failed.", "err");
      }
    });
  });
}

function wireDateField(input) {
  input.addEventListener("beforeinput", (ev) => {
    if (ev.inputType && ev.inputType.startsWith("delete")) return;
    if (ev.inputType === "insertFromPaste" || ev.inputType === "insertFromDrop") return;
    if (ev.data && [...ev.data].some((c) => !isAllowedDateInputChar(c))) {
      ev.preventDefault();
    }
  });
  input.addEventListener("input", () => {
    const filtered = filterDateInputValue(input.value);
    if (filtered !== input.value) {
      const pos = input.selectionStart;
      input.value = filtered;
      try {
        input.setSelectionRange(pos - 1, pos - 1);
      } catch {
        /* ignore */
      }
    }
  });
  input.addEventListener("paste", (ev) => {
    ev.preventDefault();
    const text = filterDateInputValue(ev.clipboardData.getData("text") || "");
    document.execCommand("insertText", false, text);
  });
}

function buildHeaderFields(fields) {
  el.headerLeft.replaceChildren();
  el.headerRight.replaceChildren();
  Object.keys(headerInputs).forEach((k) => delete headerInputs[k]);

  const { left, right } = splitHeaderColumns(fields);
  const mountCol = (colEl, list) => {
    for (const meta of list) {
      const field = document.createElement("div");
      field.className = "field";
      const label = document.createElement("label");
      label.textContent = meta.label;
      field.appendChild(label);

      const isReadOnly = meta.readOnly || !meta.field;
      if (isReadOnly) {
        const input = document.createElement("input");
        input.id = `f-${slugLabel(meta.label)}`;
        input.readOnly = true;
        input.tabIndex = -1;
        input.dataset.testid = `doc-header-${slugLabel(meta.label)}`;
        if (meta.validationHint) input.title = meta.validationHint;
        field.appendChild(input);
        headerInputs[meta.label] = input;
      } else if (meta.type === "date") {
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.placeholder = "MM/DD/YYYY";
        input.autocomplete = "off";
        input.id = meta.scratch ? "f-date-expected" : `f-${meta.field}`;
        input.dataset.testid = meta.scratch ? "doc-date-expected" : `doc-${meta.field}`;
        if (meta.scratch) {
          input.dataset.scratch = "dateExpected";
        } else {
          input.dataset.field = meta.field;
        }
        field.appendChild(input);
        const hint = document.createElement("span");
        hint.className = "date-hint";
        hint.textContent =
          meta.validationHint ||
          "Digits and / - . only · Tab once to leave · MM/DD fills nearest year";
        field.appendChild(hint);
        wireDateField(input);
        input.addEventListener("change", () => onHeaderBlur(input));
        headerInputs[meta.label] = input;
      } else {
        const input = document.createElement("input");
        input.id = `f-${meta.field}`;
        input.dataset.field = meta.field;
        input.dataset.testid = `doc-${meta.field}`;
        input.autocomplete = "off";
        field.appendChild(input);
        input.addEventListener("change", () => onHeaderBlur(input));
        headerInputs[meta.label] = input;
      }
      colEl.appendChild(field);
    }
  };

  mountCol(el.headerLeft, left);
  mountCol(el.headerRight, right);
}

function ensureHeaderLinkPickers() {
  if (!ui) return;
  for (const meta of ui.headerFields) {
    if (!meta.field || meta.readOnly || meta.scratch) continue;
    const inp = headerInputs[meta.label];
    if (!inp || !meta.linkDoctype) continue;
    if (meta.field === "supplier") {
      mountLinkPicker(inp, meta.linkDoctype, async (v) => {
        if (!api) return;
        if (!editable()) {
          setStatus(`${docTitle()} is not a draft — cannot set vendor.`, "warn");
          return;
        }
        const decision =
          ui.features.sourceModal &&
          shouldOpenSourceModalAfterVendorPick({
            trigger: "link_pick",
            hasSupplier: !!normalizeEditableText(v),
            editable: true,
            modalAlreadyOpen: sourceModalOpen,
          });
        setStatus("Setting vendor…");
        const modalPromise =
          decision && decision.open
            ? openSourcePicker(v)
            : Promise.resolve();
        const res = await api.setHeader("supplier", v);
        if (res && res.ok) {
          noteUserEdit();
          paint(res.doc || lastDoc, res.scratch || scratch);
          if (decision && decision.open) setStatus("Choose a source (or NIC).");
        } else {
          setStatus((res && res.reason) || "Vendor update failed.", "err");
        }
        await modalPromise;
      });
    } else {
      mountLinkPicker(inp, meta.linkDoctype, async (v) => {
        if (!api || !editable()) return;
        const res = await api.setHeader(meta.field, v);
        if (res && res.ok && !res.skipped) noteUserEdit();
        await refresh();
      });
    }
  }
}

async function openSourcePicker(supplier) {
  if (!api || !api.listSources || !ui || !ui.features.sourceModal) {
    setStatus("Source picker API missing — restart the shell.", "err");
    return;
  }
  if (sourceModalOpen) return;
  if (!editable()) {
    setStatus(`${docTitle()} is not a draft — source picker locked.`, "warn");
    return;
  }
  const supInp = supplierInput();
  const sup =
    normalizeEditableText(supplier) ||
    normalizeEditableText(lastDoc && lastDoc.supplier) ||
    normalizeEditableText(supInp && supInp.value);
  if (!sup) {
    setStatus(`Pick a vendor before ${ui.sourceLabel || "Select PO"}.`, "warn");
    return;
  }
  setStatus("Loading open Purchase Orders…");
  const res = await api.listSources(sup);
  if (!res || !res.ok) {
    setStatus((res && res.reason) || "Could not load sources.", "err");
    return;
  }
  const groups = res.groups || [];
  setStatus(`Sources loaded (${groups.length} groups) — pick one.`);
  showSourceModal(groups, async (it) => {
    if (!it || it.kind === "nic") {
      setStatus("No source — enter lines manually.");
      const focusField = focusTargetAfterDocSourceModal(ui.profileId, "choose");
      if (focusField) focusHeaderField(focusField);
      return;
    }
    setStatus(`Pulling from ${it.name}…`);
    const merged = await api.mergeSource(it.kind, it.name);
    if (merged && merged.ok) {
      noteUserEdit();
      paint(merged.doc, merged.scratch || scratch);
      setStatus(`Pulled from ${it.name}.`);
    } else {
      setStatus((merged && merged.reason) || "Could not pull source.", "err");
      await refresh();
    }
    const focusField = focusTargetAfterDocSourceModal(ui.profileId, "choose");
    if (focusField) focusHeaderField(focusField);
  });
}

function showSourceModal(groups, onChoose) {
  if (sourceModalOpen) return;
  sourceModalOpen = true;
  let gi = 0;
  let ii = 0;
  const back = document.createElement("div");
  back.className = "src-back";
  back.dataset.testid = "doc-source-modal";
  const box = document.createElement("div");
  box.className = "src-box";
  box.tabIndex = -1;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Source Selection");
  box.innerHTML = `<div class="src-title">Source Selection — Tab: group · ↑/↓: item · Enter: select</div>
    <div class="src-body"></div>
    <div class="src-foot">
      <button type="button" class="primary" data-act="pick">Select this source</button>
      <button type="button" data-act="cancel">Cancel</button>
    </div>`;
  back.appendChild(box);
  document.body.appendChild(back);
  const body = box.querySelector(".src-body");
  const pickBtn = box.querySelector('[data-act="pick"]');

  function activeItem() {
    return groups[gi] && groups[gi].items[ii];
  }

  function draw() {
    body.innerHTML = "";
    groups.forEach((g, ggi) => {
      const h = document.createElement("div");
      h.className = "src-group" + (ggi === gi ? " active" : "");
      h.textContent = g.name;
      body.appendChild(h);
      g.items.forEach((it, iii) => {
        const r = document.createElement("button");
        r.type = "button";
        r.className =
          "src-item" +
          (ggi === gi && iii === ii ? " active" : "") +
          (it.draft ? " draft" : "");
        r.textContent = it.label;
        r.onclick = () => {
          if (it.draft) return;
          gi = ggi;
          ii = iii;
          draw();
        };
        r.ondblclick = () => {
          if (!it.draft) choose();
        };
        body.appendChild(r);
      });
    });
    const a = body.querySelector(".src-item.active");
    if (a && a.scrollIntoView) a.scrollIntoView({ block: "nearest" });
  }

  function close() {
    sourceModalOpen = false;
    document.removeEventListener("keydown", onKey, true);
    if (back.parentNode) back.parentNode.removeChild(back);
  }

  async function choose() {
    const it = activeItem();
    if (!isSelectableSourceItem(it)) return;
    close();
    await onChoose(it);
  }

  function onKey(ev) {
    if (ev.key === "Tab") {
      ev.preventDefault();
      gi = (gi + (ev.shiftKey ? groups.length - 1 : 1)) % groups.length;
      ii = 0;
      draw();
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      const items = groups[gi].items;
      do {
        ii = Math.min(items.length - 1, ii + 1);
      } while (ii < items.length - 1 && items[ii].draft);
      draw();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      do {
        ii = Math.max(0, ii - 1);
      } while (ii > 0 && groups[gi].items[ii].draft);
      draw();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      choose();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  }

  document.addEventListener("keydown", onKey, true);
  pickBtn.onclick = () => choose();
  box.querySelector('[data-act="cancel"]').onclick = () => close();
  back.addEventListener("click", (ev) => {
    if (ev.target === back) close();
  });
  draw();

  try {
    if (api && api.focusSurface) api.focusSurface();
  } catch {
    /* ignore */
  }
  const focusModal = () => {
    try {
      pickBtn.focus();
    } catch {
      try {
        box.focus();
      } catch {
        /* ignore */
      }
    }
  };
  focusModal();
  setTimeout(focusModal, 30);
  setStatus("Choose a source (or NIC).");
}

function setFormBlocked(blocked, reason) {
  document.body.classList.toggle("blocked", !!blocked);
  const retry = document.getElementById("btn-retry");
  if (retry) retry.hidden = !blocked;
  if (blocked && reason) setStatus(reason, "warn");
}

function focusVendorField() {
  const v = supplierInput();
  if (!v) return;
  const tryFocus = () => {
    try {
      v.focus({ preventScroll: false });
      v.select();
    } catch {
      try {
        v.focus();
      } catch {
        /* ignore */
      }
    }
  };
  tryFocus();
  requestAnimationFrame(tryFocus);
  setTimeout(tryFocus, 50);
  setTimeout(tryFocus, 200);
}

function paintedHeaderValue(field) {
  if (!lastDoc) return "";
  if (field === "remarks") return lastDoc.remarks ?? "";
  if (field === "supplier") return lastDoc.supplier_name || lastDoc.supplier || "";
  return lastDoc[field] != null ? lastDoc[field] : "";
}

function paintedScratchDateExpected() {
  return scratch.dateExpected != null ? String(scratch.dateExpected) : "";
}

function paint(doc, snapScratch, opts = {}) {
  painting = true;
  lastDoc = doc || null;
  scratch = snapScratch && typeof snapScratch === "object" ? { ...snapScratch } : {};
  if (opts.userEdited != null) userEdited = !!opts.userEdited;
  paintDirtyPill();

  if (!doc || !ui) {
    setFormBlocked(true, opts.reason || `No ${docTitle()} loaded in Vanilla yet.`);
    el.items.innerHTML = "";
    paintLineTotals(null);
    if (el.taxesBody) el.taxesBody.innerHTML = "";
    paintMoneyStack(null);
    el.addLine.disabled = true;
    if (el.clearQty) el.clearQty.disabled = true;
    if (el.attach) el.attach.disabled = true;
    if (el.addTax) el.addTax.disabled = true;
    painting = false;
    return;
  }

  setFormBlocked(false);
  const h = mapHelpers().readHeader(doc, scratch);
  for (const meta of ui.headerFields) {
    const inp = headerInputs[meta.label];
    if (!inp) continue;
    const val = h[meta.label] ?? "";
    if (meta.type === "date") {
      inp.value = formatDocDateDisplay(val) || val;
    } else {
      inp.value = val;
    }
  }

  if (ui.features.memo && el.memo && ui.memoField) {
    el.memo.value = h.Memo ?? lastDoc[ui.memoField] ?? "";
  }

  const canEdit = editable();
  for (const meta of ui.headerFields) {
    const inp = headerInputs[meta.label];
    if (!inp) continue;
    if (meta.readOnly || !meta.field) {
      inp.readOnly = true;
    } else if (meta.scratch) {
      inp.readOnly = !canEdit;
    } else {
      inp.readOnly = !canEdit;
    }
  }
  if (el.memo) el.memo.readOnly = !canEdit;

  el.addLine.disabled = !canEdit;
  if (el.clearQty) el.clearQty.disabled = !canEdit;
  if (el.attach) el.attach.disabled = !canEdit;
  if (el.addTax) el.addTax.disabled = !canEdit;

  paintItems(doc);
  paintTaxes(doc);
  ensureHeaderLinkPickers();

  const name = doc.name || "(new)";
  setStatus(`${name} · ${editable() ? "Draft" : "Posted"}`);
  painting = false;
  if (opts.focusVendor && canEdit) focusVendorField();
}

async function refresh() {
  if (!api) return;
  setStatus("Refreshing…");
  const snap = await api.getSnapshot();
  paint(snap && snap.doc, (snap && snap.scratch) || {}, {
    reason: snap && snap.reason,
    focusVendor: false,
    userEdited: snap && snap.userEdited,
  });
  if (snap && snap.ok === false) setStatus(snap.reason || "Waiting for ERP form…", "warn");
}

async function onHeaderBlur(input) {
  if (!api || painting || !editable()) return;

  if (input.dataset.scratch === "dateExpected") {
    const raw = filterDateInputValue(input.value).trim();
    if (!raw) {
      input.value = formatDocDateDisplay(paintedScratchDateExpected()) || "";
      return;
    }
    const parsed = parseDocDate(raw);
    if (!parsed.ok) {
      setStatus(parsed.reason || "Invalid date — use MM/DD/YYYY", "warn");
      input.value = formatDocDateDisplay(paintedScratchDateExpected()) || "";
      return;
    }
    input.value = parsed.display;
    if (valuesMeaningfullyEqual(paintedScratchDateExpected(), parsed.iso, { kind: "date" })) {
      return;
    }
    const res = await api.setDateExpected(parsed.iso);
    if (res && res.ok) {
      noteUserEdit();
      scratch = res.scratch || { dateExpected: parsed.iso };
      paint(res.doc || lastDoc, scratch);
    } else {
      setStatus((res && res.reason) || "Date Expected update failed.", "err");
      await refresh();
    }
    return;
  }

  const field = input.getAttribute("data-field");
  if (!field) return;

  if (input.dataset.field && (field.includes("date") || field === "transaction_date" || field === "posting_date")) {
    const raw = filterDateInputValue(input.value).trim();
    if (!raw) {
      input.value = formatDocDateDisplay(paintedHeaderValue(field)) || "";
      return;
    }
    const parsed = parseDocDate(raw);
    if (!parsed.ok) {
      setStatus(parsed.reason || "Invalid date — use MM/DD/YYYY", "warn");
      input.value = formatDocDateDisplay(paintedHeaderValue(field)) || "";
      return;
    }
    input.value = parsed.display;
    if (valuesMeaningfullyEqual(paintedHeaderValue(field), parsed.iso, { kind: "date" })) {
      return;
    }
    const res = await api.setHeader(field, parsed.iso);
    if (res && res.skipped) return;
    if (res && res.ok) noteUserEdit();
    await refresh();
    return;
  }

  const kind = dirtyCompareKindForField(field);
  const next = kind === "number" ? input.value : normalizeEditableText(input.value);
  const painted = paintedHeaderValue(field);
  if (valuesMeaningfullyEqual(painted, next, { kind })) {
    if (field === "supplier") input.value = String(painted ?? "");
    else if (kind !== "number") input.value = normalizeEditableText(String(painted ?? ""));
    return;
  }

  const res = await api.setHeader(field, next);

  if (field === "supplier" && ui && ui.features.sourceModal) {
    const decision = shouldOpenSourceModalAfterVendorPick({
      trigger: "blur",
      hasSupplier: !!normalizeEditableText(next),
      editable: editable(),
      modalAlreadyOpen: sourceModalOpen,
      setHeaderOk: !!(res && res.ok),
      setHeaderSkipped: !!(res && res.skipped),
    });
    if (decision.open) {
      if (res && res.ok) noteUserEdit();
      paint(res.doc || lastDoc, res.scratch || scratch);
      await openSourcePicker(next || (res && res.supplier));
      return;
    }
  }

  if (res && res.skipped) return;
  if (res && res.ok) noteUserEdit();
  await refresh();
}

async function flushDateExpectedFromInput() {
  if (!ui || !ui.features.dateExpected || !api || !api.setDateExpected) return;
  const inp = document.getElementById("f-date-expected");
  if (!inp) return;
  const raw = filterDateInputValue(inp.value).trim();
  if (!raw) return;
  const parsed = parseDocDate(raw);
  if (!parsed.ok) return;
  if (valuesMeaningfullyEqual(paintedScratchDateExpected(), parsed.iso, { kind: "date" })) {
    return;
  }
  const res = await api.setDateExpected(parsed.iso);
  if (res && res.ok) {
    scratch = res.scratch || { dateExpected: parsed.iso };
    if (res.doc) lastDoc = res.doc;
  }
}

async function doSave(submit) {
  if (!api) return { ok: false, reason: "Doc API unavailable." };
  await flushDateExpectedFromInput();
  if (api.listMandatory) {
    try {
      const res = await api.listMandatory();
      metaBlockers = res && Array.isArray(res.blockers) ? res.blockers : [];
      if (res && res.doc) {
        paint(res.doc, res.scratch || scratch);
      } else if (res && res.scratch) {
        scratch = res.scratch;
      }
    } catch {
      /* keep prior metaBlockers */
    }
  }
  const blockers = currentSaveBlockers();
  if (!commitGateSaveEnabled(blockers)) {
    setStatus(blockers[0] || "Fix save prerequisites first.", "err");
    return { ok: false, reason: blockers[0] || "Local save checks failed.", blockers };
  }
  const choice = submit ? "submit" : "save";
  setStatus(commitGateProgressLabel(choice));
  const r = await api.save({ submit: !!submit });
  if (r && r.ok) {
    userEdited = false;
    metaBlockers = [];
    paint(r.doc, r.scratch || scratch);
    paintDirtyPill();
    setStatus(commitGateSuccessLabel(choice));
    return { ok: true };
  }
  if (r && Array.isArray(r.blockers) && r.blockers.length) {
    metaBlockers = r.blockers;
  }
  const reason = (r && r.reason) || "Save failed — check Vanilla validations.";
  setStatus(reason, "err");
  return {
    ok: false,
    reason,
    blockers: r && Array.isArray(r.blockers) ? r.blockers : undefined,
  };
}

function setLineTab(which) {
  const expenses = which === "expenses";
  if (el.tabItems) {
    el.tabItems.classList.toggle("active", !expenses);
    el.tabItems.setAttribute("aria-selected", expenses ? "false" : "true");
  }
  if (el.tabExpenses) {
    el.tabExpenses.classList.toggle("active", expenses);
    el.tabExpenses.setAttribute("aria-selected", expenses ? "true" : "false");
  }
  if (el.panelItems) el.panelItems.hidden = expenses;
  if (el.panelExpenses) el.panelExpenses.hidden = !expenses;
}

function buildExpenseNote() {
  if (!el.expenseNote || !ui || !ui.features.expensesTab) return;
  const orient = billExpensesTaxOrientation();
  el.expenseNote.replaceChildren();
  const lead = document.createElement("span");
  lead.textContent =
    "This ERP is items-based — expense lines on Item Receipts are added in two ways:";
  const list = document.createElement("ol");
  const li1 = document.createElement("li");
  li1.append(
    document.createTextNode(
      "via an Item (Chart-of-Accounts-mapped items) added as a row to the items table that this is attached to (",
    ),
  );
  const jumpItems = document.createElement("a");
  jumpItems.href = "#";
  jumpItems.dataset.testid = "doc-jump-items";
  jumpItems.textContent = orient.itemsJumpLabel || "click here";
  jumpItems.addEventListener("click", (ev) => {
    ev.preventDefault();
    setLineTab("items");
  });
  li1.append(jumpItems, document.createTextNode(")."));
  const li2 = document.createElement("li");
  li2.append(document.createTextNode("via Vendor tax/freight in the "));
  const jumpTaxes = document.createElement("a");
  jumpTaxes.href = "#doc-taxes-block";
  jumpTaxes.dataset.testid = "doc-jump-taxes";
  jumpTaxes.textContent = "Taxes and Charges section below";
  jumpTaxes.addEventListener("click", (ev) => {
    ev.preventDefault();
    setLineTab("items");
    if (el.taxesBlock && typeof el.taxesBlock.scrollIntoView === "function") {
      el.taxesBlock.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  li2.append(jumpTaxes, document.createTextNode(" (related accounting)."));
  list.append(li1, li2);
  el.expenseNote.append(lead, list);
}

function applyUiConfig(config) {
  ui = config;
  if (!ui) return;

  document.title = ui.title;
  if (el.title) el.title.textContent = ui.title;
  if (el.find) el.find.textContent = ui.findLabel;
  if (el.newDoc) el.newDoc.textContent = ui.newLabel;
  if (el.hint) el.hint.textContent = ui.hint || "";

  const assumptionsUl = document.getElementById("assumptions-list");
  if (assumptionsUl && Array.isArray(ui.assumptions)) {
    assumptionsUl.innerHTML = ui.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  }

  buildHeaderFields(ui.headerFields);

  if (el.itemsHead) {
    el.itemsHead.innerHTML =
      ui.itemCols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("") + "<th></th>";
  }
  buildLineTotalsFoot(ui.itemCols);

  if (el.lineTabs) el.lineTabs.hidden = !ui.features.expensesTab;
  if (el.taxesBlock) el.taxesBlock.hidden = !ui.features.taxes;
  if (el.memoBlock) el.memoBlock.hidden = !ui.features.memo;
  if (el.selectSource) {
    el.selectSource.hidden = !ui.features.sourceModal;
    if (ui.sourceLabel) el.selectSource.textContent = ui.sourceLabel;
  }

  const attachTitle = ui.attachTitle || "Attach file";
  if (el.attach) {
    el.attach.textContent = ui.features.memo
      ? `Attach file to this ${ui.title.toLowerCase()}`
      : "Attach file";
    el.attach.title = attachTitle;
  }
  if (el.attachToolbar) {
    el.attachToolbar.hidden = !!ui.features.memo;
    el.attachToolbar.title = attachTitle;
  }

  if (ui.features.expensesTab) buildExpenseNote();
}

async function attachFileAction() {
  if (!api || !api.attachFile) {
    setStatus("Attach API missing — restart the shell.", "err");
    return;
  }
  setStatus("Opening attach…");
  const res = await api.attachFile();
  if (res && res.ok) {
    setStatus(res.reason || "Attach dialog opened in Vanilla.");
  } else {
    setStatus((res && res.reason) || "Could not open attach.", "err");
  }
}

function wireStaticControls() {
  document.getElementById("btn-refresh").onclick = () => refresh();
  document.getElementById("btn-vanilla").onclick = () => api && api.openVanilla();
  if (el.find) el.find.onclick = () => requestToolbarAction("find");
  if (el.newDoc) el.newDoc.onclick = () => requestToolbarAction("new");
  if (el.print) el.print.onclick = () => requestToolbarAction("print");

  if (el.commitGate) {
    el.commitGate.querySelectorAll("[data-gate]").forEach((btn) => {
      btn.addEventListener("click", () => resolveCommitGate(btn.getAttribute("data-gate")));
    });
    const onBackdrop = (ev) => {
      ev.preventDefault();
      cancelCommitGateFromOutside();
    };
    if (el.commitGateBackdrop) {
      el.commitGateBackdrop.addEventListener("mousedown", onBackdrop);
      el.commitGateBackdrop.addEventListener("click", onBackdrop);
    }
    el.commitGate.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        cancelCommitGateFromOutside();
      }
    });
  }

  if (el.tabItems) el.tabItems.onclick = () => setLineTab("items");
  if (el.tabExpenses) el.tabExpenses.onclick = () => setLineTab("expenses");

  if (el.revert) {
    el.revert.onclick = async () => {
      if (!api || !api.revertUnsaved) return;
      setStatus("Reverting unsaved changes…");
      const res = await api.revertUnsaved();
      if (res && res.ok) {
        userEdited = false;
        paint(res.doc, res.scratch || {});
        setStatus(
          res.isNew ? `Started a fresh new ${docTitle()}.` : `Reloaded last saved ${docTitle()}.`,
        );
      } else {
        setStatus((res && res.reason) || "Revert failed.", "err");
      }
    };
  }

  if (el.selectSource) {
    el.selectSource.onclick = () => {
      const supInp = supplierInput();
      const decision = shouldOpenSourceModalAfterVendorPick({
        trigger: "toolbar",
        hasSupplier: !!(
          normalizeEditableText(lastDoc && lastDoc.supplier) ||
          normalizeEditableText(supInp && supInp.value)
        ),
        editable: editable(),
        modalAlreadyOpen: sourceModalOpen,
      });
      if (!decision.open) {
        setStatus(
          decision.reason === "no_supplier"
            ? `Pick a vendor before ${ui && ui.sourceLabel ? ui.sourceLabel : "Select PO"}.`
            : `Source modal skipped (${decision.reason}).`,
          "warn",
        );
        return;
      }
      openSourcePicker();
    };
  }

  document.getElementById("btn-retry").onclick = async () => {
    if (!api || !api.retryLoad) return;
    setStatus(`Retrying Vanilla ${docTitle()} load…`);
    await api.retryLoad();
  };

  el.save.onclick = () => doSave(false);
  el.submit.onclick = () => doSave(true);

  if (el.taxAccount) {
    mountLinkPicker(el.taxAccount, "Account", async (v) => {
      el.taxAccount.value = v;
    });
  }
  if (el.addTax) {
    el.addTax.onclick = async () => {
      if (!api || !editable() || !api.addTax) return;
      const acct = normalizeEditableText(el.taxAccount && el.taxAccount.value);
      const n = parseMoney(el.taxAmount && el.taxAmount.value);
      if (!acct) {
        setStatus("Pick a tax/charge Account first.", "warn");
        return;
      }
      if (n == null) {
        setStatus("Enter a tax/charge Amount.", "warn");
        return;
      }
      setStatus("Adding tax/charge…");
      const res = await api.addTax(acct, n, "");
      if (res && res.ok) {
        if (el.taxAmount) el.taxAmount.value = "";
        noteUserEdit();
        paint(res.doc, res.scratch || scratch);
        setStatus("Tax/charge row added.");
      } else {
        setStatus((res && res.reason) || "Add tax failed.", "err");
      }
    };
  }

  el.addLine.onclick = async () => {
    if (!api || !editable()) return;
    setStatus("Adding line…");
    const res = await api.addItem();
    if (res && res.ok) {
      noteUserEdit();
      paint(res.doc, res.scratch || scratch);
      setStatus("Line added.");
    } else {
      setStatus((res && res.reason) || "Add line failed.", "err");
    }
  };

  if (el.attach) el.attach.onclick = () => attachFileAction();
  if (el.attachToolbar) el.attachToolbar.onclick = () => attachFileAction();

  if (el.memo) {
    el.memo.addEventListener("change", () => onHeaderBlur(el.memo));
  }
}

async function ensureUiConfig() {
  if (!api || !api.getUi) return false;
  const config = await api.getUi();
  if (!config) return false;
  if (!ui || ui.profileId !== config.profileId) {
    applyUiConfig(config);
  }
  return true;
}

async function boot() {
  if (!api) {
    setStatus("Doc API unavailable — preload missing.", "err");
    return;
  }
  wireStaticControls();

  setStatus("Ready — open a Purchase Order or Item Receipt.");
  // Profile is null until main sets activeDocSkin; apply on first snapshot / refresh.
  await ensureUiConfig();

  if (api.onSnapshot) {
    api.onSnapshot(async (snap) => {
      await ensureUiConfig();
      paint(snap && snap.doc, (snap && snap.scratch) || {}, {
        reason: snap && snap.reason,
        focusVendor: !!(snap && snap.focusVendor),
        userEdited: snap && snap.userEdited,
      });
    });
  }

  if (api.onOpenNavGate) {
    api.onOpenNavGate((payload) => {
      const token = payload && payload.token;
      if (!token) return;
      if (!shouldOpenCommitGate(userEdited)) {
        if (api.resolveNavGate) api.resolveNavGate(token, true);
        return;
      }
      openGate({
        kind: "nav",
        navToken: token,
        label: payload.label || (ui && ui.leavingLabel),
      });
    });
  }

  if (api.onCancelNavGate) {
    api.onCancelNavGate((token) => {
      if (pendingGate && pendingGate.kind === "nav" && pendingGate.navToken === token) {
        hideCommitGate();
      }
    });
  }

  // Don't refresh until a skin is active — getSnapshot would fail with no profile.
  if (ui) await refresh();
}

boot();
