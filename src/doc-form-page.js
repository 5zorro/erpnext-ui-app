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
  PO_MULTIPLE_DATES_LABEL,
  poDateExpectedHeaderDisplay,
  PO_CUSTOMER_DROPSHIP,
} from "./po-map.js";
import {
  readReceiptHeader,
  readReceiptItemRows,
  sumReceiptLineQty,
  sumReceiptLineAmount,
  formatReceiptLineTotal,
  isDraftReceiptDoc,
} from "./receipt-map.js";
import { billMoneyStack } from "./bill-map.js";
import {
  readBillTaxRowsForSort,
  sortBillTaxRows,
  DOC_TAX_SORTABLE_HEADERS,
} from "./bill-tax-sort.js";
import {
  formatGroupedNumber,
  formatUsdAmountHtml,
  parseMoney,
} from "./money.js";
import {
  nextItemFocusAfterEdit,
  itemNavFieldsFromCols,
} from "./link-picker-policy.js";
import {
  autoSizeItemColumns,
  mountColResize,
  mountDensityControl,
} from "./item-col-resize.js";
import {
  CELL_MODE_EDIT,
  CELL_MODE_NAV,
  itemTableKeyDecision,
  neighborItemCell,
  shouldLeaveItemTableBackward,
} from "./item-table-nav.js";
import {
  emptyItemRowCleanupAction,
  isEmptyItemCode,
  lastItemRowToast,
  shouldBlockDeleteLastItemRow,
} from "./bill-item-guard.js";
import { sortDocItemRowModels, sortableHeadersFromCols, applyHeaderSortClick, sortHeaderArrow, sortHeaderState } from "./doc-item-sort.js";
import { shouldOpenSourceModalAfterVendorPick, runVendorPickWithSourceModal } from "./doc-source-flow.js";
import {
  collectSourceRefsForProfile,
  sourceTermsDisplayBlocks,
} from "./doc-source-terms.js";
import { paintSourceTermsFields } from "./doc-source-terms-dom.js";
import { FREEFORM_TERMS_LABEL, ERP_FREEFORM_TERMS_FIELD } from "./doc-terms-fields.js";
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
} from "./bill-toolbar.js";
import {
  billExpensesTaxOrientation,
  commitGateProgressLabel,
  commitGateSuccessLabel,
  nextAfterGate,
  formatSaveFailureReason,
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
import { showSourceModal } from "./source-modal-ui.js";
import {
  runSourcePickerFlow,
  mayAutoOpenSourcePicker,
} from "./source-picker-flow.js";
import { mountLinkPicker } from "./link-picker-ui.js";
import { installFocusRing, logFocus } from "./focus-debug-client.js";
import { shouldRestoreFocusAnchor } from "./stale-focus-guard.js";
import {
  paintCommitGateValidation,
  setCommitGateBusy,
  commitGateTitleText,
  configureDirectSaveGateChrome,
  showCommitGate,
  hideCommitGateEl,
  wireCommitGateChrome,
} from "./doc-commit-gate-ui.js";
import {
  docLifecyclePill,
  focusFinalizeControl,
  flushPendingFieldEdits,
  isNewBlankDocName,
  REFRESH_BUTTON_TITLE,
} from "./doc-chrome.js";
import { createFieldCalcUi } from "./calc/attach-field-calc.js";
import { rateFromBackedInAmount } from "./calc/back-in-amount.js";
import { calcSourceLabel } from "./calc/session-history.js";
import { addressTextareaRows } from "./address-format.js";
import {
  applyDocWashToDocument,
  setWashSourceAttr,
} from "./doc-wash.js";
import { wireItemImportButton } from "./item-import-ui.js";
import { wireDocCapsUi } from "./doc-caps-ui.js";
import {
  addressRoleMeta,
  addressPickerOpenDecision,
} from "./doc-address.js";
import {
  showAddressPickerModal,
  updateAddressPickerModalRows,
  wireAddressPickerFields,
  syncAddressPickerLock,
} from "./address-picker-ui.js";
import { poFindPrefillFromDoc } from "./po-find-prefill.js";

/** @type {typeof window.erpDoc|null} */
let api = null;

/** @type {import("./doc-skin-registry.js").ReturnType<import("./doc-skin-registry.js").docFormUiPayload>} */
let ui = null;
let lastDoc = null;
/** @type {{ dateExpected?: string }} */
let scratch = {};
let painting = false;
let userEdited = false;
/** ALL-CAPS entry — default ON each doc open (OI-111); page toggle only. */
let docCapsOn = true;
/** @type {{ syncCapsButton: () => void }|null} */
let docCapsUi = null;
/** @type {Promise<void>|null} */
let lineApplyInFlight = null;
/** @type {boolean} */
let saveInFlight = false;
/** @type {import("./bill-action-flow.js").GateTrigger|null} */
let pendingGate = null;
/** @type {string[]} */
let metaBlockers = [];
let metaPreflightSeq = 0;
/** @type {WeakMap<HTMLElement, true>} */
const linkMounted = new WeakMap();
const sourceModalOpenRef = { current: false };
/** @type {{ supplier: string, userClosed: boolean } | null} */
let vendorPickSourceSession = null;
/** @type {Promise<{ ok?: boolean, kind?: string, reason?: string }|void>|null} */
let sourcePickerInflight = null;
/** @type {string} */
let sourcePickerInflightSupplier = "";
const addressPickerOpenRef = { current: false };
/** Suppress blur cleanup while Tab/arrow handlers are mid-flight. */
let itemTabGuard = false;
/** Excel-like: edit (caret in cell) vs nav (arrows move cells). */
let itemCellMode = CELL_MODE_EDIT;

/**
 * Mirror the cell mode onto the DOM so CSS can show which mode you are in.
 * `data-nav-focus` cannot serve here: it is deleted the moment focus lands
 * (it is a one-shot handoff to the focus handler), so nothing survives for a
 * stylesheet to match on.
 * @param {"edit"|"nav"} mode
 */
function setItemCellMode(mode) {
  itemCellMode = mode === CELL_MODE_NAV ? CELL_MODE_NAV : CELL_MODE_EDIT;
  try {
    if (el && el.items) el.items.dataset.cellMode = itemCellMode;
  } catch {
    /* mode mirroring is cosmetic; never let it break navigation */
  }
}

/** @type {{ key: string, asc: boolean }} */
/** @type {import("./item-sort-specs.js").SortSpec[]} */
let itemSortSpecs = [{ key: "lineNo", asc: true }];
let itemsHeadWired = false;
/** @type {import("./item-sort-specs.js").SortSpec[]} */
let taxSortSpecs = [{ key: "account_head", asc: true }];
let taxesHeadWired = false;
/** @type {Record<string, HTMLInputElement|HTMLTextAreaElement>} */
const headerInputs = {};
/** @type {{ qtyIdx: number, amtIdx: number }} */
let totalsLayout = { qtyIdx: 2, amtIdx: 4 };

const calcUi = createFieldCalcUi({
  overlay: document.getElementById("calc-overlay"),
  exprEl: document.getElementById("calc-expr"),
  resultEl: document.getElementById("calc-result"),
  historyEl: document.getElementById("calc-history"),
  getHistory: () => (api && api.getCalcHistory ? api.getCalcHistory() : Promise.resolve([])),
  copyHistory: (id, mode) =>
    api && api.copyCalcHistory ? api.copyCalcHistory(id, mode) : Promise.resolve({ ok: false }),
});

function publishCalcHistory(payload) {
  if (!api || !api.appendCalcHistory || !payload) return;
  const doctypeKey =
    (ui && ui.doctypeKey) ||
    (ui && ui.profileId === "po"
      ? "purchase-order"
      : ui && ui.profileId === "receipt"
        ? "purchase-receipt"
        : "");
  api.appendCalcHistory({
    ...payload,
    doctypeKey,
    sourceLabel: calcSourceLabel(doctypeKey),
  });
}

/** @type {ReturnType<typeof buildDocFormEl> | null} */
let el = null;

function buildDocFormEl() {
  return {
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
    commitGateCopy: document.getElementById("commit-gate-copy"),
    addLine: document.getElementById("btn-add-line"),
    importItems: document.getElementById("btn-import-items"),
    clearQty: null,
    attach: document.getElementById("btn-attach"),
    attachToolbar: document.getElementById("btn-attach-toolbar"),
    taxesBlock: document.getElementById("doc-taxes-block"),
    taxesHead: document.getElementById("taxes-head-row"),
    taxesBody: document.getElementById("taxes-body"),
    taxesAdd: document.getElementById("taxes-add"),
    taxAccount: document.getElementById("f-tax-account"),
    taxAmount: document.getElementById("f-tax-amount"),
    addTax: document.getElementById("btn-add-tax"),
    msItems: document.getElementById("ms-items"),
    msTaxes: document.getElementById("ms-taxes"),
    msGrand: document.getElementById("ms-grand"),
    msNote: document.getElementById("ms-note"),
    lineTabs: document.querySelector('[data-testid="doc-line-tabs"]'),
    linesSection: document.querySelector('[data-testid="doc-lines-section"]'),
    linesSectionTitle: document.getElementById("doc-lines-title"),
    tabItems: document.getElementById("tab-items"),
    tabExpenses: document.getElementById("tab-expenses"),
    panelItems: document.getElementById("panel-items"),
    panelExpenses: document.getElementById("panel-expenses"),
    expenseNote: document.querySelector('[data-testid="doc-expense-note"]'),
    notesSection: document.querySelector('[data-testid="doc-notes-section"]'),
    memoBlock: document.getElementById("memo-block"),
    memoLabel: document.getElementById("memo-label"),
    memoEntry: document.getElementById("memo-entry"),
    memo: document.getElementById("f-memo"),
    termsBlock: document.getElementById("terms-block"),
    termsText: document.getElementById("f-terms-text"),
    sourceTermsBlock: document.getElementById("source-terms-block"),
    sourceTermsFields: document.getElementById("source-terms-fields"),
    hint: document.getElementById("doc-hint"),
    selectSource: document.getElementById("btn-select-source"),
    caps: document.getElementById("btn-caps"),
    headerLeft: document.getElementById("header-left"),
    headerRight: document.getElementById("header-right"),
    headerAddresses: document.getElementById("header-addresses"),
    retry: document.getElementById("btn-retry"),
    refresh: document.getElementById("btn-refresh"),
    vanilla: document.getElementById("btn-vanilla"),
    backTop: document.getElementById("btn-back-top"),
    assumptionsList: document.getElementById("assumptions-list"),
  };
}

function commitGateEls() {
  if (!el) return {};
  return {
    commitGate: el.commitGate,
    commitGateBackdrop: el.commitGateBackdrop,
    commitGateTitle: el.commitGateTitle,
    commitGateValidation: el.commitGateValidation,
    commitGateValidationTitle: el.commitGateValidationTitle,
    commitGateBlockers: el.commitGateBlockers,
    commitGateHint: el.commitGateHint,
  };
}

function linkPickerDeps() {
  return { api, linkMounted, setStatus };
}

function mountDocLinkPicker(input, doctype, onPicked, pickOpts) {
  mountLinkPicker(input, doctype, onPicked, linkPickerDeps(), pickOpts);
}

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

async function paintSourceTerms(doc) {
  if (!ui?.features.sourceTerms || !el.sourceTermsBlock || !el.sourceTermsFields || !api?.fetchSourceTerms) {
    if (el.sourceTermsBlock) el.sourceTermsBlock.hidden = true;
    return;
  }
  const refs = collectSourceRefsForProfile(ui.profileId, doc);
  if (!refs.length) {
    el.sourceTermsBlock.hidden = true;
    el.sourceTermsFields.replaceChildren();
    return;
  }
  const res = await api.fetchSourceTerms(refs);
  const blocks = sourceTermsDisplayBlocks(refs, res && res.termsByKey, res && res.remarksByKey);
  if (!blocks.length) {
    el.sourceTermsBlock.hidden = true;
    el.sourceTermsFields.replaceChildren();
    return;
  }
  paintSourceTermsFields(el.sourceTermsFields, blocks);
  el.sourceTermsBlock.hidden = false;
}

function addressFieldPickable(meta) {
  if (!ui?.features.addressPicker || !meta?.addressRole) return false;
  const roleMeta = addressRoleMeta(ui.profileId, meta.addressRole);
  return !!(roleMeta?.pickable && roleMeta.linkField);
}

async function refreshShipToAddressPickerRows() {
  if (!api?.listAddresses) return;
  const res = await api.listAddresses("ship_to");
  if (!(res && res.ok)) return;
  updateAddressPickerModalRows(
    "doc-addr-modal",
    Array.isArray(res.rows) ? res.rows : [],
    res.current,
  );
  const clearCustBtn = document.querySelector("#doc-addr-modal [data-customer-clear]");
  if (clearCustBtn) {
    clearCustBtn.disabled = !(lastDoc && String(lastDoc.customer || "").trim());
  }
}

async function openDocAddressPicker(role) {
  if (!api || addressPickerOpenRef.current || !ui?.features.addressPicker) return;
  const decision = addressPickerOpenDecision(lastDoc, ui.profileId, role, {
    editable: editable(),
    lockedReason: `${docTitle()} is not a draft — addresses locked.`,
  });
  if (!decision.open) {
    setStatus(decision.reason || "Cannot pick address.", "warn");
    return;
  }
  if (!api.listAddresses) {
    setStatus("Address picker API missing — restart the shell.", "err");
    return;
  }
  setStatus("Loading addresses…");
  const res = await api.listAddresses(role);
  if (!(res && res.ok)) {
    setStatus((res && res.reason) || "Could not list addresses.", "err");
    return;
  }
  const meta = decision.meta || addressRoleMeta(ui.profileId, role);
  if (!meta) return;

  const poShipTo =
    ui.profileId === "po" && role === "ship_to"
      ? {
          label: PO_CUSTOMER_DROPSHIP.label,
          hint: PO_CUSTOMER_DROPSHIP.hint,
          value:
            (lastDoc && (lastDoc.customer_name || lastDoc.customer)) ||
            "",
          editable: editable(),
          mountPicker: (input) => {
            mountDocLinkPicker(input, PO_CUSTOMER_DROPSHIP.linkDoctype, async (v) => {
              if (!api || !editable()) return;
              setStatus("Setting drop-ship customer…");
              const resCust = await api.setHeader(PO_CUSTOMER_DROPSHIP.field, v);
              if (resCust && resCust.ok && !resCust.skipped) {
                noteUserEdit();
                paint(resCust.doc || lastDoc, resCust.scratch || scratch);
                input.value =
                  (resCust.doc && (resCust.doc.customer_name || resCust.doc.customer)) ||
                  v ||
                  "";
                input.dataset.linkCommitted = input.value;
                await refreshShipToAddressPickerRows();
                const clearCustBtn = document.querySelector("#doc-addr-modal [data-customer-clear]");
                if (clearCustBtn) clearCustBtn.disabled = false;
                setStatus("Customer set — pick ship-to address.");
              } else if (resCust && resCust.skipped) {
                input.value = input.dataset.linkCommitted || "";
              } else {
                setStatus((resCust && resCust.reason) || "Customer update failed.", "err");
              }
            });
          },
          onClear: async () => {
            if (!api || !editable()) return;
            const resClr = await api.setHeader(PO_CUSTOMER_DROPSHIP.field, "");
            if (resClr && resClr.ok && !resClr.skipped) {
              noteUserEdit();
              paint(resClr.doc || lastDoc, resClr.scratch || scratch);
              await refreshShipToAddressPickerRows();
              setStatus("Drop-ship customer cleared.");
            }
          },
          onCustomerChanged: refreshShipToAddressPickerRows,
        }
      : undefined;

  showAddressPickerModal({
    meta,
    rows: Array.isArray(res.rows) ? res.rows : [],
    current: res.current,
    testId: "doc-addr-modal",
    isOpenRef: addressPickerOpenRef,
    setStatus,
    focusSurface: () => api.focusSurface?.(),
    customerDropShip: poShipTo,
    onApply: async (linkField, addressName) => {
      if (!api || !linkField) return;
      setStatus(addressName ? "Setting address…" : "Clearing address…");
      const res2 = await api.setHeader(linkField, addressName || "");
      if (res2 && res2.ok) {
        noteUserEdit();
        paint(res2.doc || lastDoc, res2.scratch || scratch);
        setStatus(addressName ? "Address updated." : "Address cleared.");
      } else {
        setStatus((res2 && res2.reason) || "Address update failed.", "err");
      }
    },
  });
}

function wireDocAddressPickers() {
  if (!ui?.features.addressPicker || !api?.listAddresses) return;
  wireAddressPickerFields({
    nodes: document.querySelectorAll("[data-addr-role].addr-pick"),
    isEditable: editable,
    onOpen: (role) => {
      void openDocAddressPicker(role);
    },
    lockedMessage: `${docTitle()} is not a draft — addresses locked.`,
    setStatus,
  });
}

function syncDocAddressPickers(canEdit) {
  if (!ui?.features.addressPicker) return;
  syncAddressPickerLock(document.querySelectorAll("[data-addr-role].addr-pick"), canEdit);
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
  if (!lastDoc) {
    const loading = docLifecyclePill({ loading: true });
    el.dirtyPill.textContent = loading.text;
    el.dirtyPill.title = loading.title;
    el.dirtyPill.className = "dirty-pill tone-" + loading.tone;
    return;
  }
  const isDraft = mapHelpers().isDraft(lastDoc);
  const pill = docLifecyclePill({
    isDraft,
    userEdited,
    isNewBlank: isDraft && isNewBlankDocName(lastDoc && lastDoc.name),
  });
  el.dirtyPill.textContent = pill.text;
  el.dirtyPill.title = pill.title;
  el.dirtyPill.className = "dirty-pill tone-" + pill.tone + (userEdited ? " is-dirty" : "");
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
  configureDirectSaveGateChrome(commitGateEls(), { active: false, copyEl: el.commitGateCopy });
  hideCommitGateEl(commitGateEls());
  setGateBusy(false);
}

function gateToolbarAction() {
  if (!pendingGate) return "";
  if (pendingGate.kind === "toolbar") return pendingGate.action;
  if (pendingGate.kind === "direct-save") return "direct-save";
  return "";
}

function openDirectSaveBlockedGate(blockers, opts = {}) {
  pendingGate = { kind: "direct-save", submit: !!opts.submit };
  if (el.commitGateTitle) {
    el.commitGateTitle.textContent = opts.submit ? "Cannot submit yet" : "Cannot save yet";
  }
  configureDirectSaveGateChrome(commitGateEls(), {
    submit: !!opts.submit,
    active: true,
    copyEl: el.commitGateCopy,
  });
  const title = docTitle();
  if (opts.erpFailure) {
    paintCommitGateValidation(commitGateEls(), docCommitGateErpFailureView(opts.reason, title));
  } else {
    paintCommitGateValidation(commitGateEls(), {
      blockers,
      blocked: true,
      title: "Save is blocked by:",
      cancelHint: `Choose Cancel to return to the ${title} and fix these fields.`,
    });
  }
  setGateBusy(false);
  showCommitGate(commitGateEls(), {
    focusSurface: () => {
      if (api && api.focusSurface) api.focusSurface();
    },
  });
  void refreshMetaPreflight();
}

async function handleDirectSaveGateChoice(choice) {
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
      paintCommitGateValidation(commitGateEls(), {
        blockers: mergeSaveBlockers(
          listDocFormSaveBlockers({
            doc: lastDoc,
            supplier: supplierInput() && supplierInput().value,
          }),
          saveRes.blockers,
        ),
        blocked: true,
        title: "Save is blocked by:",
        cancelHint: `Choose Cancel to return to the ${docTitle()} and fix these fields.`,
      });
    } else {
      paintCommitGateValidation(
        commitGateEls(),
        docCommitGateErpFailureView(reason, docTitle()),
      );
    }
    return;
  }
  hideCommitGate();
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
  setCommitGateBusy(commitGateEls(), {
    busy,
    toolbarAction: gateToolbarAction(),
    isNewDoc: gateIsNewDoc(),
    docTitle: docTitle(),
    getSaveBlockers: currentSaveBlockers,
  });
}

