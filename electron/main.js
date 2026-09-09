/**
 * Electron main — M0–M2 shell + Doc Bill / PO / Item Receipt WebContentsViews (T4).
 */
import { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog, clipboard } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { pingHealth } from "../src/health.js";
import { frappeResourceGetList, frappeResourceGetDocs } from "../src/erp-http-list.js";
import { isAllowedErpUrl, erpUrl } from "../src/nav-guard.js";
import { pushHistory } from "../src/history.js";
import {
  classifyHistoryOpen,
  pickFallbackDocRoute,
  FALLBACK_DOC_ROUTE,
  isSoftPeekRoute,
  isQueryReportRoute,
  appRouteParts,
  filterHistoryForCompany,
  softPeekReturnLabel,
  shouldForceVanillaReopen,
  shouldEscDismissSoftPeek,
  erpLivePathDiffers,
} from "../src/history-nav.js";
import {
  applyPeekTreeToHistory,
  applyErpHopToPeekStack,
  beginPeekParent,
  collapsePeekStack,
  isActivePeekStack,
  pushPeekChild,
  resolveSoftPeekEscAction,
  shouldCollapsePeekStack,
} from "../src/peek-stack.js";
import { appendNavDebug, formatNavDebugLines } from "../src/nav-debug.js";
import { applyWebContentsListenerBudget } from "../src/web-contents-listener-budget.js";
import { appendFocusDebug, formatFocusDebugLines } from "../src/focus-debug.js";
import { shouldAcceptErpTrackNav, shouldClearErpNavIntent, shouldBlockDocHijackForListIntent, resolveErpNavIntent } from "../src/erp-nav-intent.js";
import {
  NAV_INCIDENT_NOTE_MAX,
  buildNavIncident,
  formatNavIncidentContextLines,
  formatNavIncidentsDigest,
  appendNavIncident,
  serializeNavIncidentLine,
} from "../src/nav-incident.js";
import {
  FOCUS_INCIDENT_NOTE_MAX,
  buildFocusIncident,
  formatFocusIncidentContextLines,
  formatFocusIncidentsDigest,
  appendFocusIncident,
  serializeFocusIncidentLine,
} from "../src/focus-incident.js";
import { DOCTYPE_LABELS } from "../src/doctype-labels.js";
import { resolveDocSkinTarget, DOC_FORM_DOCTYPES, hasSimplifiedLens } from "../src/lens-context.js";
import { buildOutstandingBillRows } from "../src/outstanding-bills.js";
import {
  DEFAULT_PAYMENT_BATCH_PREFS,
  mergePaymentBatchPrefs,
  validatePaymentBatchPrefs,
} from "../src/payment-batch-prefs.js";
import {
  mergePaymentDirectionPrefs,
  preferredPaymentDirection,
  rememberPaymentDirection,
} from "../src/payment-direction-prefs.js";
import {
  routeInfo,
  routesReferToSameDoc,
  isNewDocRecord,
  isGenericNewDocRoute,
  isDocListRoute,
  normalizeAppRoute,
} from "../src/route-info.js";
import {
  rememberLens,
  resolveEntryOpen,
  shouldOpenDocLens,
  normalizeDoctypeKey,
  preferredLens,
} from "../src/lens-prefs.js";
import {
  applySaveToShelved,
  draftableDoctypeKeys,
  reconcileShelvedWithOpenDoc,
  draftShelfLabel,
  recentDraftDetailForHistory,
} from "../src/shelved-drafts.js";
import { copyRefForDoc } from "../src/history-copy-ref.js";
import {
  appendCalcHistory,
  pruneCalcHistory,
  makeCalcHistoryEntry,
  findCalcHistoryEntry,
  formatCalcCopyTable,
  formatCalcCopyTotal,
  calcSourceLabel,
  markCalcHistoryPriorSession,
} from "../src/calc/session-history.js";
import {
  classifyHostClass,
  formatDiagnoseLines,
  diagnoseCopyText,
  appendPingLog,
} from "../src/diagnose.js";
import {
  HEALTH_REMEDIATION_FILENAME,
  EMPTY_HEALTH_REMEDIATION,
  normalizeHealthRemediationPrefs,
  remediationUiState,
  applyRemediationSetup,
  isSafeNotifyUrl,
  isAllowedAutofixScriptPath,
  autofixReady,
} from "../src/health-remediation.js";
import { spawn } from "node:child_process";
import { findListFocusField, findListFocusLabel } from "../src/doc-chrome.js";
import {
  resolveFeedbackFormUrl,
  buildFeedbackUrl,
  isPlaceholderFeedbackUrl,
} from "../src/feedback-url.js";
import {
  shouldGateNavigation,
  shouldGateSurfaceNavigation,
  finishLensApply,
  markUserEdited,
  captureBaseline,
  valuesMeaningfullyEqual,
  dirtyCompareKindForField,
  normalizeEditableText,
} from "../src/dirty-gate.js";
import {
  amountDueMatchesGrandTotal,
  billCompareTotal,
  isEditableBillItemField,
  isEditableBillTaxField,
  isWritableBillHeaderField,
  uniqueLinkedPurchaseOrderNames,
  linkedPurchaseOrdersForBill,
  uniqueLinkedPurchaseReceiptNames,
  linkedPurchaseReceiptsForBill,
} from "../src/bill-map.js";
import {
  billEnrichStillPending,
  defaultEnrichPendingForDoc,
} from "../src/bill-enrich-pending.js";
import { formatDueDateSettleLog, formatEnrichPendingLog } from "../src/bill-payment-terms-settle.js";
import {
  captureAlreadyPaidIntent,
  clearIsPaidForJitPeWrites,
  listJitPaymentEntryBlockers,
  projectBillPaymentRows,
  billCanAddPayment,
} from "../src/bill-paid.js";
import { projectAddressPickerOption } from "../src/bill-address.js";
import {
  addressRoleMeta,
  addressListParty,
  addressPickerOpenDecision as docAddressPickerOpenDecision,
} from "../src/doc-address.js";
import {
  isAllocatableChargeRow,
  planChargeToStockAllocation,
} from "../src/bill-charge-allocate.js";
import {
  ITEM_ROW_CLEAR_FIELDS,
  LAST_ITEM_ROW_TOAST,
} from "../src/bill-item-guard.js";
import {
  isEditablePoItemField,
  resolvePoStampDate,
  poRowsNeedingScheduleStamp,
  shouldStampPoDateExpectedOnSave,
} from "../src/po-map.js";
import { isEditableReceiptItemField } from "../src/receipt-map.js";
import { normalizeSearchLinkResults, PAYMENT_TERMS_TEMPLATE_NEW_ROUTE } from "../src/link-search.js";
import {
  annotateAccountLinkOptions,
  accountNamesOnBillDoc,
  listAccountCompanyMismatchBlockers,
} from "../src/account-company.js";
import { formatClientErrorReason } from "../src/frappe-error.js";
import { mergeSinglePaymentEntries } from "../src/payment-entry-batch.js";
import { rankSupplierLinkOptions, utcYmd } from "../src/vendor-activity.js";
import { buildBillSourceGroups, enrichReceiptsWithPurchaseOrders, combineMappedBillSources } from "../src/source-modal.js";
import {
  SOURCE_LIST_SLICE_ORDER,
  buildSourceGroupFromSliceRows,
  buildBillSourceLoadingGroups,
  applySourceSliceToGroups,
} from "../src/source-list-slices.js";
import { formatJitPoTitle } from "../src/jit-po-bridge.js";
import { rankSalesOrdersForBill } from "../src/so-picker.js";
import {
  normalizeLineAllocation,
  jitPoTitleForSalesOrders,
  splitQtyAcrossSalesOrders,
} from "../src/bill-line-allocation.js";
import {
  indexPoLineMeta,
  hydrateBillLineAllocations,
  poFetchKeysForBillDoc,
  poItemsAndHeadersFromParentDocs,
  prItemsFromParentDocs,
} from "../src/bill-po-hydrate.js";
import {
  billRowHasSource,
  formatQtyForErp,
  planBillLineQtySplit,
  listOverbillCapCacheBlockers,
} from "../src/bill-po-qty-split.js";
import {
  evaluateBillRef,
  billRefWaitingForVendorResult,
  resolveBillRefSupplier,
} from "../src/bill-ref-check.js";
import { buildReceiptSourceGroups } from "../src/receipt-source.js";
import {
  DOC_SKIN_PROFILES,
  docFormUiPayload,
  profileByDoctypeKey,
  profileByLayoutKey,
} from "../src/doc-skin-registry.js";
import { DOC_FORM_BRIDGE_VERSION, doctypeKeyFromErpDoctype } from "../src/erp-form-bridge.js";
import { planMappedHeaderApply } from "../src/mapped-header-fields.js";
import { withBillRefToken } from "../src/credit-memo.js";
import { maybeChaosLag, readChaosLagConfig } from "../src/erp-chaos-lag.js";
import { buildSimplifiedPayload, buildSimplifiedTeardown } from "../src/assume-applier-payload.js";
import { toolbarLensId, lensTabsFor, historyRailWidth } from "../src/chrome-state.js";
import {
  submittedEntryFromDoc,
  pushSubmittedDoc,
  markSubmittedPriorSession,
  submittedRowSummary,
  submittedEntryRoute,
} from "../src/submitted-docs.js";
import { poFindListFilterPayload, poFindPrefillFromLogbook } from "../src/po-find-prefill.js";
import {
  BILL_FIND_TIMEOUT_MS,
  BILL_PRINT_TIMEOUT_MS,
  BILL_SAVE_TIMEOUT_MS,
  classifyFindBillResult,
  classifyPrintNavResult,
  isPurchaseInvoiceListRoute,
  normalizePrintIpcResult,
  printFormMatchesBill,
  timeoutFailure,
} from "../src/bill-action-flow.js";
import {
  BILL_LOAD_IDLE,
  BILL_LOAD_LOADING,
  BILL_LOAD_FAILED,
  billRefocusAction,
  billLoadPhaseAfterSnap,
} from "../src/bill-load-phase.js";
import {
  resolveErpBase,
  HEALTH_PING_PATH,
  HEALTH_PING_MS,
  TAB_BAR_HEIGHT,
} from "../src/config.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PKG = require("../package.json");
const APP_VERSION = PKG.version || "0.0.0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ERP_BASE = resolveErpBase(process.env);
const OFF = { x: -20000, y: 0, width: 10, height: 10 };
const ERP_BRIDGE_PAGE_JS = fs.readFileSync(
  path.join(__dirname, "erp-form-bridge-page.js"),
  "utf8",
);

/** @typedef {"home"|"erp"|"bill"|"doc"|"pay-outstanding"|"payment-doc"} SurfaceMode */
/** @typedef {"po"|"receipt"|"bill"} DocFormSkinId */

let win = null;
let chrome = null;
let home = null;
let bill = null;
/** Shared PO + Item Receipt Doc shell. */
let docForm = null;
let erp = null;
let hist = null;
/** OI-161 Packet 4 (v2): Home-triggered dashboard, hosted in-window like every other surface. */
let payOutstanding = null;
/** Packet 4b step 5: read-only full-page mount of an existing Payment Entry. */
let paymentDoc = null;
/** @type {SurfaceMode} */
let surfaceMode = "home";
/** @type {DocFormSkinId|null} */
let activeDocSkin = null;
/** Path on ERP site, e.g. /app/purchase-invoice/new */
let currentRoute = "/desk";
let lastPolledErpUrl = "";
let healthTimer = null;
let routePollTimer = null;
/** @type {"ok"|"bad"|"unknown"} */
let lastHealth = "unknown";
/** @type {import("../src/history.js").HistoryEntry[]} */
let history = [];
/** @type {Record<string, string>} */
let lensPrefs = {};
/** @type {import("../src/payment-batch-prefs.js").PaymentBatchPrefs} */
let paymentBatchPrefs = { ...DEFAULT_PAYMENT_BATCH_PREFS };
/** AP vs AR at /app/payment-entry/new (Packet 4b step 5). @type {{ direction: "Pay"|"Receive" }} */
let paymentDirectionPrefs = mergePaymentDirectionPrefs(null);
/** @type {import("../src/shelved-drafts.js").ShelvedDraft[]} */
let shelvedDrafts = [];
/** @type {import("../src/calc/session-history.js").CalcHistoryEntry[]} */
let calcHistory = [];
/** Avoid re-entrancy when Vanilla→Doc hijack loads the same URL under Doc skin. */
let lensHijackLock = false;
/**
 * Intentional shell→ERP destination (/app/…). Stale did-navigate from the prior
 * form (e.g. Bill) must not overwrite currentRoute or Doc-hijack back (Home→PO).
 * @type {string|null}
 */
let erpNavIntentPath = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let erpNavIntentTimer = null;
/** @type {{ status: string, code: number|null, latencyMs: number|null, lastOkAt: string|null, internetOk: boolean|null }} */
let diagnoseState = {
  status: "unknown",
  code: null,
  latencyMs: null,
  lastOkAt: null,
  internetOk: null,
};
/** @type {import("../src/nav-debug.js").NavDebugEntry[]} */
let navDebugLog = [];
/** @type {import("../src/focus-debug.js").FocusDebugEntry[]} */
let focusDebugLog = [];
/** @type {object[]} */
let navIncidentRing = [];
/** @type {object[]} */
let focusIncidentRing = [];
/** Frozen context while the Nav issue dialog is open. */
let navIncidentDraft = null;
/** Frozen context while the Focus issue dialog is open. */
let focusIncidentDraft = null;
/** @type {import("../src/health-remediation.js").HealthRemediationPrefs} */
let healthRemediation = { ...EMPTY_HEALTH_REMEDIATION };
/** @type {object[]} */
let pingLog = [];
/** Scratch Amount Due for Doc Bill (not an ERP field). */
let amountDueScratch = "";
/** Last committed Amount Due for dirty compares (focus/typing must not poison). */
let amountDueCommitted = "";
/** Scratch Date Expected for Doc PO (stamps line schedule_date on save). */
let dateExpectedScratch = "";
/** Dirty-gate state for Doc form surfaces (Bill / PO / IR). */
let dirtyState = {
  isDirty: false,
  isNew: true,
  userEdited: false,
  baselineJson: null,
  doc: null,
};
/**
 * Packet 4b step 3: the pay-outstanding check-preview drawer, self-reported dirty by the
 * renderer (set-pay-outstanding-dirty) -- the first non-Doc surface that can hold unsaved
 * input. No renderer call sets this true yet (the drawer is read-only until step 4's write
 * path); the gate is wired ahead of that so the write path lands with protection already live.
 */
let payOutstandingDirty = false;
/** Shell scratch: customer + multi-SO per Bill line (ERP PI item has no SO column). */
/** @type {Record<string, Record<number, import("../src/bill-line-allocation.js").LineAllocation>>} */
let billLineAllocationsByDoc = {};
/** @type {Record<string, Record<number, import("../src/bill-item-table.js").PoLineMeta>>} */
let billPoLineMetaByDoc = {};
/**
 * Soft-peek park (OI-112): Doc surface hidden while ERP shows a master; dirtyState kept.
 * @type {{ mode: "bill"|"doc", skinId: string|null, route: string }|null}
 */
let parkedDocSurface = null;
/** Bumps on each showBill proceed; stale loads abandon before paint (re-click race). */
let billLoadGen = 0;
/** @type {import("../src/bill-load-phase.js").typeof BILL_LOAD_IDLE | import("../src/bill-load-phase.js").typeof BILL_LOAD_LOADING | import("../src/bill-load-phase.js").typeof BILL_LOAD_FAILED | import("../src/bill-load-phase.js").typeof BILL_LOAD_READY} */
let billLoadPhase = BILL_LOAD_IDLE;
/**
 * Nested peeks under the parent Doc (OI-128 A). Survives Esc/Doc-tab rebind;
 * cleared on hard leave. Children stay in `history` as standalone rows.
 * @type {import("../src/peek-stack.js").PeekStack|null}
 */
let peekStack = null;
/** True once the Simplified payload has been injected into the live ERP page. */
let simplifiedSkinInstalled = false;
/** Recent/Drafts rail collapsed to a grab strip (persisted; 4K-quarter windows). */
let histCollapsed = false;
/** Submit-and-move-on trail: Drafts drops a doc on submit and Recent keeps one row per doctype. */
let submittedDocs = [];
/** Active company abbr from ERP (OI-118 history hygiene). */
let sessionCompanyAbbr = "";

/**
 * Dogfood nav trail (OI-112) — ring + userData file; shown in DB diagnose copy.
 * @param {string} event
 * @param {string} [detail]
 */
function navDebug(event, detail) {
  const entry = {
    at: new Date().toISOString(),
    event: String(event || "event"),
    surfaceMode,
    currentRoute: currentRoute || "",
    detail: detail != null ? String(detail) : "",
  };
  navDebugLog = appendNavDebug(navDebugLog, entry);
  try {
    if (app.isReady()) {
      const file = path.join(app.getPath("userData"), "nav-debug.log");
      fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    }
  } catch {
    /* ignore disk errors during dogfood */
  }
}

function navDebugLogPath() {
  return path.join(app.getPath("userData"), "nav-debug.log");
}

function navIncidentLogPath() {
  return path.join(app.getPath("userData"), "nav-incidents.log");
}

/**
 * Dogfood focus trail — ring + userData file; shown in DB diagnose copy.
 * @param {string} event
 * @param {string} [detail]
 * @param {{ surface?: string, active?: import("../src/focus-debug.js").FocusActiveSummary|null }} [extras]
 */
function focusDebug(event, detail, extras = {}) {
  const entry = {
    at: new Date().toISOString(),
    event: String(event || "focus"),
    surfaceMode,
    surface: extras.surface != null ? String(extras.surface) : "",
    currentRoute: currentRoute || "",
    detail: detail != null ? String(detail) : "",
    active: extras.active || null,
  };
  focusDebugLog = appendFocusDebug(focusDebugLog, entry);
  try {
    if (app.isReady()) {
      const file = path.join(app.getPath("userData"), "focus-debug.log");
      fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    }
  } catch {
    /* ignore disk errors during dogfood */
  }
}

function focusDebugLogPath() {
  return path.join(app.getPath("userData"), "focus-debug.log");
}

function focusIncidentLogPath() {
  return path.join(app.getPath("userData"), "focus-incidents.log");
}

/** Privacy-safe freeze of shell + focus trail at Focus issue click. */
function collectFocusIncidentContext() {
  return {
    ...collectNavIncidentContext(),
    focusTrail: focusDebugLog,
  };
}

function currentErpPathname() {
  if (!erp || erp.webContents.isDestroyed()) return "";
  const url = erp.webContents.getURL();
  if (!url || !isAllowedErpUrl(ERP_BASE, url)) return "";
  try {
    return new URL(url).pathname || "";
  } catch {
    return "";
  }
}

/** Privacy-safe freeze of nav state at the moment Nav issue is clicked. */
function collectNavIncidentContext() {
  const info = routeInfo(currentRoute || "", ERP_BASE);
  return {
    surfaceMode,
    currentRoute: currentRoute || "",
    erpPath: currentErpPathname(),
    activeDocSkin: activeDocSkin || "",
    preferredLens:
      info.doctype && profileByDoctypeKey(info.doctype)
        ? preferredLens(info.doctype, lensPrefs) || ""
        : "",
    userEdited: !!dirtyState.userEdited,
    isDirty: !!dirtyState.isDirty,
    isNew: !!dirtyState.isNew,
    companyAbbr: sessionCompanyAbbr || "",
    guestWindowCount: BrowserWindow.getAllWindows().filter((w) => w && !w.isDestroyed()).length,
    shelvedCount: Array.isArray(shelvedDrafts) ? shelvedDrafts.length : 0,
    parked: parkedDocSurface,
    peekParent: peekStack && peekStack.parent ? peekStack.parent.route : "",
    peekChildren:
      peekStack && Array.isArray(peekStack.children)
        ? peekStack.children.map((c) => c.route)
        : [],
    doc: dirtyState.doc,
    history,
    navTrail: navDebugLog,
    chaosConfig: readChaosLagConfig(),
  };
}

function isDocLensSurface() {
  return surfaceMode === "doc";
}

/** Packet 4b step 3 — the pay-outstanding drawer's own dirty-gate condition. */
function isPayOutstandingDirtySurface() {
  return shouldGateSurfaceNavigation(surfaceMode, "pay-outstanding", payOutstandingDirty);
}

function activeDocProfile() {
  if (surfaceMode === "doc" && activeDocSkin) return DOC_SKIN_PROFILES[activeDocSkin] || null;
  return null;
}

function activeFormView() {
  if (surfaceMode === "doc") return docForm;
  return null;
}

/** @param {DocFormSkinId|string|null|undefined} skinId */
function docShellKind(skinId) {
  return skinId === "bill" ? "bill" : "doc-form";
}

function reloadDocFormShell() {
  return new Promise((resolve) => {
    if (!docForm || docForm.webContents.isDestroyed()) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      docForm.webContents.removeListener("did-finish-load", finish);
      resolve(true);
    };
    docForm.webContents.once("did-finish-load", finish);
    docForm.webContents.loadFile(path.join(__dirname, "doc-form.html"));
    setTimeout(finish, 10000);
  });
}

function prefsPath() {
  return path.join(app.getPath("userData"), "lens-prefs.json");
}
function paymentBatchPrefsPath() {
  return path.join(app.getPath("userData"), "payment-batch-prefs.json");
}
function paymentDirectionPrefsPath() {
  return path.join(app.getPath("userData"), "payment-direction-prefs.json");
}
function navStatePath() {
  return path.join(app.getPath("userData"), "nav-state.json");
}
function healthRemediationPath() {
  return path.join(app.getPath("userData"), HEALTH_REMEDIATION_FILENAME);
}
function loadPrefs() {
  try {
    lensPrefs = JSON.parse(fs.readFileSync(prefsPath(), "utf8")) || {};
  } catch {
    lensPrefs = {};
  }
  try {
    const nav = JSON.parse(fs.readFileSync(navStatePath(), "utf8")) || {};
    shelvedDrafts = Array.isArray(nav.shelved) ? nav.shelved : [];
    // Persisted rows survive restart — mark so the flyout can say "Previous session".
    calcHistory = markCalcHistoryPriorSession(
      pruneCalcHistory(Array.isArray(nav.calcHistory) ? nav.calcHistory : []),
    );
    histCollapsed = !!nav.histCollapsed;
    submittedDocs = markSubmittedPriorSession(
      Array.isArray(nav.submittedDocs) ? nav.submittedDocs : [],
    );
  } catch {
    shelvedDrafts = [];
    calcHistory = [];
    submittedDocs = [];
  }
  try {
    healthRemediation = normalizeHealthRemediationPrefs(
      JSON.parse(fs.readFileSync(healthRemediationPath(), "utf8")),
    );
  } catch {
    healthRemediation = { ...EMPTY_HEALTH_REMEDIATION };
  }
  try {
    paymentBatchPrefs = mergePaymentBatchPrefs(
      JSON.parse(fs.readFileSync(paymentBatchPrefsPath(), "utf8")),
    );
  } catch {
    paymentBatchPrefs = { ...DEFAULT_PAYMENT_BATCH_PREFS };
  }
  try {
    paymentDirectionPrefs = mergePaymentDirectionPrefs(
      JSON.parse(fs.readFileSync(paymentDirectionPrefsPath(), "utf8")),
    );
  } catch {
    paymentDirectionPrefs = mergePaymentDirectionPrefs(null);
  }
}
function savePaymentBatchPrefs() {
  try {
    fs.writeFileSync(paymentBatchPrefsPath(), JSON.stringify(paymentBatchPrefs));
  } catch {
    /* ignore */
  }
}
function savePaymentDirectionPrefs() {
  try {
    fs.writeFileSync(paymentDirectionPrefsPath(), JSON.stringify(paymentDirectionPrefs));
  } catch {
    /* ignore */
  }
}
function saveHealthRemediation() {
  try {
    fs.writeFileSync(healthRemediationPath(), JSON.stringify(healthRemediation, null, 2));
  } catch {
    /* ignore */
  }
}
function savePrefs() {
  try {
    fs.writeFileSync(prefsPath(), JSON.stringify(lensPrefs));
  } catch {
    /* ignore */
  }
}
function saveNavState() {
  try {
    fs.writeFileSync(
      navStatePath(),
      JSON.stringify({ shelved: shelvedDrafts, calcHistory, histCollapsed, submittedDocs }, null, 0),
    );
  } catch {
    /* ignore */
  }
}

function noteCalcHistoryAppend(raw) {
  const payload = raw && typeof raw === "object" ? { ...raw } : {};
  if (!payload.sourceLabel) {
    payload.sourceLabel = calcSourceLabel(payload.doctypeKey);
  }
  const entry = makeCalcHistoryEntry(payload);
  if (!entry) return;
  calcHistory = appendCalcHistory(calcHistory, entry);
  saveNavState();
  sendHistory();
}

function noteShelvedFromSave(doctypeKey, doc) {
  shelvedDrafts = applySaveToShelved(shelvedDrafts, doctypeKey, doc);
  // Same choke point drops it from Drafts (shelf is docstatus 0 only) — catch it on the way
  // out so submit-and-move-on still leaves a trail.
  const submitted = submittedEntryFromDoc(doctypeKey, doc, {
    labels: DOCTYPE_LABELS,
    copyRef: copyRefForDoc(doctypeKey, doc),
  });
  if (submitted) {
    submittedDocs = pushSubmittedDoc(submittedDocs, submitted);
    navDebug("submitted", `${submitted.doctypeKey} ${submitted.name}`);
    pushSubmittedDropdown();
  }
  saveNavState();
  sendHistory();
  // Unmute Recent form row once this draft is on the shelf (or drop mute if submitted).
  if (doc && doc.name && currentRoute) {
    const info = routeInfo(currentRoute, ERP_BASE);
    if (
      info.doctype === normalizeDoctypeKey(doctypeKey) &&
      info.record &&
      String(info.record) === String(doc.name).trim()
    ) {
      bumpFormHistoryFromDoc(currentRoute, doctypeKey, doc);
    }
  }
}

/** Drop submitted / refresh already-shelved draft when a form is opened (OI-060). */
function noteShelvedFromOpen(doctypeKey, doc) {
  const next = reconcileShelvedWithOpenDoc(shelvedDrafts, doctypeKey, doc);
  const unchanged =
    next.length === shelvedDrafts.length &&
    next.every(
      (e, i) =>
        e.name === shelvedDrafts[i].name &&
        e.doctypeKey === shelvedDrafts[i].doctypeKey &&
        e.label === shelvedDrafts[i].label &&
        e.shelvedAt === shelvedDrafts[i].shelvedAt,
    );
  if (unchanged) return;
  shelvedDrafts = next;
  saveNavState();
  sendHistory();
}

function shelveKeyFromDoc(doc) {
  if (!doc) return "";
  return normalizeDoctypeKey(doctypeKeyFromErpDoctype(doc.doctype));
}

/**
 * Vanilla Save/Submit fires a document "save" event the bridge records.
 * Also peek cur_frm so submitted docs leave Drafts even if the save hook missed.
 */
async function drainErpSaveIntoShelved() {
  if (!erp || erp.webContents.isDestroyed()) return;
  await ensureErpFormBridge();
  const raw = await erpEval(
    `(function(){
      try {
        if (!window.__docFormBridge) return { ok: false };
        var saved =
          typeof window.__docFormBridge.takeLastSavedDoc === "function"
            ? window.__docFormBridge.takeLastSavedDoc()
            : { ok: false };
        var peek =
          typeof window.__docFormBridge.peekShelveDoc === "function"
            ? window.__docFormBridge.peekShelveDoc()
            : { ok: false };
        return { ok: true, saved: saved, peek: peek };
      } catch (e) {
        return { ok: false };
      }
    })()`,
  );
  if (!raw || !raw.ok) return;

  if (raw.saved && raw.saved.ok && raw.saved.doc) {
    const key = shelveKeyFromDoc(raw.saved.doc);
    if (key && draftableDoctypeKeys().includes(key)) {
      noteShelvedFromSave(key, raw.saved.doc);
    }
  }

  if (raw.peek && raw.peek.ok && raw.peek.doc && Number(raw.peek.doc.docstatus) !== 0) {
    const key = shelveKeyFromDoc(raw.peek.doc);
    if (!key || !draftableDoctypeKeys().includes(key)) return;
    const name = String(raw.peek.doc.name || "").trim();
    if (!shelvedDrafts.some((e) => e.doctypeKey === key && e.name === name)) return;
    noteShelvedFromSave(key, raw.peek.doc);
  }
}

function showingHome() {
  return surfaceMode === "home";
}

/**
 * E2E=1 only: Playwright drives via __erpE2e (see e2e/GOTCHAS.md).
 */
function syncE2eApi() {
  if (process.env.E2E !== "1") return;
  globalThis.__erpE2e = {
    lastHealth,
    showingHome: showingHome(),
    surfaceMode,
    erpBase: ERP_BASE,
    getErpUrl: () =>
      erp && !erp.webContents.isDestroyed() ? erp.webContents.getURL() : "",
    getHistory: () => history.map((h) => ({ ...h })),
    getShelved: () => shelvedDrafts.map((d) => ({ ...d })),
    appVersion: APP_VERSION,
    isAllowed: (url) => isAllowedErpUrl(ERP_BASE, url),
    trackNav: (url) => {
      trackNav(url);
      return history.map((h) => ({ ...h }));
    },
    showLauncher: () => {
      showHome();
      return { showingHome: showingHome() };
    },
    goHome: () => {
      showHome();
      return { showingHome: showingHome() };
    },
    openErp: (route) => {
      showErp(route || "/desk", { forceLoad: true });
      return { showingHome: showingHome() };
    },
    openBill: (route) => {
      showBill(route || "/app/purchase-invoice/new");
      return { surfaceMode, activeDocSkin };
    },
    openPo: (route) => {
      showDocForm("po", route || "/app/purchase-order/new");
      return { surfaceMode, activeDocSkin };
    },
    openReceipt: (route) => {
      showDocForm("receipt", route || "/app/purchase-receipt/new");
      return { surfaceMode, activeDocSkin };
    },
    openSiteRoot: () => {
      showErp("/", { forceLoad: true });
      return { showingHome: showingHome() };
    },
    viewBounds: () => ({
      showingHome: showingHome(),
      surfaceMode,
      activeDocSkin,
      chrome: chrome ? chrome.getBounds() : null,
      hist: hist ? hist.getBounds() : null,
      home: home ? home.getBounds() : null,
      bill: bill ? bill.getBounds() : null,
      docForm: docForm ? docForm.getBounds() : null,
      erp: erp ? erp.getBounds() : null,
    }),
    docSkinAvailable: () => true,
    getActiveDocSkin: () => activeDocSkin,
    currentRoute: () => currentRoute,
    execInView: (name, js) => {
      const map = { chrome, home, hist, erp, bill, docForm, payOutstanding, paymentDoc };
      const view = map[name];
      if (!view || view.webContents.isDestroyed()) {
        return Promise.reject(new Error(`view not ready: ${name}`));
      }
      return view.webContents.executeJavaScript(js);
    },
  };
  if (win && !win.isDestroyed()) {
    win.setTitle(`erpnext-ui-app [health=${lastHealth}]`);
  }
}

function sendHealth(status) {
  lastHealth = status;
  syncE2eApi();
  if (chrome && !chrome.webContents.isDestroyed()) {
    chrome.webContents.send("health", status);
  }
}

function shellCtx() {
  // On the ERP surface the live page is the truth, not currentRoute -- Frappe's own client
  // router renames a fresh "/new" tab to "new-<doctype>-<random>" moments after it loads, and
  // currentRoute (set when the navigation was *requested*) does not track that rename. Found via
  // Packet 4b step 5's Doc-tab-right-after-tile-click flow: clicking Doc before this settled
  // could resolve against a stale route and silently do nothing. sendUiState() already applies
  // this same correction locally for its own tab-visibility read; this makes every shellCtx()
  // consumer (including openDocSkinContinue's actual navigation, not just tab visibility) safe.
  const liveRoute = surfaceMode === "erp" ? currentErpPathname() || currentRoute : currentRoute;
  const info = routeInfo(liveRoute, ERP_BASE);
  return {
    showingHome: showingHome(),
    lens: isDocLensSurface() || showingHome() ? "doc" : "vanilla",
    route: info.path || liveRoute,
    doctype: info.doctype,
    record: info.record,
    paymentDirection: preferredPaymentDirection(paymentDirectionPrefs),
  };
}

function sendUiState() {
  if (chrome && !chrome.webContents.isDestroyed()) {
    const ctx = shellCtx();
    const onDoc = showingHome() || isDocLensSurface();
    const livePath = currentErpPathname();
    const peekingAway =
      surfaceMode === "erp" &&
      isActivePeekStack(peekStack) &&
      !!(livePath || currentRoute) &&
      !routesReferToSameDoc(
        peekStack.parent.route,
        livePath || currentRoute,
        ERP_BASE,
      );
    const lensId = toolbarLensId({
      onDoc,
      surfaceMode,
      shellRoute: currentRoute,
      liveErpPath: livePath,
      lensPrefs,
      erpBase: ERP_BASE,
    });
    // Every tab past Vanilla must be earned by *this* page: a Doc-skinnable record, a
    // Simplified-ready doctype, or a genuine one-step return to a Doc form. A peek parent
    // that is only some Vanilla page (a Payments dashboard) does not qualify — that lit the
    // Doc tab on a page with no skin (nav incident 2026-09-05).
    // Which route describes the document in front of the clerk: on the ERP surface the live
    // page is the truth (currentRoute can lag), but on the Doc surface the shell owns the
    // route and the hidden ERP view trails it — reading the live path there reports the
    // *previous* document, which swapped Bill and PO lens tabs.
    const contextInfo = routeInfo(
      surfaceMode === "erp" ? livePath || currentRoute : currentRoute,
      ERP_BASE,
    );
    const parkedInfo = parkedDocSurface && parkedDocSurface.route
      ? routeInfo(parkedDocSurface.route, ERP_BASE)
      : null;
    const peekParentDt = isActivePeekStack(peekStack)
      ? normalizeDoctypeKey(peekStack.parent.dt || routeInfo(peekStack.parent.route, ERP_BASE).doctype)
      : "";
    const lensTabs = lensTabsFor({
      onDoc,
      hasDocSkinnedRecord: !!(
        contextInfo.doctype &&
        contextInfo.record &&
        (profileByDoctypeKey(contextInfo.doctype) ||
          (contextInfo.doctype === "payment-entry" &&
            // Isolated from doc-form.html's profile registry on purpose (Packet 4b step 5) --
            // routes to pay-outstanding.html/payment-doc.html instead. /new suppresses the tab
            // for a Receive-direction visit (AR isn't built); an existing record always offers
            // it -- payment-doc.html reads the real payment_type itself once open.
            (!isNewDocRecord(contextInfo.record) ||
              preferredPaymentDirection(paymentDirectionPrefs) !== "Receive")))
      ),
      hasSimplifiedLens: hasSimplifiedLens(contextInfo.doctype, contextInfo.record),
      parkedIsDocSkinned: !!(parkedInfo && parkedInfo.doctype && profileByDoctypeKey(parkedInfo.doctype)),
      peekParentIsDocSkinned: !!(peekParentDt && profileByDoctypeKey(peekParentDt)),
      returnLabel: softPeekReturnLabel(
        parkedDocSurface && surfaceMode === "erp" ? parkedDocSurface : null,
        isActivePeekStack(peekStack) ? peekStack.parent : null,
        { currentRoute: livePath || currentRoute, erpBase: ERP_BASE },
      ).replace(/^Esc · back to /, ""),
    });
    chrome.webContents.send("ui-state", {
      showingHome: showingHome(),
      showingBill: surfaceMode === "doc" && activeDocSkin === "bill",
      showingDocForm: surfaceMode === "doc",
      activeDocSkin,
      lens: lensId,
      docSkinAvailable: lensTabs.doc,
      docTabHint: lensTabs.docHint,
      simplifiedAvailable: lensTabs.simplified,
      route: ctx.route,
      diagnoseOpen: !!(diagnoseWin && !diagnoseWin.isDestroyed()),
      softPeekActive: !!(parkedDocSurface && surfaceMode === "erp") || peekingAway,
      softPeekHint: softPeekReturnLabel(
        parkedDocSurface && surfaceMode === "erp" ? parkedDocSurface : null,
        isActivePeekStack(peekStack) ? peekStack.parent : null,
        { currentRoute: livePath || currentRoute, erpBase: ERP_BASE },
      ),
    });
  }
}

function sendHistory() {
  calcHistory = pruneCalcHistory(calcHistory);
  if (hist && !hist.webContents.isDestroyed()) {
    hist.webContents.send("history", {
      items: applyPeekTreeToHistory(history, peekStack, ERP_BASE),
      shelved: shelvedDrafts,
      calcHistory,
      collapsed: histCollapsed,
      submittedCount: submittedRowSummary(submittedDocs),
    });
  }
  pushCalcHistoryDropdown();
}

