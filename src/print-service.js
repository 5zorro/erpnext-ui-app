/**
 * Printing (plan 2026-09-26 "Printing — how Frappe does it, and one convention", agreed
 * 5zorro 2026-10-03). Pure: URLs, the popup interceptor's classifier, the queue, remembered choices.
 *
 * 1. ERPNext renders, the shell only delivers: every page comes from `/printview` and every PDF
 *    from `frappe.utils.print_format.download_pdf` / `download_multi_pdf`, with ERPNext's own Print
 *    Format, Letter Head and print style — the same output as Vanilla.
 * 2. Print never leaves the page and never opens a window. Frappe's own Print / PDF buttons open a
 *    window (`print.js` `render_page` / `render_pdf`); main catches those URLs (classifyErpPrintUrl)
 *    and hands them here instead.
 * 3. Printer: `/printview` without `trigger_print`, printed by Electron. File: ERPNext's PDF.
 */

import { plainFileName } from "./zip-store.js";

/** Frappe's own cap on one bulk print (`list/bulk_operations.js` MAX_PRINT_LIMIT). */
export const PRINT_QUEUE_MAX = 500;
/** Above this, Frappe's list view moves a merged PDF to a background job. */
export const MULTI_PDF_SYNC_MAX = 20;

/**
 * @typedef {{ doctype: string, name: string, format?: string, noLetterhead?: boolean, letterhead?: string }} PrintItem
 *   `doctype` is the ERPNext doctype ("Purchase Invoice"), not the route key.
 */

const str = (v) => (v == null ? "" : String(v).trim());

/** @param {PrintItem} item @returns {URLSearchParams} */
function printParams(item) {
  const p = new URLSearchParams({ doctype: str(item.doctype), name: str(item.name) });
  if (str(item.format)) p.set("format", str(item.format));
  p.set("no_letterhead", item.noLetterhead ? "1" : "0");
  if (str(item.letterhead)) p.set("letterhead", str(item.letterhead));
  return p;
}

/**
 * The page a printer gets — ERPNext's print view, without `trigger_print` (Electron prints it).
 * @param {string} erpBase
 * @param {PrintItem} item
 */
export function printviewUrl(erpBase, item) {
  return `${String(erpBase || "").replace(/\/$/, "")}/printview?${printParams(item).toString()}`;
}

/** @param {string} erpBase @param {PrintItem} item */
export function pdfUrl(erpBase, item) {
  return `${String(erpBase || "").replace(/\/$/, "")}/api/method/frappe.utils.print_format.download_pdf?${printParams(item).toString()}`;
}

/**
 * One merged PDF. Frappe takes either one doctype + a JSON list of names, or a
 * `{doctype: [names]}` map, which lets a mixed batch go in one file.
 * @param {string} erpBase
 * @param {PrintItem[]} items one format and letter head for the whole file
 * @param {{ format?: string, noLetterhead?: boolean, letterhead?: string }} [opts]
 */
export function multiPdfUrl(erpBase, items, opts = {}) {
  const byType = {};
  for (const it of items || []) {
    const dt = str(it.doctype);
    if (!dt || !str(it.name)) continue;
    (byType[dt] = byType[dt] || []).push(str(it.name));
  }
  const types = Object.keys(byType);
  const p = new URLSearchParams();
  if (types.length === 1) {
    p.set("doctype", types[0]);
    p.set("name", JSON.stringify(byType[types[0]]));
  } else {
    p.set("doctype", JSON.stringify(byType));
    p.set("name", "[]");
  }
  if (str(opts.format)) p.set("format", str(opts.format));
  p.set("no_letterhead", opts.noLetterhead ? "1" : "0");
  if (str(opts.letterhead)) p.set("letterhead", str(opts.letterhead));
  return `${String(erpBase || "").replace(/\/$/, "")}/api/method/frappe.utils.print_format.download_multi_pdf?${p.toString()}`;
}

/**
 * What a window Frappe tried to open is, when it is a print. Anything else → null (not ours).
 * @param {string} url
 * @param {string} erpBase
 * @returns {null | { kind: "printview"|"pdf"|"multi-pdf", items: PrintItem[], format: string, noLetterhead: boolean, letterhead: string }}
 */
