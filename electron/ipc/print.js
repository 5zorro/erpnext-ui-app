/**
 * Printing (plan 2026-09-26 "Printing"; the pure rules are src/print-service.js): the print
 * dialog's options, printing in place, the print queue, and the self-healing PDF. Moved out of
 * main.js as it was (plan 2026-10-25 R2-5); main.js calls initPrinting(deps) once, where this
 * block used to be, and reads the rest through the exports below.
 */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  MULTI_PDF_SYNC_MAX,
  addToPrintQueue,
  diagnosePrintFailure,
  isChromiumPrintRefusal,
  osPrintCommand,
  interpretJobStatus,
  paperMismatch,
  parseCupsPaper,
  parseLpJobId,
  printPlan,
  groupPrintQueue,
  mergePrintPrefs,
  multiPdfUrl,
  pdfFileName,
  pdfUrl,
  printBlockReason,
  printerPurposeFor,
  printviewUrl,
  rememberPrintChoice,
  removeFromPrintQueue,
  printerLabel,
  sortPrintersByRecent,
  summarizePrintResults,
} from "../../src/print-service.js";
import { normalizeEditableText } from "../../src/dirty-gate.js";
import { freeFileName } from "../../src/zip-store.js";

/** electron/, where the page files are (an ES module has no `__dirname`; this one is in electron/ipc/). */
const ELECTRON_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* What main.js lends (initPrinting). */
let ERP_BASE = "";
/** @type {(event: string, detail?: string) => void} */
let navDebug = () => {};
/** @type {(js: string) => Promise<any>} */
let erpEval = async () => null;
/** The shell window and the ERPNext view as they are now (each can be made again). */
/** @type {() => import("electron").BrowserWindow | null} */
let mainWindow = () => null;
/** @type {() => import("electron").WebContentsView | null} */
let erpView = () => null;

/** Printing (src/print-service.js): remembered formats / letter head / printers, and the queue. */
let printPrefs = mergePrintPrefs(null);
/** @type {import("../../src/print-service.js").PrintItem[]} */
let printQueue = [];
/**
 * Self-healing printing: the last engine / session fault this session, said in the dialog with its
 * fix until a PDF from ERPNext works again. @type {{ kind: string, cause: string, fix: string, at: string }|null}
 */
let printTrouble = null;
/** Print Settings as last read (the fallback PDF uses ERPNext's page size). */
let lastPrintSettings = {};
/** Once Chromium has refused a silent print this session, go straight to the OS print command. */
let preferOsPrint = false;

/**
 * Once, at start-up: what printing borrows from main.js, then its IPC handlers.
 * @param {{ erpBase: string, navDebug: typeof navDebug, erpEval: typeof erpEval, mainWindow: typeof mainWindow, erpView: typeof erpView }} deps
 */
export function initPrinting(deps) {
  ({ erpBase: ERP_BASE, navDebug, erpEval, mainWindow, erpView } = deps);
  registerPrintHandlers();
}

/** The clerk's remembered print choices, from print-prefs.json (at start-up, with the other prefs). */
export function loadPrintPrefs() {
  try {
    printPrefs = mergePrintPrefs(JSON.parse(fs.readFileSync(printPrefsPath(), "utf8")));
  } catch {
    printPrefs = mergePrintPrefs(null);
  }
}

/** The Print Format last chosen for this doctype ("" = ERPNext's default). @param {string} doctype */
export const printFormatFor = (doctype) => printPrefs.formats[doctype] || "";
/** ERPNext's Print Settings as last read (the fallback PDF uses its page size). */
export const printSettingsAsRead = () => lastPrintSettings;

/** Printing's part of the test-only API (`__erpE2e`, E2E=1). */
export function printE2eApi() {
  return {
  // Printing: ERPNext's PDF through the ERP view's session, without a save dialog (tests only).
  fetchPrintPdf: async (item) => {
    const r = await fetchErpPdf(pdfUrl(ERP_BASE, item || {}));
    return r.ok ? { ok: true, size: r.bytes.length, head: r.bytes.subarray(0, 5).toString("latin1") } : r;
  },
  // Self-healing PDF for one document, without a save dialog (tests only).
  healedPdf: async (item) => {
    const r = await pdfForItem(null, item || {});
    if (r.worker && !r.worker.isDestroyed()) r.worker.destroy();
    return r.ok
      ? { ok: true, healed: !!r.healed, head: Buffer.from(r.bytes).subarray(0, 5).toString("latin1"), trouble: printTrouble }
      : { ok: false, reason: r.reason, trouble: printTrouble };
  },
  getPrintQueue: () => printQueue.map((q) => ({ ...q })),
  setNextSavePath: (p) => {
    e2eNextSavePath = String(p || "");
    return true;
  },
  };
}