function collapsePeekStackHard(reason) {
  if (!isActivePeekStack(peekStack)) return;
  navDebug("peek-collapse", reason || "");
  peekStack = collapsePeekStack();
}

function collapsePeekStackIfLeaving(nextRoute, reason) {
  if (!shouldCollapsePeekStack(peekStack, nextRoute, { erpBase: ERP_BASE })) return;
  collapsePeekStackHard(reason);
}

function notePeekParentAndChild(childRoute) {
  const opts = { erpBase: ERP_BASE, history };
  /** @type {string|null} */
  let parentRoute = null;
  // Live Vanilla form (Payment Entry, etc.) wins over a stale parked Bill when already on ERP.
  if (surfaceMode === "erp" && isSoftPeekRoute(currentRoute || "", ERP_BASE)) {
    const cur = classifyHistoryOpen(currentRoute || "", ERP_BASE);
    if (
      cur.record &&
      !routesReferToSameDoc(currentRoute || "", childRoute, ERP_BASE)
    ) {
      parentRoute = currentRoute || "";
    }
  }
  if (!parentRoute && parkedDocSurface && parkedDocSurface.route) {
    parentRoute = parkedDocSurface.route;
  }
  if (!parentRoute) return;
  peekStack = beginPeekParent(peekStack, parentRoute, opts);
  peekStack = pushPeekChild(peekStack, childRoute, opts);
  navDebug("peek-child", `${peekStack && peekStack.parent ? peekStack.parent.route : ""} → ${childRoute}`);
}

function notePeekFromErpNav(path, fromPath) {
  const had = isActivePeekStack(peekStack);
  peekStack = applyErpHopToPeekStack(peekStack, fromPath, path, {
    erpBase: ERP_BASE,
    history,
  });
  if (isActivePeekStack(peekStack) && peekStack.children.length) {
    if (!had) navDebug("peek-erp-hop", `${fromPath || ""} → ${path}`);
    armSoftPeekEscHook(true).catch(() => {});
  } else if (had && !isActivePeekStack(peekStack)) {
    armSoftPeekEscHook(false).catch(() => {});
  }
}

function pushBillSnapshot(snap) {
  pushDocFormSnapshot(snap);
}

function pushDocFormSnapshot(snap) {
  if (docForm && !docForm.webContents.isDestroyed()) {
    /** @type {Record<string, unknown>} */
    const payload = {
      ...snap,
      profileId: activeDocSkin || "",
      scratch: snap.scratch || { dateExpected: dateExpectedScratch },
    };
    if (activeDocSkin === "bill") {
      payload.amountDue = snap.amountDue != null ? snap.amountDue : amountDueScratch;
      payload.linkedPos = snap.linkedPos || [];
      payload.linkedReceipts = snap.linkedReceipts || [];
      payload.poLineMeta = snap.poLineMeta || getBillPoLineMeta();
      payload.lineAllocations = snap.lineAllocations || getBillLineAllocations();
      if (snap.enrichPending && typeof snap.enrichPending === "object") {
        payload.enrichPending = snap.enrichPending;
      }
      if (snap.enrichProgress) payload.enrichProgress = true;
    }
    docForm.webContents.send("doc-snapshot", payload);
  }
}

function currentBillDocKey() {
  const name = dirtyState.doc && dirtyState.doc.name;
  if (name) return String(name);
  const rec = routeInfo(currentRoute || "", ERP_BASE).record;
  return rec || currentRoute || "__new__";
}

function getBillLineAllocations() {
  const key = currentBillDocKey();
  return billLineAllocationsByDoc[key] || {};
}

function getBillPoLineMeta() {
  const key = currentBillDocKey();
  return billPoLineMetaByDoc[key] || {};
}

/**
 * @param {number} rowIndex
 * @returns {number|null|undefined}
 */
function cachedMaxBillableQtyForRow(rowIndex) {
  const meta = getBillPoLineMeta();
  const rowMeta = meta[rowIndex] ?? meta[String(rowIndex)];
  if (rowMeta && rowMeta.maxBillableQty != null) {
    const n = Number(rowMeta.maxBillableQty);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Block save when sourced rows lack enrich cache (OI-151 — no JIT fetch at submit). */
function listBillOverbillCacheBlockers(doc) {
  return listOverbillCapCacheBlockers(
    doc && doc.items,
    (ri) => cachedMaxBillableQtyForRow(ri),
  );
}

/**
 * PO line cap IPC — cache only (merge + enrich populate billPoLineMetaByDoc).
 * @param {number} rowIndex
 */
async function fetchBillPoLineCapForRow(rowIndex) {
  const doc = dirtyState.doc;
  if (!doc || !Array.isArray(doc.items) || !doc.items[rowIndex]) {
    return { ok: false, reason: "Invalid row" };
  }
  const row = doc.items[rowIndex];
  if (!billRowHasSource(row)) {
    return { ok: true, maxBillableQty: null, noSource: true, poLineMeta: getBillPoLineMeta() };
  }
  const cap = cachedMaxBillableQtyForRow(rowIndex);
  return {
    ok: true,
    maxBillableQty: cap,
    poLineMeta: getBillPoLineMeta(),
    fromCache: true,
    cacheMiss: cap == null,
  };
}

async function fetchBillPoLineMetaViaHttp(doc, poDetails, prDetails, poNames, prNames) {
  const fetchImpl = erpSessionFetchImpl();
  if (!fetchImpl) return null;
  const poParentFields = ["name", "customer", "customer_name", "title", "items"];
  const prParentFields = ["name", "items"];
  const [poParentsRes, prParentsRes] = await Promise.all([
    poNames.length
      ? frappeResourceGetDocs({
          erpBase: ERP_BASE,
          doctype: "Purchase Order",
          names: poNames,
          fields: poParentFields,
          fetchImpl,
        })
      : Promise.resolve({ ok: true, docs: [] }),
    prNames.length
      ? frappeResourceGetDocs({
          erpBase: ERP_BASE,
          doctype: "Purchase Receipt",
          names: prNames,
          fields: prParentFields,
          fetchImpl,
        })
      : Promise.resolve({ ok: true, docs: [] }),
  ]);
  const needPoItems = poDetails.length > 0;
  const needPrItems = prDetails.length > 0;
  if (needPoItems && !poParentsRes.ok) {
    navDebug(
      "bill-po-meta-fetch",
      `via=http fail po=${poParentsRes.status || poParentsRes.reason || "?"}`,
    );
    return null;
  }
  if (needPrItems && !prParentsRes.ok) {
    navDebug(
      "bill-po-meta-fetch",
      `via=http fail pr=${prParentsRes.status || prParentsRes.reason || "?"}`,
    );
    return null;
  }
  const { poItemsByName, poHeadersByName } = poItemsAndHeadersFromParentDocs(
    poParentsRes.docs,
    poDetails,
  );
  const prItemsByName = prItemsFromParentDocs(prParentsRes.docs, prDetails);
  if (needPoItems && !Object.keys(poItemsByName).length) {
    navDebug(
      "bill-po-meta-fetch",
      `via=http fail po=missing_items want=${poDetails.length} got=0`,
    );
    return null;
  }
  if (needPrItems && !Object.keys(prItemsByName).length) {
    navDebug(
      "bill-po-meta-fetch",
      `via=http fail pr=missing_items want=${prDetails.length} got=0`,
    );
    return null;
  }
  return indexPoLineMeta(doc, poItemsByName, poHeadersByName, prItemsByName);
}

async function fetchBillPoLineMeta(doc) {
  const { poDetails, prDetails, poNames, prNames } = poFetchKeysForBillDoc(doc);
  if (!poDetails.length && !prDetails.length && !poNames.length) return {};
  const httpMeta = await fetchBillPoLineMetaViaHttp(
    doc,
    poDetails,
    prDetails,
    poNames,
    prNames,
  );
  if (httpMeta) {
    const capRows = Object.values(httpMeta).filter((m) => m && m.maxBillableQty != null).length;
    navDebug(
      "bill-po-meta-fetch",
      `via=http parents=${poNames.length} caps=${capRows}`,
    );
    return httpMeta;
  }
  await ensureErpFormBridge();
  const raw = await bridgeCall("fetchPoLineMeta", poDetails, prDetails, poNames, "billEnrich");
  /** @type {Record<string, object>} */
  const poItemsByName = {};
  for (const row of (raw && raw.poItems) || []) {
    if (row && row.name) poItemsByName[String(row.name)] = row;
  }
  /** @type {Record<string, object>} */
  const poHeadersByName = {};
  for (const row of (raw && raw.poHeaders) || []) {
    if (row && row.name) poHeadersByName[String(row.name)] = row;
  }
  /** @type {Record<string, object>} */
  const prItemsByName = {};
  for (const row of (raw && raw.prItems) || []) {
    if (row && row.name) prItemsByName[String(row.name)] = row;
  }
  const meta = indexPoLineMeta(doc, poItemsByName, poHeadersByName, prItemsByName);
  const capRows = Object.values(meta).filter((m) => m && m.maxBillableQty != null).length;
  navDebug(
    "bill-po-meta-fetch",
    raw && raw.ok !== false
      ? `via=bridge poItems=${((raw && raw.poItems) || []).length} caps=${capRows}`
      : `via=bridge fail ${(raw && raw.reason) || "unknown"}`,
  );
  return meta;
}

/**
 * Merge linked PO metadata into shell scratch + cache PO line meta for the table.
 * @param {object|null|undefined} doc
 */
async function enrichBillLineContext(doc) {
  const poLineMeta = await fetchBillPoLineMeta(doc);
  const key = currentBillDocKey();
  billPoLineMetaByDoc[key] = poLineMeta;
  const lineAllocations = hydrateBillLineAllocations(doc, getBillLineAllocations(), poLineMeta);
  billLineAllocationsByDoc[key] = lineAllocations;
  return { poLineMeta, lineAllocations };
}

/** Per-slice enrich attempt ceiling — background retry continues while UI shows Still loading…. */
const BILL_ENRICH_TIMEOUT_MS = 8000;
/** PO line meta fetch — get_list only; no form ajax quiet wait. */
const BILL_LINE_CONTEXT_TIMEOUT_MS = 15000;
const BILL_LINE_CONTEXT_SETTLE_MS = 500;
/** Wait for ERP ajax to drain before merge-from-source enrich (not lineContext). */
const BILL_ENRICH_QUIET_MS = 6000;
const BILL_ENRICH_RETRY_GAP_MS = 450;
/** ~2 min under chaos; then stop API churn and log bill-enrich-stop. */
const BILL_ENRICH_MAX_ROUNDS = 15;

/** @type {{ token: number, docName: string, running: boolean }} */
let billEnrichBg = { token: 0, docName: "", running: false };

function cancelBillEnrichBackground(reason) {
  billEnrichBg.token += 1;
  if (billEnrichBg.running) {
    navDebug("bill-enrich-stop", reason || "cancelled");
  }
  billEnrichBg.running = false;
  billEnrichBg.docName = "";
}

/** @type {{ promise: Promise<object>|null, docName: string }} */
let billSnapshotEnrichInflight = { promise: null, docName: "" };

/**
 * linkedPos + PO line meta after a form snapshot. Never block Doc paint forever.
 * @param {object|null|undefined} doc
 */
async function enrichBillSnapshotExtras(doc) {
  const docName = doc && doc.name != null ? String(doc.name) : "";
  if (
    billSnapshotEnrichInflight.promise &&
    billSnapshotEnrichInflight.docName === docName
  ) {
    return billSnapshotEnrichInflight.promise;
  }
  billSnapshotEnrichInflight.docName = docName;
  billSnapshotEnrichInflight.promise = enrichBillSnapshotExtrasInner(doc).finally(() => {
    if (billSnapshotEnrichInflight.docName === docName) {
      billSnapshotEnrichInflight.promise = null;
    }
  });
  return billSnapshotEnrichInflight.promise;
}

/**
 * @param {object|null|undefined} doc
 */
async function enrichBillSnapshotExtrasInner(doc) {
  /** @type {Array<{ name: string, title: string }>} */
  let linkedPos = [];
  /** @type {Array<{ name: string, lrNo: string }>} */
  let linkedReceipts = [];
  /** @type {Record<string, object>} */
  let poLineMeta = {};
  /** @type {Record<string|number, object>} */
  let lineAllocations = {};
  /** @type {import("../src/bill-enrich-pending.js").BillEnrichPending} */
  let enrichPending = defaultEnrichPendingForDoc(doc);

  if (enrichPending.lineContext) {
    await ensureErpFormBridge();
    await sleep(BILL_LINE_CONTEXT_SETTLE_MS);
    const enrichRaw = await raceTimeout(
      enrichBillLineContext(doc),
      BILL_LINE_CONTEXT_TIMEOUT_MS,
      "Bill source line enrich",
    );
    if (enrichRaw && enrichRaw.timedOut) {
      navDebug("bill-enrich-timeout", "source line enrich");
    } else if (enrichRaw && typeof enrichRaw === "object") {
      poLineMeta = enrichRaw.poLineMeta || {};
      lineAllocations = enrichRaw.lineAllocations || {};
      enrichPending.lineContext = false;
    }
  } else {
    poLineMeta = getBillPoLineMeta();
    lineAllocations = getBillLineAllocations();
  }

  if (enrichPending.linkedPos) {
    const linkedRaw = await raceTimeout(
      linkedPosForBillDoc(doc),
      BILL_ENRICH_TIMEOUT_MS,
      "linked PO titles",
    );
    if (linkedRaw && linkedRaw.timedOut) {
      navDebug("bill-enrich-timeout", "linked PO titles");
    } else if (Array.isArray(linkedRaw)) {
      linkedPos = linkedRaw;
      enrichPending.linkedPos = false;
    }
  }

  if (enrichPending.linkedReceipts) {
    const linkedPrRaw = await raceTimeout(
      linkedReceiptsForBillDoc(doc),
      BILL_ENRICH_TIMEOUT_MS,
      "linked Item Receipt refs",
    );
    if (linkedPrRaw && linkedPrRaw.timedOut) {
      navDebug("bill-enrich-timeout", "linked Item Receipt refs");
    } else if (Array.isArray(linkedPrRaw)) {
      linkedReceipts = linkedPrRaw;
      enrichPending.linkedReceipts = false;
    }
  }

  const extras = { linkedPos, linkedReceipts, poLineMeta, lineAllocations, enrichPending };
  if (billEnrichStillPending(enrichPending) && Number(doc?.docstatus || 0) < 1) {
    scheduleBillEnrichBackground(doc, extras);
  }
  return extras;
}

/**
 * Retry timed-out enrich slices until complete or Bill doc changes (Doc shows Still loading…).
 * @param {object|null|undefined} doc
 * @param {Awaited<ReturnType<typeof enrichBillSnapshotExtras>>} [seed]
 */
function scheduleBillEnrichBackground(doc, seed = {}) {
  const docName = doc && doc.name != null ? String(doc.name) : "";
  if (!docName) return;
  if (Number(doc?.docstatus) >= 1) {
    navDebug("bill-enrich-stop", "submitted_before_schedule");
    return;
  }
  if (billEnrichBg.running && billEnrichBg.docName === docName) return;
  if (billEnrichBg.running && billEnrichBg.docName !== docName) {
    cancelBillEnrichBackground(`superseded by ${docName}`);
  }
  billEnrichBg.token += 1;
  const token = billEnrichBg.token;
  billEnrichBg.docName = docName;
  billEnrichBg.running = true;
  navDebug("bill-enrich-start", formatEnrichPendingLog(seed.enrichPending, 0));

  void (async () => {
    let linkedPos = Array.isArray(seed.linkedPos) ? seed.linkedPos : [];
    let linkedReceipts = Array.isArray(seed.linkedReceipts) ? seed.linkedReceipts : [];
    let poLineMeta =
      seed.poLineMeta && typeof seed.poLineMeta === "object" ? seed.poLineMeta : {};
    let lineAllocations =
      seed.lineAllocations && typeof seed.lineAllocations === "object"
        ? seed.lineAllocations
        : {};
    let enrichPending = {
      ...(seed.enrichPending && typeof seed.enrichPending === "object"
        ? seed.enrichPending
        : defaultEnrichPendingForDoc(doc)),
    };
    let round = 0;
    let lastPushKey = "";

    try {
      while (token === billEnrichBg.token && billEnrichBg.docName === docName) {
        round += 1;
        const liveDoc = dirtyState.doc;
        if (!liveDoc || String(liveDoc.name) !== docName) {
          navDebug("bill-enrich-stop", `doc_changed round=${round}`);
          break;
        }
        if (Number(liveDoc.docstatus) >= 1) {
          navDebug("bill-enrich-stop", `submitted round=${round}`);
          break;
        }

        if (enrichPending.lineContext) {
          await ensureErpFormBridge();
          await sleep(round === 1 ? BILL_LINE_CONTEXT_SETTLE_MS : 300);
          const enrichRaw = await raceTimeout(
            enrichBillLineContext(liveDoc),
            BILL_LINE_CONTEXT_TIMEOUT_MS,
            "Bill source line enrich",
          );
          if (enrichRaw && enrichRaw.timedOut) {
            navDebug("bill-enrich-slice", `lineContext timeout round=${round}`);
          } else if (enrichRaw && typeof enrichRaw === "object") {
            poLineMeta = enrichRaw.poLineMeta || {};
            lineAllocations = enrichRaw.lineAllocations || {};
            enrichPending.lineContext = false;
            navDebug("bill-enrich-slice", `lineContext ok round=${round}`);
          }
        }

        if (enrichPending.linkedPos) {
          const linkedRaw = await raceTimeout(
            linkedPosForBillDoc(liveDoc),
            BILL_ENRICH_TIMEOUT_MS,
            "linked PO titles",
          );
          if (linkedRaw && linkedRaw.timedOut) {
            navDebug("bill-enrich-slice", `linkedPos timeout round=${round}`);
          } else if (Array.isArray(linkedRaw)) {
            linkedPos = linkedRaw;
            enrichPending.linkedPos = false;
            navDebug("bill-enrich-slice", `linkedPos ok rows=${linkedRaw.length} round=${round}`);
          }
        }

        if (enrichPending.linkedReceipts) {
          const linkedPrRaw = await raceTimeout(
            linkedReceiptsForBillDoc(liveDoc),
            BILL_ENRICH_TIMEOUT_MS,
            "linked Item Receipt refs",
          );
          if (linkedPrRaw && linkedPrRaw.timedOut) {
            navDebug("bill-enrich-slice", `linkedReceipts timeout round=${round}`);
          } else if (Array.isArray(linkedPrRaw)) {
            linkedReceipts = linkedPrRaw;
            enrichPending.linkedReceipts = false;
            navDebug(
              "bill-enrich-slice",
              `linkedReceipts ok rows=${linkedPrRaw.length} round=${round}`,
            );
          }
        }

        const pushKey = JSON.stringify({ linkedPos, linkedReceipts, enrichPending });
        if (
          pushKey !== lastPushKey &&
          surfaceMode === "doc" &&
          activeDocSkin === "bill"
        ) {
          lastPushKey = pushKey;
          pushBillSnapshot({
            ok: true,
            doc: liveDoc,
            amountDue: amountDueScratch,
            linkedPos,
            linkedReceipts,
            poLineMeta,
            lineAllocations,
            enrichPending,
            userEdited: !!dirtyState.userEdited,
            enrichProgress: true,
          });
        }

        if (!billEnrichStillPending(enrichPending)) {
          navDebug("bill-enrich-stop", `complete round=${round}`);
          break;
        }
        if (round >= BILL_ENRICH_MAX_ROUNDS) {
          navDebug(
            "bill-enrich-stop",
            `max_rounds=${BILL_ENRICH_MAX_ROUNDS} ${formatEnrichPendingLog(enrichPending, round)}`,
          );
          break;
        }
        navDebug("bill-enrich-round", formatEnrichPendingLog(enrichPending, round));
        await sleep(BILL_ENRICH_RETRY_GAP_MS);
      }
    } finally {
      if (token === billEnrichBg.token) {
        billEnrichBg.running = false;
      }
    }
  })();
}

/**
 * @param {number} rowIndex
 * @param {import("../src/bill-line-allocation.js").LineAllocation} alloc
 */
function setBillLineAllocation(rowIndex, alloc) {
  const key = currentBillDocKey();
  if (!billLineAllocationsByDoc[key]) billLineAllocationsByDoc[key] = {};
  billLineAllocationsByDoc[key][rowIndex] = normalizeLineAllocation(alloc);
}

/**
 * Open a Doc skin for a registry profile (shell-dispatch — add skins in DOC_SKIN_PROFILES only).
 * @param {import("../src/doc-skin-registry.js").DocSkinProfile} profile
 * @param {string} route
 * @param {{ forceLoad?: boolean, skipDirtyGate?: boolean }} [opts]
 * @returns {boolean}
 */
function openDocSkinProfile(profile, route, opts = {}) {
  if (!profile) return false;
  if (profile.shell === "doc-form") {
    showDocForm(/** @type {DocFormSkinId} */ (profile.id), route, opts);
    return true;
  }
  return false;
}

/**
 * Open a form route on preferred lens (Home / Recent / Drafts / hijack).
 * @param {string} route
 * @param {{ forceLoad?: boolean, skipDirtyGate?: boolean }} [opts]
 */
function openRoutePreferred(route, opts = {}) {
  const n = normalizeAppRoute(typeof route === "string" && route ? route : "/desk", ERP_BASE);
  const r = n.path || "/desk";
  resumeParkedDoc(r).then((ok) => {
    if (ok) {
      navDebug("openRoutePreferred", `park-resume → ${r}`);
      return;
    }
    const info = routeInfo(r, ERP_BASE);
    const lens = preferredLens(info.doctype, lensPrefs);
    const profile = info.doctype ? profileByDoctypeKey(info.doctype) : null;
    const wantDoc =
      !!profile &&
      shouldOpenDocLens(info.doctype, info.record, lensPrefs, { hasDocSkin: true });
    navDebug(
      "openRoutePreferred",
      `lens=${lens} wantDoc=${wantDoc} same=${routesReferToSameDoc(currentRoute, r, ERP_BASE)} → ${r}`,
    );
    if (wantDoc && openDocSkinProfile(profile, info.path || r, opts)) {
      return;
    }
    showErp(r, {
      forceLoad: opts.forceLoad !== false,
      skipDirtyGate: opts.skipDirtyGate,
    });
  });
}

/**
 * Recent / Drafts / hist flyout click (OI-112 / OI-113 / OI-118).
 * Masters soft-peek when ERP is warm; Doc-skin doctypes follow prefs (resume park first).
 * @param {string} route
 */
function openHistoryRoute(route) {
  const r = typeof route === "string" && route ? route : "/desk";
  const classified = classifyHistoryOpen(r, ERP_BASE);
  const path = classified.path || r;
  const lens = preferredLens(classified.doctype, lensPrefs);
  const same = routesReferToSameDoc(currentRoute, path, ERP_BASE);
  navDebug(
    "openHistoryRoute",
    `${classified.mode} lens=${lens || "-"} same=${same} → ${path}`,
  );
  if (classified.mode === "vanilla-always") {
    if (isSoftPeekRoute(path, ERP_BASE) && (erpIsWarm() || surfaceMode === "doc")) {
      // Same-route child clicks stay soft so we do not hard-load and collapse the tree.
      softPeekErp(path);
      return;
    }
    // Query reports and cold ERP from Home always forceLoad (isSoftPeekRoute false for reports).
    showErp(path, { forceLoad: true });
    return;
  }
  resumeParkedDoc(path).then((ok) => {
    if (ok) return;
    const wantDoc = shouldOpenDocLens(classified.doctype, classified.record, lensPrefs, {
      hasDocSkin: true,
    });
    // Warm Vanilla: in-SPA hop back to the Bill, not loadURL (unsaved Account traps hard nav).
    if (
      !wantDoc &&
      erpIsWarm() &&
      surfaceMode === "erp" &&
      !isQueryReportRoute(path, ERP_BASE)
    ) {
      const abandon =
        isActivePeekStack(peekStack) &&
        routesReferToSameDoc(peekStack.parent.route, path, ERP_BASE);
      navDebug("openHistoryRoute", `inSpa abandon=${abandon ? 1 : 0} → ${path}`);
      showErp(path, {
        inSpa: true,
        skipDirtyGate: true,
        forceLoad: false,
        abandonUnsaved: abandon,
      });
      return;
    }
    openRoutePreferred(path, { forceLoad: true });
  });
}

/** @returns {boolean} */
function erpIsWarm() {
  if (!erp || erp.webContents.isDestroyed()) return false;
  const cur = erp.webContents.getURL();
  return !!(cur && isAllowedErpUrl(ERP_BASE, cur) && !/\/login\b/i.test(cur));
}

function parkDocSurfaceIfNeeded() {
  if (surfaceMode === "doc" && activeDocSkin) {
    parkedDocSurface = {
      mode: "doc",
      skinId: activeDocSkin,
      route: currentRoute || "",
    };
    navDebug("doc-park", `${parkedDocSurface.skinId} ${parkedDocSurface.route}`);
    return;
  }
  // Recent flyout IPC can log surfaceMode=home while currentRoute is still the Bill (OI-112 strike 2).
  const info = routeInfo(currentRoute || "", ERP_BASE);
  if (info.doctype === "purchase-invoice" && dirtyState.doc) {
    parkedDocSurface = { mode: "doc", skinId: "bill", route: currentRoute || "" };
    navDebug("doc-park", `bill (route-hold) ${parkedDocSurface.route}`);
  }
}

/**
 * When Doc chrome claims a /app route but ERP SPA is elsewhere, resync before bridge reads cur_frm.
 * @param {string} appPath
 * @returns {Promise<{ ok: boolean, synced?: boolean, reason?: string }>}
 */
async function ensureErpMatchesShellRoute(appPath) {
  if (!erp || erp.webContents.isDestroyed() || !erpIsWarm()) {
    return { ok: false, reason: "ERP view not warm" };
  }
  const path = normalizeAppRoute(appPath, ERP_BASE).path || appPath;
  const live = erp.webContents.getURL() || "";
  if (!erpLivePathDiffers(path, live, ERP_BASE)) {
    return { ok: true, synced: false };
  }
  navDebug("erp-resync", `${currentErpPathname()} → ${path}`);
  const soft = await erpSoftSetRoute(path, { abandonUnsaved: true });
  if (soft && soft.ok) {
    trackNav(erpUrl(ERP_BASE, path));
    return { ok: true, synced: true };
  }
  await erpForceReopenRoute(path);
  return { ok: true, synced: true };
}

/**
 * Soft-peek a setup/master route: keep Doc dirtyState, set_route when possible (OI-112).
 * @param {string} route
 */
async function softPeekErp(route) {
  const path = normalizeAppRoute(route, ERP_BASE).path || route;
  navDebug("soft-peek", path);
  try {
    if (surfaceMode === "doc") await snapshotDocForm();
    else if (routeInfo(currentRoute || "", ERP_BASE).doctype === "purchase-invoice") {
      await snapshotBill();
    }
  } catch {
    /* park whatever dirtyState we already have */
  }
  parkDocSurfaceIfNeeded();
  notePeekParentAndChild(path);
  showErp(path, { softPeek: true, skipDirtyGate: true, forceLoad: false });
  armSoftPeekEscHook(true).catch(() => {});
  sendHistory();
}

/**
 * Esc / chrome hint → leave setup peek (OI-112 / OI-137).
 * Child peeks return to peek parent first (Payment Entry ← Mode of Payment).
 * Parked Doc rebinds only when the peek parent *is* that Doc (Bill ← Tax).
 */
function dismissSoftPeekFromEsc() {
  if (surfaceMode !== "erp") return;
  const here = currentErpPathname() || currentRoute || "";
  const decision = resolveSoftPeekEscAction({
    parked: parkedDocSurface,
    peekStack,
    currentRoute: here,
    erpBase: ERP_BASE,
  });
  if (decision.action === "return-parent") {
    navDebug("soft-peek-esc", decision.route || "parent");
    returnToPeekParent();
    return;
  }
  if (decision.action === "resume-park" && decision.route) {
    navDebug("soft-peek-esc", decision.route);
    resumeParkedDoc(decision.route).then((ok) => {
      if (ok) {
        collapsePeekStackHard("esc-resume");
        armSoftPeekEscHook(false).catch(() => {});
      }
    });
    return;
  }
  if (decision.action === "disarm") {
    navDebug("soft-peek-esc", "disarm");
    collapsePeekStackHard("esc-disarm");
    armSoftPeekEscHook(false).catch(() => {});
    sendUiState();
    sendHistory();
  }
}

/**
 * In-SPA return to the peek parent (Vanilla Bill still in locals). Drops the child's unsaved trap.
 * @returns {boolean} true if a peek parent return was attempted
 */
function returnToPeekParent() {
  if (!isActivePeekStack(peekStack) || surfaceMode !== "erp") return false;
  const route = peekStack.parent.route;
  navDebug("peek-return", route);
  erpSoftSetRoute(route, { abandonUnsaved: true }).then((r) => {
    if (r && r.ok) {
      trackNav(erpUrl(ERP_BASE, route));
      armSoftPeekEscHook(false).catch(() => {});
      sendUiState();
      sendHistory();
      return;
    }
    navDebug("peek-return-fail", (r && r.reason) || "set_route failed");
    showErp(route, { inSpa: true, skipDirtyGate: true, abandonUnsaved: true, forceLoad: false });
  });
  return true;
}

/**
 * Inject Esc capture on Desk only while soft-peek is armed (skip Frappe modals).
 * @param {boolean} armed
 */
async function armSoftPeekEscHook(armed) {
  if (!erp || erp.webContents.isDestroyed()) return;
  try {
    // The gate itself is the pure, unit-tested predicate — serialized in rather than
    // hand-copied, so tests/history-nav.test.js covers the rule that actually ships.
    await erp.webContents.executeJavaScript(`(function(){
      window.__erpUiSoftPeekArmed = ${armed ? "true" : "false"};
      if (window.__erpUiSoftPeekEscBound) return true;
      window.__erpUiSoftPeekEscBound = true;
      var shouldEscDismissSoftPeek = ${shouldEscDismissSoftPeek.toString()};
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        var frappeDialogOpen = false;
        try {
          frappeDialogOpen = !!(
            (window.cur_dialog && cur_dialog.display) ||
            document.querySelector(".modal.show, .modal.in")
          );
        } catch (err) { frappeDialogOpen = false; }
        if (!shouldEscDismissSoftPeek({
          softPeekArmed: !!window.__erpUiSoftPeekArmed,
          frappeDialogOpen: frappeDialogOpen,
        })) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          if (window.erpUiShell && typeof window.erpUiShell.softPeekEsc === "function") {
            window.erpUiShell.softPeekEsc();
          }
        } catch (err2) {}
      }, true);
      return true;
    })()`);
  } catch {
    /* ignore */
  }
}

/**
 * Resume parked Doc Bill/PO/IR after soft-peek without destroying dirtyState (OI-112).
 * Soft-routes ERP back under Doc so bridge Save still hits the right cur_frm.
 * @param {string} route
 * @returns {Promise<boolean>}
 */
async function resumeParkedDoc(route) {
  if (!parkedDocSurface || !dirtyState.doc) return false;
  if (!routesReferToSameDoc(parkedDocSurface.route, route, ERP_BASE)) return false;
  const park = parkedDocSurface;
  parkedDocSurface = null;
  navDebug("doc-rebind", `${park.mode} ${park.route}`);
  currentRoute = park.route;
  armSoftPeekEscHook(false).catch(() => {});
  if (erpIsWarm() && (park.route || "").startsWith("/app/")) {
    const soft = await erpSoftSetRoute(park.route);
    if (!soft || !soft.ok) {
      navDebug("doc-rebind-erp", (soft && soft.reason) || "set_route failed");
      await erpForceReopenRoute(park.route);
    }
  }
  if (park.mode === "doc" && park.skinId) {
    const profile = DOC_SKIN_PROFILES[park.skinId];
    surfaceMode = "doc";
    activeDocSkin = park.skinId;
    place();
    try {
      if (docForm && !docForm.webContents.isDestroyed()) docForm.webContents.focus();
      if (win && !win.isDestroyed()) win.focus();
    } catch {
      /* ignore */
    }
    if (profile) {
      bumpFormHistoryFromDoc(currentRoute, profile.doctypeKey, dirtyState.doc);
    }
    if (park.skinId === "bill") {
      pushDocFormSnapshot({
        ok: true,
        doc: dirtyState.doc,
        amountDue: amountDueScratch,
        userEdited: !!dirtyState.userEdited,
        isNew: !!dirtyState.isNew,
        focusVendor: false,
        softPeekReturn: true,
      });
    } else {
      pushDocFormSnapshot({
        ok: true,
        doc: dirtyState.doc,
        scratch: { dateExpected: dateExpectedScratch },
        userEdited: !!dirtyState.userEdited,
        isNew: !!dirtyState.isNew,
        focusVendor: false,
      });
    }
    sendUiState();
    sendHistory();
    syncE2eApi();
    return true;
  }
  return false;
}

/**
 * In-SPA Desk navigation (Vanilla soft-leave). Falls back to loadURL when frappe missing.
 * @param {string} appPath
 * @param {{ abandonUnsaved?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function erpSoftSetRoute(appPath, opts = {}) {
  if (!erp || erp.webContents.isDestroyed()) {
    return { ok: false, reason: "no-erp" };
  }
  const parts = appRouteParts(appPath, ERP_BASE);
  if (!parts.length) return { ok: false, reason: "no-parts" };
  const abandonUnsaved = !!opts.abandonUnsaved;
  try {
    const result = await erp.webContents.executeJavaScript(
      `(async () => {
        try {
          if (typeof frappe === "undefined" || !frappe.set_route) {
            return { ok: false, reason: "no-frappe" };
          }
          ${
            abandonUnsaved
              ? `try {
            if (typeof cur_frm !== "undefined" && cur_frm && cur_frm.doc) {
              cur_frm.doc.__unsaved = 0;
            }
          } catch (e) {}`
              : ""
          }
          const parts = ${JSON.stringify(parts)};
          await frappe.set_route(...parts);
          return { ok: true };
        } catch (e) {
          return { ok: false, reason: String((e && e.message) || e) };
        }
      })()`,
    );
    return result && typeof result === "object" ? result : { ok: false, reason: "bad-result" };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

function maybeRefreshCompanyAbbr() {
  if (!erpIsWarm()) return;
  erp.webContents
    .executeJavaScript(
      `(function () {
        try {
          if (typeof frappe === "undefined") return "";
          const name =
            (frappe.defaults && frappe.defaults.get_user_default && frappe.defaults.get_user_default("Company")) ||
            "";
          if (!name) return "";
          const row = locals && locals["Company"] && locals["Company"][name];
          if (row && row.abbr) return String(row.abbr);
          return "";
        } catch (e) {
          return "";
        }
      })()`,
    )
    .then((abbr) => {
      const next = abbr != null ? String(abbr).trim() : "";
      if (!next || next === sessionCompanyAbbr) return;
      sessionCompanyAbbr = next;
      history = filterHistoryForCompany(history, sessionCompanyAbbr, ERP_BASE);
      sendHistory();
      navDebug("company-abbr", sessionCompanyAbbr);
    })
    .catch(() => {});
}

/**
 * Mark an intentional ERP destination so stale prior-form navigations are ignored.
 * @param {string} path
 */
function beginErpNavIntent(path) {
  const decision = resolveErpNavIntent(path, ERP_BASE);
  if (decision.action !== "arm") {
    // /desk, /, /login cannot be guarded by doctype — clear, never leave the old
    // intent armed (it would reject this arrival and accept the page we just left).
    clearErpNavIntent("unguardable destination");
    return;
  }
  const p = decision.path;
  erpNavIntentPath = p;
  if (erpNavIntentTimer) clearTimeout(erpNavIntentTimer);
  erpNavIntentTimer = setTimeout(() => {
    if (erpNavIntentPath === p) {
      navDebug("nav-intent-timeout", p);
      erpNavIntentPath = null;
    }
    erpNavIntentTimer = null;
  }, 15000);
  navDebug("nav-intent", p);
}

function clearErpNavIntent(reason) {
  if (!erpNavIntentPath) return;
  navDebug("nav-intent-clear", `${reason || "clear"} ← ${erpNavIntentPath}`);
  erpNavIntentPath = null;
  if (erpNavIntentTimer) {
    clearTimeout(erpNavIntentTimer);
    erpNavIntentTimer = null;
  }
}

/**
 * Vanilla Desk in-page nav → Doc when prefs say doc (Wes: yes).
 * @param {string} url
 * @returns {boolean} true if hijacked
 */
function maybeHijackErpToDoc(url) {
  if (isActivePeekStack(peekStack)) {
    navDebug("hijack-skip-peek", url);
    return false;
  }
  if (lensHijackLock || surfaceMode !== "erp") return false;
  if (typeof url !== "string" || !isAllowedErpUrl(ERP_BASE, url)) return false;
  if (erpNavIntentPath && shouldBlockDocHijackForListIntent(erpNavIntentPath, url, ERP_BASE)) {
    navDebug("hijack-skip-list-intent", url);
    return false;
  }
  // Never hijack to a doctype that isn't the active nav intent (stale Bill after Home→PO).
  if (erpNavIntentPath && !shouldAcceptErpTrackNav(erpNavIntentPath, url, ERP_BASE)) {
    navDebug("hijack-skip-stale", url);
    return false;
  }
  const info = routeInfo(url, ERP_BASE);
  const profile = info.doctype ? profileByDoctypeKey(info.doctype) : null;
  if (
    !profile ||
    !shouldOpenDocLens(info.doctype, info.record, lensPrefs, { hasDocSkin: true })
  ) {
    return false;
  }
  lensHijackLock = true;
  try {
    if (!openDocSkinProfile(profile, info.path || url, { skipDirtyGate: true })) {
      return false;
    }
  } finally {
    // Release on next tick so showBill's erp loadURL navigations don't re-enter.
    setImmediate(() => {
      lensHijackLock = false;
    });
  }
  return true;
}

/**
 * @param {string} url
 * @param {{ fromBrowser?: boolean }} [opts] fromBrowser false = optimistic shell trackNav
 */
function trackNav(url, opts = {}) {
  if (typeof url !== "string" || !isAllowedErpUrl(ERP_BASE, url)) return;
  if (erpNavIntentPath && !shouldAcceptErpTrackNav(erpNavIntentPath, url, ERP_BASE)) {
    navDebug("trackNav-stale", `${url} (intent ${erpNavIntentPath})`);
    return;
  }
  const n = normalizeAppRoute(url, ERP_BASE);
  const prev = currentRoute;
  const next = n.path || currentRoute;
  const changed = next !== currentRoute;
  currentRoute = next;
  history = pushHistory(history, url, {
    erpBase: ERP_BASE,
    labels: DOCTYPE_LABELS,
    companyAbbr: sessionCompanyAbbr,
  });
  notePeekFromErpNav(next, prev);
  sendHistory();
  maybeRefreshCompanyAbbr();
  if (shouldClearErpNavIntent(erpNavIntentPath, url, opts, ERP_BASE)) {
    clearErpNavIntent("arrived");
  }
  // Hijack after Recent update so Vanilla→Doc nav still moves the flyout.
  if (maybeHijackErpToDoc(url)) {
    syncE2eApi();
    return;
  }
  if (surfaceMode === "erp" && changed) sendUiState();
  syncE2eApi();
}

function pollErpRoute() {
  if (!erp || erp.webContents.isDestroyed()) return;
  // URL sync for chrome/history when on Vanilla — not a DB poll.
  if (surfaceMode === "erp") {
    const url = erp.webContents.getURL();
    if (url && isAllowedErpUrl(ERP_BASE, url)) {
      if (url !== lastPolledErpUrl || erpLivePathDiffers(currentRoute, url, ERP_BASE)) {
        lastPolledErpUrl = url;
        trackNav(url);
      }
    }
  }
  // Submit often keeps the same form URL — still drain shelf updates.
  drainErpSaveIntoShelved().catch(() => {});
}

/** Electron session.fetch — attaches ERP login cookies without manual Cookie headers. */
function erpSessionFetchImpl() {
  if (!erp || erp.webContents.isDestroyed()) return null;
  const session = erp.webContents.session;
  if (!session || typeof session.fetch !== "function") return null;
  return (url, init) => session.fetch(url, init);
}

async function erpEval(js, chaosChannel = "erpEval") {
  if (!erp || erp.webContents.isDestroyed()) {
    return { ok: false, reason: "ERP view not ready" };
  }
  const chaosMs = await maybeChaosLag(chaosChannel);
  if (chaosMs > 0) navDebug("chaos-lag", `channel=${chaosChannel} ms=${chaosMs}`);
  try {
    return await erp.webContents.executeJavaScript(js);
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} what
 * @returns {Promise<T|{ ok: false, timedOut: true, reason: string }>}
 */
async function raceTimeout(promise, ms, what) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(timeoutFailure(what)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait until Vanilla URL is the Purchase Invoice list (Find), not a form. */
async function waitForPurchaseInvoiceList(timeoutMs = BILL_FIND_TIMEOUT_MS) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    if (!erp || erp.webContents.isDestroyed()) {
      return { ok: false, reason: "ERP view not ready" };
    }
    last = erp.webContents.getURL() || "";
    if (/\/login/i.test(last)) {
      return { ok: false, reason: "Please log in on Vanilla skin, then try Find Bill again." };
    }
    if (isPurchaseInvoiceListRoute(last, ERP_BASE)) {
      return classifyFindBillResult(last, ERP_BASE);
    }
    await sleep(150);
  }
  return classifyFindBillResult(last, ERP_BASE);
}

/** Wait until Vanilla URL is the list for this doctype (no record). */
async function waitForDocListRoute(doctypeKey, timeoutMs = BILL_FIND_TIMEOUT_MS) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    if (!erp || erp.webContents.isDestroyed()) {
      return { ok: false, reason: "ERP view not ready" };
    }
    last = erp.webContents.getURL() || "";
    if (/\/login/i.test(last)) {
      return { ok: false, reason: "Please log in on Vanilla skin, then try Find again." };
    }
    if (isDocListRoute(doctypeKey, last, ERP_BASE)) {
      return { ok: true };
    }
    await sleep(150);
  }
  return {
    ok: false,
    reason: `Timed out waiting for ${doctypeKey} list.`,
  };
}

