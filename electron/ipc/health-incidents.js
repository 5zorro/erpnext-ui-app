/**
 * Health and incidents: the DB light's beat (one ping every few seconds) and its Diagnose
 * dropdown, the IT recovery settings (notify IT or run IT's own start script), the Navigation and
 * Focus issue dialogs with the incidents they file, and Feedback. Moved out of main.js as it was
 * (plan 2026-10-25 R2-5); main.js calls initHealthIncidents(deps) once. The pure rules are
 * src/health.js, src/diagnose.js, src/health-remediation.js, src/nav-incident.js,
 * src/focus-incident.js and src/feedback-url.js. The two trails (navDebug, focusDebug), the login
 * check and what an incident freezes stay in main.js: they read the whole shell's state.
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  normalizeHealthRemediationPrefs,
  EMPTY_HEALTH_REMEDIATION,
  HEALTH_REMEDIATION_FILENAME,
  remediationUiState,
  applyRemediationSetup,
  isSafeNotifyUrl,
  isAllowedAutofixScriptPath,
  autofixReady,
} from "../../src/health-remediation.js";
import {
  formatNavIncidentContextLines,
  NAV_INCIDENT_NOTE_MAX,
  formatNavIncidentsDigest,
  buildNavIncident,
  serializeNavIncidentLine,
  appendNavIncident,
} from "../../src/nav-incident.js";
import {
  formatFocusIncidentContextLines,
  FOCUS_INCIDENT_NOTE_MAX,
  formatFocusIncidentsDigest,
  buildFocusIncident,
  serializeFocusIncidentLine,
  appendFocusIncident,
} from "../../src/focus-incident.js";
import { TAB_BAR_HEIGHT, HEALTH_PING_PATH } from "../../src/config.js";
import { pingHealth, loginCheckOnHealthChange } from "../../src/health.js";
import {
  appendPingLog,
  formatDiagnoseLines,
  diagnoseCopyText,
  classifyHostClass,
} from "../../src/diagnose.js";
import { formatNavDebugLines } from "../../src/nav-debug.js";
import { formatFocusDebugLines } from "../../src/focus-debug.js";
import { resolveFeedbackFormUrl, buildFeedbackUrl, isPlaceholderFeedbackUrl } from "../../src/feedback-url.js";

/** electron/, where the page files are (this module is in electron/ipc/). */
const ELECTRON_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* What main.js lends (initHealthIncidents). */
let ERP_BASE = "";
let APP_VERSION = "0.0.0";
/** @type {() => import("electron").BrowserWindow|null} */
let mainWindow = () => null;
/** @type {() => string} */
let currentRoute = () => "";
/** The DB light as main.js last sent it. @type {() => "ok"|"bad"|"unknown"} */
let lastHealth = () => "unknown";
/** @type {() => object[]} */
let navDebugLog = () => [];
/** @type {() => object[]} */
let focusDebugLog = () => [];
/** @type {(event: string, detail?: string) => void} */
let navDebug = () => {};
/** @type {(event: string, detail?: string, extras?: object) => void} */
let focusDebug = () => {};
let sendUiState = () => {};
/** @type {(status: string) => void} */
let sendHealth = () => {};
/** @type {(via: string) => Promise<any>} */
let tickLogin = async () => null;
/** What a Navigation issue freezes (main.js reads the whole shell). @type {() => object} */
let collectNavIncidentContext = () => ({});
/** @type {() => object} */
let collectFocusIncidentContext = () => ({});
/** @type {(popover: import("electron").BrowserWindow, closeFn: () => void) => void} */
let bindTransientPopoverDismiss = () => {};
/** @type {() => string} */
let navIncidentLogPath = () => "";
/** @type {() => string} */
let focusIncidentLogPath = () => "";

