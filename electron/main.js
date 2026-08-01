/**
 * Electron main — M0–M2 shell + Doc Bill / PO / Item Receipt WebContentsViews (T4).
 */
import { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog, clipboard } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { pingHealth } from "../src/health.js";
import { isAllowedErpUrl, erpUrl } from "../src/nav-guard.js";
import { pushHistory } from "../src/history.js";
import { DOCTYPE_LABELS } from "../src/doctype-labels.js";
import { hasDocSkin, resolveDocSkinTarget, DOC_FORM_DOCTYPES } from "../src/lens-context.js";
import { routeInfo, routesReferToSameDoc, isNewDocRecord, isDocListRoute } from "../src/route-info.js";
import {
  rememberLens,
  resolveEntryOpen,
  shouldOpenDocLens,
  normalizeDoctypeKey,
} from "../src/lens-prefs.js";
import {
  applySaveToShelved,
  draftableDoctypeKeys,
  reconcileShelvedWithOpenDoc,
  draftShelfLabel,
} from "../src/shelved-drafts.js";
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
import { findListFocusField, findListFocusLabel } from "../src/doc-chrome.js";
import {
  resolveFeedbackFormUrl,
  buildFeedbackUrl,
  isPlaceholderFeedbackUrl,
} from "../src/feedback-url.js";
import {
  shouldGateNavigation,
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
} from "../src/bill-map.js";
import {
  isEditablePoItemField,
  resolvePoStampDate,
  poRowsNeedingScheduleStamp,
  shouldStampPoDateExpectedOnSave,
} from "../src/po-map.js";
import { isEditableReceiptItemField } from "../src/receipt-map.js";
import { normalizeSearchLinkResults } from "../src/link-search.js";
import { buildBillSourceGroups, enrichReceiptsWithPurchaseOrders } from "../src/source-modal.js";
import { buildReceiptSourceGroups } from "../src/receipt-source.js";
import {
  DOC_SKIN_PROFILES,
  docFormUiPayload,
  profileByDoctypeKey,
  profileByLayoutKey,
} from "../src/doc-skin-registry.js";
import { DOC_FORM_BRIDGE_VERSION, doctypeKeyFromErpDoctype } from "../src/erp-form-bridge.js";
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
const HISTORY_WIDTH = 176;
const ERP_BRIDGE_PAGE_JS = fs.readFileSync(
  path.join(__dirname, "erp-form-bridge-page.js"),
  "utf8",
);

/** @typedef {"home"|"erp"|"bill"|"doc"} SurfaceMode */
/** @typedef {"po"|"receipt"} DocFormSkinId */

let win = null;
let chrome = null;
let home = null;
let bill = null;
/** Shared PO + Item Receipt Doc shell. */
let docForm = null;
let erp = null;
let hist = null;
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
/** @type {import("../src/shelved-drafts.js").ShelvedDraft[]} */
let shelvedDrafts = [];
/** @type {import("../src/calc/session-history.js").CalcHistoryEntry[]} */
let calcHistory = [];
/** Avoid re-entrancy when Vanilla→Doc hijack loads the same URL under Doc skin. */
let lensHijackLock = false;
/** @type {{ status: string, code: number|null, latencyMs: number|null, lastOkAt: string|null, internetOk: boolean|null }} */
let diagnoseState = {
  status: "unknown",
  code: null,
  latencyMs: null,
  lastOkAt: null,
  internetOk: null,
};
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

function isDocLensSurface() {
  return surfaceMode === "bill" || surfaceMode === "doc";
}

function activeDocProfile() {
  if (surfaceMode === "bill") return DOC_SKIN_PROFILES.bill;
  if (surfaceMode === "doc" && activeDocSkin) return DOC_SKIN_PROFILES[activeDocSkin] || null;
  return null;
}

function activeFormView() {
  if (surfaceMode === "bill") return bill;
  if (surfaceMode === "doc") return docForm;
  return null;
}