/**
 * Re-assert ERP WebContents keyboard focus after Find (Bill/doc chrome IPC can steal it).
 * # ponytail: short ticks + in-page focus keeper; drop if Electron WC focus improves.
 */
function scheduleErpKeyboardFocus() {
  for (const ms of [0, 50, 200, 500]) {
    setTimeout(() => {
      try {
        if (surfaceMode !== "erp") return;
        if (!erp || erp.webContents.isDestroyed()) return;
        blurNonErpWebContents();
        erp.webContents.focus();
        if (win && !win.isDestroyed()) win.focus();
      } catch {
        /* ignore */
      }
    }, ms);
  }
}

/** Blur shell surfaces so OS keyboard focus can settle on ERP (Vanilla). */
function blurNonErpWebContents() {
  // Include chrome + history: otherwise Tab stays trapped in the left toolbar
  // after opening Vanilla (clerk data entry is almost always in the ERP view).
  for (const view of [bill, docForm, home, chrome, hist]) {
    try {
      if (!view || view.webContents.isDestroyed()) continue;
      if (view.webContents.isFocused && view.webContents.isFocused()) {
        view.webContents.blur();
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Close Getting Started / Buying panel *before* focusing filters, then settle.
 * Same-tick dismiss + focus was racing the filter to document BODY (~500ms).
 */
async function dismissOnboardingAndSettle() {
  if (!erp || erp.webContents.isDestroyed()) return;
  try {
    await erp.webContents.executeJavaScript(`(function(){
      var panel = document.querySelector(".onb-panel");
      if (!panel) return false;
      try {
        var closeBtn = document.querySelector(".onb-panel .onb-header-actions button:last-child")
          || document.querySelector(".onb-panel .onb-header-actions button");
        if (closeBtn) closeBtn.click();
      } catch (e0) {}
      return true;
    })()`);
  } catch {
    /* ignore */
  }
  await sleep(400);
}

/**
 * Brief in-page re-focus if list refresh / onboarding teardown blurs the filter to BODY.
 * @param {string} fieldname
 * @param {number} [ms=2200]
 */
async function installFindFocusKeeper(fieldname, ms = 2200) {
  if (!erp || erp.webContents.isDestroyed()) return;
  try {
    await erp.webContents.executeJavaScript(`(function(){
      var field = ${JSON.stringify(fieldname)};
      var until = Date.now() + ${Number(ms) || 2200};
      window.__docFindFocusKeep = { field: field, until: until };
      if (window.__docFindFocusKeepTimer) clearInterval(window.__docFindFocusKeepTimer);
      window.__docFindFocusKeepTimer = setInterval(function(){
        var keep = window.__docFindFocusKeep;
        if (!keep || Date.now() > keep.until) {
          clearInterval(window.__docFindFocusKeepTimer);
          window.__docFindFocusKeepTimer = null;
          return;
        }
        var el = document.querySelector('.standard-filter-section [data-fieldname="' + keep.field + '"] input')
          || document.querySelector('[data-fieldname="' + keep.field + '"] input');
        if (!el || document.activeElement === el) return;
        try { el.focus({ preventScroll: true }); } catch (e1) { try { el.focus(); } catch (e2) {} }
        try { if (typeof el.select === "function") el.select(); } catch (e3) {}
      }, 120);
      return true;
    })()`);
  } catch {
    /* ignore */
  }
}

/**
 * Wait until Vanilla list standard-filter input exists (URL settle is not enough).
 * @param {string} fieldname
 * @param {number} [timeoutMs]
 */
async function waitForListFilterField(fieldname, timeoutMs = BILL_FIND_TIMEOUT_MS) {
  if (!fieldname || !erp || erp.webContents.isDestroyed()) {
    return { ok: false, reason: "ERP view not ready" };
  }
  const start = Date.now();
  let last = { ok: false, reason: "filter not ready" };
  while (Date.now() - start < timeoutMs) {
    if (!erp || erp.webContents.isDestroyed()) {
      return { ok: false, reason: "ERP view not ready" };
    }
    try {
      last = await erp.webContents.executeJavaScript(`(function(){
        var field = ${JSON.stringify(fieldname)};
        try {
          if (!window.cur_list || !cur_list.page) {
            return { ok: false, reason: "cur_list not ready", hasField: false };
          }
          try {
            var pf = cur_list.page.page_form;
            if (pf && pf.length && pf.hasClass("hide")) pf.removeClass("hide");
          } catch (eHide) {}
          var dict = cur_list.page.fields_dict || {};
          var df = dict[field];
          var hasInput = false;
          if (df) {
            if (df.$wrapper && df.$wrapper.find) {
              hasInput = df.$wrapper.find("input:not([type=hidden]), textarea").length > 0;
            }
            if (!hasInput && df.$input && df.$input.length) hasInput = true;
            if (!hasInput && df.input) hasInput = true;
          }
          var dom = document.querySelector('.standard-filter-section [data-fieldname="' + field + '"] input')
            || document.querySelector('[data-fieldname="' + field + '"] input');
          if (hasInput || dom) {
            return { ok: true, hasField: true, field: field };
          }
          return {
            ok: false,
            reason: "filter input not ready",
            hasField: !!df,
            field: field,
          };
        } catch (e) {
          return { ok: false, reason: String(e && e.message ? e.message : e) };
        }
      })()`);
    } catch (e) {
      last = { ok: false, reason: String(e && e.message ? e.message : e) };
    }
    if (last && last.ok) return last;
    await sleep(150);
  }
  return last && typeof last === "object"
    ? { ...last, ok: false, reason: (last.reason || "filter not ready") + " (timeout)" }
    : { ok: false, reason: "filter not ready (timeout)" };
}

/**
 * Inject event-driven Doc↔Vanilla bridge (idempotent). Template for Bill / PO / IR.
 */
async function ensureErpFormBridge() {
  if (!erp || erp.webContents.isDestroyed()) return false;
  const ver = await erpEval(
    `(function(){ try { return window.__docFormBridge && window.__docFormBridge.version || 0; } catch(e) { return 0; } })()`,
  );
  if (typeof ver === "number" && ver >= DOC_FORM_BRIDGE_VERSION) return true;
  await erp.webContents.executeJavaScript(ERP_BRIDGE_PAGE_JS);
  const ver2 = await erpEval(
    `(function(){ try { return window.__docFormBridge && window.__docFormBridge.version || 0; } catch(e) { return 0; } })()`,
  );
  return typeof ver2 === "number" && ver2 >= DOC_FORM_BRIDGE_VERSION;
}

/**
 * Inject simplified-skin payload into the ERP WebContents (idempotent).
 * No-ops when the current route/lens is not "simplified".
 */
/**
 * Remove an injected Simplified skin. Leaving the lens must not depend on the page
 * reloading — when that reload was skipped or raced, the toolbar said Vanilla while
 * the ⚙ Assumptions button and dimmed fields stayed on screen (nav incidents
 * 2026-09-03 / 2026-09-04).
 */
async function removeSimplifiedSkin() {
  if (!simplifiedSkinInstalled) return;
  simplifiedSkinInstalled = false;
  if (!erp || erp.webContents.isDestroyed()) return;
  try {
    await erp.webContents.executeJavaScript(buildSimplifiedTeardown());
    navDebug("simplified-skin", "removed");
  } catch (e) {
    navDebug("simplified-skin-err", `remove: ${String(e && e.message ? e.message : e)}`);
  }
}

async function ensureSimplifiedSkin() {
  if (!erp || erp.webContents.isDestroyed()) return;
  if (surfaceMode !== "erp") return;
  const info = routeInfo(currentRoute, ERP_BASE);
  const wantSimplified = !!(
    info.doctype &&
    info.record &&
    preferredLens(info.doctype, lensPrefs) === "simplified"
  );
  if (!wantSimplified) {
    // Every ERP nav / load is also a repair point for a skin that outlived its lens.
    await removeSimplifiedSkin();
    return;
  }
  try {
    const payload = buildSimplifiedPayload();
    await erp.webContents.executeJavaScript(payload);
    simplifiedSkinInstalled = true;
  } catch (e) {
    navDebug("simplified-skin-err", String(e && e.message ? e.message : e));
  }
}

async function bridgeCall(method, ...args) {
  const chaosChannel =
    args.length > 0 && typeof args[args.length - 1] === "string" && args[args.length - 1] === "billEnrich"
      ? args.pop()
      : "bridge";
  await ensureErpFormBridge();
  const chaosMs = await maybeChaosLag(chaosChannel);
  if (chaosMs > 0) navDebug("chaos-lag", `channel=${chaosChannel} ms=${chaosMs}`);
  const payload = JSON.stringify(args);
  return erpEval(
    `(async function(){
      try {
        if (!window.__docFormBridge || typeof window.__docFormBridge[${JSON.stringify(method)}] !== "function") {
          return { ok: false, reason: "Doc form bridge missing — reload Vanilla." };
        }
        return await window.__docFormBridge[${JSON.stringify(method)}].apply(null, ${payload});
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })()`,
    chaosChannel,
  );
}

/** Let Vanilla finish party/merge ajax before enrich get_list (reduces chaos false timeouts). */
async function waitForErpAjaxQuiet(maxWaitMs = BILL_ENRICH_QUIET_MS) {
  await bridgeCall("afterAjaxQuiet", maxWaitMs);
}

/**
 * Load PO.`title` (logbook PO#, OI-121) for Purchase Orders linked on Bill lines.
 * @param {object|null|undefined} doc
 * @returns {Promise<Array<{ name: string, title: string }>>}
 */
async function linkedPosForBillDoc(doc) {
  const names = uniqueLinkedPurchaseOrderNames(doc);
  if (!names.length) return [];
  const fetchImpl = erpSessionFetchImpl();
  if (fetchImpl) {
    const httpRes = await frappeResourceGetList({
      erpBase: ERP_BASE,
      doctype: "Purchase Order",
      fields: ["name", "title"],
      filters: [["name", "in", names]],
      limit: names.length,
      fetchImpl,
    });
    if (httpRes.ok) {
      navDebug("bill-linked-pos-fetch", `via=http rows=${httpRes.rows.length}`);
      return linkedPurchaseOrdersForBill(doc, httpRes.rows);
    }
    navDebug(
      "bill-linked-pos-fetch",
      `via=http fail status=${httpRes.status || "?"} ${httpRes.reason || ""}`.trim(),
    );
  }
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, rows: [] };
      }
      var names = ${JSON.stringify(names)};
      var rows = await frappe.db.get_list("Purchase Order", {
        filters: [["name", "in", names]],
        fields: ["name", "title"],
        limit: names.length,
      });
      return { ok: true, rows: rows || [] };
    } catch (e) {
      return { ok: false, rows: [], reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  return linkedPurchaseOrdersForBill(doc, (raw && raw.rows) || []);
}

/**
 * Load Item Receipt `lr_no` (packing list / BOL ref) for receipts linked on Bill lines.
 * @param {object|null|undefined} doc
 * @returns {Promise<Array<{ name: string, lrNo: string }>>}
 */
async function linkedReceiptsForBillDoc(doc) {
  const names = uniqueLinkedPurchaseReceiptNames(doc);
  if (!names.length) return [];
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, rows: [] };
      }
      var names = ${JSON.stringify(names)};
      var rows = await frappe.db.get_list("Purchase Receipt", {
        filters: [["name", "in", names]],
        fields: ["name", "lr_no"],
        limit: names.length,
      });
      return { ok: true, rows: rows || [] };
    } catch (e) {
      return { ok: false, rows: [], reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  return linkedPurchaseReceiptsForBill(doc, (raw && raw.rows) || []);
}

/**
 * Vendor account #s at supplier (Customer Number At Supplier) — payment identity, not SO customer.
 * @param {string} supplier
 * @param {string} [company]
 * @returns {Promise<string[]>}
 */
async function vendorAccountNumbersForSupplier(supplier, company) {
  const sup = supplier != null ? String(supplier).trim() : "";
  if (!sup) return [];
  const co = company != null ? String(company).trim() : "";
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, rows: [] };
      }
      var filters = [["parent", "=", ${JSON.stringify(sup)}]];
      var rows = await frappe.db.get_list("Customer Number At Supplier", {
        filters: filters,
        fields: ["customer_number", "company"],
        limit: 20,
      });
      return { ok: true, rows: rows || [] };
    } catch (e) {
      return { ok: false, rows: [], reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  const nums = [];
  const seen = new Set();
  for (const row of (raw && raw.rows) || []) {
    const n = row && row.customer_number != null ? String(row.customer_number).trim() : "";
    if (!n || seen.has(n)) continue;
    seen.add(n);
    nums.push(n);
  }
  return nums;
}

/**
 * Other Purchase Invoices with the same bill_no (soft dupe lookup).
 * @param {string} billNo
 * @param {string} [excludeName]
 * @returns {Promise<Array<object>>}
 */
async function existingBillsWithRef(billNo, excludeName) {
  const ref = billNo != null ? String(billNo).trim() : "";
  if (!ref) return [];
  const exclude = excludeName != null ? String(excludeName).trim() : "";
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, rows: [] };
      }
      var filters = [["bill_no", "=", ${JSON.stringify(ref)}]];
      if (${JSON.stringify(exclude)}) {
        filters.push(["name", "!=", ${JSON.stringify(exclude)}]);
      }
      var rows = await frappe.db.get_list("Purchase Invoice", {
        filters: filters,
        fields: ["name", "bill_no", "supplier", "posting_date", "grand_total", "docstatus"],
        order_by: "posting_date desc",
        limit: 12,
      });
      return { ok: true, rows: rows || [] };
    } catch (e) {
      return { ok: false, rows: [], reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  return (raw && raw.rows) || [];
}

/**
 * Last N supplier invoice #s for this vendor (OI-087 pattern window).
 * @param {string} supplier
 * @param {string} [excludeName]
 * @param {number} [limit]
 * @returns {Promise<string[]>}
 */
async function recentVendorBillRefs(supplier, excludeName, limit = 6) {
  const sup = supplier != null ? String(supplier).trim() : "";
  if (!sup) return [];
  const exclude = excludeName != null ? String(excludeName).trim() : "";
  const lim = Math.max(3, Math.min(12, Number(limit) || 6));
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, rows: [] };
      }
      var filters = [
        ["supplier", "=", ${JSON.stringify(sup)}],
        ["bill_no", "!=", ""],
      ];
      if (${JSON.stringify(exclude)}) {
        filters.push(["name", "!=", ${JSON.stringify(exclude)}]);
      }
      var rows = await frappe.db.get_list("Purchase Invoice", {
        filters: filters,
        fields: ["name", "bill_no", "posting_date"],
        order_by: "posting_date desc",
        limit: ${lim},
      });
      return { ok: true, rows: rows || [] };
    } catch (e) {
      return { ok: false, rows: [], reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  const out = [];
  const seen = new Set();
  for (const row of (raw && raw.rows) || []) {
    const n = row && row.bill_no != null ? String(row.bill_no).trim() : "";
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Session cache: supplier → last-N bill_no refs (prefetch on vendor pick). */
/** @type {Map<string, { refs: string[], at: number }>} */
const vendorRecentRefsCache = new Map();

/** Hint only (soft dupe nudge, not the hard existingBillsWithRef check) — short TTL is fine. */
const VENDOR_REFS_CACHE_TTL_MS = 60_000;

/**
 * @param {string} supplier
 * @returns {string[]|null}
 */
function cachedRecentVendorRefs(supplier) {
  const hit = vendorRecentRefsCache.get(supplier);
  if (!hit || !Array.isArray(hit.refs)) return null;
  if (Date.now() - hit.at > VENDOR_REFS_CACHE_TTL_MS) {
    vendorRecentRefsCache.delete(supplier);
    return null;
  }
  return hit.refs;
}

/** Drop a supplier's cached refs so the next check/prefetch re-fetches fresh. */
function invalidateVendorRecentRefsCache(supplier) {
  const sup = supplier != null ? String(supplier).trim() : "";
  if (sup) vendorRecentRefsCache.delete(sup);
}

/**
 * @param {string} supplier
 * @param {string} excludeName
 * @returns {Promise<string[]>}
 */
async function resolveRecentVendorRefsForCheck(supplier, excludeName) {
  const cached = cachedRecentVendorRefs(supplier);
  if (cached) return cached;
  const refs = await recentVendorBillRefs(supplier, excludeName, 6);
  vendorRecentRefsCache.set(supplier, { refs, at: Date.now() });
  return refs;
}

/**
 * Prefetch last-6 vendor refs (parallel to source modal / setHeader).
 * @param {string} supplier
 */
async function prefetchVendorBillRefs(supplier) {
  const sup = supplier != null ? String(supplier).trim() : "";
  if (!sup) return { ok: false, reason: "no_supplier", refs: [] };
  await ensureErpFormBridge();
  const currentName =
    dirtyState.doc && dirtyState.doc.name != null ? String(dirtyState.doc.name).trim() : "";
  const refs = await recentVendorBillRefs(sup, currentName, 6);
  vendorRecentRefsCache.set(sup, { refs, at: Date.now() });
  return { ok: true, refs };
}

/**
 * Non-blocking Ref No. sanity (OI-054 / OI-087). Never blocks Save.
 * @param {string|null|undefined} [billNoOverride]
 * @param {{ supplierHint?: string|null }} [opts]
 */
async function checkBillRef(billNoOverride, opts = {}) {
  const o = opts && typeof opts === "object" ? opts : {};
  const doc = dirtyState.doc;
  const billNo =
    billNoOverride != null && String(billNoOverride).trim() !== ""
      ? String(billNoOverride).trim()
      : doc && doc.bill_no != null
        ? String(doc.bill_no).trim()
        : "";
  if (!billNo) {
    return { ok: true, result: evaluateBillRef("") };
  }
  const supplier = resolveBillRefSupplier({
    docSupplier: doc && doc.supplier,
    supplierHint: o.supplierHint,
  });
  if (!supplier) {
    return {
      ok: true,
      result: billRefWaitingForVendorResult(),
      waitingForVendor: true,
    };
  }
  const company = doc && doc.company != null ? String(doc.company).trim() : "";
  const currentName = doc && doc.name != null ? String(doc.name).trim() : "";
  const [existingBills, vendorAccountNumbers, linkedPos, recentVendorRefs] =
    await Promise.all([
      existingBillsWithRef(billNo, currentName),
      vendorAccountNumbersForSupplier(supplier, company),
      linkedPosForBillDoc(doc),
      resolveRecentVendorRefsForCheck(supplier, currentName),
    ]);
  const result = evaluateBillRef(billNo, {
    currentBillName: currentName,
    supplier,
    existingBills,
    recentVendorRefs,
    linkedPoTitles: linkedPos.map((r) => r.title).filter(Boolean),
    linkedPoNames: linkedPos.map((r) => r.name).filter(Boolean),
    vendorAccountNumbers,
  });
  return {
    ok: true,
    result,
    existingBills,
    vendorAccountNumbers,
    recentVendorRefs,
    linkedPos,
  };
}

async function snapshotBill() {
  await ensureErpFormBridge();
  const raw = await bridgeCall("snapshot", "Purchase Invoice");
  if (!raw || !raw.ok) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Could not read Bill from Vanilla.",
      doc: null,
      amountDue: amountDueScratch,
      linkedPos: [],
      userEdited: !!dirtyState.userEdited,
      isNew: !!dirtyState.isNew,
    };
  }
  dirtyState = {
    ...dirtyState,
    doc: raw.doc,
    isDirty: !!raw.isDirty,
    isNew: !!raw.isNew,
  };
  const extras = await enrichBillSnapshotExtras(raw.doc);
  return {
    ok: true,
    doc: raw.doc,
    amountDue: amountDueScratch,
    ...extras,
    isDirty: raw.isDirty,
    isNew: raw.isNew,
    userEdited: !!dirtyState.userEdited,
  };
}

/** Event-driven wait (form hooks + after_ajax); no 400ms poll loop. */
async function waitForPurchaseInvoice(timeoutMs = 25000) {
  if (!erp || erp.webContents.isDestroyed()) {
    return { ok: false, reason: "ERP view not ready", doc: null, amountDue: amountDueScratch };
  }
  const url = erp.webContents.getURL() || "";
  if (/\/login/i.test(url)) {
    return {
      ok: false,
      reason: "Please log in on Vanilla skin, then click Enter Bills again (or Retry on this page).",
      doc: null,
      amountDue: amountDueScratch,
    };
  }
  await ensureErpFormBridge();
  const raw = await bridgeCall("waitForForm", "Purchase Invoice", timeoutMs);
  if (!raw || !raw.ok) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Timed out waiting for Purchase Invoice.",
      doc: null,
      amountDue: amountDueScratch,
    };
  }
  dirtyState = {
    ...dirtyState,
    doc: raw.doc,
    isDirty: !!raw.isDirty,
    isNew: !!raw.isNew,
  };
  const extras = await enrichBillSnapshotExtras(raw.doc);
  return {
    ok: true,
    doc: raw.doc,
    amountDue: amountDueScratch,
    ...extras,
    isDirty: raw.isDirty,
    isNew: raw.isNew,
  };
}

/** @type {{ finish: () => void } | null} */
let erpLoadWaiter = null;

function loadErpUrl(url) {
  return new Promise((resolve) => {
    if (!erp || erp.webContents.isDestroyed()) {
      resolve(false);
      return;
    }
    if (erpLoadWaiter) {
      erp.webContents.removeListener("did-finish-load", erpLoadWaiter.finish);
      erpLoadWaiter.finish();
      erpLoadWaiter = null;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (erpLoadWaiter && erpLoadWaiter.finish === finish) erpLoadWaiter = null;
      erp.webContents.removeListener("did-finish-load", finish);
      resolve(true);
    };
    erpLoadWaiter = { finish };
    erp.webContents.once("did-finish-load", finish);
    erp.webContents.loadURL(url);
    setTimeout(finish, 10000);
  });
}

function bumpBillHistory(routePath, opts = {}) {
  history = pushHistory(history, routePath, {
    erpBase: ERP_BASE,
    labels: DOCTYPE_LABELS,
    detail: opts.detail,
    detailMuted: !!opts.detailMuted,
    labelOverride: opts.labelOverride,
    companyAbbr: sessionCompanyAbbr,
  });
  sendHistory();
}

function isNameOnShelvedDrafts(doctypeKey, name) {
  const key = normalizeDoctypeKey(doctypeKey);
  const n = name != null ? String(name).trim() : "";
  if (!key || !n) return false;
  return shelvedDrafts.some((e) => e.doctypeKey === key && e.name === n);
}

/**
 * Recent form row: primary label stays "Bill" (etc.).
 * Viewed-only draft → muted identity suffix. Shelved draft → label only (Drafts has identity).
 * @param {string} routePath
 * @param {string} doctypeKey
 * @param {object|null|undefined} doc
 */
function bumpFormHistoryFromDoc(routePath, doctypeKey, doc) {
  const name = doc && doc.name != null ? String(doc.name).trim() : "";
  const isDraft = !!(doc && Number(doc.docstatus) === 0 && name && !/^new/i.test(name));
  const onShelf = !!(isDraft && isNameOnShelvedDrafts(doctypeKey, name));
  const draftable = draftableDoctypeKeys().includes(normalizeDoctypeKey(doctypeKey));

  let detail = "";
  let detailMuted = false;
  if (isDraft && draftable) {
    const recent = recentDraftDetailForHistory({
      isDraft: true,
      onShelf,
      shelfLabel: draftShelfLabel(doctypeKey, doc),
      fallbackName: name,
    });
    detail = recent.detail;
    detailMuted = recent.detailMuted;
  } else if (name && !/^new/i.test(name)) {
    detail = name;
  }
  history = pushHistory(history, routePath, {
    erpBase: ERP_BASE,
    labels: DOCTYPE_LABELS,
    detail,
    detailMuted,
    copyRef: copyRefForDoc(doctypeKey, doc),
    companyAbbr: sessionCompanyAbbr,
  });
  sendHistory();
}

function place() {
  if (!win || !chrome || !home || !erp || !hist || !bill || !docForm || !payOutstanding || !paymentDoc) return;
  const b = win.getContentBounds();
  const H = TAB_BAR_HEIGHT;
  const HW = historyRailWidth(histCollapsed);
  const main = {
    x: HW,
    y: H,
    width: Math.max(100, b.width - HW),
    height: Math.max(100, b.height - H),
  };
  chrome.setBounds({ x: 0, y: 0, width: b.width, height: H });
  hist.setBounds({ x: 0, y: H, width: HW, height: Math.max(100, b.height - H) });
  home.setBounds(surfaceMode === "home" ? main : OFF);
  bill.setBounds(OFF);
  docForm.setBounds(surfaceMode === "doc" ? main : OFF);
  erp.setBounds(surfaceMode === "erp" ? main : OFF);
  payOutstanding.setBounds(surfaceMode === "pay-outstanding" ? main : OFF);
  paymentDoc.setBounds(surfaceMode === "payment-doc" ? main : OFF);
}

/** @type {BrowserWindow|null} */
let diagnoseWin = null;
/** @type {import("electron").BrowserWindow|null} */
let calcHistoryWin = null;
/** @type {import("electron").BrowserWindow|null} */
let submittedWin = null;
/** @type {import("electron").BrowserWindow|null} */
let navIncidentWin = null;
/** @type {import("electron").BrowserWindow|null} */
let focusIncidentWin = null;

/**
 * Click-away for frameless popovers.
 * Child windows with `parent:` often keep focus (or skip blur) on the first
 * click into a parent WebContentsView — especially Linux/WSL. Dismiss when any
 * shell surface gains focus, not only on popover blur.
 *
 * @param {import("electron").BrowserWindow} popover
 * @param {() => void} closeFn
 */
function bindTransientPopoverDismiss(popover, closeFn) {
  const openedAt = Date.now();
  /** @type {Array<[Electron.WebContents, () => void]>} */
  const wcPairs = [];
  let closing = false;

  const shouldIgnore = () => Date.now() - openedAt < 250;

  const dismiss = () => {
    if (closing) return;
    if (!popover || popover.isDestroyed()) return;
    if (shouldIgnore()) return;
    closing = true;
    closeFn();
  };

  // Internal blur (rare): only if focus truly left the popover.
  const onBlur = () => {
    setTimeout(() => {
      if (closing || !popover || popover.isDestroyed()) return;
      if (shouldIgnore()) return;
      if (popover.isFocused()) return;
      dismiss();
    }, 40);
  };

  // Click into Bill / hist / chrome / etc. — always dismiss (do not trust isFocused).
  const onShellFocus = () => {
    setTimeout(() => {
      if (closing || !popover || popover.isDestroyed()) return;
      if (shouldIgnore()) return;
      dismiss();
    }, 0);
  };

  popover.on("blur", onBlur);
  if (win && !win.isDestroyed()) {
    win.on("focus", onShellFocus);
  }

  for (const view of [chrome, hist, home, bill, docForm, erp]) {
    if (!view || !view.webContents || view.webContents.isDestroyed()) continue;
    const fn = () => onShellFocus();
    view.webContents.on("focus", fn);
    wcPairs.push([view.webContents, fn]);
  }

  const cleanup = () => {
    try {
      popover.removeListener("blur", onBlur);
    } catch {
      /* ignore */
    }
    if (win && !win.isDestroyed()) {
      try {
        win.removeListener("focus", onShellFocus);
      } catch {
        /* ignore */
      }
    }
    for (const [wc, fn] of wcPairs) {
      try {
        if (!wc.isDestroyed()) wc.removeListener("focus", fn);
      } catch {
        /* ignore */
      }
    }
  };

  popover.on("closed", cleanup);
}

function closeDiagnoseDropdown() {
  if (diagnoseWin && !diagnoseWin.isDestroyed()) {
    try {
      diagnoseWin.close();
    } catch {
      /* ignore */
    }
  }
  diagnoseWin = null;
  sendUiState();
}

function closeNavIncidentDialog() {
  if (navIncidentWin && !navIncidentWin.isDestroyed()) {
    try {
      navIncidentWin.close();
    } catch {
      /* ignore */
    }
  }
}

function navIncidentPayload() {
  return {
    contextLines: formatNavIncidentContextLines(navIncidentDraft || {}),
    logPath: app.isReady() ? navIncidentLogPath() : "",
    noteMax: NAV_INCIDENT_NOTE_MAX,
  };
}

function openNavIncidentDialog() {
  if (!win || win.isDestroyed()) return;
  closeDiagnoseDropdown();
  if (navIncidentWin && !navIncidentWin.isDestroyed()) {
    navIncidentWin.focus();
    return;
  }
  navIncidentDraft = collectNavIncidentContext();
  navDebug("nav-incident-open", currentRoute || "");
  navIncidentWin = new BrowserWindow({
    parent: win,
    modal: false,
    frame: true,
    title: "Navigation issue",
    show: false,
    width: 460,
    height: 560,
    minWidth: 380,
    minHeight: 420,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    backgroundColor: "#1a252f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "nav-incident-preload.cjs"),
    },
  });
  navIncidentWin.loadFile(path.join(__dirname, "nav-incident-dialog.html"));
  navIncidentWin.once("ready-to-show", () => {
    if (!navIncidentWin || navIncidentWin.isDestroyed()) return;
    navIncidentWin.webContents.send("nav-incident-data", navIncidentPayload());
    navIncidentWin.show();
    navIncidentWin.focus();
  });
  navIncidentWin.on("closed", () => {
    if (navIncidentDraft) navDebug("nav-incident-cancel", currentRoute || "");
    navIncidentDraft = null;
    navIncidentWin = null;
  });
}

function closeFocusIncidentDialog() {
  if (focusIncidentWin && !focusIncidentWin.isDestroyed()) {
    try {
      focusIncidentWin.close();
    } catch {
      /* ignore */
    }
  }
}

function focusIncidentPayload() {
  return {
    contextLines: formatFocusIncidentContextLines(focusIncidentDraft || {}),
    logPath: app.isReady() ? focusIncidentLogPath() : "",
    noteMax: FOCUS_INCIDENT_NOTE_MAX,
  };
}

function openFocusIncidentDialog() {
  if (!win || win.isDestroyed()) return;
  closeDiagnoseDropdown();
  if (focusIncidentWin && !focusIncidentWin.isDestroyed()) {
    focusIncidentWin.focus();
    return;
  }
  focusIncidentDraft = collectFocusIncidentContext();
  focusDebug("focus-incident-open", currentRoute || "", { surface: "main" });
  focusIncidentWin = new BrowserWindow({
    parent: win,
    modal: false,
    frame: true,
    title: "Focus issue",
    show: false,
    width: 480,
    height: 580,
    minWidth: 380,
    minHeight: 440,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    backgroundColor: "#1a252f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "focus-incident-preload.cjs"),
    },
  });
  focusIncidentWin.loadFile(path.join(__dirname, "focus-incident-dialog.html"));
  focusIncidentWin.once("ready-to-show", () => {
    if (!focusIncidentWin || focusIncidentWin.isDestroyed()) return;
    focusIncidentWin.webContents.send("focus-incident-data", focusIncidentPayload());
    focusIncidentWin.show();
    focusIncidentWin.focus();
  });
  focusIncidentWin.on("closed", () => {
    if (focusIncidentDraft) focusDebug("focus-incident-cancel", currentRoute || "", { surface: "main" });
    focusIncidentDraft = null;
    focusIncidentWin = null;
  });
}

function closeCalcHistoryDropdown() {
  if (calcHistoryWin && !calcHistoryWin.isDestroyed()) {
    try {
      calcHistoryWin.close();
    } catch {
      /* ignore */
    }
  }
  calcHistoryWin = null;
}