export function classifyErpPrintUrl(url, erpBase) {
  let u;
  try {
    u = new URL(String(url || ""), erpBase || "http://x");
  } catch {
    return null;
  }
  if (erpBase) {
    try {
      if (u.origin !== new URL(erpBase).origin) return null;
    } catch {
      return null;
    }
  }
  const q = u.searchParams;
  const common = {
    format: str(q.get("format")),
    noLetterhead: q.get("no_letterhead") === "1",
    letterhead: str(q.get("letterhead")),
  };
  const one = () => [{ doctype: str(q.get("doctype")), name: str(q.get("name")), ...common }];
  if (u.pathname === "/printview") return q.get("doctype") && q.get("name") ? { kind: "printview", items: one(), ...common } : null;
  if (/\/api\/method\/frappe\.utils\.(print_format|weasyprint)\.download_pdf$/.test(u.pathname)) {
    return q.get("doctype") && q.get("name") ? { kind: "pdf", items: one(), ...common } : null;
  }
  if (/\/api\/method\/frappe\.utils\.print_format\.download_multi_pdf(_async)?$/.test(u.pathname)) {
    return { kind: "multi-pdf", items: multiItems(q.get("doctype"), q.get("name"), common), ...common };
  }
  return null;
}

function multiItems(rawDoctype, rawNames, common) {
  const parse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  const map = parse(rawDoctype);
  if (map && typeof map === "object" && !Array.isArray(map)) {
    return Object.entries(map).flatMap(([dt, names]) =>
      (Array.isArray(names) ? names : []).map((n) => ({ doctype: dt, name: str(n), ...common })),
    );
  }
  const names = parse(rawNames);
  return (Array.isArray(names) ? names : []).map((n) => ({ doctype: str(rawDoctype), name: str(n), ...common }));
}

/**
 * Why ERPNext would refuse to print this document, or "" — so the button can say it before
 * ERPNext does (`printview.py get_rendered_template`). The shell never works around these.
 * @param {{ name?: string, docstatus?: number|string }|null|undefined} doc
 * @param {{ allow_print_for_draft?: unknown, allow_print_for_cancelled?: unknown }|null|undefined} settings
 */
export function printBlockReason(doc, settings) {
  const d = doc || {};
  const name = str(d.name);
  if (!name || /^new-/.test(name) || name === "new") return "Save it first — ERPNext prints the saved document.";
  const s = settings || {};
  const on = (v) => v === 1 || v === "1" || v === true;
  if (Number(d.docstatus) === 2 && !on(s.allow_print_for_cancelled)) {
    return "ERPNext does not print cancelled documents here (Print Settings › Allow Print for Cancelled).";
  }
  if (Number(d.docstatus) === 0 && s.allow_print_for_draft != null && !on(s.allow_print_for_draft)) {
    return "ERPNext does not print drafts here (Print Settings › Allow Print for Draft).";
  }
  return "";
}

/**
 * Which remembered printer a document goes to: checks, invoices, everything else.
 * @param {string} doctype ERPNext doctype
 * @returns {"checks"|"invoices"|"documents"}
 */
export function printerPurposeFor(doctype) {
  if (doctype === "Payment Entry") return "checks";
  if (doctype === "Sales Invoice") return "invoices";
  return "documents";
}

/**
 * @typedef {{
 *   printers: { checks?: string, invoices?: string, documents?: string },
 *   formats: Record<string, string>,
 *   letterhead: Record<string, boolean>,
 *   recentPrinters: string[],
 *   printAsImage: boolean,
 * }} PrintPrefs
 *   `letterhead[doctype]` = print with letter head. Never written to the site.
 */

/** @param {unknown} raw @returns {PrintPrefs} */
export function mergePrintPrefs(raw) {
  const r = raw && typeof raw === "object" ? /** @type {any} */ (raw) : {};
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const strings = (o) => Object.fromEntries(Object.entries(obj(o)).filter(([, v]) => typeof v === "string" && v));
  const bools = (o) => Object.fromEntries(Object.entries(obj(o)).filter(([, v]) => typeof v === "boolean"));
  const recent = (Array.isArray(r.recentPrinters) ? r.recentPrinters : []).filter((v) => typeof v === "string" && v);
  return {
    printers: strings(r.printers),
    formats: strings(r.formats),
    letterhead: bools(r.letterhead),
    recentPrinters: [...new Set(recent)].slice(0, RECENT_PRINTERS_MAX),
    // Printer hardening (5zorro 2026-10-03): on unless the clerk turned it off.
    printAsImage: r.printAsImage !== false,
  };
}