function prefsPath() {
  return path.join(app.getPath("userData"), "lens-prefs.json");
}
function navStatePath() {
  return path.join(app.getPath("userData"), "nav-state.json");
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
  } catch {
    shelvedDrafts = [];
    calcHistory = [];
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
      JSON.stringify({ shelved: shelvedDrafts, calcHistory }, null, 0),
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
      return { surfaceMode };
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
    docSkinAvailable: () => hasDocSkin(shellCtx()),
    currentRoute: () => currentRoute,
    execInView: (name, js) => {
      const map = { chrome, home, hist, erp, bill, docForm };
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
  const info = routeInfo(currentRoute, ERP_BASE);
  return {
    showingHome: showingHome(),
    lens: isDocLensSurface() || showingHome() ? "doc" : "vanilla",
    route: info.path || currentRoute,
    doctype: info.doctype,
    record: info.record,
  };
}

function sendUiState() {
  if (chrome && !chrome.webContents.isDestroyed()) {
    const ctx = shellCtx();
    const onDoc = showingHome() || isDocLensSurface();
    chrome.webContents.send("ui-state", {
      showingHome: showingHome(),
      showingBill: surfaceMode === "bill",
      showingDocForm: surfaceMode === "doc",
      activeDocSkin,
      lens: onDoc ? "doc" : "vanilla",
      docSkinAvailable: hasDocSkin(ctx),
      route: ctx.route,
      diagnoseOpen: !!(diagnoseWin && !diagnoseWin.isDestroyed()),
    });
  }
}

function sendHistory() {
  calcHistory = pruneCalcHistory(calcHistory);
  if (hist && !hist.webContents.isDestroyed()) {
    hist.webContents.send("history", {
      items: history,
      shelved: shelvedDrafts,
      calcHistory,
    });
  }
  pushCalcHistoryDropdown();
}

function pushBillSnapshot(snap) {
  if (bill && !bill.webContents.isDestroyed()) {
    bill.webContents.send("bill-snapshot", snap);
  }
}

function pushDocFormSnapshot(snap) {
  if (docForm && !docForm.webContents.isDestroyed()) {
    docForm.webContents.send("doc-snapshot", {
      ...snap,
      scratch: snap.scratch || { dateExpected: dateExpectedScratch },
    });
  }
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
  if (profile.shell === "bill") {
    showBill(route, opts);
    return true;
  }
  if (profile.shell === "doc-form") {
    showDocForm(profile.id, route, opts);
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
  const r = typeof route === "string" && route ? route : "/desk";
  const info = routeInfo(r, ERP_BASE);
  const profile = info.doctype ? profileByDoctypeKey(info.doctype) : null;
  if (
    profile &&
    shouldOpenDocLens(info.doctype, info.record, lensPrefs, { hasDocSkin: true }) &&
    openDocSkinProfile(profile, info.path || r, opts)
  ) {
    return;
  }
  showErp(r, { forceLoad: opts.forceLoad !== false, skipDirtyGate: opts.skipDirtyGate });
}

/**
 * Vanilla Desk in-page nav → Doc when prefs say doc (Wes: yes).
 * @param {string} url
 * @returns {boolean} true if hijacked
 */
function maybeHijackErpToDoc(url) {
  if (lensHijackLock || surfaceMode !== "erp") return false;
  if (typeof url !== "string" || !isAllowedErpUrl(ERP_BASE, url)) return false;
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

function trackNav(url) {
  if (typeof url !== "string" || !isAllowedErpUrl(ERP_BASE, url)) return;
  const info = routeInfo(url, ERP_BASE);
  const next = info.path || currentRoute;
  const changed = next !== currentRoute;
  currentRoute = next;
  history = pushHistory(history, url, {
    erpBase: ERP_BASE,
    labels: DOCTYPE_LABELS,
  });
  sendHistory();
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
    if (url && url !== lastPolledErpUrl) {
      lastPolledErpUrl = url;
      trackNav(url);
    }
  }
  // Submit often keeps the same form URL — still drain shelf updates.
  drainErpSaveIntoShelved().catch(() => {});
}

async function erpEval(js) {
  if (!erp || erp.webContents.isDestroyed()) {
    return { ok: false, reason: "ERP view not ready" };
  }
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

/** Blur Bill / Doc / Home so OS keyboard focus can settle on ERP. */
function blurNonErpWebContents() {
  for (const view of [bill, docForm, home]) {
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

async function bridgeCall(method, ...args) {
  await ensureErpFormBridge();
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
  );
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
    amountDue: amountDueScratch,
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
  return {
    ok: true,
    doc: raw.doc,
    amountDue: amountDueScratch,
    isDirty: raw.isDirty,
    isNew: raw.isNew,
  };
}

function loadErpUrl(url) {
  return new Promise((resolve) => {
    if (!erp || erp.webContents.isDestroyed()) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      erp.webContents.removeListener("did-finish-load", finish);
      resolve(true);
    };
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
 * Recent form row: primary label stays "Bill" (etc.); draft identity is a suffix.
 * Viewed-only (not on Drafts shelf) → suffix de-emphasized.
 * @param {string} routePath
 * @param {string} doctypeKey
 * @param {object|null|undefined} doc
 */
function bumpFormHistoryFromDoc(routePath, doctypeKey, doc) {
  const name = doc && doc.name != null ? String(doc.name).trim() : "";
  const isDraft = doc && Number(doc.docstatus) === 0 && name && !/^new/i.test(name);
  const viewedOnly = !!(isDraft && !isNameOnShelvedDrafts(doctypeKey, name));
  let detail = "";
  if (isDraft && draftableDoctypeKeys().includes(normalizeDoctypeKey(doctypeKey))) {
    detail = draftShelfLabel(doctypeKey, doc) || name;
  } else if (name && !/^new/i.test(name)) {
    detail = name;
  }
  history = pushHistory(history, routePath, {
    erpBase: ERP_BASE,
    labels: DOCTYPE_LABELS,
    detail,
    detailMuted: viewedOnly,
  });
  sendHistory();
}

function place() {
  if (!win || !chrome || !home || !erp || !hist || !bill || !docForm) return;
  const b = win.getContentBounds();
  const H = TAB_BAR_HEIGHT;
  const HW = HISTORY_WIDTH;
  const main = {
    x: HW,
    y: H,
    width: Math.max(100, b.width - HW),
    height: Math.max(100, b.height - H),
  };
  chrome.setBounds({ x: 0, y: 0, width: b.width, height: H });
  hist.setBounds({ x: 0, y: H, width: HW, height: Math.max(100, b.height - H) });
  home.setBounds(surfaceMode === "home" ? main : OFF);
  bill.setBounds(surfaceMode === "bill" ? main : OFF);
  docForm.setBounds(surfaceMode === "doc" ? main : OFF);
  erp.setBounds(surfaceMode === "erp" ? main : OFF);
}

/** @type {BrowserWindow|null} */
let diagnoseWin = null;
/** @type {import("electron").BrowserWindow|null} */
let calcHistoryWin = null;

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
  const histBounds = hist && !hist.webContents.isDestroyed() ? hist.getBounds() : { x: 0, y: TAB_BAR_HEIGHT, width: HISTORY_WIDTH, height: 400 };
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
    height: 300,
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
    doNav();
    return;
  }
  const live =
    surfaceMode === "bill" ? await snapshotBill() : await snapshotDocForm();
  const state = {
    ...dirtyState,
    doc: live.doc || dirtyState.doc,
    isDirty: !!(live.isDirty || dirtyState.userEdited),
    isNew: live.ok ? !!live.isNew : !!dirtyState.isNew,
    // Doc Bill edits always set userEdited; ERP is_dirty alone is not enough.
    userEdited: !!dirtyState.userEdited,
  };
  if (!shouldGateNavigation(state)) {
    doNav();
    return;
  }

  const view = activeFormView();
  const openChannel = surfaceMode === "bill" ? "bill-open-nav-gate" : "doc-open-nav-gate";
  const cancelChannel = surfaceMode === "bill" ? "bill-cancel-nav-gate" : "doc-cancel-nav-gate";
  const leaving =
    surfaceMode === "bill"
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
        dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
        amountDueCommitted = amountDueScratch;
        doNav();
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
      surfaceMode === "doc" ? await saveDocFormFromErp() : await saveBillFromErp();
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

function showHome() {
  gateDirtyThen(() => {
    surfaceMode = "home";
    place();
    sendUiState();
    syncE2eApi();
  });
}

function showErp(route = "/desk", opts = {}) {
  const skipDirtyGate = !!opts.skipDirtyGate;
  const go = () => {
    surfaceMode = "erp";
    const info = routeInfo(route, ERP_BASE);
    currentRoute = info.path || route;
    if (info.doctype && DOC_FORM_DOCTYPES.has(info.doctype) && info.record) {
      lensPrefs = rememberLens(lensPrefs, info.doctype, "vanilla");
      savePrefs();
    }
    place();
    const target = erpUrl(ERP_BASE, route);
    const cur = erp && !erp.webContents.isDestroyed() ? erp.webContents.getURL() : "";
    const alreadyOnErp = !!(cur && isAllowedErpUrl(ERP_BASE, cur));
    if (opts.forceLoad || route !== "/desk" || !alreadyOnErp) {
      erp.webContents.loadURL(target);
      trackNav(target);
    }
    sendUiState();
    syncE2eApi();
  };
  if (skipDirtyGate) go();
  else gateDirtyThen(go);
}

async function showBill(route, opts = {}) {
  const skipDirtyGate = !!opts.skipDirtyGate;
  const r =
    typeof route === "string" && route
      ? route
      : currentRoute.includes("purchase-invoice")
        ? currentRoute
        : "/app/purchase-invoice/new";

  // Already on this Bill — refocus only (Recent click must not reload / wipe edits).
  // Do not reuse when memory holds a submitted/cancelled doc but the route is "new".
  if (surfaceMode === "bill" && routesReferToSameDoc(currentRoute, r, ERP_BASE)) {
    const nextInfo = routeInfo(r, ERP_BASE);
    const staleSubmittedOnNew =
      isNewDocRecord(nextInfo.record) &&
      dirtyState.doc &&
      Number(dirtyState.doc.docstatus) > 0;
    if (!staleSubmittedOnNew) {
      place();
      try {
        if (bill && !bill.webContents.isDestroyed()) bill.webContents.focus();
        if (win && !win.isDestroyed()) win.focus();
      } catch {
        /* ignore */
      }
      sendUiState();
      if (dirtyState.doc) {
        noteShelvedFromOpen("purchase-invoice", dirtyState.doc);
        bumpFormHistoryFromDoc(currentRoute, "purchase-invoice", dirtyState.doc);
        pushBillSnapshot({
          ok: true,
          doc: dirtyState.doc,
          amountDue: amountDueScratch,
          userEdited: !!dirtyState.userEdited,
          isNew: !!dirtyState.isNew,
          focusVendor: false,
        });
      }
      syncE2eApi();
      return;
    }
  }

  const proceed = async () => {
    surfaceMode = "bill";
    activeDocSkin = null;
    const info = routeInfo(r, ERP_BASE);
    // Prefer /app/… (Desk SPA); rewrite legacy /desk/purchase-invoice → /app/…
    let path = info.path || r;
    if (path.startsWith("/desk/purchase-invoice")) {
      path = path.replace("/desk/purchase-invoice", "/app/purchase-invoice");
    }
    if (!path.includes("purchase-invoice")) {
      path = "/app/purchase-invoice/new";
    }
    currentRoute = path;
    lensPrefs = rememberLens(lensPrefs, "purchase-invoice", "doc");
    savePrefs();
    bumpBillHistory(currentRoute);
    place();
    try {
      if (bill && !bill.webContents.isDestroyed()) bill.webContents.focus();
    } catch {
      /* ignore */
    }
    sendUiState();
    // Clear stale submitted/draft memory before Vanilla load settles (new-* especially).
    if (isNewDocRecord(routeInfo(currentRoute, ERP_BASE).record)) {
      dirtyState = {
        isDirty: false,
        isNew: true,
        userEdited: false,
        baselineJson: null,
        doc: null,
      };
    }
    pushBillSnapshot({
      ok: false,
      reason: "Loading Purchase Invoice in Vanilla…",
      doc: null,
      amountDue: "",
      userEdited: false,
    });

    const target = erpUrl(ERP_BASE, currentRoute);
    // Always load so cur_frm is a real Bill form (SPA may have been on Desk home).
    await loadErpUrl(target);
    trackNav(target);

    amountDueScratch = "";
    amountDueCommitted = "";
    const snap = await waitForPurchaseInvoice();
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
      // Amount Due stays blank until the user types (checksum idle / grey).
      amountDueCommitted = amountDueScratch;
      noteShelvedFromOpen("purchase-invoice", snap.doc);
      bumpFormHistoryFromDoc(currentRoute, "purchase-invoice", snap.doc);
      try {
        if (bill && !bill.webContents.isDestroyed()) bill.webContents.focus();
      } catch {
        /* ignore */
      }
      pushBillSnapshot({
        ok: true,
        doc: snap.doc,
        amountDue: amountDueScratch,
        userEdited: false,
        isNew: !!snap.isNew,
        focusVendor: true,
      });
    } else {
      dirtyState = {
        isDirty: false,
        isNew: true,
        userEdited: false,
        baselineJson: null,
        doc: null,
      };
      pushBillSnapshot({ ...snap, userEdited: false, focusVendor: false });
    }
    syncE2eApi();
  };

  if (surfaceMode === "bill" || skipDirtyGate) {
    await proceed();
    return;
  }
  gateDirtyThen(() => {
    proceed();
  });
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
 * @param {DocFormSkinId} skinId
 * @param {string} [route]
 * @param {{ skipDirtyGate?: boolean }} [opts]
 */
async function showDocForm(skinId, route, opts = {}) {
  const profile = DOC_SKIN_PROFILES[skinId];
  if (!profile || profile.shell !== "doc-form") return;
  const skipDirtyGate = !!opts.skipDirtyGate;
  const slug = profile.doctypeKey;
  const r =
    typeof route === "string" && route
      ? route
      : currentRoute.includes(slug)
        ? currentRoute
        : profile.newRoute;

  if (
    surfaceMode === "doc" &&
    activeDocSkin === skinId &&
    routesReferToSameDoc(currentRoute, r, ERP_BASE)
  ) {
    const nextInfo = routeInfo(r, ERP_BASE);
    const staleSubmittedOnNew =
      isNewDocRecord(nextInfo.record) &&
      dirtyState.doc &&
      Number(dirtyState.doc.docstatus) > 0;
    if (!staleSubmittedOnNew) {
      place();
      try {
        if (docForm && !docForm.webContents.isDestroyed()) docForm.webContents.focus();
        if (win && !win.isDestroyed()) win.focus();
      } catch {
        /* ignore */
      }
      sendUiState();
      if (dirtyState.doc) {
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

  const proceed = async () => {
    surfaceMode = "doc";
    activeDocSkin = skinId;
    const info = routeInfo(r, ERP_BASE);
    let path = info.path || r;
    if (path.startsWith(`/desk/${slug}`)) {
      path = path.replace(`/desk/${slug}`, `/app/${slug}`);
    }
    if (!path.includes(slug)) {
      path = profile.newRoute;
    }
    currentRoute = path;
    lensPrefs = rememberLens(lensPrefs, slug, "doc");
    savePrefs();
    history = pushHistory(history, currentRoute, {
      erpBase: ERP_BASE,
      labels: DOCTYPE_LABELS,
    });
    sendHistory();
    place();
    try {
      if (docForm && !docForm.webContents.isDestroyed()) docForm.webContents.focus();
    } catch {
      /* ignore */
    }
    sendUiState();
    pushDocFormSnapshot({
      ok: false,
      reason: `Loading ${profile.doctype} in Vanilla…`,
      doc: null,
      scratch: { dateExpected: "" },
      userEdited: false,
    });

    const target = erpUrl(ERP_BASE, currentRoute);
    await loadErpUrl(target);
    trackNav(target);

    dateExpectedScratch = "";
    const snap = await waitForDocForm();
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
      // Seed Date Expected from first line schedule_date when present.
      if (skinId === "po" && snap.doc) {
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
      pushDocFormSnapshot({
        ok: true,
        doc: snap.doc,
        scratch: { dateExpected: dateExpectedScratch },
        userEdited: false,
        isNew: !!snap.isNew,
        focusVendor: true,
      });
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
  const target = resolveDocSkinTarget(shellCtx());
  if (!target) return;
  if (target.kind === "workflow-home") {
    showHome();
    return;
  }
  if (target.kind === "doc-form") {
    const profile = profileByLayoutKey(target.layoutKey) || profileByDoctypeKey(target.doctype);
    if (!profile) return;
    openDocSkinProfile(profile, target.route);
  }
}

function openEntry(doctypeKey) {
  const key = doctypeKey || "purchase-invoice";
  const t = resolveEntryOpen(key, lensPrefs);
  if (t.surface === "doc-form") {
    const profile = profileByDoctypeKey(key);
    if (profile && openDocSkinProfile(profile, t.route)) return;
    showBill(t.route);
  } else showErp(t.route, { forceLoad: true });
}

async function saveBillFromErp(opts = {}) {
  const submit = !!opts.submit;
  if (!amountDueMatchesGrandTotal(amountDueScratch, billCompareTotal(dirtyState.doc))) {
    return { ok: false, reason: "Amount Due checksum failed (must match Grand total)." };
  }
  // Bridge saveDoc always settles (preflight + short inner deadline + scraped Vanilla msgs).
  // Outer race is a backstop if executeJavaScript itself hangs.
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
    amountDueCommitted = amountDueScratch;
    noteShelvedFromSave("purchase-invoice", raw.doc);
  }
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "Save failed." };
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
  const raw = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f) return { ok: false, reason: "No form." };
      var row = (f.doc.items || [])[${rowIndex}];
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

async function searchLink(doctype, txt) {
  if (typeof doctype !== "string" || !doctype.trim()) {
    return { ok: false, reason: "doctype required", results: [] };
  }
  const q = txt == null ? "" : String(txt);
  const raw = await erpEval(`(async () => {
    try {
      if (!window.frappe) return { ok: false, reason: "ERP Desk not ready (no frappe)." };
      var doctype = ${JSON.stringify(doctype)};
      var txt = ${JSON.stringify(q)};
      var rows = [];
      if (frappe.call) {
        var r = await frappe.call({
          method: "frappe.desk.search.search_link",
          args: {
            txt: txt,
            doctype: doctype,
            reference_doctype: "Purchase Invoice",
            page_length: 25
          }
        });
        rows = (r && r.message) ? r.message : [];
      } else if (frappe.db && frappe.db.get_list) {
        var fields = ["name"];
        if (doctype === "Supplier") fields.push("supplier_name");
        if (doctype === "Item") fields.push("item_name");
        var list = await frappe.db.get_list(doctype, {
          fields: fields,
          filters: txt ? [["name", "like", "%" + txt + "%"]] : [],
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
  return {
    ok: true,
    results: normalizeSearchLinkResults(raw.results),
  };
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
  return {
    lines,
    copyText: diagnoseCopyText(lines),
    hostClass: classifyHostClass(ERP_BASE),
    version: APP_VERSION,
    updateStub: "Shell updates: ask IT (packaged updater later).",
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
      // Avoid auto-stealing focus on every Desk nav (Electron #42578 / focusOnNavigation).
      focusOnNavigation: false,
    },
  });

  win.contentView.addChildView(chrome);
  win.contentView.addChildView(hist);
  win.contentView.addChildView(home);
  win.contentView.addChildView(bill);
  win.contentView.addChildView(docForm);
  win.contentView.addChildView(erp);

  chrome.webContents.loadFile(path.join(__dirname, "chrome.html"));
  home.webContents.loadFile(path.join(__dirname, "home.html"));
  bill.webContents.loadFile(path.join(__dirname, "bill.html"));
  docForm.webContents.loadFile(path.join(__dirname, "doc-form.html"));
  hist.webContents.loadFile(path.join(__dirname, "history.html"));
  erp.webContents.loadURL(erpUrl(ERP_BASE, "/desk"));

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
  });
  erp.webContents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (isMainFrame) {
      trackNav(url);
      ensureErpFormBridge().catch(() => {});
    }
  });
  erp.webContents.on("did-finish-load", () => {
    ensureErpFormBridge().catch(() => {});
  });

  place();
  win.on("resize", place);
  win.on("closed", () => {
    closeDiagnoseDropdown();
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
}));

ipcMain.handle("get-diagnose", () => diagnoseSnapshot());

ipcMain.handle("copy-diagnose", () => {
  const snap = diagnoseSnapshot();
  clipboard.writeText(snap.copyText || "");
  return { ok: true };
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
  await showBill(currentRoute.includes("purchase-invoice") ? currentRoute : "/app/purchase-invoice/new");
  return { ok: true };
});

function headerValueUnchanged(field, next) {
  const kind = dirtyCompareKindForField(field);
  const doc = dirtyState.doc;
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
  const kind = dirtyCompareKindForField(field);
  const next =
    kind === "number" ? (value == null ? "" : String(value)) : normalizeEditableText(value);
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
    if (field === "supplier") {
      return { ...raw, openSourcePicker: true, supplier: next };
    }
  }
  return raw;
});

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

ipcMain.handle("bill-list-sources", async (_e, supplier) => {
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
          filters: { supplier: supplier, docstatus: 1, per_billed: ["<", 100] },
          fields: ["name", "transaction_date", "grand_total"],
          order_by: "transaction_date desc",
          limit: 50,
        }),
        frappe.db.get_list("Purchase Receipt", {
          filters: { supplier: supplier, docstatus: 1, per_billed: ["<", 100] },
          fields: ["name", "posting_date", "grand_total"],
          order_by: "posting_date desc",
          limit: 50,
        }),
        frappe.db.get_list("Purchase Order", {
          filters: { supplier: supplier, docstatus: 0 },
          fields: ["name", "transaction_date", "grand_total"],
          order_by: "transaction_date desc",
          limit: 20,
        }),
        frappe.db.get_list("Purchase Receipt", {
          filters: { supplier: supplier, docstatus: 0 },
          fields: ["name", "posting_date", "grand_total"],
          order_by: "posting_date desc",
          limit: 20,
        }),
      ]);
      var prs = res[1] || [];
      var prsD = res[3] || [];
      // Do NOT get_list("Purchase Receipt Item") here.
      // Clerk roles get 403 (HAR localhost.har ×2); even a try/catch is unreliable because
      // frappe.request may reject outside our await. PO# on PR rows stays "no PO" until we
      // have a permission-safe enrich path (parent doc field or whitelisted method).
      return {
        ok: true,
        purchaseOrders: res[0] || [],
        purchaseReceipts: prs,
        purchaseOrdersDraft: res[2] || [],
        purchaseReceiptsDraft: prsD,
        purchaseReceiptItems: [],
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (!raw || !raw.ok) {
    return { ok: false, reason: (raw && raw.reason) || "Could not list sources", groups: [] };
  }
  const prItemRows = raw.purchaseReceiptItems || [];
  const groups = buildBillSourceGroups({
    purchaseOrders: raw.purchaseOrders,
    purchaseReceipts: enrichReceiptsWithPurchaseOrders(raw.purchaseReceipts, prItemRows),
    purchaseOrdersDraft: raw.purchaseOrdersDraft,
    purchaseReceiptsDraft: enrichReceiptsWithPurchaseOrders(raw.purchaseReceiptsDraft, prItemRows),
  });
  return { ok: true, groups };
});

ipcMain.handle("bill-merge-source", async (_e, kind, name) => {
  if (kind !== "po" && kind !== "pr") {
    return { ok: false, reason: "Invalid source kind" };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, reason: "Source name required" };
  }
  await ensureErpFormBridge();
  const method =
    kind === "po"
      ? "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice"
      : "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice";
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

ipcMain.handle("bill-set-item", async (_e, rowIndex, field, value) =>
  setBillItemField(Number(rowIndex), field, value),
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

/** Find Bills list in Vanilla (T3a / OI-056). Caller handles dirty commit first. */
ipcMain.handle("bill-find", async () => {
  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  const route = "/app/purchase-invoice";
  surfaceMode = "erp";
  currentRoute = route;
  // List Find must not flip entry-lens pref (Doc stays Doc until a Vanilla *form* opens).
  place();
  const target = erpUrl(ERP_BASE, route);
  await loadErpUrl(target);
  trackNav(target);
  const confirm = await waitForPurchaseInvoiceList(BILL_FIND_TIMEOUT_MS);
  sendUiState();
  syncE2eApi();
  if (!(confirm && confirm.ok)) {
    return {
      ok: false,
      reason: (confirm && confirm.reason) || "Could not open Bill list.",
    };
  }
  const focusField = findListFocusField("purchase-invoice");
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
        reason: `Bill list opened; ${focusLabel} filter not ready yet.`,
      };
    }
    await dismissOnboardingAndSettle();
    focus = await focusListStandardFilter(focusField);
  }
  scheduleErpKeyboardFocus();
  if (!(focus && focus.ok)) {
    return {
      ok: true,
      focusOk: false,
      focusField,
      reason: `Bill list opened; could not focus ${focusLabel}.`,
    };
  }
  return { ok: true, focusOk: true, focusField };
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

/** New Bill on Doc skin (T3a). Caller handles dirty commit first. */
ipcMain.handle("bill-new", async () => {
  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  await showBill("/app/purchase-invoice/new", { skipDirtyGate: true });
  return { ok: true };
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

ipcMain.handle("bill-search-link", async (_e, doctype, txt) => searchLink(doctype, txt));
ipcMain.on("bill-open-vanilla", () => {
  const route = currentRoute.includes("purchase-invoice")
    ? currentRoute
    : "/app/purchase-invoice/new";
  showErp(route, { forceLoad: true });
});

ipcMain.on("bill-open-vendor-add", () => {
  showErp("/app/supplier/new", { forceLoad: true });
});

ipcMain.on("bill-focus-surface", () => {
  try {
    if (win && !win.isDestroyed()) win.focus();
    if (bill && !bill.webContents.isDestroyed()) bill.webContents.focus();
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
  await showDocForm(/** @type {DocFormSkinId} */ (profile.id), currentRoute.includes(profile.doctypeKey) ? currentRoute : profile.newRoute);
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
ipcMain.handle("doc-delete-item", async (_e, rowIndex) => deleteBillItem(Number(rowIndex)));
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

ipcMain.handle("doc-find", async () => {
  const profile = activeDocProfile();
  if (!profile || profile.shell !== "doc-form") {
    return { ok: false, reason: "No Doc form skin active." };
  }
  dirtyState = { ...dirtyState, userEdited: false, isDirty: false };
  const route = profile.listRoute;
  surfaceMode = "erp";
  activeDocSkin = null;
  currentRoute = route;
  // List Find must not flip entry-lens pref.
  place();
  const target = erpUrl(ERP_BASE, route);
  await loadErpUrl(target);
  trackNav(target);
  const confirm = await waitForDocListRoute(profile.doctypeKey, BILL_FIND_TIMEOUT_MS);
  sendUiState();
  syncE2eApi();
  if (!(confirm && confirm.ok)) {
    return {
      ok: false,
      reason: (confirm && confirm.reason) || "Could not open list.",
    };
  }
  const focusField = findListFocusField(profile.doctypeKey);
  const focusLabel = findListFocusLabel(profile.doctypeKey) || focusField;
  let focus = { ok: false };
  if (focusField) {
    const ready = await waitForListFilterField(focusField);
    if (!(ready && ready.ok)) {
      scheduleErpKeyboardFocus();
      return {
        ok: true,
        focusOk: false,
        focusField,
        reason: `List opened; ${focusLabel} filter not ready yet.`,
      };
    }
    await dismissOnboardingAndSettle();
    focus = await focusListStandardFilter(focusField);
  }
  scheduleErpKeyboardFocus();
  if (!(focus && focus.ok)) {
    return {
      ok: true,
      focusOk: false,
      focusField,
      reason: `List opened; could not focus ${focusLabel}.`,
    };
  }
  return { ok: true, focusOk: true, focusField };
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

ipcMain.on("doc-focus-surface", () => {
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
ipcMain.on("open-vanilla-skin", () => {
  // From Home (or no form in focus): always Vanilla Desk — do not reuse last form URL.
  // forceLoad required: erp WebContents often already has a prior page; without it
  // showErp("/desk") would skip navigation and flash the last Vanilla form.
  if (showingHome()) {
    showErp("/desk", { forceLoad: true });
    return;
  }
  const info = routeInfo(currentRoute, ERP_BASE);
  if (info.doctype && info.record) {
    const profile = profileByDoctypeKey(info.doctype);
    if (profile) {
      showErp(info.path || currentRoute, { forceLoad: true });
      return;
    }
  }
  showErp("/desk", { forceLoad: true });
});
ipcMain.on("open-entry", (_e, doctypeKey) => openEntry(doctypeKey));
ipcMain.on("open-erp", (_e, route) => {
  const r = typeof route === "string" && route ? route : "/desk";
  openRoutePreferred(r, { forceLoad: r !== "/desk" });
});
ipcMain.on("open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on("open-devtools", (_e, target) => {
  const map = { erp, chrome, home, hist, bill, docForm };
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