function calcHistoryPayload() {
  calcHistory = pruneCalcHistory(calcHistory);
  return { calcHistory: calcHistory.map((e) => ({ ...e })) };
}

function pushCalcHistoryDropdown() {
  if (calcHistoryWin && !calcHistoryWin.isDestroyed()) {
    calcHistoryWin.webContents.send("calc-history-data", calcHistoryPayload());
  }
}

/**
 * Frameless panel to the right of the left rail (diagnose-style).
 * @param {{ x?: number, y?: number, width?: number, height?: number }} [anchor] button rect in hist view coords
 */
function openCalcHistoryDropdown(anchor = {}) {
  if (!win || win.isDestroyed()) return;
  if (calcHistoryWin && !calcHistoryWin.isDestroyed()) {
    pushCalcHistoryDropdown();
    calcHistoryWin.focus();
    return;
  }

  const panelW = 340;
  const panelH = 460;
  calcHistoryWin = new BrowserWindow({
    parent: win,
    modal: false,
    frame: false,
    show: false,
    width: panelW,
    height: panelH,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    backgroundColor: "#1a252f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "calc-history-preload.cjs"),
    },
  });

  const cb = win.getContentBounds();
  const histBounds =
    hist && !hist.webContents.isDestroyed()
      ? hist.getBounds()
      : { x: 0, y: TAB_BAR_HEIGHT, width: historyRailWidth(histCollapsed), height: 400 };
  const ax = Number(anchor.x);
  const ay = Number(anchor.y);
  let x = Math.round(cb.x + histBounds.x + (Number.isFinite(ax) ? ax : histBounds.width) + 4);
  let y = Math.round(cb.y + histBounds.y + (Number.isFinite(ay) ? ay : 8));
  if (x + panelW > cb.x + cb.width - 8) x = Math.round(cb.x + cb.width - panelW - 8);
  if (y + panelH > cb.y + cb.height - 8) y = Math.round(cb.y + cb.height - panelH - 8);
  if (x < cb.x + 8) x = cb.x + 8;
  if (y < cb.y + 8) y = cb.y + 8;
  calcHistoryWin.setPosition(Math.max(0, x), Math.max(0, y));

  calcHistoryWin.loadFile(path.join(__dirname, "calc-history-dropdown.html"));
  calcHistoryWin.once("ready-to-show", () => {
    if (!calcHistoryWin || calcHistoryWin.isDestroyed()) return;
    calcHistoryWin.webContents.send("calc-history-data", calcHistoryPayload());
    calcHistoryWin.show();
    calcHistoryWin.focus();
  });
  bindTransientPopoverDismiss(calcHistoryWin, closeCalcHistoryDropdown);
  calcHistoryWin.on("closed", () => {
    calcHistoryWin = null;
  });
}

function closeSubmittedDropdown() {
  if (submittedWin && !submittedWin.isDestroyed()) {
    try {
      submittedWin.close();
    } catch {
      /* ignore */
    }
  }
  submittedWin = null;
}

function submittedPayload() {
  return { submitted: submittedDocs.map((e) => ({ ...e })) };
}

function pushSubmittedDropdown() {
  if (submittedWin && !submittedWin.isDestroyed()) {
    submittedWin.webContents.send("submitted-data", submittedPayload());
  }
}

/**
 * Chronological panel for the single "Submitted" flyout row (calc-history sibling).
 * @param {{ x?: number, y?: number, width?: number, height?: number }} [anchor] button rect in hist view coords
 */
function openSubmittedDropdown(anchor = {}) {
  if (!win || win.isDestroyed()) return;
  if (submittedWin && !submittedWin.isDestroyed()) {
    pushSubmittedDropdown();
    submittedWin.focus();
    return;
  }

  const panelW = 340;
  const panelH = 420;
  submittedWin = new BrowserWindow({
    parent: win,
    modal: false,
    frame: false,
    show: false,
    width: panelW,
    height: panelH,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    backgroundColor: "#1a252f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "submitted-preload.cjs"),
    },
  });

  const cb = win.getContentBounds();
  const histBounds =
    hist && !hist.webContents.isDestroyed()
      ? hist.getBounds()
      : { x: 0, y: TAB_BAR_HEIGHT, width: historyRailWidth(histCollapsed), height: 400 };
  const ax = Number(anchor.x);
  const ay = Number(anchor.y);
  let x = Math.round(cb.x + histBounds.x + (Number.isFinite(ax) ? ax : histBounds.width) + 4);
  let y = Math.round(cb.y + histBounds.y + (Number.isFinite(ay) ? ay : 8));
  if (x + panelW > cb.x + cb.width - 8) x = Math.round(cb.x + cb.width - panelW - 8);
  if (y + panelH > cb.y + cb.height - 8) y = Math.round(cb.y + cb.height - panelH - 8);
  if (x < cb.x + 8) x = cb.x + 8;
  if (y < cb.y + 8) y = cb.y + 8;
  submittedWin.setPosition(Math.max(0, x), Math.max(0, y));

  submittedWin.loadFile(path.join(__dirname, "submitted-dropdown.html"));
  submittedWin.once("ready-to-show", () => {
    if (!submittedWin || submittedWin.isDestroyed()) return;
    submittedWin.webContents.send("submitted-data", submittedPayload());
    submittedWin.show();
    submittedWin.focus();
  });
  bindTransientPopoverDismiss(submittedWin, closeSubmittedDropdown);
  submittedWin.on("closed", () => {
    submittedWin = null;
  });
}

function openDiagnoseDropdown() {
  if (!win || win.isDestroyed()) return;
  if (diagnoseWin && !diagnoseWin.isDestroyed()) {
    diagnoseWin.focus();
    return;
  }
  const snap = diagnoseSnapshot();
  diagnoseWin = new BrowserWindow({
    parent: win,
    modal: false,
    frame: false,
    show: false,
    width: 340,
    height: 420,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    backgroundColor: "#1a252f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "diagnose-preload.cjs"),
    },
  });
  const wb = win.getBounds();
  const cb = win.getContentBounds();
  const frameTop = Math.max(0, wb.height - cb.height);
  // Dropdown under the DB light (top-right of content area).
  const x = Math.round(wb.x + wb.width - 360);
  const y = Math.round(wb.y + frameTop + TAB_BAR_HEIGHT - 4);
  diagnoseWin.setPosition(Math.max(0, x), Math.max(0, y));
  diagnoseWin.loadFile(path.join(__dirname, "diagnose-dropdown.html"));
  diagnoseWin.once("ready-to-show", () => {
    if (!diagnoseWin || diagnoseWin.isDestroyed()) return;
    diagnoseWin.webContents.send("diagnose-data", snap);
    diagnoseWin.show();
    diagnoseWin.focus();
    sendUiState();
  });
  bindTransientPopoverDismiss(diagnoseWin, closeDiagnoseDropdown);
  diagnoseWin.on("closed", () => {
    diagnoseWin = null;
    sendUiState();
  });
}

// Single-slot pending navigation gate. The Bill renderer owns the ONE commit-gate UI;
// main just asks it to open and waits for proceed/cancel. Last nav click wins.
let navGateSeq = 0;
let activeNavGate = null; // { token, settle(proceed) }

async function gateDirtyThen(doNav) {
  if (!isDocLensSurface()) {
    if (isPayOutstandingDirtySurface()) {
      await gatePayOutstandingDirtyThen(doNav);
      return;
    }
    navDebug("gate-skip", "not on Doc lens");
    doNav();
    return;
  }
  // Fast path: do not await heavy snapshot when already clean (hang = dead Recents nav).
  if (!dirtyState.userEdited) {
    navDebug("gate-skip", "clean");
    doNav();
    return;
  }
  const live = await snapshotDocForm();
  const state = {
    ...dirtyState,
    doc: live.doc || dirtyState.doc,
    isDirty: !!(live.isDirty || dirtyState.userEdited),
    isNew: live.ok ? !!live.isNew : !!dirtyState.isNew,
    // Doc Bill edits always set userEdited; ERP is_dirty alone is not enough.
    userEdited: !!dirtyState.userEdited,
  };
  if (!shouldGateNavigation(state)) {
    navDebug("gate-skip", "clean-after-snap");
    doNav();
    return;
  }

  navDebug("gate-open", "unsaved Doc edits — Save/Discard/Cancel in Bill");

  const view = activeFormView();
  const openChannel = "doc-open-nav-gate";
  const cancelChannel = "doc-cancel-nav-gate";
  const leaving =
    activeDocSkin === "bill"
      ? "leaving this Bill"
      : activeDocSkin === "po"
        ? "leaving this Purchase Order"
        : "leaving this Item Receipt";

  // SSoT: drive the SAME in-page commit-gate the toolbar uses. Native dialog is only
  // a fallback for when the Doc renderer is gone (destroyed / crashed).
  if (!view || view.webContents.isDestroyed()) {
    await nativeGateFallback(doNav);
    return;
  }

  // Supersede any earlier pending nav gate (last click wins) — no leaks, no double gates.
  if (activeNavGate) {
    const prev = activeNavGate;
    activeNavGate = null;
    try {
      view.webContents.send(cancelChannel, prev.token);
    } catch {
      /* renderer gone; nothing to cancel */
    }
    prev.settle(false);
  }

  const token = `nav-${++navGateSeq}`;
  await new Promise((resolve) => {
    let settled = false;
    const finish = (proceed) => {
      if (settled) return;
      settled = true;
      if (activeNavGate && activeNavGate.token === token) activeNavGate = null;
      if (proceed) {
        navDebug("gate-proceed", "continuing nav");
        dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
        amountDueCommitted = amountDueScratch;
        doNav();
      } else {
        navDebug("gate-cancel", "stayed on Doc");
      }
      resolve();
    };
    activeNavGate = { token, settle: finish };
    try {
      view.webContents.send(openChannel, { token, label: leaving });
    } catch {
      activeNavGate = null;
      settled = true;
      resolve();
      nativeGateFallback(doNav);
    }
  });
}

// Fallback dirty prompt when the in-page gate can't be reached (renderer destroyed).
async function nativeGateFallback(doNav) {
  let response = 2;
  try {
    const r = await dialog.showMessageBox(win, {
      type: "question",
      noLink: true,
      defaultId: 0,
      cancelId: 2,
      buttons: ["Save and continue", "Discard and continue", "Stay"],
      title: "Unsaved changes",
      message: "This Bill has unsaved changes.",
      detail: "Save, discard, or stay on the Doc Bill view.",
    });
    response = r.response;
  } catch {
    return;
  }
  if (response === 2) return;
  if (response === 0) {
    const saved =
      activeDocSkin === "bill" ? await saveBillFromErp() : await saveDocFormFromErp();
    if (!saved.ok) {
      await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["OK"],
        title: "Couldn't save",
        message: saved.reason || "Save failed.",
      });
      return;
    }
  }
  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  amountDueCommitted = amountDueScratch;
  doNav();
}

/**
 * Packet 4b step 3 — the pay-outstanding check-preview drawer's own leave gate. No in-page
 * commit-gate exists for this surface yet (that's Doc's own machinery, driven by an actual
 * Save action the drawer doesn't have until step 4's write path), so this is a plain native
 * prompt: discard the unsaved preview, or stay. Not a save option -- there is nothing to save.
 */
async function gatePayOutstandingDirtyThen(doNav) {
  navDebug("gate-open", "unsaved check preview — Discard/Stay in Pay Outstanding");
  let response = 1;
  try {
    const r = await dialog.showMessageBox(win, {
      type: "question",
      noLink: true,
      defaultId: 1,
      cancelId: 1,
      buttons: ["Discard and continue", "Stay"],
      title: "Unsaved check",
      message: "This payment preview has unsaved changes.",
      detail: "Discard the check preview, or stay on Pay Outstanding.",
    });
    response = r.response;
  } catch {
    return;
  }
  if (response !== 0) {
    navDebug("gate-cancel", "stayed on Pay Outstanding");
    return;
  }
  navDebug("gate-proceed", "discarded check preview, continuing nav");
  payOutstandingDirty = false;
  doNav();
}

function showHome() {
  gateDirtyThen(() => {
    collapsePeekStackHard("home");
    parkedDocSurface = null;
    armSoftPeekEscHook(false).catch(() => {});
    surfaceMode = "home";
    place();
    sendUiState();
    sendHistory();
    syncE2eApi();
  });
}

/**
 * OI-161: Home's "Pay Outstanding" tile — in-window surface, not a popup (5zorro 2026-09-05:
 * "stay in window unless I spawn a second all-purpose window"). Triggered directly by the tile,
 * not by intercepting a Vanilla navigation — it doesn't need DOC_SKIN_INDEX/lens-context routing.
 * Reloads the page fresh each time so it always reflects current ERP state.
 */
function showPayOutstanding() {
  gateDirtyThen(() => {
    collapsePeekStackHard("home");
    parkedDocSurface = null;
    armSoftPeekEscHook(false).catch(() => {});
    surfaceMode = "pay-outstanding";
    place();
    // A fresh load always starts clean -- reset here too, not just on the gate's own discard
    // path, so a future caller that reaches this without going through the gate can't leave
    // payOutstandingDirty stuck true against a page that no longer has the drawer open.
    payOutstandingDirty = false;
    if (payOutstanding && !payOutstanding.webContents.isDestroyed()) {
      payOutstanding.webContents.loadFile(path.join(__dirname, "pay-outstanding.html"));
    }
    sendUiState();
    sendHistory();
    syncE2eApi();
  });
}

/**
 * Packet 4b step 5: read-only full-page mount of an existing Payment Entry -- the "you are
 * looking at one payment" side of the isNew route split (pay-outstanding.html is the other,
 * "nothing chosen yet" side). Reloads fresh each time, same reasoning as showPayOutstanding.
 * @param {string} record Payment Entry name
 */
function showPaymentDoc(record) {
  gateDirtyThen(() => {
    collapsePeekStackHard("home");
    parkedDocSurface = null;
    armSoftPeekEscHook(false).catch(() => {});
    surfaceMode = "payment-doc";
    place();
    if (paymentDoc && !paymentDoc.webContents.isDestroyed()) {
      paymentDoc.webContents.loadFile(path.join(__dirname, "payment-doc.html"), {
        query: { name: record || "" },
      });
    }
    sendUiState();
    sendHistory();
    syncE2eApi();
  });
}

/**
 * Home's "Pay Bills"/"Write Checks" (Vendors) vs "Receive Payments" (Customers) tiles all route
 * to the same blank `/app/payment-entry/new` -- the tile clicked is the strongest direction
 * signal payment-direction-prefs.js's resolution order names, so record it here before
 * navigating (Packet 4b step 5, 5zorro 2026-09-05 resolution order).
 * @param {string} direction "Pay" or "Receive"
 */
function openPaymentEntryTile(direction) {
  paymentDirectionPrefs = rememberPaymentDirection(paymentDirectionPrefs, direction === "Receive" ? "Receive" : "Pay");
  savePaymentDirectionPrefs();
  showErp("/app/payment-entry/new", { forceLoad: true });
}

/**
 * Chromium often no-ops loadURL when the target equals the current URL.
 * Soft-set_route first; if that fails, bounce via /app then the target.
 * @param {string} appPath normalized /app/… path
 * @returns {Promise<void>}
 */
async function erpForceReopenRoute(appPath, opts = {}) {
  if (!erp || erp.webContents.isDestroyed()) return;
  const path = normalizeAppRoute(appPath, ERP_BASE).path || appPath;
  const target = erpUrl(ERP_BASE, path);
  const forceLoad = !!opts.forceLoad;
  if (!forceLoad) {
    const soft = await erpSoftSetRoute(path);
    if (soft && soft.ok) {
      navDebug("same-route-set_route", path);
      trackNav(target);
      return;
    }
    navDebug("same-route-bounce", `${(soft && soft.reason) || "no-set_route"} → ${path}`);
  } else {
    navDebug("force-reopen-load", path);
  }
  await loadErpUrl(erpUrl(ERP_BASE, "/app"));
  await loadErpUrl(target);
  trackNav(target);
}

function showErp(route = "/desk", opts = {}) {
  const softPeek = !!opts.softPeek;
  const inSpa = softPeek || !!opts.inSpa;
  const skipDirtyGate = !!opts.skipDirtyGate || inSpa;
  const n = normalizeAppRoute(route, ERP_BASE);
  // Keep exact roots that are not doctype paths.
  let path = n.path || "/desk";
  if (route === "/" || path === "/") path = "/";
  else if (route === "/desk" || route === "/login") path = route;
  else if (path.startsWith("/desk/") || (n.doctype && path.startsWith("/desk"))) {
    path = n.path;
  }

  const go = () => {
    const cur = erp && !erp.webContents.isDestroyed() ? erp.webContents.getURL() : "";
    const alreadyOnErp = !!(cur && isAllowedErpUrl(ERP_BASE, cur));
    // "On the ERP origin" is not "at /desk" — a parked Vanilla list/doc route also
    // satisfies alreadyOnErp. The bare-/desk fast path below must not skip the actual
    // navigation unless the webContents is already sitting at the desk root itself
    // (Frappe settles there as either "/app" or "/desk" depending on version/redirect).
    const curNorm = cur ? normalizeAppRoute(cur, ERP_BASE) : null;
    const alreadyAtDeskRoot = !!(
      alreadyOnErp &&
      curNorm &&
      !curNorm.doctype &&
      (curNorm.path === "/desk" || curNorm.path === "/app")
    );
    const sameRoute =
      routesReferToSameDoc(currentRoute, path, ERP_BASE) ||
      (!!cur && routesReferToSameDoc(cur, path, ERP_BASE));
    navDebug(
      softPeek ? "showErp-soft" : inSpa ? "showErp-inSpa" : "showErp",
      `${path}${sameRoute ? " same=1" : ""}`,
    );
    if (inSpa) {
      parkDocSurfaceIfNeeded();
      if (!softPeek) collapsePeekStackIfLeaving(path, "inSpa");
    } else {
      collapsePeekStackHard("hard-erp");
      parkedDocSurface = null;
      armSoftPeekEscHook(false).catch(() => {});
      sendHistory();
    }
    surfaceMode = "erp";
    const info = routeInfo(path, ERP_BASE);
    // Do not claim the destination until the SPA actually moves (OI-127 desync).
    if (!inSpa) currentRoute = info.path || path;
    if (!inSpa) beginErpNavIntent(info.path || path);
    // Soft-peek / in-SPA return must not flip Bill/PO/IR lens prefs to Vanilla (A.nav).
    // Also must not clobber a "simplified" pref — showErp is used for both vanilla+simplified.
    if (
      !inSpa &&
      info.doctype &&
      DOC_FORM_DOCTYPES.has(info.doctype) &&
      info.record &&
      preferredLens(info.doctype, lensPrefs) !== "simplified"
    ) {
      lensPrefs = rememberLens(lensPrefs, info.doctype, "vanilla");
      savePrefs();
    }
    place();
    const target = erpUrl(ERP_BASE, info.path || path);
    const trySoft =
      inSpa &&
      alreadyOnErp &&
      (info.path || path).startsWith("/app/") &&
      appRouteParts(info.path || path, ERP_BASE).length > 0;

    const afterNav = () => {
      try {
        if (erp && !erp.webContents.isDestroyed()) erp.webContents.focus();
      } catch {
        /* ignore */
      }
      sendUiState();
      syncE2eApi();
      scheduleErpKeyboardFocus();
    };

    if (trySoft) {
      erpSoftSetRoute(info.path || path, { abandonUnsaved: !!opts.abandonUnsaved }).then((r) => {
        if (r && r.ok) {
          trackNav(target, { fromBrowser: false });
          afterNav();
          return;
        }
        navDebug("soft-peek-fallback", (r && r.reason) || "set_route failed");
        void loadErpUrl(target).then(() => {
          trackNav(target, { fromBrowser: false });
          afterNav();
        });
        return;
      });
      return;
    }

    // Hist re-click while already on this Vanilla form: loadURL is a silent no-op.
    if (
      shouldForceVanillaReopen({
        forceLoad: !!opts.forceLoad,
        sameRoute,
        alreadyOnErp,
        softPeek: inSpa,
      }) &&
      (info.path || path).startsWith("/app/")
    ) {
      erpForceReopenRoute(info.path || path, { forceLoad: true }).then(afterNav);
      return;
    }

    if (opts.forceLoad || path !== "/desk" || !alreadyAtDeskRoot) {
      void loadErpUrl(target).then(() => {
        trackNav(target, { fromBrowser: false });
        afterNav();
      });
      return;
    }
    afterNav();
  };
  if (skipDirtyGate) go();
  else gateDirtyThen(go);
}

async function showBill(route, opts = {}) {
  return showDocForm("bill", route, opts);
}

async function snapshotDocForm() {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return {
      ok: false,
      reason: "No Doc form skin active.",
      doc: null,
      scratch: { dateExpected: dateExpectedScratch },
      userEdited: !!dirtyState.userEdited,
      isNew: !!dirtyState.isNew,
    };
  }
  if (profile.id === "bill") {
    return snapshotBill();
  }
  await ensureErpFormBridge();
  const raw = await bridgeCall("snapshot", profile.doctype);
  if (!raw || !raw.ok) {
    return {
      ok: false,
      reason: (raw && raw.reason) || `Could not read ${profile.title} from Vanilla.`,
      doc: null,
      scratch: { dateExpected: dateExpectedScratch },
      userEdited: !!dirtyState.userEdited,
      isNew: !!dirtyState.isNew,
    };
  }
  dirtyState = {
    ...dirtyState,
    doc: raw.doc,
    isDirty: !!raw.isDirty,
    isNew: !!raw.isNew,
  };
  return {
    ok: true,
    doc: raw.doc,
    scratch: { dateExpected: dateExpectedScratch },
    isDirty: raw.isDirty,
    isNew: raw.isNew,
    userEdited: !!dirtyState.userEdited,
  };
}

async function waitForDocForm(timeoutMs = 25000) {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return {
      ok: false,
      reason: "No Doc form skin active.",
      doc: null,
      scratch: { dateExpected: dateExpectedScratch },
    };
  }
  if (profile.id === "bill") {
    return waitForPurchaseInvoice(timeoutMs);
  }
  if (!erp || erp.webContents.isDestroyed()) {
    return {
      ok: false,
      reason: "ERP view not ready",
      doc: null,
      scratch: { dateExpected: dateExpectedScratch },
    };
  }
  const url = erp.webContents.getURL() || "";
  if (/\/login/i.test(url)) {
    return {
      ok: false,
      reason: "Please log in on Vanilla skin, then open this document again (or Retry).",
      doc: null,
      scratch: { dateExpected: dateExpectedScratch },
    };
  }
  await ensureErpFormBridge();
  const raw = await bridgeCall("waitForForm", profile.doctype, timeoutMs);
  if (!raw || !raw.ok) {
    return {
      ok: false,
      reason: (raw && raw.reason) || `Timed out waiting for ${profile.doctype}.`,
      doc: null,
      scratch: { dateExpected: dateExpectedScratch },
    };
  }
  dirtyState = {
    ...dirtyState,
    doc: raw.doc,
    isDirty: !!raw.isDirty,
    isNew: !!raw.isNew,
  };
  return {
    ok: true,
    doc: raw.doc,
    scratch: { dateExpected: dateExpectedScratch },
    isDirty: raw.isDirty,
    isNew: raw.isNew,
  };
}

/**
 * Replace the open ERP form with a blank new doc (home / toolbar New).
 * @param {string} doctype
 */
