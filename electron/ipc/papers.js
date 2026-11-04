/**
 * Papers — the compare pane (plan 2026-09-26 "Compare pane"; the pure rules are
 * src/compare-papers.js): a document's attachments listed, read, uploaded, opened in the system's
 * viewer, downloaded, zipped, or drawn into one PDF with the document as ERPNext prints it. Moved
 * out of main.js as it was (plan 2026-10-25 R2-5); main.js calls initPapers(deps) once.
 */
import { app, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { MAX_PAPER_BYTES, MAX_OPEN_BYTES, frappeDownloadPath, openablePaper, INTERNET_ZONE_MARK, isErpFilePath } from "../../src/compare-papers.js";
import { buildZip, plainFileName } from "../../src/zip-store.js";
import { pdfFileName } from "../../src/print-service.js";
import { normalizeEditableText } from "../../src/dirty-gate.js";
import { askSavePath, printFormatFor, pdfForItem, printSettingsAsRead, newPrintWorker } from "./print.js";

/* What main.js lends (initPapers). */
let ERP_BASE = "";
/** @type {(event: string, detail?: string) => void} */
let navDebug = () => {};
/** @type {(js: string) => Promise<any>} */
let erpEval = async () => null;
/** The ERPNext view as it is now (it can be made again). @type {() => import("electron").WebContentsView | null} */
let erpView = () => null;

/**
 * Once, at start-up: what Papers borrows from main.js, then its IPC handlers.
 * @param {{ erpBase: string, navDebug: typeof navDebug, erpEval: typeof erpEval, erpView: typeof erpView }} deps
 */
export function initPapers(deps) {
  ({ erpBase: ERP_BASE, navDebug, erpEval, erpView } = deps);
  registerPapersHandlers();
}

/**
 * Attachments of these documents (ERPNext `File` rows), newest metadata only — the bytes come one
 * file at a time through papers-bytes.
 * @param {Array<{ doctype: string, name: string }>} sources
 */
async function listPapers(sources) {
  const list = (Array.isArray(sources) ? sources : [])
    .filter((s) => s && s.doctype && s.name)
    .slice(0, 20)
    .map((s) => ({ doctype: String(s.doctype), name: String(s.name) }));
  if (!list.length) return { ok: true, files: [] };
  const raw = await erpEval(`(async () => {
    try {
      var out = [];
      for (var s of ${JSON.stringify(list)}) {
        var r = await frappe.call({ silent: true, method: "frappe.client.get_list", args: {
          doctype: "File",
          filters: { attached_to_doctype: s.doctype, attached_to_name: s.name, is_folder: 0 },
          fields: ["name", "file_name", "file_url", "is_private", "creation", "file_size", "attached_to_doctype", "attached_to_name"],
          order_by: "creation asc", limit_page_length: 100 } });
        out.push.apply(out, (r && r.message) || []);
      }
      return { ok: true, files: out };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), files: [] };
    }
  })()`);
  return raw && typeof raw === "object" ? raw : { ok: false, reason: "Could not list attachments.", files: [] };
}

/** One attachment's bytes over the ERP view's session (private files need it). */
/** @param {number} maxBytes */
function tooLargeReason(maxBytes) {
  return maxBytes > MAX_PAPER_BYTES
    ? `Too large for the app (over ${Math.round(maxBytes / 1048576)} MB) — download it from ERPNext in a browser.`
    : "Too large to show here — open it instead.";
}

/**
 * The bytes of an ERPNext file over the clerk's session. The 25 MB default is the pane's preview
 * limit; Open and Download pass MAX_OPEN_BYTES, or a 30 MB scan could be neither shown nor opened.
 */
async function paperBytes(fileUrl, maxBytes = MAX_PAPER_BYTES) {
  const u = String(fileUrl || "");
  if (!isErpFilePath(u)) return { ok: false, reason: "Not an ERPNext file address." };
  if (!erpView() || erpView().webContents.isDestroyed()) return { ok: false, reason: "ERP view not ready." };
  try {
    let res = await erpView().webContents.session.fetch(`${ERP_BASE}${encodeURI(decodeURI(u))}`);
    if (!res.ok) {
      // The file's own address will not serve it (a private .html — see frappeDownloadPath): ask
      // Frappe's download method, which checks the same permission.
      const first = res.status;
      res = await erpView().webContents.session.fetch(`${ERP_BASE}${frappeDownloadPath(u)}`);
      navDebug("paper-bytes-fallback", `${u} (${first}) → download_file ${res.status}`);
    }
    if (!res.ok) return { ok: false, reason: `ERPNext could not send the file (${res.status}).` };
    // Refuse a big file before reading it, when the server says its size (R11-4).
    if (Number(res.headers.get("content-length")) > maxBytes) return { ok: false, reason: tooLargeReason(maxBytes) };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return { ok: false, reason: tooLargeReason(maxBytes) };
    return { ok: true, bytes: new Uint8Array(buf), type: res.headers.get("content-type") || "" };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

/**
 * Attach a dropped file to the document in ERPNext (private), the way Desk's own Attach does —
 * Frappe's upload_file from the logged-in page, CSRF token and all. Logged both sides (it writes).
 * @param {{ doctype?: string, name?: string, fileName?: string, bytes?: Uint8Array }} req
 */
async function uploadPaper(req) {
  const r = req || {};
  const doctype = normalizeEditableText(r.doctype);
  const name = normalizeEditableText(r.name);
  const fileName = normalizeEditableText(r.fileName) || "paper";
  if (!doctype || !name || /^new-/.test(name)) return { ok: false, reason: "Save the document first — ERPNext attaches files to a saved document." };
  const bytes = r.bytes ? Buffer.from(r.bytes) : null;
  if (!bytes || !bytes.length) return { ok: false, reason: "Empty file." };
  if (bytes.length > MAX_PAPER_BYTES) return { ok: false, reason: "Too large (25 MB at most)." };
  navDebug("paper-upload", `${doctype} ${name} ← ${fileName} (${bytes.length} bytes) start`);
  const raw = await erpEval(`(async () => {
    try {
      var b64 = ${JSON.stringify(bytes.toString("base64"))};
      var bin = atob(b64); var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var fd = new FormData();
      fd.append("file", new Blob([arr]), ${JSON.stringify(fileName)});
      fd.append("is_private", "1");
      fd.append("doctype", ${JSON.stringify(doctype)});
      fd.append("docname", ${JSON.stringify(name)});
      var res = await fetch("/api/method/upload_file", { method: "POST", body: fd,
        headers: { "X-Frappe-CSRF-Token": frappe.csrf_token, Accept: "application/json" } });
      var j = await res.json().catch(function () { return {}; });
      if (!res.ok || !j.message) {
        var msg = "";
        try { msg = JSON.parse(JSON.parse(j._server_messages)[0]).message; } catch (e) {}
        return { ok: false, reason: msg || j.exception || ("upload failed (" + res.status + ")") };
      }
      return { ok: true, file: { name: j.message.name, file_name: j.message.file_name, file_url: j.message.file_url, creation: j.message.creation } };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  })()`);
  const res = raw && typeof raw === "object" ? raw : { ok: false, reason: "Upload failed." };
  navDebug("paper-upload", `${doctype} ${name} ← ${fileName} ${res.ok ? `ok ${res.file && res.file.file_url}` : `failed: ${res.reason}`}`);
  return res;
}

/** Open a paper in the system's own viewer (a temp copy). */
/**
 * Windows: mark a file written from ERPNext's bytes as downloaded from the internet, as a browser
 * would, so SmartScreen and Office's Protected View / macro block treat it that way (review
 * 2026-10-19, R11-2). Elsewhere, and if the disk refuses the mark, nothing changes.
 * @param {string} file
 */
function markFromInternet(file) {
  if (process.platform !== "win32") return;
  try {
    fs.writeFileSync(`${file}:Zone.Identifier`, INTERNET_ZONE_MARK);
  } catch (e) {
    navDebug("paper-zone-mark-err", `${file}: ${String(e && e.message ? e.message : e)}`);
  }
}

async function openPaper(req) {
  const r = req || {};
  // Documents only: the OS picks the program by extension, and an attached .exe would run.
  const allowed = openablePaper(r.fileName);
  if (!allowed.ok) {
    navDebug("paper-open-refused", String(r.fileName || ""));
    return { ok: false, reason: allowed.reason };
  }
  let bytes = r.bytes ? Buffer.from(r.bytes) : null;
  if (!bytes && r.fileUrl) {
    const got = await paperBytes(r.fileUrl, MAX_OPEN_BYTES);
    if (!got.ok) return got;
    bytes = Buffer.from(got.bytes);
  }
  if (!bytes) return { ok: false, reason: "Nothing to open." };
  const file = path.join(app.getPath("temp"), `erpnext-ui-paper-${Date.now()}-${allowed.localName}`);
  fs.writeFileSync(file, bytes);
  markFromInternet(file);
  const err = await shell.openPath(file);
  return err ? { ok: false, reason: err } : { ok: true };
}

/**
 * Download one attachment (5zorro 2026-10-12, the attachments table under the notes): the clerk
 * picks where; the bytes come over the ERP view's session, as for the Papers pane. Writes only the
 * local file chosen.
 * @param {{ fileUrl?: string, fileName?: string }} req
 */
async function downloadPaper(req) {
  const r = req || {};
  const safe = plainFileName(r.fileName || "attachment").replace(/[\\/:*?"<>|]+/g, "-") || "attachment";
  const pick = await askSavePath({ title: "Download attachment", defaultPath: path.join(app.getPath("downloads"), safe) });
  if (pick.canceled || !pick.filePath) return { ok: false, cancelled: true, reason: "Not saved." };
  const got = await paperBytes(r.fileUrl, MAX_OPEN_BYTES);
  if (!got.ok) {
    navDebug("paper-download", `${r.fileUrl} failed: ${got.reason}`);
    return got;
  }
  try {
    fs.writeFileSync(pick.filePath, Buffer.from(got.bytes));
    markFromInternet(pick.filePath);
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
  navDebug("paper-download", `${r.fileUrl} → ${pick.filePath}`);
  return { ok: true, path: pick.filePath };
}

/**
 * "Save all as ZIP" (5zorro 2026-10-03): the papers shown in the pane, and — when asked — the
 * document itself as ERPNext prints it (its PO / receipt too), in one .zip. Printed PDFs go through
 * the self-healing PDF path. Writes only the local file the clerk chooses.
 * @param {{ zipName?: string, papers?: Array<{ fileName: string, fileUrl?: string, bytes?: Uint8Array }>, printDocs?: Array<{ doctype: string, name: string }> }} req
 */
async function zipPapers(req) {
  const r = req || {};
  const papers = Array.isArray(r.papers) ? r.papers : [];
  const docs = Array.isArray(r.printDocs) ? r.printDocs.filter((d) => d && d.doctype && d.name) : [];
  if (!papers.length && !docs.length) return { ok: false, reason: "Nothing to save." };
  const pick = await askSavePath({
    title: "Save all as ZIP",
    defaultPath: path.join(app.getPath("documents"), `${String(r.zipName || "papers").replace(/[\\/:*?"<>|]+/g, "-")}.zip`),
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (pick.canceled || !pick.filePath) return { ok: false, cancelled: true, reason: "Not saved." };
  navDebug("papers-zip", `${docs.length} printed + ${papers.length} papers → ${pick.filePath} start`);
  const files = [];
  const missed = [];
  let worker = null;
  try {
    for (const d of docs) {
      const got = await pdfForItem(worker, { doctype: d.doctype, name: d.name, format: printFormatFor(d.doctype) });
      worker = got.worker;
      if (got.ok) files.push({ name: pdfFileName(d.name), bytes: new Uint8Array(got.bytes) });
      else missed.push(`${d.name}: ${got.reason}`);
    }
  } finally {
    if (worker && !worker.isDestroyed()) worker.destroy();
  }
  for (const p of papers) {
    if (p.bytes) {
      files.push({ name: p.fileName, bytes: new Uint8Array(p.bytes) });
      continue;
    }
    const got = await paperBytes(p.fileUrl, MAX_OPEN_BYTES);
    if (got.ok) files.push({ name: p.fileName, bytes: got.bytes });
    else missed.push(`${p.fileName}: ${got.reason}`);
  }
  if (!files.length) return { ok: false, reason: `Nothing could be read — ${missed.join("; ")}` };
  fs.writeFileSync(pick.filePath, buildZip(files));
  const summary = `Saved ${files.length} file${files.length === 1 ? "" : "s"} in ${pick.filePath}${missed.length ? ` — not included: ${missed.join("; ")}` : "."}`;
  navDebug("papers-zip", summary);
  return { ok: !missed.length, files: files.length, summary };
}

function registerPapersHandlers() {
  ipcMain.handle("papers-zip", async (_e, req) => zipPapers(req));

  /** The document as ERPNext prints it (self-healing), for the pane to draw into one PDF. */
  ipcMain.handle("papers-printed-pdf", async (_e, d) => {
    if (!d || !d.doctype || !d.name) return { ok: false, reason: "No document." };
    const got = await pdfForItem(null, { doctype: d.doctype, name: d.name, format: printFormatFor(d.doctype) });
    if (got.worker && !got.worker.isDestroyed()) got.worker.destroy();
    return got.ok ? { ok: true, bytes: new Uint8Array(got.bytes), healed: !!got.healed } : { ok: false, reason: got.reason };
  });

  /**
   * "Save as one PDF" (5zorro 2026-10-03): the pane hands over one HTML page with every paper laid
   * out page after page (PDF pages already drawn as images); Chromium prints it to a single PDF. No
   * PDF merger needed. Writes only the local file the clerk chooses.
   * @param {{ html?: string, fileName?: string }} req
   */
  ipcMain.handle("papers-pdf", async (_e, req) => {
    const r = req || {};
    if (!r.html) return { ok: false, reason: "Nothing to save." };
    const pick = await askSavePath({
      title: "Save as one PDF",
      defaultPath: path.join(app.getPath("documents"), `${String(r.fileName || "papers").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (pick.canceled || !pick.filePath) return { ok: false, cancelled: true, reason: "Not saved." };
    navDebug("papers-pdf", `→ ${pick.filePath} start`);
    const page = path.join(app.getPath("temp"), `erpnext-ui-papers-${Date.now()}.html`);
    fs.writeFileSync(page, r.html);
    const worker = newPrintWorker();
    try {
      await worker.loadFile(page);
      await worker.webContents
        .executeJavaScript(`Promise.all(Array.from(document.images).map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))).then(() => true)`)
        .catch(() => {});
      const size = String(printSettingsAsRead().pdf_page_size || "A4");
      const pageSize = ["A3", "A4", "A5", "Legal", "Letter", "Tabloid"].includes(size) ? size : "A4";
      const bytes = await worker.webContents.printToPDF({ printBackground: true, pageSize });
      fs.writeFileSync(pick.filePath, bytes);
      navDebug("papers-pdf", `saved ${pick.filePath}`);
      return { ok: true, summary: `Saved as one PDF — ${pick.filePath}` };
    } catch (e) {
      const reason = String(e && e.message ? e.message : e);
      navDebug("papers-pdf", `failed: ${reason}`);
      return { ok: false, reason };
    } finally {
      if (!worker.isDestroyed()) worker.destroy();
      fs.rm(page, () => {});
    }
  });
  ipcMain.handle("papers-list", async (_e, sources) => listPapers(sources));
  ipcMain.handle("papers-bytes", async (_e, fileUrl) => paperBytes(fileUrl));
  ipcMain.handle("papers-upload", async (_e, req) => uploadPaper(req));
  ipcMain.handle("papers-open", async (_e, req) => openPaper(req));
  ipcMain.handle("papers-download", async (_e, req) => downloadPaper(req));
}
