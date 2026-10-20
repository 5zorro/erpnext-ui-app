/**
 * Compare pane (plan 2026-09-26 "Compare pane", 5zorro 2026-10-03). Beside the Doc skin, every
 * paper the document should match, stacked in one column as if a single PDF: PDFs page by page
 * (PDF.js), images, .docx as HTML (mammoth). Drop files on it to attach them to the document in
 * ERPNext. DOM only; the decisions are in compare-papers.js, the ERPNext calls in main.
 */

import {
  MAX_PAPER_BYTES,
  orderPapers,
  paneLayout,
  paperCantShow,
  paperFromLabel,
  paperKind,
  paperSources,
  hasPaperSources,
  printedDocsFor,
  onePdfHtml,
  inertWordHtml,
  openablePaper,
} from "./compare-papers.js";
import { parseCsv, readXlsxFirstSheet, sheetFitsOnePage, sheetTableHtml, sheetTooBigNote } from "./sheet-preview.js";

const OPEN_KEY = "compare-pane-open";
const SOURCES_KEY = "compare-pane-include-sources";
const PRINTED_KEY = "compare-pane-include-printed";
const STYLE_ID = "cp-style";
const CSS = `
.cp-pane { position: fixed; top: 0; right: 0; bottom: 0; width: var(--compare-pane-width, 600px); z-index: 60;
  background: #e7ebef; border-left: 1px solid #cbd5e1; display: flex; flex-direction: column; font: 13px system-ui, "Segoe UI", Roboto, sans-serif; color: #1f2d3d; }
html.compare-overlay .cp-pane { box-shadow: -12px 0 32px rgba(15,23,42,.22); }
.cp-pane[hidden] { display: none; }
.cp-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #cbd5e1; }
.cp-head h2 { margin: 0; font-size: 14px; flex: 1; }
.cp-head label { font-size: 12px; color: #334155; display: flex; gap: 4px; align-items: center; }
.cp-head label[hidden] { display: none; }
.cp-head button, .cp-paper-head button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 3px 10px; font: inherit; cursor: pointer; }
.cp-actions { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; padding: 6px 12px; background: #f8fafc; border-bottom: 1px solid #cbd5e1; font-size: 12px; }
.cp-actions button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 3px 10px; font: inherit; cursor: pointer; }
.cp-actions button:disabled { opacity: .45; cursor: not-allowed; }
.cp-actions label { display: flex; gap: 4px; align-items: center; color: #334155; }
.cp-actions .cp-act-status { flex-basis: 100%; color: #0f766e; min-height: 0; }
.cp-actions .cp-act-status.err { color: #b91c1c; }
.cp-scroll { flex: 1; overflow: auto; padding: 12px; }
.cp-drop { border: 2px dashed #94a3b8; border-radius: 8px; padding: 10px; text-align: center; color: #475569; font-size: 12px; margin-bottom: 12px; background: #f8fafc; }
.cp-paper.cp-peeked { outline: 3px solid #2563eb; outline-offset: 2px; }
.cp-pane.cp-dragging .cp-drop { border-color: #2563eb; background: #eff6ff; color: #1e3a8a; }
.cp-paper { margin-bottom: 18px; }
.cp-paper-head { display: flex; gap: 8px; align-items: center; font-size: 12px; margin-bottom: 6px; }
.cp-paper-head b { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.cp-from { color: #64748b; }
.cp-page { display: block; width: 100%; background: #fff; box-shadow: 0 1px 4px rgba(15,23,42,.18); margin-bottom: 8px; }
.cp-page-slot { width: 100%; background: #fff; margin-bottom: 8px; box-shadow: 0 1px 4px rgba(15,23,42,.18); }
.cp-docx { background: #fff; padding: 24px 28px; box-shadow: 0 1px 4px rgba(15,23,42,.18); line-height: 1.45; overflow-wrap: anywhere; }
.cp-docx img { max-width: 100%; }
.cp-docx table { border-collapse: collapse; } .cp-docx td, .cp-docx th { border: 1px solid #cbd5e1; padding: 2px 6px; }
.cp-sheet { background: #fff; padding: 12px; box-shadow: 0 1px 4px rgba(15,23,42,.18); overflow: auto; }
.cp-sheet table { border-collapse: collapse; font-size: 12px; } .cp-sheet th, .cp-sheet td { border: 1px solid #cbd5e1; padding: 2px 6px; text-align: left; vertical-align: top; } .cp-sheet th { background: #f1f5f9; }
.cp-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; color: #475569; font-size: 12px; }
.cp-note { font-size: 12px; color: #64748b; margin: 0 0 10px; }
.cp-err { color: #b91c1c; }
html.compare-side .wrap, html.compare-side .doc-chrome { margin-left: 0; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** PDF.js, loaded on first need. */
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(new URL("../node_modules/pdfjs-dist/build/pdf.min.mjs", import.meta.url).href).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** mammoth (browser build, a UMD script that sets window.mammoth), loaded on first need. */
let mammothPromise = null;
function loadMammoth() {
  if (!mammothPromise) {
    mammothPromise = new Promise((resolve, reject) => {
      if (window.mammoth) return resolve(window.mammoth);
      const s = document.createElement("script");
      s.src = new URL("../node_modules/mammoth/mammoth.browser.min.js", import.meta.url).href;
      s.onload = () => (window.mammoth ? resolve(window.mammoth) : reject(new Error("mammoth did not load")));
      s.onerror = () => reject(new Error("mammoth did not load"));
      document.head.appendChild(s);
    });
  }
  return mammothPromise;
}

/**
 * @param {{
 *   api: { papersList: Function, papersBytes: Function, papersUpload: Function, papersOpen: Function },
 *   button: HTMLElement|null,
 *   getDoc: () => any,
 *   selfLabel: () => string,
 *   setStatus?: (text: string, cls?: string) => void,
 * }} opts
 * @returns {{ refresh: () => void, isOpen: () => boolean }}
 */
export function mountComparePane(opts) {
  const { api, button, getDoc, selfLabel } = opts;
  const setStatus = opts.setStatus || (() => {});
  ensureStyle();
  const pane = document.createElement("aside");
  pane.className = "cp-pane";
  pane.hidden = true;
  pane.dataset.testid = "compare-pane";
  pane.setAttribute("aria-label", "Papers to compare");
  pane.innerHTML = `<div class="cp-head"><h2 data-cp="title">Papers</h2>
      <label data-cp="sources-label" hidden title="Also show the papers attached to this document's PO(s) and Item Receipt(s)"><input type="checkbox" data-cp="sources" data-testid="compare-include-sources" /> Include PO and receipt papers</label>
      <button type="button" data-cp="close" title="Close the papers">Close</button></div>
    <div class="cp-actions">
      <button type="button" data-cp="zip" data-testid="compare-zip" title="Every paper shown here, as files, in one .zip">Save all as ZIP</button>
      <button type="button" data-cp="onepdf" data-testid="compare-onepdf" title="Every paper shown here, page after page, in one PDF">Save as one PDF</button>
      <label title="Add the document as ERPNext prints it (and its PO / receipt when their papers are included)"><input type="checkbox" data-cp="printed" data-testid="compare-include-printed" /> <span data-cp="printed-label">Include the printed document</span></label>
      <span class="cp-act-status" data-cp="act-status" data-testid="compare-act-status"></span>
    </div>
    <div class="cp-scroll" data-cp="scroll">
      <div class="cp-drop" data-cp="drop">Drop scans, photos, PDFs or Word files here — they are attached to this document in ERPNext.</div>
      <div data-cp="list"></div>
    </div>`;
  document.body.appendChild(pane);
  const list = /** @type {HTMLElement} */ (pane.querySelector('[data-cp="list"]'));
  const title = /** @type {HTMLElement} */ (pane.querySelector('[data-cp="title"]'));
  /** @type {Map<string, { name: string, bytes: Uint8Array }>} papers dropped on an unsaved draft */
  const localOnly = new Map();
  let loadedFor = "";
  let renderToken = 0;
  /** @type {import("./compare-papers.js").Paper[]} what the pane shows now, in order */
  let currentPapers = [];
  const sourcesBox = /** @type {HTMLInputElement} */ (pane.querySelector('[data-cp="sources"]'));
  const sourcesLabel = /** @type {HTMLElement} */ (pane.querySelector('[data-cp="sources-label"]'));
  try {
    sourcesBox.checked = localStorage.getItem(SOURCES_KEY) === "1";
  } catch {
    sourcesBox.checked = false;
  }
  const printedBox = /** @type {HTMLInputElement} */ (pane.querySelector('[data-cp="printed"]'));
  const printedLabel = /** @type {HTMLElement} */ (pane.querySelector('[data-cp="printed-label"]'));
  const actStatus = /** @type {HTMLElement} */ (pane.querySelector('[data-cp="act-status"]'));
  try {
    printedBox.checked = localStorage.getItem(PRINTED_KEY) === "1";
  } catch {
    printedBox.checked = false;
  }
  printedBox.addEventListener("change", () => {
    try {
      localStorage.setItem(PRINTED_KEY, printedBox.checked ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
  });
  const say = (text, err) => {
    actStatus.textContent = text || "";
    actStatus.classList.toggle("err", !!err);
  };
  const actButtons = () => pane.querySelectorAll('[data-cp="zip"], [data-cp="onepdf"]');
  const busy = (on) => actButtons().forEach((b) => (/** @type {HTMLButtonElement} */ (b).disabled = on));
  const printedDocs = () => {
    const doc = getDoc() || {};
    return printedBox.checked ? printedDocsFor(doc, sourcesBox.checked) : [];
  };
  const baseName = () => {
    const doc = getDoc() || {};
    return `${doc.name || "papers"}-papers`;
  };

  pane.querySelector('[data-cp="zip"]').addEventListener("click", async () => {
    busy(true);
    say("Gathering the papers…");
    try {
      const papers = currentPapers.map((p) => {
        const local = localOnly.get(p.key);
        return local ? { fileName: local.name, bytes: local.bytes } : { fileName: p.fileName, fileUrl: p.fileUrl };
      });
      const r = await api.papersZip({ zipName: baseName(), papers, printDocs: printedDocs() });
      say(r && r.cancelled ? "" : (r && (r.summary || r.reason)) || "Done.", !(r && (r.ok || r.cancelled)));
    } catch (e) {
      say(String(e && e.message ? e.message : e), true);
    } finally {
      busy(false);
    }
  });

  pane.querySelector('[data-cp="onepdf"]').addEventListener("click", async () => {
    busy(true);
    say("Drawing every page…");
    try {
      /** @type {Array<{ title: string, from?: string, pages?: string[], html?: string, note?: string }>} */
      const sections = [];
      for (const d of printedDocs()) {
        const got = await api.papersPrintedPdf(d);
        if (got && got.ok) sections.push({ title: `${d.name}.pdf`, from: `${d.doctype}, as ERPNext prints it`, pages: await pdfPagesAsImages(got.bytes) });
        else sections.push({ title: d.name, note: `Not included: ${(got && got.reason) || "could not print it"}` });
      }
      for (const p of currentPapers) {
        if (p.kind === "heic" || p.kind === "other") {
          sections.push({ title: p.fileName, from: p.from, note: `Not included — ${paperCantShow(p.kind, p.fileName)}` });
          continue;
        }
        const got = await bytesFor(p).catch((e) => ({ ok: false, reason: String(e) }));
        if (!got || !got.ok) {
          sections.push({ title: p.fileName, from: p.from, note: `Not included: ${(got && got.reason) || "could not load it"}` });
          continue;
        }
        const bytes = got.bytes instanceof Uint8Array ? got.bytes : new Uint8Array(got.bytes);
        if (p.kind === "pdf") sections.push({ title: p.fileName, from: p.from, pages: await pdfPagesAsImages(bytes) });
        else if (p.kind === "image") sections.push({ title: p.fileName, from: p.from, pages: [await flattenImage(new Blob([bytes]))] });
        else if (p.kind === "sheet") {
          const rows = await sheetRows(p, bytes);
          const size = sheetFitsOnePage(rows);
          sections.push(size.fits
            ? { title: p.fileName, from: p.from, html: sheetTableHtml(rows) }
            : { title: p.fileName, from: p.from, note: `Not included — ${sheetTooBigNote(p.fileName, size)}` });
        } else if (p.kind === "docx") {
          const mammoth = await loadMammoth();
          const out = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
          sections.push({ title: p.fileName, from: p.from, html: inertWordHtml(out.value) || "<p>(empty)</p>" });
        }
      }
      if (!sections.length) {
        say("Nothing to save — no papers, and the printed document is not included.", true);
        return;
      }
      say("Saving…");
      const r = await api.papersPdf({ html: onePdfHtml(baseName(), sections), fileName: baseName() });
      say(r && r.cancelled ? "" : (r && (r.summary || r.reason)) || "Done.", !(r && (r.ok || r.cancelled)));
    } catch (e) {
      say(String(e && e.message ? e.message : e), true);
    } finally {
      busy(false);
    }
  });

  sourcesBox.addEventListener("change", () => {
    try {
      localStorage.setItem(SOURCES_KEY, sourcesBox.checked ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
    void load(true);
  });

  function layout() {
    const open = !pane.hidden;
    const root = document.documentElement;
    root.classList.remove("compare-side", "compare-overlay");
    if (!open) {
      root.style.removeProperty("--compare-pane-width");
    } else {
      const wrap = document.querySelector(".wrap");
      const docCol = Math.min(window.innerWidth, (wrap ? wrap.offsetWidth : 1136) + 16);
      const l = paneLayout(window.innerWidth, docCol);
      root.style.setProperty("--compare-pane-width", `${l.paneWidth}px`);
      root.classList.add(l.mode === "side" ? "compare-side" : "compare-overlay");
    }
    // The line tables re-measure their room (they stop at the pane when it is beside them).
    window.dispatchEvent(new Event("resize"));
  }

  function setOpen(open) {
    pane.hidden = !open;
    if (button) {
      button.classList.toggle("active", open);
      button.setAttribute("aria-pressed", open ? "true" : "false");
    }
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
    layout();
    if (open) void load();
  }

  async function load(force = false) {
    const doc = getDoc() || {};
    const key = `${doc.doctype || ""}\u0000${doc.name || ""}\u0000${sourcesBox.checked ? 1 : 0}`;
    if (!force && key === loadedFor) return;
    loadedFor = key;
    const token = ++renderToken;
    list.innerHTML = `<p class="cp-note">Looking for papers…</p>`;
    sourcesLabel.hidden = !hasPaperSources(doc);
    const sources = paperSources(doc, { includeSources: sourcesBox.checked });
    const res = sources.length ? await api.papersList(sources).catch((e) => ({ ok: false, reason: String(e) })) : { ok: true, files: [] };
    if (token !== renderToken) return;
    const bySource = (f) => sources.find((s) => s.doctype === f.attached_to_doctype && s.name === f.attached_to_name) || null;
    /** @type {import("./compare-papers.js").Paper[]} */
    const papers = ((res && res.files) || []).map((f) => {
      const src = bySource(f);
      return {
        key: f.name,
        fileName: f.file_name || f.file_url,
        fileUrl: f.file_url,
        from: paperFromLabel(src, selfLabel()),
        role: src ? src.role : "self",
        kind: paperKind(f.file_name || f.file_url),
        creation: f.creation,
      };
    });
    for (const [k, v] of localOnly) {
      papers.push({ key: k, fileName: v.name, from: "Dropped here — not attached (save first)", role: "dropped", kind: paperKind(v.name), local: true });
    }
    const ordered = orderPapers(papers);
    currentPapers = ordered;
    printedLabel.textContent = `Include the printed ${selfLabel()}${sourcesBox.checked && hasPaperSources(doc) ? " (and PO / receipt)" : ""}`;
    title.textContent = ordered.length ? `Papers (${ordered.length})` : "Papers";
    if (res && res.ok === false) {
      list.innerHTML = `<p class="cp-note cp-err">${esc(res.reason || "Could not list the attachments.")}</p>`;
      return;
    }
    if (!ordered.length) {
      list.innerHTML = `<p class="cp-note">${sources.length ? "No papers attached yet." : "Save the document to attach papers to it."} Drop files above.</p>`;
      return;
    }
    list.innerHTML = "";
    for (const p of ordered) {
      if (token !== renderToken) return;
      const box = document.createElement("section");
      box.className = "cp-paper";
      box.dataset.testid = "compare-paper";
      if (p.fileUrl) box.dataset.fileUrl = p.fileUrl;
      box.innerHTML = `<div class="cp-paper-head"><b>${esc(p.fileName)}</b><span class="cp-from">${esc(p.from)}</span><button type="button" data-cp="open" title="Open in its own program">Open</button></div><div data-cp="body"><p class="cp-note">Loading…</p></div>`;
      list.appendChild(box);
      const body = /** @type {HTMLElement} */ (box.querySelector('[data-cp="body"]'));
      const openBtn = /** @type {HTMLButtonElement} */ (box.querySelector('[data-cp="open"]'));
      const openable = openablePaper(p.fileName);
      if (!openable.ok) {
        // Review 2026-10-19 R11-2: not a document type — main refuses it too; say why on the button.
        openBtn.disabled = true;
        openBtn.title = openable.reason;
      }
      openBtn.addEventListener("click", async () => {
        const local = localOnly.get(p.key);
        const r = await api
          .papersOpen(local ? { fileName: local.name, bytes: local.bytes } : { fileName: p.fileName, fileUrl: p.fileUrl })
          .catch((e) => ({ ok: false, reason: String(e) }));
        if (r && r.ok === false && r.reason) say(r.reason, true);
      });
      await renderPaper(p, body, token);
    }
  }

  /** A CSV or the first sheet of an .xlsx, as rows of text. */
  async function sheetRows(p, bytes) {
    if (/\.xls[xm]$/i.test(p.fileName)) return readXlsxFirstSheet(bytes);
    return parseCsv(new TextDecoder().decode(bytes));
  }

  async function bytesFor(p) {
    const local = localOnly.get(p.key);
    if (local) return { ok: true, bytes: local.bytes };
    return api.papersBytes(p.fileUrl);
  }

  async function renderPaper(p, body, token) {
    if (p.kind === "heic" || p.kind === "other") {
      body.innerHTML = `<div class="cp-card">${esc(paperCantShow(p.kind, p.fileName))}</div>`;
      return;
    }
    const got = await bytesFor(p).catch((e) => ({ ok: false, reason: String(e) }));
    if (token !== renderToken) return;
    if (!got || !got.ok) {
      body.innerHTML = `<div class="cp-card cp-err">${esc((got && got.reason) || "Could not load it.")}</div>`;
      return;
    }
    const bytes = got.bytes instanceof Uint8Array ? got.bytes : new Uint8Array(got.bytes);
    try {
      if (p.kind === "image") {
        const url = URL.createObjectURL(new Blob([bytes]));
        body.innerHTML = "";
        const img = document.createElement("img");
        img.className = "cp-page";
        img.alt = p.fileName;
        img.src = url;
        body.appendChild(img);
      } else if (p.kind === "docx") {
        const mammoth = await loadMammoth();
        const out = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
        body.innerHTML = `<div class="cp-docx">${inertWordHtml(out.value) || "<p>(empty)</p>"}</div><p class="cp-note">Word file shown as text and tables — Open for its exact layout.</p>`;
      } else if (p.kind === "pdf") {
        await renderPdf(bytes, body, token);
      } else if (p.kind === "sheet") {
        const rows = await sheetRows(p, bytes);
        const size = sheetFitsOnePage(rows);
        body.innerHTML = size.fits
          ? `<div class="cp-sheet">${sheetTableHtml(rows)}</div><p class="cp-note">Values only — Open for the formatted file.</p>`
          : `<div class="cp-card">${esc(sheetTooBigNote(p.fileName, size))}</div>`;
      }
    } catch (e) {
      body.innerHTML = `<div class="cp-card cp-err">${esc(`${p.fileName} could not be drawn: ${e && e.message ? e.message : e}`)}</div>`;
    }
  }

  /** Every page of a PDF as an image, wide enough to print (one-PDF export). */
  async function pdfPagesAsImages(bytes, widthPx = 1240) {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes) }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: widthPx / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      pages.push(canvas.toDataURL("image/jpeg", 0.9));
    }
    return pages;
  }

  /**
   * Printer hardening: a photo onto white (no transparency reaches a driver) and no larger than
   * print resolution (a 12-megapixel phone photo is a huge job for nothing).
   */
  async function flattenImage(blob, maxSide = 2400) {
    try {
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * k));
      canvas.height = Math.max(1, Math.round(bmp.height * k));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.92);
    } catch {
      return blobAsDataUrl(blob);
    }
  }

  function blobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  /** PDF pages into canvases, drawn as they scroll into view so a 60-page scan does not stall. */
  async function renderPdf(bytes, body, token) {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    if (token !== renderToken) return;
    body.innerHTML = "";
    const width = Math.max(200, body.clientWidth || 500);
    const ratio = window.devicePixelRatio || 1;
    const first = await pdf.getPage(1);
    const v1 = first.getViewport({ scale: 1 });
    const slots = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const slot = document.createElement("div");
      slot.className = "cp-page-slot";
      slot.style.aspectRatio = `${v1.width} / ${v1.height}`;
      slot.dataset.page = String(i);
      body.appendChild(slot);
      slots.push(slot);
    }
    const draw = async (slot) => {
      if (slot.dataset.drawn) return;
      slot.dataset.drawn = "1";
      const page = await pdf.getPage(Number(slot.dataset.page));
      const vp = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
      const canvas = document.createElement("canvas");
      canvas.className = "cp-page";
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      slot.replaceWith(canvas);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            io.unobserve(e.target);
            void draw(/** @type {HTMLElement} */ (e.target));
          }
        }
      },
      { root: pane.querySelector('[data-cp="scroll"]'), rootMargin: "600px 0px" },
    );
    slots.forEach((s) => io.observe(s));
  }

  // Drop files: attach to the document in ERPNext (Desk's own upload), or hold them here on an
  // unsaved draft.
  const scroll = /** @type {HTMLElement} */ (pane.querySelector('[data-cp="scroll"]'));
  scroll.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    pane.classList.add("cp-dragging");
  });
  scroll.addEventListener("dragleave", () => pane.classList.remove("cp-dragging"));
  scroll.addEventListener("drop", async (ev) => {
    ev.preventDefault();
    pane.classList.remove("cp-dragging");
    const files = [...((ev.dataTransfer && ev.dataTransfer.files) || [])];
    const doc = getDoc() || {};
    const saved = !!(doc.doctype && doc.name && !/^new-/.test(String(doc.name)));
    for (const f of files) {
      if (f.size > MAX_PAPER_BYTES) {
        setStatus(`${f.name} is too large to attach here (25 MB at most).`, "err");
        continue;
      }
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!saved) {
        localOnly.set(`local:${f.name}:${f.size}`, { name: f.name, bytes });
        setStatus(`${f.name} is shown, not attached — save the document, then drop it again to attach it.`, "warn");
        continue;
      }
      setStatus(`Attaching ${f.name}…`);
      const r = await api.papersUpload({ doctype: doc.doctype, name: doc.name, fileName: f.name, bytes });
      setStatus(r && r.ok ? `${f.name} attached to ${doc.name}.` : (r && r.reason) || `Could not attach ${f.name}.`, r && r.ok ? "" : "err");
    }
    await load(true);
    // The attachments table under the notes lists the same files.
    if (opts.onFilesChanged) opts.onFilesChanged();
  });

  pane.querySelector('[data-cp="close"]').addEventListener("click", () => setOpen(false));
  if (button) button.addEventListener("click", () => setOpen(pane.hidden));
  window.addEventListener("resize", () => {
    if (!pane.hidden) {
      const root = document.documentElement;
      const wrap = document.querySelector(".wrap");
      const l = paneLayout(window.innerWidth, Math.min(window.innerWidth, (wrap ? wrap.offsetWidth : 1136) + 16));
      root.style.setProperty("--compare-pane-width", `${l.paneWidth}px`);
      root.classList.toggle("compare-side", l.mode === "side");
      root.classList.toggle("compare-overlay", l.mode !== "side");
    }
  });
  let remembered = false;
  try {
    remembered = localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    remembered = false;
  }
  if (remembered) setOpen(true);

  return {
    /** Call when the document on the page changes (a new name, or after a save). */
    refresh: (force = false) => {
      if (!pane.hidden) void load(force);
    },
    isOpen: () => !pane.hidden,
    /**
     * Open the pane on one attachment (the Peek in the attachments table): scrolled to it and
     * outlined for a moment. Resolves false when it does not appear (not attached any more).
     * @param {string} fileUrl
     */
    peek: async (fileUrl) => {
      if (pane.hidden) setOpen(true);
      else void load(true);
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const box = [...list.querySelectorAll(".cp-paper")].find((b) => b.dataset.fileUrl === fileUrl);
        if (box) {
          box.scrollIntoView({ block: "start" });
          box.classList.add("cp-peeked");
          setTimeout(() => box.classList.remove("cp-peeked"), 1600);
          return true;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    },
  };
}
