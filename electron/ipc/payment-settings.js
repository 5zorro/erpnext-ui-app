/**
 * Payment settings kept on this machine for the Pay Outstanding board: the payment batch prefs
 * (rates, check-run schedule, method fees; the rules are src/payment-batch-prefs.js) and the
 * delay calendar (src/delay-calendar.js parses it; this layer moves strings). Moved out of main.js
 * as it was (plan 2026-10-25 R2-5); main.js calls loadPaymentBatchPrefs() with its other prefs and
 * initPaymentSettings(deps) once. The payment-direction prefs stay in main.js: navigation writes them.
 */
import { app, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { DEFAULT_PAYMENT_BATCH_PREFS, mergePaymentBatchPrefs, validatePaymentBatchPrefs } from "../../src/payment-batch-prefs.js";
import { askSavePath } from "./print.js";

/* What main.js lends (initPaymentSettings). */
/** The shell's main window as it is now. @type {() => import("electron").BrowserWindow | null} */
let mainWindow = () => null;

/**
 * Once, at start-up: what payment settings borrow from main.js, then their IPC handlers.
 * @param {{ mainWindow: typeof mainWindow }} deps
 */
export function initPaymentSettings(deps) {
  ({ mainWindow } = deps);
  registerPaymentSettingsHandlers();
}

/** @type {import("../../src/payment-batch-prefs.js").PaymentBatchPrefs} */
let paymentBatchPrefs = { ...DEFAULT_PAYMENT_BATCH_PREFS };

function paymentBatchPrefsPath() {
  return path.join(app.getPath("userData"), "payment-batch-prefs.json");
}
/** Read the payment batch prefs from userData (main.js's loadPrefs calls this at start-up). */
export function loadPaymentBatchPrefs() {
  try {
    paymentBatchPrefs = mergePaymentBatchPrefs(
      JSON.parse(fs.readFileSync(paymentBatchPrefsPath(), "utf8")),
    );
  } catch {
    paymentBatchPrefs = { ...DEFAULT_PAYMENT_BATCH_PREFS };
  }
}
function savePaymentBatchPrefs() {
  try {
    fs.writeFileSync(paymentBatchPrefsPath(), JSON.stringify(paymentBatchPrefs));
  } catch {
    /* ignore */
  }
}
/**
 * The delay calendar is stored as **CSV, not JSON** (5zorro 2026-09-16: *"perhaps accept
 * spreadsheets but only store as a csv?"*). The stored file is therefore the same artefact the
 * user edits in Excel — they can open this path directly, and an export is a copy rather than a
 * conversion. Parsing and serialising stay in `src/delay-calendar.js`; this layer moves strings.
 */
function delayCalendarPath() {
  return path.join(app.getPath("userData"), "delay-calendar.csv");
}

function registerPaymentSettingsHandlers() {
  ipcMain.handle("get-payment-batch-prefs", () => ({ ...paymentBatchPrefs }));
  ipcMain.handle("set-payment-batch-prefs", (_e, prefs) => {
    const check = validatePaymentBatchPrefs(prefs);
    if (!check.ok) return { ok: false, errors: check.errors, prefs: { ...paymentBatchPrefs } };
    paymentBatchPrefs = mergePaymentBatchPrefs(prefs);
    savePaymentBatchPrefs();
    return { ok: true, prefs: { ...paymentBatchPrefs } };
  });
  /**
   * Delay calendar (P3b/P3c). `exists` is load-bearing, not informational: the renderer only passes
   * the ratified-calendar probe into the date walk when a calendar file exists, because with no file
   * every bridge day would stop applying at once and there would be no UI to turn them back on.
   */
  ipcMain.handle("get-delay-calendar", () => {
    try {
      return { csv: fs.readFileSync(delayCalendarPath(), "utf8"), exists: true };
    } catch {
      return { csv: "", exists: false };
    }
  });
  ipcMain.handle("set-delay-calendar", (_e, csv) => {
    try {
      fs.writeFileSync(delayCalendarPath(), String(csv == null ? "" : csv));
      return { ok: true, exists: true, path: delayCalendarPath() };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
  /** Save-as, for the copy that goes into Excel. The renderer sends the Excel-flavoured text. */
  ipcMain.handle("export-delay-calendar", async (_e, csv) => {
    const r = await askSavePath({
      title: "Export delay calendar",
      defaultPath: path.join(app.getPath("documents"), "delay-calendar.csv"),
      filters: [{ name: "CSV (Excel)", extensions: ["csv"] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(r.filePath, String(csv == null ? "" : csv));
      return { ok: true, path: r.filePath };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
  ipcMain.handle("import-delay-calendar", async () => {
    const r = await dialog.showOpenDialog(mainWindow(), {
      title: "Import delay calendar",
      properties: ["openFile"],
      filters: [{ name: "CSV (Excel)", extensions: ["csv", "txt"] }],
    });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
    try {
      return { ok: true, text: fs.readFileSync(r.filePaths[0], "utf8"), path: r.filePaths[0] };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
}
