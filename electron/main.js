/**
 * Electron main — M0 chrome + live ERPNext; M1 history; M2 launcher tiles + DevTools.
 */
import { app, BrowserWindow, WebContentsView, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pingHealth } from "../src/health.js";
import { isAllowedErpUrl, erpUrl } from "../src/nav-guard.js";
import { pushHistory } from "../src/history.js";
import { DOCTYPE_LABELS } from "../src/doctype-labels.js";
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

let win = null;
let chrome = null;
let home = null;
let erp = null;
let hist = null;
let showingHome = true;
let healthTimer = null;
/** @type {"ok"|"bad"|"unknown"} */
let lastHealth = "unknown";
/** @type {import("../src/history.js").HistoryEntry[]} */
let history = [];

const OFF_SENTINEL_X = -20000;

/**
 * E2E=1 only: Playwright cannot reliably drive WebContentsView as Pages
 * (see e2e/GOTCHAS.md). Expose a main-process test surface instead.
 */
function syncE2eApi() {
  if (process.env.E2E !== "1") return;
  globalThis.__erpE2e = {
    lastHealth,
    showingHome,
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
      return { showingHome };
    },
    goHome: () => {
      showErp("/", { forceLoad: true });
      return { showingHome };
    },
    openErp: (route) => {
      showErp(route || "/desk", { forceLoad: true });
      return { showingHome };
    },
    viewBounds: () => ({
      showingHome,
      chrome: chrome ? chrome.getBounds() : null,
      hist: hist ? hist.getBounds() : null,
      home: home ? home.getBounds() : null,
      erp: erp ? erp.getBounds() : null,
    }),
    /** Run JS in a named WebContentsView (chrome|home|hist|erp). */
    execInView: (name, js) => {
      const map = { chrome, home, hist, erp };
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

function sendUiState() {
  if (chrome && !chrome.webContents.isDestroyed()) {
    chrome.webContents.send("ui-state", { showingHome, lens: "vanilla" });
  }
}

function sendHistory() {
  if (hist && !hist.webContents.isDestroyed()) {
    hist.webContents.send("history", history);
  }
}

function trackNav(url) {
  if (typeof url !== "string" || !isAllowedErpUrl(ERP_BASE, url)) return;
  history = pushHistory(history, url, {
    erpBase: ERP_BASE,
    labels: DOCTYPE_LABELS,
  });
  sendHistory();
  syncE2eApi();
}

async function tickHealth() {
  const result = await pingHealth({
    erpBase: ERP_BASE,
    pingPath: HEALTH_PING_PATH,
    timeoutMs: 3000,
  });
  sendHealth(result.status);
}

function place() {
  if (!win || !chrome || !home || !erp || !hist) return;
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
  home.setBounds(showingHome ? main : OFF);
  erp.setBounds(showingHome ? OFF : main);
}

function showHome() {
  showingHome = true;
  place();
  sendUiState();
  syncE2eApi();
}

function showErp(route = "/desk", opts = {}) {
  showingHome = false;
  place();
  const target = erpUrl(ERP_BASE, route);
  const cur = erp.webContents.getURL();
  const alreadyOnErp = !!(cur && isAllowedErpUrl(ERP_BASE, cur));
  // Load when forced, when opening a specific route, or when ERP is not ready yet.
  // Bare /desk + already on ERP → just reveal (keeps login + current page).
  if (opts.forceLoad || route !== "/desk" || !alreadyOnErp) {
    erp.webContents.loadURL(target);
  }
  sendUiState();
  syncE2eApi();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: "erpnext-ui-app",
    backgroundColor: "#2c3e50",
  });

  chrome = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  home = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "home-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  hist = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "history-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
  win.contentView.addChildView(erp);

  chrome.webContents.loadFile(path.join(__dirname, "chrome.html"));
  home.webContents.loadFile(path.join(__dirname, "home.html"));
  hist.webContents.loadFile(path.join(__dirname, "history.html"));
  erp.webContents.loadURL(erpUrl(ERP_BASE, "/desk"));

  // Playwright Electron attaches to BrowserWindow pages; our UI is WebContentsView-only.
  // E2E=1 loads a tiny probe so launch can complete; health still comes from real ping → __erpE2e.
  if (process.env.E2E === "1") {
    win.loadFile(path.join(__dirname, "..", "e2e", "probe.html"));
  }

  erp.webContents.setWindowOpenHandler(({ url }) =>
    isAllowedErpUrl(ERP_BASE, url) ? { action: "allow" } : { action: "deny" },
  );
  erp.webContents.on("will-navigate", (e, url) => {
    if (!isAllowedErpUrl(ERP_BASE, url)) e.preventDefault();
  });
  erp.webContents.on("did-navigate", (_e, url) => trackNav(url));
  erp.webContents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (isMainFrame) trackNav(url);
  });

  place();
  win.on("resize", place);
  win.on("closed", () => {
    win = null;
    chrome = null;
    home = null;
    erp = null;
    hist = null;
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
  });

  chrome.webContents.on("did-finish-load", () => {
    sendUiState();
    tickHealth();
  });
  hist.webContents.on("did-finish-load", () => sendHistory());

  showHome();
  healthTimer = setInterval(tickHealth, HEALTH_PING_MS);
  syncE2eApi();
}

ipcMain.handle("get-config", () => ({
  erpBase: ERP_BASE,
  repo: "https://github.com/5zorro/erpnext-ui-app",
}));

// Toolbar Home → ERP site root (same as opening localhost:8080/), not the splash page.
ipcMain.on("go-home", () => showErp("/", { forceLoad: true }));
ipcMain.on("show-launcher", () => showHome());
ipcMain.on("open-erp", (_e, route) => {
  const r = typeof route === "string" && route ? route : "/desk";
  showErp(r, { forceLoad: r !== "/desk" });
});
ipcMain.on("open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on("open-devtools", (_e, target) => {
  const map = { erp, chrome, home, hist };
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