export { askSavePath, pdfForItem, newPrintWorker, handleErpPrintRequest };

function printPrefsPath() {
  return path.join(app.getPath("userData"), "print-prefs.json");
}


/** Tests only (E2E=1): the next save dialog answers with this path instead of opening. */
let e2eNextSavePath = "";
/** @param {Electron.SaveDialogOptions} options */
async function askSavePath(options) {
  if (process.env.E2E === "1" && e2eNextSavePath) {
    const filePath = e2eNextSavePath;
    e2eNextSavePath = "";
    return { canceled: false, filePath };
  }
  return dialog.showSaveDialog(mainWindow(), options);
}

function savePrintPrefs() {
  try {
    fs.writeFileSync(printPrefsPath(), JSON.stringify(printPrefs));
  } catch {
    /* ignore */
  }
}

/**
 * What a print dialog needs for one doctype: ERPNext's Print Formats (and its default), Letter
 * Heads, the site's Print Settings, the printers this machine sees, and what was chosen last time.
 * @param {string} doctype ERPNext doctype, e.g. "Purchase Invoice"
 */
async function printOptions(doctype) {
  const dt = normalizeEditableText(doctype);
  const raw = await erpEval(`(async () => {
    try {
      var dt = ${JSON.stringify(dt)};
      var out = { ok: true, formats: [], defaultFormat: "", letterheads: [], defaultLetterhead: "", settings: {} };
      if (dt) {
        var f = await frappe.call({ silent: true, method: "frappe.client.get_list", args: {
          doctype: "Print Format", filters: { doc_type: dt, disabled: 0 }, fields: ["name"], order_by: "name asc", limit_page_length: 0 } });
        out.formats = ((f && f.message) || []).map(function (r) { return r.name; });
        try {
          await frappe.model.with_doctype(dt);
          out.defaultFormat = (frappe.get_meta(dt) || {}).default_print_format || "";
        } catch (e) {}
      }
      var l = await frappe.call({ silent: true, method: "frappe.client.get_list", args: {
        doctype: "Letter Head", filters: { disabled: 0 }, fields: ["name", "is_default"], limit_page_length: 0 } });
      out.letterheads = ((l && l.message) || []).map(function (r) { return r.name; });
      var def = ((l && l.message) || []).find(function (r) { return Number(r.is_default); });
      out.defaultLetterhead = def ? def.name : "";
      var ps = await frappe.call({ silent: true, method: "frappe.client.get", args: { doctype: "Print Settings", name: "Print Settings" } });
      var p = (ps && ps.message) || {};
      out.settings = {
        allow_print_for_draft: p.allow_print_for_draft, allow_print_for_cancelled: p.allow_print_for_cancelled,
        with_letterhead: p.with_letterhead, add_draft_heading: p.add_draft_heading,
        pdf_page_size: p.pdf_page_size,
      };
      return out;
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  /** @type {{ name: string, displayName?: string, isDefault?: boolean }[]} */
  let printers = [];
  try {
    if (mainWindow() && !mainWindow().isDestroyed()) printers = await mainWindow().webContents.getPrintersAsync();
  } catch {
    printers = [];
  }
  const base = raw && typeof raw === "object" ? raw : { ok: false, reason: "Could not read print settings." };
  if (base.settings) lastPrintSettings = base.settings;
  return {
    ...base,
    trouble: printTrouble,
    // The three most recently used first (5zorro 2026-10-03), then the rest as the system lists them.
    printers: sortPrintersByRecent(
      printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: !!p.isDefault,
        // Full name + where it is, so two similar printers can be told apart (never truncated).
        ...printerLabel(p),
      })),
      printPrefs.recentPrinters,
    ).map((p) => ({ ...p, recent: printPrefs.recentPrinters.includes(p.name) })),
    paperByPrinter: Object.fromEntries(
      await Promise.all(printers.map(async (p) => [p.name, await printerPaper(p.name).catch(() => null)])),
    ),
    docPaper: (base.settings && base.settings.pdf_page_size) || "A4",
    printAsImage: printPrefs.printAsImage,
    remembered: {
      format: printPrefs.formats[dt] || "",
      withLetterhead: printPrefs.letterhead[dt],
      printer: printPrefs.printers[printerPurposeFor(dt)] || "",
    },
  };
}

/** One hidden window for printer jobs: never shown (invariant 6), same session as the ERP view. */
function newPrintWorker() {
  return new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
}

/**
 * Load ERPNext's print view for one document and print it. With `deviceName` it prints silently
 * to that printer (a batch, no dialog per document); without, the system print dialog opens.
 * @param {BrowserWindow} worker
 * @param {import("../../src/print-service.js").PrintItem} item
 * @param {{ deviceName?: string }} opts
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function printOneOnWorker(worker, item, opts) {
  const url = printviewUrl(ERP_BASE, item);
  let status = 0;
  const onNav = (_e, _u, code) => {
    status = code || status;
  };
  worker.webContents.on("did-navigate", onNav);
  try {
    await worker.loadURL(url);
  } catch (e) {
    return { ok: false, reason: `Could not load the print view (${String(e && e.message ? e.message : e)}).` };
  } finally {
    worker.webContents.removeListener("did-navigate", onNav);
  }
  if (status >= 400) {
    const msg = await worker.webContents
      .executeJavaScript(`(document.querySelector(".page-content, .error-message, body") || {}).innerText || ""`)
      .catch(() => "");
    return { ok: false, reason: `ERPNext refused (${status})${msg ? `: ${String(msg).trim().slice(0, 160)}` : ""}` };
  }
  // Fonts and images before paper: the page is otherwise printed half-drawn.
  await worker.webContents
    .executeJavaScript(
      `Promise.all([document.fonts ? document.fonts.ready : null, ...Array.from(document.images).map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))]).then(() => true)`,
    )
    .catch(() => {});
  const silent = !!opts.deviceName;
  return printWithTimeout(worker.webContents, {
    silent,
    deviceName: opts.deviceName || undefined,
    printBackground: true,
    // The print view is HTML: on a printer with different paper it lays out on that paper itself.
    ...(opts.pageSize ? { pageSize: opts.pageSize } : {}),
  });
}

/** SumatraPDF on Windows, when installed (SUMATRA_PDF, per-user or machine-wide install). */
function findSumatraPdf() {
  if (process.platform !== "win32") return "";
  const candidates = [
    process.env.SUMATRA_PDF,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "SumatraPDF", "SumatraPDF.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "SumatraPDF", "SumatraPDF.exe"),
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }) || "";
}

/** @type {Map<string, { default: string, supported: string[] }>} per printer, this session */
const printerPaperCache = new Map();

/** Run a command; resolve its stdout (never reject). */
function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, out, errText) => resolve({ ok: !err, out: String(out || ""), err: String(errText || (err && err.message) || "") }));
  });
}

/**
 * The paper a printer loads (printer hardening). CUPS reports it with `lpoptions -l` (default
 * starred); Windows with PowerShell's Get-PrintConfiguration. Unknown → null, and no ⚠ is shown.
 * @param {string} name
 */
async function printerPaper(name) {
  if (!name) return null;
  if (printerPaperCache.has(name)) return printerPaperCache.get(name);
  let paper = null;
  if (process.platform === "linux" || process.platform === "darwin") {
    const r = await run("lpoptions", ["-p", name, "-l"]);
    if (r.ok) paper = parseCupsPaper(r.out);
  } else if (process.platform === "win32") {
    const r = await run("powershell.exe", ["-NoProfile", "-Command", `(Get-PrintConfiguration -PrinterName '${name.replace(/'/g, "''")}').PaperSize`]);
    if (r.ok && r.out.trim()) paper = { default: parseCupsPaper(`PageSize: *${r.out.trim()}`).default, supported: [] };
  }
  if (paper && paper.default) printerPaperCache.set(name, paper);
  return paper && paper.default ? paper : null;
}

