/**
 * Electron main — M0–M2 shell + M3c Doc Bill WebContentsView.
 */
import { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { pingHealth } from "../src/health.js";
import { isAllowedErpUrl, erpUrl } from "../src/nav-guard.js";
import { pushHistory } from "../src/history.js";
import { DOCTYPE_LABELS } from "../src/doctype-labels.js";
import { hasDocSkin, resolveDocSkinTarget } from "../src/lens-context.js";
import { routeInfo } from "../src/route-info.js";
import {
  rememberLens,
  preferredLens,
  resolveEntryOpen,
} from "../src/lens-prefs.js";
import {
  shouldGateNavigation,
  finishLensApply,
  markUserEdited,
  captureBaseline,
  valuesMeaningfullyEqual,
  dirtyCompareKindForField,
  normalizeEditableText,
} from "../src/dirty-gate.js";
import { amountDueMatchesGrandTotal, isEditableBillItemField } from "../src/bill-map.js";
import { normalizeSearchLinkResults } from "../src/link-search.js";
import { buildBillSourceGroups, enrichReceiptsWithPurchaseOrders } from "../src/source-modal.js";
import { DOC_FORM_BRIDGE_VERSION } from "../src/erp-form-bridge.js";
import {
  resolveErpBase,
  HEALTH_PING_PATH,
  HEALTH_PING_MS,
  TAB_BAR_HEIGHT,
} from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ERP_BASE = resolveErpBase(process.env);
const OFF = { x: -20000, y: 0, width: 10, height: 10 };
const HISTORY_WIDTH = 160;
const ERP_BRIDGE_PAGE_JS = fs.readFileSync(
  path.join(__dirname, "erp-form-bridge-page.js"),
  "utf8",
);

/** @typedef {"home"|"erp"|"bill"} SurfaceMode */

let win = null;
let chrome = null;
let home = null;
let bill = null;
let erp = null;
let hist = null;
/** @type {SurfaceMode} */
let surfaceMode = "home";
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
/** Scratch Amount Due for Doc Bill (not an ERP field). */
let amountDueScratch = "";
/** Last committed Amount Due for dirty compares (focus/typing must not poison). */
let amountDueCommitted = "";
/** Dirty-gate state for Doc Bill surface. */
let dirtyState = {
  isDirty: false,
  isNew: true,
  userEdited: false,
  baselineJson: null,
  doc: null,
};

function prefsPath() {
  return path.join(app.getPath("userData"), "lens-prefs.json");
}
function loadPrefs() {
  try {
    lensPrefs = JSON.parse(fs.readFileSync(prefsPath(), "utf8")) || {};
  } catch {
    lensPrefs = {};
  }
}
function savePrefs() {
  try {
    fs.writeFileSync(prefsPath(), JSON.stringify(lensPrefs));
  } catch {
    /* ignore */
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
    openSiteRoot: () => {
      showErp("/", { forceLoad: true });
      return { showingHome: showingHome() };
    },
    viewBounds: () => ({
      showingHome: showingHome(),
      surfaceMode,
      chrome: chrome ? chrome.getBounds() : null,
      hist: hist ? hist.getBounds() : null,
      home: home ? home.getBounds() : null,
      bill: bill ? bill.getBounds() : null,
      erp: erp ? erp.getBounds() : null,
    }),
    docSkinAvailable: () => hasDocSkin(shellCtx()),
    currentRoute: () => currentRoute,
    execInView: (name, js) => {
      const map = { chrome, home, hist, erp, bill };
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
    lens: surfaceMode === "bill" || showingHome() ? "doc" : "vanilla",
    route: info.path || currentRoute,
    doctype: info.doctype,
    record: info.record,
  };
}

function sendUiState() {
  if (chrome && !chrome.webContents.isDestroyed()) {
    const ctx = shellCtx();
    const onDoc = showingHome() || surfaceMode === "bill";
    chrome.webContents.send("ui-state", {
      showingHome: showingHome(),
      showingBill: surfaceMode === "bill",
      lens: onDoc ? "doc" : "vanilla",
      docSkinAvailable: hasDocSkin(ctx),
      route: ctx.route,
    });
  }
}

function sendHistory() {
  if (hist && !hist.webContents.isDestroyed()) {
    hist.webContents.send("history", history);
  }
}

function pushBillSnapshot(snap) {
  if (bill && !bill.webContents.isDestroyed()) {
    bill.webContents.send("bill-snapshot", snap);
  }
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
  if (surfaceMode === "erp" && changed) sendUiState();
  syncE2eApi();
}

function pollErpRoute() {
  // URL sync for chrome/history when on Vanilla — not a DB poll.
  if (surfaceMode !== "erp" || !erp || erp.webContents.isDestroyed()) return;
  const url = erp.webContents.getURL();
  if (!url || url === lastPolledErpUrl) return;
  lastPolledErpUrl = url;
  trackNav(url);
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

function bumpBillHistory(routePath) {
  history = pushHistory(history, routePath, {
    erpBase: ERP_BASE,
    labels: DOCTYPE_LABELS,
  });
  sendHistory();
}

function place() {
  if (!win || !chrome || !home || !erp || !hist || !bill) return;
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
  erp.setBounds(surfaceMode === "erp" ? main : OFF);
}

async function gateDirtyThen(doNav) {
  if (surfaceMode !== "bill") {
    doNav();
    return;
  }
  const live = await snapshotBill();
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
    const saved = await saveBillFromErp();
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
  gateDirtyThen(() => {
    surfaceMode = "erp";
    const info = routeInfo(route, ERP_BASE);
    currentRoute = info.path || route;
    if (info.doctype === "purchase-invoice") {
      lensPrefs = rememberLens(lensPrefs, "purchase-invoice", "vanilla");
      savePrefs();
    }
    place();
    const target = erpUrl(ERP_BASE, route);
    const cur = erp.webContents.getURL();
    const alreadyOnErp = !!(cur && isAllowedErpUrl(ERP_BASE, cur));
    if (opts.forceLoad || route !== "/desk" || !alreadyOnErp) {
      erp.webContents.loadURL(target);
    }
    sendUiState();
    syncE2eApi();
  });
}

async function showBill(route) {
  const r =
    typeof route === "string" && route
      ? route
      : currentRoute.includes("purchase-invoice")
        ? currentRoute
        : "/app/purchase-invoice/new";

  const proceed = async () => {
    surfaceMode = "bill";
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
    pushBillSnapshot({
      ok: false,
      reason: "Loading Purchase Invoice in Vanilla…",
      doc: null,
      amountDue: "",
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
      if (!amountDueScratch && snap.doc && snap.doc.grand_total != null) {
        amountDueScratch = String(snap.doc.grand_total);
      }
      amountDueCommitted = amountDueScratch;
      try {
        if (bill && !bill.webContents.isDestroyed()) bill.webContents.focus();
      } catch {
        /* ignore */
      }
      pushBillSnapshot({
        ok: true,
        doc: snap.doc,
        amountDue: amountDueScratch,
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
      pushBillSnapshot({ ...snap, focusVendor: false });
    }
    syncE2eApi();
  };

  if (surfaceMode === "bill") {
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
    showBill(target.route);
  }
}

function openEntry(doctypeKey) {
  const t = resolveEntryOpen(doctypeKey || "purchase-invoice", lensPrefs);
  if (t.surface === "doc-form") showBill(t.route);
  else showErp(t.route, { forceLoad: true });
}

async function saveBillFromErp(opts = {}) {
  const submit = !!opts.submit;
  if (!amountDueMatchesGrandTotal(amountDueScratch, dirtyState.doc && dirtyState.doc.grand_total)) {
    return { ok: false, reason: "Amount Due checksum failed." };
  }
  const raw = await erpEval(`(async () => {
    try {
      var f = window.cur_frm;
      if (!f) return { ok: false, reason: "No form." };
      if (f.doc.docstatus !== 0) return { ok: false, reason: "Document is not a draft." };
      try { f.refresh_field("items"); } catch (e) {}
      if (${submit ? "true" : "false"}) {
        await f.save("Submit");
      } else {
        await f.save();
      }
      return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)), submitted: ${submit ? "true" : "false"} };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  if (raw && raw.ok) {
    dirtyState = {
      ...dirtyState,
      doc: raw.doc,
      userEdited: false,
      isDirty: false,
      baselineJson: captureBaseline(raw.doc),
    };
    amountDueCommitted = amountDueScratch;
  }
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "Save failed." };
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
  sendHealth(result.status);
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
    webPreferences: { ...pref, preload: path.join(__dirname, "preload.cjs") },
  });
  home = new WebContentsView({
    webPreferences: { ...pref, preload: path.join(__dirname, "home-preload.cjs") },
  });
  bill = new WebContentsView({
    webPreferences: { ...pref, preload: path.join(__dirname, "bill-preload.cjs") },
  });
  hist = new WebContentsView({
    webPreferences: { ...pref, preload: path.join(__dirname, "history-preload.cjs") },
  });
  erp = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.contentView.addChildView(chrome);
  win.contentView.addChildView(hist);
  win.contentView.addChildView(home);
  win.contentView.addChildView(bill);
  win.contentView.addChildView(erp);

  chrome.webContents.loadFile(path.join(__dirname, "chrome.html"));
  home.webContents.loadFile(path.join(__dirname, "home.html"));
  bill.webContents.loadFile(path.join(__dirname, "bill.html"));
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
    win = null;
    chrome = null;
    home = null;
    bill = null;
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
}));

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
      var prNames = prs.concat(prsD).map(function (r) { return r.name; }).filter(Boolean);
      var prItems = [];
      if (prNames.length) {
        prItems = await frappe.db.get_list("Purchase Receipt Item", {
          filters: { parent: ["in", prNames] },
          fields: ["parent", "purchase_order"],
          limit: 500,
        }) || [];
      }
      return {
        ok: true,
        purchaseOrders: res[0] || [],
        purchaseReceipts: prs,
        purchaseOrdersDraft: res[2] || [],
        purchaseReceiptsDraft: prsD,
        purchaseReceiptItems: prItems,
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
ipcMain.handle("bill-save", async (_e, opts) =>
  saveBillFromErp(opts && typeof opts === "object" ? opts : {}),
);
ipcMain.handle("bill-search-link", async (_e, doctype, txt) => searchLink(doctype, txt));
ipcMain.on("bill-open-vanilla", () => {
  const route = currentRoute.includes("purchase-invoice")
    ? currentRoute
    : "/app/purchase-invoice/new";
  showErp(route, { forceLoad: true });
});

ipcMain.on("go-home", () => showHome());
ipcMain.on("show-launcher", () => showHome());
ipcMain.on("open-doc-skin", () => openDocSkin());
ipcMain.on("open-vanilla-skin", () => {
  const info = routeInfo(currentRoute, ERP_BASE);
  if (info.doctype === "purchase-invoice" && info.record) {
    showErp(currentRoute, { forceLoad: true });
    return;
  }
  showErp("/desk", { forceLoad: false });
});
ipcMain.on("open-entry", (_e, doctypeKey) => openEntry(doctypeKey));
ipcMain.on("open-erp", (_e, route) => {
  const r = typeof route === "string" && route ? route : "/desk";
  const info = routeInfo(r, ERP_BASE);
  if (
    info.doctype === "purchase-invoice" &&
    preferredLens("purchase-invoice", lensPrefs) === "doc" &&
    info.record
  ) {
    showBill(r);
    return;
  }
  showErp(r, { forceLoad: r !== "/desk" });
});
ipcMain.on("open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on("open-devtools", (_e, target) => {
  const map = { erp, chrome, home, hist, bill };
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
