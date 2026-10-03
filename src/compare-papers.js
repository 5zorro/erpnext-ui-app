/**
 * Compare pane (plan 2026-09-26 "Compare pane", 5zorro 2026-10-03): beside a Doc skin, the papers
 * the document should match — scans, phone photos, Word files — stacked as one continuous column,
 * as if a single PDF. Pure: what a file is, where it came from, the order, the layout.
 */

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
 * @returns {"pdf"|"image"|"docx"|"heic"|"other"}
 */
export function paperKind(fileName, mime = "") {
  const ext = (str(fileName).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  const m = str(mime).toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (ext === "heic" || ext === "heif" || /heic|heif/.test(m)) return "heic";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext) || /^image\//.test(m)) return "image";
  if (ext === "docx" || m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return "other";
}

/** What the pane says about a file it cannot draw. */
export function paperCantShow(kind, fileName) {
  if (kind === "heic") return `${fileName} is an iPhone photo (HEIC), which this app cannot draw — open it, or save it as JPG.`;
  if (/\.doc$/i.test(fileName)) return `${fileName} is an old Word file (.doc) — open it, or save it as .docx.`;
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
img{display:block;width:100%;break-inside:avoid;margin:0 0 6px}
.docx{line-height:1.45}.docx img{max-width:100%;width:auto}.docx table{border-collapse:collapse}.docx td,.docx th{border:1px solid #999;padding:2px 6px}
.note{color:#64748b}
</style></head><body>${body}</body></html>`;
}