/** "Print as image": a hidden page that flattens a PDF onto white at printer resolution. */
async function rasterWorker(bytes) {
  const w = newPrintWorker();
  await w.loadFile(path.join(ELECTRON_DIR, "print-raster.html"));
  for (let i = 0; i < 100; i += 1) {
    if (await w.webContents.executeJavaScript("!!window.rasterReady").catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const info = await w.webContents.executeJavaScript(`window.rasterize(${JSON.stringify(Buffer.from(bytes).toString("base64"))}, 240)`);
  return { worker: w, info };
}

/** @param {Uint8Array|Buffer} bytes @returns {Promise<Buffer>} the same pages, flat */
async function rasterizePdf(bytes) {
  const { worker } = await rasterWorker(bytes);
  try {
    return Buffer.from(await worker.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: "none" } }));
  } finally {
    if (!worker.isDestroyed()) worker.destroy();
  }
}

/**
 * Electron's print with a deadline: a hung driver must not freeze a batch.
 * @param {Electron.WebContents} wc
 * @param {Electron.WebContentsPrintOptions} options
 */
function printWithTimeout(wc, options, ms = 90_000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, reason: "the printer did not answer within 90 seconds" }), ms);
    wc.print(options, (success, failureReason) => {
      clearTimeout(t);
      resolve(success ? { ok: true } : { ok: false, reason: failureReason || "not printed" });
    });
  });
}