async function forceFreshNewDocInErp(doctype) {
  const dt = doctype == null ? "" : String(doctype).trim();
  if (!dt) return { ok: false, reason: "No doctype." };
  const raw = await erpEval(`(async () => {
    try {
      var dt = ${JSON.stringify(dt)};
      var f = window.cur_frm;
      if (f && f.doctype === dt && f.is_new && f.is_new()) {
        try { f.doc.__unsaved = 0; } catch (e0) {}
        try { frappe.model.clear_doc(f.doctype, f.doc.name); } catch (e1) {}
      }
      frappe.new_doc(dt);
      await new Promise(function (r) { setTimeout(r, 350); });
      f = window.cur_frm;
      if (!f || !f.doc) return { ok: false, reason: "No form after new_doc." };
      return {
        ok: true,
        doc: JSON.parse(JSON.stringify(f.doc)),
        isNew: true,
        isDirty: false,
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "new_doc failed." };
}

/**
 * @param {DocFormSkinId} skinId
 * @param {string} [route]
 * @param {{ skipDirtyGate?: boolean }} [opts]
 */
async function showDocForm(skinId, route, opts = {}) {
  const profile = DOC_SKIN_PROFILES[skinId];
  if (!profile || profile.shell !== "doc-form") return;
  if (skinId === "bill") {
    const routeStr = typeof route === "string" && route ? route : currentRoute;
    const nextInfo = routeInfo(routeStr, ERP_BASE);
    const curName =
      dirtyState.doc && dirtyState.doc.name != null ? String(dirtyState.doc.name) : "";
    if (
      curName &&
      nextInfo.record &&
      nextInfo.record !== curName &&
      !isNewDocRecord(nextInfo.record)
    ) {
      cancelBillEnrichBackground(`nav ${curName} -> ${nextInfo.record}`);
    }
  }
  const skipDirtyGate = !!opts.skipDirtyGate;
  const slug = profile.doctypeKey;
  const r =
    typeof route === "string" && route
      ? route
      : currentRoute.includes(slug)
        ? currentRoute
        : profile.newRoute;

  if (await resumeParkedDoc(r)) return;

  if (
    surfaceMode === "doc" &&
    activeDocSkin === skinId &&
    routesReferToSameDoc(currentRoute, r, ERP_BASE) &&
    !isGenericNewDocRoute(r, ERP_BASE)
  ) {
    const nextInfo = routeInfo(r, ERP_BASE);
    const staleSubmittedOnNew =
      isNewDocRecord(nextInfo.record) &&
      dirtyState.doc &&
      Number(dirtyState.doc.docstatus) > 0;
    if (!staleSubmittedOnNew) {
      parkedDocSurface = null;
      collapsePeekStackIfLeaving(
        currentRoute,
        skinId === "bill" ? "showBill-refocus" : "showDoc-refocus",
      );
      let billReloadAfterFailed = false;
      if (skinId === "bill" && !dirtyState.doc) {
        const refocus = billRefocusAction({ hasDoc: false, phase: billLoadPhase });
        if (refocus === "skip") {
          navDebug("bill-refocus-skip", "load still in flight (no doc yet)");
          place();
          sendUiState();
          syncE2eApi();
          return;
        }
        navDebug(
          "bill-load-retry",
          billLoadPhase === BILL_LOAD_FAILED
            ? "refocus after failed load — full reload"
            : "refocus with no doc — full reload",
        );
        billReloadAfterFailed = true;
      }
      if (!billReloadAfterFailed) {
      if (skinId === "bill") await ensureErpMatchesShellRoute(currentRoute);
      place();
      try {
        if (docForm && !docForm.webContents.isDestroyed()) docForm.webContents.focus();
        if (win && !win.isDestroyed()) win.focus();
      } catch {
        /* ignore */
      }
      sendUiState();
      if (skinId === "bill") {
        const snap = await snapshotBill();
        if (snap && snap.ok && snap.doc) {
          billLoadPhase = billLoadPhaseAfterSnap(true);
          dirtyState = {
            ...dirtyState,
            doc: snap.doc,
            isDirty: !!snap.isDirty,
            isNew: !!snap.isNew,
          };
          noteShelvedFromOpen("purchase-invoice", snap.doc);
          bumpFormHistoryFromDoc(currentRoute, "purchase-invoice", snap.doc);
          pushDocFormSnapshot({
            ok: true,
            doc: snap.doc,
            amountDue: snap.amountDue != null ? snap.amountDue : amountDueScratch,
            linkedPos: snap.linkedPos || [],
            poLineMeta: snap.poLineMeta || {},
            lineAllocations: snap.lineAllocations || {},
            userEdited: !!dirtyState.userEdited,
            isNew: !!snap.isNew,
            focusVendor: false,
          });
        } else if (dirtyState.doc) {
          noteShelvedFromOpen("purchase-invoice", dirtyState.doc);
          bumpFormHistoryFromDoc(currentRoute, "purchase-invoice", dirtyState.doc);
          pushDocFormSnapshot({
            ok: true,
            doc: dirtyState.doc,
            amountDue: amountDueScratch,
            userEdited: !!dirtyState.userEdited,
            isNew: !!dirtyState.isNew,
            focusVendor: false,
          });
        } else {
          billLoadPhase = billLoadPhaseAfterSnap(false);
          pushDocFormSnapshot({
            ok: false,
            reason: (snap && snap.reason) || "Bill form not loaded in Vanilla — Retry load.",
            doc: null,
            amountDue: amountDueScratch,
            userEdited: false,
          });
        }
      } else if (dirtyState.doc) {
        const earlyProfile = DOC_SKIN_PROFILES[skinId];
        if (earlyProfile) {
          noteShelvedFromOpen(earlyProfile.doctypeKey, dirtyState.doc);
          bumpFormHistoryFromDoc(currentRoute, earlyProfile.doctypeKey, dirtyState.doc);
        }
        pushDocFormSnapshot({
          ok: true,
          doc: dirtyState.doc,
          scratch: { dateExpected: dateExpectedScratch },
          userEdited: !!dirtyState.userEdited,
          isNew: !!dirtyState.isNew,
          focusVendor: false,
        });
      }
      syncE2eApi();
      return;
      }
    }
  }

  const priorSkin = activeDocSkin;
  const billLoadToken = skinId === "bill" ? ++billLoadGen : 0;

  const proceed = async () => {
    parkedDocSurface = null;
    surfaceMode = "doc";
    activeDocSkin = skinId;
    if (priorSkin && docShellKind(priorSkin) !== docShellKind(skinId)) {
      await reloadDocFormShell();
    }
    const n = normalizeAppRoute(r, ERP_BASE);
    let path = n.path || r;
    if (!path.includes(slug)) {
      path = profile.newRoute;
    }
    collapsePeekStackIfLeaving(path, skinId === "bill" ? "showBill" : "showDoc");
    currentRoute = path;
    beginErpNavIntent(path);
    lensPrefs = rememberLens(lensPrefs, slug, "doc");
    savePrefs();
    if (skinId === "bill") {
      bumpBillHistory(currentRoute);
    } else {
      history = pushHistory(history, currentRoute, {
        erpBase: ERP_BASE,
        labels: DOCTYPE_LABELS,
        companyAbbr: sessionCompanyAbbr,
      });
      sendHistory();
    }
    place();
    try {
      if (docForm && !docForm.webContents.isDestroyed()) docForm.webContents.focus();
    } catch {
      /* ignore */
    }
    sendUiState();
    const openingFreshNew = isGenericNewDocRoute(r, ERP_BASE);
    if (openingFreshNew || (skinId === "bill" && isNewDocRecord(routeInfo(currentRoute, ERP_BASE).record))) {
      dirtyState = {
        isDirty: false,
        isNew: true,
        userEdited: false,
        baselineJson: null,
        doc: null,
      };
    }
    if (skinId === "bill") {
      billLoadPhase = BILL_LOAD_LOADING;
    }
    pushDocFormSnapshot({
      ok: false,
      reason:
        skinId === "bill"
          ? "Loading Purchase Invoice in Vanilla…"
          : `Loading ${profile.doctype} in Vanilla…`,
      doc: null,
      scratch: { dateExpected: skinId === "bill" || openingFreshNew ? "" : dateExpectedScratch },
      amountDue: skinId === "bill" ? "" : undefined,
      userEdited: false,
    });

    const target = erpUrl(ERP_BASE, currentRoute);
    if (openingFreshNew) {
      await erpForceReopenRoute(currentRoute, { forceLoad: true });
    } else {
      await loadErpUrl(target);
    }
    if (skinId === "bill" && billLoadToken !== billLoadGen) {
      navDebug("bill-load-stale", `after loadURL token=${billLoadToken}`);
      return;
    }
    trackNav(target, { fromBrowser: false });

    if (skinId === "bill") {
      amountDueScratch = "";
      amountDueCommitted = "";
    } else {
      dateExpectedScratch = "";
    }
    if (openingFreshNew && skinId !== "bill") {
      const fresh = await forceFreshNewDocInErp(profile.doctype);
      if (fresh && fresh.ok && fresh.doc) {
        dirtyState = finishLensApply(
          {
            doc: fresh.doc,
            isDirty: false,
            isNew: true,
            userEdited: false,
            baselineJson: null,
          },
          true,
        );
        noteShelvedFromOpen(profile.doctypeKey, fresh.doc);
        bumpFormHistoryFromDoc(currentRoute, profile.doctypeKey, fresh.doc);
        pushDocFormSnapshot({
          ok: true,
          doc: fresh.doc,
          scratch: { dateExpected: dateExpectedScratch },
          userEdited: false,
          isNew: true,
          focusVendor: true,
        });
        syncE2eApi();
        return;
      }
      navDebug("fresh-new-doc-fallback", (fresh && fresh.reason) || "waitForForm");
    }
    const snap = await waitForDocForm();
    if (skinId === "bill" && billLoadToken !== billLoadGen) {
      navDebug("bill-load-stale", `after waitForForm token=${billLoadToken}`);
      return;
    }
    if (skinId === "bill") {
      billLoadPhase = billLoadPhaseAfterSnap(!!snap.ok);
    }
    if (snap.ok) {
      dirtyState = finishLensApply(
        {
          doc: snap.doc,
          isDirty: !!snap.isDirty,
          isNew: !!snap.isNew,
          userEdited: false,
          baselineJson: null,
        },
        true,
      );
      if (skinId === "bill") {
        amountDueCommitted = amountDueScratch;
      } else if (skinId === "po" && snap.doc) {
        const items = Array.isArray(snap.doc.items) ? snap.doc.items : [];
        for (const it of items) {
          if (it && it.schedule_date) {
            dateExpectedScratch = String(it.schedule_date);
            break;
          }
        }
      }
      noteShelvedFromOpen(profile.doctypeKey, snap.doc);
      bumpFormHistoryFromDoc(currentRoute, profile.doctypeKey, snap.doc);
      try {
        if (docForm && !docForm.webContents.isDestroyed()) docForm.webContents.focus();
      } catch {
        /* ignore */
      }
      if (skinId === "bill") {
        pushDocFormSnapshot({
          ok: true,
          doc: snap.doc,
          amountDue: amountDueScratch,
          linkedPos: snap.linkedPos || [],
          poLineMeta: snap.poLineMeta || {},
          lineAllocations: snap.lineAllocations || {},
          userEdited: false,
          isNew: !!snap.isNew,
          focusVendor: true,
        });
      } else {
        pushDocFormSnapshot({
          ok: true,
          doc: snap.doc,
          scratch: { dateExpected: dateExpectedScratch },
          userEdited: false,
          isNew: !!snap.isNew,
          focusVendor: true,
        });
      }
    } else {
      dirtyState = {
        isDirty: false,
        isNew: true,
        userEdited: false,
        baselineJson: null,
        doc: null,
      };
      pushDocFormSnapshot({ ...snap, userEdited: false, focusVendor: false });
    }
    syncE2eApi();
  };

  if (surfaceMode === "doc" || skipDirtyGate) {
    await proceed();
    return;
  }
  gateDirtyThen(() => {
    proceed();
  });
}

function openDocSkin() {
  // Soft-peek return: Doc tab rebinds parked Bill/PO/IR without wipe (OI-112).
  const parkRoute = parkedDocSurface && parkedDocSurface.route;
  if (parkRoute) {
    resumeParkedDoc(parkRoute).then((ok) => {
      if (ok) return;
      openDocSkinContinue();
    });
    return;
  }
  if (returnToPeekParent()) return;
  openDocSkinContinue();
}

function openDocSkinContinue() {
  const target = resolveDocSkinTarget(shellCtx());
  if (target) {
    navDebug("openDocSkin", target.kind + (target.route ? ` ${target.route}` : ""));
    if (target.kind === "workflow-home") {
      showHome();
      return;
    }
    if (target.kind === "doc-form") {
      const profile = profileByLayoutKey(target.layoutKey) || profileByDoctypeKey(target.doctype);
      if (!profile) return;
      openDocSkinProfile(profile, target.route);
      return;
    }
    if (target.kind === "pay-outstanding") {
      showPayOutstanding();
      return;
    }
    if (target.kind === "payment-doc") {
      showPaymentDoc(target.record);
      return;
    }
  }
  // OI-112: Tax Category / Purchase Taxes template / Company — Doc tab returns to last Bill/PO/IR.
  const dirtyDoc = dirtyState && dirtyState.doc;
  const fb = pickFallbackDocRoute(history, {
    erpBase: ERP_BASE,
    dirtyDoctypeKey: dirtyDoc && (dirtyDoc.doctype || dirtyDoc.doctype_name),
    dirtyDocName: dirtyDoc && dirtyDoc.name,
    fallbackRoute: FALLBACK_DOC_ROUTE,
  });
  navDebug("openDocSkin-fallback", fb);
  resumeParkedDoc(fb).then((ok) => {
    if (ok) return;
    openRoutePreferred(fb, { forceLoad: true });
  });
}

function openEntry(doctypeKey) {
  const key = doctypeKey || "purchase-invoice";
  const t = resolveEntryOpen(key, lensPrefs);
  navDebug("openEntry", `${key} lens=${t.lens} surface=${t.surface} → ${t.route}`);
  if (t.surface === "doc-form") {
    const profile = profileByDoctypeKey(key);
    if (profile && openDocSkinProfile(profile, t.route)) return;
    showBill(t.route);
  } else showErp(t.route, { forceLoad: true });
}

/**
 * Apply header writes via bridge (used to clear is_paid before Submit+JIT PE).
 * @param {Array<{ field: string, value: string|number }>} writes
 */
async function applyBillHeaderWrites(writes) {
  let doc = dirtyState.doc;
  for (const w of writes) {
    const field = w.field;
    const kind = dirtyCompareKindForField(field);
    let next;
    if (field === "is_paid") {
      next = w.value === true || w.value === 1 || w.value === "1" ? "1" : "0";
    } else if (kind === "number") {
      next = w.value == null ? "" : String(w.value);
    } else {
      next = normalizeEditableText(w.value);
    }
    if (headerValueUnchanged(field, next)) continue;
    const raw = await bridgeCall("setHeader", field, next);
    if (!(raw && raw.ok)) {
      return { ok: false, reason: (raw && raw.reason) || `Could not set ${field}.`, doc };
    }
    doc = raw.doc || doc;
    dirtyState = { ...dirtyState, doc, isDirty: true };
  }
  return { ok: true, doc };
}

/**
 * Create a draft Payment Entry allocated to a submitted Bill (OI-139 Add payment).
 * @param {string} billName
 * @param {{ billNo?: string, postingDate?: string }} [meta]
 */
async function createDraftPaymentEntryForBill(billName, meta = {}) {
  const name = billName == null ? "" : String(billName).trim();
  if (!name || isNewDocRecord(name)) {
    return { ok: false, reason: "Bill must be saved/submitted before Payment Entry." };
  }
  const billLit = JSON.stringify(name);
  const billNoLit = JSON.stringify(normalizeEditableText(meta.billNo) || name);
  const postingLit = JSON.stringify(normalizeEditableText(meta.postingDate) || "");
  const raw = await erpEval(`(async () => {
    function reasonFrom(err) {
      if (err == null) return "";
      if (typeof err === "string") return err.trim();
      if (err.message) return String(err.message).trim();
      try { return JSON.stringify(err).slice(0, 500); } catch (e) { return String(err); }
    }
    try {
      var billName = ${billLit};
      var r = await frappe.call({
        method: "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
        args: { dt: "Purchase Invoice", dn: billName },
      });
      if (r && r.exc) return { ok: false, reason: reasonFrom(r), step: "get_payment_entry" };
      var pe = r && r.message;
      if (!pe) return { ok: false, reason: "get_payment_entry returned empty.", step: "get_payment_entry" };
      try { pe = JSON.parse(JSON.stringify(pe)); } catch (eJson) {}
      if (!pe.doctype) pe.doctype = "Payment Entry";
      var billNo = ${billNoLit};
      var postingDate = ${postingLit};
      if (!pe.reference_no) pe.reference_no = billNo || billName;
      if (!pe.reference_date) {
        pe.reference_date =
          postingDate ||
          (frappe.datetime && frappe.datetime.get_today
            ? frappe.datetime.get_today()
            : null);
      }
      var inserted = await frappe.call({ method: "frappe.client.insert", args: { doc: pe } });
      if (inserted && inserted.exc) {
        return { ok: false, reason: reasonFrom(inserted), step: "insert" };
      }
      var saved = inserted && inserted.message ? inserted.message : null;
      if (!saved || !saved.name) {
        return { ok: false, reason: "Payment Entry insert returned empty.", step: "insert" };
      }
      return { ok: true, name: saved.name };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e), step: "unknown" };
    }
  })()`);
  if (!(raw && typeof raw === "object")) {
    return { ok: false, reason: "Payment Entry create failed." };
  }
  if (raw.ok) return raw;
  return {
    ok: false,
    reason: formatClientErrorReason(raw.reason || raw, "Payment Entry create failed."),
    step: raw.step,
  };
}

/**
 * Create + submit Payment Entry for a submitted Purchase Invoice (OI-135 JIT).
 * @param {string} billName
 * @param {{ modeOfPayment: string, cashBankAccount: string, paidAmount: number }} intent
 */
async function createJitPaymentEntryForBill(billName, intent) {
  const name = billName == null ? "" : String(billName).trim();
  if (!name || isNewDocRecord(name)) {
    return { ok: false, reason: "Bill must be saved/submitted before Payment Entry." };
  }
  const mop = JSON.stringify(intent.modeOfPayment || "");
  const bank = JSON.stringify(intent.cashBankAccount || "");
  const paid = Number(intent.paidAmount);
  const paidLit = Number.isFinite(paid) ? String(paid) : "0";
  const billLit = JSON.stringify(name);
  const billNoLit = JSON.stringify(
    normalizeEditableText(dirtyState.doc && dirtyState.doc.bill_no) || name,
  );
  const postingLit = JSON.stringify(
    normalizeEditableText(dirtyState.doc && dirtyState.doc.posting_date) || "",
  );
  const raw = await erpEval(`(async () => {
    function reasonFrom(err) {
      function flat(msg) {
        if (msg == null) return "";
        if (typeof msg === "string") {
          var t = msg.trim();
          if (!t) return "";
          if (t.charAt(0) === "{" || t.charAt(0) === "[") {
            try { return flat(JSON.parse(t)); } catch (e1) { return t.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim(); }
          }
          return t.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
        }
        if (typeof msg === "number" || typeof msg === "boolean") return String(msg);
        if (Array.isArray(msg)) return msg.map(flat).filter(Boolean).join(" · ");
        if (typeof msg === "object") {
          if (msg.message != null && msg.message !== msg) {
            var inner = flat(msg.message);
            if (inner) return inner;
          }
          if (msg.exception != null) {
            var exn = flat(msg.exception);
            if (exn) return exn.replace(/^frappe\\.exceptions\\.\\w+:\\s*/i, "");
          }
          if (msg.responseText != null) {
            var body = flat(msg.responseText);
            if (body) return body.replace(/^frappe\\.exceptions\\.\\w+:\\s*/i, "");
          }
          if (msg._server_messages != null) {
            var sm = flat(msg._server_messages);
            if (sm) return sm;
          }
          if (msg.exc != null) {
            var ex = flat(msg.exc);
            if (ex) return ex;
          }
          try {
            var s = JSON.stringify(msg);
            if (s && s !== "{}" && s !== "[]") return s.slice(0, 500);
          } catch (e2) {}
        }
        var fb = String(msg);
        return fb === "[object Object]" ? "" : fb;
      }
      return flat(err) || "Payment Entry request failed.";
    }
    try {
      var billName = ${billLit};
      var mop = ${mop};
      var bankAccount = ${bank};
      var paidAmount = ${paidLit};
      var r;
      try {
        r = await frappe.call({
          method: "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
          args: {
            dt: "Purchase Invoice",
            dn: billName,
            bank_account: bankAccount || null,
            bank_amount: paidAmount > 0 ? paidAmount : null,
          },
        });
      } catch (eGet) {
        return { ok: false, reason: reasonFrom(eGet), step: "get_payment_entry" };
      }
      if (r && r.exc) {
        return { ok: false, reason: reasonFrom(r), step: "get_payment_entry" };
      }
      var pe = r && r.message;
      if (!pe) return { ok: false, reason: "get_payment_entry returned empty.", step: "get_payment_entry" };
      // Plain object for client.insert (avoid proxied / circular frm docs).
      try { pe = JSON.parse(JSON.stringify(pe)); } catch (eJson) {}
      if (!pe.doctype) pe.doctype = "Payment Entry";
      if (mop) pe.mode_of_payment = mop;
      if (bankAccount) {
        if (pe.payment_type === "Pay") pe.paid_from = bankAccount;
        else pe.paid_to = bankAccount;
      }
      if (paidAmount > 0) {
        pe.paid_amount = paidAmount;
        pe.received_amount = paidAmount;
        if (pe.references && pe.references.length) {
          pe.references[0].allocated_amount = paidAmount;
        }
      }
      // Bank / CC accounts require Reference No + Date (PE validate).
      var billNo = ${billNoLit};
      var postingDate = ${postingLit};
      if (!pe.reference_no) pe.reference_no = billNo || billName;
      if (!pe.reference_date) {
        pe.reference_date =
          postingDate ||
          (frappe.datetime && frappe.datetime.get_today
            ? frappe.datetime.get_today()
            : null);
      }
      var inserted;
      try {
        inserted = await frappe.call({ method: "frappe.client.insert", args: { doc: pe } });
      } catch (eIns) {
        return { ok: false, reason: reasonFrom(eIns), step: "insert" };
      }
      if (inserted && inserted.exc) {
        return { ok: false, reason: reasonFrom(inserted), step: "insert" };
      }
      var saved = inserted && inserted.message ? inserted.message : null;
      if (!saved) return { ok: false, reason: "Payment Entry insert returned empty.", step: "insert" };
      var submitted;
      try {
        submitted = await frappe.call({ method: "frappe.client.submit", args: { doc: saved } });
      } catch (eSub) {
        return {
          ok: false,
          reason: reasonFrom(eSub) || "Payment Entry saved as draft but Submit failed.",
          step: "submit",
          name: saved.name || null,
        };
      }
      if (submitted && submitted.exc) {
        return {
          ok: false,
          reason: reasonFrom(submitted),
          step: "submit",
          name: saved.name || null,
        };
      }
      var finalDoc = submitted && submitted.message ? submitted.message : saved;
      return {
        ok: true,
        name: finalDoc && finalDoc.name ? finalDoc.name : null,
        docstatus: finalDoc ? finalDoc.docstatus : null,
        paid_amount: finalDoc ? finalDoc.paid_amount : null,
      };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e), step: "unknown" };
    }
  })()`);
  if (!(raw && typeof raw === "object")) {
    return { ok: false, reason: "Payment Entry create failed." };
  }
  if (raw.ok) return raw;
  return {
    ok: false,
    reason: formatClientErrorReason(raw.reason || raw, "Payment Entry create failed."),
    step: raw.step,
    name: raw.name || null,
  };
}

/**
 * Shared with fetchPaymentEntryDraftsForInvoices / insertAndSubmitPaymentEntry below (Packet 4b
 * step 4) -- the same error-flattening helper createJitPaymentEntryForBill already defines
 * inline above. Extracted once here rather than copy-pasted a third time; the two existing
 * single-invoice functions above are left as they are (already-shipped, already-dogfooded --
 * not touched by this batch-write work).
 */
const PE_REASON_FROM_JS = String.raw`function reasonFrom(err) {
  function flat(msg) {
    if (msg == null) return "";
    if (typeof msg === "string") {
      var t = msg.trim();
      if (!t) return "";
      if (t.charAt(0) === "{" || t.charAt(0) === "[") {
        try { return flat(JSON.parse(t)); } catch (e1) { return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
      }
      return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    if (typeof msg === "number" || typeof msg === "boolean") return String(msg);
    if (Array.isArray(msg)) return msg.map(flat).filter(Boolean).join(" · ");
    if (typeof msg === "object") {
      if (msg.message != null && msg.message !== msg) {
        var inner = flat(msg.message);
        if (inner) return inner;
      }
      if (msg.exception != null) {
        var exn = flat(msg.exception);
        if (exn) return exn.replace(/^frappe\.exceptions\.\w+:\s*/i, "");
      }
      if (msg.responseText != null) {
        var body = flat(msg.responseText);
        if (body) return body.replace(/^frappe\.exceptions\.\w+:\s*/i, "");
      }
      if (msg._server_messages != null) {
        var sm = flat(msg._server_messages);
        if (sm) return sm;
      }
      if (msg.exc != null) {
        var ex = flat(msg.exc);
        if (ex) return ex;
      }
      try {
        var s = JSON.stringify(msg);
        if (s && s !== "{}" && s !== "[]") return s.slice(0, 500);
      } catch (e2) {}
    }
    var fb = String(msg);
    return fb === "[object Object]" ? "" : fb;
  }
  return flat(err) || "Payment Entry request failed.";
}`;

/**
 * Fetch one get_payment_entry draft per unique invoice (Packet 4b step 4). ERPNext's own
 * controller only accepts one (dt, dn) at a time and has no "N unrelated invoices" call, so
 * this loops client-side inside the ERP renderer -- one round trip covers the whole batch --
 * and returns the raw drafts for mergeSinglePaymentEntries (src/payment-entry-batch.js) to
 * combine in the main process, where that merge is unit-tested rather than duplicated as
 * untested inline JS.
 * @param {string[]} invoices Purchase Invoice names (already deduped by the caller)
 * @param {{ bankAccount?: string, payOn?: string }} [opts]
 */
async function fetchPaymentEntryDraftsForInvoices(invoices, opts = {}) {
  const list = Array.isArray(invoices)
    ? [...new Set(invoices.map((s) => String(s || "").trim()).filter(Boolean))]
    : [];
  if (!list.length) return { ok: false, reason: "No bills in this batch." };
  const bank = JSON.stringify(opts.bankAccount || "");
  const payOn = JSON.stringify(opts.payOn || "");
  const invoicesLit = JSON.stringify(list);
  const raw = await erpEval(`(async () => {
    ${PE_REASON_FROM_JS}
    try {
      var invoices = ${invoicesLit};
      var bankAccount = ${bank};
      var payOn = ${payOn};
      var peDocs = [];
      for (var i = 0; i < invoices.length; i++) {
        var r;
        try {
          r = await frappe.call({
            method: "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
            args: {
              dt: "Purchase Invoice",
              dn: invoices[i],
              bank_account: bankAccount || null,
              reference_date: payOn || null,
            },
          });
        } catch (eGet) {
          return { ok: false, reason: reasonFrom(eGet), step: "get_payment_entry", invoice: invoices[i] };
        }
        if (r && r.exc) {
          return { ok: false, reason: reasonFrom(r), step: "get_payment_entry", invoice: invoices[i] };
        }
        var pe = r && r.message;
        if (!pe) {
          return {
            ok: false,
            reason: "get_payment_entry returned empty for " + invoices[i] + ".",
            step: "get_payment_entry",
            invoice: invoices[i],
          };
        }
        try { pe = JSON.parse(JSON.stringify(pe)); } catch (eJson) {}
        peDocs.push(pe);
      }
      return { ok: true, peDocs: peDocs };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e), step: "unknown" };
    }
  })()`);
  if (!(raw && typeof raw === "object")) {
    return { ok: false, reason: "Could not fetch Payment Entry drafts." };
  }
  if (raw.ok) return raw;
  return {
    ok: false,
    reason: formatClientErrorReason(raw.reason || raw, "Could not fetch Payment Entry drafts."),
    step: raw.step,
    invoice: raw.invoice || null,
  };
}

/**
 * Insert + submit an already-fully-populated Payment Entry doc. Shared tail of the single-
 * invoice JIT path (createJitPaymentEntryForBill above) and the batch path below -- identical
 * insert/submit shape either way, only how the doc got built differs.
 * @param {object} pe
 */
async function insertAndSubmitPaymentEntry(pe) {
  const docLit = JSON.stringify(pe);
  const raw = await erpEval(`(async () => {
    ${PE_REASON_FROM_JS}
    try {
      var pe = ${docLit};
      var inserted;
      try {
        inserted = await frappe.call({ method: "frappe.client.insert", args: { doc: pe } });
      } catch (eIns) {
        return { ok: false, reason: reasonFrom(eIns), step: "insert" };
      }
      if (inserted && inserted.exc) {
        return { ok: false, reason: reasonFrom(inserted), step: "insert" };
      }
      var saved = inserted && inserted.message ? inserted.message : null;
      if (!saved) return { ok: false, reason: "Payment Entry insert returned empty.", step: "insert" };
      var submitted;
      try {
        submitted = await frappe.call({ method: "frappe.client.submit", args: { doc: saved } });
      } catch (eSub) {
        return {
          ok: false,
          reason: reasonFrom(eSub) || "Payment Entry saved as draft but Submit failed.",
          step: "submit",
          name: saved.name || null,
        };
      }
      if (submitted && submitted.exc) {
        return { ok: false, reason: reasonFrom(submitted), step: "submit", name: saved.name || null };
      }
      var finalDoc = submitted && submitted.message ? submitted.message : saved;
      return {
        ok: true,
        name: finalDoc && finalDoc.name ? finalDoc.name : null,
        docstatus: finalDoc ? finalDoc.docstatus : null,
        paid_amount: finalDoc ? finalDoc.paid_amount : null,
      };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e), step: "unknown" };
    }
  })()`);
  if (!(raw && typeof raw === "object")) {
    return { ok: false, reason: "Payment Entry create failed." };
  }
  if (raw.ok) return raw;
  return {
    ok: false,
    reason: formatClientErrorReason(raw.reason || raw, "Payment Entry create failed."),
    step: raw.step,
    name: raw.name || null,
  };
}

/**
 * Create + submit one Payment Entry covering a whole PaymentBatchGroup (Packet 4b step 4).
 * Dedupes to unique invoices first (an exploded-installment group can list the same invoice
 * under two installmentKeys -- get_payment_entry already returns every unpaid installment for
 * an invoice in one call when its Payment Terms Template allocates that way, so calling it
 * twice for the same invoice would duplicate reference rows).
 * @param {import("../src/outstanding-bills.js").OutstandingBillRow[]} bills
 * @param {{ modeOfPayment?: string, cashBankAccount?: string, referenceNo?: string, payOn?: string }} intent
 */
async function createBatchPaymentEntryForBills(bills, intent = {}) {
  const rows = Array.isArray(bills) ? bills : [];
  const invoices = [...new Set(rows.map((b) => normalizeEditableText(b && b.invoice)).filter(Boolean))];
  if (!invoices.length) return { ok: false, reason: "No bills in this batch." };
  if (!normalizeEditableText(intent.cashBankAccount)) {
    return { ok: false, reason: "Pick a Pay from account first." };
  }

  const fetched = await fetchPaymentEntryDraftsForInvoices(invoices, {
    bankAccount: intent.cashBankAccount,
    payOn: intent.payOn,
  });
  if (!fetched.ok) return fetched;

  const merged = mergeSinglePaymentEntries(fetched.peDocs);
  if (!merged.ok) return merged;

  const pe = merged.doc;
  if (normalizeEditableText(intent.modeOfPayment)) pe.mode_of_payment = intent.modeOfPayment;
  if (!pe.reference_no) {
    pe.reference_no = normalizeEditableText(intent.referenceNo) || `Batch of ${invoices.length}`;
  }
  if (!pe.reference_date) pe.reference_date = intent.payOn || null;

  return insertAndSubmitPaymentEntry(pe);
}

/**
 * Fetch one existing Payment Entry (Packet 4b step 5 -- payment-doc.html's full-page mount).
 * Read-only: no fields are patched, unlike the drafts fetched for the batch write path above.
 * @param {string} name
 */
async function fetchPaymentEntry(name) {
  const n = name == null ? "" : String(name).trim();
  if (!n || isNewDocRecord(n)) return { ok: false, reason: "No Payment Entry specified." };
  const nameLit = JSON.stringify(n);
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.call) return { ok: false, reason: "ERP Desk not ready." };
      var r = await frappe.call({
        method: "frappe.client.get",
        args: { doctype: "Payment Entry", name: ${nameLit} },
      });
      if (r && r.exc) {
        return { ok: false, reason: String(r.exc).replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim() };
      }
      var doc = r && r.message;
      if (!doc) return { ok: false, reason: "Payment Entry not found." };
      try { doc = JSON.parse(JSON.stringify(doc)); } catch (eJson) {}
      return { ok: true, doc: doc };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (!(raw && typeof raw === "object")) return { ok: false, reason: "Could not load this Payment Entry." };
  if (raw.ok) return raw;
  return { ok: false, reason: formatClientErrorReason(raw.reason || raw, "Could not load this Payment Entry.") };
}

/**
 * List Payment Entries allocated to this Purchase Invoice (OI-139).
 * Prefer parent PE filtered by child reference (child DocType get_list is often empty/denied).
 * @param {string} billName
 */
async function listBillPaymentEntries(billName) {
  const name = billName == null ? "" : String(billName).trim();
  if (!name || isNewDocRecord(name)) {
    return { ok: true, rows: [] };
  }
  const billLit = JSON.stringify(name);
  const raw = await erpEval(`(async () => {
    try {
      var billName = ${billLit};
      var peList = [];
      try {
        var pes = await frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype: "Payment Entry",
            filters: [
              ["Payment Entry Reference", "reference_doctype", "=", "Purchase Invoice"],
              ["Payment Entry Reference", "reference_name", "=", billName],
            ],
            fields: ["name", "posting_date", "mode_of_payment", "paid_amount", "status", "docstatus"],
            limit_page_length: 50,
            order_by: "posting_date desc",
          },
        });
        peList = (pes && pes.message) || [];
      } catch (ePe) {
        peList = [];
      }
      if (!peList.length) {
        try {
          var refs = await frappe.call({
            method: "frappe.client.get_list",
            args: {
              doctype: "Payment Entry Reference",
              filters: {
                reference_doctype: "Purchase Invoice",
                reference_name: billName,
              },
              fields: ["name", "parent", "allocated_amount"],
              limit_page_length: 50,
            },
          });
          var list = (refs && refs.message) || [];
          var parents = [];
          var allocBy = {};
          for (var i = 0; i < list.length; i++) {
            var ref = list[i];
            if (!ref || !ref.parent) continue;
            parents.push(ref.parent);
            allocBy[ref.parent] = ref.allocated_amount;
          }
          if (parents.length) {
            var pes2 = await frappe.call({
              method: "frappe.client.get_list",
              args: {
                doctype: "Payment Entry",
                filters: [["name", "in", parents]],
                fields: ["name", "posting_date", "mode_of_payment", "paid_amount", "status", "docstatus"],
                limit_page_length: 50,
              },
            });
            peList = ((pes2 && pes2.message) || []).map(function (row) {
              return Object.assign({}, row, { allocated_amount: allocBy[row.name] });
            });
          }
        } catch (eRef) {
          /* keep peList empty */
        }
      }
      var out = [];
      for (var p = 0; p < peList.length; p++) {
        var row = peList[p] || {};
        var alloc = row.allocated_amount;
        if (alloc == null || alloc === "") {
          try {
            var children = await frappe.db.get_all("Payment Entry Reference", {
              filters: {
                parent: row.name,
                reference_doctype: "Purchase Invoice",
                reference_name: billName,
              },
              fields: ["allocated_amount"],
            });
            alloc = 0;
            for (var c = 0; c < (children || []).length; c++) {
              alloc += Number(children[c].allocated_amount) || 0;
            }
          } catch (eChild) {
            alloc = row.paid_amount;
          }
        }
        out.push({
          name: row.name,
          posting_date: row.posting_date || "",
          mode_of_payment: row.mode_of_payment || "",
          paid_amount: row.paid_amount,
          allocated_amount: alloc,
          status: row.status || "",
          docstatus: row.docstatus,
        });
      }
      return { ok: true, rows: out };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), rows: [] };
    }
  })()`);
  if (!(raw && raw.ok)) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Could not list payments.",
      rows: [],
    };
  }
  return { ok: true, rows: projectBillPaymentRows(raw.rows) };
}

/**
 * OI-161 Packet 4: outstanding Bills across all AP vendors.
 * Runs the existing Accounts Payable report (same engine Vanilla's report page uses — Clean
 * Core, no reimplemented ageing math), then fetches each returned invoice's full document to
 * read its `payment_schedule` child table. `buildOutstandingBillRows` (Packet 1) does the actual
 * normalize/explode/discount-window work here in the main process — the erpEval script below
 * only fetches raw rows.
 *
 * **Not a single batched query, found live 2026-09-05**: `frappe.client.get_list` on a child
 * doctype ("Payment Schedule") silently strips every requested field except `name` — a known
 * class of gotcha already flagged in this file (see `listBillPaymentEntries`'s comment on
 * Payment Entry Reference). Fetching the *parent* document via `frappe.client.get` returns its
 * child table fully populated, so this issues one `get` per invoice — concurrently, not
 * sequentially — rather than the one-query design originally planned.
 * @returns {Promise<{ ok: boolean, bills: import("../src/outstanding-bills.js").OutstandingBillRow[], reason?: string }>}
 */
async function fetchOutstandingBills() {
  const raw = await erpEval(`(async () => {
    try {
      // Same company-resolution preference as ops/sample-data/seed_corpus.py::_resolve_company —
      // a sandbox can have both "…SANDBOX…" and "…SANDBOX… (Demo)" companies; the demo one must
      // never win by accident (found 2026-09-05: unfiltered AP report mixed both companies'
      // vendors together on screen).
      var companies = [];
      try {
        var companyResp = await frappe.call({
          method: "frappe.client.get_list",
          args: { doctype: "Company", fields: ["name"], limit_page_length: 0 },
        });
        companies = ((companyResp && companyResp.message) || []).map(function (c) { return c.name; });
      } catch (eCompanies) {
        companies = [];
      }
      var company =
        companies.find(function (n) { return /sandbox/i.test(n) && n.indexOf("(Demo)") === -1; }) ||
        (companies.length === 1 ? companies[0] : "") ||
        (frappe.defaults && frappe.defaults.get_user_default && frappe.defaults.get_user_default("Company")) ||
        "";
      var reportArgs = { report_name: "Accounts Payable", filters: { party_type: "Supplier" } };
      if (company) reportArgs.filters.company = company;
      var report = await frappe.call({ method: "frappe.desk.query_report.run", args: reportArgs });
      var rows = ((report && report.message && report.message.result) || []).filter(
        function (r) { return r && r.voucher_no; },
      );
      var vouchers = rows.map(function (r) { return r.voucher_no; });
      var schedulesByInvoice = {};
      await Promise.all(vouchers.map(async function (name) {
        try {
          var doc = await frappe.call({
            method: "frappe.client.get",
            args: { doctype: "Purchase Invoice", name: name },
          });
          schedulesByInvoice[name] = (doc && doc.message && doc.message.payment_schedule) || [];
        } catch (eDoc) {
          schedulesByInvoice[name] = [];
        }
      }));
      return { ok: true, rows: rows, schedulesByInvoice: schedulesByInvoice };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), rows: [], schedulesByInvoice: {} };
    }
  })()`);
  if (!(raw && raw.ok)) {
    return { ok: false, reason: (raw && raw.reason) || "Could not load outstanding bills.", bills: [] };
  }
  const schedulesByInvoice = raw.schedulesByInvoice || {};
  const bills = [];
  for (const reportRow of raw.rows || []) {
    bills.push(...buildOutstandingBillRows(reportRow, schedulesByInvoice[reportRow.voucher_no] || []));
  }
  return { ok: true, bills };
}

/**
 * Reload Purchase Invoice after JIT Payment Entry so status/outstanding match ledger.
 * @param {string} billName
 */
async function reloadBillDocAfterPayment(billName) {
  const name = billName == null ? "" : String(billName).trim();
  if (!name || isNewDocRecord(name)) {
    return { ok: false, reason: "Missing Bill name." };
  }
  const billLit = JSON.stringify(name);
  const raw = await erpEval(`(async () => {
    try {
      var billName = ${billLit};
      if (
        typeof cur_frm !== "undefined" &&
        cur_frm &&
        cur_frm.doctype === "Purchase Invoice" &&
        cur_frm.doc &&
        cur_frm.doc.name === billName &&
        typeof cur_frm.reload_doc === "function"
      ) {
        await cur_frm.reload_doc();
        return { ok: true, doc: JSON.parse(JSON.stringify(cur_frm.doc)) };
      }
      var g = await frappe.call({
        method: "frappe.client.get",
        args: { doctype: "Purchase Invoice", name: billName },
      });
      if (g && g.message) return { ok: true, doc: g.message };
      return { ok: false, reason: "Could not reload Bill after payment." };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (raw && raw.ok && raw.doc) return { ok: true, doc: raw.doc };
  return {
    ok: false,
    reason: (raw && raw.reason) || "Could not reload Bill after payment.",
  };
}

/**
 * @param {number} ri
 * @param {Extract<ReturnType<typeof planBillLineQtySplit>, { action: "split" }>} plan
 */
async function executeBillSplitPlanInMain(ri, plan) {
  const capRes = await setBillItemField(ri, "qty", formatQtyForErp(plan.sourcedQty));
  if (!capRes || !capRes.ok) return false;
  const added = await addBillItem();
  if (!added || !added.ok) return false;
  const items =
    dirtyState.doc && Array.isArray(dirtyState.doc.items) ? dirtyState.doc.items : [];
  const newRi = Math.max(0, items.length - 1);
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
    const res = await setBillItemField(newRi, field, value);
    if (!res || !res.ok) return false;
  }
  dirtyState = markUserEdited({ ...dirtyState, isDirty: true });
  return true;
}

/** Split PO-linked rows over cap before save/submit (OI-151 — cache-only, no JIT ERP fetch). */
async function repairBillOverbillRowsBeforeSave() {
  const doc = dirtyState.doc;
  if (!doc || !Array.isArray(doc.items) || !doc.items.length) {
    navDebug("bill-overbill-repair", "repaired=0 reason=no_items");
    return { repaired: 0 };
  }
  navDebug(
    "bill-overbill-repair-start",
    `rows=${doc.items.length} doc=${doc.name != null ? String(doc.name) : "?"}`,
  );
  let repaired = 0;
  for (let ri = doc.items.length - 1; ri >= 0; ri -= 1) {
    const row = dirtyState.doc.items[ri];
    if (!row || !billRowHasSource(row)) continue;
    const cap = cachedMaxBillableQtyForRow(ri);
    if (cap == null) {
      navDebug("bill-overbill-skip", `ri=${ri} cap=cache_miss`);
      continue;
    }
    const plan = planBillLineQtySplit(row, cap, row.qty);
    navDebug(
      "bill-overbill-plan",
      `ri=${ri} qty=${row.qty} cap=${cap} action=${plan.action} via=cache`,
    );
    if (plan.action !== "split" || !plan.itemCode) continue;
    const ok = await executeBillSplitPlanInMain(ri, plan);
    if (ok) {
      repaired += 1;
    } else {
      navDebug("bill-overbill-split-fail", `ri=${ri}`);
    }
  }
  navDebug("bill-overbill-repair", `repaired=${repaired}`);
  return { repaired };
}

async function saveBillFromErp(opts = {}) {
  const submit = !!opts.submit;
  cancelBillEnrichBackground(submit ? "submit-preflight" : "save-preflight");
  const cacheBlockers = listBillOverbillCacheBlockers(dirtyState.doc);
  if (cacheBlockers.length) {
    navDebug("bill-overbill-cache-block", cacheBlockers[0]);
    return {
      ok: false,
      reason: cacheBlockers[0],
      blockers: cacheBlockers,
      doc: dirtyState.doc,
      overbillRepaired: 0,
    };
  }
  const repair = await repairBillOverbillRowsBeforeSave();
  if (!amountDueMatchesGrandTotal(amountDueScratch, billCompareTotal(dirtyState.doc))) {
    return {
      ok: false,
      reason: "Amount Due checksum failed (must match Grand total).",
      doc: dirtyState.doc,
      overbillRepaired: repair.repaired,
    };
  }

  /** @type {ReturnType<typeof captureAlreadyPaidIntent>} */
  let jitIntent = null;
  if (submit) {
    jitIntent = captureAlreadyPaidIntent(dirtyState.doc);
    if (jitIntent) {
      const blockers = listJitPaymentEntryBlockers(jitIntent);
      if (blockers.length) {
        return { ok: false, reason: blockers[0], blockers, doc: dirtyState.doc, overbillRepaired: repair.repaired };
      }
      const cleared = await applyBillHeaderWrites(clearIsPaidForJitPeWrites());
      if (!cleared.ok) {
        return {
          ok: false,
          reason: cleared.reason || "Could not clear Already paid before Submit.",
          doc: dirtyState.doc,
          overbillRepaired: repair.repaired,
        };
      }
    }
  }

  // Bridge saveDoc always settles (preflight + short inner deadline + scraped Vanilla msgs).
  // Outer race is a backstop if executeJavaScript itself hangs.
  let raw = await raceTimeout(
    bridgeCall("saveDoc", submit ? "Submit" : "Save"),
    BILL_SAVE_TIMEOUT_MS,
    submit ? "Save & submit" : "Save draft",
  );
  if (raw && raw.ok) {
    dirtyState = {
      ...dirtyState,
      doc: raw.doc,
      userEdited: false,
      isDirty: false,
      baselineJson: captureBaseline(raw.doc),
    };
    amountDueCommitted = amountDueScratch;
    noteShelvedFromSave("purchase-invoice", raw.doc);
    if (submit) cancelBillEnrichBackground("submitted");

    if (submit && jitIntent && raw.doc && raw.doc.name) {
      const pe = await createJitPaymentEntryForBill(raw.doc.name, jitIntent);
      if (pe && pe.ok) {
        const reloaded = await reloadBillDocAfterPayment(raw.doc.name);
        if (reloaded && reloaded.ok && reloaded.doc) {
          dirtyState = {
            ...dirtyState,
            doc: reloaded.doc,
            userEdited: false,
            isDirty: false,
            baselineJson: captureBaseline(reloaded.doc),
          };
          noteShelvedFromSave("purchase-invoice", reloaded.doc);
          return {
            ...raw,
            doc: reloaded.doc,
            overbillRepaired: repair.repaired,
            jitPayment: {
              ok: true,
              name: pe.name,
              paid_amount: pe.paid_amount,
            },
          };
        }
        return {
          ...raw,
          overbillRepaired: repair.repaired,
          jitPayment: {
            ok: true,
            name: pe.name,
            paid_amount: pe.paid_amount,
          },
        };
      }
      return {
        ...raw,
        overbillRepaired: repair.repaired,
        jitPayment: {
          ok: false,
          reason:
            (pe && pe.reason) ||
            "Bill submitted, but Payment Entry failed — pay from Payment Entry / Pay Bills.",
        },
      };
    }
    return { ...raw, overbillRepaired: repair.repaired };
  }
  const out = raw && typeof raw === "object" ? raw : { ok: false, reason: "Save failed." };
  return { ...out, doc: dirtyState.doc, overbillRepaired: repair.repaired };
}

async function listBillMandatoryMissing() {
  const raw = await bridgeCall("listMandatoryMissing", "Purchase Invoice");
  if (!raw || typeof raw !== "object") {
    return { ok: false, blockers: [], reason: "Could not read ERP mandatory fields." };
  }
  return {
    ok: raw.ok !== false,
    blockers: Array.isArray(raw.blockers) ? raw.blockers : [],
    reason: raw.reason,
  };
}

async function setBillItemField(rowIndex, field, value) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return { ok: false, reason: "Invalid row" };
  }
  if (!isEditableBillItemField(field)) {
    return { ok: false, reason: "Field not editable on Bill lines" };
  }
  const kind = dirtyCompareKindForField(field);
  const next =
    kind === "number" ? (value == null ? "" : String(value)) : normalizeEditableText(value);
  const prev =
    dirtyState.doc &&
    Array.isArray(dirtyState.doc.items) &&
    dirtyState.doc.items[rowIndex]
      ? dirtyState.doc.items[rowIndex][field]
      : undefined;
  if (valuesMeaningfullyEqual(prev, next, { kind })) {
    return { ok: true, doc: dirtyState.doc, skipped: true };
  }
  const raw = await bridgeCall("setRow", rowIndex, field, next);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw;
}

async function addBillItem() {
  dirtyState = markUserEdited(dirtyState);
  const raw = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f) return { ok: false, reason: "No form." };
      f.add_child("items", {});
      f.refresh_field("items");
      await new Promise(function (r) { setTimeout(r, 100); });
      return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (raw && raw.ok) dirtyState = { ...dirtyState, doc: raw.doc, isDirty: true };
  return raw;
}

