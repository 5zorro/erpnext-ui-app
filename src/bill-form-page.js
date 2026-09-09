/**
 * Bill Doc page controller — tranche 10 (from bill.html).
 */

import {
  readBillHeader,
  amountDueChecksumChip,
  amountDueGrandPointer,
  amountDueMatchesGrandTotal,
  billCompareTotal,
  billMoneyStack,
  sumBillLineQty,
  sumBillLineAmount,
  formatBillLineTotal,
  BILL_ITEM_COLS,
  BILL_ASSUMPTIONS,
  BILL_VANILLA_TAB_NOTES,
  isDraftBillDoc,
  saveActionsBlockedByChecksum,
  shouldShowAmountDueSticky,
  linkedPurchaseOrdersForBill,
  linkedPurchaseReceiptsForBill,
} from "../src/bill-map.js";
import { ALLOC_SALES_ORDERS_FIELD } from "../src/bill-line-allocation.js";
import {
  buildBillItemRowModels,
  sortBillItemRowModels,
  BILL_ITEM_SORTABLE_HEADERS,
  applyHeaderSortClick,
  sortHeaderArrow,
  sortHeaderState,
} from "../src/bill-item-table.js";
import {
  billFindPrefillFromDupeWarning,
  billRefCheckHasDupeWarning,
} from "../src/bill-find-prefill.js";
import { billDueDateForPaint, dueDateMultiInstallmentHint, planDueDateScheduleSync } from "../src/bill-payment-schedule.js";
import {
  billRemarksPoSearchHint,
  shouldPrefillBillRemarksFromPo,
} from "../src/bill-remarks-po.js";
import {
  linkedSourcePeekRoute,
  canSoftPeekLinkedSourceRoute,
  linkedSourcePeekKindLabel,
} from "../src/source-doc-peek.js";
import {
  isCreditMemoBill,
  creditMemoReturnAgainst,
  creditMemoOrphaned,
  parseBillLinkToken,
  withBillLinkToken,
  parseSoLinkToken,
  withSoLinkToken,
  planCreditMemoSource,
} from "../src/credit-memo.js";
import {
  evaluateBillRef,
  billRefWaitingForVendorResult,
  resolveBillRefSupplier,
} from "../src/bill-ref-check.js";
import {
  isPaidChecked,
  isPaidToggleWrites,
  DEFAULT_CREDIT_CARD_MODE_OF_PAYMENT,
  billDocStatusBadge,
  billCanAddPayment,
} from "../src/bill-paid.js";
import {
  isAllocatableChargeRow,
  planChargeToStockAllocation,
  taxRowDeleteAllowed,
} from "../src/bill-charge-allocate.js";
import {
  BILL_TAX_SORTABLE_HEADERS,
  readBillTaxRowsForSort,
  sortBillTaxRows,
  billTaxesSubtotal,
  applyHeaderSortClick as applyTaxHeaderSortClick,
  sortHeaderArrow as taxSortHeaderArrow,
  sortHeaderState as taxSortHeaderState,
} from "../src/bill-tax-sort.js";
import {
  shouldBlockDeleteLastItemRow,
  emptyItemRowCleanupAction,
  LAST_ITEM_ROW_TOAST,
  isEmptyItemCode,
} from "../src/bill-item-guard.js";
import {
  billRowHasSource,
  formatQtyForErp,
  humanizeBillErpMessage,
  isOverBillingError,
  listOverbillCapCacheBlockers,
  OVERBILL_CAP_CACHE_BLOCKER,
  planBillLineQtySplit,
  saveFailureIsOverBilling,
} from "../src/bill-po-qty-split.js";
import { billDueDateFieldMode } from "../src/bill-due-date.js";
import {
  billAddressRoleMeta,
  addressPickerOpenDecision,
} from "../src/bill-address.js";
import {
  showAddressPickerModal,
  wireAddressPickerFields,
  syncAddressPickerLock,
} from "../src/address-picker-ui.js";
import { addressTextareaRows } from "../src/address-format.js";
import {
  docLifecyclePill,
  focusFinalizeControl,
  flushPendingFieldEdits,
  isNewBlankDocName,
  REFRESH_BUTTON_TITLE,
} from "../src/doc-chrome.js";
import {
  formatGroupedNumber,
  formatUsdAmount,
  formatUsdAmountHtml,
  formatSignedUsdHtml,
  parseMoney,
} from "../src/money.js";
import {
  linkDoctypeForBillField,
} from "../src/link-search.js";
import {
  accountCompanyMismatchPickMessage,
} from "../src/account-company.js";
import {
  nextItemFocusAfterEdit,
} from "../src/link-picker-policy.js";
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
} from "../src/item-table-nav.js";
import { wireDocCapsUi } from "../src/doc-caps-ui.js";
import { mountLinkPicker } from "../src/link-picker-ui.js";
import { showSourceModal } from "../src/source-modal-ui.js";
import {
  buildCreditSourceGroups,
  buildCreditSourceLoadingGroups,
  buildCreditSourceErrorGroups,
  classifyCreditSourceChoice,
} from "../src/source-modal-credit-mode.js";
import {
  runSourcePickerFlow,
  mayAutoOpenSourcePicker,
} from "../src/source-picker-flow.js";
import {
  paintCommitGateValidation,
  setCommitGateBusy,
  commitGateTitleText,
  showCommitGate,
  hideCommitGateEl,
  wireCommitGateChrome,
} from "../src/doc-commit-gate-ui.js";
import { shouldForceCapsOnElement, applyDocCapsValue } from "../src/doc-caps.js";
import { shouldOpenSourceModalAfterVendorPick, runVendorPickWithSourceModal } from "../src/doc-source-flow.js";
import { focusTargetAfterSourceModal } from "../src/bill-source-flow.js";
import { collectBillSourceRefs, sourceTermsDisplayBlocks } from "../src/doc-source-terms.js";
import { paintSourceTermsFields } from "../src/doc-source-terms-dom.js";
import {
  valuesMeaningfullyEqual,
  dirtyCompareKindForField,
  normalizeEditableText,
} from "../src/dirty-gate.js";
import {
  paintHeaderInputIfAllowed,
  paintHeaderLinkInputIfAllowed,
} from "../src/bill-header-paint.js";
import {
  filterDateInputValue,
  isAllowedDateInputChar,
  parseDocDate,
  formatDocDateDisplay,
} from "../src/doc-date.js";
import {
  shouldOpenCommitGate,
  normalizeCommitGateChoice,
  commitGateAllowsAction,
} from "../src/bill-toolbar.js";
import {
  commitGateProgressLabel,
  commitGateSuccessLabel,
  listLocalSaveBlockers,
  commitGateSaveWarning,
  commitGateSaveEnabled,
  reduceCommitGatePhase,
  billExpensesTaxOrientation,
  gateTriggerLabel,
  nextAfterGate,
  commitGateErpFailureView,
  formatSaveFailureReason,
} from "../src/bill-action-flow.js";
import { mergeSaveBlockers } from "../src/erp-form-bridge.js";
import {
  formatSalesOrderPickerLabel,
} from "../src/so-picker.js";
import { createFieldCalcUi } from "../src/calc/attach-field-calc.js";
import { rateFromBackedInAmount } from "../src/calc/back-in-amount.js";
import {
  taxAmountFromRate,
  taxRateBaseFromDoc,
  displayTaxRateForRow,
} from "../src/bill-tax-sync.js";
import {
  applyDocWashToDocument,
  setDocWashVariant,
  setWashSourceAttr,
  washRoleForSourceKind,
} from "../src/doc-wash.js";
import { wireItemImportButton } from "../src/item-import-ui.js";
import { formatDueDateSettleLog } from "../src/bill-payment-terms-settle.js";
import { installFocusRing, logFocus } from "../src/focus-debug-client.js";
import { captureBillFocus, restoreBillFocus } from "../src/bill-focus-guard.js";
import { shouldScheduleInvoiceDateFocus } from "../src/stale-focus-guard.js";
import { LINKED_SOURCE_LOADING_PLACEHOLDER } from "../src/bill-enrich-pending.js";
import { uiIconHtml } from "../src/ui-icons.js";
import {
  isTaxTableNavField,
  neighborTaxCell,
  nextTaxAddRowTabTarget,
  nextTaxCellTab,
} from "../src/bill-tax-table-nav.js";