/**
 * Once, at start-up: what health and incidents borrow from main.js, then their IPC handlers.
 * @param {{ erpBase: string, appVersion: string, mainWindow: typeof mainWindow, currentRoute: typeof currentRoute, lastHealth: typeof lastHealth, navDebugLog: typeof navDebugLog, focusDebugLog: typeof focusDebugLog, navDebug: typeof navDebug, focusDebug: typeof focusDebug, sendUiState: typeof sendUiState, sendHealth: typeof sendHealth, tickLogin: typeof tickLogin, collectNavIncidentContext: typeof collectNavIncidentContext, collectFocusIncidentContext: typeof collectFocusIncidentContext, bindTransientPopoverDismiss: typeof bindTransientPopoverDismiss, navIncidentLogPath: typeof navIncidentLogPath, focusIncidentLogPath: typeof focusIncidentLogPath }} deps
 */
export function initHealthIncidents(deps) {
  ({
    erpBase: ERP_BASE,
    appVersion: APP_VERSION,
    mainWindow,
    currentRoute,
    lastHealth,
    navDebugLog,
    focusDebugLog,
    navDebug,
    focusDebug,
    sendUiState,
    sendHealth,
    tickLogin,
    collectNavIncidentContext,
    collectFocusIncidentContext,
    bindTransientPopoverDismiss,
    navIncidentLogPath,
    focusIncidentLogPath,
  } = deps);
  registerHealthIncidentHandlers();
}

/** Whether the Diagnose dropdown is open (main.js's UI state for the chrome). */
export function diagnoseOpen() {
  return !!(diagnoseWin && !diagnoseWin.isDestroyed());
}

/** At start-up, with main.js's other prefs: the IT recovery settings saved on this PC. */
export function loadHealthRemediation() {
  try {
    healthRemediation = normalizeHealthRemediationPrefs(
      JSON.parse(fs.readFileSync(healthRemediationPath(), "utf8")),
    );
  } catch {
    healthRemediation = { ...EMPTY_HEALTH_REMEDIATION };
  }
}

/** @type {{ status: string, code: number|null, latencyMs: number|null, lastOkAt: string|null, internetOk: boolean|null }} */
let diagnoseState = {
  status: "unknown",
  code: null,
  latencyMs: null,
  lastOkAt: null,
  internetOk: null,
};

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

function healthRemediationPath() {
  return path.join(app.getPath("userData"), HEALTH_REMEDIATION_FILENAME);
}

function saveHealthRemediation() {
  try {
    fs.writeFileSync(healthRemediationPath(), JSON.stringify(healthRemediation, null, 2));
  } catch {
    /* ignore */
  }
}

/** @type {BrowserWindow|null} */
let diagnoseWin = null;

/** @type {import("electron").BrowserWindow|null} */
let navIncidentWin = null;

/** @type {import("electron").BrowserWindow|null} */
let focusIncidentWin = null;