async function deleteBillItem(rowIndex) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return { ok: false, reason: "Invalid row" };
  }
  dirtyState = markUserEdited(dirtyState);
  const items =
    dirtyState.doc && Array.isArray(dirtyState.doc.items) ? dirtyState.doc.items : [];
  if (items.length <= 1) {
    const raw = await bridgeCall("clearRow", rowIndex, [...ITEM_ROW_CLEAR_FIELDS]);
    if (raw && raw.ok) {
      dirtyState = { ...dirtyState, doc: raw.doc, isDirty: true };
      const key = currentBillDocKey();
      if (billLineAllocationsByDoc[key]) {
        const next = { ...billLineAllocationsByDoc[key] };
        delete next[rowIndex];
        delete next[String(rowIndex)];
        billLineAllocationsByDoc[key] = next;
      }
      if (billPoLineMetaByDoc[key]) {
        const next = { ...billPoLineMetaByDoc[key] };
        delete next[rowIndex];
        delete next[String(rowIndex)];
        billPoLineMetaByDoc[key] = next;
      }
      return {
        ...raw,
        clearedLastRow: true,
        reason: LAST_ITEM_ROW_TOAST,
        lineAllocations: getBillLineAllocations(),
        poLineMeta: getBillPoLineMeta(),
      };
    }
    return {
      ok: false,
      clearedLastRow: false,
      blockedLastRow: true,
      reason: (raw && raw.reason) || LAST_ITEM_ROW_TOAST,
    };
  }
  const raw = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f) return { ok: false, reason: "No form." };
      var items = f.doc.items || [];
      if (items.length <= 1) {
        return {
          ok: false,
          blockedLastRow: true,
          reason: ${JSON.stringify(LAST_ITEM_ROW_TOAST)},
        };
      }
      var row = items[${rowIndex}];
      if (!row) return { ok: false, reason: "Row not found." };
      var grid = f.get_field("items") && f.get_field("items").grid;
      if (grid && row.name && grid.grid_rows_by_docname && grid.grid_rows_by_docname[row.name]) {
        grid.grid_rows_by_docname[row.name].remove();
      } else if (grid && grid.delete_row) {
        grid.delete_row(${rowIndex});
      } else {
        return { ok: false, reason: "Could not delete row (no grid)." };
      }
      f.refresh_field("items");
      await new Promise(function (r) { setTimeout(r, 100); });
      return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (raw && raw.ok) dirtyState = { ...dirtyState, doc: raw.doc, isDirty: true };
  return raw;
}

async function searchLink(doctype, txt, filters) {
  if (typeof doctype !== "string" || !doctype.trim()) {
    return { ok: false, reason: "doctype required", results: [] };
  }
  const q = txt == null ? "" : String(txt);
  const filterPairs =
    filters && typeof filters === "object" && !Array.isArray(filters)
      ? Object.entries(filters).filter(([, v]) => v != null && v !== "")
      : [];
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe) return { ok: false, reason: "ERP Desk not ready (no frappe)." };
      var doctype = ${JSON.stringify(doctype)};
      var txt = ${JSON.stringify(q)};
      var filterPairs = ${JSON.stringify(filterPairs)};
      var rows = [];
      if (frappe.call) {
        var args = {
          txt: txt,
          doctype: doctype,
          reference_doctype: "Purchase Invoice",
          page_length: 25
        };
        if (filterPairs.length) {
          var filterObj = {};
          filterPairs.forEach(function (p) { filterObj[p[0]] = p[1]; });
          args.filters = filterObj;
        }
        var r = await frappe.call({
          method: "frappe.desk.search.search_link",
          args: args
        });
        rows = (r && r.message) ? r.message : [];
      } else if (frappe.db && frappe.db.get_list) {
        var fields = ["name"];
        if (doctype === "Supplier") fields.push("supplier_name");
        if (doctype === "Item") fields.push("item_name");
        var listFilters = txt ? [["name", "like", "%" + txt + "%"]] : [];
        filterPairs.forEach(function (p) { listFilters.push([p[0], "=", p[1]]); });
        var list = await frappe.db.get_list(doctype, {
          fields: fields,
          filters: listFilters,
          limit: 25,
          order_by: "modified desc"
        });
        rows = (list || []).map(function (row) {
          return {
            value: row.name,
            description: row.supplier_name || row.item_name || row.name
          };
        });
      } else {
        return { ok: false, reason: "No search API on this Desk session." };
      }
      return { ok: true, results: rows };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), results: [] };
    }
  })()`);
  if (!raw || !raw.ok) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Link search failed",
      results: [],
    };
  }
  let results = normalizeSearchLinkResults(raw.results);
  if (doctype.trim() === "Account") {
    results = await enrichAccountLinkResults(results);
  }
  if (doctype.trim() !== "Supplier" || !results.length) {
    return { ok: true, results };
  }
  const ranked = await rankSupplierSearchResults(results);
  return { ok: true, results: ranked };
}

/**
 * Attach Account.company and de-emphasize other-company rows vs open Bill company.
 * @param {Array<{ value: string, description: string }>} results
 */
async function enrichAccountLinkResults(results) {
  if (!results.length) return results;
  const names = results.map((r) => r.value).filter(Boolean);
  const billCompany = normalizeEditableText(dirtyState.doc && dirtyState.doc.company);
  const namesLit = JSON.stringify(names);
  const raw = await erpEval(`(async () => {
    try {
      var names = ${namesLit};
      if (!names.length) return { ok: true, byName: {} };
      var list = await frappe.db.get_list("Account", {
        fields: ["name", "company"],
        filters: [["name", "in", names]],
        limit_page_length: names.length,
      });
      var byName = {};
      (list || []).forEach(function (row) {
        if (row && row.name) byName[row.name] = row.company || "";
      });
      return { ok: true, byName: byName };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), byName: {} };
    }
  })()`);
  const byName = (raw && raw.byName) || {};
  const withCompany = results.map((r) => ({
    ...r,
    company: byName[r.value] || "",
  }));
  return annotateAccountLinkOptions(withCompany, billCompany);
}

/**
 * Resolve Account.company for names on the open Bill; return save-gate blockers.
 */
async function listBillAccountCompanyMismatches() {
  const doc = dirtyState.doc;
  const billCompany = normalizeEditableText(doc && doc.company);
  const names = accountNamesOnBillDoc(doc);
  if (!billCompany || !names.length) {
    return { ok: true, blockers: [], byName: {} };
  }
  const namesLit = JSON.stringify(names);
  const raw = await erpEval(`(async () => {
    try {
      var names = ${namesLit};
      var list = await frappe.db.get_list("Account", {
        fields: ["name", "company"],
        filters: [["name", "in", names]],
        limit_page_length: names.length,
      });
      var byName = {};
      (list || []).forEach(function (row) {
        if (row && row.name) byName[row.name] = row.company || "";
      });
      return { ok: true, byName: byName };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), byName: {} };
    }
  })()`);
  if (!(raw && raw.ok)) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Could not check Account companies.",
      blockers: [],
      byName: {},
    };
  }
  const byName = raw.byName || {};
  const taxes = Array.isArray(doc.taxes) ? doc.taxes : [];
  const blockers = listAccountCompanyMismatchBlockers({
    billCompany,
    accountHeads: taxes.map((t) => (t && t.account_head) || ""),
    cashBankAccount: doc.cash_bank_account,
    accountCompanyByName: byName,
  });
  return { ok: true, blockers, byName };
}

/**
 * Last submitted PO date per supplier + company FY start (OI-131).
 * Search still works if this extra hop fails.
 * @param {Array<{ value: string, description: string }>} results
 */
async function rankSupplierSearchResults(results) {
  const names = results.map((r) => r.value).filter(Boolean);
  if (!names.length) return results;
  const extra = await erpEval(`(async () => {
    try {
      var names = ${JSON.stringify(names)};
      var lastPo = {};
      if (frappe.db && frappe.db.get_list) {
        var pos = await frappe.db.get_list("Purchase Order", {
          fields: ["supplier", "transaction_date"],
          filters: [["supplier", "in", names], ["docstatus", "=", 1]],
          order_by: "transaction_date desc",
          limit: 200
        });
        (pos || []).forEach(function (row) {
          if (row.supplier && !lastPo[row.supplier]) lastPo[row.supplier] = row.transaction_date;
        });
      }
      var fyStart = "";
      try {
        var fy = frappe.defaults && frappe.defaults.get_user_default
          ? frappe.defaults.get_user_default("fiscal_year")
          : "";
        if (fy && frappe.db && frappe.db.get_value) {
          var v = await frappe.db.get_value("Fiscal Year", fy, "year_start_date");
          if (v && v.message && v.message.year_start_date) fyStart = v.message.year_start_date;
          else if (v && v.year_start_date) fyStart = v.year_start_date;
          else if (typeof v === "string") fyStart = v;
        }
      } catch (e) {}
      return { ok: true, lastPo: lastPo, fyStart: fyStart || "" };
    } catch (e) {
      return { ok: false, lastPo: {}, fyStart: "" };
    }
  })()`);
  if (!extra || typeof extra !== "object") return results;
  return rankSupplierLinkOptions(results, extra.lastPo || {}, {
    fyStart: extra.fyStart || "",
    asOf: utcYmd(),
  });
}

async function tickHealth() {
  const result = await pingHealth({
    erpBase: ERP_BASE,
    pingPath: HEALTH_PING_PATH,
    timeoutMs: 3000,
  });
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (result.status === "ok") diagnoseState.lastOkAt = clock;
  diagnoseState = {
    ...diagnoseState,
    status: result.status,
    code: result.code,
    latencyMs: result.latencyMs,
  };
  pingLog = appendPingLog(pingLog, {
    at: now.toISOString(),
    status: result.status,
    code: result.code,
    latencyMs: result.latencyMs,
  });
  sendHealth(result.status);
}

function diagnoseSnapshot() {
  const lines = formatDiagnoseLines({
    erpBase: ERP_BASE,
    status: diagnoseState.status,
    code: diagnoseState.code,
    latencyMs: diagnoseState.latencyMs,
    lastOkAt: diagnoseState.lastOkAt,
    internetOk: diagnoseState.internetOk,
  });
  const navLines = formatNavDebugLines(navDebugLog);
  const incidentLines = formatNavIncidentsDigest(navIncidentRing);
  const focusLines = formatFocusDebugLines(focusDebugLog);
  const focusIncidentLines = formatFocusIncidentsDigest(focusIncidentRing);
  const allLines = [
    ...lines,
    "",
    ...navLines,
    "",
    ...incidentLines,
    "",
    ...focusLines,
    "",
    ...focusIncidentLines,
  ];
  const remediation = remediationUiState(healthRemediation, {
    status: diagnoseState.status,
  });
  return {
    lines: allLines,
    copyText: diagnoseCopyText(allLines),
    hostClass: classifyHostClass(ERP_BASE),
    version: APP_VERSION,
    updateStub: "Shell updates: ask IT (packaged updater later).",
    remediation,
    healthStatus: diagnoseState.status,
  };
}

function createWindow() {
  loadPrefs();
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: "erpnext-ui-app",
    backgroundColor: "#2c3e50",
  });

  const pref = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };

  chrome = new WebContentsView({
    webPreferences: {
      ...pref,
      focusOnNavigation: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  home = new WebContentsView({
    webPreferences: {
      ...pref,
      focusOnNavigation: false,
      preload: path.join(__dirname, "home-preload.cjs"),
    },
  });
  bill = new WebContentsView({
    webPreferences: {
      ...pref,
      focusOnNavigation: false,
      preload: path.join(__dirname, "bill-preload.cjs"),
    },
  });
  docForm = new WebContentsView({
    webPreferences: {
      ...pref,
      focusOnNavigation: false,
      preload: path.join(__dirname, "doc-form-preload.cjs"),
    },
  });
  hist = new WebContentsView({
    webPreferences: {
      ...pref,
      focusOnNavigation: false,
      preload: path.join(__dirname, "history-preload.cjs"),
    },
  });
  erp = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "erp-preload.cjs"),
      // Avoid auto-stealing focus on every Desk nav (Electron #42578 / focusOnNavigation).
      focusOnNavigation: false,
    },
  });
  payOutstanding = new WebContentsView({
    webPreferences: {
      ...pref,
      focusOnNavigation: false,
      preload: path.join(__dirname, "pay-outstanding-preload.cjs"),
    },
  });
  paymentDoc = new WebContentsView({
    webPreferences: {
      ...pref,
      focusOnNavigation: false,
      preload: path.join(__dirname, "payment-doc-preload.cjs"),
    },
  });

  applyWebContentsListenerBudget(erp.webContents);
  applyWebContentsListenerBudget(docForm.webContents);

  win.contentView.addChildView(chrome);
  win.contentView.addChildView(hist);
  win.contentView.addChildView(home);
  win.contentView.addChildView(bill);
  win.contentView.addChildView(docForm);
  win.contentView.addChildView(erp);
  win.contentView.addChildView(payOutstanding);
  win.contentView.addChildView(paymentDoc);

  chrome.webContents.loadFile(path.join(__dirname, "chrome.html"));
  home.webContents.loadFile(path.join(__dirname, "home.html"));
  bill.webContents.loadURL("about:blank");
  docForm.webContents.loadFile(path.join(__dirname, "doc-form.html"));
  hist.webContents.loadFile(path.join(__dirname, "history.html"));
  erp.webContents.loadURL(erpUrl(ERP_BASE, "/desk"));
  payOutstanding.webContents.loadFile(path.join(__dirname, "pay-outstanding.html"));
  paymentDoc.webContents.loadFile(path.join(__dirname, "payment-doc.html"));

  if (process.env.E2E === "1") {
    win.loadFile(path.join(__dirname, "..", "e2e", "probe.html"));
  }

  erp.webContents.setWindowOpenHandler(({ url }) =>
    isAllowedErpUrl(ERP_BASE, url) ? { action: "allow" } : { action: "deny" },
  );
  erp.webContents.on("will-navigate", (e, url) => {
    if (!isAllowedErpUrl(ERP_BASE, url)) e.preventDefault();
  });
  erp.webContents.on("did-navigate", (_e, url) => {
    trackNav(url);
    ensureErpFormBridge().catch(() => {});
    ensureSimplifiedSkin().catch(() => {});
  });
  erp.webContents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (isMainFrame) {
      trackNav(url);
      ensureErpFormBridge().catch(() => {});
      ensureSimplifiedSkin().catch(() => {});
    }
  });
  erp.webContents.on("did-finish-load", () => {
    ensureErpFormBridge().catch(() => {});
    ensureSimplifiedSkin().catch(() => {});
    if (surfaceMode === "erp") scheduleErpKeyboardFocus();
  });

  place();
  win.on("resize", place);
  win.on("closed", () => {
    closeDiagnoseDropdown();
    closeNavIncidentDialog();
    closeSubmittedDropdown();
    win = null;
    chrome = null;
    home = null;
    bill = null;
    docForm = null;
    erp = null;
    hist = null;
    if (healthTimer) clearInterval(healthTimer);
    if (routePollTimer) clearInterval(routePollTimer);
    healthTimer = null;
    routePollTimer = null;
  });

  chrome.webContents.on("did-finish-load", () => {
    sendUiState();
    tickHealth();
  });
  hist.webContents.on("did-finish-load", () => sendHistory());

  surfaceMode = "home";
  place();
  healthTimer = setInterval(tickHealth, HEALTH_PING_MS);
  routePollTimer = setInterval(pollErpRoute, 750);
  syncE2eApi();
}

ipcMain.handle("get-config", () => ({
  erpBase: ERP_BASE,
  repo: "https://github.com/5zorro/erpnext-ui-app",
  version: APP_VERSION,
  feedbackFormUrl: resolveFeedbackFormUrl(process.env),
  updateStub: "Shell updates: ask IT / see README (no auto-update until packaged).",
  navDebugLogPath: app.isReady() ? navDebugLogPath() : "",
  navIncidentLogPath: app.isReady() ? navIncidentLogPath() : "",
  focusDebugLogPath: app.isReady() ? focusDebugLogPath() : "",
  focusIncidentLogPath: app.isReady() ? focusIncidentLogPath() : "",
}));

ipcMain.handle("get-diagnose", () => diagnoseSnapshot());

ipcMain.handle("copy-diagnose", () => {
  const snap = diagnoseSnapshot();
  clipboard.writeText(snap.copyText || "");
  return { ok: true };
});

/**
 * IT recovery setup wizard (notify HTTPS form vs autofix absolute script).
 * Never invents a default script path.
 */
ipcMain.handle("health-remediation-setup", async () => {
  const parent = win && !win.isDestroyed() ? win : undefined;
  const { response } = await dialog.showMessageBox(parent, {
    type: "question",
    buttons: ["Notify IT (HTTPS form)", "Autofix (pick script)", "Clear settings", "Cancel"],
    defaultId: 0,
    cancelId: 3,
    title: "IT recovery settings",
    message: "How should this PC handle ERP unreachable?",
    detail:
      "Notify opens an https:// form (e.g. Google Form).\n" +
      "Autofix runs only a script you pick on this PC — clones ship with none (security).\n" +
      "See docs/erp-unreachable.md.",
  });
  if (response === 3) return { ok: true, action: "cancel" };
  if (response === 2) {
    const applied = applyRemediationSetup(healthRemediation, { mode: "unset" });
    healthRemediation = applied.prefs;
    saveHealthRemediation();
    return { ok: true, action: "cleared", message: "Recovery settings cleared." };
  }
  if (response === 0) {
    const { response: urlBox } = await dialog.showMessageBox(parent, {
      type: "question",
      buttons: ["Save URL from clipboard", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      title: "Notify form URL",
      message: "Copy your https:// form URL, then Save.",
      detail:
        (healthRemediation.notifyUrl
          ? `Current: ${healthRemediation.notifyUrl}\n\n`
          : "") + "Clipboard must contain an https:// URL (Google Form, ticket intake, etc.).",
    });
    if (urlBox === 1) return { ok: true, action: "cancel" };
    const clip = clipboard.readText().trim();
    if (!isSafeNotifyUrl(clip)) {
      return {
        ok: false,
        message:
          "Clipboard is not a valid https:// URL. Copy the form link, then try Notify again.",
      };
    }
    const applied = applyRemediationSetup(healthRemediation, {
      mode: "notify",
      notifyUrl: clip,
    });
    if (!applied.ok) return { ok: false, message: applied.reason };
    healthRemediation = applied.prefs;
    saveHealthRemediation();
    return { ok: true, action: "notify", message: "Notify IT saved (HTTPS form from clipboard)." };
  }
  const picked = await dialog.showOpenDialog(parent, {
    title: "Choose IT autofix script (absolute path)",
    properties: ["openFile"],
    filters: [
      { name: "Scripts", extensions: ["sh", "bash", "bat", "cmd", "ps1"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (picked.canceled || !picked.filePaths || !picked.filePaths[0]) {
    return { ok: true, action: "cancel" };
  }
  const scriptPath = picked.filePaths[0];
  if (!isAllowedAutofixScriptPath(scriptPath)) {
    return { ok: false, message: "That path is not allowed (need an absolute path)." };
  }
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, message: "File does not exist." };
  }
  const applied = applyRemediationSetup(healthRemediation, {
    mode: "autofix",
    autofixScriptPath: scriptPath,
  });
  if (!applied.ok) return { ok: false, message: applied.reason };
  healthRemediation = applied.prefs;
  saveHealthRemediation();
  return {
    ok: true,
    action: "autofix",
    message: `Autofix saved. Start ERPNext will run:\n${scriptPath}`,
  };
});

ipcMain.handle("health-remediation-notify", async () => {
  const prefs = normalizeHealthRemediationPrefs(healthRemediation);
  if (prefs.mode !== "notify" || !isSafeNotifyUrl(prefs.notifyUrl)) {
    return { ok: false, message: "Notify is not configured. Use Set up first." };
  }
  await shell.openExternal(prefs.notifyUrl);
  return { ok: true, action: "opened" };
});

ipcMain.handle("health-remediation-autofix", async () => {
  const prefs = normalizeHealthRemediationPrefs(healthRemediation);
  if (!autofixReady(prefs)) {
    return {
      ok: false,
      message: "Autofix is not configured. Use Set up and pick an absolute script path.",
    };
  }
  const scriptPath = prefs.autofixScriptPath;
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, message: `Script missing:\n${scriptPath}` };
  }
  const parent = win && !win.isDestroyed() ? win : undefined;
  const { response } = await dialog.showMessageBox(parent, {
    type: "warning",
    buttons: ["Run script", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Start ERPNext?",
    message: "Run the IT-configured recovery script?",
    detail: scriptPath,
  });
  if (response !== 0) return { ok: true, action: "cancel" };

  return await new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn(scriptPath, [], { shell: false, windowsHide: true })
      : spawn("/bin/bash", [scriptPath], { shell: false });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });
    child.on("error", (err) => {
      resolve({ ok: false, message: String(err && err.message ? err.message : err) });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          ok: true,
          action: "ran",
          message: "Script finished (exit 0). Re-check the DB light in a few seconds.",
        });
      } else {
        resolve({
          ok: false,
          message: `Script exited ${code}.${stderr ? `\n${stderr}` : ""}`,
        });
      }
    });
  });
});

ipcMain.on("calc-history-append", (_e, raw) => {
  noteCalcHistoryAppend(raw);
});

ipcMain.handle("calc-history-list", () => {
  calcHistory = pruneCalcHistory(calcHistory);
  return calcHistory.map((e) => ({ ...e }));
});

ipcMain.handle("calc-history-copy", (_e, id, mode) => {
  calcHistory = pruneCalcHistory(calcHistory);
  const entry = findCalcHistoryEntry(calcHistory, id);
  if (!entry) return { ok: false, reason: "Not found" };
  const text =
    mode === "total" ? formatCalcCopyTotal(entry) : formatCalcCopyTable(entry);
  if (!text) return { ok: false, reason: "Empty" };
  clipboard.writeText(text);
  return { ok: true, text };
});

ipcMain.handle("history-copy-ref", (_e, text) => {
  const ref = text != null ? String(text).trim() : "";
  if (!ref) return { ok: false, reason: "Nothing to copy" };
  clipboard.writeText(ref);
  navDebug("hist-copy-ref", ref.slice(0, 80));
  return { ok: true, text: ref };
});

ipcMain.on("open-diagnose", () => openDiagnoseDropdown());
ipcMain.on("diagnose-dropdown-close", () => closeDiagnoseDropdown());
ipcMain.on("diagnose-dropdown-ready", (e) => {
  if (diagnoseWin && !diagnoseWin.isDestroyed() && e.sender === diagnoseWin.webContents) {
    e.sender.send("diagnose-data", diagnoseSnapshot());
  }
});

ipcMain.on("open-calc-history", (_e, anchor) => {
  openCalcHistoryDropdown(anchor && typeof anchor === "object" ? anchor : {});
});
ipcMain.on("calc-history-dropdown-close", () => closeCalcHistoryDropdown());
ipcMain.on("calc-history-dropdown-ready", (e) => {
  if (calcHistoryWin && !calcHistoryWin.isDestroyed() && e.sender === calcHistoryWin.webContents) {
    e.sender.send("calc-history-data", calcHistoryPayload());
  }
});

ipcMain.on("open-nav-incident", () => openNavIncidentDialog());
ipcMain.on("nav-incident-close", () => closeNavIncidentDialog());
ipcMain.on("nav-incident-ready", (e) => {
  if (navIncidentWin && !navIncidentWin.isDestroyed() && e.sender === navIncidentWin.webContents) {
    e.sender.send("nav-incident-data", navIncidentPayload());
  }
});
ipcMain.handle("nav-incident-submit", (_e, note) => {
  const frozen = navIncidentDraft || collectNavIncidentContext();
  const incident = buildNavIncident(frozen, note, new Date().toISOString());
  if (!incident) {
    return { ok: false, reason: "Write a short note — empty reports are skipped." };
  }
  const file = navIncidentLogPath();
  try {
    fs.appendFileSync(file, serializeNavIncidentLine(incident), { encoding: "utf8" });
  } catch (err) {
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
  navIncidentRing = appendNavIncident(navIncidentRing, incident);
  navDebug("user-incident", incident.note.slice(0, 180));
  navIncidentDraft = null;
  return { ok: true, path: file, at: incident.at };
});

ipcMain.on("open-focus-incident", () => openFocusIncidentDialog());
ipcMain.on("focus-incident-close", () => closeFocusIncidentDialog());
ipcMain.on("focus-incident-ready", (e) => {
  if (focusIncidentWin && !focusIncidentWin.isDestroyed() && e.sender === focusIncidentWin.webContents) {
    e.sender.send("focus-incident-data", focusIncidentPayload());
  }
});
ipcMain.handle("focus-incident-submit", (_e, note) => {
  const frozen = focusIncidentDraft || collectFocusIncidentContext();
  const incident = buildFocusIncident(frozen, note, new Date().toISOString());
  if (!incident) {
    return { ok: false, reason: "Write a short note — empty reports are skipped." };
  }
  const file = focusIncidentLogPath();
  try {
    fs.appendFileSync(file, serializeFocusIncidentLine(incident), { encoding: "utf8" });
  } catch (err) {
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
  focusIncidentRing = appendFocusIncident(focusIncidentRing, incident);
  focusDebug("user-focus-incident", incident.note.slice(0, 180), { surface: "main" });
  focusIncidentDraft = null;
  return { ok: true, path: file, at: incident.at };
});

ipcMain.on("focus-debug", (e, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  let surface = p.surface != null ? String(p.surface) : "";
  if (!surface) {
    if (bill && !bill.webContents.isDestroyed() && e.sender === bill.webContents) surface = "bill";
    else if (docForm && !docForm.webContents.isDestroyed() && e.sender === docForm.webContents) {
      surface = "doc-form";
    }
  }
  focusDebug(p.event || "focus", p.detail != null ? String(p.detail) : "", {
    surface,
    active: p.active && typeof p.active === "object" ? p.active : null,
  });
});

ipcMain.handle("open-feedback", async () => {
  try {
    const base = resolveFeedbackFormUrl(process.env);
    const url = buildFeedbackUrl(base, {
      version: APP_VERSION,
      hostClass: classifyHostClass(ERP_BASE),
    });
    if (!win || win.isDestroyed()) {
      await shell.openExternal(url);
      return { ok: true, placeholder: isPlaceholderFeedbackUrl(base), url };
    }
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Open in browser", "Copy link", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      title: "Feedback",
      message: isPlaceholderFeedbackUrl(base)
        ? "Feedback form (placeholder — set FEEDBACK_FORM_URL for your real form)"
        : "Send feedback via Google Form?",
      detail: url,
    });
    if (response === 0) {
      await shell.openExternal(url);
      return { ok: true, action: "open", placeholder: isPlaceholderFeedbackUrl(base), url };
    }
    if (response === 1) {
      clipboard.writeText(url);
      return { ok: true, action: "copy", placeholder: isPlaceholderFeedbackUrl(base), url };
    }
    return { ok: true, action: "cancel", url };
  } catch (e) {
    const reason = String(e && e.message ? e.message : e);
    if (win && !win.isDestroyed()) {
      await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["OK"],
        title: "Could not open Feedback",
        message: "Something went wrong opening the feedback form.",
        detail: reason,
      });
    }
    return { ok: false, reason };
  }
});

ipcMain.handle("bill-get-snapshot", async () => snapshotBill());
ipcMain.handle("bill-retry-load", async () => {
  if (billLoadPhase === BILL_LOAD_LOADING) {
    billLoadGen += 1;
  }
  billLoadPhase = BILL_LOAD_FAILED;
  await showBill(currentRoute.includes("purchase-invoice") ? currentRoute : "/app/purchase-invoice/new", {
    skipDirtyGate: true,
  });
  return { ok: true };
});

function headerValueUnchanged(field, next) {
  const kind = dirtyCompareKindForField(field);
  const doc = dirtyState.doc;
  if (field === "is_paid" || field === "is_return") {
    const prev = doc ? doc[field] : 0;
    const a = prev === true || prev === 1 || prev === "1" ? 1 : 0;
    const b = next === true || next === 1 || next === "1" ? 1 : 0;
    return a === b;
  }
  const prev = doc ? doc[field] : undefined;
  if (valuesMeaningfullyEqual(prev, next, { kind })) return true;
  // Vendor input shows supplier_name; ERP key is supplier — either match is a no-op.
  if (field === "supplier" && doc) {
    if (valuesMeaningfullyEqual(doc.supplier_name, next, { kind })) return true;
    if (valuesMeaningfullyEqual(doc.supplier, next, { kind })) return true;
  }
  return false;
}

ipcMain.handle("bill-set-header", async (_e, field, value) => {
  if (typeof field !== "string" || !field || field.startsWith("__")) {
    return { ok: false, reason: "Invalid field" };
  }
  if (!isWritableBillHeaderField(field)) {
    return { ok: false, reason: "Field not writable on Doc Bill" };
  }
  const kind = dirtyCompareKindForField(field);
  let next;
  if (field === "is_paid" || field === "is_return") {
    next = value === true || value === 1 || value === "1" ? "1" : "0";
  } else if (kind === "number") {
    next = value == null ? "" : String(value);
  } else {
    next = normalizeEditableText(value);
  }
  if (headerValueUnchanged(field, next)) {
    return {
      ok: true,
      doc: dirtyState.doc,
      skipped: true,
      // Still open source modal after an explicit vendor pick (click/Enter/Tab).
      openSourcePicker: field === "supplier",
      supplier: next,
    };
  }
  const raw = await bridgeCall("setHeader", field, next);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
    if (raw.paymentTermsSettle) {
      navDebug("bill-due-date-settle", formatDueDateSettleLog(raw.paymentTermsSettle));
    }
    if (field === "supplier") {
      const snap = raw.supplierSnapshot;
      const last =
        (snap && snap.last) ||
        (snap && snap.timing && snap.timing.length ? snap.timing[snap.timing.length - 1] : null);
      focusDebug(
        "bridge-supplier-wait",
        last
          ? `${last.event}${last.field ? `:${last.field}` : ""}${last.remaining != null ? `@${last.remaining}ms` : ""}`
          : snap && snap.ok
            ? "ok"
            : "timeout",
        { surface: "main" },
      );
      return { ...raw, openSourcePicker: true, supplier: next };
    }
  }
  return raw;
});

ipcMain.handle("bill-check-ref", async (_e, billNo, opts) => checkBillRef(billNo, opts));
ipcMain.handle("bill-prefetch-vendor-refs", async (_e, supplier) =>
  prefetchVendorBillRefs(supplier),
);

ipcMain.handle("bill-set-amount-due", async (_e, value, markEdited) => {
  const next = value == null ? "" : String(value);
  amountDueScratch = next;
  if (
    markEdited &&
    !valuesMeaningfullyEqual(amountDueCommitted, next, { kind: "number" })
  ) {
    amountDueCommitted = next;
    dirtyState = markUserEdited({ ...dirtyState, isDirty: true });
  }
  return { ok: true, amountDue: amountDueScratch };
});

/**
 * One ERP get_list per source slice — separate erpEval so renderer can stream categories.
 * Deliberately uncached, unlike vendorRecentRefsCache: `per_billed` is live server state
 * that any bill anywhere can change, so a stale cache here risks showing an already-fully-
 * billed PO/PR as available (double-billing), not just a stale UI hint.
 * TODO: research how concurrent users updating Bills might invalidate a cache here (e.g.
 * another open window/session merging against the same PO). Not an issue today — doc skin
 * mostly targets small firms with a single AP clerk — but revisit before caching this if
 * multi-user use becomes real.
 * @param {string} supplier
 * @param {string} sliceId
 */
async function fetchBillSourceSlice(supplier, sliceId) {
  const sup = normalizeEditableText(supplier);
  if (!sup) return { ok: false, reason: "No vendor", rows: [] };

  /** @type {{ doctype: string, filters: object, fields: string[], order_by: string, limit: number } | null} */
  let spec = null;
  if (sliceId === "po_submitted") {
    spec = {
      doctype: "Purchase Order",
      filters: { supplier: sup, docstatus: 1, per_billed: ["<", 100] },
      fields: ["name", "title", "transaction_date", "grand_total"],
      order_by: "transaction_date desc",
      limit: 50,
    };
  } else if (sliceId === "pr_submitted") {
    spec = {
      doctype: "Purchase Receipt",
      filters: { supplier: sup, docstatus: 1, per_billed: ["<", 100] },
      fields: ["name", "posting_date", "grand_total"],
      order_by: "posting_date desc",
      limit: 50,
    };
  } else if (sliceId === "po_draft") {
    spec = {
      doctype: "Purchase Order",
      filters: { supplier: sup, docstatus: 0 },
      fields: ["name", "title", "transaction_date", "grand_total"],
      order_by: "transaction_date desc",
      limit: 20,
    };
  } else if (sliceId === "pr_draft") {
    spec = {
      doctype: "Purchase Receipt",
      filters: { supplier: sup, docstatus: 0 },
      fields: ["name", "posting_date", "grand_total"],
      order_by: "posting_date desc",
      limit: 20,
    };
  }
  if (!spec) return { ok: false, reason: "Invalid source slice", rows: [] };

  const raw = await erpEval(
    `(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, reason: "ERP Desk not ready" };
      }
      var rows = await frappe.db.get_list(${JSON.stringify(spec.doctype)}, {
        filters: ${JSON.stringify(spec.filters)},
        fields: ${JSON.stringify(spec.fields)},
        order_by: ${JSON.stringify(spec.order_by)},
        limit: ${spec.limit},
      });
      return { ok: true, rows: rows || [] };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`,
    "listSources",
  );
  if (!raw || !raw.ok) {
    return { ok: false, reason: (raw && raw.reason) || "Could not list sources", rows: [] };
  }
  return { ok: true, rows: raw.rows || [] };
}

ipcMain.handle("bill-list-source-slice", async (_e, supplier, sliceId) => {
  const raw = await fetchBillSourceSlice(supplier, sliceId);
  if (!raw.ok) return raw;
  const group = buildSourceGroupFromSliceRows(sliceId, raw.rows || []);
  return { ok: true, rows: raw.rows || [], group: group || null };
});

ipcMain.handle("bill-list-sources", async (_e, supplier) => {
  const sup = normalizeEditableText(supplier);
  if (!sup) return { ok: false, reason: "No vendor", groups: [] };
  const sliceResults = await Promise.all(
    SOURCE_LIST_SLICE_ORDER.map(async (sliceId) => {
      const raw = await fetchBillSourceSlice(sup, sliceId);
      return { sliceId, raw };
    }),
  );
  let groups = buildBillSourceLoadingGroups().filter((g) => g.id === "nic");
  /** @type {string[]} */
  const errors = [];
  for (const { sliceId, raw } of sliceResults) {
    if (!raw.ok) {
      errors.push(raw.reason || sliceId);
      continue;
    }
    const group = buildSourceGroupFromSliceRows(sliceId, raw.rows || []);
    if (group) groups = applySourceSliceToGroups(groups, group);
  }
  if (errors.length === sliceResults.length) {
    return { ok: false, reason: errors[0] || "Could not list sources", groups: [] };
  }
  return { ok: true, groups };
});

ipcMain.handle("bill-merge-source", async (_e, kind, name) => {
  if (kind !== "po" && kind !== "pr") {
    return { ok: false, reason: "Invalid source kind" };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, reason: "Source name required" };
  }
  return mergeBillSources([{ kind, name: name.trim() }]);
});

/**
 * Map one or more PO/PR into the open Bill (items concatenated; headers from first).
 * @param {Array<{ kind?: string, name?: string }>} items
 */
async function mergeBillSources(items) {
  const list = Array.isArray(items)
    ? items.filter((it) => it && (it.kind === "po" || it.kind === "pr") && typeof it.name === "string" && it.name.trim())
    : [];
  if (!list.length) return { ok: false, reason: "No sources to merge." };
  await ensureErpFormBridge();
  /** @type {object[]} */
  const mappedDocs = [];
  for (const it of list) {
    const method =
      it.kind === "po"
        ? "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice"
        : "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice";
    const nm = String(it.name).trim();
    const mapped = await erpEval(`(async () => {
      try {
        var r = await frappe.call({
          method: ${JSON.stringify(method)},
          args: { source_name: ${JSON.stringify(nm)} },
        });
        return { ok: true, src: r && r.message };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })()`);
    if (!mapped || !mapped.ok || !mapped.src) {
      return {
        ok: false,
        reason: (mapped && mapped.reason) || `Could not map ${it.kind} ${nm}.`,
      };
    }
    mappedDocs.push(mapped.src);
  }
  const combined = combineMappedBillSources(mappedDocs);
  if (!combined) {
    return { ok: false, reason: "Mapped sources had no item lines." };
  }
  // No party in the plan: this Bill already carries the vendor the clerk picked, and the
  // source list is vendor-scoped, so re-setting it would only re-run the fetch chain.
  const raw = await bridgeCall("mergeFromMapped", combined, planMappedHeaderApply(combined));
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
    if (raw.paymentTermsSettle) {
      navDebug("bill-due-date-settle", formatDueDateSettleLog(raw.paymentTermsSettle));
    }
    await waitForErpAjaxQuiet();
    const extras = await enrichBillSnapshotExtras(raw.doc);
    return {
      ...raw,
      ...extras,
      amountDue: amountDueScratch,
      userEdited: !!dirtyState.userEdited,
    };
  }
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "Merge failed." };
}

ipcMain.handle("bill-merge-sources", async (_e, items) => mergeBillSources(items));

/**
 * Create a credit memo (AP return / debit note) against a submitted Bill — OI-082.
 * Prefers ERPNext's own `make_debit_note` mapper over a freeform is_return flip: that native
 * path sets `return_against` and carries the source items' po_detail/pr_detail links through,
 * which is exactly what the 2026-09-06 dogfood showed a freeform return silently gets wrong
 * (GL posts to an accrual placeholder account with no error — see museum OI-147).
 * @param {string} sourceBillName
 */
async function createCreditMemoFrom(sourceBillName) {
  const nm = typeof sourceBillName === "string" ? sourceBillName.trim() : "";
  if (!nm) return { ok: false, reason: "Source Bill name required." };
  await ensureErpFormBridge();
  const mapped = await erpEval(`(async () => {
    try {
      var r = await frappe.call({
        method: "erpnext.accounts.doctype.purchase_invoice.purchase_invoice.make_debit_note",
        args: { source_name: ${JSON.stringify(nm)} },
      });
      return { ok: true, src: r && r.message };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (!mapped || !mapped.ok || !mapped.src) {
    return {
      ok: false,
      reason: (mapped && mapped.reason) || `Could not create a credit memo against ${nm}.`,
    };
  }
  const combined = combineMappedBillSources([mapped.src]);
  if (!combined) {
    return { ok: false, reason: "Credit memo had no item lines." };
  }
  cancelBillEnrichBackground("bill-create-credit-memo");
  dirtyState = { isDirty: false, isNew: true, userEdited: false, baselineJson: null, doc: null };
  amountDueScratch = "";
  amountDueCommitted = "";
  await showBill("/app/purchase-invoice/new", { skipDirtyGate: true });
  // The form we just navigated to is a blank Purchase Invoice — it has no vendor, so the
  // mapped doc's supplier has to be applied here or the credit memo comes out with the vendor
  // the clerk picked a moment ago missing (5zorro dogfood 2026-09-09). Party fields go through
  // set_value so credit_to / currency / taxes / addresses / payment terms come with it.
  const creditPlan = planMappedHeaderApply(combined, { applyParty: true, current: {} });
  // A credit memo carries its **own** Ref No — the vendor's credit note number, which the clerk
  // has not typed yet. The returned Bill's supplier invoice number is a fact about a different
  // document, so it goes in the notes rather than pre-filling that field with a wrong answer
  // (5zorro 2026-09-09). bill_no is out of the copy list; this is where it lands instead.
  const refNote = withBillRefToken("", combined.bill_no);
  if (refNote) creditPlan.copy.push({ field: "remarks", value: refNote });
  const raw = await bridgeCall("mergeFromMapped", combined, creditPlan);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
    await waitForErpAjaxQuiet();
    const extras = await enrichBillSnapshotExtras(raw.doc);
    return {
      ...raw,
      ...extras,
      amountDue: amountDueScratch,
      userEdited: !!dirtyState.userEdited,
    };
  }
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "Credit memo merge failed." };
}

ipcMain.handle("bill-create-credit-memo", async (_e, sourceBillName) =>
  createCreditMemoFrom(sourceBillName),
);

ipcMain.handle("bill-so-picker-list", async (_e, payload) => {
  const supplier = normalizeEditableText(payload && payload.supplier);
  if (!supplier) return { ok: false, reason: "Pick a vendor first.", orders: [] };
  const customer =
    payload && payload.customer != null ? normalizeEditableText(payload.customer) : "";
  const billLines = Array.isArray(payload && payload.billLines) ? payload.billLines : [];

  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, reason: "ERP Desk not ready" };
      }
      /** @type {Record<string, unknown>[]} */
      var filters = [["docstatus", "in", [0, 1]]];
      if (${JSON.stringify(customer)}) {
        filters.push(["customer", "=", ${JSON.stringify(customer)}]);
      }
      var sos = await frappe.db.get_list("Sales Order", {
        filters: filters,
        fields: [
          "name",
          "customer",
          "customer_name",
          "transaction_date",
          "delivery_date",
          "grand_total",
          "docstatus",
        ],
        order_by: "transaction_date desc",
        limit: 40,
      });
      var names = (sos || []).map(function (r) { return r.name; }).filter(Boolean);
      var itemsBySo = {};
      if (names.length && frappe.db.get_list) {
        var itemRows = await frappe.db.get_list("Sales Order Item", {
          filters: [["parent", "in", names]],
          fields: ["parent", "item_code", "qty", "rate", "amount"],
          limit: 500,
        });
        for (var i = 0; i < (itemRows || []).length; i++) {
          var row = itemRows[i];
          if (!row || !row.parent) continue;
          if (!itemsBySo[row.parent]) itemsBySo[row.parent] = [];
          itemsBySo[row.parent].push(row);
        }
      }
      var enriched = (sos || []).map(function (so) {
        return Object.assign({}, so, { items: itemsBySo[so.name] || [] });
      });
      return { ok: true, orders: enriched };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), orders: [] };
    }
  })()`);
  if (!raw || !raw.ok) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Could not list Sales Orders",
      orders: [],
    };
  }
  const ranked = rankSalesOrdersForBill(raw.orders || [], billLines);
  return { ok: true, orders: ranked, supplier, customer: customer || null };
});

ipcMain.handle("bill-so-bridge-po", async (_e, payload) => {
  const supplier = normalizeEditableText(payload && payload.supplier);
  const salesOrder = normalizeEditableText(payload && payload.salesOrder);
  if (!supplier) return { ok: false, reason: "Vendor required." };
  if (!salesOrder) return { ok: false, reason: "Sales Order required." };

  const supplierRef =
    payload && payload.supplierRef != null
      ? normalizeEditableText(payload.supplierRef)
      : normalizeEditableText(dirtyState.doc && dirtyState.doc.bill_no);
  const company =
    payload && payload.company
      ? normalizeEditableText(payload.company)
      : normalizeEditableText(dirtyState.doc && dirtyState.doc.company);
  const title = formatJitPoTitle(salesOrder, supplierRef);

  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db) {
        return { ok: false, reason: "ERP Desk not ready" };
      }
      var supplier = ${JSON.stringify(supplier)};
      var salesOrder = ${JSON.stringify(salesOrder)};
      var title = ${JSON.stringify(title)};
      var company = ${JSON.stringify(company || "")};

      var openPos = await frappe.db.get_list("Purchase Order", {
        filters: { supplier: supplier, docstatus: 1, per_billed: ["<", 100] },
        fields: ["name", "supplier", "per_billed", "docstatus", "title"],
        limit: 50,
      });
      var poNames = (openPos || []).map(function (p) { return p.name; }).filter(Boolean);
      var poItems = [];
      if (poNames.length) {
        poItems = await frappe.db.get_list("Purchase Order Item", {
          filters: [["parent", "in", poNames], ["sales_order", "=", salesOrder]],
          fields: ["parent", "sales_order"],
          limit: 50,
        });
      }
      var existing = null;
      var parents = {};
      for (var i = 0; i < (poItems || []).length; i++) {
        var it = poItems[i];
        if (it && it.parent) parents[it.parent] = true;
      }
      for (var j = 0; j < (openPos || []).length; j++) {
        var po = openPos[j];
        if (po && po.name && parents[po.name]) {
          existing = { name: po.name, title: po.title || "" };
          break;
        }
      }
      if (existing) {
        return { ok: true, poName: existing.name, title: existing.title, created: false };
      }

      var soDoc = await frappe.db.get_doc("Sales Order", salesOrder);
      if (!soDoc) return { ok: false, reason: "Sales Order not found." };
      if (Number(soDoc.docstatus) !== 1) {
        return { ok: false, reason: "Sales Order must be submitted." };
      }
      var co = company || soDoc.company;
      if (!co) return { ok: false, reason: "Company missing on Bill and Sales Order." };

      var today = frappe.datetime.get_today();
      var sched = frappe.datetime.add_days(today, 7);
      var po = frappe.model.get_new_doc("Purchase Order");
      po.supplier = supplier;
      po.company = co;
      po.transaction_date = today;
      po.schedule_date = sched;
      po.title = title;
      if (soDoc.customer) {
        po.customer = soDoc.customer;
        po.customer_name = soDoc.customer_name || soDoc.customer;
      }
      var lines = soDoc.items || [];
      for (var k = 0; k < lines.length; k++) {
        var line = lines[k];
        if (!line || !line.item_code) continue;
        var qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        var child = frappe.model.add_child(po, "items");
        child.item_code = line.item_code;
        child.qty = qty;
        child.schedule_date = sched;
        child.sales_order = salesOrder;
        if (line.name) child.sales_order_item = line.name;
        if (line.uom) child.uom = line.uom;
      }
      if (!po.items || !po.items.length) {
        return { ok: false, reason: "Sales Order has no lines to buy." };
      }

      var inserted = await frappe.call({ method: "frappe.client.insert", args: { doc: po } });
      var saved = inserted && inserted.message ? inserted.message : null;
      if (!saved || !saved.name) {
        return { ok: false, reason: "Could not create bridge Purchase Order." };
      }
      var submitted = await frappe.call({ method: "frappe.client.submit", args: { doc: saved } });
      var finalDoc = submitted && submitted.message ? submitted.message : saved;
      return {
        ok: true,
        poName: finalDoc.name,
        title: finalDoc.title || title,
        created: true,
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);

  if (!raw || !raw.ok || !raw.poName) {
    return { ok: false, reason: (raw && raw.reason) || "Could not bridge Sales Order to PO." };
  }
  return {
    ok: true,
    poName: raw.poName,
    title: raw.title || title,
    created: !!raw.created,
  };
});

ipcMain.handle("bill-list-projects", async (_e, customer) => {
  const cust = customer != null ? normalizeEditableText(customer) : "";
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, reason: "ERP Desk not ready", projects: [] };
      }
      var filters = [];
      if (${JSON.stringify(cust)}) {
        filters.push(["customer", "=", ${JSON.stringify(cust)}]);
      }
      var rows = await frappe.db.get_list("Project", {
        filters: filters.length ? filters : undefined,
        fields: ["name", "project_name", "customer", "customer_name", "status"],
        order_by: "modified desc",
        limit: 40,
      });
      return { ok: true, projects: rows || [] };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), projects: [] };
    }
  })()`);
  if (!raw || !raw.ok) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Could not list projects",
      projects: [],
    };
  }
  return { ok: true, projects: raw.projects || [] };
});

