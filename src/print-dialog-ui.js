/**
 * The print dialog (plan 2026-09-26 "Printing"): print in place — never a popup, never a page
 * change. One-off from a Doc skin (Print in the File group), and the app-wide print queue from any
 * page. ERPNext renders every page and PDF; main delivers them (src/print-service.js, main.js).
 *
 * DOM only. Carries its own styles (`pd-` prefix) so any shell page can open it.
 */

const STYLE_ID = "pd-style";
const CSS = `
.pd-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.38); z-index: 90; display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px; }
.pd { background: #fff; border-radius: 10px; width: min(640px, 100%); max-height: calc(100vh - 96px); overflow: auto; box-shadow: 0 16px 40px rgba(15,23,42,.25); padding: 16px 18px; font: 13px system-ui, "Segoe UI", Roboto, sans-serif; color: #1f2d3d; }
.pd h2 { margin: 0 0 10px; font-size: 16px; }
.pd h3 { margin: 16px 0 6px; font-size: 13px; color: #475569; }
.pd-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 6px 0; }
.pd-row label { font-size: 12px; color: #475569; }
.pd select { padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; max-width: 100%; }
.pd #pd-printer { width: 100%; }
.pd-printer-detail { font-size: 12px; color: #334155; overflow-wrap: anywhere; margin: 2px 0 0; }
.pd-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.pd button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 6px 12px; font: inherit; cursor: pointer; }
.pd button.pd-primary { background: #2c3e50; border-color: #2c3e50; color: #fff; }
.pd button:disabled { opacity: .45; cursor: not-allowed; }
.pd-note { font-size: 12px; color: #64748b; margin: 4px 0; line-height: 1.4; }
.pd-block { font-size: 12px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 8px; margin: 4px 0 8px; }
.pd-queue { list-style: none; margin: 0; padding: 0; border: 1px solid #e2e8f0; border-radius: 6px; max-height: 220px; overflow: auto; }
.pd-queue li { display: flex; gap: 8px; align-items: center; padding: 4px 8px; border-top: 1px solid #f1f5f9; font-size: 12px; }
.pd-queue li:first-child { border-top: none; }
.pd-queue li span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pd-queue li button { padding: 0 6px; }
.pd-status { min-height: 18px; font-size: 12px; margin-top: 10px; color: #0f766e; }
.pd-status.err { color: #b91c1c; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}

/** @param {unknown} v */
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @typedef {{
 *   printOptions: (doctype: string) => Promise<any>,
 *   printRun: (req: object) => Promise<any>,
 *   printQueueGet: () => Promise<any>,
 *   printQueueAdd: (items: object[]) => Promise<any>,
 *   printQueueRemove: (items: object[]) => Promise<any>,
 *   printQueueClear: () => Promise<any>,
 *   printQueueRun: (req: object) => Promise<any>,
 *   printBlockReason?: (doc: object, settings: object) => Promise<string>,
 * }} PrintApi
 */

/**
 * Open the dialog. With `doc`, it prints that document (and can queue it); without, it is the
 * queue alone.
 * @param {{
 *   api: PrintApi,
 *   doc?: { doctype?: string, name?: string, docstatus?: number }|null,
 *   label?: string,
 *   onClose?: () => void,
 * }} opts
 */
export async function openPrintDialog(opts) {
  const api = opts && opts.api;
  if (!api || !api.printOptions) return;
  ensureStyle();
  document.querySelector(".pd-backdrop")?.remove();
  const doc = opts.doc && opts.doc.doctype && opts.doc.name ? opts.doc : null;
  const doctype = doc ? String(doc.doctype) : "";

  const back = document.createElement("div");
  back.className = "pd-backdrop";
  back.dataset.testid = "print-dialog";
  back.innerHTML = `<div class="pd" role="dialog" aria-modal="true" aria-labelledby="pd-title">
    <h2 id="pd-title">${esc(doc ? `Print — ${opts.label || doctype} ${doc.name}` : "Print queue")}</h2>
    <div data-pd="loading" class="pd-note">Reading ERPNext's print formats…</div>
    <div data-pd="body" hidden></div>
    <div class="pd-status" data-pd="status" data-testid="print-status" role="status"></div>
    <div class="pd-actions"><button type="button" data-pd="close">Close</button></div>
  </div>`;
  document.body.appendChild(back);

  const statusEl = /** @type {HTMLElement} */ (back.querySelector('[data-pd="status"]'));
  const setStatus = (text, err) => {
    statusEl.textContent = text || "";
    statusEl.classList.toggle("err", !!err);
  };
  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    back.remove();
    if (opts.onClose) opts.onClose();
  };
  const onKey = (ev) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    close();
  };
  document.addEventListener("keydown", onKey, true);
  back.querySelector('[data-pd="close"]').addEventListener("click", close);
  back.addEventListener("click", (ev) => {
    if (ev.target === back) close();
  });

  const o = await api.printOptions(doctype).catch((e) => ({ ok: false, reason: String(e) }));
  const body = /** @type {HTMLElement} */ (back.querySelector('[data-pd="body"]'));
  back.querySelector('[data-pd="loading"]').remove();
  body.hidden = false;
  if (!o || o.ok === false) setStatus((o && o.reason) || "Could not read ERPNext's print settings.", true);

  const formats = (o && o.formats) || [];
  const remembered = (o && o.remembered) || {};
  const printers = (o && o.printers) || [];
  const chosenFormat = remembered.format || (o && o.defaultFormat) || "";
  const siteLetterhead = !!(o && o.settings && Number(o.settings.with_letterhead));
  const withLetterhead = typeof remembered.withLetterhead === "boolean" ? remembered.withLetterhead : siteLetterhead;
  const defaultPrinter = remembered.printer || (printers.find((p) => p.isDefault) || {}).name || "";
  const block = doc && api.printBlockReason ? await api.printBlockReason(doc, (o && o.settings) || {}) : "";

  const formatOptions = [`<option value="">ERPNext default${o && o.defaultFormat ? ` (${esc(o.defaultFormat)})` : " (Standard)"}</option>`]
    .concat(formats.map((f) => `<option value="${esc(f)}"${f === chosenFormat ? " selected" : ""}>${esc(f)}</option>`))
    .join("");
  const letterheads = (o && o.letterheads) || [];
  const printerOptions = printers
    .map((p) => `<option value="${esc(p.name)}" title="${esc(p.label || p.displayName || p.name)}"${p.name === defaultPrinter ? " selected" : ""}>${esc(p.label || p.displayName || p.name)}${p.recent ? " · recent" : ""}</option>`)
    .concat([`<option value=""${defaultPrinter ? "" : " selected"}>Choose in the system print dialog…</option>`])
    .join("");

  body.innerHTML = `
    ${block ? `<div class="pd-block" data-testid="print-block">${esc(block)}</div>` : ""}
    <div class="pd-row">
      <label for="pd-format">Print format</label>
      <select id="pd-format" data-testid="print-format">${formatOptions}</select>
      <label><input type="checkbox" id="pd-lh" data-testid="print-letterhead" ${withLetterhead ? "checked" : ""}/> With letter head</label>
      ${letterheads.length > 1 ? `<select id="pd-lh-name" data-testid="print-letterhead-name">${letterheads.map((l) => `<option${l === (o && o.defaultLetterhead) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
    </div>
    <div class="pd-row">
      <label for="pd-printer">Printer</label>
      <select id="pd-printer" data-testid="print-printer">${printerOptions}</select>
      <p class="pd-printer-detail" data-pd="printer-detail" data-testid="print-printer-detail"></p>
    </div>
    ${printers.length ? "" : `<p class="pd-note" data-testid="print-no-printers">This computer reports no printers — Save PDF works; printing opens the system dialog (Print to file). On WSL / Linux, see ops/wsl-printing/README.md.</p>`}
    ${doc ? `<div class="pd-actions">
      <button type="button" class="pd-primary" data-pd="print" data-testid="print-go" ${block ? "disabled" : ""}>Print</button>
      <button type="button" data-pd="pdf" data-testid="print-pdf" ${block ? "disabled" : ""}>Save PDF</button>
      <button type="button" data-pd="queue-add" data-testid="print-queue-add" ${block ? "disabled" : ""}>Add to print queue</button>
    </div>
    <p class="pd-note">Prints what ERPNext has saved, in ERPNext's own layout${doc.docstatus === 0 ? " — a draft prints with ERPNext's Draft heading when the site says so" : ""}.</p>` : ""}
    <h3 data-pd="queue-title">Print queue</h3>
    <ul class="pd-queue" data-pd="queue" data-testid="print-queue"></ul>
    <div class="pd-actions" data-pd="queue-actions">
      <button type="button" data-pd="q-print" data-testid="print-queue-print">Print all</button>
      <button type="button" data-pd="q-merged" data-testid="print-queue-merged">Save as one PDF</button>
      <button type="button" data-pd="q-each" data-testid="print-queue-each">One PDF each</button>
      <button type="button" data-pd="q-clear" data-testid="print-queue-clear">Clear</button>
    </div>`;

  const $ = (sel) => /** @type {HTMLElement} */ (back.querySelector(sel));
  const choice = () => {
    const format = /** @type {HTMLSelectElement} */ ($("#pd-format")).value;
    const lh = /** @type {HTMLInputElement} */ ($("#pd-lh")).checked;
    const lhName = $("#pd-lh-name") ? /** @type {HTMLSelectElement} */ ($("#pd-lh-name")).value : (o && o.defaultLetterhead) || "";
    const deviceName = /** @type {HTMLSelectElement} */ ($("#pd-printer")).value;
    return { format, withLetterhead: lh, letterhead: lh ? lhName : "", deviceName };
  };
  const itemFor = (c) => ({
    doctype,
    name: doc ? String(doc.name) : "",
    format: c.format,
    noLetterhead: !c.withLetterhead,
    letterhead: c.letterhead,
  });
  const busy = (on) => back.querySelectorAll(".pd-actions button").forEach((b) => {
    if (b.getAttribute("data-pd") !== "close") /** @type {HTMLButtonElement} */ (b).disabled = on || (!!block && ["print", "pdf", "queue-add"].includes(b.getAttribute("data-pd") || ""));
  });

  function paintQueue(state) {
    const q = (state && state.queue) || [];
    $('[data-pd="queue-title"]').textContent = `Print queue (${q.length})`;
    const list = $('[data-pd="queue"]');
    list.innerHTML = q.length
      ? q.map((it, i) => `<li><span>${esc(it.doctype)} <b>${esc(it.name)}</b>${it.format ? ` · ${esc(it.format)}` : ""}</span><button type="button" data-q-remove="${i}" title="Remove from the queue" aria-label="Remove ${esc(it.name)}">×</button></li>`).join("")
      : `<li><span class="pd-note">Empty. "Add to print queue" on any document, then print or save them all at once.</span></li>`;
    list.querySelectorAll("[data-q-remove]").forEach((b) =>
      b.addEventListener("click", async () => {
        const it = q[Number(b.getAttribute("data-q-remove"))];
        paintQueue(await api.printQueueRemove([it]));
      }),
    );
    $('[data-pd="queue-actions"]').hidden = !q.length;
  }
  // The chosen printer in full — name and address, wrapped, never cut off (5zorro 2026-10-03).
  const paintPrinterDetail = () => {
    const sel = /** @type {HTMLSelectElement} */ ($("#pd-printer"));
    const p = printers.find((x) => x.name === sel.value);
    $('[data-pd="printer-detail"]').textContent = p
      ? [p.displayName || p.name, p.address ? `at ${p.address}` : "", p.name !== (p.displayName || p.name) ? `(${p.name})` : ""].filter(Boolean).join(" ")
      : "The system print dialog will ask which printer.";
  };
  $("#pd-printer").addEventListener("change", paintPrinterDetail);
  paintPrinterDetail();

  paintQueue(await api.printQueueGet().catch(() => null));

  const run = async (fn, verb) => {
    busy(true);
    setStatus(`${verb}…`);
    try {
      const r = await fn();
      if (r && r.cancelled) setStatus("Cancelled — nothing saved.");
      else setStatus((r && (r.summary || r.reason)) || "Done.", !(r && r.ok));
      if (r && r.queue) paintQueue(r);
    } catch (e) {
      setStatus(String(e && e.message ? e.message : e), true);
    } finally {
      busy(false);
    }
  };
  const remember = (c) => ({ doctype, format: c.format, withLetterhead: c.withLetterhead, deviceName: c.deviceName });

  if (doc) {
    $('[data-pd="print"]').addEventListener("click", () => {
      const c = choice();
      run(() => api.printRun({ items: [itemFor(c)], dest: "printer", deviceName: c.deviceName, remember: remember(c) }), "Printing");
    });
    $('[data-pd="pdf"]').addEventListener("click", () => {
      const c = choice();
      run(() => api.printRun({ items: [itemFor(c)], dest: "pdf", remember: remember(c) }), "Saving PDF");
    });
    $('[data-pd="queue-add"]').addEventListener("click", async () => {
      const c = choice();
      const r = await api.printQueueAdd([itemFor(c)]);
      paintQueue(r);
      setStatus(r && r.refused ? "The queue is full (500, ERPNext's own limit)." : `${doc.name} is in the print queue.`, !!(r && r.refused));
    });
  }
  $('[data-pd="q-print"]').addEventListener("click", () => {
    const c = choice();
    run(() => api.printQueueRun({ dest: "printer", deviceName: c.deviceName }), "Printing the queue");
  });
  $('[data-pd="q-merged"]').addEventListener("click", () => run(() => api.printQueueRun({ dest: "pdf-merged" }), "Saving one PDF"));
  $('[data-pd="q-each"]').addEventListener("click", () => run(() => api.printQueueRun({ dest: "pdf" }), "Saving PDFs"));
  $('[data-pd="q-clear"]').addEventListener("click", async () => paintQueue(await api.printQueueClear()));

  try {
    (doc ? $('[data-pd="print"]') : $('[data-pd="close"]'))?.focus();
  } catch {
    /* ignore */
  }
}