export function closeDiagnoseDropdown() {
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

export function closeNavIncidentDialog() {
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
  if (!mainWindow() || mainWindow().isDestroyed()) return;
  closeDiagnoseDropdown();
  if (navIncidentWin && !navIncidentWin.isDestroyed()) {
    navIncidentWin.focus();
    return;
  }
  navIncidentDraft = collectNavIncidentContext();
  navDebug("nav-incident-open", currentRoute() || "");
  navIncidentWin = new BrowserWindow({
    parent: mainWindow(),
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
      preload: path.join(ELECTRON_DIR, "nav-incident-preload.cjs"),
    },
  });
  navIncidentWin.loadFile(path.join(ELECTRON_DIR, "nav-incident-dialog.html"));
  navIncidentWin.once("ready-to-show", () => {
    if (!navIncidentWin || navIncidentWin.isDestroyed()) return;
    navIncidentWin.webContents.send("nav-incident-data", navIncidentPayload());
    navIncidentWin.show();
    navIncidentWin.focus();
  });
  navIncidentWin.on("closed", () => {
    if (navIncidentDraft) navDebug("nav-incident-cancel", currentRoute() || "");
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
  if (!mainWindow() || mainWindow().isDestroyed()) return;
  closeDiagnoseDropdown();
  if (focusIncidentWin && !focusIncidentWin.isDestroyed()) {
    focusIncidentWin.focus();
    return;
  }
  focusIncidentDraft = collectFocusIncidentContext();
  focusDebug("focus-incident-open", currentRoute() || "", { surface: "main" });
  focusIncidentWin = new BrowserWindow({
    parent: mainWindow(),
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
      preload: path.join(ELECTRON_DIR, "focus-incident-preload.cjs"),
    },
  });
  focusIncidentWin.loadFile(path.join(ELECTRON_DIR, "focus-incident-dialog.html"));
  focusIncidentWin.once("ready-to-show", () => {
    if (!focusIncidentWin || focusIncidentWin.isDestroyed()) return;
    focusIncidentWin.webContents.send("focus-incident-data", focusIncidentPayload());
    focusIncidentWin.show();
    focusIncidentWin.focus();
  });
  focusIncidentWin.on("closed", () => {
    if (focusIncidentDraft) focusDebug("focus-incident-cancel", currentRoute() || "", { surface: "main" });
    focusIncidentDraft = null;
    focusIncidentWin = null;
  });
}

function openDiagnoseDropdown() {
  if (!mainWindow() || mainWindow().isDestroyed()) return;
  if (diagnoseWin && !diagnoseWin.isDestroyed()) {
    diagnoseWin.focus();
    return;
  }
  const snap = diagnoseSnapshot();
  diagnoseWin = new BrowserWindow({
    parent: mainWindow(),
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
      preload: path.join(ELECTRON_DIR, "diagnose-preload.cjs"),
    },
  });
  const wb = mainWindow().getBounds();
  const cb = mainWindow().getContentBounds();
  const frameTop = Math.max(0, wb.height - cb.height);
  // Dropdown under the DB light (top-right of content area).
  const x = Math.round(wb.x + wb.width - 360);
  const y = Math.round(wb.y + frameTop + TAB_BAR_HEIGHT - 4);
  diagnoseWin.setPosition(Math.max(0, x), Math.max(0, y));
  diagnoseWin.loadFile(path.join(ELECTRON_DIR, "diagnose-dropdown.html"));
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

export async function tickHealth() {
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
  const prevHealth = lastHealth();
  sendHealth(result.status);
  // Review 10-19 R4-1: no login question on the beat — it would keep the session from idling out.
  if (loginCheckOnHealthChange(prevHealth, result.status)) {
    tickLogin(prevHealth === "unknown" ? "launch" : "health").catch(() => {});
  }
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
  const navLines = formatNavDebugLines(navDebugLog());
  const incidentLines = formatNavIncidentsDigest(navIncidentRing);
  const focusLines = formatFocusDebugLines(focusDebugLog());
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

function registerHealthIncidentHandlers() {
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
    const parent = mainWindow() && !mainWindow().isDestroyed() ? mainWindow() : undefined;
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
    const parent = mainWindow() && !mainWindow().isDestroyed() ? mainWindow() : undefined;
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

  ipcMain.on("open-diagnose", () => openDiagnoseDropdown());

  ipcMain.on("diagnose-dropdown-close", () => closeDiagnoseDropdown());

  ipcMain.on("diagnose-dropdown-ready", (e) => {
    if (diagnoseWin && !diagnoseWin.isDestroyed() && e.sender === diagnoseWin.webContents) {
      e.sender.send("diagnose-data", diagnoseSnapshot());
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

  ipcMain.handle("open-feedback", async () => {
    try {
      const base = resolveFeedbackFormUrl(process.env);
      const url = buildFeedbackUrl(base, {
        version: APP_VERSION,
        hostClass: classifyHostClass(ERP_BASE),
      });
      if (!mainWindow() || mainWindow().isDestroyed()) {
        await shell.openExternal(url);
        return { ok: true, placeholder: isPlaceholderFeedbackUrl(base), url };
      }
      const { response } = await dialog.showMessageBox(mainWindow(), {
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
      if (mainWindow() && !mainWindow().isDestroyed()) {
        await dialog.showMessageBox(mainWindow(), {
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
}