/**
 * Self-healing printer path: the document's PDF (ERPNext's, or the app's own when ERPNext's engine
 * is down) handed to the operating system's print command.
 * @param {BrowserWindow|null} worker
 * @param {import("../../src/print-service.js").PrintItem} item
 * @param {string} deviceName
 */
async function printViaOs(worker, item, deviceName, plan = { asImage: false, fitToPage: false, exact: false }) {
  const got = await pdfForItem(worker, item);
  if (!got.ok) return { ok: false, reason: got.reason, worker: got.worker };
  let bytes = got.bytes;
  if (plan.asImage) {
    try {
      bytes = await rasterizePdf(bytes);
    } catch (e) {
      navDebug("print-raster-fail", `${item.name}: ${String(e && e.message ? e.message : e)} — printing the PDF as is`);
    }
  }
  const file = path.join(app.getPath("temp"), `erpnext-ui-print-${Date.now()}-${pdfFileName(item.name)}`);
  fs.writeFileSync(file, bytes);
  const cmd = osPrintCommand({ platform: process.platform, deviceName, file, title: item.name, sumatraPath: findSumatraPdf(), fitToPage: plan.fitToPage, exact: plan.exact });
  if (!cmd) {
    fs.rm(file, () => {});
    // Windows without SumatraPDF: Chromium prints the flattened pages itself.
    if (plan.asImage) {
      const { worker: rw } = await rasterWorker(got.bytes);
      try {
        const r = await printWithTimeout(rw.webContents, { silent: true, deviceName, printBackground: true });
        return { ...r, worker: got.worker };
      } finally {
        if (!rw.isDestroyed()) rw.destroy();
      }
    }
    return { ok: false, reason: "This computer has no print command the app can use (on Windows, install SumatraPDF).", worker: got.worker };
  }
  const res = await new Promise((resolve) => {
    execFile(cmd.cmd, cmd.args, { timeout: 60_000 }, (err, out, errText) =>
      resolve(err ? { ok: false, reason: String(errText || err.message || err).trim().slice(0, 200) } : { ok: true, jobId: parseLpJobId(out) }),
    );
  });
  // lp copies the file into the spool before it returns; the temp copy can go.
  setTimeout(() => fs.rm(file, () => {}), 30_000);
  return { ...res, worker: got.worker, healed: got.healed };
}

/**
 * @param {import("../../src/print-service.js").PrintItem[]} items
 * @param {{ deviceName?: string }} opts
 */
