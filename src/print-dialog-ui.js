/**
 * The print dialog (plan 2026-09-26 "Printing"): print in place — never a popup, never a page
 * change. One-off from a Doc skin (Print in the File group), and the app-wide print queue from any
 * page. ERPNext renders every page and PDF; main delivers them (src/print-service.js, main.js).
 *
 * DOM only. Carries its own styles (`pd-` prefix) so any shell page can open it.
 */

import { PRINT_AS_IMAGE_OFF_NOTE, paperMismatch, paperMismatchText, printerPurposeFor } from "./print-service.js";

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
.pd-mark { border: none !important; background: none !important; padding: 0 4px !important; font-size: 15px; cursor: pointer; line-height: 1; }
.pd-mark[hidden] { display: none; }
.pd-explain { font-size: 12px; color: #78350f; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 8px; margin: 4px 0; }
.pd-explain[hidden] { display: none; }
.pd-explain a { color: #1d4ed8; cursor: pointer; text-decoration: underline; }
.pd-info { font-size: 12px; color: #475569; }
.pd-info[hidden] { display: none; }
.pd-watch { font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; margin-top: 8px; background: #f8fafc; }
.pd-watch[hidden] { display: none; }
.pd-watch.trouble { border-color: #fca5a5; background: #fef2f2; color: #991b1b; }
.pd-watch button { margin: 6px 6px 0 0; }
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
.pd-trouble { font-size: 12px; color: #1e3a8a; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 6px 8px; margin: 4px 0 8px; }
.pd-trouble code { display: block; margin-top: 4px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; }
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
    // Watching a print job: Esc stops watching (the job itself carries on at the printer).
    if (typeof stopWatchingIfAny === "function" && stopWatchingIfAny()) return;
    close();
  };
  let stopWatchingIfAny = null;
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

  // Printer hardening: which printers load other paper than ERPNext lays documents out on.
  const docPaper = (o && o.docPaper) || "A4";
  const paperBy = (o && o.paperByPrinter) || {};
  const mismatchFor = (name) => paperMismatch(docPaper, paperBy[name] || null);
  const exact = printerPurposeFor(doctype) === "checks";
  const asImageDefault = !(o && o.printAsImage === false);
  const formatOptions = [`<option value="">ERPNext default${o && o.defaultFormat ? ` (${esc(o.defaultFormat)})` : " (Standard)"}</option>`]
    .concat(formats.map((f) => `<option value="${esc(f)}"${f === chosenFormat ? " selected" : ""}>${esc(f)}</option>`))
    .join("");
  const letterheads = (o && o.letterheads) || [];
  const printerOptions = printers
    .map((p) => `<option value="${esc(p.name)}" title="${esc(p.label || p.displayName || p.name)}"${p.name === defaultPrinter ? " selected" : ""}>${mismatchFor(p.name).mismatch ? "⚠ " : ""}${esc(p.label || p.displayName || p.name)}${p.recent ? " · recent" : ""}</option>`)
    .concat([`<option value=""${defaultPrinter ? "" : " selected"}>Choose in the system print dialog…</option>`])
    .join("");

  const trouble = o && o.trouble;
  body.innerHTML = `
    ${block ? `<div class="pd-block" data-testid="print-block">${esc(block)}</div>` : ""}
    ${trouble ? `<div class="pd-trouble" data-testid="print-trouble"><b>${trouble.kind === "engine" ? "Self-healing: " : ""}</b>${esc(trouble.cause)}${trouble.kind === "engine" ? " PDFs are being made by this app meanwhile — same ERPNext layout." : ""}${trouble.fix ? `<code>${esc(trouble.fix)}</code>` : ""}</div>` : ""}
    <div class="pd-row">
      <label for="pd-format">Print format</label>
      <select id="pd-format" data-testid="print-format">${formatOptions}</select>
      <label><input type="checkbox" id="pd-lh" data-testid="print-letterhead" ${withLetterhead ? "checked" : ""}/> With letter head</label>
      ${letterheads.length > 1 ? `<select id="pd-lh-name" data-testid="print-letterhead-name">${letterheads.map((l) => `<option${l === (o && o.defaultLetterhead) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
    </div>
    <div class="pd-row">
      <label for="pd-printer">Printer</label>
      <select id="pd-printer" data-testid="print-printer">${printerOptions}</select>
      <button type="button" class="pd-mark" data-pd="paper-mark" data-testid="print-paper-mark" title="This printer loads different paper — click for details" hidden>⚠</button>
      <p class="pd-printer-detail" data-pd="printer-detail" data-testid="print-printer-detail"></p>
    </div>
    <div class="pd-explain" data-pd="paper-explain" data-testid="print-paper-explain" hidden></div>
    <div class="pd-row">
      <label title="${exact ? "Checks print at exact size — never converted or scaled" : "Every page is flattened onto white at printer resolution, so the printer driver only sees plain pictures"}"><input type="checkbox" id="pd-asimage" data-testid="print-as-image" ${!exact && asImageDefault ? "checked" : ""} ${exact ? "disabled" : ""}/> Print as image</label>
      <span class="pd-info" data-pd="asimage-info" data-testid="print-as-image-info" ${!exact && !asImageDefault ? "" : "hidden"}>ℹ ${esc(PRINT_AS_IMAGE_OFF_NOTE)}</span>
      ${exact ? `<span class="pd-info">Checks print at exact size — no shrinking, no image conversion.</span>` : ""}
    </div>
    <div class="pd-watch" data-pd="watch" data-testid="print-watch" hidden></div>
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
    const asImageBox = /** @type {HTMLInputElement} */ ($("#pd-asimage"));
    const printAsImage = !!asImageBox && asImageBox.checked && !exact;
    const format = /** @type {HTMLSelectElement} */ ($("#pd-format")).value;
    const lh = /** @type {HTMLInputElement} */ ($("#pd-lh")).checked;
    const lhName = $("#pd-lh-name") ? /** @type {HTMLSelectElement} */ ($("#pd-lh-name")).value : (o && o.defaultLetterhead) || "";
    const deviceName = /** @type {HTMLSelectElement} */ ($("#pd-printer")).value;
    return { format, withLetterhead: lh, letterhead: lh ? lhName : "", deviceName, printAsImage };
  };
  const itemFor = (c) => ({
    doctype,
    name: doc ? String(doc.name) : "",
    format: c.format,
    noLetterhead: !c.withLetterhead,
    letterhead: c.letterhead,
  });
  stopWatchingIfAny = () => {
    const box = back.querySelector('[data-pd="watch"]');
    if (!box || box.hidden) return false;
    if (typeof stopWatching === "function") stopWatching();
    return true;
  };
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
  const paintPaper = () => {
    const sel = /** @type {HTMLSelectElement} */ ($("#pd-printer"));
    const m = sel.value ? mismatchFor(sel.value) : { mismatch: false };
    $('[data-pd="paper-mark"]').hidden = !m.mismatch;
    const box = $('[data-pd="paper-explain"]');
    if (!m.mismatch) box.hidden = true;
    box.innerHTML = m.mismatch
      ? `${esc(paperMismatchText(m, exact))}${exact ? "" : ` <a data-pd="print-settings" data-testid="print-settings-link">Open Print Settings</a>`}`
      : "";
    box.querySelector('[data-pd="print-settings"]')?.addEventListener("click", () => {
      close();
      if (api.softPeekRoute) void api.softPeekRoute("/app/print-settings");
      else if (api.openErp) api.openErp("/app/print-settings");
    });
  };
  $('[data-pd="paper-mark"]').addEventListener("click", () => {
    const box = $('[data-pd="paper-explain"]');
    box.hidden = !box.hidden;
  });
  $("#pd-printer").addEventListener("change", () => {
    paintPrinterDetail();
    paintPaper();
  });
  paintPrinterDetail();
  paintPaper();
  $("#pd-asimage")?.addEventListener("change", () => {
    $('[data-pd="asimage-info"]').hidden = /** @type {HTMLInputElement} */ ($("#pd-asimage")).checked;
  });

  // Watching sent jobs (printer hardening): printed, or the printer stopped and why — then
  // Check again (after fixing it) or Stop watching (Esc).
  let watching = null;
  const stopWatching = () => {
    if (watching) clearTimeout(watching.timer);
    watching = null;
    $('[data-pd="watch"]').hidden = true;
  };
  async function watchJobs(jobs) {
    stopWatching();
    if (!api.printJobStatus || !jobs || !jobs.length) return;
    const box = $('[data-pd="watch"]');
    watching = { jobs, timer: 0 };
    const tick = async () => {
      if (!watching) return;
      const st = await api.printJobStatus(watching.jobs).catch(() => []);
      if (!watching) return;
      const trouble = st.filter((j) => j.state === "trouble");
      const left = st.filter((j) => j.state !== "done");
      box.hidden = false;
      if (!left.length) {
        box.classList.remove("trouble");
        box.textContent = `The printer has all ${st.length} job${st.length === 1 ? "" : "s"}.`;
        watching = null;
        return;
      }
      if (trouble.length) {
        box.classList.add("trouble");
        box.innerHTML = `<b>The printer stopped:</b> ${esc(trouble[0].reason)}. ${left.length} job${left.length === 1 ? " is" : "s are"} waiting.<br><button type="button" data-pd="w-again" data-testid="print-watch-again">Check again</button><button type="button" data-pd="w-stop" data-testid="print-watch-stop">Stop watching (Esc)</button>`;
        box.querySelector('[data-pd="w-again"]').addEventListener("click", () => {
          // Fixed the printer (paper, door, power): look again from now.
          watching = { jobs: watching ? watching.jobs.map((j) => ({ ...j, sentAt: Date.now() })) : [], timer: 0 };
          box.classList.remove("trouble");
          box.textContent = "Checking the printer again…";
          void tick();
        });
        box.querySelector('[data-pd="w-stop"]').addEventListener("click", stopWatching);
        return; // waits for Check again or Stop watching
      }
      box.classList.remove("trouble");
      box.textContent = `Printing… ${left.length} job${left.length === 1 ? "" : "s"} still at the printer.`;
      watching.timer = setTimeout(tick, 2000);
    };
    await tick();
  }

  paintQueue(await api.printQueueGet().catch(() => null));

  const run = async (fn, verb) => {
    busy(true);
    setStatus(`${verb}…`);
    try {
      const r = await fn();
      if (r && r.cancelled) setStatus("Cancelled — nothing saved.");
      else setStatus((r && (r.summary || r.reason)) || "Done.", !(r && r.ok));
      if (r && r.queue) paintQueue(r);
      if (r && Array.isArray(r.jobs) && r.jobs.length) void watchJobs(r.jobs);
    } catch (e) {
      setStatus(String(e && e.message ? e.message : e), true);
    } finally {
      busy(false);
    }
  };
  const remember = (c) => ({
    doctype,
    format: c.format,
    withLetterhead: c.withLetterhead,
    deviceName: c.deviceName,
    ...(exact ? {} : { printAsImage: c.printAsImage }),
  });

  if (doc) {
    $('[data-pd="print"]').addEventListener("click", () => {
      const c = choice();
      run(() => api.printRun({ items: [itemFor(c)], dest: "printer", deviceName: c.deviceName, printAsImage: c.printAsImage, remember: remember(c) }), "Printing");
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
    run(() => api.printQueueRun({ dest: "printer", deviceName: c.deviceName, printAsImage: c.printAsImage }), "Printing the queue");
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