/** How many recently used printers sort to the top of the menu (5zorro 2026-10-03). */
export const RECENT_PRINTERS_MAX = 3;

/**
 * The printer menu: the most recently used (newest first) on top, then the rest as the system
 * lists them. A remembered printer this computer no longer has is simply not shown.
 * @template {{ name: string }} P
 * @param {P[]} printers
 * @param {string[]} recent
 * @returns {P[]}
 */
export function sortPrintersByRecent(printers, recent) {
  const list = Array.isArray(printers) ? printers : [];
  const order = (Array.isArray(recent) ? recent : []).slice(0, RECENT_PRINTERS_MAX);
  const top = order.map((n) => list.find((p) => p && p.name === n)).filter(Boolean);
  return [...top, ...list.filter((p) => p && !order.includes(p.name))];
}

/**
 * Remember what the clerk just chose. A blank value forgets it (back to ERPNext's default).
 * @param {PrintPrefs} prefs
 * @param {{ doctype?: string, format?: string, withLetterhead?: boolean, deviceName?: string }} choice
 * @returns {PrintPrefs}
 */
export function rememberPrintChoice(prefs, choice) {
  const p = mergePrintPrefs(prefs);
  const c = choice || {};
  const dt = str(c.doctype);
  if (dt && c.format !== undefined) {
    if (str(c.format)) p.formats[dt] = str(c.format);
    else delete p.formats[dt];
  }
  if (dt && typeof c.withLetterhead === "boolean") p.letterhead[dt] = c.withLetterhead;
  if (dt && c.deviceName !== undefined) {
    const purpose = printerPurposeFor(dt);
    if (str(c.deviceName)) p.printers[purpose] = str(c.deviceName);
    else delete p.printers[purpose];
  }
  if (typeof c.printAsImage === "boolean") p.printAsImage = c.printAsImage;
  if (str(c.deviceName)) {
    p.recentPrinters = [str(c.deviceName), ...p.recentPrinters.filter((n) => n !== str(c.deviceName))].slice(0, RECENT_PRINTERS_MAX);
  }
  return p;
}

/** @param {PrintItem} it */
const queueKey = (it) => `${str(it.doctype)}\u0000${str(it.name)}`;

/**
 * Add to the app-wide print queue: one entry per document (adding again updates its format),
 * capped at Frappe's own bulk limit.
 * @param {PrintItem[]} queue
 * @param {PrintItem[]} items
 * @returns {{ queue: PrintItem[], added: number, refused: number }}
 */
export function addToPrintQueue(queue, items) {
  const out = Array.isArray(queue) ? queue.slice() : [];
  let added = 0;
  let refused = 0;
  for (const raw of items || []) {
    const it = { ...raw, doctype: str(raw && raw.doctype), name: str(raw && raw.name) };
    if (!it.doctype || !it.name) continue;
    const at = out.findIndex((q) => queueKey(q) === queueKey(it));
    if (at >= 0) {
      out[at] = { ...out[at], ...it };
      continue;
    }
    if (out.length >= PRINT_QUEUE_MAX) {
      refused += 1;
      continue;
    }
    out.push(it);
    added += 1;
  }
  return { queue: out, added, refused };
}

/**
 * @param {PrintItem[]} queue
 * @param {PrintItem[]} items to remove (by doctype + name)
 */
export function removeFromPrintQueue(queue, items) {
  const drop = new Set((items || []).map(queueKey));
  return (Array.isArray(queue) ? queue : []).filter((q) => !drop.has(queueKey(q)));
}

/**
 * Group the queue by doctype + format + letter head — one merged PDF per group, one remembered
 * printer per doctype's purpose. Order inside a group is the order added (a check run adds its
 * checks in check-number order).
 * @param {PrintItem[]} queue
 * @returns {Array<{ doctype: string, format: string, noLetterhead: boolean, letterhead: string, items: PrintItem[] }>}
 */
export function groupPrintQueue(queue) {
  /** @type {Map<string, { doctype: string, format: string, noLetterhead: boolean, letterhead: string, items: PrintItem[] }>} */
  const groups = new Map();
  for (const it of queue || []) {
    const key = [it.doctype, str(it.format), it.noLetterhead ? 1 : 0, str(it.letterhead)].join("\u0000");
    if (!groups.has(key)) {
      groups.set(key, {
        doctype: str(it.doctype),
        format: str(it.format),
        noLetterhead: !!it.noLetterhead,
        letterhead: str(it.letterhead),
        items: [],
      });
    }
    groups.get(key).items.push(it);
  }
  return [...groups.values()];
}