async function printItemsToPrinter(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  // Self-healing: a printer that has gone away (unplugged, renamed, network down) is said up front
  // rather than failing once per document; the jobs stay queued.
  if (opts.deviceName && mainWindow() && !mainWindow().isDestroyed()) {
    const known = await mainWindow().webContents.getPrintersAsync().catch(() => null);
    if (known && !known.some((p) => p.name === opts.deviceName)) {
      const reason = `Printer "${opts.deviceName}" is not available on this computer now.`;
      navDebug("print-done", reason);
      return { ok: false, reason: `${reason} Pick another, or the system dialog — nothing was printed.`, results: list.map((item) => ({ item, ok: false, reason })) };
    }
  }
  const asImage = typeof opts.printAsImage === "boolean" ? opts.printAsImage : printPrefs.printAsImage;
  const paper = opts.deviceName ? await printerPaper(opts.deviceName) : null;
  const mm = paperMismatch(lastPrintSettings.pdf_page_size || "A4", paper);
  navDebug(
    "print-start",
    `${list.length} → ${opts.deviceName || "system dialog"}${opts.deviceName ? ` (as image ${asImage ? "on" : "off"}${mm.mismatch ? `, ${mm.doc} on ${mm.printer}` : ""})` : ""}`,
  );
  const worker = newPrintWorker();
  let pdfWorker = null;
  const results = [];
  const jobs = [];
  try {
    for (const item of list) {
      const plan = printPlan({ doctype: item.doctype, printAsImage: asImage, mismatch: mm.mismatch });
      let r = { ok: false, reason: "" };
      if (opts.deviceName && (plan.asImage || preferOsPrint)) {
        // Print as image (the default) and the OS path both print the document's PDF.
        r = await printViaOs(pdfWorker, item, opts.deviceName, plan);
        pdfWorker = r.worker || pdfWorker;
      } else {
        r = await printOneOnWorker(worker, item, { ...opts, pageSize: plan.fitToPage && !plan.exact ? mm.printer : undefined });
        if (!r.ok && opts.deviceName && isChromiumPrintRefusal(r.reason)) {
          // Self-healing: Chromium refused the printer itself; the OS print command takes over
          // for this document and the rest of the session.
          navDebug("print-heal", `${opts.deviceName}: ${r.reason} → OS print`);
          preferOsPrint = true;
          r = await printViaOs(pdfWorker, item, opts.deviceName, plan);
          pdfWorker = r.worker || pdfWorker;
        }
      }
      if (r.ok && r.jobId) jobs.push({ id: r.jobId, printer: opts.deviceName, name: item.name, sentAt: Date.now() });
      results.push({ item, ok: r.ok, reason: r.reason });
      // The system dialog once is enough: cancelling it stops the batch.
      if (!opts.deviceName && !r.ok && /cancel/i.test(String(r.reason || ""))) break;
    }
  } finally {
    if (!worker.isDestroyed()) worker.destroy();
    if (pdfWorker && !pdfWorker.isDestroyed()) pdfWorker.destroy();
  }
  const summary = summarizePrintResults(results, jobs.length ? "Sent" : "Printed");
  navDebug("print-done", `${summary}${jobs.length ? ` jobs ${jobs.map((j) => j.id).join(",")}` : ""}`);
  return { ok: results.length > 0 && results.every((r) => r.ok), results, summary, jobs };
}

/**
 * Where sent jobs stand (printer hardening): printed, still printing, or the printer stopped and
 * why. CUPS only; elsewhere a sent job reads as done.
 * @param {Array<{ id: string, printer: string, sentAt: number }>} jobs
 */
async function printJobStatus(jobs) {
  const list = Array.isArray(jobs) ? jobs.filter((j) => j && j.id && j.printer) : [];
  if (process.platform !== "linux" && process.platform !== "darwin") return list.map((j) => ({ ...j, state: "done", reason: "" }));
  let reasonsByPrinter = {};
  try {
    const ps = mainWindow() && !mainWindow().isDestroyed() ? await mainWindow().webContents.getPrintersAsync() : [];
    reasonsByPrinter = Object.fromEntries(ps.map((p) => [p.name, (p.options && p.options["printer-state-reasons"]) || ""]));
  } catch {
    reasonsByPrinter = {};
  }
  const out = [];
  for (const j of list) {
    const pending = await run("lpstat", ["-W", "not-completed", "-o", j.printer]);
    const printer = await run("lpstat", ["-l", "-p", j.printer]);
    const st = interpretJobStatus({
      jobId: j.id,
      pendingText: pending.out,
      printerText: printer.out,
      stateReasons: reasonsByPrinter[j.printer] || "",
      waitedMs: Date.now() - (Number(j.sentAt) || Date.now()),
    });
    out.push({ ...j, ...st });
  }
  return out;
}