ipcMain.handle("bill-apply-line-allocation", async (_e, rowIndex, payload) => {
  const ri = Number(rowIndex);
  if (!Number.isInteger(ri) || ri < 0) {
    return { ok: false, reason: "Invalid row." };
  }
  await ensureErpFormBridge();
  await ensureErpMatchesShellRoute(currentRoute);

  const customer = normalizeEditableText(payload && payload.customer);
  const customerName =
    normalizeEditableText(payload && payload.customerName) || customer;
  const salesOrders = Array.isArray(payload && payload.salesOrders)
    ? payload.salesOrders.map((s) => normalizeEditableText(s)).filter(Boolean)
    : [];
  const project = normalizeEditableText(payload && payload.project);
  const supplier =
    normalizeEditableText(dirtyState.doc && dirtyState.doc.supplier) ||
    normalizeEditableText(payload && payload.supplier);
  const supplierRef = normalizeEditableText(dirtyState.doc && dirtyState.doc.bill_no);
  const company = normalizeEditableText(dirtyState.doc && dirtyState.doc.company);
  const line =
    dirtyState.doc && Array.isArray(dirtyState.doc.items)
      ? dirtyState.doc.items[ri]
      : null;

  if (project) {
    const pr = await setBillItemField(ri, "project", project);
    if (!pr || !pr.ok) {
      return { ok: false, reason: (pr && pr.reason) || "Could not set Project." };
    }
  }

  let bridgePo = "";
  if (salesOrders.length && supplier && line && line.item_code) {
    const qtyParts = splitQtyAcrossSalesOrders(Number(line.qty) || 0, salesOrders.length);
    const title = jitPoTitleForSalesOrders(salesOrders, supplierRef);
    const bridge = await erpEval(`(async () => {
      try {
        if (!window.frappe || !frappe.db) {
          return { ok: false, reason: "ERP Desk not ready" };
        }
        var supplier = ${JSON.stringify(supplier)};
        var sos = ${JSON.stringify(salesOrders)};
        var itemCode = ${JSON.stringify(String(line.item_code))};
        var qtyParts = ${JSON.stringify(qtyParts)};
        var rate = ${Number(line.rate) || 0};
        var title = ${JSON.stringify(title)};
        var company = ${JSON.stringify(company || "")};

        var soDoc = await frappe.db.get_doc("Sales Order", sos[0]);
        if (!soDoc) return { ok: false, reason: "Sales Order not found." };
        var co = company || soDoc.company;
        if (!co) return { ok: false, reason: "Company missing." };

        var today = frappe.datetime.get_today();
        var sched = frappe.datetime.add_days(today, 7);
        var po = frappe.model.get_new_doc("Purchase Order");
        po.supplier = supplier;
        po.company = co;
        po.transaction_date = today;
        po.schedule_date = sched;
        po.title = title;
        if (soDoc.customer) {
          po.customer = soDoc.customer;
          po.customer_name = soDoc.customer_name || soDoc.customer;
        }
        for (var si = 0; si < sos.length; si++) {
          var child = frappe.model.add_child(po, "items");
          child.item_code = itemCode;
          child.qty = qtyParts[si] || 1;
          child.schedule_date = sched;
          child.sales_order = sos[si];
          if (rate) child.rate = rate;
        }
        if (!po.items || !po.items.length) {
          return { ok: false, reason: "Could not build PO lines." };
        }
        var inserted = await frappe.call({ method: "frappe.client.insert", args: { doc: po } });
        var saved = inserted && inserted.message ? inserted.message : null;
        if (!saved || !saved.name) {
          return { ok: false, reason: "Could not create bridge Purchase Order." };
        }
        var submitted = await frappe.call({ method: "frappe.client.submit", args: { doc: saved } });
        var finalDoc = submitted && submitted.message ? submitted.message : saved;
        return { ok: true, poName: finalDoc.name, title: finalDoc.title || title };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })()`);
    if (bridge && bridge.ok && bridge.poName) {
      bridgePo = bridge.poName;
      const linkPo = await bridgeCall("setRow", ri, "purchase_order", bridgePo);
      if (linkPo && linkPo.ok) {
        dirtyState = markUserEdited({ ...dirtyState, doc: linkPo.doc, isDirty: true });
      }
    }
  }

  setBillLineAllocation(ri, {
    customer,
    customerName,
    salesOrders,
    bridgePo,
  });
  dirtyState = markUserEdited(dirtyState);

  const snap = await snapshotBill();
  return {
    ok: true,
    doc: snap.doc || dirtyState.doc,
    lineAllocations: snap.lineAllocations || getBillLineAllocations(),
    poLineMeta: snap.poLineMeta || getBillPoLineMeta(),
    bridgePo: bridgePo || undefined,
    amountDue: amountDueScratch,
    linkedPos: snap.linkedPos || [],
    linkedReceipts: snap.linkedReceipts || [],
    userEdited: !!dirtyState.userEdited,
    isNew: !!dirtyState.isNew,
  };
});

ipcMain.handle("bill-set-item", async (_e, rowIndex, field, value) =>
  setBillItemField(Number(rowIndex), field, value),
);
ipcMain.handle("bill-fetch-po-line-cap", async (_e, rowIndex) =>
  fetchBillPoLineCapForRow(Number(rowIndex)),
);
ipcMain.handle("bill-add-item", async () => addBillItem());
ipcMain.handle("bill-delete-item", async (_e, rowIndex) => deleteBillItem(Number(rowIndex)));
ipcMain.handle("bill-clear-all-qty", async () => {
  const raw = await bridgeCall("zeroAllQty");
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw;
});

ipcMain.handle("bill-set-tax", async (_e, rowIndex, field, value) => {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return { ok: false, reason: "Invalid tax row" };
  }
  if (!isEditableBillTaxField(field)) {
    return { ok: false, reason: "Tax field not editable on Bill" };
  }
  const kind = dirtyCompareKindForField(field);
  const next =
    kind === "number" ? (value == null ? "" : String(value)) : normalizeEditableText(value);
  const raw = await bridgeCall("setTaxRow", rowIndex, field, next);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw;
});

ipcMain.handle("bill-add-tax", async (_e, accountHead, taxAmount, description) => {
  dirtyState = markUserEdited(dirtyState);
  const raw = await bridgeCall(
    "addTaxRow",
    accountHead == null ? "" : String(accountHead),
    taxAmount,
    description == null ? "" : String(description),
  );
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "Add tax failed." };
});

ipcMain.handle("bill-delete-tax", async (_e, rowIndex) => {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return { ok: false, reason: "Invalid tax row" };
  }
  dirtyState = markUserEdited(dirtyState);
  const raw = await bridgeCall("deleteTaxRow", rowIndex);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw;
});

/** Applied Payment Entries for this Bill (OI-139). */
ipcMain.handle("bill-list-payments", async () => {
  const doc = dirtyState.doc;
  const name = doc && doc.name ? String(doc.name) : "";
  return listBillPaymentEntries(name);
});

/** Draft Payment Entry from submitted unpaid Bill (OI-139 Add payment). */
ipcMain.handle("bill-open-add-payment", async () => {
  const doc = dirtyState.doc;
  if (!doc || Number(doc.docstatus) !== 1) {
    return { ok: false, reason: "Bill must be submitted before adding a payment." };
  }
  const name = String(doc.name || "").trim();
  if (!name || isNewDocRecord(name)) {
    return { ok: false, reason: "Bill must be saved before adding a payment." };
  }
  if (!billCanAddPayment(doc)) {
    return { ok: false, reason: "Nothing outstanding — this Bill is already paid." };
  }
  const pe = await createDraftPaymentEntryForBill(name, {
    billNo: doc.bill_no,
    postingDate: doc.posting_date,
  });
  if (!(pe && pe.ok && pe.name)) {
    return {
      ok: false,
      reason: (pe && pe.reason) || "Could not create Payment Entry.",
    };
  }
  const route = `/app/payment-entry/${encodeURIComponent(pe.name)}`;
  parkDocSurfaceIfNeeded();
  await softPeekErp(route);
  navDebug("bill-add-payment", route);
  return { ok: true, route, name: pe.name };
});

/**
 * Address master rows for profile address pickers (OI-136 / tranche 6).
 */
async function listAddressesForProfile(profileId, doc, role) {
  const editable = doc && Number(doc.docstatus) === 0;
  const decision = docAddressPickerOpenDecision(doc, profileId, role, { editable });
  if (!decision.open) {
    return { ok: false, reason: decision.reason || "Cannot open address picker.", rows: [] };
  }
  const meta = decision.meta || addressRoleMeta(profileId, role);
  if (!meta || !meta.linkField) {
    return { ok: false, reason: "Unknown address role.", rows: [] };
  }
  const listParty = addressListParty(doc, meta);
  if (!listParty) {
    return { ok: false, reason: decision.reason || "Cannot list addresses for this party.", rows: [] };
  }
  const partyDoctype = listParty.partyDoctype;
  const partyName = listParty.partyName;
  const current = doc[meta.linkField] != null ? String(doc[meta.linkField]).trim() : "";
  const partyLit = JSON.stringify(partyName);
  const doctypeLit = JSON.stringify(partyDoctype);
  const raw = await erpEval(`(async () => {
    try {
      var partyName = ${partyLit};
      var linkDoctype = ${doctypeLit};
      var rows = await frappe.db.get_list("Address", {
        filters: [
          ["Dynamic Link", "link_doctype", "=", linkDoctype],
          ["Dynamic Link", "link_name", "=", partyName],
        ],
        fields: [
          "name",
          "address_title",
          "address_line1",
          "address_line2",
          "city",
          "state",
          "pincode",
          "country",
          "address_type",
          "is_primary_address",
          "is_shipping_address",
        ],
        limit: 50,
        order_by: "modified desc",
      });
      return { ok: true, rows: rows || [] };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), rows: [] };
    }
  })()`);
  if (!(raw && raw.ok)) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Could not list addresses.",
      rows: [],
      current: current || "",
      linkField: meta.linkField,
      title: meta.title,
    };
  }
  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .map((r) => projectAddressPickerOption(r))
    .filter((r) => r.name);
  return {
    ok: true,
    rows,
    current: current || "",
    linkField: meta.linkField,
    title: meta.title,
    label: meta.label,
  };
}

/**
 * Fetch freeform `terms` text from linked PO/PR source documents.
 * @param {Array<{ kind?: string, name?: string }>} refs
 */
async function fetchSourceTermsForRefs(refs) {
  const list = Array.isArray(refs)
    ? refs.filter((r) => r && (r.kind === "po" || r.kind === "pr") && typeof r.name === "string" && r.name.trim())
    : [];
  if (!list.length) return { ok: true, termsByKey: {} };
  const pairs = list.map((r) => ({
    key: `${r.kind}:${String(r.name).trim()}`,
    doctype: r.kind === "po" ? "Purchase Order" : "Purchase Receipt",
    name: String(r.name).trim(),
  }));
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_value) {
        return { ok: false, reason: "ERP Desk not ready" };
      }
      var pairs = ${JSON.stringify(pairs)};
      var termsByKey = {};
      var remarksByKey = {};
      for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i];
        try {
          var fields = p.doctype === "Purchase Receipt" ? ["terms", "remarks"] : ["terms"];
          var r = await frappe.db.get_value(p.doctype, p.name, fields);
          var m = r && (r.message || r);
          termsByKey[p.key] = m && m.terms != null ? String(m.terms) : "";
          if (p.doctype === "Purchase Receipt") {
            remarksByKey[p.key] = m && m.remarks != null ? String(m.remarks) : "";
          }
        } catch (e) {}
      }
      return { ok: true, termsByKey: termsByKey, remarksByKey: remarksByKey };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), termsByKey: {}, remarksByKey: {} };
    }
  })()`);
  if (!(raw && raw.ok)) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Could not load source terms.",
      termsByKey: {},
      remarksByKey: {},
    };
  }
  return {
    ok: true,
    termsByKey: raw.termsByKey || {},
    remarksByKey: raw.remarksByKey || {},
  };
}

ipcMain.handle("fetch-source-terms", async (_e, refs) => fetchSourceTermsForRefs(refs));

ipcMain.handle("bill-list-addresses", async (_e, role) =>
  listAddressesForProfile("bill", dirtyState.doc, role),
);

ipcMain.handle("doc-list-addresses", async (_e, role) => {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return { ok: false, reason: "No Doc form skin active.", rows: [] };
  }
  if (!profile.features.addressPicker) {
    return { ok: false, reason: "Address picker not enabled for this document.", rows: [] };
  }
  return listAddressesForProfile(profile.id, dirtyState.doc, role);
});

/**
 * Allocate a Taxes/Charges Add row into item costs + Deduct offset (OI-140).
 * Grand total unchanged.
 */
ipcMain.handle("bill-allocate-charge", async (_e, taxRowIndex, mode, custom) => {
  const doc = dirtyState.doc;
  if (!doc || Number(doc.docstatus) !== 0) {
    return { ok: false, reason: "Allocate to stock only on draft Bills." };
  }
  const ri = Number(taxRowIndex);
  if (!Number.isInteger(ri) || ri < 0) {
    return { ok: false, reason: "Invalid charge row." };
  }
  const tax = Array.isArray(doc.taxes) ? doc.taxes[ri] : null;
  if (!isAllocatableChargeRow(tax)) {
    return { ok: false, reason: "Select an Add charge with amount > 0." };
  }
  const items = (Array.isArray(doc.items) ? doc.items : []).map((it, i) => ({
    rowIndex: i,
    qty: it.qty,
    rate: it.rate,
    amount: it.amount,
    name: it.name,
    item_code: it.item_code,
  }));
  const plan = planChargeToStockAllocation({
    items,
    chargeAmount: Number(tax.tax_amount),
    mode: mode === "qty" || mode === "custom" ? mode : "amount",
    custom: Array.isArray(custom) ? custom : [],
    chargeAccount: tax.account_head,
    chargeDescription: tax.description || tax.account_head,
  });
  if (!plan.ok) {
    return { ok: false, reason: plan.reason || "Allocation failed." };
  }

  for (const u of plan.itemUpdates) {
    const setRes = await setBillItemField(u.rowIndex, "rate", String(u.nextRate));
    if (!(setRes && setRes.ok)) {
      return {
        ok: false,
        reason: (setRes && setRes.reason) || `Could not update item rate on line ${u.rowIndex + 1}.`,
      };
    }
  }

  const offset = plan.offsetTax;
  const addRes = await bridgeCall(
    "addTaxRow",
    offset.account_head,
    offset.tax_amount,
    offset.description,
    offset.add_deduct_tax,
  );
  if (!(addRes && addRes.ok)) {
    return {
      ok: false,
      reason:
        (addRes && addRes.reason) ||
        "Item costs updated, but offset Deduct charge failed — check Taxes and Charges.",
      doc: dirtyState.doc,
      partial: true,
    };
  }
  dirtyState = markUserEdited({ ...dirtyState, doc: addRes.doc, isDirty: true });
  return {
    ok: true,
    doc: addRes.doc,
    allocatedTotal: plan.allocatedTotal,
    remainder: plan.remainder,
  };
});

/** Soft path to Vanilla Landed Cost Voucher (native distribute). */
ipcMain.handle("bill-open-landed-cost", async () => {
  const route = "/app/landed-cost-voucher/new";
  currentRoute = route;
  lensPrefs = rememberLens(lensPrefs, "purchase-invoice", "vanilla");
  savePrefs();
  showErp(route, { forceLoad: true });
  return { ok: true, route };
});

/**
 * Attach files via Vanilla FileUploader (OI-005). ERP view must be visible —
 * Bill WebContents cannot host Frappe’s uploader DOM.
 */
ipcMain.handle("bill-attach-file", async () => {
  const doc = dirtyState.doc;
  if (!doc || !doc.name || String(doc.name).startsWith("new") || doc.name === "new") {
    return {
      ok: false,
      reason: "Save the Bill draft first — Vanilla needs a document name to attach files.",
    };
  }
  const route = `/app/purchase-invoice/${doc.name}`;
  currentRoute = route;
  lensPrefs = rememberLens(lensPrefs, "purchase-invoice", "vanilla");
  savePrefs();
  showErp(route, { forceLoad: true });
  // Wait for form, then open attach (museum bind.js Attach).
  await waitForPurchaseInvoice(15000);
  const opened = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f || !f.doc) return { ok: false, reason: "Vanilla form not ready." };
      if (f.attachments && typeof f.attachments.new_attachment === "function") {
        f.attachments.new_attachment();
        return { ok: true, reason: "Attach dialog opened in Vanilla." };
      }
      if (window.frappe && frappe.ui && frappe.ui.FileUploader) {
        new frappe.ui.FileUploader({ doctype: f.doctype, docname: f.doc.name });
        return { ok: true, reason: "Attach dialog opened in Vanilla." };
      }
      return { ok: false, reason: "No attach UI on this Desk build." };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  return opened && typeof opened === "object"
    ? opened
    : { ok: false, reason: "Could not open attach dialog." };
});

ipcMain.handle("bill-save", async (_e, opts) =>
  saveBillFromErp(opts && typeof opts === "object" ? opts : {}),
);

ipcMain.handle("bill-list-mandatory", async () => listBillMandatoryMissing());

/**
 * Set Vanilla list standard-filter values and refresh (full ERP list query).
 * @param {Record<string, string>} filters fieldname -> value
 */
async function setListStandardFilterValues(filters) {
  if (!filters || typeof filters !== "object") return { ok: true, applied: [] };
  const entries = Object.entries(filters).filter(
    ([, v]) => v != null && String(v).trim() !== "",
  );
  if (!entries.length) return { ok: true, applied: [] };
  const filtersLit = JSON.stringify(Object.fromEntries(entries));
  const raw = await erpEval(`(async () => {
    try {
      if (!window.cur_list || !cur_list.page) {
        return { ok: false, reason: "cur_list not ready" };
      }
      var filters = ${filtersLit};
      var dict = cur_list.page.fields_dict || {};
      var applied = [];
      for (var field in filters) {
        if (!Object.prototype.hasOwnProperty.call(filters, field)) continue;
        var val = filters[field];
        var df = dict[field];
        if (df && typeof df.set_value === "function") {
          await df.set_value(val);
          applied.push(field);
          continue;
        }
        var el = document.querySelector('.standard-filter-section [data-fieldname="' + field + '"] input')
          || document.querySelector('[data-fieldname="' + field + '"] input');
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          applied.push(field);
        }
      }
      if (cur_list.filter_area && typeof cur_list.filter_area.refresh === "function") {
        cur_list.filter_area.refresh();
      } else if (typeof cur_list.refresh === "function") {
        cur_list.refresh();
      }
      return { ok: true, applied: applied };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "set filters failed" };
}

/** Find Bills list in Vanilla (T3a / OI-056). Caller handles dirty commit first. */
ipcMain.handle("bill-find", async (_e, payload) => {
  const opts = payload && typeof payload === "object" ? payload : {};
  const billNo = String(opts.billNo ?? opts.bill_no ?? "").trim();
  const supplier = String(opts.supplier ?? "").trim();
  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  const route = "/app/purchase-invoice";
  // Same surface transition as toolbar/history Find — avoids Doc-skin hijack race (OI-127).
  showErp(route, { forceLoad: true, skipDirtyGate: true });
  const confirm = await waitForPurchaseInvoiceList(BILL_FIND_TIMEOUT_MS);
  sendUiState();
  syncE2eApi();
  if (!(confirm && confirm.ok)) {
    return {
      ok: false,
      reason: (confirm && confirm.reason) || "Could not open Bill list.",
    };
  }
  /** @type {Record<string, string>} */
  const filterPayload = {};
  if (billNo) filterPayload.bill_no = billNo;
  if (supplier) filterPayload.supplier = supplier;
  const focusField =
    billNo ? "bill_no" : supplier ? "supplier" : findListFocusField("purchase-invoice");
  const focusLabel = findListFocusLabel("purchase-invoice") || focusField;
  let focus = { ok: false };
  if (focusField) {
    const ready = await waitForListFilterField(focusField);
    if (!(ready && ready.ok)) {
      scheduleErpKeyboardFocus();
      return {
        ok: true,
        focusOk: false,
        focusField,
        prefilled: false,
        reason: `Bill list opened; ${focusLabel} filter not ready yet.`,
      };
    }
    await dismissOnboardingAndSettle();
    let prefilled = false;
    if (Object.keys(filterPayload).length) {
      for (const field of Object.keys(filterPayload)) {
        const fieldReady = await waitForListFilterField(field);
        if (!(fieldReady && fieldReady.ok)) {
          scheduleErpKeyboardFocus();
          return {
            ok: true,
            focusOk: false,
            focusField,
            prefilled: false,
            reason: `Bill list opened; ${field} filter not ready for prefill.`,
          };
        }
      }
      const applied = await setListStandardFilterValues(filterPayload);
      prefilled = !!(applied && applied.ok && applied.applied && applied.applied.length);
    }
    focus = await focusListStandardFilter(focusField);
    scheduleErpKeyboardFocus();
    if (!(focus && focus.ok)) {
      return {
        ok: true,
        focusOk: false,
        focusField,
        prefilled,
        reason: prefilled
          ? `Bill list filtered; could not focus ${focusLabel}.`
          : `Bill list opened; could not focus ${focusLabel}.`,
      };
    }
    return {
      ok: true,
      focusOk: true,
      focusField,
      prefilled,
      reason: prefilled ? "Bill list opened with Ref / vendor filters." : undefined,
    };
  }
  scheduleErpKeyboardFocus();
  return { ok: true, focusOk: false, focusField: "", prefilled: false };
});

/**
 * After Find IPC returns, Bill/doc chrome often steals OS keyboard focus.
 * Caller re-invokes this so native click + select run *after* that steal.
 */
ipcMain.handle("erp-refocus-list-filter", async (_e, fieldname) => {
  const field =
    typeof fieldname === "string" && fieldname.trim()
      ? fieldname.trim()
      : findListFocusField("purchase-invoice") || "bill_no";
  if (surfaceMode !== "erp") {
    return { ok: false, reason: "Not on Vanilla list surface." };
  }
  await dismissOnboardingAndSettle();
  const focus = await focusListStandardFilter(field);
  scheduleErpKeyboardFocus();
  return {
    ok: !!(focus && focus.ok),
    focusField: field,
    reason: focus && focus.ok ? undefined : (focus && focus.reason) || "refocus failed",
  };
});

/**
 * Focus a Vanilla list standard-filter input (e.g. bill_no = Supplier Invoice No.).
 * Native sendInputEvent click + select; brief focus keeper fights BODY blur race.
 * @param {string} fieldname
 */