export async function bootBillFormPage(api) {
  if (!api) throw new Error('Bill API missing');

  applyDocWashToDocument(document, { profileId: "bill" });

  let lastDoc = null;
  let amountDue = "";
  let amountDueAtFocus = "";
  let painting = false;
  /** ALL-CAPS entry — default ON each Bill open (OI-111); page toggle only. */
  let docCapsOn = true;
  /** @type {{ syncCapsButton: () => void }|null} */
  let docCapsUi = null;
  /** Suppress change while Tab keydown commits the item cell. */
  let itemTabGuard = false;
  /** Suppress blur while Tab/arrow moves between tax cells. */
  let taxTabGuard = false;
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

  let userEdited = false;
  /** @type {"find"|"new"|"print"|null} */
  let pendingGate = null; // GateTrigger | null — SSoT for the one commit-gate
  /** @type {string[]} live ERP meta mandatory blockers from last preflight */
  let metaBlockers = [];
  /** @type {string[]} Account company ≠ Bill company (OI-141) */
  let accountCompanyBlockers = [];
  let metaPreflightSeq = 0;
  /** @type {WeakMap<HTMLElement, true>} */
  const linkMounted = new WeakMap();
  /** Prevent stacking multiple source modals. */
  const sourceModalOpenRef = { current: false };
  /** One auto-open session per vendor link pick — closed flag is SSoT (source-picker-flow). */
  /** @type {{ supplier: string, userClosed: boolean } | null} */
  let vendorPickSourceSession = null;
  /** Coalesce parallel openSourcePicker calls for same supplier. */
  /** @type {Promise<{ ok?: boolean, kind?: string, reason?: string }|void>|null} */
  let sourcePickerInflight = null;
  /** @type {string} */
  let sourcePickerInflightSupplier = "";
  let allocationPickerOpen = false;
  /** True while the credit-memo informal-link picker (Bill or Sales Order) is open. */
  let informalLinkPickerOpen = false;
  /** True while OI-140 → Stock allocate dialog is open (freeze tax × deletes). */
  let allocateChargeModalOpen = false;
  /** @type {Record<number, object>} */
  let lineAllocations = {};
  /** @type {Record<number, object>} */
  let poLineMeta = {};
  /** @type {import("../src/bill-enrich-pending.js").BillEnrichPending|null} */
  let lastEnrichPending = null;
  /** @type {Array<{ name: string, title: string }>} */
  let lastLinkedPos = [];
  /** @type {Array<{ name: string, lrNo: string }>} */
  let lastLinkedReceipts = [];
  /** Last ERP doc name painted — detect Bill→Bill nav and force-clear stale header shell. */
  let paintedBillDocName = "";
  /** @type {{ key: string, asc: boolean }} */
  /** @type {import("../src/item-sort-specs.js").SortSpec[]} */
  let itemSortSpecs = [{ key: "lineNo", asc: true }];
  /** @type {import("../src/item-sort-specs.js").SortSpec[]} */
  let taxSortSpecs = [{ key: "lineNo", asc: true }];
  let itemsHeadWired = false;
  let taxesHeadWired = false;
  /** @type {Promise<void>|null} */
  let lineApplyInFlight = null;
  /** @type {boolean} */
  let saveInFlight = false;
  const calcUi = createFieldCalcUi({
    overlay: document.getElementById("calc-overlay"),
    exprEl: document.getElementById("calc-expr"),
    resultEl: document.getElementById("calc-result"),
    historyEl: document.getElementById("calc-history"),
    getHistory: () => (api && api.getCalcHistory ? api.getCalcHistory() : Promise.resolve([])),
    copyHistory: (id, mode) =>
      api && api.copyCalcHistory ? api.copyCalcHistory(id, mode) : Promise.resolve({ ok: false }),
  });
  
  /**
   * Max billable qty from enrich/merge cache only (OI-151 — no JIT fetch at qty commit or save).
   * @param {number} ri
   * @returns {number|null}
   */
  function cachedMaxBillableForRow(ri) {
    const meta = poLineMeta[ri] ?? poLineMeta[String(ri)];
    if (meta && meta.maxBillableQty != null) {
      const n = Number(meta.maxBillableQty);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  /**
   * @returns {string[]}
   */
  function listPoCapCacheBlockers() {
    return listOverbillCapCacheBlockers(
      lastDoc && lastDoc.items,
      (ri) => cachedMaxBillableForRow(ri),
    );
  }

  /**
   * Load maxBillableQty for a sourced row — poLineMeta cache only.
   * @param {number} ri
   * @returns {Promise<number|null>}
   */
  async function fetchMaxBillableForRow(ri) {
    return cachedMaxBillableForRow(ri);
  }

  /**
   * @param {number} ri
   * @param {Extract<ReturnType<typeof planBillLineQtySplit>, { action: "split" }>} plan
   */
  async function executeSplitPlan(ri, plan) {
    setStatus("Over PO limit — capping sourced line and adding NIC excess…");
    const sourcedRes = await api.setItem(ri, "qty", formatQtyForErp(plan.sourcedQty));
    if (!sourcedRes || !sourcedRes.ok) {
      setStatus((sourcedRes && sourcedRes.reason) || "Could not cap PO line qty.", "err");
      return { ok: false, handled: true };
    }
    noteUserEdit();
    let doc = sourcedRes.doc;

    const added = await api.addItem();
    if (!added || !added.ok) {
      paint(doc, amountDue);
      setStatus(
        (added && added.reason) || "Capped line but could not add excess row.",
        "warn",
      );
      return { ok: false, handled: true, doc };
    }
    doc = added.doc;
    const newRi =
      doc && Array.isArray(doc.items) ? Math.max(0, doc.items.length - 1) : ri + 1;

    /** @type {Array<[string, string]>} */
    const steps = [
      ["item_code", plan.itemCode],
      ["qty", formatQtyForErp(plan.excessQty)],
    ];
    if (plan.rate != null && plan.rate !== "") steps.push(["rate", String(plan.rate)]);
    if (plan.uom != null && String(plan.uom).trim() !== "") {
      steps.push(["uom", String(plan.uom).trim()]);
    }
    if (plan.excessDescription) steps.push(["description", plan.excessDescription]);

    for (const [field, value] of steps) {
      const res = await api.setItem(newRi, field, value);
      if (!res || !res.ok) {
        paint(doc, amountDue);
        setStatus(
          (res && res.reason) || `Could not set ${field} on excess row.`,
          "warn",
        );
        return { ok: false, handled: true, doc };
      }
      doc = res.doc;
    }

    noteUserEdit();
    paint(doc, amountDue);
    setStatus(
      `Split: ${formatQtyForErp(plan.sourcedQty)} on PO line; +${formatQtyForErp(plan.excessQty)} on new NIC row — approval required.`,
      "warn",
    );
    focusItemCell(newRi, "qty", { mode: CELL_MODE_NAV });
    return { ok: true, handled: true, doc };
  }

  /**
   * OI-151 P3 — cap PO/PR-sourced qty and auto-add NIC row for excess.
   * @param {number} ri
   * @param {string} rawQty
   * @returns {Promise<boolean>} true when split/blocked handled (skip normal apply)
   */
  async function maybeSplitQtyOverPoLimit(ri, rawQty) {
    if (!api || !lastDoc || !Array.isArray(lastDoc.items)) return false;
    const row = lastDoc.items[ri];
    if (!row || !billRowHasSource(row)) return false;

    const cap = await fetchMaxBillableForRow(ri);
    if (cap == null) {
      setStatus(OVERBILL_CAP_CACHE_BLOCKER, "warn");
      return true;
    }
    const plan = planBillLineQtySplit(row, cap, rawQty);
    if (plan.action === "blocked") {
      setStatus(plan.reason, "warn");
      return true;
    }
    if (plan.action !== "split") return false;
    if (!plan.itemCode) {
      setStatus("Set Item before qty over PO limit.", "warn");
      return true;
    }
    const res = await executeSplitPlan(ri, plan);
    return res.handled;
  }

  /**
   * Save-time repair when enrich missed caps — split every sourced row over PO limit.
   * @returns {Promise<{ repaired: number }>}
   */
  async function repairAllOverbillRows() {
    if (!api || !lastDoc || !Array.isArray(lastDoc.items)) return { repaired: 0 };
    let repaired = 0;
    let doc = lastDoc;
    for (let ri = doc.items.length - 1; ri >= 0; ri -= 1) {
      const row = doc.items[ri];
      if (!row || !billRowHasSource(row)) continue;
      const cap = await fetchMaxBillableForRow(ri);
      const plan = planBillLineQtySplit(row, cap, row.qty);
      if (plan.action !== "split" || !plan.itemCode) continue;
      const res = await executeSplitPlan(ri, plan);
      if (res.ok) {
        repaired += 1;
        if (res.doc) doc = res.doc;
      }
    }
    if (repaired > 0) lastDoc = doc;
    return { repaired };
  }

  /**
   * @param {HTMLInputElement} inp
   * @param {{ kind: string, onCommit: (value: string) => void | Promise<void> }} opts
   */
  function wireFieldCalc(inp, opts) {
    calcUi.attach(inp, {
      kind: opts.kind,
      onCommit: opts.onCommit,
      isPainting: () => painting,
      isEditable: () => editable(),
      commitOnIdleBlur: !!opts.commitOnIdleBlur,
      onHistory: (payload) => {
        if (!api || !api.appendCalcHistory) return;
        api.appendCalcHistory({
          ...payload,
          sourceLabel: "Bill entry",
        });
      },
    });
  }
  
  function clearFieldCalc(prior) {
    calcUi.clear(prior);
  }
  
  const el = {
    status: document.getElementById("status"),
    docTitle: document.getElementById("doc-title"),
    vendor: document.getElementById("f-vendor"),
    shipFrom: document.getElementById("f-ship-from"),
    shipTo: document.getElementById("f-ship-to"),
    billingAddress: document.getElementById("f-billing-address"),
    terms: document.getElementById("f-terms"),
    sourceTermsBlock: document.getElementById("source-terms-block"),
    sourceTermsFields: document.getElementById("source-terms-fields"),
    isPaid: document.getElementById("f-is-paid"),
    mop: document.getElementById("f-mop"),
    cashBank: document.getElementById("f-cash-bank"),
    paidAmount: document.getElementById("f-paid-amount"),
    alreadyPaidFields: document.getElementById("already-paid-fields"),
    alreadyPaidSection: document.getElementById("already-paid"),
    paymentsSection: document.querySelector("[data-testid='bill-payments-section']"),
    docStatusBadge: document.getElementById("doc-status-badge"),
    appliedPayments: document.getElementById("applied-payments"),
    appliedPaymentsBody: document.getElementById("applied-payments-body"),
    appliedPaymentsEmpty: document.getElementById("applied-payments-empty"),
    addPayment: document.getElementById("btn-add-payment"),
    landedCost: document.getElementById("btn-landed-cost"),
    date: document.getElementById("f-date"),
    billno: document.getElementById("f-billno"),
    refStatus: document.getElementById("ref-status"),
    refEmoji: document.getElementById("ref-emoji"),
    refWarn: document.getElementById("ref-warn"),
    amountdue: document.getElementById("f-amountdue"),
    dueStatus: document.getElementById("due-status"),
    dueEmoji: document.getElementById("due-emoji"),
    dueMoney: document.getElementById("due-money"),
    dueGrand: document.getElementById("due-grand"),
    dueSticky: document.getElementById("due-sticky"),
    dueStickyEmoji: document.getElementById("due-sticky-emoji"),
    dueStickyMoney: document.getElementById("due-sticky-money"),
    duedate: document.getElementById("f-duedate"),
    dueDateHint: document.getElementById("due-date-hint"),
    linkedPoBlock: document.getElementById("linked-po-block"),
    memo: document.getElementById("f-memo"),
    items: document.getElementById("items-body"),
    lineTotals: document.getElementById("line-totals"),
    totQty: document.getElementById("tot-qty"),
    totAmt: document.getElementById("tot-amt"),
    save: document.getElementById("btn-save"),
    submit: document.getElementById("btn-submit"),
    revert: document.getElementById("btn-revert"),
    find: document.getElementById("btn-find"),
    newBill: document.getElementById("btn-new"),
    creditMemo: document.getElementById("btn-credit-memo"),
    creditMemoToggleSection: document.getElementById("credit-memo-toggle"),
    isReturn: document.getElementById("f-is-return"),
    creditLinksBlock: document.getElementById("credit-links-block"),
    creditLinkBillValue: document.getElementById("credit-link-bill-value"),
    creditLinkSoValue: document.getElementById("credit-link-so-value"),
    informalLinkBill: document.getElementById("btn-informal-link-bill"),
    informalLinkSo: document.getElementById("btn-informal-link-so"),
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
    addSource: document.getElementById("btn-add-source"),
    importItems: document.getElementById("btn-import-items"),
    clearQty: document.getElementById("btn-clear-qty"),
    attach: document.getElementById("btn-attach"),
    taxesBody: document.getElementById("taxes-body"),
    taxesAdd: document.getElementById("taxes-add"),
    taxAccount: document.getElementById("f-tax-account"),
    taxAmount: document.getElementById("f-tax-amount"),
    addTax: document.getElementById("btn-add-tax"),
    toast: document.getElementById("bill-toast"),
    msItems: document.getElementById("ms-items"),
    msTaxes: document.getElementById("ms-taxes"),
    msGrand: document.getElementById("ms-grand"),
    msNote: document.getElementById("ms-note"),
    tabItems: document.getElementById("tab-items"),
    tabExpenses: document.getElementById("tab-expenses"),
    caps: document.getElementById("btn-caps"),
    panelItems: document.getElementById("panel-items"),
    panelExpenses: document.getElementById("panel-expenses"),
    expenseNote: document.querySelector("[data-testid='bill-expense-note']"),
  };
  if (el.docTitle) el.docTitle.textContent = "Bill";
  
  function commitGateEls() {
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
    return {
      api,
      linkMounted,
      setStatus,
      onBeforePick: (value, doctype, btn) => {
        if (doctype !== "Account") return;
        if (btn && btn.getAttribute("data-company-mismatch") === "1") {
          setStatus(
            accountCompanyMismatchPickMessage({
              account: value,
              accountCompany: btn.getAttribute("data-account-company") || "",
              billCompany: lastDoc && lastDoc.company,
            }),
            "warn",
          );
        }
      },
      optionDataAttrs: (o) => ({
        "data-company-mismatch": o.companyMismatch ? "1" : "",
        "data-account-company": o.company != null ? String(o.company) : "",
      }),
    };
  }
  
  function mountBillLinkPicker(input, doctype, onPicked, opts = {}) {
    mountLinkPicker(input, doctype, onPicked, linkPickerDeps(), opts);
  }
  
  const assumptionsUl = document.getElementById("assumptions-list");
  assumptionsUl.innerHTML = BILL_ASSUMPTIONS.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const vanillaTabsUl = document.getElementById("vanilla-tabs-list");
  if (vanillaTabsUl) {
    vanillaTabsUl.innerHTML = BILL_VANILLA_TAB_NOTES.map(
      (t) =>
        `<li><span class="vanilla-tab">${escapeHtml(t.tab)}</span> — ${escapeHtml(t.note)}</li>`,
    ).join("");
  }
  if (el.expenseNote) {
    const orient = billExpensesTaxOrientation();
    el.expenseNote.replaceChildren();
    const lead = document.createElement("span");
    lead.textContent =
      "This ERP is items-based — expense lines on Bills are added in two ways:";
    const list = document.createElement("ol");
    const li1 = document.createElement("li");
    li1.append(
      document.createTextNode(
        "via an Item (Chart-of-Accounts-mapped items) added as a row to the items table that this is attached to (",
      ),
    );
    const jumpItems = document.createElement("a");
    jumpItems.href = "#";
    jumpItems.dataset.testid = "bill-jump-items";
    jumpItems.textContent = orient.itemsJumpLabel || "click here";
    jumpItems.addEventListener("click", (ev) => {
      ev.preventDefault();
      setLineTab("items");
    });
    li1.append(jumpItems, document.createTextNode(")."));
    const li2 = document.createElement("li");
    li2.append(document.createTextNode("via Vendor tax/freight in the "));
    const jumpTaxes = document.createElement("a");
    jumpTaxes.href = "#bill-taxes-block";
    jumpTaxes.id = "jump-taxes";
    jumpTaxes.dataset.testid = "bill-jump-taxes";
    jumpTaxes.textContent = "Taxes and Charges section below";
    jumpTaxes.addEventListener("click", (ev) => {
      ev.preventDefault();
      setLineTab("items");
      const block = document.getElementById("bill-taxes-block");
      if (block && typeof block.scrollIntoView === "function") {
        block.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    li2.append(jumpTaxes, document.createTextNode(" (related accounting)."));
    list.append(li1, li2);
    el.expenseNote.append(lead, list);
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
  
  function setStatus(text, cls) {
    el.status.textContent = text;
    el.status.className = "status" + (cls ? " " + cls : "");
  }

  function scrollStatusIntoView() {
    if (el.status) {
      try {
        el.status.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch {
        el.status.scrollIntoView();
      }
    }
  }

  function scrollToBillItems() {
    if (el.tabItems && el.panelExpenses && el.panelExpenses.hidden === false) {
      el.tabItems.click();
    }
    const target =
      document.querySelector('[data-testid="bill-lines-section"]') || el.panelItems;
    if (target) {
      try {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        target.scrollIntoView();
      }
    }
  }

  /**
   * @param {string} text
   * @param {(() => void)|null} [onClick]
   * @param {number} [ms]
   */
  function showBlockingToast(text, onClick, ms = 8000) {
    if (!el.toast) {
      scrollStatusIntoView();
      setStatus(text, "err");
      return;
    }
    if (toastTimer) clearTimeout(toastTimer);
    el.toast.hidden = false;
    el.toast.textContent = text;
    el.toast.classList.remove("fade-out");
    el.toast.classList.add("show");
    if (onClick) {
      el.toast.classList.add("is-action");
      el.toast.onclick = () => {
        onClick();
        scrollStatusIntoView();
      };
    } else {
      el.toast.classList.remove("is-action");
      el.toast.onclick = null;
    }
    toastTimer = setTimeout(() => {
      el.toast.classList.add("fade-out");
      el.toast.classList.remove("is-action");
      el.toast.onclick = null;
      toastTimer = setTimeout(() => {
        el.toast.classList.remove("show", "fade-out");
        el.toast.hidden = true;
        el.toast.textContent = "";
        toastTimer = null;
      }, 650);
    }, ms);
  }

  /**
   * @param {string} reason
   * @param {string[]|undefined} blockers
   */
  function announceSaveBlocker(reason, blockers) {
    scrollStatusIntoView();
    const rawTexts = [reason, ...(Array.isArray(blockers) ? blockers : [])]
      .filter(Boolean)
      .map(String);
    const texts = rawTexts.map(humanizeBillErpMessage).filter(Boolean);
    const msg = texts[0] || "Save blocked — fix validation issues.";
    if (rawTexts.some((t) => t === OVERBILL_CAP_CACHE_BLOCKER)) {
      showBlockingToast("PO limits still loading — wait for source columns, then Save again.", () => {
        scrollToBillItems();
      });
    } else if (rawTexts.some(isOverBillingError)) {
      showBlockingToast("Over PO limit — click to review items (excess must be a NIC row).", () => {
        scrollToBillItems();
      });
    } else {
      showBlockingToast("Blocking validation — click to see details at top.", () => {
        scrollStatusIntoView();
      });
    }
    setStatus(msg, "err");
  }
  
  /** @type {ReturnType<typeof setTimeout>|null} */
  let toastTimer = null;
  /**
   * Fading notice (last-row delete, etc.).
   * @param {string} text
   * @param {number} [ms]
   */
  function showToast(text, ms = 3200) {
    if (!el.toast) {
      setStatus(text, "warn");
      return;
    }
    if (toastTimer) clearTimeout(toastTimer);
    el.toast.hidden = false;
    el.toast.textContent = text;
    el.toast.classList.remove("fade-out");
    el.toast.classList.add("show");
    toastTimer = setTimeout(() => {
      el.toast.classList.add("fade-out");
      toastTimer = setTimeout(() => {
        el.toast.classList.remove("show", "fade-out");
        el.toast.hidden = true;
        el.toast.textContent = "";
        toastTimer = null;
      }, 650);
    }, ms);
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
      paint(res.doc, amountDue);
    }
  }
  
  /**
   * Remove blank Item rows when the clerk dismisses the picker / leaves the cell.
   * @param {number} rowIndex
   * @param {string} itemCode
   */
  function focusAfterLeavingItemsTable() {
    if (el.addLine) el.addLine.tabIndex = -1;
    try {
      if (el.taxAccount && !el.taxAccount.readOnly) {
        el.taxAccount.focus();
        return;
      }
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
  
  async function cleanupEmptyItemRow(rowIndex, itemCode) {
    if (!api || !editable() || painting || itemTabGuard) return;
    const rowCount =
      lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items.length : 0;
    const decision = emptyItemRowCleanupAction(rowCount, itemCode);
    if (decision.action !== "delete") return;
    setStatus("Removing empty line…");
    const removed = await api.deleteItem(rowIndex);
    if (removed && removed.ok) {
      noteUserEdit();
      paint(removed.doc, amountDue);
      setStatus("Empty line removed.");
      focusAfterLeavingItemsTable();
    } else if (removed && removed.blockedLastRow) {
      showToast(removed.reason || LAST_ITEM_ROW_TOAST);
    }
  }
  
  function paintDirtyPill() {
    if (!el.dirtyPill) return;
    const pill = docLifecyclePill({
      isDraft: !lastDoc || isDraftBillDoc(lastDoc),
      userEdited,
      isNewBlank: (!lastDoc || isDraftBillDoc(lastDoc)) && isNewBlankDocName(lastDoc && lastDoc.name),
    });
    el.dirtyPill.textContent = pill.text;
    el.dirtyPill.title = pill.title;
    el.dirtyPill.className = "dirty-pill tone-" + pill.tone + (userEdited ? " is-dirty" : "");
  }
  
  function noteUserEdit() {
    userEdited = true;
    paintDirtyPill();
  }
  
  function hideCommitGate() {
    pendingGate = null;
    hideCommitGateEl(commitGateEls());
    setGateBusy(false);
  }
  
  function currentSaveBlockers() {
    return mergeSaveBlockers(
      listLocalSaveBlockers({
        amountDue,
        doc: lastDoc,
        supplier: el.vendor && el.vendor.value,
      }),
      accountCompanyBlockers,
      metaBlockers,
    );
  }
  
  // One gate, opened by either a toolbar action or a navigation (SSoT).
  function openGate(trigger) {
    // Last click wins: releasing a superseded nav waiter so main can't leak it.
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
      el.commitGateTitle.textContent = commitGateTitleText(gateTriggerLabel(trigger));
    }
    refreshCommitGateHint();
    showCommitGate(commitGateEls(), {
      focusSurface: () => {
        if (api && api.focusBillSurface) api.focusBillSurface();
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
    if (!api) return;
    const seq = ++metaPreflightSeq;
    try {
      const jobs = [];
      if (api.listMandatory) jobs.push(api.listMandatory());
      else jobs.push(Promise.resolve(null));
      if (api.checkAccountCompanies) jobs.push(api.checkAccountCompanies());
      else jobs.push(Promise.resolve(null));
      const [mand, acct] = await Promise.all(jobs);
      if (seq !== metaPreflightSeq) return; // superseded
      metaBlockers = mand && Array.isArray(mand.blockers) ? mand.blockers : [];
      accountCompanyBlockers =
        acct && Array.isArray(acct.blockers) ? acct.blockers.filter(Boolean) : [];
    } catch {
      if (seq !== metaPreflightSeq) return;
      metaBlockers = [];
      accountCompanyBlockers = [];
    }
    if (pendingGate && el.commitGate && !el.commitGate.hidden) {
      refreshCommitGateHint();
    }
  }
  
  function gateIsNewBill() {
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
      toolbarAction: pendingGate && pendingGate.kind === "toolbar" ? pendingGate.action : "",
      isNewDoc: gateIsNewBill(),
      docTitle: "Bill",
      getSaveBlockers: currentSaveBlockers,
    });
  }
  
  function refreshCommitGateHint() {
    const blockers = currentSaveBlockers();
    paintCommitGateValidation(commitGateEls(), {
      blockers,
      blocked: blockers.length > 0,
      title: blockers.length
        ? "Save is blocked by:"
        : "Doc Bill + live ERP meta preflight passed",
      cancelHint: "Choose Cancel to return to the Bill and fix these fields.",
      saveWarning: () => commitGateSaveWarning(blockers),
    });
    setGateBusy(false);
  }
  
  async function runPendingAction(action, trigger = null) {
    if (!api) return;
    if (action === "find") {
      const prefill =
        trigger && trigger.findPrefill && typeof trigger.findPrefill === "object"
          ? trigger.findPrefill
          : {};
      const hasPrefill = !!(prefill.billNo && String(prefill.billNo).trim());
      setStatus(hasPrefill ? "Opening Bill list with Ref filter…" : "Opening Bill list…");
      const res = await api.findBills(prefill);
      try {
        if (document.activeElement && typeof document.activeElement.blur === "function") {
          document.activeElement.blur();
        }
      } catch {
        /* ignore */
      }
      // Re-assert filter focus after Find IPC (chrome WebContents can steal OS focus).
      let post = null;
      if (res && res.ok && api.refocusListFilter) {
        try {
          post = await api.refocusListFilter(res.focusField || "bill_no");
        } catch {
          /* ignore */
        }
      }
      if (!(res && res.ok)) setStatus((res && res.reason) || "Find failed.", "err");
      else if (res.focusOk === false || (post && post.ok === false)) {
        setStatus(res.reason || post?.reason || "Bill list opened (filter focus missed).", "warn");
      } else if (res.prefilled) {
        setStatus(res.reason || "Bill list opened with Ref / vendor filters.");
      } else setStatus("Bill list opened — type in Supplier Invoice No.");
      return;
    }
    if (action === "new") {
      setStatus("Starting new Bill…");
      const res = await api.newBill();
      if (res && res.ok) {
        setStatus("New Bill.");
        focusVendorField();
      } else setStatus((res && res.reason) || "New Bill failed.", "err");
      return;
    }
    if (action === "print") {
      setStatus("Opening print…");
      const res = await api.printBill();
      if (res && res.ok) setStatus(res.reason || "Print opened.");
      else setStatus((res && res.reason) || "Print failed.", "err");
      return;
    }
    if (action === "edit-vendor-addresses") {
      const sup =
        (trigger && trigger.supplier) ||
        normalizeEditableText(lastDoc && lastDoc.supplier) ||
        normalizeEditableText(el.vendor && el.vendor.value);
      if (!sup) {
        setStatus("No vendor — cannot open Supplier addresses.", "warn");
        return;
      }
      setStatus("Opening vendor to edit addresses…");
      const res = await api.openSupplierForm(sup);
      if (res && res.ok === false) {
        setStatus((res && res.reason) || "Could not open Supplier.", "err");
      } else {
        setStatus("Vanilla Supplier opened — edit Addresses, then return to Bill.");
      }
    }
  }
  
  async function requestToolbarAction(action, extra = null) {
    if (!api) return;
    const trigger =
      extra && typeof extra === "object"
        ? { kind: "toolbar", action, ...extra }
        : { kind: "toolbar", action };
    if (!shouldOpenCommitGate(userEdited)) {
      hideCommitGate();
      await runPendingAction(action, trigger);
      return;
    }
    openGate(trigger);
  }

  function openFindFromRefDupeWarning() {
    if (!billRefCheckHasDupeWarning(lastRefCheckResult)) return;
    const billNo = el.billno ? el.billno.value : "";
    const supplier = resolveSupplierForRefCheck();
    const prefill = billFindPrefillFromDupeWarning({ billNo, supplier });
    if (!prefill) return;
    void requestToolbarAction("find", { findPrefill: prefill });
  }
  
  async function resolveCommitGate(choiceRaw) {
    const choice = normalizeCommitGateChoice(choiceRaw);
    const trigger = pendingGate;
    const navToken = trigger && trigger.kind === "nav" ? trigger.navToken : null;
  
    // Cancel / unknown / nothing pending → stay; release any nav waiter in main.
    if (!trigger || !choice || choice === "cancel") {
      hideCommitGate();
      if (navToken && api && api.resolveNavGate) api.resolveNavGate(navToken, false);
      return;
    }
  
    // Toolbar-only guard: e.g. Print on a brand-new (unsaved) Bill after discard.
    if (trigger.kind === "toolbar") {
      const isNew = gateIsNewBill();
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
  
    // Perform the chosen side effect. On failure, KEEP the gate open (no hang, no orphan).
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
      const continuesToFind =
        trigger.kind === "toolbar" && trigger.action === "find";
      if (!continuesToFind) {
        paint(res.doc, res.amountDue != null ? res.amountDue : "");
        paintDirtyPill();
      }
    } else if (choice === "save" || choice === "submit") {
      const blockers = currentSaveBlockers();
      if (!commitGateSaveEnabled(blockers)) {
        refreshCommitGateHint();
        announceSaveBlocker(blockers[0] || "Fix save prerequisites first.", blockers);
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
              listLocalSaveBlockers({
                amountDue,
                doc: lastDoc,
                supplier: el.vendor && el.vendor.value,
              }),
              accountCompanyBlockers,
              saveRes.blockers,
            ),
            blocked: true,
            title: "Save is blocked by:",
            hint: "Choose Cancel to return to the Bill and fix these fields.",
          });
        } else {
          paintCommitGateValidation(commitGateEls(), commitGateErpFailureView(reason));
        }
        announceSaveBlocker(reason, saveRes && Array.isArray(saveRes.blockers) ? saveRes.blockers : undefined);
        return;
      }
    }
  
    hideCommitGate();
    if (plan.then === "proceed-nav") {
      if (navToken && api && api.resolveNavGate) api.resolveNavGate(navToken, true);
    } else {
      await runPendingAction(trigger.action, trigger);
    }
  }
  
  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  
  /**
   * Attach typeahead + ▾ search for an ERP Link doctype.
   * Tab moves into the list; Enter selects highlighted (or sole) option.
   * @param {HTMLInputElement} input
   * @param {string} doctype
   * @param {(value: string) => void|Promise<void>} onPicked
   */
  let dueChipInView = true;
  /** @type {IntersectionObserver|null} */
  let dueChipObserver = null;
  
  function focusAmountDueField() {
    try {
      if (api && api.focusBillSurface) api.focusBillSurface();
    } catch {
      /* ignore */
    }
    const tryFocus = () => {
      try {
        if (!el.amountdue) return;
        el.amountdue.scrollIntoView({ behavior: "smooth", block: "center" });
        el.amountdue.focus({ preventScroll: true });
        el.amountdue.select();
      } catch {
        try {
          el.amountdue && el.amountdue.focus();
        } catch {
          /* ignore */
        }
      }
    };
    tryFocus();
    setTimeout(tryFocus, 50);
  }
  
  function syncAmountDueSticky(chip) {
    if (!el.dueSticky) return;
    const show = shouldShowAmountDueSticky(chip && chip.status, dueChipInView);
    el.dueSticky.hidden = !show;
    if (!show) return;
    if (el.dueStickyEmoji) el.dueStickyEmoji.innerHTML = uiIconHtml((chip && chip.icon) || "alert");
    if (el.dueStickyMoney) {
      if (!chip || chip.moneyText === "—") el.dueStickyMoney.textContent = "—";
      else el.dueStickyMoney.innerHTML = formatSignedUsdHtml(chip.moneyText);
    }
    el.dueSticky.title =
      (chip && chip.title) || "Amount Due does not match Grand total — click to focus Amount Due";
  }
  
  function ensureDueChipObserver() {
    if (dueChipObserver || !el.dueStatus || typeof IntersectionObserver !== "function") return;
    dueChipObserver = new IntersectionObserver(
      (entries) => {
        const hit = entries[0];
        dueChipInView = !!(hit && hit.isIntersecting);
        paintChip();
      },
      { root: null, threshold: 0.15 },
    );
    dueChipObserver.observe(el.dueStatus);
  }
  
  function paintChip() {
    const compare = billCompareTotal(lastDoc);
    const chip = amountDueChecksumChip(amountDue, compare);
    if (el.dueStatus) {
      el.dueStatus.className = "due-status " + chip.status;
      el.dueStatus.title = chip.title;
    }
    if (el.dueEmoji) el.dueEmoji.innerHTML = uiIconHtml(chip.icon);
    if (el.dueMoney) {
      if (chip.moneyText === "—") el.dueMoney.textContent = "—";
      else el.dueMoney.innerHTML = formatSignedUsdHtml(chip.moneyText);
    }
    if (el.dueGrand) {
      const ptr = amountDueGrandPointer(compare);
      el.dueGrand.title = ptr.title;
      if (ptr.grandTotal != null) {
        el.dueGrand.innerHTML = `Bill ${formatUsdAmountHtml(ptr.grandTotal)}`;
      } else {
        el.dueGrand.textContent = "Bill —";
      }
    }
    const block = saveActionsBlockedByChecksum(chip.status);
    el.save.disabled = block;
    el.submit.disabled = block;
    syncAmountDueSticky(chip);
    ensureDueChipObserver();
  }
  
  /** @type {number} */
  let refCheckSeq = 0;
  /** @type {import("../src/bill-ref-check.js").BillRefCheckResult|null} */
  let lastRefCheckResult = null;
  
  /**
   * Non-blocking Ref No. chip (OI-054 / OI-087). Never disables Save.
   * On submitted Bills: hide prose warn; greyscale caution; detail stays in title.
   * @param {import("../src/bill-ref-check.js").BillRefCheckResult} result
   */
  function paintRefChip(result) {
    const r = result || evaluateBillRef("");
    lastRefCheckResult = r;
    const submitted = !!(lastDoc && Number(lastDoc.docstatus) === 1);
    const hasDupe = !submitted && billRefCheckHasDupeWarning(r);
    const warnText =
      r.status === "warn" && r.warnings && r.warnings.length
        ? r.warnings.map((w) => w.message + (w.detail ? ` — ${w.detail}` : "")).join("\n")
        : "";
    if (el.refStatus) {
      const tone =
        r.status === "warn"
          ? "warn"
          : r.status === "ok"
            ? "ok"
            : r.status === "waiting"
              ? "waiting"
              : "idle";
      el.refStatus.className =
        "chip " +
        tone +
        (submitted && tone === "warn" ? " is-posted-muted" : "") +
        (hasDupe ? " is-clickable" : "");
      el.refStatus.title =
        hasDupe
          ? "Click to open Find Bills with this Ref and vendor prefilled"
          : submitted && warnText
            ? warnText
            : r.title || warnText || "";
    }
    if (el.refEmoji) el.refEmoji.innerHTML = uiIconHtml(r.icon || "idle");
    if (el.refWarn) {
      const waitingMsg = r.status === "waiting" ? r.title || "" : "";
      if (!submitted && (warnText || waitingMsg)) {
        el.refWarn.hidden = false;
        el.refWarn.classList.toggle("is-waiting", r.status === "waiting");
        el.refWarn.classList.toggle("is-clickable", hasDupe);
        el.refWarn.title = hasDupe
          ? "Click to open Find Bills with this Ref and vendor prefilled"
          : "";
        el.refWarn.textContent = warnText || waitingMsg;
      } else {
        el.refWarn.hidden = true;
        el.refWarn.classList.remove("is-waiting", "is-clickable");
        el.refWarn.textContent = "";
        el.refWarn.title = "";
      }
    }
  }

  function resolveSupplierForRefCheck() {
    return resolveBillRefSupplier({
      docSupplier: lastDoc && lastDoc.supplier,
      domSupplier: el.vendor && el.vendor.value,
      pendingPickSupplier: vendorPickSourceSession && vendorPickSourceSession.supplier,
    });
  }

  function scheduleBillRefCheckAfterVendorCommit() {
    if (!el.billno || !String(el.billno.value || "").trim()) return;
    void runBillRefCheck(el.billno.value);
  }

  function prefetchVendorBillRefs(supplier) {
    if (!api || !api.prefetchVendorRefs) return;
    const sup = normalizeEditableText(supplier);
    if (!sup) return;
    void api.prefetchVendorRefs(sup);
  }
  
  async function runBillRefCheck(billNoOverride) {
    const seq = ++refCheckSeq;
    const typed =
      billNoOverride != null
        ? String(billNoOverride)
        : el.billno
          ? el.billno.value
          : "";
    if (!String(typed).trim()) {
      paintRefChip(evaluateBillRef(""));
      return;
    }
    const supplier = resolveSupplierForRefCheck();
    if (!supplier) {
      if (seq !== refCheckSeq) return;
      paintRefChip(billRefWaitingForVendorResult());
      return;
    }
    if (!api || !api.checkRef) {
      paintRefChip(evaluateBillRef(typed));
      return;
    }
    try {
      const res = await api.checkRef(typed, { supplierHint: supplier });
      if (seq !== refCheckSeq) return;
      if (res && res.result) paintRefChip(res.result);
      else paintRefChip(evaluateBillRef(typed));
    } catch {
      if (seq !== refCheckSeq) return;
      paintRefChip(evaluateBillRef(typed));
    }
  }
  
  /** Show Amount Due in the single input (USD on blur / when not focused). */
  function paintAmountDueInput(opts = {}) {
    const keepRaw = !!opts.keepRaw || document.activeElement === el.amountdue;
    if (keepRaw) {
      const n = parseMoney(amountDue);
      el.amountdue.value = n != null ? String(n) : amountDue || "";
      return;
    }
    const plain = formatUsdAmount(amountDue);
    el.amountdue.value = plain || (amountDue !== "" ? String(amountDue) : "");
  }
  
  function focusItemCell(rowIndex, field, opts = {}) {
    const mode = opts.mode === CELL_MODE_NAV ? CELL_MODE_NAV : CELL_MODE_EDIT;
    setItemCellMode(mode);
    const wantSelect =
      opts.selectAll === true || (opts.selectAll !== false && mode === CELL_MODE_NAV);
    const tryFocus = () => {
      const inp = el.items.querySelector(
        `input[data-row="${rowIndex}"][data-field="${field}"]`,
      );
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
  
  function editable() {
    return isDraftBillDoc(lastDoc);
  }
  
  function paintLineTotals(doc) {
    if (!el.lineTotals) return;
    const items = doc && Array.isArray(doc.items) ? doc.items : [];
    if (!items.length) {
      el.lineTotals.hidden = true;
      return;
    }
    el.lineTotals.hidden = false;
    el.totQty.textContent = formatBillLineTotal(sumBillLineQty(doc));
    el.totAmt.innerHTML =
      formatUsdAmountHtml(sumBillLineAmount(doc)) || formatBillLineTotal(sumBillLineAmount(doc));
  }
  
  function paintMoneyStack(doc) {
    const stack = billMoneyStack(doc);
    const fmt = (n) => formatUsdAmountHtml(n) || "$0.00";
    if (el.msItems) el.msItems.innerHTML = fmt(stack.itemSubtotal);
    if (el.msTaxes) el.msTaxes.innerHTML = fmt(stack.taxesTotal);
    if (el.msGrand) {
      el.msGrand.innerHTML =
        stack.grandTotal != null ? fmt(stack.grandTotal) : "—";
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
    const thead = document.getElementById("taxes-head-row");
    if (!thead) return;
    thead.innerHTML =
      BILL_TAX_SORTABLE_HEADERS.map((h) => {
        const st = taxSortHeaderState(taxSortSpecs, h.sortKey);
        const arrow = taxSortHeaderArrow(taxSortSpecs, h.sortKey);
        const cls = [
          "sortable",
          st.active ? "sorted" : "",
          h.className || "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<th class="${cls}" data-tax-sort="${escapeHtml(h.sortKey)}" title="Sort by ${escapeHtml(h.label)}">${escapeHtml(h.label)}${arrow ? ` ${arrow}` : ""}</th>`;
      }).join("") + `<th></th>`;
    if (!taxesHeadWired) {
      taxesHeadWired = true;
      thead.addEventListener("click", (ev) => {
        const th = ev.target && /** @type {HTMLElement} */ (ev.target).closest("[data-tax-sort]");
        if (!th) return;
        const key = th.getAttribute("data-tax-sort");
        if (!key) return;
        taxSortSpecs = applyTaxHeaderSortClick(taxSortSpecs, key, {
          ctrlKey: ev.ctrlKey,
          metaKey: ev.metaKey,
        });
        paintTaxes(lastDoc);
      });
    }
  }

  function focusTaxCell(rowIndex, field) {
    if (!el.taxesBody || !isTaxTableNavField(field)) return;
    const inp = el.taxesBody.querySelector(
      `[data-tax-row="${rowIndex}"][data-tax-field="${field}"]`,
    );
    if (!inp || typeof inp.focus !== "function") return;
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

  function paintTaxes(doc) {
    if (!el.taxesBody) return;
    paintTaxesHead();
    const rows = sortBillTaxRows(readBillTaxRowsForSort(doc), taxSortSpecs);
    const canEdit = editable();
    if (el.taxesAdd) el.taxesAdd.style.display = canEdit ? "" : "none";
    const taxesFoot = document.getElementById("taxes-totals");
    const totTaxes = document.getElementById("tot-taxes");
    if (!rows.length) {
      el.taxesBody.innerHTML =
        `<tr><td colspan="8" class="link-muted">No tax/charge rows yet.</td></tr>`;
      if (taxesFoot) taxesFoot.hidden = true;
      paintMoneyStack(doc);
      return;
    }
    if (taxesFoot) taxesFoot.hidden = false;
    if (totTaxes) {
      totTaxes.innerHTML = formatUsdAmountHtml(billTaxesSubtotal(doc)) || "0.00";
    }
    el.taxesBody.innerHTML = rows
      .map((r) => {
        const taxRaw =
          lastDoc && Array.isArray(lastDoc.taxes) ? lastDoc.taxes[r.idx] : null;
        const canAlloc = canEdit && isAllocatableChargeRow(taxRaw || r);
        const allocBtn = canAlloc
          ? `<button type="button" class="alloc-btn" data-tax-alloc="${r.idx}" tabindex="-1" data-testid="bill-tax-alloc-${r.idx}" title="Move this charge into item costs (mouse only — grand total unchanged).">Allocate into items</button>`
          : "";
        if (!canEdit) {
          return `<tr>
            <td>${escapeHtml(String(r.lineNo))}</td>
            <td>${escapeHtml(r.account_head)}</td>
            <td>${escapeHtml(r.description)}</td>
            <td>${escapeHtml(r.charge_type)}</td>
            <td class="num">${escapeHtml(r.rate === "" ? "" : String(r.rate))}</td>
            <td class="num">${formatUsdAmountHtml(r.tax_amount) || escapeHtml(String(r.tax_amount ?? ""))}</td>
            <td>${escapeHtml(r.add_deduct_tax)}</td>
            <td></td>
          </tr>`;
        }
        const rateVal = displayTaxRateForRow(r, doc);
        const rateShown =
          rateVal === "" || rateVal == null ? "" : formatGroupedNumber(Number(rateVal));
        const amtShown =
          r.tax_amount === "" || r.tax_amount == null
            ? ""
            : formatGroupedNumber(r.tax_amount);
        return `<tr data-taxidx="${r.idx}">
          <td><span class="ro">${escapeHtml(String(r.lineNo))}</span></td>
          <td class="cell-wrap"><span class="cell-text">${escapeHtml(r.account_head)}</span><input type="text" data-tax-row="${r.idx}" data-tax-field="account_head" value="${escapeHtml(r.account_head)}" data-testid="bill-tax-${r.idx}-account" /></td>
          <td class="cell-wrap"><span class="cell-text">${escapeHtml(r.description)}</span><input type="text" data-tax-row="${r.idx}" data-tax-field="description" value="${escapeHtml(r.description)}" data-testid="bill-tax-${r.idx}-desc" /></td>
          <td><span class="ro">${escapeHtml(r.charge_type)}</span></td>
          <td class="num"><input type="text" inputmode="decimal" class="money-cost" data-tax-row="${r.idx}" data-tax-field="rate" value="${escapeHtml(rateShown)}" data-testid="bill-tax-${r.idx}-rate" /></td>
          <td class="num"><input type="text" inputmode="decimal" class="money-cost" data-tax-row="${r.idx}" data-tax-field="tax_amount" value="${escapeHtml(amtShown)}" data-testid="bill-tax-${r.idx}-amount" /></td>
          <td>
            <select data-tax-row="${r.idx}" data-tax-field="add_deduct_tax" data-testid="bill-tax-${r.idx}-adddeduct">
              <option value="Add"${r.add_deduct_tax === "Add" ? " selected" : ""}>Add</option>
              <option value="Deduct"${r.add_deduct_tax === "Deduct" ? " selected" : ""}>Deduct</option>
            </select>
          </td>
          <td style="white-space:nowrap">
            ${allocBtn}
            <button type="button" class="del" data-tax-del="${r.idx}" title="Remove tax row" data-testid="bill-tax-del-${r.idx}">×</button>
          </td>
        </tr>`;
      })
      .join("");
    sizeTaxColumns();
  
    el.taxesBody.querySelectorAll("[data-tax-row]").forEach((inp) => {
      // Same resting-text sync as the items grid (Packet T step B).
      const taxCellText = inp.closest("td.cell-wrap")?.querySelector(".cell-text");
      if (taxCellText) {
        const syncTaxCellText = () => {
          taxCellText.textContent = inp.value;
        };
        inp.addEventListener("input", syncTaxCellText);
        inp.addEventListener("change", syncTaxCellText);
      }
      const field = inp.getAttribute("data-tax-field");
      const ri = Number(inp.getAttribute("data-tax-row"));
      inp.tabIndex = -1;
      let taxBusy = false;
      const readTaxValue = () => {
        const kind = dirtyCompareKindForField(field);
        let next =
          kind === "number" ? inp.value : normalizeEditableText(inp.value);
        if (field === "rate" || field === "tax_amount") {
          const n = parseMoney(inp.value);
          next = n == null ? "" : String(n);
        }
        return next;
      };
      const apply = async (value, applyOpts = {}) => {
        if (!api || painting || !api.setTax || taxBusy) return null;
        taxBusy = true;
        try {
          setStatus(`Updating tax ${field}…`);
          const res = await api.setTax(ri, field, value);
          if (res && res.ok) {
            noteUserEdit();
            paint(res.doc, amountDue);
            if (applyOpts.focus) {
              requestAnimationFrame(() =>
                focusTaxCell(applyOpts.focus.rowIndex, applyOpts.focus.field),
              );
            }
            setStatus("Tax row updated — totals refreshed.");
          } else {
            setStatus((res && res.reason) || "Tax update failed.", "err");
            await refresh();
          }
          return res;
        } finally {
          taxBusy = false;
        }
      };
      const syncTaxRateAndAmount = async (editedField, rawValue, applyOpts = {}) => {
        if (!api || painting || !api.setTax || taxBusy) return;
        const base = taxRateBaseFromDoc(lastDoc);
        const n = parseMoney(rawValue);
        if (n == null) {
          await apply(String(rawValue), applyOpts);
          return;
        }
        if (editedField === "tax_amount") {
          await apply(String(n), applyOpts);
          return;
        }
        if (editedField === "rate") {
          const amt = taxAmountFromRate(n, base);
          if (amt == null) {
            await apply(String(n), applyOpts);
            return;
          }
          taxBusy = true;
          try {
            setStatus("Updating tax amount from rate…");
            const resAmt = await api.setTax(ri, "tax_amount", String(amt));
            if (resAmt && resAmt.ok) {
              noteUserEdit();
              paint(resAmt.doc, amountDue);
              if (applyOpts.focus) {
                requestAnimationFrame(() =>
                  focusTaxCell(applyOpts.focus.rowIndex, applyOpts.focus.field),
                );
              }
              setStatus("Tax row updated — totals refreshed.");
              if (Math.abs(n - Number(resAmt.doc?.taxes?.[ri]?.rate ?? n)) > 0.001) {
                const resRate = await api.setTax(ri, "rate", String(n));
                if (resRate && resRate.ok) {
                  paint(resRate.doc, amountDue);
                  if (applyOpts.focus) {
                    requestAnimationFrame(() =>
                      focusTaxCell(applyOpts.focus.rowIndex, applyOpts.focus.field),
                    );
                  }
                }
              }
            } else {
              setStatus((resAmt && resAmt.reason) || "Tax update failed.", "err");
              await refresh();
            }
          } finally {
            taxBusy = false;
          }
        }
      };
      if (field === "account_head") {
        mountBillLinkPicker(inp, "Account", apply);
      }
      const commitTaxCell = async (applyOpts = {}) => {
        if (!api || painting || taxBusy || taxTabGuard) return;
        let next = readTaxValue();
        if (field === "rate" || field === "tax_amount") {
          const n = parseMoney(inp.value);
          if (n != null) inp.value = formatGroupedNumber(n);
        }
        const row =
          lastDoc && Array.isArray(lastDoc.taxes) ? lastDoc.taxes[ri] : null;
        let prev = row && row[field] != null ? row[field] : "";
        if (field === "rate" && row) {
          prev = displayTaxRateForRow(row, lastDoc);
        }
        const kind = dirtyCompareKindForField(field);
        if (valuesMeaningfullyEqual(prev, next, { kind })) return;
        if (field === "rate" || field === "tax_amount") {
          await syncTaxRateAndAmount(field, inp.value, applyOpts);
          return;
        }
        await apply(next, applyOpts);
      };
      inp.addEventListener("change", () => {
        void commitTaxCell();
      });
      inp.addEventListener("blur", () => {
        if (taxTabGuard) return;
        void commitTaxCell();
      });
      if (isTaxTableNavField(field)) {
        inp.addEventListener("focus", () => {
          if (field === "tax_amount") {
            const n = parseMoney(inp.value);
            if (n != null) inp.value = String(n);
          }
        });
        inp.addEventListener("keydown", (ev) => {
          if (!editable() || painting) return;
          const rowCount =
            lastDoc && Array.isArray(lastDoc.taxes) ? lastDoc.taxes.length : 0;

          const runMove = async (dest, leaveForward, leaveBackward) => {
            taxTabGuard = true;
            try {
              let next = readTaxValue();
              const row =
                lastDoc && Array.isArray(lastDoc.taxes) ? lastDoc.taxes[ri] : null;
              let prev = row && row[field] != null ? row[field] : "";
              const kind = dirtyCompareKindForField(field);
              const dirty = !valuesMeaningfullyEqual(prev, next, { kind });
              if (!dest) {
                if (dirty) await commitTaxCell();
                if (leaveForward) {
                  if (el.taxAccount) el.taxAccount.focus();
                  else if (el.memo && !el.memo.readOnly) el.memo.focus();
                } else if (leaveBackward) {
                  if (el.addTax && !el.addTax.disabled) el.addTax.focus();
                }
                return;
              }
              if (dirty) {
                await commitTaxCell({ focus: dest });
              } else {
                focusTaxCell(dest.rowIndex, dest.field);
              }
            } finally {
              taxTabGuard = false;
            }
          };

          if (ev.key === "Tab") {
            ev.preventDefault();
            const dest = nextTaxCellTab(field, ri, rowCount, !!ev.shiftKey);
            void runMove(dest, !ev.shiftKey && !dest, !!ev.shiftKey && !dest);
            return;
          }
          const dir =
            ev.key === "ArrowUp"
              ? "up"
              : ev.key === "ArrowDown"
                ? "down"
                : ev.key === "ArrowLeft"
                  ? "left"
                  : ev.key === "ArrowRight"
                    ? "right"
                    : null;
          if (!dir) return;
          ev.preventDefault();
          const dest = neighborTaxCell(field, ri, rowCount, dir);
          void runMove(dest, false, false);
        });
      } else if (field === "rate" || field === "tax_amount") {
        inp.addEventListener("focus", () => {
          const n = parseMoney(inp.value);
          if (n != null) inp.value = String(n);
        });
        inp.addEventListener("keydown", (ev) => {
          if (ev.key !== "Tab" || painting) return;
          void commitTaxCell();
        });
      }
    });
    el.taxesBody.querySelectorAll("[data-tax-del]").forEach((btn) => {
      btn.tabIndex = -1;
      if (allocateChargeModalOpen) btn.disabled = true;
      btn.addEventListener("click", async () => {
        if (!taxRowDeleteAllowed(allocateChargeModalOpen)) {
          setStatus("Finish or cancel Allocate to stock before removing a tax row.", "warn");
          return;
        }
        if (!api || !api.deleteTax) return;
        const ri = Number(btn.getAttribute("data-tax-del"));
        setStatus("Removing tax row…");
        const res = await api.deleteTax(ri);
        if (res && res.ok) {
          noteUserEdit();
          paint(res.doc, amountDue);
          setStatus("Tax row removed.");
        } else {
          setStatus((res && res.reason) || "Delete tax failed.", "err");
        }
      });
    });
    const allocBtns = [...el.taxesBody.querySelectorAll("[data-tax-alloc]")];
    allocBtns.forEach((btn) => {
      btn.tabIndex = -1;
      btn.addEventListener("click", () => {
        const ri = Number(btn.getAttribute("data-tax-alloc"));
        openAllocateChargeModal(ri);
      });
    });
    paintMoneyStack(doc);
  }
  

    /**
     * Packet T C — size the line grid from its content, then arm the drag
     * handles. Runs after every repaint because the header row is rebuilt each
     * time; both calls are idempotent.
     */
    function sizeItemColumns() {
      try {
        const table = el.items && el.items.closest ? el.items.closest("table") : null;
        if (!table) return;
        mountColResize(table, { tableKey: "bill-items", onChange: sizeItemColumns });
        mountDensityControl({ table, button: document.getElementById("btn-density") });
        autoSizeItemColumns(table, { tableKey: "bill-items" });
      } catch {
        /* column sizing is presentation; never let it break a repaint */
      }
    }

    function sizeTaxColumns() {
      try {
        const table =
          el.taxesBody && el.taxesBody.closest ? el.taxesBody.closest("table") : null;
        if (!table) return;
        mountColResize(table, { tableKey: "bill-taxes", onChange: sizeTaxColumns });
        autoSizeItemColumns(table, { tableKey: "bill-taxes", sticky: false });
      } catch {
        /* ignore */
      }
    }

  function paintItemsHead() {
    const thead = document.getElementById("items-head-row");
    if (!thead) return;
    thead.innerHTML =
      BILL_ITEM_SORTABLE_HEADERS.map((h) => {
        const st = sortHeaderState(itemSortSpecs, h.sortKey);
        const arrow = sortHeaderArrow(itemSortSpecs, h.sortKey);
        const tip = st.active
          ? `Sort by ${h.label} (${st.asc ? "asc" : "desc"}) · Ctrl+click to add another column`
          : `Sort by ${h.label} · Ctrl+click to add a secondary sort`;
        return `<th class="sortable${st.active ? " sorted" : ""}" data-sort="${h.sortKey}" title="${tip}">${h.label}${arrow}</th>`;
      }).join("") + "<th></th>";
    if (!itemsHeadWired) {
      itemsHeadWired = true;
      thead.addEventListener("click", (ev) => {
        const th = /** @type {HTMLElement|null} */ (ev.target).closest("th[data-sort]");
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
  
  function paintItems(doc) {
    paintItemsHead();
    const models = sortBillItemRowModels(
      buildBillItemRowModels(doc, lineAllocations, poLineMeta),
      itemSortSpecs,
    );
    const canEdit = editable();
    el.items.innerHTML = models
      .map((model) => {
        const ri = model.rowIndex;
        const r = [model.lineNo, model.poLine, ...model.cells];
        const cells = BILL_ITEM_COLS.map((col, ci) => {
          const val = r[ci] ?? "";
          if (col.displayOnly || col.field == null) {
            const html = formatUsdAmountHtml(val);
            if (col.label === "Amount" && canEdit) {
              return `<td class="num"><button type="button" class="amount-back-in money-amt" data-back-in="${ri}" title="Back into unit cost from this amount (Amount ÷ Qty → Cost)" data-testid="bill-amt-${ri}">${html || escapeHtml(val) || "—"}</button></td>`;
            }
            if (col.label === "Amount") {
              return `<td class="num"><span class="ro money-amt" data-testid="bill-amt-${ri}">${html || escapeHtml(val)}</span></td>`;
            }
            if (col.label === "Line" || col.label === "Source line") {
              return `<td class="num line-meta"><span class="ro">${escapeHtml(val) || "—"}</span></td>`;
            }
          }
          if (col.field === ALLOC_SALES_ORDERS_FIELD) {
            const assignBtn = canEdit
              ? `<button type="button" class="assign-deal" data-assign="${ri}" data-testid="bill-assign-${ri}" title="Customer → Sales orders → Project">Assign…</button>`
              : "";
            return `<td class="alloc-so"><span class="ro alloc-so-text">${escapeHtml(val) || "—"}</span>${assignBtn}</td>`;
          }
          if (col.scratch && col.readOnly) {
            return `<td><span class="ro">${escapeHtml(val) || "—"}</span></td>`;
          }
          // Cost: #,###.## (editable text so commas work)
          if (col.field === "rate") {
            const shown = val === "" || val == null ? "" : formatGroupedNumber(val);
            if (!canEdit) {
              return `<td class="num"><span class="ro money-cost">${escapeHtml(shown)}</span></td>`;
            }
            return `<td class="num"><input type="text" inputmode="decimal" class="money-cost" data-row="${ri}" data-field="rate" value="${escapeHtml(shown)}" data-testid="bill-cell-${ri}-rate" /></td>`;
          }
          if (!canEdit) {
            return `<td class="cell-wrap"><span class="cell-text ro">${escapeHtml(val)}</span></td>`;
          }
          // Qty: text + decimal keypad — no spinner; ↑/↓ navigate rows only.
          if (col.field === "qty") {
            return `<td class="num"><input type="text" inputmode="decimal" data-row="${ri}" data-field="qty" value="${escapeHtml(val)}" data-testid="bill-cell-${ri}-qty" /></td>`;
          }
          return `<td class="cell-wrap"><span class="cell-text">${escapeHtml(val)}</span><input type="text" data-row="${ri}" data-field="${col.field}" value="${escapeHtml(val)}" data-testid="bill-cell-${ri}-${col.field}" /></td>`;
        }).join("");
        const del = canEdit
          ? `<td><button type="button" class="del" data-del="${ri}" title="Remove line" data-testid="bill-del-${ri}">×</button></td>`
          : `<td></td>`;
        return `<tr data-rowidx="${ri}" data-wash-source="${model.washRole}">${cells}${del}</tr>`;
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
      const linkDt = linkDoctypeForBillField(field);
      const readCellValue = () => {
        const kind = dirtyCompareKindForField(field);
        let next =
          kind === "number" ? inp.value : normalizeEditableText(inp.value);
        if (field === "rate") {
          const n = parseMoney(inp.value);
          next = n == null ? "" : String(n);
        }
        if (shouldForceCapsOnElement(docCapsOn, inp) && kind !== "number") {
          next = applyDocCapsValue(next, docCapsOn);
        }
        return next;
      };
      const focusAfterItemEdit = async (docAfter, cellValue) => {
        const rowCount =
          docAfter && Array.isArray(docAfter.items) ? docAfter.items.length : 0;
        const dest = nextItemFocusAfterEdit(field, ri, rowCount, {
          cellValue,
          rowItemCode: docAfter?.items?.[ri]?.item_code ?? lastDoc?.items?.[ri]?.item_code ?? "",
          nextRowItemCode: rowItemCodeAt(docAfter, ri + 1),
        });
        if (dest.deleteRow && dest.leaveTable) {
          if (!api || !editable()) return;
          const rowCountNow =
            lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items.length : 0;
          const deleteRi = dest.rowIndex != null ? dest.rowIndex : ri;
          if (shouldBlockDeleteLastItemRow(rowCountNow)) {
            showToast(LAST_ITEM_ROW_TOAST);
            focusAfterLeavingItemsTable();
            return;
          }
          setStatus("Removing empty line…");
          const removed = await api.deleteItem(deleteRi);
          if (removed && removed.ok) {
            noteUserEdit();
            paint(removed.doc, amountDue);
            setStatus("Left items table.");
            focusAfterLeavingItemsTable();
          } else if (removed && removed.blockedLastRow) {
            showToast(removed.reason || LAST_ITEM_ROW_TOAST);
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
          paint(added.doc, amountDue);
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
            paint(res.doc, amountDue);
            setStatus("Line updated.");
            if (opts.focus && opts.focus.field) {
              focusItemCell(opts.focus.rowIndex, opts.focus.field, {
                mode: opts.focus.mode === CELL_MODE_EDIT ? CELL_MODE_EDIT : CELL_MODE_NAV,
              });
            } else if (!opts.stay) {
              await focusAfterItemEdit(res.doc, value);
            }
          } else {
            const reason = (res && res.reason) || "";
            if (field === "qty" && isOverBillingError(reason)) {
              const handled = await maybeSplitQtyOverPoLimit(ri, value);
              if (handled) return;
            }
            setStatus(reason || "Line update failed.", "err");
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
        mountBillLinkPicker(inp, linkDt, apply);
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
          // Click-away from Item picker / leave cell without Tab — drop blank extras.
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
        wireFieldCalc(inp, {
          kind: field,
          onCommit: async (value) => {
            let next = value;
            if (field === "rate") {
              const n = parseMoney(value);
              next = n == null ? "" : String(n);
              if (n != null) inp.value = formatGroupedNumber(n);
            }
            if (field === "qty") {
              const handled = await maybeSplitQtyOverPoLimit(ri, next);
              if (handled) return;
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
              const dest = neighborItemCell(field, ri, rowCount, decision.direction || "left");
              const prev =
                (lastDoc && lastDoc.items && lastDoc.items[ri] && lastDoc.items[ri][field]) ??
                "";
              const kind = dirtyCompareKindForField(field);
              const dirty = !valuesMeaningfullyEqual(prev, next, { kind });
              if (!dest) {
                if (dirty) await apply(next, { stay: true });
                if (shouldLeaveItemTableBackward(dest, decision.direction)) {
                  try {
                    if (el.amountdue && !el.amountdue.disabled) {
                      el.amountdue.focus({ preventScroll: false });
                      if (typeof el.amountdue.select === "function") el.amountdue.select();
                    } else if (el.billno) {
                      el.billno.focus({ preventScroll: false });
                    }
                  } catch {
                    /* ignore */
                  }
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
        const prev = (lastDoc && lastDoc.items && lastDoc.items[ri] && lastDoc.items[ri][field]) ?? "";
        const kind = dirtyCompareKindForField(field);
        if (valuesMeaningfullyEqual(prev, next, { kind })) {
          if (field === "rate" && parseMoney(prev) != null) {
            inp.value = formatGroupedNumber(prev);
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
          if (lineAllocations && typeof lineAllocations === "object") {
            delete lineAllocations[ri];
            delete lineAllocations[String(ri)];
          }
          if (poLineMeta && typeof poLineMeta === "object") {
            delete poLineMeta[ri];
            delete poLineMeta[String(ri)];
          }
          paint(res.doc, amountDue, {
            lineAllocations,
            poLineMeta,
          });
          showToast(res.reason || LAST_ITEM_ROW_TOAST);
          setStatus("Last line cleared.");
        } else if (res && res.ok) {
          noteUserEdit();
          paint(res.doc, amountDue);
          setStatus("Line removed.");
        } else if (res && res.blockedLastRow) {
          showToast(res.reason || LAST_ITEM_ROW_TOAST);
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
    el.items.querySelectorAll("button[data-assign]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!editable() || painting) return;
        openLineAllocationPicker(Number(btn.getAttribute("data-assign")));
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
    inp.dataset.testid = `bill-amt-edit-${ri}`;
    inp.setAttribute("data-testid", `bill-amt-edit-${ri}`);
    const n0 = parseMoney(priorAmt);
    inp.value = n0 != null ? String(n0) : "";
    td.replaceChildren(inp);
    setStatus("Back into cost: enter Amount (calc OK) — Cost = Amount ÷ Qty.");
    const finishRestore = () => {
      paint(lastDoc, amountDue);
    };
    wireFieldCalc(inp, {
      kind: "amount",
      commitOnIdleBlur: true,
      onCommit: async (value) => {
        const qty = row.qty;
        const derived = rateFromBackedInAmount(value, qty);
        if (!derived.ok) {
          setStatus(derived.reason, "warn");
          finishRestore();
          return;
        }
        setStatus("Updating cost from amount…");
        const res = await api.setItem(ri, "rate", derived.rateText);
        if (res && res.ok) {
          noteUserEdit();
          paint(res.doc, amountDue);
          setStatus(`Cost set to ${derived.rateText} (Amount ÷ Qty).`);
        } else {
          setStatus((res && res.reason) || "Could not update cost.", "err");
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
  
  function paintDocStatusBadge(doc) {
    if (!el.docStatusBadge) return;
    // Draft lifecycle is the File dirty-pill only — banner badge is payment/clearance after submit.
    if (doc && isDraftBillDoc(doc)) {
      el.docStatusBadge.hidden = true;
      el.docStatusBadge.textContent = "";
      el.docStatusBadge.className = "doc-status-badge";
      el.docStatusBadge.removeAttribute("role");
      el.docStatusBadge.tabIndex = -1;
      return;
    }
    const badge = billDocStatusBadge(doc);
    if (!badge || badge.tone === "draft") {
      el.docStatusBadge.hidden = true;
      el.docStatusBadge.textContent = "";
      el.docStatusBadge.className = "doc-status-badge";
      el.docStatusBadge.removeAttribute("role");
      el.docStatusBadge.tabIndex = -1;
      return;
    }
    el.docStatusBadge.hidden = false;
    el.docStatusBadge.textContent = badge.label;
    const clickable = !!(el.paymentsSection);
    el.docStatusBadge.className =
      "doc-status-badge tone-" + badge.tone + (clickable ? " is-clickable" : "");
    el.docStatusBadge.title = clickable
      ? "Jump to Already paid / Applied payments"
      : "Bill status (Vanilla)";
    if (clickable) {
      el.docStatusBadge.setAttribute("role", "button");
      el.docStatusBadge.tabIndex = 0;
    } else {
      el.docStatusBadge.removeAttribute("role");
      el.docStatusBadge.tabIndex = -1;
    }
  }
  
  function scrollToPaymentsSection() {
    const target = el.paymentsSection || el.appliedPayments || el.alreadyPaidSection;
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      try {
        target.scrollIntoView(true);
      } catch {
        /* ignore */
      }
    }
    target.classList.add("payments-flash");
    setTimeout(() => target.classList.remove("payments-flash"), 900);
  }
  
  function syncDueDateField(doc, canEdit) {
    if (!el.duedate) return;
    const mode = billDueDateFieldMode(doc, { editable: canEdit });
    el.duedate.readOnly = mode.readOnly;
    el.duedate.tabIndex = mode.tabbable ? 0 : -1;
    el.duedate.title = mode.hint;
    if (el.dueDateHint) el.dueDateHint.textContent = mode.hint;
  }
  
  function syncAddressPickers(canEdit) {
    syncAddressPickerLock([el.billingAddress, el.shipFrom, el.shipTo], canEdit);
  }
  
  const addressPickerOpenRef = { current: false };
  
  /**
   * @param {string} role
   */
  async function openAddressPickerModal(role) {
    if (!api || addressPickerOpenRef.current) return;
    const decision = addressPickerOpenDecision(lastDoc, role, { editable: editable() });
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
    const meta = decision.meta || billAddressRoleMeta(role);
    if (!meta) return;
    showAddressPickerModal({
      meta,
      rows: Array.isArray(res.rows) ? res.rows : [],
      current: res.current,
      testId: "bill-addr-modal",
      optTestId: "bill-addr-opt",
      applyTestId: "bill-addr-apply",
      editVendorTestId: "bill-addr-edit-vendor",
      isOpenRef: addressPickerOpenRef,
      setStatus,
      focusSurface: () => {
        try {
          if (api && api.focusBillSurface) api.focusBillSurface();
        } catch {
          /* ignore */
        }
      },
      onApply: applyAddressPick,
      onEditVendor: () => {
        void discardBillDraftAndEditVendorAddresses();
      },
    });
  }
  
  async function discardBillDraftAndEditVendorAddresses() {
    const sup =
      normalizeEditableText(lastDoc && lastDoc.supplier) ||
      normalizeEditableText(el.vendor && el.vendor.value);
    if (!sup) {
      setStatus("No vendor on this Bill — pick a vendor first.", "warn");
      return;
    }
    if (!api || !api.openSupplierForm) {
      setStatus("Open supplier API missing — restart the shell.", "err");
      return;
    }
    if (!shouldOpenCommitGate(userEdited)) {
      setStatus("Opening vendor to edit addresses…");
      const res = await api.openSupplierForm(sup);
      if (!(res && res.ok === false)) setStatus("Vanilla Supplier opened — edit Addresses, then return to Bill.");
      else setStatus((res && res.reason) || "Could not open Supplier.", "err");
      return;
    }
    openGate({
      kind: "toolbar",
      action: "edit-vendor-addresses",
      label: "edit vendor addresses",
      supplier: sup,
    });
  }
  
  async function applyAddressPick(linkField, addressName) {
    if (!api || !linkField) return;
    setStatus(addressName ? "Setting address…" : "Clearing address…");
    const res = await api.setHeader(linkField, addressName || "");
    if (res && res.ok) {
      noteUserEdit();
      paint(res.doc || lastDoc, amountDue);
      setStatus(addressName ? "Address updated." : "Address cleared.");
    } else {
      setStatus((res && res.reason) || "Address update failed.", "err");
    }
  }
  
  function paintAlreadyPaid(doc, canEdit) {
    const d = doc && typeof doc === "object" ? doc : {};
    const checked = isPaidChecked(d.is_paid);
    const section = el.alreadyPaidSection;
    if (section) {
      section.hidden = !canEdit;
      section.classList.toggle("is-yes", checked);
    }
    if (el.paymentsSection) {
      const submitted = Number(d.docstatus) === 1;
      // Keep the payments card visible for submitted Bills (applied table) and drafts (Already paid).
      el.paymentsSection.hidden = !(canEdit || submitted);
    }
    if (el.isPaid) {
      el.isPaid.classList.toggle("is-on", checked);
      el.isPaid.setAttribute("aria-checked", checked ? "true" : "false");
      el.isPaid.setAttribute("aria-label", checked ? "Already paid: Yes" : "Already paid: No");
      el.isPaid.disabled = !canEdit;
    }
    if (el.mop) {
      el.mop.value = d.mode_of_payment != null ? String(d.mode_of_payment) : "";
      el.mop.dataset.linkCommitted = el.mop.value;
      el.mop.readOnly = !canEdit || !checked;
    }
    if (el.cashBank) {
      el.cashBank.value = d.cash_bank_account != null ? String(d.cash_bank_account) : "";
      el.cashBank.dataset.linkCommitted = el.cashBank.value;
      el.cashBank.readOnly = !canEdit || !checked;
    }
    if (el.paidAmount) {
      if (!checked) {
        el.paidAmount.value = "";
      } else {
        const paid = d.paid_amount;
        el.paidAmount.value =
          paid === "" || paid == null ? "" : formatGroupedNumber(paid);
      }
      el.paidAmount.readOnly = !canEdit || !checked;
    }
  }
  
  /** Draft-only toggle for is_return — flips on a form already loaded, so there's no
   * navigate-then-mutate gap for a stale ERP nav to clobber (nav incident 2026-09-07). */
  function paintCreditMemoToggle(doc, canEdit) {
    const checked = isCreditMemoBill(doc);
    // Vertical white ledger stripes over the invoice wash while this is a return — the
    // one signal that survives on a *submitted* credit memo, where the toggle is hidden.
    setDocWashVariant(document, checked ? "return" : null);
    if (el.creditMemoToggleSection) el.creditMemoToggleSection.hidden = !canEdit;
    if (el.isReturn) {
      el.isReturn.classList.toggle("is-on", checked);
      el.isReturn.setAttribute("aria-checked", checked ? "true" : "false");
      el.isReturn.setAttribute("aria-label", checked ? "Credit memo: Yes" : "Credit memo: No");
      el.isReturn.disabled = !canEdit;
    }
  }

  async function paintAppliedPayments(doc, opts = {}) {
    if (!el.appliedPayments) return;
    const submitted = doc && Number(doc.docstatus) === 1;
    if (!submitted) {
      el.appliedPayments.hidden = true;
      if (el.appliedPaymentsBody) el.appliedPaymentsBody.innerHTML = "";
      return;
    }
    el.appliedPayments.hidden = false;
    const canAdd = billCanAddPayment(doc);
    if (el.addPayment) {
      el.addPayment.hidden = !canAdd;
      el.addPayment.disabled = !canAdd;
    }
    if (!api || !api.listPayments) {
      if (el.appliedPaymentsEmpty) {
        el.appliedPaymentsEmpty.hidden = false;
        el.appliedPaymentsEmpty.textContent = "Payments list unavailable — restart shell.";
      }
      return;
    }
    const res = await api.listPayments();
    let rows = res && Array.isArray(res.rows) ? res.rows : [];
    // Just-created PE may not appear in get_list for a beat — seed from JIT result.
    const seedName =
      opts && opts.seedPaymentEntry ? String(opts.seedPaymentEntry).trim() : "";
    if (seedName && !rows.some((r) => r.paymentEntry === seedName)) {
      rows = [
        {
          paymentEntry: seedName,
          postingDate: "",
          modeOfPayment: "",
          allocatedAmount: opts.seedAllocated != null ? opts.seedAllocated : "",
          paidAmount: opts.seedAllocated != null ? opts.seedAllocated : "",
          status: "Submitted",
          docstatus: 1,
        },
        ...rows,
      ];
    }
    if (!rows.length) {
      if (el.appliedPaymentsBody) el.appliedPaymentsBody.innerHTML = "";
      if (el.appliedPaymentsEmpty) {
        el.appliedPaymentsEmpty.hidden = false;
        el.appliedPaymentsEmpty.textContent =
          (res && !res.ok && res.reason) || "No Payment Entries linked yet.";
      }
      return;
    }
    if (el.appliedPaymentsEmpty) el.appliedPaymentsEmpty.hidden = true;
    if (el.appliedPaymentsBody) {
      el.appliedPaymentsBody.innerHTML = rows
        .map(
          (r) => `<tr>
            <td>${escapeHtml(r.paymentEntry)}</td>
            <td>${escapeHtml(r.postingDate)}</td>
            <td>${escapeHtml(r.modeOfPayment)}</td>
            <td class="num">${formatUsdAmountHtml(r.allocatedAmount) || escapeHtml(String(r.allocatedAmount))}</td>
            <td>${escapeHtml(r.status || (r.docstatus === 1 ? "Submitted" : "Draft"))}</td>
          </tr>`,
        )
        .join("");
    }
  }
  
  function freezeTaxDeletesForAllocModal(frozen) {
    allocateChargeModalOpen = !!frozen;
    if (!el.taxesBody) return;
    el.taxesBody.querySelectorAll("[data-tax-del]").forEach((btn) => {
      btn.tabIndex = -1;
      btn.disabled = !!frozen || !editable();
    });
  }
  
  function closeAllocateChargeModal() {
    const node = document.getElementById("alloc-charge-modal");
    if (node) node.remove();
    freezeTaxDeletesForAllocModal(false);
    document.removeEventListener("keydown", onAllocateChargeModalKeydown, true);
  }
  
  function onAllocateChargeModalKeydown(ev) {
    if (!allocateChargeModalOpen) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      closeAllocateChargeModal();
      setStatus("Allocate cancelled.");
      return;
    }
    // While open, ignore Enter/Space on tax × / → Stock behind the dialog.
    const t = /** @type {HTMLElement|null} */ (ev.target);
    if (
      t &&
      t.closest &&
      t.closest("#alloc-charge-modal")
    ) {
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }
  
  /**
   * Allocate freight/charge into item costs (OI-140).
   * @param {number} taxRowIndex
   */
  function openAllocateChargeModal(taxRowIndex) {
    closeAllocateChargeModal();
    const doc = lastDoc;
    if (!doc || !editable()) return;
    const tax = Array.isArray(doc.taxes) ? doc.taxes[taxRowIndex] : null;
    if (!isAllocatableChargeRow(tax)) {
      setStatus("Pick an Add charge with amount > 0.", "warn");
      return;
    }
    const items = (Array.isArray(doc.items) ? doc.items : []).map((it, i) => ({
      rowIndex: i,
      qty: it.qty,
      rate: it.rate,
      amount: it.amount,
      item_code: it.item_code,
    }));
    const chargeAmt = Number(tax.tax_amount);
    const backdrop = document.createElement("div");
    backdrop.className = "alloc-modal-backdrop";
    backdrop.id = "alloc-charge-modal";
    backdrop.dataset.testid = "bill-alloc-modal";
    backdrop.innerHTML = `
      <div class="alloc-modal" role="dialog" aria-modal="true" aria-labelledby="alloc-title">
        <h2 id="alloc-title">Allocate charge to stock cost</h2>
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.4">
          ${escapeHtml(tax.description || tax.account_head || "Charge")} ·
          ${formatUsdAmountHtml(chargeAmt) || escapeHtml(String(chargeAmt))}.
          Item costs rise; a Deduct offset keeps grand total unchanged.
        </p>
        <div class="alloc-modes" role="radiogroup" aria-label="Allocation mode">
          <label><input type="radio" name="alloc-mode" value="amount" checked /> By price (amount)</label>
          <label><input type="radio" name="alloc-mode" value="qty" /> By qty</label>
          <label><input type="radio" name="alloc-mode" value="custom" /> Custom $ / %</label>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="num">Qty</th>
              <th class="num">Cost</th>
              <th class="num">Amount</th>
              <th class="num">Alloc $</th>
              <th class="num">Alloc %</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (it) => `<tr data-alloc-row="${it.rowIndex}">
                  <td>${escapeHtml(it.item_code || `#${it.rowIndex + 1}`)}</td>
                  <td class="num">${escapeHtml(String(it.qty ?? ""))}</td>
                  <td class="num">${formatUsdAmountHtml(it.rate) || ""}</td>
                  <td class="num">${formatUsdAmountHtml(it.amount) || ""}</td>
                  <td class="num"><input type="text" inputmode="decimal" data-alloc-dollars="${it.rowIndex}" class="money-cost" disabled /></td>
                  <td class="num"><input type="text" inputmode="decimal" data-alloc-percent="${it.rowIndex}" class="money-cost" disabled /></td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
        <div class="alloc-modal-actions">
          <button type="button" data-alloc-cancel>Cancel</button>
          <button type="button" class="primary" data-alloc-apply data-testid="bill-alloc-apply">Apply to items</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    freezeTaxDeletesForAllocModal(true);
    document.addEventListener("keydown", onAllocateChargeModalKeydown, true);
    const applyBtn = backdrop.querySelector("[data-alloc-apply]");
    const syncCustomEnabled = () => {
      const mode =
        (backdrop.querySelector('input[name="alloc-mode"]:checked') || {}).value || "amount";
      const custom = mode === "custom";
      backdrop.querySelectorAll("[data-alloc-dollars], [data-alloc-percent]").forEach((inp) => {
        inp.disabled = !custom;
      });
    };
    backdrop.querySelectorAll('input[name="alloc-mode"]').forEach((r) => {
      r.addEventListener("change", syncCustomEnabled);
    });
    syncCustomEnabled();
    backdrop.querySelector("[data-alloc-cancel]").onclick = () => {
      closeAllocateChargeModal();
      setStatus("Allocate cancelled.");
    };
    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) {
        closeAllocateChargeModal();
        setStatus("Allocate cancelled.");
      }
    });
    const runApply = async () => {
      if (!api || !api.allocateCharge) {
        setStatus("Allocate API missing — restart the shell.", "err");
        return;
      }
      const mode =
        (backdrop.querySelector('input[name="alloc-mode"]:checked') || {}).value || "amount";
      /** @type {Array<{ rowIndex: number, dollars?: number, percent?: number }>} */
      const custom = [];
      if (mode === "custom") {
        items.forEach((it) => {
          const dInp = backdrop.querySelector(`[data-alloc-dollars="${it.rowIndex}"]`);
          const pInp = backdrop.querySelector(`[data-alloc-percent="${it.rowIndex}"]`);
          const dollars = dInp ? parseMoney(dInp.value) : null;
          const percent = pInp ? parseMoney(pInp.value) : null;
          if (dollars != null || percent != null) {
            custom.push({
              rowIndex: it.rowIndex,
              dollars: dollars != null ? dollars : undefined,
              percent: percent != null ? percent : undefined,
            });
          }
        });
        const preview = planChargeToStockAllocation({
          items,
          chargeAmount: chargeAmt,
          mode: "custom",
          custom,
          chargeAccount: tax.account_head,
          chargeDescription: tax.description,
        });
        if (!preview.ok) {
          setStatus(preview.reason || "Custom allocation invalid.", "err");
          return;
        }
      }
      setStatus("Allocating charge into item costs…");
      const res = await api.allocateCharge(taxRowIndex, mode, custom);
      closeAllocateChargeModal();
      if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, amountDue);
        setStatus(
          `Allocated ${formatUsdAmountHtml(res.allocatedTotal) || res.allocatedTotal} into item costs (offset Deduct added).`,
        );
      } else {
        setStatus((res && res.reason) || "Allocate failed.", "err");
        if (res && res.doc) paint(res.doc, amountDue);
      }
    };
    if (applyBtn) applyBtn.onclick = () => void runApply();
    // Delay focus past the Enter/Space that opened the dialog (same class as source modal).
    const focusApply = () => {
      try {
        if (api && api.focusBillSurface) api.focusBillSurface();
      } catch {
        /* ignore */
      }
      try {
        if (applyBtn) applyBtn.focus();
      } catch {
        /* ignore */
      }
    };
    requestAnimationFrame(focusApply);
    setTimeout(focusApply, 30);
    setStatus("Enter = Apply to items · Esc = cancel. Tax row delete is frozen while this is open.");
  }
  
  function ensureHeaderLinkPickers() {
    mountBillLinkPicker(
      el.vendor,
      "Supplier",
      async (v) => {
      if (!api) return;
      if (!editable()) {
        setStatus("Bill is not a draft — cannot set vendor.", "warn");
        return;
      }
      const decision = shouldOpenSourceModalAfterVendorPick({
        trigger: "link_pick",
        hasSupplier: !!normalizeEditableText(v),
        editable: true,
        modalAlreadyOpen: sourceModalOpenRef.current,
      });
      vendorPickSourceSession = { supplier: normalizeEditableText(v), userClosed: false };
      prefetchVendorBillRefs(v);
      setStatus("Setting vendor…");
      try {
        el.vendor?.blur();
      } catch {
        /* ignore */
      }
      document.querySelectorAll(".link-dd").forEach((dd) => {
        dd.hidden = true;
      });
      await runVendorPickWithSourceModal({
        supplier: v,
        decision,
        setHeader: (field, value) => api.setHeader(field, value),
        openSourcePicker: (supplier) => openSourcePicker(supplier, { trigger: "link_pick" }),
        onHeaderSuccess: (res) => {
          if (res && res.paymentTermsSettle) {
            logFocus("bill-due-date-settle", formatDueDateSettleLog(res.paymentTermsSettle));
          }
          noteUserEdit();
          paint(res.doc || lastDoc, amountDue, {
            caller: "setHeader",
            forceDueDatePaint: !!(res.paymentTermsSettle && res.paymentTermsSettle.ok),
          });
          prefetchVendorBillRefs((res.doc && res.doc.supplier) || v);
          scheduleBillRefCheckAfterVendorCommit();
          if (decision.open) setStatus("Choose a source (or NIC).");
        },
        onHeaderFailure: (res) => {
          setStatus((res && res.reason) || "Vendor update failed.", "err");
        },
        onModalSkipped: (reason) => {
          setStatus(`Source modal skipped (${reason}).`, "warn");
        },
        onAfterFlow: async () => {
          scheduleBillRefCheckAfterVendorCommit();
          await refreshIfSupplierAddressesMissing(lastDoc);
        },
      });
    },
      { refocusAfterPick: false },
    );
    mountBillLinkPicker(el.terms, "Payment Terms Template", async (v) => {
      if (!api || !editable()) return;
      const savedFocus = captureBillFocus();
      const res = await api.setHeader("payment_terms_template", v);
      if (res && res.paymentTermsSettle) {
        logFocus("bill-due-date-settle", formatDueDateSettleLog(res.paymentTermsSettle));
      }
      if (res && res.ok && !res.skipped) noteUserEdit();
      if (res && res.doc) {
        paint(res.doc, amountDue, {
          caller: "setHeader-terms",
          linkedPos: lastLinkedPos,
          linkedReceipts: lastLinkedReceipts,
          lineAllocations,
          poLineMeta,
          enrichPending: lastEnrichPending,
          preserveFocus: savedFocus,
        });
      } else {
        await refresh({ preserveFocus: savedFocus });
      }
    });
    if (el.mop) {
      mountBillLinkPicker(el.mop, "Mode of Payment", async (v) => {
        if (!api || !editable()) return;
        setStatus("Setting Mode of Payment…");
        const res = await api.setHeader("mode_of_payment", v);
        if (res && res.ok && !res.skipped) noteUserEdit();
        // Vanilla script fills cash_bank_account from MoP defaults when present.
        paint(res && res.doc ? res.doc : lastDoc, amountDue);
        if (res && res.ok) setStatus("Mode of Payment set.");
        else setStatus((res && res.reason) || "Mode of Payment update failed.", "err");
      });
    }
    if (el.cashBank) {
      mountBillLinkPicker(el.cashBank, "Account", async (v) => {
        if (!api || !editable()) return;
        const res = await api.setHeader("cash_bank_account", v);
        if (res && res.ok && !res.skipped) noteUserEdit();
        paint(res && res.doc ? res.doc : lastDoc, amountDue);
      });
    }
  }
  
  /**
   * Source modal — SSoT in source-picker-flow.js (modal closes ∥ streamed slices).
   * @param {string} [supplier]
   * @param {{ trigger?: "link_pick" | "blur" | "toolbar" | "unknown" }} [opts]
   */
  async function openSourcePicker(supplier, opts = {}) {
    const trigger = opts.trigger || "unknown";
    const listSlice = api && api.listSourceSlice;
    if (!api || !listSlice) {
      setStatus("Source picker API missing — restart the shell.", "err");
      return { ok: false, reason: "api_missing" };
    }
    // Every modal on this page must respect every other one. The credit-memo link picker
    // checked these two from day one; they did not check it back, so a toolbar Select PO
    // could stack a second dialog on top of an open link picker.
    if (sourceModalOpenRef.current || informalLinkPickerOpen) {
      return { ok: false, reason: "already_open" };
    }
    if (!editable()) {
      setStatus("Bill is not a draft — source picker locked.", "warn");
      return { ok: false, reason: "not_editable" };
    }
    const sup =
      normalizeEditableText(supplier) ||
      normalizeEditableText(lastDoc && lastDoc.supplier) ||
      normalizeEditableText(el.vendor.value);
    if (!sup) {
      setStatus("Pick a vendor before Select PO / source.", "warn");
      return { ok: false, reason: "no_supplier" };
    }

    if (trigger === "link_pick") {
      /* session reset happens in link picker onPicked (explicit user pick only) */
    } else if (trigger === "toolbar") {
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
    sourcePickerInflight = runBillSourcePicker(sup, trigger).finally(() => {
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
  async function runBillSourcePicker(sup, trigger) {
    try {
      el.vendor?.blur();
    } catch {
      /* ignore */
    }
    document.querySelectorAll(".link-dd").forEach((dd) => {
      dd.hidden = true;
    });

    /**
     * OI-166 — the modal asks one question, "where does this Bill come from?", and the foot
     * switch changes which corpus answers it: open Purchase Orders / Item Receipts, or the
     * submitted Bill this credit is against. 5zorro's flow is vendor → source in one breath,
     * so the decision belongs here rather than behind a second dialog opened later.
     *
     * A Bill that is already a credit opens the modal already switched.
     */
    let creditOn = isCreditMemoBill(lastDoc);
    /** Latest PO/IR corpus, kept warm so flipping back is instant and complete. */
    let sourceGroups = null;
    /** @type {import("./source-modal-ui.js").SourceModalController|null} */
    let modalCtl = null;
    let creditLoadToken = 0;
    const currentName = lastDoc && lastDoc.name ? String(lastDoc.name) : "";

    async function switchCreditMode(next) {
      if (!modalCtl) return;
      creditOn = !!next;
      if (!creditOn) {
        // Slices that landed while the switch was on were accumulated, not painted.
        modalCtl.setCreditMode(false, sourceGroups || undefined);
        setStatus("Back to Purchase Orders and Item Receipts — Space to check · Enter to pull.");
        return;
      }
      const token = ++creditLoadToken;
      modalCtl.setCreditMode(true, buildCreditSourceLoadingGroups(sup));
      setStatus(`Loading submitted Bills for ${sup}…`);
      let rows = null;
      let failure = "";
      try {
        rows = await searchSourceBillRows("", sup, currentName);
      } catch (err) {
        failure = String(err && err.message ? err.message : err);
      }
      // A stale fetch must never repaint a list the clerk has already switched away from.
      if (token !== creditLoadToken || !creditOn || !sourceModalOpenRef.current) return;
      if (failure) {
        modalCtl.setCreditMode(true, buildCreditSourceErrorGroups(failure, sup));
        setStatus(`Could not load Bills: ${failure}`, "err");
        return;
      }
      modalCtl.setCreditMode(
        true,
        buildCreditSourceGroups(rows, { supplier: sup, exclude: currentName }),
      );
      setStatus("Pick the Bill this credit is against (or decide later).");
    }

    setStatus(
      creditOn ? "Loading submitted Bills…" : "Loading open PO / Item Receipts…",
    );

    return runSourcePickerFlow({
      supplier: sup,
      trigger,
      mode: "multi",
      listSourceSlice: (vendor, sliceId) => api.listSourceSlice(vendor, sliceId),
      onGroups: (groups) => {
        sourceGroups = groups;
      },
      applySlices: () => !creditOn,
      log: (event, detail) => logFocus(event, detail || ""),
      mayOpen: (vendor, trig) =>
        mayAutoOpenSourcePicker(vendorPickSourceSession, vendor, trig),
      onUserClose: (kind) => {
        if (vendorPickSourceSession && vendorPickSourceSession.supplier === sup) {
          vendorPickSourceSession.userClosed = true;
        }
        if (focusTargetAfterSourceModal(kind) === "invoice_date") scheduleFocusInvoiceDateField();
      },
      onStreamComplete: ({ errors }) => {
        // Credit mode owns the status line while it is on — the PO/IR stream is still running
        // underneath it and must not narrate over the question the clerk is actually answering.
        if (creditOn || !sourceModalOpenRef.current) return;
        if (errors.length) {
          setStatus(`Some sources failed to load (${errors.length}) — NIC still ok.`, "warn");
        } else {
          setStatus("Sources loaded — Space to check · Enter to pull (or NIC).");
        }
      },
      showModal: (flowOpts) =>
        showSourceModal({
          ...flowOpts,
          testId: "bill-source-modal",
          pickButtonTestId: "bill-source-pull",
          isOpenRef: sourceModalOpenRef,
          setStatus,
          creditToggle: {
            label: "Credit memo?",
            checked: creditOn,
            testId: "bill-source-credit-toggle",
            onChange: (next) => {
              void switchCreditMode(next);
            },
          },
          onController: (c) => {
            modalCtl = c;
            if (flowOpts.onController) flowOpts.onController(c);
            // Opened on a Bill that is already a credit: fetch its corpus straight away.
            if (creditOn) void switchCreditMode(true);
          },
          focusSurface: () => {
            if (api && api.focusBillSurface) api.focusBillSurface();
          },
          onChoose: async (choice) => {
            if (creditOn) {
              const verdict = classifyCreditSourceChoice(choice);
              if (verdict.action === "decline") {
                setStatus(
                  "Credit memo left with no Bill behind it — the Return Against warning " +
                    "stays up until you link one.",
                  "warn",
                );
                return;
              }
              if (verdict.action !== "link") {
                setStatus("Pick the Bill this credit is against, or decide later.", "warn");
                return;
              }
              await commitCreditSource(verdict.name);
              return;
            }
            const mode = choice && choice.mode;
            const items = (choice && choice.items) || [];
            if (mode === "nic" || (items.length === 1 && items[0] && items[0].kind === "nic")) {
              setStatus("No source — enter lines manually.");
              return;
            }
            if (mode !== "merge" || !items.length) {
              setStatus("Pick at least one source (Space to check), or NIC.", "warn");
              return;
            }
            const labels = items.map((it) => it.name || it.kind).join(", ");
            setStatus(`Pulling from ${labels}…`);
            scheduleFocusInvoiceDateField();
            const payload = items.map((it) => ({ kind: it.kind, name: it.name }));
            const merged =
              payload.length === 1
                ? await api.mergeSource(payload[0].kind, payload[0].name)
                : await api.mergeSource(payload);
            if (merged && merged.ok) {
              noteUserEdit();
              paint(merged.doc, amountDue, {
                linkedPos: merged.linkedPos,
                linkedReceipts: merged.linkedReceipts,
                poLineMeta: merged.poLineMeta,
                lineAllocations: merged.lineAllocations,
                forceDueDatePaint: !!(merged.paymentTermsSettle && merged.paymentTermsSettle.ok),
              });
              setStatus(
                payload.length === 1
                  ? `Pulled from ${payload[0].name}.`
                  : `Pulled from ${payload.length} sources.`,
              );
            } else {
              setStatus((merged && merged.reason) || "Could not pull source.", "err");
              await refresh();
            }
          },
        }),
    });
  }
  
  function scheduleFocusInvoiceDateField() {
    if (!shouldScheduleInvoiceDateFocus(document.activeElement)) {
      logFocus("schedule-invoice-date", "skip-user-moved");
      return;
    }
    logFocus("schedule-invoice-date", "start");
    try {
      if (api && api.focusBillSurface) api.focusBillSurface();
    } catch {
      /* ignore */
    }
    const tryFocus = () => {
      if (!shouldScheduleInvoiceDateFocus(document.activeElement)) return;
      try {
        if (!el.date) return;
        el.date.focus({ preventScroll: false });
        el.date.select();
        logFocus("schedule-invoice-date", "focused");
      } catch {
        try {
          el.date.focus();
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

  function focusInvoiceDateField() {
    scheduleFocusInvoiceDateField();
  }
  
  /**
   * OI-134: per-line Assign — customer → multi SO → Project.
   * @param {number} rowIndex
   */
  async function openLineAllocationPicker(rowIndex) {
    if (!api || !api.listSalesOrdersForPicker || !api.applyLineAllocation) {
      setStatus("Line allocation API missing — restart the shell.", "err");
      return;
    }
    if (allocationPickerOpen || sourceModalOpenRef.current || informalLinkPickerOpen) return;
    if (!editable()) {
      setStatus("Bill is not a draft — allocation locked.", "warn");
      return;
    }
    const sup =
      normalizeEditableText(lastDoc && lastDoc.supplier) ||
      normalizeEditableText(el.vendor.value);
    if (!sup) {
      setStatus("Pick a vendor before Assign.", "warn");
      return;
    }
  
    allocationPickerOpen = true;
    let step = "customer";
    let customerRows = [];
    let soRows = [];
    let projectRows = [];
    let ci = 0;
    let customerFilter = "";
    let customerName = "";
    /** @type {Set<string>} */
    const selectedSos = new Set();
    let projectIdx = 0;
  
    const back = document.createElement("div");
    back.className = "src-back";
    back.dataset.testid = "bill-allocation-picker";
    const box = document.createElement("div");
    box.className = "src-box";
    box.tabIndex = -1;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Assign deal");
    box.innerHTML = `<div class="src-title" data-alloc-title>Assign — customer</div>
      <div class="src-so-search" style="padding:8px 14px;border-bottom:1px solid #e2e8f0;">
        <input type="text" data-alloc-search placeholder="Search…" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;" />
      </div>
      <div class="src-body"></div>
      <div class="src-foot">
        <button type="button" data-act="back" hidden>Back</button>
        <button type="button" class="primary" data-act="pick">Continue</button>
        <button type="button" data-act="cancel">Cancel</button>
      </div>`;
    back.appendChild(box);
    document.body.appendChild(back);
    const body = box.querySelector(".src-body");
    const titleEl = box.querySelector("[data-alloc-title]");
    const searchEl = box.querySelector("[data-alloc-search]");
    const pickBtn = box.querySelector('[data-act="pick"]');
    const backBtn = box.querySelector('[data-act="back"]');
  
    function billLinesForMargin() {
      const items = lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items : [];
      const row = items[rowIndex];
      return row
        ? [{ item_code: row.item_code, qty: row.qty, rate: row.rate, amount: row.amount }]
        : items.map((r) => ({
            item_code: r.item_code,
            qty: r.qty,
            rate: r.rate,
            amount: r.amount,
          }));
    }
  
    async function loadCustomers(q) {
      if (!api.searchLink) return [];
      const res = await api.searchLink("Customer", q || "");
      return res && res.ok && Array.isArray(res.results) ? res.results : [];
    }
  
    async function loadSalesOrders(customer) {
      const res = await api.listSalesOrdersForPicker({
        supplier: sup,
        customer: customer || "",
        billLines: billLinesForMargin(),
      });
      return res && res.ok && Array.isArray(res.orders) ? res.orders : [];
    }
  
    async function loadProjects(customer) {
      if (!api.listProjectsForPicker) return [];
      const res = await api.listProjectsForPicker(customer || "");
      return res && res.ok && Array.isArray(res.projects) ? res.projects : [];
    }
  
    function activeCustomer() {
      if (ci === 0) return { value: "", description: "All customers" };
      return customerRows[ci - 1];
    }
  
    function close() {
      allocationPickerOpen = false;
      document.removeEventListener("keydown", onKey, true);
      if (back.parentNode) back.parentNode.removeChild(back);
    }
  
    function drawCustomers() {
      step = "customer";
      titleEl.textContent = `Assign line ${rowIndex + 1} — pick customer`;
      pickBtn.textContent = "Next: Sales orders";
      backBtn.hidden = true;
      searchEl.parentElement.hidden = false;
      searchEl.placeholder = "Customer search…";
      body.innerHTML = "";
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "src-item" + (ci === 0 ? " active" : "");
      allBtn.textContent = "All customers";
      allBtn.onclick = () => {
        ci = 0;
        drawCustomers();
      };
      body.appendChild(allBtn);
      customerRows.forEach((row, idx) => {
        const r = document.createElement("button");
        r.type = "button";
        r.className = "src-item" + (ci === idx + 1 ? " active" : "");
        r.textContent = row.description || row.value;
        r.onclick = () => {
          ci = idx + 1;
          drawCustomers();
        };
        body.appendChild(r);
      });
    }
  
    function drawSalesOrders() {
      step = "so";
      titleEl.textContent = `Assign line ${rowIndex + 1} — select Sales order(s)`;
      pickBtn.textContent = "Next: Project";
      backBtn.hidden = false;
      searchEl.parentElement.hidden = true;
      body.innerHTML = "";
      if (!soRows.length) {
        const empty = document.createElement("div");
        empty.className = "src-group";
        empty.textContent = "No Sales Orders — continue to assign Project only.";
        body.appendChild(empty);
        return;
      }
      soRows.forEach((row) => {
        if (row.draft) return;
        const r = document.createElement("button");
        r.type = "button";
        const on = selectedSos.has(row.name);
        r.className =
          "src-item" + (on ? " selected" : "") + (row.negativeMargin ? " negative" : "");
        const mark = document.createElement("span");
        mark.className = "src-check";
        mark.setAttribute("aria-hidden", "true");
        mark.innerHTML = uiIconHtml(on ? "checkbox-checked" : "checkbox", { size: 12 });
        const lab = document.createElement("span");
        lab.className = "src-item-label";
        lab.textContent = formatSalesOrderPickerLabel(row);
        r.appendChild(mark);
        r.appendChild(lab);
        r.onclick = () => {
          if (selectedSos.has(row.name)) selectedSos.delete(row.name);
          else selectedSos.add(row.name);
          drawSalesOrders();
        };
        body.appendChild(r);
      });
    }
  
    function drawProjects() {
      step = "project";
      titleEl.textContent = `Assign line ${rowIndex + 1} — Project`;
      pickBtn.textContent = "Apply to line";
      backBtn.hidden = false;
      searchEl.parentElement.hidden = false;
      searchEl.placeholder = "Project search…";
      body.innerHTML = "";
      const noneBtn = document.createElement("button");
      noneBtn.type = "button";
      noneBtn.className = "src-item" + (projectIdx === 0 ? " active" : "");
      noneBtn.textContent = "— No project —";
      noneBtn.onclick = () => {
        projectIdx = 0;
        drawProjects();
      };
      body.appendChild(noneBtn);
      if (!projectRows.length) {
        const empty = document.createElement("button");
        empty.type = "button";
        empty.className = "src-item link-action";
        empty.textContent = "No projects found — create Project in Vanilla…";
        empty.onclick = () => {
          if (api.openProjectAdd) api.openProjectAdd();
        };
        body.appendChild(empty);
      }
      projectRows.forEach((row, idx) => {
        const r = document.createElement("button");
        r.type = "button";
        r.className = "src-item" + (projectIdx === idx + 1 ? " active" : "");
        const label = row.project_name || row.name;
        const cust = row.customer_name || row.customer || "";
        r.textContent = cust ? `${label} · ${cust}` : label;
        r.onclick = () => {
          projectIdx = idx + 1;
          drawProjects();
        };
        body.appendChild(r);
      });
    }
  
    async function goToSalesOrders() {
      const cust = activeCustomer();
      customerFilter = cust && cust.value ? cust.value : "";
      customerName = cust && cust.description ? cust.description : customerFilter;
      setStatus("Loading Sales Orders…");
      soRows = await loadSalesOrders(customerFilter);
      drawSalesOrders();
    }
  
    async function goToProjects() {
      setStatus("Loading projects…");
      projectRows = await loadProjects(customerFilter);
      projectIdx = 0;
      drawProjects();
    }
  
    async function applyAllocation() {
      const project =
        projectIdx > 0 && projectRows[projectIdx - 1]
          ? projectRows[projectIdx - 1].name
          : "";
      close();
      setStatus("Applying allocation…");
      const res = await api.applyLineAllocation(rowIndex, {
        customer: customerFilter,
        customerName,
        salesOrders: [...selectedSos],
        project,
        supplier: sup,
      });
      if (res && res.ok) {
        noteUserEdit();
        if (res.poLineMeta) poLineMeta = res.poLineMeta;
        if (res.lineAllocations) lineAllocations = res.lineAllocations;
        paint(res.doc, res.amountDue != null ? res.amountDue : amountDue, {
          linkedPos: res.linkedPos,
          linkedReceipts: res.linkedReceipts,
          lineAllocations: res.lineAllocations,
          poLineMeta: res.poLineMeta,
        });
        const poNote = res.bridgePo ? ` · PO ${res.bridgePo}` : "";
        setStatus(`Line ${rowIndex + 1} assigned${poNote}.`);
      } else {
        setStatus((res && res.reason) || "Could not apply allocation.", "err");
        await refresh();
      }
    }
  
    async function onPrimary() {
      if (step === "customer") await goToSalesOrders();
      else if (step === "so") await goToProjects();
      else await applyAllocation();
    }
  
    function onKey(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        onPrimary();
      }
    }
  
    let searchTimer = null;
    searchEl.oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        if (step === "customer") {
          customerRows = await loadCustomers(searchEl.value);
          ci = Math.min(ci, customerRows.length);
          drawCustomers();
        } else if (step === "project") {
          const q = normalizeEditableText(searchEl.value).toLowerCase();
          projectRows = (await loadProjects(customerFilter)).filter((p) => {
            const blob = `${p.name} ${p.project_name || ""} ${p.customer_name || ""}`.toLowerCase();
            return !q || blob.includes(q);
          });
          drawProjects();
        }
      }, 180);
    };
  
    pickBtn.onclick = () => onPrimary();
    backBtn.onclick = () => {
      if (step === "so") drawCustomers();
      else if (step === "project") drawSalesOrders();
    };
    box.querySelector('[data-act="cancel"]').onclick = () => close();
    back.addEventListener("click", (ev) => {
      if (ev.target === back) close();
    });
    document.addEventListener("keydown", onKey, true);
  
    customerRows = await loadCustomers("");
    drawCustomers();
    try {
      if (api.focusBillSurface) api.focusBillSurface();
    } catch {
      /* ignore */
    }
    searchEl.focus();
  }
  
  /**
   * Submitted, non-return Bills — the candidate list for "which Bill is this credit against?".
   * The standalone picker and the source modal's **Credit memo?** switch (OI-166) ask exactly
   * this question, so it is asked in exactly one place.
   *
   * Typing widens the search past this vendor; the filters that keep an answer *legitimate* —
   * submitted, not itself a return, not this document — never widen.
   *
   * @param {string} query
   * @param {string} supplier
   * @param {string} excludeName
   * @returns {Promise<Array<{ value: string, description?: string }>>}
   */
  async function searchSourceBillRows(query, supplier, excludeName) {
    if (!api || !api.searchLink) return [];
    const q = query != null ? String(query).trim() : "";
    const res = await api.searchLink("Purchase Invoice", q, {
      supplier: q ? undefined : supplier || undefined,
      docstatus: 1,
      is_return: 0,
    });
    const list = res && res.ok && Array.isArray(res.results) ? res.results : [];
    const skip = excludeName != null ? String(excludeName).trim() : "";
    return list.filter((r) => r && r.value && r.value !== skip);
  }

  /**
   * Write one informal link token into Remarks and repaint. Returns the outcome instead of
   * speaking: callers own their own dialog lifecycle and status voice.
   * @param {"bill"|"so"} kind
   * @param {string} name
   * @returns {Promise<{ ok: boolean, label: string, reason?: string }>}
   */
  async function writeInformalLinkToken(kind, name) {
    const label = kind === "bill" ? "Bill" : "Sales Order";
    const currentRemarks = el.memo ? el.memo.value : (lastDoc && lastDoc.remarks) || "";
    const next =
      kind === "bill"
        ? withBillLinkToken(currentRemarks, name)
        : withSoLinkToken(currentRemarks, name);
    try {
      const res = await api.setHeader("remarks", next);
      if (res && res.ok) {
        paint(res.doc, res.amountDue != null ? res.amountDue : amountDue);
        return { ok: true, label };
      }
      return {
        ok: false,
        label,
        reason: (res && res.reason) || `Could not set the informal ${label} link.`,
      };
    } catch (err) {
      return {
        ok: false,
        label,
        reason: `Could not set the informal ${label} link: ${String(
          err && err.message ? err.message : err,
        )}`,
      };
    }
  }

  /**
   * Commit the sentence "this credit is against Bill &lt;name&gt;" — the single write path for it,
   * shared by the standalone source picker and the source modal's Credit memo switch (OI-166).
   * Never flips `is_return` freeform: that is the museum OI-147 failure where ERPNext silently
   * books to an accrual placeholder instead of the item's real expense account.
   *
   * Caller closes its own dialog first; this only writes and narrates.
   * @param {string} name
   */
  async function commitCreditSource(name) {
    const plan = planCreditMemoSource(lastDoc);
    if (plan !== "native") {
      // "blocked" (not a draft) lands here too, exactly as the standalone picker has always
      // behaved: ERPNext refuses the Remarks write rather than this shell inventing a second
      // draft test. The modal route cannot reach it — openSourcePicker gates on editable().
      setStatus(`Linking informally to Bill ${name}…`);
      const res = await writeInformalLinkToken("bill", name);
      if (!res.ok) {
        setStatus(res.reason, "err");
        return;
      }
      if (plan === "informal") {
        setStatus(
          `Noted in Remarks: this credit is about Bill ${name}. Return Against was left ` +
            "empty so the lines you already entered are not overwritten — to get the real " +
            "ERP link (and the right expense account), start over from that Bill with " +
            "Create Credit / Return.",
          "warn",
        );
      } else {
        setStatus(`Noted in Remarks: informal link to Bill ${name}.`);
      }
      return;
    }
    if (!api.createCreditMemo) {
      setStatus("Credit memo API missing — restart the shell.", "err");
      return;
    }
    setStatus(`Building credit memo against ${name}…`);
    try {
      const res = await api.createCreditMemo(name);
      if (res && res.ok) {
        paint(res.doc, res.amountDue != null ? res.amountDue : amountDue);
        setStatus(`Credit memo drafted against ${name} — review qty/amounts, then save.`);
      } else {
        setStatus((res && res.reason) || `Could not create a credit memo against ${name}.`, "err");
      }
    } catch (err) {
      setStatus(
        `Credit memo against ${name} failed: ${String(err && err.message ? err.message : err)}`,
        "err",
      );
    }
  }

  /**
   * Informal link picker for credit memos (OI-147/164, OI-165 SO half) — writes a plain-text
   * token into Remarks, never the real ERP `return_against` field. "Bill" defaults to the
   * current vendor's submitted Bills; typing a name searches any vendor (2026-09-07 decision).
   * "Sales Order" reuses the OI-134 line-allocation fetch as-is — rough first pass, not
   * dogfooded yet (5zorro 2026-09-07: "won't verify it until later").
   *
   * `purpose: "source"` (Bill only) is the same list opened at a different moment: right
   * after the clerk flips **Credit memo? → Yes** on a Bill they did *not* reach from a
   * submitted Bill, so nothing has set `return_against` yet. Picking there routes through
   * `planCreditMemoSource()` — an untouched draft is rebuilt via the native make_debit_note
   * path (real `return_against`, correct expense account); a draft with lines already on it
   * falls back to the informal token rather than silently destroying that work.
   * @param {"bill"|"so"} kind
   * @param {{ purpose?: "link"|"source" }} [opts]
   */
  async function openInformalLinkPicker(kind, opts = {}) {
    if (!api || !api.setHeader) {
      setStatus("Informal link API missing — restart the shell.", "err");
      return;
    }
    if (informalLinkPickerOpen || sourceModalOpenRef.current || allocationPickerOpen) return;
    const isBill = kind === "bill";
    const isSourcePick = isBill && opts.purpose === "source";
    const label = isBill ? "Bill" : "Sales Order";
    const currentName = lastDoc && lastDoc.name ? String(lastDoc.name) : "";
    const supplier =
      normalizeEditableText(lastDoc && lastDoc.supplier) || normalizeEditableText(el.vendor.value);

    informalLinkPickerOpen = true;
    let rows = [];
    let query = "";

    const back = document.createElement("div");
    back.className = "src-back";
    back.dataset.testid = isSourcePick
      ? "bill-credit-source-picker"
      : `bill-informal-link-picker-${kind}`;
    const dialogLabel = isSourcePick
      ? "Which Bill is this credit against?"
      : `Informal link to ${label}`;
    const box = document.createElement("div");
    box.className = "src-box";
    box.tabIndex = -1;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", dialogLabel);
    const subtitle = isSourcePick
      ? " — same vendor by default; type/paste a name to search any vendor. Skip this and the credit posts with no Bill behind it."
      : isBill
        ? " — same vendor by default; type/paste a name to search any vendor"
        : " (Sales Order picker — not restricted by vendor)";
    box.innerHTML = `<div class="src-title">${dialogLabel}${subtitle}</div>
      <div class="src-so-search" style="padding:8px 14px;border-bottom:1px solid #e2e8f0;">
        <input type="text" data-link-search placeholder="${
          isBill ? "Search Bills…" : "Filter Sales Orders…"
        }" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;" />
      </div>
      <div class="src-body"></div>
      <div class="src-foot">
        <button type="button" data-act="clear">${
          isSourcePick ? "Decide later" : "Clear link"
        }</button>
        <button type="button" data-act="cancel">Cancel</button>
      </div>`;
    back.appendChild(box);
    document.body.appendChild(back);
    const body = box.querySelector(".src-body");
    const searchEl = box.querySelector("[data-link-search]");
    const clearBtn = box.querySelector('[data-act="clear"]');
    const cancelBtn = box.querySelector('[data-act="cancel"]');

    function close() {
      if (searchDebounce) clearTimeout(searchDebounce);
      informalLinkPickerOpen = false;
      document.removeEventListener("keydown", onKey, true);
      if (back.parentNode) back.parentNode.removeChild(back);
    }

    async function applyLink(name) {
      setStatus(
        name ? `Linking informally to ${label} ${name}…` : `Clearing informal ${label} link…`,
      );
      try {
        const res = await writeInformalLinkToken(kind, name);
        if (res.ok) {
          setStatus(
            name
              ? `Noted in Remarks: informal link to ${label} ${name}.`
              : `Informal ${label} link cleared.`,
          );
        } else {
          setStatus(res.reason, "err");
        }
      } finally {
        close();
      }
    }

    /**
     * Source-pick route (toggle → Yes) — routing lives in commitCreditSource(), which the
     * source modal's Credit memo switch calls too, so the two doors cannot drift apart.
     */
    async function chooseSourceBill(name) {
      close();
      await commitCreditSource(name);
    }

    function drawRows() {
      body.innerHTML = "";
      const q = query.trim().toLowerCase();
      const filtered = q
        ? rows.filter((r) => `${r.value} ${r.description || ""}`.toLowerCase().includes(q))
        : rows;
      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "src-empty";
        empty.textContent =
          isBill && !q
            ? `No submitted Bills found for ${supplier || "this vendor"}. Type to search any vendor.`
            : "No matches.";
        body.appendChild(empty);
        return;
      }
      filtered.forEach((r) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "src-item";
        btn.dataset.testid = isSourcePick
          ? "bill-credit-source-row"
          : `bill-informal-link-${kind}-row`;
        btn.textContent =
          r.description && r.description !== r.value ? `${r.value} — ${r.description}` : r.value;
        btn.onclick = () => (isSourcePick ? chooseSourceBill(r.value) : applyLink(r.value));
        body.appendChild(btn);
      });
    }

    async function loadBillRows(q) {
      return searchSourceBillRows(q, supplier, currentName);
    }

    async function loadSoRows() {
      if (!api.listSalesOrdersForPicker) return [];
      const items =
        lastDoc && Array.isArray(lastDoc.items)
          ? lastDoc.items.map((r) => ({
              item_code: r.item_code,
              qty: r.qty,
              rate: r.rate,
              amount: r.amount,
            }))
          : [];
      const res = await api.listSalesOrdersForPicker({
        supplier: supplier || "",
        customer: "",
        billLines: items,
      });
      const list = res && res.ok && Array.isArray(res.orders) ? res.orders : [];
      return list.map((so) => ({
        value: so.name,
        description: `${so.customer_name || so.customer || ""}${
          so.grand_total ? ` — $${so.grand_total}` : ""
        }`.trim(),
      }));
    }

    // A throw anywhere in here used to leave informalLinkPickerOpen stuck true, locking the
    // picker out for the rest of the session with no way back short of reopening the Bill.
    async function reload() {
      body.innerHTML = `<div class="src-empty">Loading…</div>`;
      try {
        rows = isBill ? await loadBillRows(query.trim()) : await loadSoRows();
      } catch (err) {
        rows = [];
        body.innerHTML = "";
        const failed = document.createElement("div");
        failed.className = "src-empty";
        failed.dataset.testid = "bill-link-picker-error";
        failed.textContent = `Could not load ${label}s: ${String(
          err && err.message ? err.message : err,
        )}`;
        body.appendChild(failed);
        return;
      }
      drawRows();
    }

    let searchDebounce = null;
    searchEl.addEventListener("input", () => {
      query = searchEl.value || "";
      if (isBill) {
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(reload, 220);
      } else {
        drawRows(); // SO rows are fetched once; filtered client-side while typing.
      }
    });

    function onKey(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", onKey, true);
    back.addEventListener("mousedown", (ev) => {
      if (ev.target === back) close();
    });
    // "Decide later" must not strip an existing token — it only declines to add one now.
    clearBtn.onclick = () => {
      if (!isSourcePick) return applyLink("");
      close();
      setStatus(
        "Credit memo left with no Bill behind it — the Return Against warning below stays up " +
          "until you link one.",
        "warn",
      );
      return undefined;
    };
    cancelBtn.onclick = () => close();

    await reload();
    searchEl.focus();
  }

  function setFormBlocked(blocked, reason) {
    document.body.classList.toggle("blocked", !!blocked);
    const retry = document.getElementById("btn-retry");
    if (retry) retry.hidden = !blocked;
    if (blocked && reason) setStatus(reason, "warn");
  }
  
  function focusVendorField() {
    const tryFocus = () => {
      try {
        el.vendor.focus({ preventScroll: false });
        el.vendor.select();
      } catch {
        try {
          el.vendor.focus();
        } catch {
          /* ignore */
        }
      }
    };
    tryFocus();
    requestAnimationFrame(tryFocus);
    setTimeout(tryFocus, 50);
    setTimeout(tryFocus, 200);
    setTimeout(tryFocus, 500);
  }
  
  async function requestLinkedSourcePeek(route, kind) {
    if (!route || !canSoftPeekLinkedSourceRoute(route)) {
      setStatus("Cannot peek this source — missing route.", "warn");
      return;
    }
    if (!api || !api.softPeekRoute) {
      setStatus("Peek API missing — restart the shell.", "err");
      return;
    }
    const label = linkedSourcePeekKindLabel(kind);
    if (api.logNav) api.logNav("linked-source-peek", route);
    setStatus(`Opening ${label}…`);
    try {
      const res = await api.softPeekRoute(route);
      if (res && res.ok === false) {
        setStatus((res && res.reason) || "Peek failed.", "err");
        return;
      }
      setStatus(`Peeking ${label} — Esc to return to Bill.`);
    } catch (e) {
      setStatus(String(e && e.message ? e.message : e) || "Peek failed.", "err");
    }
  }

  function appendLinkedSourcePeekButton(container, route, kind, testId) {
    if (!container || !route || !canSoftPeekLinkedSourceRoute(route)) return;
    const label = linkedSourcePeekKindLabel(kind);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "linked-source-peek-btn";
    btn.dataset.testid = testId;
    btn.title = `Go to ${label} (peek — Esc to return to Bill)`;
    btn.setAttribute("aria-label", `Peek ${label}`);
    btn.textContent = "↗";
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void requestLinkedSourcePeek(route, kind);
    });
    container.append(btn);
  }

  function paintLinkedSourceInput(input, opts) {
    const value = opts.value != null ? String(opts.value) : "";
    input.value = opts.pending ? "" : value;
    if (opts.pending) {
      input.placeholder = LINKED_SOURCE_LOADING_PLACEHOLDER;
      input.title = "Loading from linked source document…";
      input.classList.add("source-field-loading");
      input.dataset.enrichPending = "1";
    } else {
      input.placeholder = opts.emptyPlaceholder || "";
      input.title = value ? opts.filledTitle || "" : opts.emptyTitle || "";
      input.classList.remove("source-field-loading");
      delete input.dataset.enrichPending;
    }
  }

  function paintLinkedSources(doc, linkedPos, linkedReceipts, enrichPending) {
    const block = el.linkedPoBlock;
    if (!block) return;
    const pending = enrichPending || lastEnrichPending || {};
    const poRows = linkedPurchaseOrdersForBill(doc, linkedPos || []);
    const prRows = linkedPurchaseReceiptsForBill(doc, linkedReceipts || []);
    const isReturn = isCreditMemoBill(doc);
    block.replaceChildren();
    if (!poRows.length && !prRows.length && !isReturn) {
      block.hidden = true;
      return;
    }
    block.hidden = false;
    const poTitlePending = !!pending.linkedPos;
    const prRefPending = !!pending.linkedReceipts;
    poRows.forEach((row, i) => {
      const name = row && row.name != null ? String(row.name) : "";
      const title = row && row.title != null ? String(row.title) : "";
      const erpField = document.createElement("div");
      erpField.className = "field";
      const erpLabel = document.createElement("label");
      erpLabel.textContent =
        poRows.length > 1 ? `Purchase Order (${i + 1})` : "Purchase Order";
      const erpInput = document.createElement("input");
      erpInput.type = "text";
      erpInput.readOnly = true;
      erpInput.tabIndex = -1;
      erpInput.value = name;
      erpInput.dataset.testid = `bill-linked-po-name-${i}`;
      erpInput.title = "ERP Purchase Order id (series name). Read-only.";
      setWashSourceAttr(erpInput, washRoleForSourceKind("po"));
      const erpRow = document.createElement("div");
      erpRow.className = "row linked-source-row";
      erpRow.append(erpInput);
      const poRoute = linkedSourcePeekRoute("purchase-order", name);
      appendLinkedSourcePeekButton(erpRow, poRoute, "purchase-order", `bill-linked-po-peek-${i}`);
      erpField.append(erpLabel, erpRow);
      const logField = document.createElement("div");
      logField.className = "field";
      const logLabel = document.createElement("label");
      logLabel.textContent =
        poRows.length > 1 ? `PO# (logbook) (${i + 1})` : "PO# (logbook)";
      const logInput = document.createElement("input");
      logInput.type = "text";
      logInput.readOnly = true;
      logInput.tabIndex = -1;
      logInput.dataset.testid = `bill-linked-po-title-${i}`;
      paintLinkedSourceInput(logInput, {
        value: title,
        pending: poTitlePending && !title,
        emptyPlaceholder: "(no logbook PO# on linked PO — set Title on the PO)",
        emptyTitle:
          "Linked PO has no Title (logbook PO#). Open the Purchase Order and fill PO# (logbook).",
        filledTitle:
          "Logbook / salesman PO# from the linked Purchase Order Title field (OI-121). Read-only on Bill.",
      });
      setWashSourceAttr(logInput, washRoleForSourceKind("po"));
      logField.append(logLabel, logInput);
      block.append(erpField, logField);
    });
    prRows.forEach((row, i) => {
      const name = row && row.name != null ? String(row.name) : "";
      const lrNo = row && row.lrNo != null ? String(row.lrNo) : "";
      const erpField = document.createElement("div");
      erpField.className = "field";
      const erpLabel = document.createElement("label");
      erpLabel.textContent =
        prRows.length > 1 ? `Item Receipt (${i + 1})` : "Item Receipt";
      const erpInput = document.createElement("input");
      erpInput.type = "text";
      erpInput.readOnly = true;
      erpInput.tabIndex = -1;
      erpInput.value = name;
      erpInput.dataset.testid = `bill-linked-pr-name-${i}`;
      erpInput.title = "ERP Item Receipt id. Read-only.";
      setWashSourceAttr(erpInput, washRoleForSourceKind("pr"));
      const erpRow = document.createElement("div");
      erpRow.className = "row linked-source-row";
      erpRow.append(erpInput);
      const prRoute = linkedSourcePeekRoute("purchase-receipt", name);
      appendLinkedSourcePeekButton(erpRow, prRoute, "purchase-receipt", `bill-linked-pr-peek-${i}`);
      erpField.append(erpLabel, erpRow);
      const refField = document.createElement("div");
      refField.className = "field";
      const refLabel = document.createElement("label");
      refLabel.textContent =
        prRows.length > 1 ? `Packing List / BOL Ref (${i + 1})` : "Packing List / BOL Ref";
      const refInput = document.createElement("input");
      refInput.type = "text";
      refInput.readOnly = true;
      refInput.tabIndex = -1;
      refInput.dataset.testid = `bill-linked-pr-lr-${i}`;
      paintLinkedSourceInput(refInput, {
        value: lrNo,
        pending: prRefPending && !lrNo,
        emptyPlaceholder: "(no packing list / BOL ref on linked Item Receipt)",
        emptyTitle: "(no packing list / BOL ref on linked Item Receipt)",
        filledTitle: "Packing List / BOL Ref from the linked Item Receipt (lr_no). Read-only on Bill.",
      });
      setWashSourceAttr(refInput, washRoleForSourceKind("pr"));
      refField.append(refLabel, refInput);
      block.append(erpField, refField);
    });
    if (isReturn) {
      const returnAgainst = creditMemoReturnAgainst(doc);
      const erpField = document.createElement("div");
      erpField.className = "field";
      const erpLabel = document.createElement("label");
      erpLabel.textContent = "Return Against (Credit Memo For)";
      const erpInput = document.createElement("input");
      erpInput.type = "text";
      erpInput.readOnly = true;
      erpInput.tabIndex = -1;
      erpInput.value = returnAgainst;
      erpInput.dataset.testid = "bill-return-against-name";
      erpInput.title = "Original Bill this credit memo returns against. Read-only — set at creation.";
      setWashSourceAttr(erpInput, washRoleForSourceKind("bill"));
      const erpRow = document.createElement("div");
      erpRow.className = "row linked-source-row";
      erpRow.append(erpInput);
      const returnRoute = linkedSourcePeekRoute("purchase-invoice", returnAgainst);
      appendLinkedSourcePeekButton(erpRow, returnRoute, "purchase-invoice", "bill-return-against-peek");
      erpField.append(erpLabel, erpRow);
      const warnField = document.createElement("div");
      warnField.className = "field";
      if (creditMemoOrphaned(doc)) {
        const warn = document.createElement("div");
        warn.className = "linked-source-warning";
        warn.dataset.testid = "bill-return-orphan-warning";
        warn.textContent =
          "No Bill linked — ERPNext may silently post this to an accrual placeholder account " +
          "instead of the real expense account (OI-147). Use Create Credit / Return from the " +
          "original Bill instead of a freeform return.";
        warnField.append(warn);
      }
      block.append(erpField, warnField);
    }
  }

  /** Informal Bill/Sales Order link display (OI-147/164/165) — only on credit memos. */
  function paintCreditLinks(doc) {
    if (!el.creditLinksBlock) return;
    if (!isCreditMemoBill(doc)) {
      el.creditLinksBlock.hidden = true;
      return;
    }
    el.creditLinksBlock.hidden = false;
    const remarks = (doc && doc.remarks) || "";
    const billLink = parseBillLinkToken(remarks);
    const soLink = parseSoLinkToken(remarks);
    if (el.creditLinkBillValue) el.creditLinkBillValue.textContent = billLink || "(none)";
    if (el.creditLinkSoValue) el.creditLinkSoValue.textContent = soLink || "(none)";
  }

  async function maybePrefillRemarksFromLinkedPos(doc, poRows, opts = {}) {
    if (!api || !editable() || !shouldPrefillBillRemarksFromPo(doc, poRows)) return;
    if (!opts.linkedPosChanged) return;
    const hint = billRemarksPoSearchHint(poRows);
    if (!hint) return;
    const res = await api.setHeader("remarks", hint);
    if (res && res.ok) {
      noteUserEdit();
      if (el.memo) el.memo.value = hint;
    }
  }

  function clearBillFormShellForLoad() {
    const force = { forcePaint: true };
    const blankLink = (input, field) => {
      if (!input) return;
      paintHeaderLinkInputIfAllowed(input, field, "", force);
    };
    const blank = (input, field) => {
      if (!input) return;
      paintHeaderInputIfAllowed(input, field, "", force);
    };
    blankLink(el.vendor, "supplier");
    blankLink(el.terms, "payment_terms_template");
    blank(el.date, "bill_date");
    blank(el.billno, "bill_no");
    blank(el.duedate, "due_date");
    blank(el.memo, "remarks");
    for (const node of [el.billingAddress, el.shipFrom, el.shipTo]) {
      if (!node) continue;
      node.value = "";
      node.rows = addressTextareaRows("");
    }
    amountDue = "";
    paintAmountDueInput();
    paintAlreadyPaid({}, false);
    paintDocStatusBadge(null);
    paintRefChip(evaluateBillRef(""));
    lineAllocations = {};
    poLineMeta = {};
    lastLinkedPos = [];
    lastLinkedReceipts = [];
    lastEnrichPending = null;
    vendorPickSourceSession = null;
    sourcePickerInflight = null;
    sourcePickerInflightSupplier = "";
    paintedBillDocName = "";
    logFocus("paint-clear-shell", "loading");
  }

  function paint(doc, scratchDue, opts = {}) {
    painting = true;
    const savedFocus = opts.preserveFocus ?? captureBillFocus();
    const paintCaller = opts.caller || (opts.focusVendor ? "focusVendor" : "");
    logFocus("paint-start", paintCaller);
    try {
    clearFieldCalc(amountDue);
    lastDoc = doc || null;
    amountDue = scratchDue != null ? String(scratchDue) : amountDue;
    if (opts.userEdited != null) userEdited = !!opts.userEdited;
    if (opts.lineAllocations && typeof opts.lineAllocations === "object") {
      lineAllocations = opts.lineAllocations;
    }
    if (opts.poLineMeta && typeof opts.poLineMeta === "object") {
      poLineMeta = opts.poLineMeta;
    }
    if (opts.linkedPos !== undefined) {
      lastLinkedPos = Array.isArray(opts.linkedPos) ? opts.linkedPos : [];
    }
    if (opts.linkedReceipts !== undefined) {
      lastLinkedReceipts = Array.isArray(opts.linkedReceipts) ? opts.linkedReceipts : [];
    }
    if (opts.enrichPending !== undefined) {
      lastEnrichPending =
        opts.enrichPending && typeof opts.enrichPending === "object" ? opts.enrichPending : null;
    }
    paintDirtyPill();
    if (!doc) {
      setFormBlocked(true, opts.reason || "No Purchase Invoice loaded in Vanilla yet.");
      clearBillFormShellForLoad();
      el.items.innerHTML = "";
      paintLineTotals(null);
      if (el.taxesBody) el.taxesBody.innerHTML = "";
      paintMoneyStack(null);
      el.addLine.disabled = true;
      el.addLine.tabIndex = -1;
      if (el.addSource) el.addSource.disabled = true;
      if (el.importItems) el.importItems.disabled = true;
      if (el.clearQty) el.clearQty.disabled = true;
      if (el.attach) el.attach.disabled = true;
      if (el.addTax) el.addTax.disabled = true;
      if (el.creditMemo) el.creditMemo.hidden = true;
      if (el.creditMemoToggleSection) el.creditMemoToggleSection.hidden = true;
      if (el.creditLinksBlock) el.creditLinksBlock.hidden = true;
      setDocWashVariant(document, null);
      paintLinkedSources(null, [], []);
      paintChip();
      return;
    }
    setFormBlocked(false);
    const nextDocName = String(doc.name || "");
    const docIdentityChanged = nextDocName !== paintedBillDocName;
    if (docIdentityChanged) {
      vendorPickSourceSession = null;
      sourcePickerInflight = null;
      sourcePickerInflightSupplier = "";
      logFocus("paint-doc-swap", `${paintedBillDocName || "(none)"} → ${nextDocName || "(none)"}`);
    }
    const headerForce = docIdentityChanged || !!opts.forceHeaderPaint;
    const h = readBillHeader(doc, { amountDue: amountDue || undefined });
    const skipHeaderPaint = (field, reason) => {
      if (field === "due_date" && el.duedate) {
        const erpDue =
          formatDocDateDisplay(h["Bill Due Date"] ?? "") || (h["Bill Due Date"] ?? "");
        logFocus(
          "paint-skip-header",
          `${field}:${reason} ui=${el.duedate.value || "(blank)"} erp=${erpDue || "(blank)"}`,
        );
        return;
      }
      logFocus("paint-skip-header", `${field}:${reason}`);
    };
    const headerPaintOpts = (field) =>
      headerForce ? { forcePaint: true } : { onSkip: (reason) => skipHeaderPaint(field, reason) };
    paintHeaderLinkInputIfAllowed(el.vendor, "supplier", h["Vendor Name"] ?? "", headerPaintOpts("supplier"));
    const paintAddr = (node, text) => {
      if (!node) return;
      const v = text ?? "";
      node.value = v;
      node.rows = addressTextareaRows(v);
    };
    paintAddr(el.billingAddress, h["Remittance & Billing Address"]);
    paintAddr(el.shipFrom, h["Ship from / supplier dispatch"]);
    paintAddr(el.shipTo, h["Ship to / receiving address"]);
    logFocus(
      "paint-addr",
      String(h["Remittance & Billing Address"] ?? "").trim() ? "billing:painted" : "billing:blank",
    );
    paintHeaderLinkInputIfAllowed(el.terms, "payment_terms_template", h["Payment terms"] ?? "", headerPaintOpts("payment_terms_template"));
    paintHeaderInputIfAllowed(
      el.date,
      "bill_date",
      formatDocDateDisplay(h["Invoice date"] ?? "") || (h["Invoice date"] ?? ""),
      headerPaintOpts("bill_date"),
    );
    paintHeaderInputIfAllowed(el.billno, "bill_no", h["Ref No. (Supplier Invoice No.)"] ?? "", headerPaintOpts("bill_no"));
    // Amount Due is user scratch only — stay blank until they type (no grand_total seed).
    paintAmountDueInput();
    const forceDueDatePaint =
      headerForce || !!opts.forceDueDatePaint || paintCaller === "setHeader-terms";
    const dueRaw = doc ? billDueDateForPaint(doc) : h["Bill Due Date"];
    paintHeaderInputIfAllowed(
      el.duedate,
      "due_date",
      formatDocDateDisplay(dueRaw ?? "") || (dueRaw ?? ""),
      {
        ...headerPaintOpts("due_date"),
        forcePaint: forceDueDatePaint,
      },
    );
    const linkedPosArg = opts.linkedPos ?? lastLinkedPos;
    paintLinkedSources(doc, linkedPosArg, opts.linkedReceipts ?? lastLinkedReceipts, lastEnrichPending);
    if (opts.linkedPos !== undefined) {
      void maybePrefillRemarksFromLinkedPos(doc, linkedPosArg, { linkedPosChanged: true });
    }
    paintHeaderInputIfAllowed(el.memo, "remarks", h.Memo ?? "", headerPaintOpts("remarks"));
    paintCreditLinks(doc);
    void paintSourceTerms(doc);
    const canEdit = isDraftBillDoc(doc);
    syncAddressPickers(canEdit);
    syncDueDateField(doc, canEdit);
    paintAlreadyPaid(doc, canEdit);
    paintCreditMemoToggle(doc, canEdit);
    paintDocStatusBadge(doc);
    // Create Credit / Return (OI-082): only offer it on a submitted (docstatus 1), non-return
    // Bill — not a draft, not already a credit memo, not a cancelled Bill.
    if (el.creditMemo) {
      el.creditMemo.hidden = Number(doc.docstatus) !== 1 || isCreditMemoBill(doc);
    }
    void paintAppliedPayments(doc);
    el.vendor.readOnly = !canEdit;
    el.terms.readOnly = !canEdit;
    el.date.readOnly = !canEdit;
    el.billno.readOnly = !canEdit;
    // due date readOnly/tabIndex from syncDueDateField (Terms lock)
    el.memo.readOnly = !canEdit;
    el.amountdue.readOnly = !canEdit;
    if (el.shipFrom) el.shipFrom.readOnly = true;
    if (el.shipTo) el.shipTo.readOnly = true;
    if (el.billingAddress) el.billingAddress.readOnly = true;
    el.addLine.disabled = !canEdit;
    el.addLine.tabIndex = -1;
    if (el.addSource) el.addSource.disabled = !canEdit;
    if (el.importItems) el.importItems.disabled = !canEdit;
    if (el.clearQty) el.clearQty.disabled = !canEdit;
    if (el.attach) el.attach.disabled = !canEdit;
    if (el.addTax) el.addTax.disabled = !canEdit;
    paintItems(doc);
    paintTaxes(doc);
    ensureHeaderLinkPickers();
    const name = doc.name || "(new)";
    setStatus(`${name} · ${isDraftBillDoc(doc) ? "Draft" : "Posted"}`);
    paintDirtyPill();
    paintChip();
    void ensureAtLeastOneItemRow(doc);
    runBillRefCheck(el.billno ? el.billno.value : "");
    if (opts.focusVendor) {
      docCapsOn = true;
      if (docCapsUi) docCapsUi.syncCapsButton();
      if (canEdit) focusVendorField();
    }
    paintedBillDocName = nextDocName;
    } finally {
      painting = false;
      logFocus("paint-end", lastDoc && lastDoc.name ? String(lastDoc.name) : "");
      restoreBillFocus(savedFocus, { allowFocusVendor: !!opts.focusVendor });
    }
  }
  
  async function refreshIfSupplierAddressesMissing(doc) {
    if (!api?.getSnapshot || !doc?.supplier) return;
    const h = readBillHeader(doc, { amountDue });
    const billingDoc = String(h["Remittance & Billing Address"] ?? "").trim();
    const billingDom = el.billingAddress ? String(el.billingAddress.value ?? "").trim() : "";
    if (billingDoc || billingDom) {
      logFocus("paint-addr", billingDoc ? "billing:ok" : "billing:ok-dom");
      return;
    }
    logFocus("paint-addr", "billing:empty — deferred refresh");
    await new Promise((r) => setTimeout(r, 150));
    if (el.billingAddress && String(el.billingAddress.value ?? "").trim()) {
      logFocus("paint-addr", "billing:ok-dom-after-wait");
      return;
    }
    const snap = await api.getSnapshot();
    if (!snap?.doc) {
      logFocus("paint-addr", "billing:still-empty");
      return;
    }
    const h2 = readBillHeader(snap.doc, { amountDue: snap.amountDue ?? amountDue });
    const billingSnap = String(h2["Remittance & Billing Address"] ?? "").trim();
    if (!billingSnap) {
      logFocus("paint-addr", "billing:still-empty");
      return;
    }
    paint(snap.doc, snap.amountDue ?? amountDue, {
      caller: "deferred-addr-refresh",
      userEdited: true,
      linkedPos: snap.linkedPos,
      linkedReceipts: snap.linkedReceipts,
      lineAllocations: snap.lineAllocations,
      poLineMeta: snap.poLineMeta,
    });
    logFocus("paint-addr", "billing:ok-after-refresh");
  }

  async function refresh(opts = {}) {
    if (!api) return;
    setStatus("Refreshing…");
    const snap = await api.getSnapshot();
    paint(snap && snap.doc, snap && snap.amountDue, {
      reason: snap && snap.reason,
      focusVendor: false,
      userEdited: snap && snap.userEdited,
      linkedPos: snap && snap.linkedPos,
      linkedReceipts: snap && snap.linkedReceipts,
      lineAllocations: snap && snap.lineAllocations,
      poLineMeta: snap && snap.poLineMeta,
      enrichPending: snap && snap.enrichPending,
      preserveFocus: opts.preserveFocus,
      caller: opts.caller || "refresh",
      forceDueDatePaint: !!opts.forceDueDatePaint,
    });
    if (snap && snap.ok === false) setStatus(snap.reason || "Waiting for ERP form…", "warn");
  }
  
  async function paintSourceTerms(doc) {
    if (!el.sourceTermsBlock || !el.sourceTermsFields || !api || !api.fetchSourceTerms) return;
    const refs = collectBillSourceRefs(doc);
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
  
  function paintedHeaderValue(field) {
    if (!lastDoc) return "";
    if (field === "remarks") return lastDoc.remarks ?? "";
    if (field === "terms") return lastDoc.terms ?? "";
    if (field === "supplier") return lastDoc.supplier_name || lastDoc.supplier || "";
    return lastDoc[field] != null ? lastDoc[field] : "";
  }
  
  async function onHeaderBlur(input) {
    const field = input.getAttribute("data-field");
    if (!field || !api || painting || !editable()) return;
  
    if (field === "bill_date" || field === "due_date") {
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
      if (res && res.paymentTermsSettle) {
        logFocus("bill-due-date-settle", formatDueDateSettleLog(res.paymentTermsSettle));
      }
      const multiHint =
        dueDateMultiInstallmentHint(res && res.dueDateScheduleSync) ||
        dueDateMultiInstallmentHint(
          planDueDateScheduleSync(res && res.doc ? res.doc : lastDoc, parsed.iso),
        );
      if (multiHint) setStatus(multiHint, "warn");
      // A settled Invoice date re-derives Bill Due Date on the ERP side (vanilla keys credit
      // terms off bill_date, falling back to posting_date). Without forcing the paint, the
      // due-date box keeps whatever it showed before — it reads as a user edit and wins over
      // the freshly computed value (focus incident 2026-09-05: ui=10/04 vs erp=09/30).
      await refresh({
        forceDueDatePaint: !!(res && res.paymentTermsSettle && res.paymentTermsSettle.ok),
      });
      return;
    }
  
    const kind = dirtyCompareKindForField(field);
    const next =
      kind === "number" ? input.value : normalizeEditableText(input.value);
    if (field === "payment_terms_template" && isCreatePaymentTermsLinkAction(next)) {
      input.value = input.dataset.linkCommitted || "";
      return;
    }
    const painted = paintedHeaderValue(field);
    if (valuesMeaningfullyEqual(painted, next, { kind })) {
      if (field === "supplier") input.value = String(painted ?? "");
      else if (kind !== "number") input.value = normalizeEditableText(String(painted ?? ""));
      if (field === "bill_no") await runBillRefCheck(next);
      return;
    }
    const res = await api.setHeader(field, next);
    if (field === "supplier") {
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
        paint(res.doc || lastDoc, amountDue);
        prefetchVendorBillRefs(next || (res && res.supplier));
        await openSourcePicker(next || (res && res.supplier), { trigger: "blur" });
        scheduleBillRefCheckAfterVendorCommit();
        return;
      }
      if (res && res.ok) {
        prefetchVendorBillRefs(next || (res && res.supplier));
        scheduleBillRefCheckAfterVendorCommit();
      }
    }
    if (res && res.skipped) {
      if (field === "bill_no") await runBillRefCheck(next);
      return;
    }
    if (res && res.ok) noteUserEdit();
    await refresh();
    if (field === "bill_no") await runBillRefCheck(next);
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
  
  async function doSave(submit) {
    if (!api) return { ok: false, reason: "Bill API unavailable." };
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
      if (api.listMandatory || api.checkAccountCompanies) {
        try {
          const jobs = [];
          if (api.listMandatory) jobs.push(api.listMandatory());
          else jobs.push(Promise.resolve(null));
          if (api.checkAccountCompanies) jobs.push(api.checkAccountCompanies());
          else jobs.push(Promise.resolve(null));
          const [mand, acct] = await Promise.all(jobs);
          metaBlockers = mand && Array.isArray(mand.blockers) ? mand.blockers : [];
          accountCompanyBlockers =
            acct && Array.isArray(acct.blockers) ? acct.blockers.filter(Boolean) : [];
        } catch {
          /* keep prior blockers */
        }
      }
      const blockers = currentSaveBlockers();
      if (!commitGateSaveEnabled(blockers)) {
        announceSaveBlocker(blockers[0] || "Fix Amount Due checksum before save.", blockers);
        return { ok: false, reason: blockers[0] || "Local save checks failed.", blockers };
      }
      const capBlockers = listPoCapCacheBlockers();
      if (capBlockers.length) {
        if (typeof api.navDebug === "function") {
          api.navDebug("bill-overbill-cache-block-renderer", capBlockers[0]);
        }
        announceSaveBlocker(capBlockers[0], capBlockers);
        return { ok: false, reason: capBlockers[0], blockers: capBlockers };
      }
      const choice = submit ? "submit" : "save";
      setStatus(commitGateProgressLabel(choice));
      let r = await api.save({ submit: !!submit });
      const splitCount = r && typeof r.overbillRepaired === "number" ? r.overbillRepaired : 0;
      if (splitCount > 0 && r && r.doc) {
        noteUserEdit();
        paint(r.doc, amountDue);
      }
      if (r && r.ok) {
        userEdited = false;
        metaBlockers = [];
        accountCompanyBlockers = [];
        paint(r.doc, amountDue);
        paintDirtyPill();
        let statusMsg = commitGateSuccessLabel(choice);
        if (splitCount > 0) {
          statusMsg += ` (split ${splitCount} over-PO line${splitCount === 1 ? "" : "s"} to NIC).`;
        }
        if (submit && r.jitPayment) {
          if (r.jitPayment.ok) {
            statusMsg = `Submitted · Payment Entry ${r.jitPayment.name || ""} created.`.trim();
            await paintAppliedPayments(r.doc, {
              seedPaymentEntry: r.jitPayment.name,
              seedAllocated: r.jitPayment.paid_amount,
            });
          } else {
            statusMsg = `Submitted, but Payment Entry failed: ${r.jitPayment.reason || "unknown"}`;
            if (r.jitPayment.step) {
              statusMsg += ` (${r.jitPayment.step})`;
            }
            if (r.jitPayment.name) {
              statusMsg += ` · draft ${r.jitPayment.name} may exist`;
            }
            setStatus(statusMsg, "warn");
            if (submit && el.newBill) {
              focusFinalizeControl(el.newBill);
            }
            return { ok: true, jitPayment: r.jitPayment };
          }
        }
        setStatus(statusMsg);
        // After submit, keyboard lands on New Bill — the current Bill stays open (not replaced).
        if (submit && el.newBill) {
          focusFinalizeControl(el.newBill);
          setStatus(`${statusMsg} — New Bill button focused (this Bill still open).`);
        }
        return { ok: true };
      }
      if (r && Array.isArray(r.blockers) && r.blockers.length) {
        metaBlockers = r.blockers;
      }
      const reason = formatSaveFailureReason(
        r,
        submit ? "Save & submit" : "Save draft",
      );
      announceSaveBlocker(reason, r && Array.isArray(r.blockers) ? r.blockers : undefined);
      if (splitCount > 0) {
        setStatus(
          `${reason} (split ${splitCount} over-PO line${splitCount === 1 ? "" : "s"} to NIC — retry Save & submit).`,
          "err",
        );
      }
      return {
        ok: false,
        reason,
        blockers: r && Array.isArray(r.blockers) ? r.blockers : undefined,
        timedOut: !!(r && r.timedOut),
      };
    } finally {
      saveInFlight = false;
      paintChip();
    }
  }
  
  if (el.landedCost) {
    el.landedCost.onclick = async () => {
      if (!api || !api.openLandedCost) {
        setStatus("Landed Cost API missing — restart the shell.", "err");
        return;
      }
      setStatus("Opening Landed Cost Voucher…");
      const res = await api.openLandedCost();
      if (!(res && res.ok)) {
        setStatus((res && res.reason) || "Could not open Landed Cost.", "err");
      }
    };
  }

  if (el.addPayment) {
    el.addPayment.onclick = async () => {
      if (!api || !api.openAddPayment) {
        setStatus("Add payment API missing — restart the shell.", "err");
        return;
      }
      setStatus("Opening Payment Entry…");
      const res = await api.openAddPayment();
      if (res && res.ok) {
        setStatus(`Payment Entry ${res.name || ""} opened — Esc returns to this Bill.`.trim());
      } else {
        setStatus((res && res.reason) || "Could not open Payment Entry.", "err");
      }
    };
  }
  
  el.vendor.addEventListener("change", () => onHeaderBlur(el.vendor));
  el.terms.addEventListener("change", () => onHeaderBlur(el.terms));
  el.date.addEventListener("change", () => onHeaderBlur(el.date));
  el.billno.addEventListener("change", () => onHeaderBlur(el.billno));
  el.duedate.addEventListener("change", () => onHeaderBlur(el.duedate));
  el.memo.addEventListener("change", () => onHeaderBlur(el.memo));
  
  if (el.dueSticky) {
    el.dueSticky.addEventListener("click", () => focusAmountDueField());
  }
  if (el.dueStatus) {
    el.dueStatus.addEventListener("click", () => {
      if (el.dueStatus.classList.contains("mismatch")) focusAmountDueField();
    });
  }
  
  if (el.docStatusBadge) {
    el.docStatusBadge.addEventListener("click", () => {
      if (!el.docStatusBadge.classList.contains("is-clickable")) return;
      scrollToPaymentsSection();
    });
    el.docStatusBadge.addEventListener("keydown", (ev) => {
      if (!el.docStatusBadge.classList.contains("is-clickable")) return;
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      scrollToPaymentsSection();
    });
  }
  
  wireAddressPickerFields({
    nodes: [el.billingAddress, el.shipFrom, el.shipTo],
    isEditable: editable,
    onOpen: (role) => {
      void openAddressPickerModal(role);
    },
    lockedMessage: "Addresses are locked on submitted Bills.",
    setStatus,
  });
  if (el.mop) el.mop.addEventListener("change", () => onHeaderBlur(el.mop));
  if (el.cashBank) el.cashBank.addEventListener("change", () => onHeaderBlur(el.cashBank));
  if (el.paidAmount) {
    el.paidAmount.addEventListener("change", async () => {
      if (!api || !editable() || painting) return;
      const n = parseMoney(el.paidAmount.value);
      const next = n == null ? "0" : String(n);
      setStatus("Setting Paid Amount…");
      const res = await api.setHeader("paid_amount", next);
      if (res && res.ok && !res.skipped) noteUserEdit();
      paint(res && res.doc ? res.doc : lastDoc, amountDue);
    });
  }
  if (el.isPaid) {
    el.isPaid.addEventListener("click", async () => {
      if (!api || !editable() || painting || el.isPaid.disabled) return;
      const checked = !isPaidChecked(lastDoc && lastDoc.is_paid);
      const writes = isPaidToggleWrites(lastDoc, checked, {
        amountDue,
        preferredModeOfPayment: DEFAULT_CREDIT_CARD_MODE_OF_PAYMENT,
      });
      setStatus(checked ? "Marking Already paid…" : "Clearing Already paid…");
      let doc = lastDoc;
      for (const w of writes) {
        const res = await api.setHeader(w.field, w.value);
        if (!(res && res.ok)) {
          setStatus((res && res.reason) || `Could not set ${w.field}.`, "err");
          paint(doc, amountDue);
          return;
        }
        if (!res.skipped) noteUserEdit();
        doc = res.doc || doc;
      }
      paint(doc, amountDue);
      if (checked && doc && !doc.cash_bank_account) {
        setStatus(
          "Already paid — pick Cash / Bank Account (required on Submit). Mode of Payment defaults to Credit Card.",
          "warn",
        );
      } else {
        setStatus(checked ? "Already paid set." : "Already paid cleared.");
      }
    });
  }
  if (el.isReturn) {
    el.isReturn.addEventListener("click", async () => {
      if (!api || !editable() || painting || el.isReturn.disabled) return;
      const checked = !isCreditMemoBill(lastDoc);
      setStatus(checked ? "Marking as credit memo…" : "Clearing credit memo…");
      const res = await api.setHeader("is_return", checked ? 1 : 0);
      if (!(res && res.ok)) {
        setStatus((res && res.reason) || "Could not change credit memo flag.", "err");
        paint(lastDoc, amountDue);
        return;
      }
      if (!res.skipped) noteUserEdit();
      paint(res.doc, res.amountDue != null ? res.amountDue : amountDue);
      setStatus(
        checked
          ? "Credit memo (Vendor Credit) — quantities must be negative. Use the informal " +
              "links below once you know which Bill / Sales Order it relates to."
          : "Credit memo cleared — back to a normal Bill.",
      );
      // Turning it ON with no source Bill behind it is exactly the OI-147 orphan the warning
      // shouts about — so offer the picker at the one moment the clerk is thinking about it,
      // rather than making them find "Informal link to Bill…" further down the page.
      if (checked && !creditMemoReturnAgainst(lastDoc)) {
        void openInformalLinkPicker("bill", { purpose: "source" });
      }
    });
  }
  wireDateField(el.date);
  wireDateField(el.duedate);
  
  el.amountdue.addEventListener("focus", () => {
    const n = parseMoney(amountDue);
    el.amountdue.value = n != null ? String(n) : amountDue || "";
    amountDueAtFocus = el.amountdue.value;
    try {
      el.amountdue.select();
    } catch {
      /* ignore */
    }
  });
  el.amountdue.addEventListener("input", () => {
    if (calcUi.getState().mode === "active" && calcUi.getInput() === el.amountdue) return;
    const n = parseMoney(el.amountdue.value);
    amountDue = n != null ? String(n) : el.amountdue.value;
    paintChip();
    if (api) api.setAmountDue(amountDue);
  });
  // Attach before blur so active calc commits first, then this blur formats.
  wireFieldCalc(el.amountdue, {
    kind: "amountDue",
    onCommit: (value) => {
      const n = parseMoney(value);
      amountDue = n != null ? String(n) : "";
      const changed = !valuesMeaningfullyEqual(amountDueAtFocus, amountDue, { kind: "number" });
      if (api) api.setAmountDue(amountDue, changed);
      if (changed) noteUserEdit();
      amountDueAtFocus = amountDue;
      paintAmountDueInput({ keepRaw: true });
      paintChip();
    },
  });
  el.amountdue.addEventListener("blur", () => {
    const n = parseMoney(el.amountdue.value);
    amountDue = n != null ? String(n) : "";
    const changed = !valuesMeaningfullyEqual(amountDueAtFocus, amountDue, { kind: "number" });
    if (api) api.setAmountDue(amountDue, changed);
    if (changed) noteUserEdit();
    paintAmountDueInput();
    paintChip();
  });
  el.amountdue.addEventListener("keydown", (ev) => {
    if (calcUi.getState().mode === "active" && calcUi.getInput() === el.amountdue) return;
    if (ev.key === "Enter") {
      ev.preventDefault();
      el.amountdue.blur();
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      el.amountdue.value = amountDueAtFocus;
      const n = parseMoney(amountDueAtFocus);
      amountDue = n != null ? String(n) : amountDueAtFocus;
      el.amountdue.blur();
    }
  });
  
  document.getElementById("btn-refresh").onclick = () => refresh();
  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) btnRefresh.title = REFRESH_BUTTON_TITLE;
  const btnBackTop = document.getElementById("btn-back-top");
  if (btnBackTop) {
    btnBackTop.onclick = () => {
      focusFinalizeControl(el.submit);
      setStatus("Focused Save draft & submit — finish entry, then finalize.");
    };
  }
  document.getElementById("btn-vanilla").onclick = () => api && api.openVanilla();
  docCapsUi = wireDocCapsUi({
    capsButton: el.caps,
    getCapsOn: () => docCapsOn,
    setCapsOn: (v) => {
      docCapsOn = v;
    },
  });
  if (el.find) el.find.onclick = () => requestToolbarAction("find");
  if (el.refWarn) {
    el.refWarn.addEventListener("click", () => openFindFromRefDupeWarning());
  }
  if (el.refStatus) {
    el.refStatus.addEventListener("click", () => openFindFromRefDupeWarning());
  }
  if (el.newBill) el.newBill.onclick = () => requestToolbarAction("new");
  if (el.print) el.print.onclick = () => requestToolbarAction("print");
  if (el.commitGate) {
    wireCommitGateChrome(commitGateEls(), {
      onResolveChoice: (choice) => resolveCommitGate(choice),
      onCancelOutside: () => cancelCommitGateFromOutside(),
      trapTab: true,
    });
  }
  if (el.tabItems) el.tabItems.onclick = () => setLineTab("items");
  if (el.tabExpenses) el.tabExpenses.onclick = () => setLineTab("expenses");
  if (el.revert) {
    el.revert.onclick = async () => {
      if (!api || !api.revertUnsaved) {
        setStatus("Revert API missing — restart the shell.", "err");
        return;
      }
      setStatus("Reverting unsaved changes…");
      const res = await api.revertUnsaved();
      if (res && res.ok) {
        paint(res.doc, res.amountDue != null ? res.amountDue : amountDue);
        setStatus(res.isNew ? "Started a fresh new Bill." : "Reloaded last saved Bill.");
      } else {
        setStatus((res && res.reason) || "Revert failed.", "err");
      }
    };
  }
  function openSelectSourceFromToolbar() {
    const decision = shouldOpenSourceModalAfterVendorPick({
      trigger: "toolbar",
      hasSupplier: !!(
        normalizeEditableText(lastDoc && lastDoc.supplier) ||
        normalizeEditableText(el.vendor.value)
      ),
      editable: editable(),
      modalAlreadyOpen: sourceModalOpenRef.current,
    });
    if (!decision.open) {
      setStatus(
        decision.reason === "no_supplier"
          ? "Pick a vendor before Select PO / source."
          : `Source modal skipped (${decision.reason}).`,
        "warn",
      );
      return;
    }
    openSourcePicker(undefined, { trigger: "toolbar" });
  }
  
  document.getElementById("btn-select-po").onclick = () => openSelectSourceFromToolbar();
  if (el.addSource) {
    el.addSource.tabIndex = -1;
    el.addSource.onclick = () => openSelectSourceFromToolbar();
  }
  if (el.creditMemo) {
    el.creditMemo.onclick = async () => {
      const sourceName = lastDoc && lastDoc.name ? String(lastDoc.name).trim() : "";
      if (!sourceName || !lastDoc || Number(lastDoc.docstatus) !== 1) {
        setStatus("Save and submit this Bill before creating a credit memo against it.", "warn");
        return;
      }
      if (!api || !api.createCreditMemo) {
        setStatus("Credit memo API missing — restart the shell.", "err");
        return;
      }
      setStatus(`Creating credit memo against ${sourceName}…`);
      // createCreditMemoFrom resets dirtyState *before* it navigates, so a rejected IPC here
      // must not leave the page sitting on "Creating…" forever with no way to tell.
      try {
        const res = await api.createCreditMemo(sourceName);
        if (res && res.ok) {
          paint(res.doc, res.amountDue != null ? res.amountDue : amountDue);
          setStatus(`Credit memo drafted against ${sourceName} — review qty/amounts, then save.`);
        } else {
          setStatus((res && res.reason) || "Could not create credit memo.", "err");
        }
      } catch (err) {
        setStatus(
          `Could not create credit memo: ${String(err && err.message ? err.message : err)}. ` +
            "Reopen the Bill before editing further.",
          "err",
        );
      }
    };
  }
  if (el.informalLinkBill) {
    el.informalLinkBill.onclick = () => openInformalLinkPicker("bill");
  }
  if (el.informalLinkSo) {
    el.informalLinkSo.onclick = () => openInformalLinkPicker("so");
  }
  document.getElementById("btn-retry").onclick = async () => {
    if (!api || !api.retryLoad) return;
    setStatus("Retrying Vanilla Bill load…");
    await api.retryLoad();
  };
  el.save.onclick = () => doSave(false);
  el.submit.onclick = () => doSave(true);
  if (el.taxAccount) {
    mountBillLinkPicker(el.taxAccount, "Account", async (v) => {
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
        paint(res.doc, amountDue);
        setStatus("Tax/charge row added.");
        if (el.taxAccount) {
          requestAnimationFrame(() => el.taxAccount.focus());
        }
      } else {
        setStatus((res && res.reason) || "Add tax failed.", "err");
      }
    };
  }
  function wireTaxAddRowTabCycle() {
    /** @type {Record<string, HTMLElement|null|undefined>} */
    const nodes = {
      taxAccount: el.taxAccount,
      taxAmount: el.taxAmount,
      addTax: el.addTax,
    };
    for (const id of Object.keys(nodes)) {
      const node = nodes[id];
      if (!node) continue;
      node.addEventListener("keydown", (ev) => {
        if (ev.key !== "Tab") return;
        const nextId = nextTaxAddRowTabTarget(id, ev.shiftKey);
        if (!nextId) return;
        const target = nodes[nextId];
        if (!target || target.disabled) return;
        ev.preventDefault();
        target.focus();
      });
    }
  }
  if (el.addTax) {
    wireTaxAddRowTabCycle();
  }
  el.addLine.onclick = async () => {
    if (!api || !editable()) return;
    setStatus("Adding line…");
    const res = await api.addItem();
    if (res && res.ok) {
      noteUserEdit();
      paint(res.doc, amountDue);
      setStatus("Line added.");
    } else {
      setStatus((res && res.reason) || "Add line failed.", "err");
    }
  };
  
  wireItemImportButton({
    button: el.importItems,
    getItemCols: () => BILL_ITEM_COLS,
    getApi: () => api,
    isEditable: () => editable(),
    getCurrentRowCount: () =>
      lastDoc && Array.isArray(lastDoc.items) ? lastDoc.items.length : 0,
    onApplied: (result) => {
      noteUserEdit();
      paint(result.doc || lastDoc, amountDue);
    },
    setStatus,
    testId: "bill-import",
  });
  if (el.clearQty) {
    el.clearQty.onclick = async () => {
      if (!api || !editable()) return;
      setStatus("Clearing all quantities…");
      const res = await api.clearAllQty();
      if (res && res.ok) {
        noteUserEdit();
        paint(res.doc, amountDue);
        setStatus("All line quantities set to 0.");
      } else {
        setStatus((res && res.reason) || "Clear qty failed.", "err");
      }
    };
  }
  if (el.attach) {
    el.attach.onclick = async () => {
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
    };
  }
  
  if (api && api.onSnapshot) {
    api.onSnapshot((snap) =>
      paint(snap && snap.doc, snap && snap.amountDue, {
        caller: snap && snap.enrichProgress ? "enrich-progress" : "onSnapshot",
        reason: snap && snap.reason,
        focusVendor: !!(snap && snap.focusVendor),
        userEdited: snap && snap.userEdited,
        linkedPos: snap && snap.linkedPos,
        linkedReceipts: snap && snap.linkedReceipts,
        lineAllocations: snap && snap.lineAllocations,
        poLineMeta: snap && snap.poLineMeta,
        enrichPending: snap && snap.enrichPending,
        preserveFocus: snap && snap.enrichProgress ? captureBillFocus() : undefined,
      }),
    );
  }
  
  // Navigation (Home / Vanilla / Recent) routes through this SAME in-page gate.
  if (api && api.onOpenNavGate) {
    api.onOpenNavGate((payload) => {
      const token = payload && payload.token;
      if (!token) return;
      if (!shouldOpenCommitGate(userEdited)) {
        if (api.resolveNavGate) api.resolveNavGate(token, true);
        return;
      }
      openGate({ kind: "nav", navToken: token, label: payload.label });
    });
  }
  if (api && api.onCancelNavGate) {
    api.onCancelNavGate((token) => {
      if (pendingGate && pendingGate.kind === "nav" && pendingGate.navToken === token) {
        hideCommitGate();
      }
    });
  }
  ensureHeaderLinkPickers();
  installFocusRing();
  refresh();
}