/**
 * Fetch one of ERPNext's PDFs over the ERP view's own session (it is logged in) and refuse
 * anything that is not a PDF — an error page must never be saved as one.
 * @param {string} url
 */
async function fetchErpPdf(url) {
  if (!erpView() || erpView().webContents.isDestroyed()) return { ok: false, reason: "ERP view not ready." };
  try {
    const res = await erpView().webContents.session.fetch(url);
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !/pdf/i.test(type)) {
      const text = await res.text().catch(() => "");
      let reason = `ERPNext did not return a PDF (${res.status}).`;
      try {
        const j = JSON.parse(text);
        const msgs = j && j._server_messages ? JSON.parse(j._server_messages).map((m) => JSON.parse(m).message).join(" ") : "";
        const said = msgs || (j && (j.exception || j.exc_type)) || "";
        if (said) reason = `ERPNext: ${String(said).replace(/<[^>]+>/g, "").split("\n")[0].slice(0, 240)}`;
      } catch {
        if (text) reason += ` ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}`;
      }
      return { ok: false, reason };
    }
    return { ok: true, bytes: Buffer.from(await res.arrayBuffer()) };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

/**
 * Self-healing: when ERPNext's PDF engine fails (not a rule — see diagnosePrintFailure), make the
 * PDF from ERPNext's own print page with this app's Chromium. Same HTML and print style from
 * ERPNext; only the PDF maker differs (page breaks and headers may differ slightly from
 * wkhtmltopdf's).
 * @param {BrowserWindow} worker
 * @param {import("../../src/print-service.js").PrintItem} item
 */
async function renderPrintviewPdf(worker, item) {
  let status = 0;
  const onNav = (_e, _u, code) => {
    status = code || status;
  };
  worker.webContents.on("did-navigate", onNav);
  try {
    await worker.loadURL(printviewUrl(ERP_BASE, item));
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  } finally {
    worker.webContents.removeListener("did-navigate", onNav);
  }
  if (status >= 400) return { ok: false, reason: `ERPNext refused the print page (${status}).` };
  await worker.webContents
    .executeJavaScript(`(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => true)`)
    .catch(() => {});
  const size = String(lastPrintSettings.pdf_page_size || "A4");
  const pageSize = ["A3", "A4", "A5", "Legal", "Letter", "Tabloid"].includes(size) ? size : "A4";
  try {
    const bytes = await worker.webContents.printToPDF({ printBackground: true, pageSize });
    return { ok: true, bytes };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

/**
 * ERPNext's PDF for one document, healed by the fallback when ERPNext's engine is what failed.
 * @param {BrowserWindow|null} worker reused across a batch; created on first need
 * @param {import("../../src/print-service.js").PrintItem} item
 * @returns {Promise<{ ok: boolean, bytes?: Buffer, reason?: string, healed?: boolean, worker: BrowserWindow|null }>}
 */
async function pdfForItem(worker, item) {
  const got = await fetchErpPdf(pdfUrl(ERP_BASE, item));
  if (got.ok) {
    if (printTrouble && printTrouble.kind === "engine") printTrouble = null;
    return { ...got, worker };
  }
  const d = diagnosePrintFailure(got.reason);
  if (d.kind !== "engine") {
    if (d.kind === "session") printTrouble = { ...d, at: new Date().toISOString() };
    return { ok: false, reason: got.reason, worker };
  }
  printTrouble = { ...d, at: new Date().toISOString() };
  navDebug("pdf-heal", `${item.name}: ${got.reason}`);
  const w = worker || newPrintWorker();
  const made = await renderPrintviewPdf(w, item);
  return made.ok ? { ok: true, bytes: made.bytes, healed: true, worker: w } : { ok: false, reason: `${got.reason}; the app's own PDF failed too: ${made.reason}`, worker: w };
}

/** A sentence for a summary when some PDFs were made by the fallback. */
function healedNote(count) {
  return count
    ? ` ${count === 1 ? "It was" : `${count} were`} made by this app because ERPNext's PDF engine failed — ${printTrouble ? printTrouble.fix : "IT can check the server"}.`
    : "";
}

/**
 * Save ERPNext's PDFs: one merged file, or one file per document in a folder.
 * @param {import("../../src/print-service.js").PrintItem[]} items
 * @param {{ merged?: boolean }} opts
 */
async function saveItemsAsPdf(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { ok: false, reason: "Nothing to save." };
  if (opts.merged || list.length === 1) {
    const defaultName = list.length === 1 ? pdfFileName(list[0].name) : `${pdfFileName(list[0].name).replace(/\.pdf$/, "")}-and-${list.length - 1}-more.pdf`;
    const pick = await askSavePath({
      title: list.length === 1 ? "Save PDF" : `Save ${list.length} documents as one PDF`,
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (pick.canceled || !pick.filePath) return { ok: false, cancelled: true, reason: "Not saved." };
    const first = list[0];
    navDebug("pdf-start", `${list.length} merged → ${pick.filePath}${list.length > MULTI_PDF_SYNC_MAX ? " (large)" : ""}`);
    if (list.length === 1) {
      const one = await pdfForItem(null, first);
      if (one.worker && !one.worker.isDestroyed()) one.worker.destroy();
      if (!one.ok) {
        navDebug("pdf-done", `failed: ${one.reason}`);
        return { ok: false, reason: one.reason, trouble: printTrouble };
      }
      fs.writeFileSync(pick.filePath, one.bytes);
      navDebug("pdf-done", `saved ${pick.filePath}${one.healed ? " (healed)" : ""}`);
      return { ok: true, files: [pick.filePath], summary: `Saved PDF — ${pick.filePath}.${healedNote(one.healed ? 1 : 0)}`, trouble: printTrouble };
    }
    const got = await fetchErpPdf(
      multiPdfUrl(ERP_BASE, list, { format: first.format, noLetterhead: first.noLetterhead, letterhead: first.letterhead }),
    );
    if (got.ok) {
      if (printTrouble && printTrouble.kind === "engine") printTrouble = null;
      fs.writeFileSync(pick.filePath, got.bytes);
      navDebug("pdf-done", `saved ${pick.filePath}`);
      return { ok: true, files: [pick.filePath], summary: `Saved ${list.length} documents as one PDF — ${pick.filePath}` };
    }
    if (diagnosePrintFailure(got.reason).kind !== "engine") {
      navDebug("pdf-done", `failed: ${got.reason}`);
      return { ok: false, reason: got.reason, trouble: printTrouble };
    }
    // Healing a merged file needs a PDF merger this app does not carry: save one file per document
    // beside the chosen one instead, and say so.
    const outcome = await savePdfsEach(list, path.dirname(pick.filePath));
    return { ...outcome, summary: `ERPNext could not make one merged PDF, so each document was saved separately in ${path.dirname(pick.filePath)}. ${outcome.summary}` };
  }
  const dir = await dialog.showOpenDialog(mainWindow(), {
    title: `Save ${list.length} PDFs — one per document`,
    defaultPath: app.getPath("documents"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (dir.canceled || !dir.filePaths || !dir.filePaths[0]) return { ok: false, cancelled: true, reason: "Not saved." };
  navDebug("pdf-start", `${list.length} each → ${dir.filePaths[0]}`);
  return savePdfsEach(list, dir.filePaths[0]);
}

/**
 * One PDF per document into a folder, healing engine failures per document.
 * @param {import("../../src/print-service.js").PrintItem[]} list
 * @param {string} folder
 */
async function savePdfsEach(list, folder) {
  const results = [];
  const files = [];
  let worker = null;
  let healed = 0;
  const used = new Set();
  try {
    for (const item of list) {
      const got = await pdfForItem(worker, item);
      worker = got.worker;
      if (!got.ok) {
        results.push({ item, ok: false, reason: got.reason });
        continue;
      }
      if (got.healed) healed += 1;
      // Never over a file already there, nor over another document of this batch (R11-5).
      const name = freeFileName(pdfFileName(item.name), (c) => used.has(c.toLowerCase()) || fs.existsSync(path.join(folder, c)));
      used.add(name.toLowerCase());
      const file = path.join(folder, name);
      fs.writeFileSync(file, got.bytes);
      files.push(file);
      results.push({ item, ok: true });
    }
  } finally {
    if (worker && !worker.isDestroyed()) worker.destroy();
  }
  const summary = summarizePrintResults(results, "Saved") + healedNote(healed);
  navDebug("pdf-done", summary);
  return { ok: results.every((r) => r.ok), results, files, summary, trouble: printTrouble };
}

/**
 * Frappe tried to open a print window (Vanilla's Print / PDF / list bulk print). Print button →
 * the system dialog, as in a browser; PDF / bulk → a save dialog. Never a popup.
 * @param {NonNullable<ReturnType<typeof classifyErpPrintUrl>>} req
 */
async function handleErpPrintRequest(req) {
  navDebug("print-intercept", `${req.kind} ${req.items.length}`);
  if (req.kind === "printview") return printItemsToPrinter(req.items, {});
  return saveItemsAsPdf(req.items, { merged: req.kind === "multi-pdf" });
}

/** Results for the print dialog: the queue as it stands, grouped. */
function printQueueState() {
  return { ok: true, queue: printQueue.map((q) => ({ ...q })), groups: groupPrintQueue(printQueue) };
}

function registerPrintHandlers() {
  ipcMain.handle("print-options", async (_e, doctype) => printOptions(doctype));
  ipcMain.handle("print-block-reason", async (_e, doc, settings) => printBlockReason(doc, settings));
  /**
   * Print or save, in place (the page never moves). `remember` stores the clerk's choices per
   * doctype / purpose (print-prefs.json), never on the site.
   */
  ipcMain.handle("print-run", async (_e, req) => {
    const r = req && typeof req === "object" ? req : {};
    const items = Array.isArray(r.items) ? r.items.filter((i) => i && i.doctype && i.name) : [];
    if (!items.length) return { ok: false, reason: "Nothing to print." };
    if (r.remember && typeof r.remember === "object") {
      printPrefs = rememberPrintChoice(printPrefs, r.remember);
      savePrintPrefs();
    }
    if (r.dest === "printer") {
      return printItemsToPrinter(items, { deviceName: r.deviceName || "", printAsImage: typeof r.printAsImage === "boolean" ? r.printAsImage : undefined });
    }
    return saveItemsAsPdf(items, { merged: r.dest === "pdf-merged" });
  });
  ipcMain.handle("print-queue-get", async () => printQueueState());
  ipcMain.handle("print-job-status", async (_e, jobs) => printJobStatus(jobs));
  ipcMain.handle("print-queue-add", async (_e, items) => {
    // An item queued without a format (a check run) takes the one last chosen for its doctype.
    const withFormats = (Array.isArray(items) ? items : []).map((it) =>
      it && !it.format && printPrefs.formats[it.doctype] ? { ...it, format: printPrefs.formats[it.doctype] } : it,
    );
    const r = addToPrintQueue(printQueue, withFormats);
    printQueue = r.queue;
    navDebug("print-queue-add", `+${r.added}${r.refused ? ` (${r.refused} over the limit)` : ""} = ${printQueue.length}`);
    return { ...printQueueState(), added: r.added, refused: r.refused };
  });
  ipcMain.handle("print-queue-remove", async (_e, items) => {
    printQueue = removeFromPrintQueue(printQueue, Array.isArray(items) ? items : []);
    return printQueueState();
  });
  ipcMain.handle("print-queue-clear", async () => {
    printQueue = [];
    return printQueueState();
  });
  /**
   * Run the queue (or part of it): print to the printer, one merged PDF, or one PDF each. What
   * succeeded leaves the queue; what failed stays, with its reason in the summary.
   */
  ipcMain.handle("print-queue-run", async (_e, req) => {
    const r = req && typeof req === "object" ? req : {};
    const pick = Array.isArray(r.items) && r.items.length ? removeFromPrintQueue(printQueue, removeFromPrintQueue(printQueue, r.items)) : printQueue.slice();
    if (!pick.length) return { ok: false, reason: "The print queue is empty." };
    if (r.dest === "printer" && r.deviceName) {
      printPrefs = rememberPrintChoice(printPrefs, { deviceName: r.deviceName });
      savePrintPrefs();
    }
    const out =
      r.dest === "printer"
        ? await printItemsToPrinter(pick, { deviceName: r.deviceName || "", printAsImage: typeof r.printAsImage === "boolean" ? r.printAsImage : undefined })
        : await saveItemsAsPdf(pick, { merged: r.dest === "pdf-merged" });
    const done = out.results ? out.results.filter((x) => x.ok).map((x) => x.item) : out.ok ? pick : [];
    printQueue = removeFromPrintQueue(printQueue, done);
    return { ...out, ...printQueueState() };
  });
}