function refreshCommitGateHint() {
  const blockers = currentSaveBlockers();
  const title = docTitle();
  paintCommitGateValidation(commitGateEls(), {
    blockers,
    blocked: blockers.length > 0,
    title: blockers.length ? "Save is blocked by:" : `${title} + live ERP meta preflight passed`,
    cancelHint: `Choose Cancel to return to the ${title} and fix these fields.`,
    saveWarning: () => docCommitGateSaveWarning(blockers, title),
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
    el.commitGateTitle.textContent = commitGateTitleText(
      docGateTriggerLabel(trigger, gateLabels()),
    );
  }
  refreshCommitGateHint();
  showCommitGate(commitGateEls(), {
    focusSurface: () => {
      if (api && api.focusSurface) api.focusSurface();
    },
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

function docFindPrefill() {
  if (!ui || ui.profileId !== "po" || !lastDoc) return {};
  return poFindPrefillFromDoc(lastDoc) || {};
}

async function runPendingAction(action) {
  if (!api) return;
  if (action === "find") {
    setStatus(`Opening ${docTitle()} list…`);
    const prefill = docFindPrefill();
    const res = await api.findDocs(prefill);
    try {
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
    } catch {
      /* ignore */
    }
    let post = null;
    if (res && res.ok && api.refocusListFilter) {
      try {
        post = await api.refocusListFilter(res.focusField || "name");
      } catch {
        /* ignore */
      }
    }
    if (!(res && res.ok)) setStatus((res && res.reason) || "Find failed.", "err");
    else if (res.focusOk === false || (post && post.ok === false)) {
      setStatus(res.reason || post?.reason || "List opened (filter focus missed).", "warn");
    } else setStatus(
      res.prefilled
        ? `${docTitle()} list opened — logbook PO# prefilled.`
        : `${docTitle()} list opened — type in PO# (logbook) or ID.`,
    );
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

  if (trigger.kind === "direct-save") {
    if (choice === "save" || choice === "submit") {
      await handleDirectSaveGateChoice(choice);
    }
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
        paintCommitGateValidation(commitGateEls(), {
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
        paintCommitGateValidation(commitGateEls(), docCommitGateErpFailureView(reason, docTitle()));
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

function focusItemCell(rowIndex, field, opts = {}) {
  const mode = opts.mode === CELL_MODE_NAV ? CELL_MODE_NAV : CELL_MODE_EDIT;
  setItemCellMode(mode);
  const wantSelect =
    opts.selectAll === true || (opts.selectAll !== false && mode === CELL_MODE_NAV);
  const tryFocus = () => {
    const inp = el.items.querySelector(`input[data-row="${rowIndex}"][data-field="${field}"]`);
    if (!inp) return false;
    try {
      if (mode === CELL_MODE_NAV) inp.dataset.navFocus = "1";
      inp.focus({ preventScroll: false });
      if (wantSelect && typeof inp.select === "function") inp.select();
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

function isItemLinkDropdownOpen(inp) {
  const wrap = inp && inp.closest ? inp.closest(".link-wrap") : null;
  if (!wrap) return false;
  const dd = wrap.querySelector(".link-dd");
  return !!(dd && !dd.hidden);
}

function showToast(text) {
  setStatus(text, "warn");
}

/**
 * Vanilla requires ≥1 item — seed a blank line when the grid is empty.
 * @param {object|null|undefined} doc
 */
async function ensureAtLeastOneItemRow(doc) {
  if (!api || !editable() || painting) return;
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  if (items.length > 0) return;
  const res = await api.addItem();
  if (res && res.ok) {
    noteUserEdit();
    paint(res.doc, res.scratch || scratch);
  }
}

/**
 * Remove blank Item rows when the clerk dismisses the picker / leaves the cell.
 * @param {number} rowIndex
 * @param {string} itemCode
 */
async function cleanupEmptyItemRow(rowIndex, itemCode) {
  if (!api || !editable() || painting || itemTabGuard) return;
  const rowCount = lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items.length : 0;
  const decision = emptyItemRowCleanupAction(rowCount, itemCode);
  if (decision.action !== "delete") return;
  setStatus("Removing empty line…");
  const removed = await api.deleteItem(rowIndex);
  if (removed && removed.ok) {
    noteUserEdit();
    paint(removed.doc, removed.scratch || scratch);
    setStatus("Empty line removed.");
    focusAfterLeavingItemsTable();
  } else if (removed && removed.blockedLastRow) {
    showToast(removed.reason || lastItemRowToast(docTitle()));
  }
}

function focusHeaderField(fieldName) {
  if (!fieldName) return;
  logFocus("focus-header", fieldName);
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

/**
 * After paint rebuilds inputs, put keyboard focus back where the clerk was headed
 * (fixes Tab-away from PO# logbook / header fields losing focus).
 * @returns {{ field: string|null, row: string|null, scratch: string|null }|null}
 */
function captureFocusAnchor() {
  const a = document.activeElement;
  if (!a || typeof a.getAttribute !== "function") return null;
  return {
    field: a.getAttribute("data-field"),
    row: a.getAttribute("data-row"),
    scratch: a.dataset ? a.dataset.scratch || null : null,
  };
}

/**
 * @param {{ field: string|null, row: string|null, scratch: string|null }|null|undefined} anchor
 */
function restoreFocusAnchor(anchor) {
  if (!anchor) return;
  if (!shouldRestoreFocusAnchor(anchor, document.activeElement)) {
    logFocus("restore-focus-anchor", "skip-user-moved");
    return;
  }
  logFocus("restore-focus-anchor", anchor.field || anchor.scratch || anchor.row || "");
  if (anchor.row != null && anchor.field) {
    focusItemCell(Number(anchor.row), anchor.field, { mode: CELL_MODE_NAV });
    return;
  }
  if (anchor.scratch === "dateExpected") {
    const inp = document.getElementById("f-date-expected");
    if (inp) {
      try {
        inp.focus({ preventScroll: false });
        if (typeof inp.select === "function") inp.select();
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (anchor.field) focusHeaderField(anchor.field);
}

/** Shift+Tab out of the items grid → last editable header (PO# logbook on PO). */
function focusLastHeaderBeforeItems() {
  const prefer = ["title", "lr_no", "transaction_date", "posting_date", "supplier"];
  for (const f of prefer) {
    const inp = document.querySelector(
      `input[data-field="${f}"]:not([readonly]), textarea[data-field="${f}"]:not([readonly])`,
    );
    if (inp && /** @type {HTMLElement} */ (inp).tabIndex !== -1) {
      focusHeaderField(f);
      return true;
    }
  }
  const labels = Object.keys(headerInputs);
  for (let i = labels.length - 1; i >= 0; i--) {
    const inp = headerInputs[labels[i]];
    if (!inp || inp.readOnly || inp.tabIndex === -1) continue;
    try {
      inp.focus({ preventScroll: false });
      if (typeof inp.select === "function") inp.select();
      return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Leave items grid — forward Tab exit lands on the next section (terms/memo), not header row 0. */
function focusAfterLeavingItemsTable() {
  if (el.addLine) el.addLine.tabIndex = -1;
  if (ui?.features?.termsField && el.termsText && !el.termsText.readOnly) {
    try {
      logFocus("focus-after-items", "terms");
      el.termsText.focus();
      return;
    } catch {
      /* ignore */
    }
  }
  if (ui?.features?.memo && el.memo && !el.memo.readOnly) {
    try {
      logFocus("focus-after-items", "memo");
      el.memo.focus();
      return;
    } catch {
      /* ignore */
    }
  }
  if (focusLastHeaderBeforeItems()) return;
  try {
    if (el.addTax && !el.addTax.disabled) {
      el.addTax.focus();
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  } catch {
    /* ignore */
  }
}

function rowItemCodeAt(doc, rowIndex) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const row = items[rowIndex];
  return row && row.item_code != null ? String(row.item_code).trim() : "";
}

/**
 * Packet T C — size the line grid from its content, then arm the drag handles.
 * Runs after every repaint because the header row is rebuilt each time; both
 * calls are idempotent. Keyed by profile so PO and Item Receipt keep their own
 * column widths.
 */
function itemsTableKey() {
  return `${(ui && ui.profileId) || "doc"}-items`;
}

function taxesTableKey() {
  return `${(ui && ui.profileId) || "doc"}-taxes`;
}

function sizeItemColumns() {
  try {
    const table = el && el.items && el.items.closest ? el.items.closest("table") : null;
    if (!table) return;
    const tableKey = itemsTableKey();
    mountColResize(table, { tableKey, onChange: sizeItemColumns });
    mountDensityControl({ table, button: document.getElementById("btn-density") });
    autoSizeItemColumns(table, { tableKey });
  } catch {
    /* column sizing is presentation; never let it break a repaint */
  }
}

function sizeTaxColumns() {
  try {
    const table =
      el && el.taxesBody && el.taxesBody.closest ? el.taxesBody.closest("table") : null;
    if (!table) return;
    const tableKey = taxesTableKey();
    mountColResize(table, { tableKey, onChange: sizeTaxColumns });
    autoSizeItemColumns(table, { tableKey });
  } catch {
    /* ignore */
  }
}

function paintItemsHead() {
  if (!el.itemsHead || !ui) return;
  const headers = sortableHeadersFromCols(ui.itemCols);
  if (!headers.length) {
    el.itemsHead.innerHTML =
      ui.itemCols
        .map(
          (c) =>
            `<th data-col-key="${escapeHtml(c.field || c.label || "")}">${escapeHtml(c.label)}</th>`,
        )
        .join("") + "<th></th>";
    return;
  }
  el.itemsHead.innerHTML =
    headers
      .map((h) => {
        const st = sortHeaderState(itemSortSpecs, h.sortKey);
        const arrow = sortHeaderArrow(itemSortSpecs, h.sortKey);
        const tip =
          h.sortKey === "lineNo"
            ? "Sort by Purchase Order line number · Ctrl+click to add another column"
            : st.active
              ? `Sort by ${h.label} (${st.asc ? "asc" : "desc"}) · Ctrl+click to add another column`
              : `Sort by ${h.label} · Ctrl+click to add a secondary sort`;
        return `<th class="sortable${st.active ? " sorted" : ""}" data-sort="${escapeHtml(h.sortKey)}" title="${escapeHtml(tip)}">${escapeHtml(h.label)}${arrow}</th>`;
      })
      .join("") + "<th></th>";
  if (!itemsHeadWired) {
    itemsHeadWired = true;
    el.itemsHead.addEventListener("click", (ev) => {
      const th = /** @type {HTMLElement|null} */ (
        /** @type {HTMLElement} */ (ev.target).closest("th[data-sort]")
      );
      if (!th) return;
      const key = th.getAttribute("data-sort");
      if (!key) return;
      itemSortSpecs = applyHeaderSortClick(itemSortSpecs, key, {
        ctrlKey: !!ev.ctrlKey,
        metaKey: !!ev.metaKey,
      });
      paintItemsHead();
      if (lastDoc) paintItems(lastDoc);
    });
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
        <button type="button" class="clear-qty" id="btn-clear-qty" data-testid="doc-clear-qty" tabindex="-1"
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

function paintTaxesHead() {
  if (!el.taxesHead || !ui || !ui.features.taxes) return;
  el.taxesHead.innerHTML =
    DOC_TAX_SORTABLE_HEADERS.map((h) => {
      const st = sortHeaderState(taxSortSpecs, h.sortKey);
      const arrow = sortHeaderArrow(taxSortSpecs, h.sortKey);
      const cls = ["sortable", st.active ? "sorted" : "", h.className || ""].filter(Boolean).join(" ");
      return `<th class="${cls}" data-tax-sort="${escapeHtml(h.sortKey)}" title="Sort by ${escapeHtml(h.label)}">${escapeHtml(h.label)}${arrow ? ` ${arrow}` : ""}</th>`;
    }).join("") + `<th></th>`;
  if (!taxesHeadWired) {
    taxesHeadWired = true;
    el.taxesHead.addEventListener("click", (ev) => {
      const th = /** @type {HTMLElement|null} */ (
        /** @type {HTMLElement} */ (ev.target).closest("[data-tax-sort]")
      );
      if (!th) return;
      const key = th.getAttribute("data-tax-sort");
      if (!key) return;
      taxSortSpecs = applyHeaderSortClick(taxSortSpecs, key, {
        ctrlKey: !!ev.ctrlKey,
        metaKey: !!ev.metaKey,
      });
      if (lastDoc) paintTaxes(lastDoc);
    });
  }
}

function paintTaxes(doc) {
  if (!el.taxesBody || !ui || !ui.features.taxes) return;
  paintTaxesHead();
  const rows = sortBillTaxRows(readBillTaxRowsForSort(doc), taxSortSpecs);
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
  sizeTaxColumns();

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
      mountDocLinkPicker(inp, "Account", apply);
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
  paintItemsHead();
  const cols = ui.itemCols;
  const navFields = itemNavFieldsFromCols(cols);
  const models = sortDocItemRowModels(
    doc,
    cols,
    (d) => mapHelpers().readItemRows(d),
    itemSortSpecs,
  );
  const canEdit = editable();
  el.items.innerHTML = models
    .map((model) => {
      const ri = model.rowIndex;
      const r = model.cells;
      const cells = cols
        .map((col, ci) => {
          const val = r[ci] ?? "";
          if (col.displayOnly || col.field == null) {
            const isLine = col.sortKey === "lineNo" || col.field === "__line_no";
            const isAmount = /^amount$/i.test(col.label || "");
            const html = isAmount || /rec'd|received/i.test(col.label || "")
              ? formatUsdAmountHtml(val)
              : "";
            if (isLine) {
              return `<td class="num line-meta"><span class="ro" title="Purchase Order line number">${escapeHtml(val) || "—"}</span></td>`;
            }
            if (isAmount && canEdit) {
              return `<td class="num"><button type="button" class="amount-back-in money-amt" data-back-in="${ri}" title="Back into unit cost from this amount (Amount ÷ Qty → Rate)" data-testid="doc-amt-${ri}">${html || escapeHtml(val) || "—"}</button></td>`;
            }
            return `<td class="num"><span class="ro money-amt" data-testid="doc-amt-${ri}">${html || escapeHtml(val)}</span></td>`;
          }
          if (col.field === "rate") {
            const shown = val === "" || val == null ? "" : formatGroupedNumber(val);
            if (!canEdit) {
              return `<td class="num"><span class="ro money-cost">${escapeHtml(shown)}</span></td>`;
            }
            return `<td class="num"><input type="text" inputmode="decimal" class="money-cost" data-row="${ri}" data-field="rate" value="${escapeHtml(shown)}" data-testid="doc-cell-${ri}-rate" /></td>`;
          }
          if (col.type === "checkbox") {
            const checked = val === 1 || val === true || val === "1";
            if (!canEdit) {
              return `<td class="num"><span class="ro">${checked ? "Yes" : "—"}</span></td>`;
            }
            return `<td class="num"><input type="checkbox" data-row="${ri}" data-field="${col.field}" data-check="1" ${checked ? "checked" : ""} data-testid="doc-cell-${ri}-${col.field}" title="Vendor delivers direct to customer" /></td>`;
          }
          if (col.type === "date" || col.field === "schedule_date") {
            const shown = formatDocDateDisplay(val) || val || "";
            if (!canEdit) {
              return `<td><span class="ro">${escapeHtml(shown)}</span></td>`;
            }
            return `<td><input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" data-row="${ri}" data-field="${col.field}" data-date="1" value="${escapeHtml(shown)}" data-testid="doc-cell-${ri}-${col.field}" autocomplete="off" /></td>`;
          }
          if (!canEdit) {
            return `<td class="cell-wrap"><span class="cell-text ro">${escapeHtml(val)}</span></td>`;
          }
          if (col.field === "qty") {
            return `<td class="num"><input type="text" inputmode="decimal" data-row="${ri}" data-field="qty" value="${escapeHtml(val)}" data-testid="doc-cell-${ri}-qty" /></td>`;
          }
          return `<td class="cell-wrap"><span class="cell-text">${escapeHtml(val)}</span><input type="text" data-row="${ri}" data-field="${col.field}" value="${escapeHtml(val)}" data-testid="doc-cell-${ri}-${col.field}" /></td>`;
        })
        .join("");
      const del = canEdit
        ? `<td><button type="button" class="del" data-del="${ri}" title="Remove line" tabindex="-1" data-testid="doc-del-${ri}">×</button></td>`
        : `<td></td>`;
      return `<tr data-rowidx="${ri}">${cells}${del}</tr>`;
    })
    .join("");

  paintLineTotals(doc);
  sizeItemColumns();

  el.items.querySelectorAll("input[data-row]").forEach((inp) => {
    // Keep the resting text layer in step with the editor. The text is hidden
    // while the input has focus, so this is not load-bearing for correctness
    // mid-edit -- it is here so a cell reads right the instant you leave it,
    // without waiting for a repaint that may never come.
    const cellText = inp.closest("td.cell-wrap")?.querySelector(".cell-text");
    if (cellText) {
      const syncCellText = () => {
        cellText.textContent = inp.value;
      };
      inp.addEventListener("input", syncCellText);
      inp.addEventListener("change", syncCellText);
    }
    const field = inp.getAttribute("data-field");
    const ri = Number(inp.getAttribute("data-row"));
    const linkDt = linkDoctypeForDocField(field, ui.headerFields, ui.itemCols);
    const readCellValue = () => {
      const kind = dirtyCompareKindForField(field);
      let next = kind === "number" ? inp.value : normalizeEditableText(inp.value);
      if (inp.type === "checkbox" || inp.dataset.check === "1") {
        return inp.checked ? 1 : 0;
      }
      if (field === "rate") {
        const n = parseMoney(inp.value);
        next = n == null ? "" : String(n);
      }
      if (inp.dataset.date === "1") {
        const raw = filterDateInputValue(inp.value).trim();
        if (!raw) return "";
        const parsed = parseDocDate(raw);
        if (parsed.ok) return parsed.iso;
      }
      return next;
    };
    const focusAfterItemEdit = async (docAfter, cellValue) => {
      const rowCount =
        docAfter && Array.isArray(docAfter.items) ? docAfter.items.length : 0;
      const dest = nextItemFocusAfterEdit(field, ri, rowCount, {
        cellValue,
        fields: navFields,
        rowItemCode: docAfter?.items?.[ri]?.item_code ?? "",
        nextRowItemCode: rowItemCodeAt(docAfter, ri + 1),
      });
      if (dest.deleteRow && dest.leaveTable) {
        if (!api || !editable()) return;
        const rowCountNow =
          lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items.length : 0;
        const deleteRi = dest.rowIndex != null ? dest.rowIndex : ri;
        if (shouldBlockDeleteLastItemRow(rowCountNow)) {
          showToast(lastItemRowToast(docTitle()));
          focusAfterLeavingItemsTable();
          return;
        }
        setStatus("Removing empty line…");
        const removed = await api.deleteItem(deleteRi);
        if (removed && removed.ok) {
          noteUserEdit();
          paint(removed.doc, removed.scratch || scratch);
          setStatus("Left items table.");
          focusAfterLeavingItemsTable();
        } else if (removed && removed.blockedLastRow) {
          showToast(removed.reason || lastItemRowToast(docTitle()));
        } else {
          setStatus((removed && removed.reason) || "Could not remove empty line.", "err");
        }
        return;
      }
      if (dest.field) {
        focusItemCell(dest.rowIndex, dest.field, { mode: CELL_MODE_NAV });
        return;
      }
      if (!dest.addRow || !api || !editable()) return;
      setStatus("Adding line…");
      const added = await api.addItem();
      if (added && added.ok) {
        noteUserEdit();
        paint(added.doc, added.scratch || scratch);
        const newRi =
          added.doc && Array.isArray(added.doc.items)
            ? added.doc.items.length - 1
            : ri + 1;
        focusItemCell(Math.max(0, newRi), "item_code", { mode: CELL_MODE_NAV });
        setStatus("Line added.");
      } else {
        setStatus((added && added.reason) || "Add line failed.", "err");
      }
    };
    const apply = async (value, opts = {}) => {
      if (!api || painting) return;
      const run = async () => {
        setStatus(`Updating ${field}…`);
        const res = await api.setItem(ri, field, value);
        if (res && res.ok) {
          noteUserEdit();
          if (res.scratch) scratch = res.scratch;
          paint(res.doc, res.scratch || scratch);
          setStatus("Line updated.");
          if (opts.focus && opts.focus.field) {
            focusItemCell(opts.focus.rowIndex, opts.focus.field, {
              mode: opts.focus.mode === CELL_MODE_EDIT ? CELL_MODE_EDIT : CELL_MODE_NAV,
            });
          } else if (!opts.stay) {
            await focusAfterItemEdit(res.doc, value);
          }
        } else {
          setStatus((res && res.reason) || "Line update failed.", "err");
          await refresh();
        }
      };
      lineApplyInFlight = run();
      try {
        await lineApplyInFlight;
      } finally {
        lineApplyInFlight = null;
      }
    };
    if (linkDt) {
      mountDocLinkPicker(inp, linkDt, apply);
    }
    if (inp.dataset.date === "1") {
      wireDateField(inp);
    }
    inp.addEventListener("focus", () => {
      if (inp.dataset.navFocus === "1") {
        setItemCellMode(CELL_MODE_NAV);
        delete inp.dataset.navFocus;
      } else {
        setItemCellMode(CELL_MODE_EDIT);
      }
    });
    if (field === "item_code") {
      inp.addEventListener("blur", () => {
        window.setTimeout(() => {
          if (!editable() || painting || itemTabGuard) return;
          const wrap = inp.closest(".link-wrap");
          if (wrap && wrap.contains(document.activeElement)) return;
          const code = normalizeEditableText(inp.value);
          if (!isEmptyItemCode(code)) return;
          void cleanupEmptyItemRow(ri, code);
        }, 180);
      });
    }
    if (field === "rate") {
      inp.addEventListener("focus", () => {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = String(n);
      });
      inp.addEventListener("blur", () => {
        if (calcUi.getState().mode === "active" && calcUi.getInput() === inp) return;
        const n = parseMoney(inp.value);
        if (n != null) inp.value = formatGroupedNumber(n);
        else if (normalizeEditableText(inp.value) === "") inp.value = "";
      });
    }
    if (field === "qty" || field === "rate") {
      calcUi.attach(inp, {
        kind: field,
        isPainting: () => painting,
        isEditable: () => editable(),
        onHistory: publishCalcHistory,
        onCommit: async (value) => {
          let next = value;
          if (field === "rate") {
            const n = parseMoney(value);
            next = n == null ? "" : String(n);
            if (n != null) inp.value = formatGroupedNumber(n);
          }
          await apply(next);
        },
      });
    }
    inp.addEventListener("keydown", (ev) => {
      if (!editable() || painting) return;
      const calcActive =
        calcUi.getState().mode === "active" && calcUi.getInput() === inp;
      const decision = itemTableKeyDecision({
        mode: itemCellMode,
        key: ev.key,
        shiftKey: !!ev.shiftKey,
        ctrlKey: !!ev.ctrlKey,
        metaKey: !!ev.metaKey,
        altKey: !!ev.altKey,
        selectionStart: inp.selectionStart,
        selectionEnd: inp.selectionEnd,
        valueLength: String(inp.value ?? "").length,
        linkDropdownOpen: isItemLinkDropdownOpen(inp),
        calcActive,
        verticalArrowsAlwaysNav: field === "qty",
      });

      if (decision.action === "leave_edit") {
        if (decision.preventDefault) ev.preventDefault();
        setItemCellMode(CELL_MODE_NAV);
        try {
          if (typeof inp.select === "function") inp.select();
        } catch {
          /* ignore */
        }
        return;
      }

      if (decision.action === "enter_edit") {
        setItemCellMode(CELL_MODE_EDIT);
        if (ev.key === "F2") {
          ev.preventDefault();
          try {
            const len = String(inp.value ?? "").length;
            inp.setSelectionRange(len, len);
          } catch {
            /* ignore */
          }
        }
        return;
      }

      if (decision.action === "passthrough") {
        if (ev.key !== "Tab" || ev.shiftKey) return;
      } else if (decision.preventDefault) {
        ev.preventDefault();
      }

      if (
        decision.action === "move" ||
        decision.action === "leave_edit_move" ||
        (decision.action === "tab" && decision.direction === "left")
      ) {
        setItemCellMode(CELL_MODE_NAV);
        itemTabGuard = true;
        void (async () => {
          try {
            const next = readCellValue();
            const rowCount =
              lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items.length : 0;
            const dest = neighborItemCell(
              field,
              ri,
              rowCount,
              decision.direction || "left",
              navFields,
            );
            const prev =
              (lastDoc && lastDoc.items && lastDoc.items[ri] && lastDoc.items[ri][field]) ??
              "";
            const kind = dirtyCompareKindForField(field);
            const dirty = !valuesMeaningfullyEqual(prev, next, { kind });
            if (!dest) {
              if (dirty) await apply(next, { stay: true });
              if (shouldLeaveItemTableBackward(dest, decision.direction)) {
                focusLastHeaderBeforeItems();
              }
              return;
            }
            if (dirty) {
              await apply(next, {
                focus: {
                  rowIndex: dest.rowIndex,
                  field: dest.field,
                  mode: CELL_MODE_NAV,
                },
              });
            } else {
              focusItemCell(dest.rowIndex, dest.field, { mode: CELL_MODE_NAV });
            }
          } finally {
            itemTabGuard = false;
          }
        })();
        return;
      }

      if (ev.key !== "Tab" || ev.shiftKey || calcActive) return;
      ev.preventDefault();
      setItemCellMode(CELL_MODE_NAV);
      itemTabGuard = true;
      void (async () => {
        try {
          const next = readCellValue();
          const rowCount =
            lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items.length : 0;
          const dest = nextItemFocusAfterEdit(field, ri, rowCount, {
            cellValue: next,
            fields: navFields,
            rowItemCode: lastDoc?.items?.[ri]?.item_code ?? "",
            nextRowItemCode: rowItemCodeAt(lastDoc, ri + 1),
          });
          if (dest.deleteRow && dest.leaveTable) {
            await focusAfterItemEdit(lastDoc, next);
            return;
          }
          const prev =
            (lastDoc && lastDoc.items && lastDoc.items[ri] && lastDoc.items[ri][field]) ??
            "";
          const kind = dirtyCompareKindForField(field);
          if (!valuesMeaningfullyEqual(prev, next, { kind })) {
            await apply(next);
          } else if (dest.field) {
            focusItemCell(dest.rowIndex, dest.field, { mode: CELL_MODE_NAV });
          } else if (dest.addRow) {
            await focusAfterItemEdit(lastDoc, next);
          }
        } finally {
          itemTabGuard = false;
        }
      })();
    });
    inp.addEventListener("change", async () => {
      if (!api || painting || itemTabGuard) return;
      if (calcUi.getState().mode === "active" && calcUi.getInput() === inp) return;
      let next = readCellValue();
      if (field === "rate") {
        const n = parseMoney(inp.value);
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
      const kind = dirtyCompareKindForField(field);
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
      if (res && res.ok && res.clearedLastRow) {
        noteUserEdit();
        paint(res.doc, res.scratch || scratch);
        showToast(res.reason || lastItemRowToast(docTitle()));
        setStatus("Last line cleared.");
      } else if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, res.scratch || scratch);
        setStatus("Line removed.");
      } else if (res && res.blockedLastRow) {
        showToast(res.reason || lastItemRowToast(docTitle()));
      } else {
        setStatus((res && res.reason) || "Delete failed.", "err");
      }
    });
  });
  el.items.querySelectorAll("button[data-back-in]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!editable() || painting) return;
      const ri = Number(btn.getAttribute("data-back-in"));
      beginAmountBackIn(btn, ri);
    });
  });
}

/**
 * Click Amount → temporary input + calc; commit writes rate = amount ÷ qty.
 * @param {HTMLElement} btn
 * @param {number} ri
 */
function beginAmountBackIn(btn, ri) {
  const td = btn.closest("td");
  if (!td || !lastDoc || !lastDoc.items || !lastDoc.items[ri]) return;
  const row = lastDoc.items[ri];
  const priorAmt =
    row.amount != null && row.amount !== ""
      ? String(row.amount)
      : String((Number(row.qty) || 0) * (Number(row.rate) || 0) || "");
  const inp = document.createElement("input");
  inp.type = "text";
  inp.inputMode = "decimal";
  inp.className = "money-cost amount-back-in-input";
  inp.setAttribute("data-testid", `doc-amt-edit-${ri}`);
  const n0 = parseMoney(priorAmt);
  inp.value = n0 != null ? String(n0) : "";
  td.replaceChildren(inp);
  setStatus("Back into rate: enter Amount (calc OK) — Rate = Amount ÷ Qty.");
  const finishRestore = () => {
    paint(lastDoc, scratch);
  };
  calcUi.attach(inp, {
    kind: "amount",
    commitOnIdleBlur: true,
    isPainting: () => painting,
    isEditable: () => editable(),
    onHistory: publishCalcHistory,
    onCommit: async (value) => {
      const derived = rateFromBackedInAmount(value, row.qty);
      if (!derived.ok) {
        setStatus(derived.reason, "warn");
        finishRestore();
        return;
      }
      setStatus("Updating rate from amount…");
      const res = await api.setItem(ri, "rate", derived.rateText);
      if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, res.scratch || scratch);
        setStatus(`Rate set to ${derived.rateText} (Amount ÷ Qty).`);
      } else {
        setStatus((res && res.reason) || "Could not update rate.", "err");
        await refresh();
      }
    },
  });
  inp.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && calcUi.getState().mode !== "active") {
      ev.preventDefault();
      // Detach before paint so blur does not idle-commit the edit.
      calcUi.clear(inp.value);
      finishRestore();
    }
  });
  inp.focus();
  try {
    inp.select();
  } catch {
    /* ignore */
  }
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
  if (el.headerAddresses) {
    el.headerAddresses.replaceChildren();
    el.headerAddresses.hidden = true;
  }
  Object.keys(headerInputs).forEach((k) => delete headerInputs[k]);

  const { left, right, addresses } = splitHeaderColumns(fields);

  const mountReadOnlyControl = (meta, fieldEl) => {
    const multiline = !!(meta.multiline || meta.addressRole || meta.type === "textarea");
    const pickable = addressFieldPickable(meta);
    const input = document.createElement(multiline ? "textarea" : "input");
    input.id = `f-${slugLabel(meta.label)}`;
    input.readOnly = true;
    input.tabIndex = -1;
    input.dataset.testid = `doc-header-${slugLabel(meta.label)}`;
    if (meta.addressRole) {
      input.dataset.addressRole = meta.addressRole;
      input.setAttribute("data-addr-role", meta.addressRole);
    }
    if (meta.sourceWashRole) setWashSourceAttr(input, meta.sourceWashRole);
    if (multiline) {
      input.rows = 4;
      input.spellcheck = false;
    }
    if (pickable) {
      input.classList.add("addr-pick");
      const roleMeta = addressRoleMeta(ui.profileId, meta.addressRole);
      input.title = roleMeta?.title || meta.label;
    } else if (meta.validationHint) input.title = meta.validationHint;
    else if (meta.addressRole) {
      input.title =
        "Read-only here. Set addresses on the document or party in Vanilla ERPNext, then Refresh.";
    }
    fieldEl.appendChild(input);
    headerInputs[meta.label] = input;
  };

  const mountCol = (colEl, list) => {
    for (const meta of list) {
      const field = document.createElement("div");
      field.className = "field";
      const label = document.createElement("label");
      label.textContent = meta.label;
      field.appendChild(label);

      const isReadOnly = meta.readOnly || !meta.field;
      if (isReadOnly) {
        mountReadOnlyControl(meta, field);
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
          input.addEventListener("focus", () => {
            if (input.value === PO_MULTIPLE_DATES_LABEL) input.value = "";
          });
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
      } else if (meta.type === "textarea") {
        const input = document.createElement("textarea");
        input.id = `f-${meta.field}`;
        input.dataset.field = meta.field;
        input.dataset.testid = `doc-${meta.field}`;
        input.rows = 3;
        input.spellcheck = true;
        if (meta.validationHint) input.title = meta.validationHint;
        field.appendChild(input);
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

  if (el.headerAddresses && addresses.length) {
    el.headerAddresses.hidden = false;
    for (const meta of addresses) {
      const field = document.createElement("div");
      field.className = "field";
      const label = document.createElement("label");
      label.textContent = meta.label;
      field.appendChild(label);
      mountReadOnlyControl(meta, field);
      el.headerAddresses.appendChild(field);
    }
    const hint = document.createElement("span");
    hint.className = "addr-hint";
    hint.style.gridColumn = "1 / -1";
    hint.textContent = ui.features.addressPicker
      ? ui.profileId === "po"
        ? "Click Ship from / Ship to to pick addresses. Drop-ship customer is set inside Ship to."
        : "Click an address to pick when enabled on this profile."
      : "Read-only. Edit Ship from / Ship to / Billing on the document or party in Vanilla, then Refresh. Empty means ERP has no address linked yet (PO may lack a dedicated ship-from field).";
    el.headerAddresses.appendChild(hint);
  }
  wireDocAddressPickers();
}

function ensureHeaderLinkPickers() {
  if (!ui) return;
  for (const meta of ui.headerFields) {
    if (!meta.field || meta.readOnly || meta.scratch) continue;
    const inp = headerInputs[meta.label];
    if (!inp || !meta.linkDoctype) continue;
    if (meta.field === "supplier") {
      mountDocLinkPicker(inp, meta.linkDoctype, async (v) => {
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
            modalAlreadyOpen: sourceModalOpenRef.current,
          });
        setStatus("Setting vendor…");
        vendorPickSourceSession = { supplier: normalizeEditableText(v), userClosed: false };
        await runVendorPickWithSourceModal({
          supplier: v,
          decision: decision || { open: false },
          setHeader: (field, value) => api.setHeader(field, value),
          openSourcePicker: (supplier) => openSourcePicker(supplier, { trigger: "link_pick" }),
          onHeaderSuccess: (res) => {
            noteUserEdit();
            paint(res.doc || lastDoc, res.scratch || scratch);
            if (decision && decision.open) setStatus("Choose a source (or NIC).");
          },
          onHeaderFailure: (res) => {
            setStatus((res && res.reason) || "Vendor update failed.", "err");
          },
        });
      }, { refocusAfterPick: false });
    } else {
      mountDocLinkPicker(inp, meta.linkDoctype, async (v) => {
        if (!api || !editable()) return;
        const res = await api.setHeader(meta.field, v);
        if (res && res.ok && !res.skipped) noteUserEdit();
        await refresh();
      });
    }
  }
}

async function openSourcePicker(supplier, opts = {}) {
  const trigger = opts.trigger || "unknown";
  const listSlice = api && api.listSourceSlice;
  if (!listSlice || !ui || !ui.features.sourceModal) {
    setStatus("Source picker API missing — restart the shell.", "err");
    return { ok: false, reason: "api_missing" };
  }
  if (sourceModalOpenRef.current) return { ok: false, reason: "already_open" };
  if (!editable()) {
    setStatus(`${docTitle()} is not a draft — source picker locked.`, "warn");
    return { ok: false, reason: "not_editable" };
  }
  const supInp = supplierInput();
  const sup =
    normalizeEditableText(supplier) ||
    normalizeEditableText(lastDoc && lastDoc.supplier) ||
    normalizeEditableText(supInp && supInp.value);
  if (!sup) {
    setStatus(`Pick a vendor before ${ui.sourceLabel || "Select PO"}.`, "warn");
    return { ok: false, reason: "no_supplier" };
  }

  if (trigger === "toolbar") {
    vendorPickSourceSession = null;
  }

  const gate = mayAutoOpenSourcePicker(vendorPickSourceSession, sup, trigger);
  if (!gate.ok) {
    logFocus("source-modal-skip", `${trigger}:${gate.reason || "blocked"}`);
    return { ok: false, reason: gate.reason || "blocked" };
  }

  if (sourcePickerInflight && sourcePickerInflightSupplier === sup && trigger !== "toolbar") {
    return sourcePickerInflight;
  }

  sourcePickerInflightSupplier = sup;
  sourcePickerInflight = runDocSourcePicker(sup, trigger).finally(() => {
    if (sourcePickerInflightSupplier === sup) {
      sourcePickerInflight = null;
      sourcePickerInflightSupplier = "";
    }
  });
  return sourcePickerInflight;
}

/**
 * @param {string} sup
 * @param {"link_pick" | "blur" | "toolbar" | "unknown"} trigger
 */
async function runDocSourcePicker(sup, trigger) {
  setStatus("Loading open Purchase Orders…");

  return runSourcePickerFlow({
    supplier: sup,
    trigger,
    mode: "single",
    listSourceSlice: (vendor, sliceId) => api.listSourceSlice(vendor, sliceId),
    log: (event, detail) => logFocus(event, detail || ""),
    mayOpen: (vendor, trig) =>
      mayAutoOpenSourcePicker(vendorPickSourceSession, vendor, trig),
    onUserClose: () => {
      if (vendorPickSourceSession && vendorPickSourceSession.supplier === sup) {
        vendorPickSourceSession.userClosed = true;
      }
    },
    onStreamComplete: ({ errors }) => {
      if (errors.length && sourceModalOpenRef.current) {
        setStatus(`Some sources failed to load (${errors.length}).`, "warn");
      } else if (sourceModalOpenRef.current) {
        setStatus("Sources loaded — pick one.");
      }
    },
    showModal: (flowOpts) =>
      showSourceModal({
        ...flowOpts,
        testId: "doc-source-modal",
        isOpenRef: sourceModalOpenRef,
        setStatus,
        focusSurface: () => {
          if (api && api.focusSurface) api.focusSurface();
        },
        onChoose: async (it) => {
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
        },
      }),
  });
}

function setFormBlocked(blocked, reason) {
  document.body.classList.toggle("blocked", !!blocked);
  const retry = el.retry;
  if (retry) retry.hidden = !blocked;
  if (blocked && reason) setStatus(reason, "warn");
  else if (!blocked && el.status) {
    el.status.classList.remove("warn", "err");
  }
}

/** Drop stale header/line paint when Vanilla doc is not loaded yet (home → new PO). */
function clearPaintedForm() {
  if (ui) {
    for (const meta of ui.headerFields) {
      const inp = headerInputs[meta.label];
      if (!inp) continue;
      inp.value = "";
      if (meta.type === "date") inp.placeholder = "MM/DD/YYYY";
      if (meta.linkDoctype) inp.dataset.linkCommitted = "";
      if (meta.addressRole && inp.tagName === "TEXTAREA") {
        inp.rows = addressTextareaRows("");
      }
    }
  }
  if (el.memo) el.memo.value = "";
  if (el.termsText) el.termsText.value = "";
  syncDocAddressPickers(false);
  if (el.items) el.items.innerHTML = "";
  if (el.taxesBody) el.taxesBody.innerHTML = "";
  paintLineTotals(null);
  paintMoneyStack(null);
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
  if (field === ERP_FREEFORM_TERMS_FIELD) return lastDoc[ERP_FREEFORM_TERMS_FIELD] ?? "";
  if (field === "supplier") return lastDoc.supplier_name || lastDoc.supplier || "";
  if (field === "customer") return lastDoc.customer_name || lastDoc.customer || "";
  return lastDoc[field] != null ? lastDoc[field] : "";
}

function paintedScratchDateExpected() {
  return scratch.dateExpected != null ? String(scratch.dateExpected) : "";
}

function paint(doc, snapScratch, opts = {}) {
  painting = true;
  try {
  calcUi.clear();
  lastDoc = doc || null;
  scratch = snapScratch && typeof snapScratch === "object" ? { ...snapScratch } : {};
  if (opts.userEdited != null) userEdited = !!opts.userEdited;
  paintDirtyPill();

  if (!doc || !ui) {
    clearPaintedForm();
    setFormBlocked(true, opts.reason || `No ${docTitle()} loaded in Vanilla yet.`);
    el.addLine.disabled = true;
    if (el.importItems) el.importItems.disabled = true;
    if (el.clearQty) el.clearQty.disabled = true;
    if (el.attach) el.attach.disabled = true;
    if (el.addTax) el.addTax.disabled = true;
    return;
  }

  setFormBlocked(false);
  const h = mapHelpers().readHeader(doc, scratch);
  for (const meta of ui.headerFields) {
    const inp = headerInputs[meta.label];
    if (!inp) continue;
    const val = h[meta.label] ?? "";
    if (meta.field === "__date_expected") {
      const shown = poDateExpectedHeaderDisplay(doc, scratch);
      if (shown.mode === "multiple") {
        inp.value = PO_MULTIPLE_DATES_LABEL;
        inp.placeholder = PO_MULTIPLE_DATES_LABEL;
        inp.title =
          (meta.validationHint || "") +
          " Line Required By dates differ — type one Date Expected to re-stamp all lines.";
      } else {
        inp.value = formatDocDateDisplay(shown.display) || shown.display || "";
        inp.placeholder = "MM/DD/YYYY";
        if (meta.validationHint) inp.title = meta.validationHint;
      }
      continue;
    }
    if (meta.type === "date") {
      inp.value = formatDocDateDisplay(val) || val;
    } else if (meta.type === "textarea") {
      inp.value = val;
    } else {
      inp.value = val;
    }
    if (meta.linkDoctype) {
      inp.dataset.linkCommitted = String(inp.value || "");
    }
    if (meta.addressRole && inp.tagName === "TEXTAREA") {
      inp.rows = addressTextareaRows(String(val ?? ""));
    }
  }

  if (ui.features.memo && el.memo && ui.memoField) {
    el.memo.value = h.Memo ?? lastDoc[ui.memoField] ?? "";
  }
  if (ui.features.termsField && el.termsText) {
    el.termsText.value =
      h[FREEFORM_TERMS_LABEL] ?? (lastDoc && lastDoc[ERP_FREEFORM_TERMS_FIELD]) ?? "";
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
  if (el.termsText) el.termsText.readOnly = !canEdit;
  syncDocAddressPickers(canEdit);

  el.addLine.disabled = !canEdit;
  if (el.importItems) el.importItems.disabled = !canEdit;
  if (el.clearQty) el.clearQty.disabled = !canEdit;
  if (el.attach) el.attach.disabled = !canEdit;
  if (el.addTax) el.addTax.disabled = !canEdit;

  paintItems(doc);
  paintTaxes(doc);
  ensureHeaderLinkPickers();

  void paintSourceTerms(doc);

  const name = doc.name || "(new)";
  setStatus(`${name} · ${editable() ? "Draft" : "Posted"}`);
  if (opts.focusVendor) {
    docCapsOn = true;
    if (docCapsUi) docCapsUi.syncCapsButton();
  }
  if (opts.focusVendor && canEdit) focusVendorField();
  void ensureAtLeastOneItemRow(doc);
  } finally {
    painting = false;
  }
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
  const focusAnchor = captureFocusAnchor();

  if (input.dataset.scratch === "dateExpected") {
    const raw = filterDateInputValue(input.value).trim();
    if (
      !raw ||
      raw === PO_MULTIPLE_DATES_LABEL ||
      /^multiple dates$/i.test(raw)
    ) {
      const shown = poDateExpectedHeaderDisplay(lastDoc, scratch);
      input.value =
        shown.mode === "multiple"
          ? PO_MULTIPLE_DATES_LABEL
          : formatDocDateDisplay(shown.display) || shown.display || "";
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
      restoreFocusAnchor(focusAnchor);
    } else {
      setStatus((res && res.reason) || "Date Expected update failed.", "err");
      await refresh();
      restoreFocusAnchor(focusAnchor);
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
    restoreFocusAnchor(focusAnchor);
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
      modalAlreadyOpen: sourceModalOpenRef.current,
      setHeaderOk: !!(res && res.ok),
      setHeaderSkipped: !!(res && res.skipped),
    });
    if (decision.open) {
      if (res && res.ok) noteUserEdit();
      paint(res.doc || lastDoc, res.scratch || scratch);
      await openSourcePicker(next || (res && res.supplier), { trigger: "blur" });
      return;
    }
  }

  if (res && res.skipped) return;
  if (res && res.ok) noteUserEdit();
  await refresh();
  restoreFocusAnchor(focusAnchor);
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
  if (saveInFlight) return { ok: false, reason: "Save already in progress." };
  saveInFlight = true;
  try {
    const flush = await flushPendingFieldEdits({
      getInFlight: () => lineApplyInFlight,
      waitMs: 5000,
    });
    if (flush && flush.timedOut) {
      setStatus("Line update slow — saving with last committed lines…", "warn");
    }
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
      openDirectSaveBlockedGate(blockers, { submit });
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
    const reason = formatSaveFailureReason(
      r,
      submit ? "Save & submit" : "Save draft",
    );
    setStatus(reason, "err");
    const mergedBlockers = mergeSaveBlockers(
      listDocFormSaveBlockers({
        doc: lastDoc,
        supplier: supplierInput() && supplierInput().value,
      }),
      r && Array.isArray(r.blockers) ? r.blockers : reason ? [reason] : [],
    );
    openDirectSaveBlockedGate(mergedBlockers, {
      submit,
      erpFailure: !(r && Array.isArray(r.blockers) && r.blockers.length),
      reason,
    });
    return {
      ok: false,
      reason,
      blockers: r && Array.isArray(r.blockers) ? r.blockers : undefined,
      timedOut: !!(r && r.timedOut),
    };
  } finally {
    saveInFlight = false;
  }
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

  applyDocWashToDocument(document, { profileId: ui.profileId });

  document.title = ui.title;
  if (el.title) el.title.textContent = ui.title;
  if (el.find) el.find.textContent = ui.findLabel;
  if (el.newDoc) el.newDoc.textContent = ui.newLabel;
  if (el.hint) el.hint.textContent = ui.hint || "";

  const assumptionsUl = el.assumptionsList;
  if (assumptionsUl && Array.isArray(ui.assumptions)) {
    assumptionsUl.innerHTML = ui.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  }

  buildHeaderFields(ui.headerFields);

  itemSortSpecs = [{ key: "lineNo", asc: true }];
  itemsHeadWired = false;
  taxSortSpecs = [{ key: "account_head", asc: true }];
  taxesHeadWired = false;
  paintItemsHead();
  buildLineTotalsFoot(ui.itemCols);

  if (el.lineTabs) {
    el.lineTabs.hidden = !ui.features.expensesTab;
    if (el.tabExpenses) el.tabExpenses.hidden = !ui.features.expensesTab;
  }
  if (el.linesSectionTitle) {
    el.linesSectionTitle.hidden = !!ui.features.expensesTab;
  }
  if (el.termsBlock) {
    const termsLabel = el.termsBlock.querySelector("label");
    if (termsLabel) {
      termsLabel.textContent =
        ui.profileId === "po" ? "Freeform comments" : FREEFORM_TERMS_LABEL;
    }
  }
  if (el.taxesBlock) el.taxesBlock.hidden = !ui.features.taxes;
  const showNotes = !!(ui.features.memo || ui.features.termsField || ui.features.sourceTerms);
  if (el.notesSection) el.notesSection.hidden = !showNotes;
  if (el.memoBlock) el.memoBlock.hidden = !showNotes;
  if (el.termsBlock) el.termsBlock.hidden = !ui.features.termsField;
  if (el.memoEntry) el.memoEntry.hidden = !ui.features.memo;
  if (el.memoLabel && ui.memoLabel) el.memoLabel.textContent = ui.memoLabel;
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
  const btnRefresh = el.refresh;
  if (btnRefresh) {
    btnRefresh.onclick = () => refresh();
    btnRefresh.title = REFRESH_BUTTON_TITLE;
  }
  const btnVanilla = el.vanilla;
  if (btnVanilla) btnVanilla.onclick = () => api && api.openVanilla();
  if (el.find) el.find.onclick = () => requestToolbarAction("find");
  if (el.newDoc) el.newDoc.onclick = () => requestToolbarAction("new");
  if (el.print) el.print.onclick = () => requestToolbarAction("print");
  const btnBackTop = el.backTop;
  if (btnBackTop) {
    btnBackTop.onclick = () => {
      focusFinalizeControl(el.submit);
      setStatus("Focused Save draft & submit — finish entry, then finalize.");
    };
  }

  if (el.commitGate) {
    wireCommitGateChrome(commitGateEls(), {
      onResolveChoice: (choice) => resolveCommitGate(choice),
      onCancelOutside: () => cancelCommitGateFromOutside(),
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
        modalAlreadyOpen: sourceModalOpenRef.current,
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
      openSourcePicker(undefined, { trigger: "toolbar" });
    };
  }

  const btnRetry = el.retry;
  if (btnRetry) {
    btnRetry.onclick = async () => {
      if (!api || !api.retryLoad) return;
      setStatus(`Retrying Vanilla ${docTitle()} load…`);
      await api.retryLoad();
    };
  }

  if (el.save) el.save.onclick = () => doSave(false);
  if (el.submit) el.submit.onclick = () => doSave(true);

  if (el.taxAccount) {
    mountDocLinkPicker(el.taxAccount, "Account", async (v) => {
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

  wireItemImportButton({
    button: el.importItems,
    getItemCols: () => (ui ? ui.itemCols : []),
    getApi: () => api,
    isEditable: () => editable(),
    getCurrentRowCount: () =>
      lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items.length : 0,
    onApplied: (result) => {
      noteUserEdit();
      if (result.scratch) scratch = result.scratch;
      paint(result.doc || lastDoc, result.scratch || scratch);
    },
    setStatus,
    testId: "doc-import",
  });

  if (el.attach) el.attach.onclick = () => attachFileAction();
  if (el.attachToolbar) el.attachToolbar.onclick = () => attachFileAction();

  if (el.memo) {
    el.memo.addEventListener("change", () => onHeaderBlur(el.memo));
  }
  if (el.termsText) {
    el.termsText.addEventListener("change", () => onHeaderBlur(el.termsText));
  }
}

async function ensureUiConfig() {
  if (!api || !api.getUi) return false;
  const config = await api.getUi();
  if (!config) return false;
  const rebuild = !ui || ui.profileId !== config.profileId;
  if (rebuild) {
    applyUiConfig(config);
  } else {
    ui = config;
    document.title = ui.title;
    if (el.title) el.title.textContent = ui.title;
    if (el.find) el.find.textContent = ui.findLabel;
    if (el.newDoc) el.newDoc.textContent = ui.newLabel;
  }
  return true;
}

export async function bootDocFormPage(injectedApi) {
  api = injectedApi;
  el = buildDocFormEl();
  if (!api) {
    setStatus("Doc API unavailable — preload missing.", "err");
    return;
  }
  wireStaticControls();

  docCapsUi = wireDocCapsUi({
    capsButton: el.caps,
    getCapsOn: () => docCapsOn,
    setCapsOn: (v) => {
      docCapsOn = v;
    },
  });

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
  installFocusRing();
}
