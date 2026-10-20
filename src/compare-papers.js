/**
 * Compare pane (plan 2026-09-26 "Compare pane", 5zorro 2026-10-03): beside a Doc skin, the papers
 * the document should match — scans, phone photos, Word files — stacked as one continuous column,
 * as if a single PDF. Pure: what a file is, where it came from, the order, the layout.
 */

import { plainFileName } from "./zip-store.js";

/** Window width from which the pane sits beside the document instead of over it. */
export const SIDE_BY_SIDE_MIN_PX = 1700;
/** The narrowest pane worth showing beside the document. */
export const PANE_MIN_PX = 520;
/** One dropped file at most — ERPNext's own default upload limit is 10 MB; this stays under 25. */
export const MAX_PAPER_BYTES = 25 * 1024 * 1024;

const str = (v) => (v == null ? "" : String(v).trim());

/**
 * How a file is shown.
 * @param {string} fileName
 * @param {string} [mime]
 * @returns {"pdf"|"image"|"docx"|"sheet"|"heic"|"other"}
 */
export function paperKind(fileName, mime = "") {
  const ext = (str(fileName).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  const m = str(mime).toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (ext === "heic" || ext === "heif" || /heic|heif/.test(m)) return "heic";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext) || /^image\//.test(m)) return "image";
  if (ext === "docx" || m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  // Shown as a table when it fits one page (sheet-preview.js); old binary .xls cannot be read.
  if (["csv", "tsv", "xlsx", "xlsm"].includes(ext) || m === "text/csv") return "sheet";
  return "other";
}

/**
 * The kinds of paper **Open** hands to the operating system (architecture review 2026-10-19,
 * R11-2). Documents only: the OS picks the program by extension, and on Windows an attached
 * `.exe`, `.bat`, `.js`, `.lnk`, `.hta` … would *run*. Office's macro formats are allowed because
 * main also marks the copy as downloaded from the internet, which keeps Office's own macro block on;
 * `.html` / `.svg` open in a browser, which sandboxes them. Anything else: Download, look, decide.
 */
export const OPENABLE_PAPER_EXTS = Object.freeze([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "svg",
  "docx", "doc", "odt", "rtf", "xlsx", "xlsm", "xls", "ods", "csv", "tsv", "txt", "html", "htm",
]);

/**
 * May **Open** hand this paper to the operating system, and under what local name? The name is
 * rebuilt from a cleaned stem and the checked extension, so trailing dots, spaces or a second
 * extension cannot change which program Windows picks.
 * @param {string} fileName
 * @returns {{ ok: true, localName: string } | { ok: false, reason: string }}
 */
export function openablePaper(fileName) {
  const name = plainFileName(fileName);
  const m = /^(.*)\.([A-Za-z0-9]+)$/.exec(name);
  const ext = m ? m[2].toLowerCase() : "";
  if (!m || !OPENABLE_PAPER_EXTS.includes(ext)) {
    return {
      ok: false,
      reason: `${name || "This file"} is not a document type the app opens for you — download it from the attachments list and check it before opening it.`,
    };
  }
  const stem = m[1].replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").replace(/[. ]+$/g, "").replace(/^[. ]+/, "") || "paper";
  return { ok: true, localName: `${stem}.${ext}` };
}

/**
 * Is this an address of a file ERPNext stores — `/files/…` or `/private/files/…` and nothing that
 * climbs out of it? Main fetches it with the clerk's session, so `/files/../api/method/…` must not
 * pass (review 2026-10-19, R11-3). Backslashes are refused too: a URL parser reads them as `/`.
 * @param {string} fileUrl
 * @returns {boolean}
 */
export function isErpFilePath(fileUrl) {
  const u = str(fileUrl);
  if (!/^\/(private\/)?files\//.test(u) || u.includes("\\")) return false;
  let decoded;
  try {
    decoded = decodeURI(u);
  } catch {
    return false;
  }
  if (decoded.includes("\\")) return false;
  return decoded.split(/[?#]/)[0].split("/").every((seg) => seg !== ".." && seg !== ".");
}

/** Copies the app leaves in the temp folder: Open's papers and the print spool's PDFs. */
export const TEMP_COPY_PREFIXES = Object.freeze(["erpnext-ui-paper-", "erpnext-ui-print-"]);

/**
 * A temp copy old enough to delete at startup (review 2026-10-19, R11-5): whatever opened it has
 * had a day; anything newer may still be open in its program.
 * @param {string} name
 * @param {number} mtimeMs
 * @param {number} nowMs
 * @returns {boolean}
 */
export function isStaleTempCopy(name, mtimeMs, nowMs) {
  return TEMP_COPY_PREFIXES.some((p) => String(name || "").startsWith(p)) && nowMs - mtimeMs > 24 * 60 * 60 * 1000;
}

/** Windows' "downloaded from the internet" mark (Zone 3), written beside a paper Open saves. */
export const INTERNET_ZONE_MARK = "[ZoneTransfer]\r\nZoneId=3\r\n";

/** What the pane says about a file it cannot draw. */
export function paperCantShow(kind, fileName) {
  // 5zorro 2026-10-03: Excel does not turn into pages consistently — its own program prints it right.
  if (/\.(xlsx|xlsm|xls|ods|csv)$/i.test(fileName)) {
    return `${fileName} is a spreadsheet — spreadsheets do not turn into pages reliably; open it in its own program (Excel) and print from there.`;
  }
  if (kind === "heic") return `${fileName} is an iPhone photo (HEIC), which this app cannot draw — open it, or save it as JPG.`;
  if (/\.doc$/i.test(fileName)) return `${fileName} is an old Word file (.doc) — open it, or save it as .docx.`;
  if (!openablePaper(fileName).ok) return openablePaper(fileName).reason;
  return `${fileName} cannot be shown here — open it in its own program.`;
}

/**
 * The documents whose attachments belong in the pane: the document itself, and on a Bill its source
 * POs and receipts (the papers a bill is checked against) — those only when `includeSources`
 * (5zorro 2026-10-03: a toggle, so the bill's own papers can be looked at alone).
 * @param {{ doctype?: string, name?: string, items?: Array<{ purchase_order?: string, purchase_receipt?: string }> }|null|undefined} doc
 * @param {{ includeSources?: boolean }} [opts]
 * @returns {Array<{ doctype: string, name: string, role: "self"|"source" }>}
 */
export function paperSources(doc, opts = {}) {
  const d = doc || {};
  const withSources = opts.includeSources !== false;
  const out = [];
  const name = str(d.name);
  if (str(d.doctype) && name && !/^new-/.test(name)) out.push({ doctype: str(d.doctype), name, role: "self" });
  const seen = new Set();
  for (const row of withSources && Array.isArray(d.items) ? d.items : []) {
    for (const [field, doctype] of [["purchase_order", "Purchase Order"], ["purchase_receipt", "Purchase Receipt"]]) {
      const n = str(row && row[field]);
      const key = `${doctype}\u0000${n}`;
      if (n && !seen.has(key)) {
        seen.add(key);
        out.push({ doctype, name: n, role: "source" });
      }
    }
  }
  return out;
}

/**
 * @typedef {{
 *   key: string,
 *   fileName: string,
 *   fileUrl?: string,
 *   from: string,          // "This Bill", "PO-0007", "Dropped here"
 *   role: "self"|"source"|"dropped",
 *   kind: ReturnType<typeof paperKind>,
 *   creation?: string,
 *   local?: boolean,       // dropped on an unsaved draft: shown, not uploaded
 * }} Paper
 */

/**
 * The pane's order: this document's own papers first, then its sources', then anything just
 * dropped; oldest first inside each, so a bill's original scan leads.
 * @param {Paper[]} papers
 * @returns {Paper[]}
 */
export function orderPapers(papers) {
  const rank = { self: 0, source: 1, dropped: 2 };
  return (Array.isArray(papers) ? papers : [])
    .slice()
    .sort((a, b) => (rank[a.role] ?? 3) - (rank[b.role] ?? 3) || str(a.creation).localeCompare(str(b.creation)) || a.fileName.localeCompare(b.fileName));
}

/**
 * Side by side when there is room for the document column and a useful pane; otherwise the pane
 * slides over the document's right side.
 * @param {number} viewportPx
 * @param {number} docColumnPx the document column's full width, margins included
 * @returns {{ mode: "side"|"overlay", paneWidth: number }}
 */
export function paneLayout(viewportPx, docColumnPx) {
  const vw = Number(viewportPx) || 0;
  const doc = Number(docColumnPx) || 0;
  if (vw >= SIDE_BY_SIDE_MIN_PX && vw - doc >= PANE_MIN_PX) return { mode: "side", paneWidth: Math.floor(vw - doc) };
  return { mode: "overlay", paneWidth: Math.max(Math.min(vw - 48, Math.round(vw * 0.6)), Math.min(PANE_MIN_PX, vw)) };
}

/** A friendly source label for a paper. */
export function paperFromLabel(source, selfLabel) {
  if (!source) return "Dropped here";
  if (source.role === "self") return `This ${selfLabel || source.doctype}`;
  return `${source.doctype === "Purchase Order" ? "PO" : source.doctype === "Purchase Receipt" ? "Item Receipt" : source.doctype} ${source.name}`;
}

/** Does this document have source documents (a PO, a receipt) whose papers could be included? */
export function hasPaperSources(doc) {
  return paperSources(doc, { includeSources: true }).some((s) => s.role === "source");
}

/**
 * The documents whose printed form goes in a ZIP / one PDF when "Include the printed …" is ticked:
 * the document itself, and its PO / receipt when their papers are included.
 * @param {any} doc
 * @param {boolean} includeSources
 * @returns {Array<{ doctype: string, name: string }>}
 */
export function printedDocsFor(doc, includeSources) {
  return paperSources(doc, { includeSources }).map((s) => ({ doctype: s.doctype, name: s.name }));
}

const escHtml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The tallest a picture may be in "Save as one PDF": one page of A4 or Letter, less margins and its
 * heading (5zorro 2026-10-03). Word files keep all their pages; spreadsheets are left out (below).
 */
export const ONE_PAGE_CM = 24;

/**
 * A Word file's HTML (from mammoth), made inert before it goes on a page. Mammoth does no
 * sanitising: a link in the document keeps its target, `javascript:` included, and the Doc form
 * page it lands in can save, pay and print (architecture review 2026-10-19, R11-1). So every link
 * that leaves the document loses its address and keeps its words; links within it (footnotes,
 * comments, `#…`) stay. Mammoth always writes attributes double-quoted with `"` escaped, which is
 * what makes a pattern safe here — this is not a general HTML sanitiser.
 * @param {string} html
 * @returns {string}
 */
export function inertWordHtml(html) {
  return String(html || "")
    .replace(/ href="(?!#)[^"]*"/g, "")
    .replace(/ target="[^"]*"/g, "");
}

/**
 * One printable page holding every paper, page after page — what "Save as one PDF" prints
 * (5zorro 2026-10-03). PDF pages and photos arrive as images; a Word file as HTML; a paper that
 * cannot be drawn as a note saying so, never silently dropped.
 * @param {string} title
 * @param {Array<{ title: string, from?: string, pages?: string[], html?: string, note?: string }>} sections
 * @returns {string}
 */
export function onePdfHtml(title, sections) {
  const body = (sections || [])
    .map((s, i) => {
      const head = `<div class="h">${escHtml(s.title)}${s.from ? ` <span>· ${escHtml(s.from)}</span>` : ""}</div>`;
      const inner = s.pages && s.pages.length
        ? s.pages.map((src) => `<img src="${escHtml(src)}">`).join("")
        : s.html
          ? `<div class="docx">${s.html}</div>`
          : `<p class="note">${escHtml(s.note || "Not included.")}</p>`;
      return `<section${i ? ' class="brk"' : ""}>${head}${inner}</section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
body{margin:0;font:12px system-ui,"Segoe UI",Roboto,sans-serif;color:#1f2d3d}
section.brk{break-before:page}
.h{font-weight:700;margin:0 0 6px}.h span{font-weight:400;color:#64748b}
img{display:block;max-width:100%;max-height:${ONE_PAGE_CM}cm;width:auto;height:auto;margin:0 auto 6px;break-inside:avoid}
.docx{line-height:1.45}.docx img{max-width:100%;width:auto}.docx table{border-collapse:collapse}.docx td,.docx th{border:1px solid #999;padding:2px 6px}
.note{color:#64748b}
table.sheet{border-collapse:collapse;font-size:11px}table.sheet th,table.sheet td{border:1px solid #999;padding:2px 6px;text-align:left;vertical-align:top}table.sheet th{background:#eee}
</style></head><body>${body}</body></html>`;
}

/**
 * Frappe's own download method for an attachment: the fallback when the file's address will not
 * serve it. The web server that ships with frappe_docker rewrites any address ending in `.html` to
 * the same address without it (`rewrite ^(.+)\.html$ $1 permanent`; only public `/files/` are
 * exempt), so a *private* `.html` attachment answers 403 by its own link — in Vanilla too.
 * `download_file` reads it by `file_url` with the same permission check (frappe/handler.py).
 * 5zorro 2026-10-12: Download on an attached .html failed.
 * @param {string} fileUrl e.g. "/private/files/DF-03a_purchase_order.html"
 * @returns {string}
 */
export function frappeDownloadPath(fileUrl) {
  return `/api/method/download_file?file_url=${encodeURIComponent(String(fileUrl || ""))}`;
}