/**
 * A file name for one document's PDF: its own name, made safe (ERPNext's `download_pdf` does the
 * same replacements).
 * @param {string} name
 */
export function pdfFileName(name) {
  const safe = plainFileName(name).replace(/[\s/\\:*?"<>|]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "document"}.pdf`;
}

/**
 * Per-document results of a batch, said once: "Printed 9 of 10 — ACC-PAY-…-07: <why>".
 * @param {Array<{ item: PrintItem, ok: boolean, reason?: string }>} results
 * @param {"Printed"|"Saved"} verb
 */
export function summarizePrintResults(results, verb) {
  const list = Array.isArray(results) ? results : [];
  const ok = list.filter((r) => r.ok).length;
  const failed = list.filter((r) => !r.ok);
  const head = `${verb} ${ok} of ${list.length}`;
  if (!failed.length) return head + ".";
  return `${head} — ${failed.map((r) => `${r.item.name}: ${r.reason || "failed"}`).join("; ")}`;
}

/**
 * A payment paid by check goes straight into the print queue (a check run, plan "Printing").
 * ERPNext's Mode of Payment has no "check" type (Cash / Bank / General / Phone), so the name says it.
 * @param {string|null|undefined} modeOfPayment
 */
export function isCheckModeOfPayment(modeOfPayment) {
  // Letter boundaries, not \b: "USPS_Check" must count, "Checking account transfer" must not.
  return /(^|[^a-z])che(ck|que)s?([^a-z]|$)/i.test(String(modeOfPayment || ""));
}

/**
 * How a printer reads in the menu: its full name, and where it is when the system says
 * (5zorro 2026-10-03: names were cut off, and the network address helps tell two apart).
 * Electron's PrinterInfo `options` carries CUPS / IPP attributes on Linux and macOS.
 * @param {{ name?: string, displayName?: string, description?: string, options?: Record<string, string> }} p
 * @returns {{ label: string, address: string }}
 */
export function printerLabel(p) {
  const o = (p && p.options) || {};
  const name = str((p && (p.displayName || p.name)) || "");
  const address = str(o["device-uri"] || o["printer-uri-supported"] || o["printer-location"] || (p && p.description) || "");
  return { label: address && address !== name ? `${name} — ${address}` : name, address: address === name ? "" : address };
}

/**
 * Self-healing printing (5zorro 2026-10-03: "ideally this app will self heal from stuff like that
 * common docker issue"). Every failure is sorted by who can fix it:
 *
 * - `rule`    — ERPNext said no on purpose (a draft / cancelled document, a permission). Passed
 *               through unchanged; never worked around.
 * - `session` — logged out. The clerk logs in again.
 * - `engine`  — ERPNext's PDF engine broke (wkhtmltopdf cannot reach the site's own CSS inside
 *               Docker, is missing, or crashed). The shell heals it for the clerk: it renders
 *               ERPNext's own /printview to PDF itself. IT gets the cause and the exact fix.
 * - `printer` — this computer's printer: gone, offline, refused. The job stays queued.
 * - `unknown` — said as ERPNext said it.
 *
 * The shell never changes the server: it talks HTTP only, and the fix is IT's (Clean Core).
 * @param {string|null|undefined} reason the failure text (ERPNext's message, or Electron's)
 * @returns {{ kind: "rule"|"session"|"engine"|"printer"|"unknown", cause: string, fix: string }}
 */
export function diagnosePrintFailure(reason) {
  const r = String(reason || "");
  if (/not allowed to print|PermissionError|insufficient permission|no permission/i.test(r)) {
    return { kind: "rule", cause: "ERPNext does not allow printing this document.", fix: "" };
  }
  if (/\b401\b|not logged in|session expired|login required|AuthenticationError/i.test(r)) {
    return { kind: "session", cause: "The ERPNext session has ended.", fix: "Log in again (the Log in button in the top bar)." };
  }
  if (/network error|ConnectionRefused|HostNotFound|UnknownNetworkError|ConnectionRefusedError/i.test(r)) {
    return {
      kind: "engine",
      cause:
        "ERPNext's PDF engine (wkhtmltopdf) cannot reach the site's own address from inside the server, so it cannot load the page's styles. Common with Docker.",
      fix:
        "IT: point the site at an address the server can reach, e.g. in frappe_docker: bench --site <site> set-config host_name 'http://frontend:8080'",
    };
  }
  if (/wkhtmltopdf|OSError|IOError|pdfkit|PDF generation|\b50[023]\b/i.test(r)) {
    return {
      kind: "engine",
      cause: "ERPNext's PDF engine (wkhtmltopdf) failed on the server.",
      // Over HTTP ERPNext says only "OSError"; the usual cause in Docker is the network one.
      fix:
        "IT: most often the server cannot reach the site's own address (Docker) — in frappe_docker: bench --site <site> set-config host_name 'http://frontend:8080'. Otherwise check wkhtmltopdf (0.12.x with patched qt) and the server's error log.",
    };
  }
  if (/printer|device|deviceName|offline|print job|not printed|cups/i.test(r)) {
    return {
      kind: "printer",
      cause: "The printer did not take the job.",
      fix: "Pick another printer, or the system dialog; the job stays in the print queue.",
    };
  }
  return { kind: "unknown", cause: r || "Printing failed.", fix: "" };
}

/**
 * Self-healing, printer side (found 2026-10-03: Chromium's silent print on Linux refused a working
 * CUPS printer with "Invalid printer settings" whatever the options). The same PDF the clerk would
 * save — ERPNext's, or the app's own when ERPNext's engine is down — goes to the operating system's
 * print command instead: `lp` on Linux / macOS (CUPS), SumatraPDF on Windows when it is installed
 * (5zorro's suggestion). Null when this platform has none.
 * @param {{ platform: string, deviceName: string, file: string, title?: string, sumatraPath?: string }} o
 * @returns {{ cmd: string, args: string[] }|null}
 */
export function osPrintCommand(o) {
  const device = str(o && o.deviceName);
  const file = str(o && o.file);
  if (!device || !file) return null;
  // Printer hardening: shrink to the printer's paper when it differs; checks never scale.
  const fit = !!(o && o.fitToPage) && !(o && o.exact);
  if (o.platform === "linux" || o.platform === "darwin") {
    const args = ["-d", device];
    if (str(o.title)) args.push("-t", str(o.title));
    if (fit) args.push("-o", "fit-to-page");
    args.push(file);
    return { cmd: "lp", args };
  }
  if (o.platform === "win32" && str(o.sumatraPath)) {
    return { cmd: str(o.sumatraPath), args: ["-print-to", device, "-print-settings", fit ? "fit" : "noscale", "-silent", file] };
  }
  return null;
}

/** Chromium's silent print refusing the printer itself — the cue to switch to the OS command. */
export function isChromiumPrintRefusal(reason) {
  return /invalid printer settings|printer settings|failed to print|print job (failed|canceled)/i.test(String(reason || ""));
}

/* ---------------- Printer hardening (5zorro 2026-10-03) ---------------- */

const PAPER_ALIASES = Object.freeze({
  letter: "Letter",
  "na_letter_8.5x11in": "Letter",
  ansia: "Letter",
  legal: "Legal",
  "na_legal_8.5x14in": "Legal",
  a4: "A4",
  iso_a4_210x297mm: "A4",
  a3: "A3",
  iso_a3_297x420mm: "A3",
  a5: "A5",
  iso_a5_148x210mm: "A5",
  tabloid: "Tabloid",
  ledger: "Tabloid",
  "11x17": "Tabloid",
  executive: "Executive",
});

/**
 * One name per paper size, whatever the system calls it ("na_letter_8.5x11in", "Letter", 1).
 * @param {unknown} raw
 * @returns {string} "" when unknown
 */
export function normalizePaper(raw) {
  const k = str(raw).replace(/^\*/, "").toLowerCase();
  return PAPER_ALIASES[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : "");
}

/**
 * CUPS `lpoptions -p <printer> -l` → the printer's default and supported paper sizes.
 * The line looks like `PageSize/Page Size: Letter *A4 Legal …` (the default starred).
 * @param {string} text
 * @returns {{ default: string, supported: string[] }}
 */
export function parseCupsPaper(text) {
  const line = String(text || "").split(/\r?\n/).find((l) => /^(PageSize|media)\b[^:]*:/i.test(l)) || "";
  const values = line.replace(/^[^:]*:\s*/, "").split(/\s+/).filter(Boolean);
  const def = values.find((v) => v.startsWith("*")) || "";
  const supported = [...new Set(values.map(normalizePaper).filter((v) => v && !/^Custom/i.test(v)))];
  return { default: normalizePaper(def), supported };
}

/**
 * Does the document's paper differ from what the printer loads by default?
 * @param {string} docPaper ERPNext Print Settings' pdf_page_size ("A4")
 * @param {{ default?: string, supported?: string[] }|null|undefined} printerPaper
 * @returns {{ mismatch: boolean, doc: string, printer: string }}
 */
export function paperMismatch(docPaper, printerPaper) {
  const doc = normalizePaper(docPaper) || "A4";
  const printer = normalizePaper(printerPaper && printerPaper.default);
  return { mismatch: !!printer && printer !== doc, doc, printer };
}

/** The explanation behind the ⚠ — document size vs paper, what the app does, how to stop needing it. */
export function paperMismatchText(m, exact) {
  if (!m || !m.mismatch) return "";
  const base = `ERPNext lays documents out on ${m.doc} (Print Settings › PDF Page Size); this printer loads ${m.printer}.`;
  return exact
    ? `${base} Checks print at exact size, never shrunk — load the check stock their format expects.`
    : `${base} The app shrinks each page to fit ${m.printer}, so it prints, slightly smaller. To print without shrinking, set ERPNext's PDF Page Size to ${m.printer} in Print Settings.`;
}

/**
 * How one document goes to paper. Checks are the exception: exact size, no shrink, no image
 * conversion — their alignment on pre-printed stock depends on it.
 * @param {{ doctype: string, printAsImage: boolean, mismatch: boolean }} o
 * @returns {{ exact: boolean, asImage: boolean, fitToPage: boolean }}
 */
export function printPlan(o) {
  const exact = printerPurposeFor(o && o.doctype) === "checks";
  return {
    exact,
    asImage: !exact && !!(o && o.printAsImage),
    fitToPage: !exact && !!(o && o.mismatch),
  };
}

/** The ℹ shown when "Print as image" is off (5zorro's wording). */
export const PRINT_AS_IMAGE_OFF_NOTE =
  "Print jobs will be faster but there is a slightly increased risk that the printer driver won't be able to handle the job.";

/** `lp` prints "request id is PDF-12 (1 file(s))". */
export function parseLpJobId(stdout) {
  const m = /request id is (\S+)/i.exec(String(stdout || ""));
  return m ? m[1] : "";
}

const STATE_REASONS = Object.freeze({
  "media-empty": "out of paper",
  "media-needed": "needs paper loaded",
  "media-jam": "paper jam",
  "toner-empty": "out of toner",
  "marker-supply-empty": "out of ink or toner",
  "door-open": "a door is open",
  "cover-open": "the cover is open",
  offline: "offline",
  paused: "paused",
  "connecting-to-device": "cannot reach the printer",
  "timed-out": "not answering",
  "stopped-partly": "stopped",
});

/**
 * Where a sent job stands, from CUPS: is it still waiting, and does the printer report trouble?
 * @param {{ jobId: string, pendingText: string, printerText: string, stateReasons?: string, waitedMs: number }} o
 *   pendingText = `lpstat -W not-completed -o <printer>`; printerText = `lpstat -l -p <printer>`
 * @returns {{ state: "done"|"printing"|"trouble", reason: string }}
 */
export function interpretJobStatus(o) {
  const pending = String((o && o.pendingText) || "").split(/\r?\n/).some((l) => l.split(/\s+/)[0] === (o && o.jobId));
  if (!pending) return { state: "done", reason: "" };
  const printer = String((o && o.printerText) || "");
  const reasons = `${(o && o.stateReasons) || ""} ${printer}`.toLowerCase();
  const said = Object.keys(STATE_REASONS).filter((k) => reasons.includes(k)).map((k) => STATE_REASONS[k]);
  if (/disabled|stopped|paused/i.test(printer.split(/\r?\n/)[0] || "") || said.length) {
    return { state: "trouble", reason: said.length ? [...new Set(said)].join(", ") : "the printer stopped" };
  }
  if ((o && o.waitedMs) > 60_000) return { state: "trouble", reason: "still waiting in the queue after a minute — is the printer on and connected?" };
  return { state: "printing", reason: "" };
}

