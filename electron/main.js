/**
 * Electron main — M0: toolbar + Home + live ERPNext (login/desk) + DB health.
 */
import { app, BrowserWindow, WebContentsView, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pingHealth } from "../src/health.js";
import { isAllowedErpUrl, erpUrl } from "../src/nav-guard.js";
import {
  resolveErpBase,
  HEALTH_PING_PATH,
  HEALTH_PING_MS,
  TAB_BAR_HEIGHT,
} from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ERP_BASE = resolveErpBase(process.env);
const OFF = { x: -20000, y: 0, width: 10, height: 10 };

let win = null;
let chrome = null;
let home = null;
let erp = null;
let showingHome = true;
let healthTimer = null;

function sendHealth(status) {
  if (chrome && !chrome.webContents.isDestroyed()) {
    chrome.webContents.send("health", status);
  }
}

function sendUiState() {
  if (chrome && !chrome.webContents.isDestroyed()) {
    chrome.webContents.send("ui-state", { showingHome, lens: "vanilla" });
  }
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
  if (!win || !chrome || !home || !erp) return;
  const b = win.getContentBounds();
  const H = TAB_BAR_HEIGHT;
  const main = { x: 0, y: H, width: b.width, height: Math.max(100, b.height - H) };
  chrome.setBounds({ x: 0, y: 0, width: b.width, height: H });
  home.setBounds(showingHome ? main : OFF);
  erp.setBounds(showingHome ? OFF : main);
}

function showHome() {
  showingHome = true;
  place();
  sendUiState();
}

function showErp(route = "/desk") {
  showingHome = false;
  place();
  const target = erpUrl(ERP_BASE, route);
  const cur = erp.webContents.getURL();
  // Reload if empty or not on ERP yet; otherwise just reveal (keeps login session)
  if (!cur || cur === "about:blank" || !isAllowedErpUrl(ERP_BASE, cur)) {
    erp.webContents.loadURL(target);
  }
  sendUiState();
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
  erp = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // ERPNext is remote content — keep sandbox defaults
    },
  });

  win.contentView.addChildView(chrome);
  win.contentView.addChildView(home);
  win.contentView.addChildView(erp);

  chrome.webContents.loadFile(path.join(__dirname, "chrome.html"));
  home.webContents.loadFile(path.join(__dirname, "home.html"));
  // Start ERP loading in background so login page is warm when user leaves Home
  erp.webContents.loadURL(erpUrl(ERP_BASE, "/desk"));

  erp.webContents.setWindowOpenHandler(({ url }) =>
    isAllowedErpUrl(ERP_BASE, url) ? { action: "allow" } : { action: "deny" },
  );
  erp.webContents.on("will-navigate", (e, url) => {
    if (!isAllowedErpUrl(ERP_BASE, url)) e.preventDefault();
  });

  place();
  win.on("resize", place);
  win.on("closed", () => {
    win = null;
    chrome = null;
    home = null;
    erp = null;
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
  });

  chrome.webContents.on("did-finish-load", () => {
    sendUiState();
    tickHealth();
  });

  showHome();
  healthTimer = setInterval(tickHealth, HEALTH_PING_MS);
}

ipcMain.handle("get-config", () => ({
  erpBase: ERP_BASE,
  repo: "https://github.com/5zorro/erpnext-ui-app",
}));

ipcMain.on("go-home", () => showHome());
ipcMain.on("open-erp", (_e, route) => showErp(typeof route === "string" ? route : "/desk"));
ipcMain.on("open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