async function focusListStandardFilter(fieldname) {
  if (!fieldname || !erp || erp.webContents.isDestroyed()) {
    return { ok: false, reason: "ERP view not ready" };
  }

  const locateJs = `(function(){
    var field = ${JSON.stringify(fieldname)};
    function inputForField() {
      try {
        if (!window.cur_list || !cur_list.page) return null;
        try {
          var pf = cur_list.page.page_form;
          if (pf && pf.length && pf.hasClass("hide")) pf.removeClass("hide");
        } catch (eHide) {}
        var dict = cur_list.page.fields_dict;
        var df = dict && dict[field];
        if (df) {
          var $in = null;
          if (df.$wrapper && df.$wrapper.length) {
            $in = df.$wrapper.find("input:not([type=hidden]), textarea").first();
          }
          if ((!$in || !$in.length) && df.$input && df.$input.length) $in = df.$input;
          if ($in && $in.length) return $in.get(0);
          if (df.input) return df.input;
        }
      } catch (e1) {}
      return document.querySelector('.standard-filter-section [data-fieldname="' + field + '"] input')
        || document.querySelector('[data-fieldname="' + field + '"] input')
        || document.querySelector('input[data-fieldname="' + field + '"]')
        || null;
    }
    var el = inputForField();
    if (!el) {
      return {
        ok: false,
        reason: "filter input not found",
        field: field,
        listReady: !!(window.cur_list && cur_list.page && cur_list.page.fields_dict),
        hasField: !!(window.cur_list && cur_list.page && cur_list.page.fields_dict
          && cur_list.page.fields_dict[field]),
      };
    }
    try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e2) {}
    var r = el.getBoundingClientRect();
    return {
      ok: true,
      field: field,
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
    };
  })()`;

  let loc;
  try {
    loc = await erp.webContents.executeJavaScript(locateJs);
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
  if (!(loc && loc.ok)) {
    return loc && typeof loc === "object" ? loc : { ok: false, reason: "filter input not found" };
  }

  blurNonErpWebContents();
  try {
    if (win && !win.isDestroyed()) win.focus();
    erp.webContents.focus();
  } catch {
    /* ignore */
  }

  const x = Math.max(1, Math.round(Number(loc.x) + Number(loc.width) / 2));
  const y = Math.max(1, Math.round(Number(loc.y) + Number(loc.height) / 2));
  try {
    erp.webContents.sendInputEvent({
      type: "mouseDown",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    erp.webContents.sendInputEvent({
      type: "mouseUp",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }

  let selectResult = null;
  try {
    selectResult = await erp.webContents.executeJavaScript(`(function(){
      var field = ${JSON.stringify(fieldname)};
      var el = document.querySelector('.standard-filter-section [data-fieldname="' + field + '"] input')
        || document.querySelector('[data-fieldname="' + field + '"] input')
        || document.querySelector('input[data-fieldname="' + field + '"]');
      if (!el) return { ok: false };
      try { el.focus({ preventScroll: true }); } catch (e1) { try { el.focus(); } catch (e2) {} }
      try { if (typeof el.select === "function") el.select(); } catch (e3) {}
      return {
        ok: document.activeElement === el,
        selected: !!(el.selectionStart === 0 && el.selectionEnd === (el.value || "").length),
      };
    })()`);
  } catch {
    /* non-fatal */
  }

  blurNonErpWebContents();
  try {
    erp.webContents.focus();
  } catch {
    /* ignore */
  }

  scheduleErpKeyboardFocus();
  await installFindFocusKeeper(fieldname);
  return {
    ok: true,
    field: fieldname,
    via: "sendInputEvent",
    selected: !!(selectResult && selectResult.selected),
  };
}

/** Coalesce double-clicks on New Bill while ERP load is in flight. */
let billNewInflight = null;

/** New Bill on Doc skin (T3a). Caller handles dirty commit first. */
ipcMain.handle("bill-new", async () => {
  if (billNewInflight) return billNewInflight;
  billNewInflight = (async () => {
    try {
      cancelBillEnrichBackground("bill-new");
      dirtyState = {
        isDirty: false,
        isNew: true,
        userEdited: false,
        baselineJson: null,
        doc: null,
      };
      amountDueScratch = "";
      amountDueCommitted = "";
      await showBill("/app/purchase-invoice/new", { skipDirtyGate: true });
      return { ok: true };
    } finally {
      billNewInflight = null;
    }
  })();
  return billNewInflight;
});

/** Wait until Vanilla URL is the print preview for this Bill. */
async function waitForPrintPreview(expectedName, timeoutMs = BILL_PRINT_TIMEOUT_MS) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    if (!erp || erp.webContents.isDestroyed()) {
      return { ok: false, reason: "ERP view not ready" };
    }
    last = erp.webContents.getURL() || "";
    if (/\/login/i.test(last)) {
      return { ok: false, reason: "Please log in on Vanilla skin, then try Print again." };
    }
    const classified = classifyPrintNavResult(last, expectedName, ERP_BASE);
    if (classified.ok) return classified;
    await sleep(150);
  }
  return classifyPrintNavResult(last, expectedName, ERP_BASE);
}

/**
 * Print: open Vanilla print preview as a real navigation (visible ERP surface + Recent).
 * Matches clerk expectation of "new tab" → print page (OI-058 dogfood 2026-07-21).
 */
ipcMain.handle("bill-print", async () => {
  const doc = dirtyState.doc;
  const name = doc && doc.name != null ? String(doc.name) : "";
  if (!name || isNewDocRecord(name)) {
    return {
      ok: false,
      reason: "Save the Bill draft first — print needs a document name.",
    };
  }

  const route = `/app/purchase-invoice/${encodeURIComponent(name)}`;
  const curUrl = erp && !erp.webContents.isDestroyed() ? erp.webContents.getURL() : "";
  const cur = routeInfo(curUrl, ERP_BASE);
  const alreadyOnBill =
    cur.doctype === "purchase-invoice" && cur.record === name && !isNewDocRecord(cur.record);

  if (!alreadyOnBill) {
    const target = erpUrl(ERP_BASE, route);
    await loadErpUrl(target);
  }

  const snap = await raceTimeout(
    waitForPurchaseInvoice(BILL_PRINT_TIMEOUT_MS),
    BILL_PRINT_TIMEOUT_MS + 1000,
    "Print form load",
  );
  if (!(snap && snap.ok && snap.doc)) {
    return {
      ok: false,
      reason: (snap && snap.reason) || "No form loaded.",
    };
  }
  const match = printFormMatchesBill(snap.doc, name);
  if (!match.ok) {
    return match;
  }

  const opened = await raceTimeout(
    erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      var want = ${JSON.stringify(name)};
      if (!f || !f.doc) return { ok: false, reason: "No form loaded." };
      if (f.doc.doctype !== "Purchase Invoice") {
        return { ok: false, reason: "Wrong form type (" + (f.doc.doctype || "?") + ")." };
      }
      if (String(f.doc.name) !== want) {
        return { ok: false, reason: "Vanilla is on a different Bill (" + f.doc.name + "), not " + want + "." };
      }
      if (typeof f.print_doc === "function") {
        f.print_doc();
        return { ok: true, reason: "Navigating to print preview…" };
      }
      if (window.frappe && frappe.ui && frappe.ui.get_print_settings) {
        frappe.ui.get_print_settings(false, function () {}, f.doc.doctype);
        return { ok: true, reason: "Opened print settings." };
      }
      return { ok: false, reason: "Print UI missing on this Desk build." };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`),
    BILL_PRINT_TIMEOUT_MS,
    "Print",
  );

  const started = normalizePrintIpcResult(opened);
  if (!started.ok) return started;

  // Show Vanilla so the print page is visible (Electron has no browser "new tab").
  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  surfaceMode = "erp";
  lensPrefs = rememberLens(lensPrefs, "purchase-invoice", "vanilla");
  savePrefs();
  place();
  sendUiState();
  syncE2eApi();
  try {
    if (erp && !erp.webContents.isDestroyed()) erp.webContents.focus();
    if (win && !win.isDestroyed()) win.focus();
  } catch {
    /* ignore */
  }

  const landed = await waitForPrintPreview(name, BILL_PRINT_TIMEOUT_MS);
  if (!(landed && landed.ok)) {
    return {
      ok: false,
      reason: (landed && landed.reason) || "Print preview did not open.",
    };
  }
  return { ok: true, reason: "Print preview opened." };
});

/**
 * Museum bind.js Revert: new → frappe.new_doc; else frm.reload_doc.
 * Resets Amount Due scratch to empty (user re-enters).
 */
ipcMain.handle("bill-revert-unsaved", async () => {
  const raw = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f) return { ok: false, reason: "No form." };
      if (f.is_new && f.is_new()) {
        try { f.doc.__unsaved = 0; } catch (e) {}
        try { frappe.model.clear_doc(f.doctype, f.doc.name); } catch (e) {}
        frappe.new_doc(f.doctype);
        await new Promise(function (r) { setTimeout(r, 250); });
        f = window.cur_frm;
        return {
          ok: true,
          isNew: true,
          doc: f && f.doc ? JSON.parse(JSON.stringify(f.doc)) : null,
        };
      }
      if (typeof f.reload_doc === "function") {
        await f.reload_doc();
        return {
          ok: true,
          isNew: !!(f.is_new && f.is_new()),
          doc: JSON.parse(JSON.stringify(f.doc)),
        };
      }
      return { ok: false, reason: "Cannot reload document." };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (!raw || !raw.ok) {
    return raw && typeof raw === "object"
      ? raw
      : { ok: false, reason: "Revert failed." };
  }
  // Revert clears Amount Due scratch — user re-enters after reload.
  amountDueScratch = "";
  amountDueCommitted = "";
  dirtyState = finishLensApply(
    {
      doc: raw.doc,
      isDirty: false,
      isNew: !!raw.isNew,
      userEdited: false,
      baselineJson: null,
    },
    true,
  );
  return {
    ok: true,
    isNew: !!raw.isNew,
    doc: raw.doc,
    amountDue: amountDueScratch,
  };
});

ipcMain.handle("bill-search-link", async (_e, doctype, txt, filters) => searchLink(doctype, txt, filters));
ipcMain.handle("bill-account-company-check", async () => listBillAccountCompanyMismatches());
ipcMain.on("bill-open-vanilla", () => {
  const route = currentRoute.includes("purchase-invoice")
    ? currentRoute
    : "/app/purchase-invoice/new";
  showErp(route, { forceLoad: true });
});

ipcMain.on("bill-open-vendor-add", () => {
  showErp("/app/supplier/new", { forceLoad: true });
});

ipcMain.handle("bill-open-supplier-form", async (_e, supplier) => {
  const name = normalizeEditableText(supplier);
  if (!name) {
    return { ok: false, reason: "No supplier name." };
  }
  // Desk route uses the document name as-is (spaces allowed in path segment encoding).
  showErp(`/app/supplier/${encodeURIComponent(name)}`, { forceLoad: true });
  return { ok: true, supplier: name };
});

ipcMain.on("bill-open-project-add", () => {
  showErp("/app/project/new", { forceLoad: true });
});

ipcMain.on("bill-open-payment-terms-add", () => {
  softPeekErp(PAYMENT_TERMS_TEMPLATE_NEW_ROUTE);
});

ipcMain.on("bill-focus-surface", () => {
  try {
    if (win && !win.isDestroyed()) win.focus();
    // Tranche 10: Bill UI lives in docForm; legacy bill view stays off-screen.
    const wc =
      activeDocSkin === "bill" && docForm && !docForm.webContents.isDestroyed()
        ? docForm.webContents
        : bill && !bill.webContents.isDestroyed()
          ? bill.webContents
          : null;
    focusDebug("bill-focus-surface", currentRoute || "", {
      surface: wc && docForm && wc === docForm.webContents ? "doc-form" : "bill-legacy",
    });
    if (wc) wc.focus();
  } catch {
    /* ignore */
  }
});

ipcMain.on("bill-resolve-nav-gate", (_e, token, proceed) => {
  if (activeNavGate && activeNavGate.token === token) {
    activeNavGate.settle(!!proceed);
  }
});

// --- T4 Doc form (PO / Item Receipt) IPC — shared shell, activeDocSkin selects profile ---

ipcMain.handle("doc-get-ui", () => {
  if (!activeDocSkin) return null;
  return docFormUiPayload(activeDocSkin);
});

ipcMain.handle("doc-get-snapshot", async () => snapshotDocForm());
ipcMain.handle("doc-retry-load", async () => {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return { ok: false, reason: "No Doc form skin active." };
  }
  if (profile.id === "bill") {
    if (billLoadPhase === BILL_LOAD_LOADING) {
      billLoadGen += 1;
    }
    billLoadPhase = BILL_LOAD_FAILED;
  }
  await showDocForm(
    /** @type {DocFormSkinId} */ (profile.id),
    currentRoute.includes(profile.doctypeKey) ? currentRoute : profile.newRoute,
    { skipDirtyGate: true },
  );
  return { ok: true };
});

ipcMain.handle("doc-set-header", async (_e, field, value) => {
  if (typeof field !== "string" || !field || field.startsWith("__")) {
    return { ok: false, reason: "Invalid field" };
  }
  const kind = dirtyCompareKindForField(field);
  const next =
    kind === "number" ? (value == null ? "" : String(value)) : normalizeEditableText(value);
  if (headerValueUnchanged(field, next)) {
    return {
      ok: true,
      doc: dirtyState.doc,
      skipped: true,
      openSourcePicker: field === "supplier" && activeDocSkin === "receipt",
      supplier: next,
      scratch: { dateExpected: dateExpectedScratch },
    };
  }
  const raw = await bridgeCall("setHeader", field, next);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
    if (field === "supplier" && activeDocSkin === "receipt") {
      return {
        ...raw,
        openSourcePicker: true,
        supplier: next,
        scratch: { dateExpected: dateExpectedScratch },
      };
    }
  }
  return raw && typeof raw === "object"
    ? { ...raw, scratch: { dateExpected: dateExpectedScratch } }
    : { ok: false, reason: "Set header failed." };
});

ipcMain.handle("doc-set-date-expected", async (_e, value) => {
  if (activeDocSkin !== "po") {
    return {
      ok: false,
      reason: "Date Expected is not used on this Doc form",
      scratch: { dateExpected: dateExpectedScratch },
      doc: dirtyState.doc,
    };
  }
  dateExpectedScratch = value == null ? "" : String(value);
  dirtyState = markUserEdited({ ...dirtyState, isDirty: true });
  // Explicit header edit: always re-stamp all Required By (OI-069 edge case).
  const stamped = await stampPoDateExpected({ force: true });
  if (!(stamped && stamped.ok)) {
    return {
      ok: false,
      reason: (stamped && stamped.reason) || "Could not stamp Required By on lines.",
      scratch: { dateExpected: dateExpectedScratch },
      doc: dirtyState.doc,
    };
  }
  return {
    ok: true,
    doc: dirtyState.doc,
    scratch: { dateExpected: dateExpectedScratch },
    stamped: stamped.stamped,
  };
});

function isEditableActiveDocItemField(field) {
  if (activeDocSkin === "po") return isEditablePoItemField(field);
  if (activeDocSkin === "receipt") return isEditableReceiptItemField(field);
  return false;
}

async function setDocItemField(rowIndex, field, value) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return { ok: false, reason: "Invalid row" };
  }
  if (!isEditableActiveDocItemField(field)) {
    return { ok: false, reason: "Field not editable on this Doc form" };
  }
  const kind = dirtyCompareKindForField(field);
  const next =
    kind === "number" ? (value == null ? "" : String(value)) : normalizeEditableText(value);
  const prev =
    dirtyState.doc &&
    Array.isArray(dirtyState.doc.items) &&
    dirtyState.doc.items[rowIndex]
      ? dirtyState.doc.items[rowIndex][field]
      : undefined;
  if (valuesMeaningfullyEqual(prev, next, { kind })) {
    return {
      ok: true,
      doc: dirtyState.doc,
      skipped: true,
      scratch: { dateExpected: dateExpectedScratch },
    };
  }
  const raw = await bridgeCall("setRow", rowIndex, field, next);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
    if (activeDocSkin === "po" && field === "schedule_date") {
      if (!shouldStampPoDateExpectedOnSave(raw.doc)) {
        dateExpectedScratch = "";
      }
    }
  }
  const scratch = { dateExpected: dateExpectedScratch };
  return raw && typeof raw === "object"
    ? { ...raw, scratch }
    : { ok: false, reason: "Update failed.", scratch };
}

ipcMain.handle("doc-set-item", async (_e, rowIndex, field, value) =>
  setDocItemField(Number(rowIndex), field, value),
);
ipcMain.handle("doc-add-item", async () => {
  const added = await addBillItem();
  if (!(added && added.ok)) return added;
  if (activeDocSkin === "po") {
    const stamped = await stampPoDateExpected();
    if (stamped && stamped.ok) {
      return {
        ...added,
        doc: dirtyState.doc,
        scratch: { dateExpected: dateExpectedScratch },
      };
    }
  }
  return {
    ...added,
    scratch: { dateExpected: dateExpectedScratch },
  };
});
ipcMain.handle("doc-delete-item", async (_e, rowIndex) => {
  const raw = await deleteBillItem(Number(rowIndex));
  return raw && typeof raw === "object"
    ? { ...raw, scratch: { dateExpected: dateExpectedScratch } }
    : raw;
});
ipcMain.handle("doc-clear-all-qty", async () => {
  const raw = await bridgeCall("zeroAllQty");
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw;
});

ipcMain.handle("doc-set-tax", async (_e, rowIndex, field, value) => {
  if (activeDocSkin !== "receipt") {
    return { ok: false, reason: "Taxes not used on this Doc form" };
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return { ok: false, reason: "Invalid tax row" };
  }
  if (!isEditableBillTaxField(field)) {
    return { ok: false, reason: "Tax field not editable" };
  }
  const kind = dirtyCompareKindForField(field);
  const next =
    kind === "number" ? (value == null ? "" : String(value)) : normalizeEditableText(value);
  const raw = await bridgeCall("setTaxRow", rowIndex, field, next);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw;
});

ipcMain.handle("doc-add-tax", async (_e, accountHead, taxAmount, description) => {
  if (activeDocSkin !== "receipt") {
    return { ok: false, reason: "Taxes not used on this Doc form" };
  }
  dirtyState = markUserEdited(dirtyState);
  const raw = await bridgeCall(
    "addTaxRow",
    accountHead == null ? "" : String(accountHead),
    taxAmount,
    description == null ? "" : String(description),
  );
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "Add tax failed." };
});

ipcMain.handle("doc-delete-tax", async (_e, rowIndex) => {
  if (activeDocSkin !== "receipt") {
    return { ok: false, reason: "Taxes not used on this Doc form" };
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return { ok: false, reason: "Invalid tax row" };
  }
  dirtyState = markUserEdited(dirtyState);
  const raw = await bridgeCall("deleteTaxRow", rowIndex);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw;
});

ipcMain.handle("doc-attach-file", async () => {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return { ok: false, reason: "No Doc form skin active." };
  }
  const doc = dirtyState.doc;
  if (!doc || !doc.name || String(doc.name).startsWith("new") || doc.name === "new") {
    return {
      ok: false,
      reason: `Save the ${profile.title} draft first — Vanilla needs a document name to attach files.`,
    };
  }
  const route = `/app/${profile.doctypeKey}/${doc.name}`;
  currentRoute = route;
  lensPrefs = rememberLens(lensPrefs, profile.doctypeKey, "vanilla");
  savePrefs();
  showErp(route, { forceLoad: true });
  await waitForDocForm(15000);
  const opened = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f || !f.doc) return { ok: false, reason: "Vanilla form not ready." };
      if (f.attachments && typeof f.attachments.new_attachment === "function") {
        f.attachments.new_attachment();
        return { ok: true, reason: "Attach dialog opened in Vanilla." };
      }
      if (window.frappe && frappe.ui && frappe.ui.FileUploader) {
        new frappe.ui.FileUploader({ doctype: f.doctype, docname: f.doc.name });
        return { ok: true, reason: "Attach dialog opened in Vanilla." };
      }
      return { ok: false, reason: "No attach UI on this Desk build." };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  return opened && typeof opened === "object"
    ? opened
    : { ok: false, reason: "Could not open attach dialog." };
});

/** Stamp PO Date Expected (or week-out default) onto line schedule_date.
 * @param {{ force?: boolean }} [opts] force=true when clerk explicitly sets Date Expected
 *   (must overwrite divergent Required By). Auto stamp-on-save skips when lines diverge.
 */
async function stampPoDateExpected(opts = {}) {
  if (activeDocSkin !== "po") {
    return { ok: true, doc: dirtyState.doc, stamped: 0 };
  }
  const force = !!opts.force;
  if (!force && !shouldStampPoDateExpectedOnSave(dirtyState.doc)) {
    dateExpectedScratch = "";
    return {
      ok: true,
      doc: dirtyState.doc,
      stamped: 0,
      scratch: { dateExpected: "" },
    };
  }
  const stampIso = resolvePoStampDate(dateExpectedScratch);
  if (!dateExpectedScratch) {
    // Keep scratch in sync with what we stamp so header shows the default.
    dateExpectedScratch = stampIso;
  }
  const indexes = poRowsNeedingScheduleStamp(dirtyState.doc, stampIso);
  let lastDoc = dirtyState.doc;
  for (const i of indexes) {
    const raw = await bridgeCall("setRow", i, "schedule_date", stampIso);
    if (raw && raw.ok) {
      lastDoc = raw.doc;
      dirtyState = { ...dirtyState, doc: raw.doc };
    } else {
      return {
        ok: false,
        reason: (raw && raw.reason) || `Could not set Required By on line ${i + 1}.`,
        doc: lastDoc,
        stamped: indexes.indexOf(i),
        scratch: { dateExpected: dateExpectedScratch },
      };
    }
  }
  return {
    ok: true,
    doc: lastDoc,
    stamped: indexes.length,
    scratch: { dateExpected: dateExpectedScratch },
  };
}

async function saveDocFormFromErp(opts = {}) {
  const submit = !!opts.submit;
  const stamped = await stampPoDateExpected();
  if (!(stamped && stamped.ok)) {
    return {
      ok: false,
      reason: (stamped && stamped.reason) || "Could not stamp Required By on lines.",
      scratch: { dateExpected: dateExpectedScratch },
    };
  }
  const raw = await raceTimeout(
    bridgeCall("saveDoc", submit ? "Submit" : "Save"),
    BILL_SAVE_TIMEOUT_MS,
    submit ? "Save & submit" : "Save draft",
  );
  if (raw && raw.ok) {
    dirtyState = {
      ...dirtyState,
      doc: raw.doc,
      userEdited: false,
      isDirty: false,
      baselineJson: captureBaseline(raw.doc),
    };
    const profile = activeDocProfile();
    if (profile) noteShelvedFromSave(profile.doctypeKey, raw.doc);
    // This save just changed what "recent refs for this vendor" means — drop the stale hint
    // cache instead of waiting out its TTL (raw.doc.bill_no is the ref that just got added).
    if (raw.doc && raw.doc.doctype === "Purchase Invoice") {
      invalidateVendorRecentRefsCache(raw.doc.supplier);
    }
  }
  return raw && typeof raw === "object"
    ? { ...raw, scratch: { dateExpected: dateExpectedScratch } }
    : { ok: false, reason: "Save failed." };
}

ipcMain.handle("doc-save", async (_e, opts) =>
  saveDocFormFromErp(opts && typeof opts === "object" ? opts : {}),
);

ipcMain.handle("doc-list-mandatory", async () => {
  const profile = activeDocProfile();
  const doctype = profile && profile.shell === "doc-form" ? profile.doctype : null;
  if (!doctype) {
    return { ok: false, blockers: [], reason: "No Doc form skin active." };
  }
  // Stamp Required By before ERP mandatory scan so Date Expected clears the gate.
  if (activeDocSkin === "po") {
    const stamped = await stampPoDateExpected();
    if (!(stamped && stamped.ok)) {
      return {
        ok: false,
        blockers: [(stamped && stamped.reason) || "Could not stamp Required By on lines."],
        reason: stamped && stamped.reason,
      };
    }
  }
  const raw = await bridgeCall("listMandatoryMissing", doctype);
  if (!raw || typeof raw !== "object") {
    return { ok: false, blockers: [], reason: "Could not read ERP mandatory fields." };
  }
  return {
    ok: raw.ok !== false,
    blockers: Array.isArray(raw.blockers) ? raw.blockers : [],
    reason: raw.reason,
    scratch: { dateExpected: dateExpectedScratch },
    doc: dirtyState.doc,
  };
});

ipcMain.handle("doc-find", async (_e, payload) => {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return { ok: false, reason: "No Doc form skin active." };
  }
  const opts = payload && typeof payload === "object" ? payload : {};
  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  const route = profile.listRoute;
  activeDocSkin = null;
  showErp(route, { forceLoad: true, skipDirtyGate: true });
  const confirm = await waitForDocListRoute(profile.doctypeKey, BILL_FIND_TIMEOUT_MS);
  sendUiState();
  syncE2eApi();
  if (!(confirm && confirm.ok)) {
    return {
      ok: false,
      reason: (confirm && confirm.reason) || "Could not open list.",
    };
  }
  /** @type {Record<string, string>} */
  let filterPayload = {};
  if (profile.doctypeKey === "purchase-order") {
    filterPayload = poFindListFilterPayload(
      poFindPrefillFromLogbook({
        name: opts.name,
        title: opts.title ?? opts.logbook,
      }),
    );
  }
  let focusField = findListFocusField(profile.doctypeKey);
  if (profile.doctypeKey === "purchase-order" && filterPayload.title) {
    focusField = "title";
  }
  const focusLabel =
    focusField === "title"
      ? "Title (logbook PO#)"
      : findListFocusLabel(profile.doctypeKey) || focusField;
  let focus = { ok: false };
  let prefilled = false;
  if (focusField) {
    const ready = await waitForListFilterField(focusField);
    if (!(ready && ready.ok)) {
      scheduleErpKeyboardFocus();
      return {
        ok: true,
        focusOk: false,
        focusField,
        prefilled: false,
        reason: `List opened; ${focusLabel} filter not ready yet.`,
      };
    }
    await dismissOnboardingAndSettle();
    if (Object.keys(filterPayload).length) {
      for (const field of Object.keys(filterPayload)) {
        const fieldReady = await waitForListFilterField(field);
        if (!(fieldReady && fieldReady.ok)) {
          scheduleErpKeyboardFocus();
          return {
            ok: true,
            focusOk: false,
            focusField,
            prefilled: false,
            reason: `List opened; ${field} filter not ready for prefill.`,
          };
        }
      }
      const applied = await setListStandardFilterValues(filterPayload);
      prefilled = !!(applied && applied.ok && applied.applied && applied.applied.length);
    }
    focus = await focusListStandardFilter(focusField);
  }
  scheduleErpKeyboardFocus();
  if (!(focus && focus.ok)) {
    return {
      ok: true,
      focusOk: false,
      focusField,
      prefilled,
      reason: prefilled
        ? `List opened with filters; could not focus ${focusLabel}.`
        : `List opened; could not focus ${focusLabel}.`,
    };
  }
  return {
    ok: true,
    focusOk: true,
    focusField,
    prefilled,
    reason: prefilled ? "List opened with filters." : undefined,
  };
});

ipcMain.handle("doc-new", async () => {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return { ok: false, reason: "No Doc form skin active." };
  }
  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  await showDocForm(/** @type {DocFormSkinId} */ (profile.id), profile.newRoute, {
    skipDirtyGate: true,
  });
  return { ok: true };
});

ipcMain.handle("doc-print", async () => {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return { ok: false, reason: "No Doc form skin active." };
  }
  const doc = dirtyState.doc;
  const name = doc && doc.name != null ? String(doc.name) : "";
  if (!name || isNewDocRecord(name)) {
    return {
      ok: false,
      reason: `Save the ${profile.title} draft first — print needs a document name.`,
    };
  }

  const route = `/app/${profile.doctypeKey}/${encodeURIComponent(name)}`;
  const curUrl = erp && !erp.webContents.isDestroyed() ? erp.webContents.getURL() : "";
  const cur = routeInfo(curUrl, ERP_BASE);
  const alreadyOnDoc =
    cur.doctype === profile.doctypeKey && cur.record === name && !isNewDocRecord(cur.record);

  if (!alreadyOnDoc) {
    const target = erpUrl(ERP_BASE, route);
    await loadErpUrl(target);
  }

  const snap = await raceTimeout(
    waitForDocForm(BILL_PRINT_TIMEOUT_MS),
    BILL_PRINT_TIMEOUT_MS + 1000,
    "Print form load",
  );
  if (!(snap && snap.ok)) {
    return {
      ok: false,
      reason: (snap && snap.reason) || "Could not load document for print.",
    };
  }

  const opened = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f || !f.doc) return { ok: false, reason: "Vanilla form not ready." };
      if (typeof f.print_doc === "function") {
        f.print_doc();
        return { ok: true };
      }
      if (window.frappe && frappe.ui && frappe.ui.form && frappe.ui.form.print) {
        frappe.ui.form.print(f);
        return { ok: true };
      }
      return { ok: false, reason: "No print UI on this Desk build." };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (!(opened && opened.ok)) {
    return opened && typeof opened === "object"
      ? opened
      : { ok: false, reason: "Could not open print." };
  }

  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  surfaceMode = "erp";
  activeDocSkin = null;
  currentRoute = route;
  lensPrefs = rememberLens(lensPrefs, profile.doctypeKey, "vanilla");
  savePrefs();
  place();
  history = pushHistory(history, route, { erpBase: ERP_BASE, labels: DOCTYPE_LABELS });
  sendHistory();
  sendUiState();
  syncE2eApi();
  try {
    if (erp && !erp.webContents.isDestroyed()) erp.webContents.focus();
    if (win && !win.isDestroyed()) win.focus();
  } catch {
    /* ignore */
  }

  const landed = await waitForPrintPreview(name, BILL_PRINT_TIMEOUT_MS);
  if (!(landed && landed.ok)) {
    return {
      ok: false,
      reason: (landed && landed.reason) || "Print preview did not open.",
    };
  }
  return { ok: true, reason: "Print preview opened." };
});

ipcMain.handle("doc-revert-unsaved", async () => {
  const raw = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f) return { ok: false, reason: "No form." };
      if (f.is_new && f.is_new()) {
        try { f.doc.__unsaved = 0; } catch (e) {}
        try { frappe.model.clear_doc(f.doctype, f.doc.name); } catch (e) {}
        frappe.new_doc(f.doctype);
        await new Promise(function (r) { setTimeout(r, 250); });
        f = window.cur_frm;
        return {
          ok: true,
          isNew: true,
          doc: f && f.doc ? JSON.parse(JSON.stringify(f.doc)) : null,
        };
      }
      if (typeof f.reload_doc === "function") {
        await f.reload_doc();
        return {
          ok: true,
          isNew: !!(f.is_new && f.is_new()),
          doc: JSON.parse(JSON.stringify(f.doc)),
        };
      }
      return { ok: false, reason: "Cannot reload document." };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (!raw || !raw.ok) {
    return raw && typeof raw === "object"
      ? raw
      : { ok: false, reason: "Revert failed." };
  }
  dateExpectedScratch = "";
  if (raw.doc && Array.isArray(raw.doc.items)) {
    for (const it of raw.doc.items) {
      if (it && it.schedule_date) {
        dateExpectedScratch = String(it.schedule_date);
        break;
      }
    }
  }
  dirtyState = finishLensApply(
    {
      doc: raw.doc,
      isDirty: false,
      isNew: !!raw.isNew,
      userEdited: false,
      baselineJson: null,
    },
    true,
  );
  return {
    ok: true,
    isNew: !!raw.isNew,
    doc: raw.doc,
    scratch: { dateExpected: dateExpectedScratch },
  };
});

ipcMain.handle("doc-search-link", async (_e, doctype, txt) => searchLink(doctype, txt));

ipcMain.handle("doc-list-sources", async (_e, supplier) => {
  if (activeDocSkin !== "receipt") {
    return { ok: false, reason: "Source picker not used on this Doc form", groups: [] };
  }
  const sup = normalizeEditableText(supplier);
  if (!sup) return { ok: false, reason: "No vendor", groups: [] };
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, reason: "ERP Desk not ready" };
      }
      var supplier = ${JSON.stringify(sup)};
      var res = await Promise.all([
        frappe.db.get_list("Purchase Order", {
          filters: { supplier: supplier, docstatus: 1, per_received: ["<", 100] },
          fields: ["name", "transaction_date", "grand_total"],
          order_by: "transaction_date desc",
          limit: 50,
        }),
        frappe.db.get_list("Purchase Order", {
          filters: { supplier: supplier, docstatus: 0 },
          fields: ["name", "transaction_date", "grand_total"],
          order_by: "transaction_date desc",
          limit: 20,
        }),
      ]);
      return {
        ok: true,
        purchaseOrders: res[0] || [],
        purchaseOrdersDraft: res[1] || [],
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (!raw || !raw.ok) {
    return { ok: false, reason: (raw && raw.reason) || "Could not list sources", groups: [] };
  }
  return {
    ok: true,
    groups: buildReceiptSourceGroups({
      purchaseOrders: raw.purchaseOrders,
      purchaseOrdersDraft: raw.purchaseOrdersDraft,
    }),
  };
});

ipcMain.handle("doc-merge-source", async (_e, kind, name) => {
  if (activeDocSkin !== "receipt" || kind !== "po") {
    return { ok: false, reason: "Invalid source kind for Item Receipt" };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, reason: "Source name required" };
  }
  await ensureErpFormBridge();
  const method =
    "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt";
  const mapped = await erpEval(`(async () => {
    try {
      var r = await frappe.call({
        method: ${JSON.stringify(method)},
        args: { source_name: ${JSON.stringify(name.trim())} },
      });
      return { ok: true, src: r && r.message };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (!mapped || !mapped.ok || !mapped.src) {
    return {
      ok: false,
      reason: (mapped && mapped.reason) || "Could not map source document.",
    };
  }
  const raw = await bridgeCall("mergeFromMapped", mapped.src);
  if (raw && raw.ok) {
    dirtyState = markUserEdited({ ...dirtyState, doc: raw.doc, isDirty: true });
  }
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "Merge failed." };
});

ipcMain.on("doc-open-vanilla", () => {
  const profile = activeDocProfile();
  const route =
    profile && currentRoute.includes(profile.doctypeKey)
      ? currentRoute
      : profile
        ? profile.newRoute
        : "/desk";
  showErp(route, { forceLoad: true });
});

ipcMain.on("doc-open-vendor-add", () => {
  showErp("/app/supplier/new", { forceLoad: true });
});

ipcMain.on("doc-open-payment-terms-add", () => {
  softPeekErp(PAYMENT_TERMS_TEMPLATE_NEW_ROUTE);
});

ipcMain.on("doc-focus-surface", () => {
  focusDebug("doc-focus-surface", currentRoute || "", { surface: "doc-form" });
  try {
    if (win && !win.isDestroyed()) win.focus();
    if (docForm && !docForm.webContents.isDestroyed()) docForm.webContents.focus();
  } catch {
    /* ignore */
  }
});

ipcMain.on("doc-resolve-nav-gate", (_e, token, proceed) => {
  if (activeNavGate && activeNavGate.token === token) {
    activeNavGate.settle(!!proceed);
  }
});

ipcMain.on("go-home", () => showHome());
ipcMain.on("show-launcher", () => showHome());
ipcMain.on("open-doc-skin", () => openDocSkin());
ipcMain.on("soft-peek-esc", () => dismissSoftPeekFromEsc());
ipcMain.handle("soft-peek-route", async (_e, route) => {
  const r = typeof route === "string" && route.trim() ? route.trim() : "";
  if (!r) return { ok: false, reason: "Empty peek route." };
  try {
    await softPeekErp(r);
    return { ok: true, route: r };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
});
ipcMain.on("open-vanilla-skin", () => {
  // Strip the skin now rather than trusting the reload below to erase it.
  removeSimplifiedSkin().catch(() => {});
  // From Home (or no form in focus): always Vanilla Desk — do not reuse last form URL.
  // forceLoad required: erp WebContents often already has a prior page; without it
  // showErp("/desk") would skip navigation and flash the last Vanilla form.
  if (showingHome()) {
    showErp("/desk", { forceLoad: true });
    return;
  }
  const info = routeInfo(currentRoute, ERP_BASE);
  // Explicitly reset simplified pref to vanilla so ensureSimplifiedSkin won't re-inject
  // after the page reloads. Must happen before showErp so the did-finish-load handler sees it.
  if (info.doctype) {
    lensPrefs = rememberLens(lensPrefs, info.doctype, "vanilla");
    savePrefs();
  }
  if (info.doctype && info.record) {
    const profile = profileByDoctypeKey(info.doctype);
    if (profile) {
      showErp(info.path || currentRoute, { forceLoad: true });
      return;
    }
  }
  // Already looking at Vanilla on a page with no other lens: clicking Vanilla means "stay
  // in Vanilla", not "go to Desk". Punting off a dashboard or list loses the clerk's place
  // (nav incident 2026-09-05).
  const livePath = currentErpPathname();
  const here = normalizeAppRoute(livePath || currentRoute, ERP_BASE).path || "";
  if (surfaceMode === "erp" && here && here !== "/desk" && here !== "/app") {
    navDebug("open-vanilla-skin", `already vanilla — stay ${here}`);
    sendUiState();
    return;
  }
  showErp("/desk", { forceLoad: true });
});
ipcMain.on("open-simplified-skin", () => {
  const info = routeInfo(currentRoute, ERP_BASE);
  if (!info.doctype || !info.record) return;
  lensPrefs = rememberLens(lensPrefs, info.doctype, "simplified");
  savePrefs();
  if (surfaceMode === "erp") {
    // Already on ERP surface — inject without a full reload.
    sendUiState();
    ensureSimplifiedSkin().catch(() => {});
  } else {
    // Doc skin or other surface — load ERP form then inject (ensureSimplifiedSkin fires on did-finish-load).
    showErp(info.path || currentRoute, { forceLoad: true });
  }
});
ipcMain.on("open-entry", (_e, doctypeKey) => openEntry(doctypeKey));
ipcMain.on("open-erp", (_e, route) => {
  const r = typeof route === "string" && route ? route : "/desk";
  navDebug("ipc-open-erp", r);
  openHistoryRoute(r);
});
ipcMain.on("nav-debug", (_e, event, detail) => {
  navDebug(event || "hist", detail != null ? String(detail) : "");
});
ipcMain.on("open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on("open-submitted", (_e, anchor) => {
  openSubmittedDropdown(anchor && typeof anchor === "object" ? anchor : {});
});
ipcMain.on("submitted-dropdown-close", () => closeSubmittedDropdown());
ipcMain.on("submitted-open-doc", (_e, route) => {
  const r = submittedEntryRoute({ route: typeof route === "string" ? route : "" }, ERP_BASE);
  if (!r) return;
  closeSubmittedDropdown();
  navDebug("submitted-open", r);
  openHistoryRoute(r);
});
ipcMain.on("hist-collapse", (_e, collapsed) => {
  const next = !!collapsed;
  if (next === histCollapsed) return;
  histCollapsed = next;
  navDebug("hist-collapse", next ? "collapsed" : "expanded");
  saveNavState();
  place();
  sendHistory();
});
ipcMain.on("open-mockup", (_e, name) => {
  if (typeof name !== "string" || !/^[\w-]+\.html$/.test(name)) return;
  const p = path.join(__dirname, "..", "docs", "mockups", name);
  // show:false + ready-to-show: a bare BrowserWindow can paint behind the maximized
  // shell on Linux/WSL, which reads as "the mockup did not open" (incident 2026-09-01).
  const w = new BrowserWindow({ width: 1200, height: 900, title: name, show: false });
  w.once("ready-to-show", () => {
    if (w.isDestroyed()) return;
    w.show();
    w.focus();
  });
  w.loadFile(p).catch((e) => navDebug("open-mockup-err", String(e && e.message ? e.message : e)));
});
ipcMain.on("open-payment-entry", (_e, direction) => openPaymentEntryTile(direction));
ipcMain.handle("get-payment-entry", async (_e, name) => fetchPaymentEntry(name));
ipcMain.handle("get-outstanding-bills", async () => fetchOutstandingBills());
ipcMain.handle("get-payment-batch-prefs", () => ({ ...paymentBatchPrefs }));
ipcMain.handle("set-payment-batch-prefs", (_e, prefs) => {
  const check = validatePaymentBatchPrefs(prefs);
  if (!check.ok) return { ok: false, errors: check.errors, prefs: { ...paymentBatchPrefs } };
  paymentBatchPrefs = mergePaymentBatchPrefs(prefs);
  savePaymentBatchPrefs();
  return { ok: true, prefs: { ...paymentBatchPrefs } };
});
ipcMain.on("set-pay-outstanding-dirty", (_e, dirty) => {
  payOutstandingDirty = !!dirty;
});
ipcMain.handle("pay-outstanding-search-link", async (_e, doctype, txt) => searchLink(doctype, txt));
ipcMain.handle("create-batch-payment-entry", async (_e, bills, intent) =>
  createBatchPaymentEntryForBills(bills, intent),
);
ipcMain.on("open-devtools", (_e, target) => {
  const map = { erp, chrome, home, hist, bill, docForm, payOutstanding, paymentDoc };
  const key = typeof target === "string" && map[target] ? target : "erp";
  const view = map[key];
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.openDevTools({ mode: "detach" });
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
