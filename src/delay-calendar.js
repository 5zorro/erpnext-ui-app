/**
 * User-ratified delay calendars, as CSV (Packet C2 — the concrete shape of B3).
 *
 * 5zorro rejected the shipped heuristic outright: *"this should not be mathematical, it should be
 * mathematically suggested then signed off by the user before using as a SSOT for postage… A
 * determined user should be able to class whatever they want as a 'delay date' so that they could
 * add weather events, etc."* His counterexample is the one that settles it — **Good Friday is not a
 * federal holiday, but postage got really delayed around that time.** No algorithm was ever going
 * to produce that date, so the algorithm cannot be the source of truth.
 *
 * Three rules, and each one corrects a specific thing the shipped calendar got wrong:
 *
 * 1. 🔴 **Two calendars, not one.** *"ACH is bank days only, so the postage can't delay from a
 *    holiday."* Electronic rails (`ACH`, `DOM_WIRE`, `INT_WIRE`) observe **bank** non-processing
 *    days; only `USPS_Check` observes **postal** delay days on top. One calendar for every method
 *    is as wrong as one calendar for every vendor was. Bridge days are a postal phenomenon — a bank
 *    either processes or it does not; it does not half-process because staff took a long weekend.
 * 2. 🔴 **The algorithm proposes; the user ratifies.** Suggestions arrive `ratified: false` and
 *    `delayCalendarIndex` **ignores them**. An unratified suggestion that silently moved a payment
 *    date would be the exact failure being corrected.
 * 3. 🔴 **CSV is the interchange format**, so a year of local knowledge can be pasted in without a
 *    bespoke editor. Round-trip: export the generated set, edit it, re-import.
 *
 * Weekends and federal holidays are **not** in here. They are structural, they are computed
 * exactly, and nobody needs to ratify that Sunday is Sunday — `bank-business-days.js` owns them.
 * This module is only the layer above: the days that are judgement calls.
 */

import { usFederalHolidays, isBridgeDay } from "./bank-business-days.js";
import { CHEQUE_METHOD } from "./payment-batch-prefs.js";

/**
 * @typedef {"bank"|"postal"} DelayScope
 * @typedef {{
 *   date: string,                   // ISO
 *   scope: DelayScope,
 *   reason: string,
 *   source: "suggested"|"user",
 *   ratified: boolean,              // only ratified entries move a payment date
 * }} DelayDay
 */

export const DELAY_SCOPES = Object.freeze(["bank", "postal"]);

/** CSV header — also the field order `serializeDelayCalendarCsv` writes. */
export const DELAY_CSV_COLUMNS = Object.freeze(["date", "scope", "reason", "ratified", "source"]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
/** `1/16/2026`, `01-16-26`, `3.4.2026` — what a spreadsheet hands back after it has "helped". */
const LOCALE_DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
/** A BOM survives Excel's round trip and would otherwise become part of the header's first cell. */
const BOM = "\ufeff";

/**
 * A date cell, as it comes back from a spreadsheet.
 *
 * 🔴 **Excel is the editor 5zorro asked for** (*"the defacto software of choice of finance
 * professionals"*), and it reformats an ISO date column into the machine's locale on open — so a
 * file exported as `2026-01-16` comes back as `1/16/2026` whether or not anyone edited that row.
 * Refusing it would mean the round trip only works for files nobody opened.
 *
 * The reading is **US month-first**, because every other calendar in this app is US (federal
 * holidays, USPS, NACHA). Two guards keep that from silently inventing a date:
 * - a first component over 12 can only be a day, so `16/1/2026` is read day-first and is not
 *   ambiguous;
 * - a row where **both** components are 12 or under and differ (`3/4/2026`) is genuinely ambiguous.
 *   It is accepted month-first and **reported** as ambiguous, so the panel can list those rows for
 *   an eyeball rather than either rejecting a whole year's file or quietly picking March.
 *
 * A two-digit year maps to 2000+ — a delay calendar is a forward-looking document, and 1926 is not
 * a plausible reading.
 *
 * @param {string} raw
 * @returns {{ date: string, ambiguous: boolean, error: string }}
 */
export function normalizeDelayDate(raw) {
  const s = String(raw == null ? "" : raw).replace(BOM, "").trim();
  if (!s) return { date: "", ambiguous: false, error: "(blank)" };
  if (ISO_RE.test(s)) {
    return isRealDate(s) ? { date: s, ambiguous: false, error: "" } : { date: "", ambiguous: false, error: s };
  }
  const m = LOCALE_DATE_RE.exec(s);
  if (!m) return { date: "", ambiguous: false, error: s };
  const a = Number(m[1]);
  const b = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  // Day-first only when month-first is impossible; otherwise US order, flagged when it could go
  // either way. "Could go either way" excludes 3/3, which reads the same under both.
  const dayFirst = a > 12;
  const month = dayFirst ? b : a;
  const day = dayFirst ? a : b;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isRealDate(iso)) return { date: "", ambiguous: false, error: s };
  return { date: iso, ambiguous: !dayFirst && b <= 12 && a !== b, error: "" };
}

/** Does this ISO string name a day that exists? `2026-02-30` parses as a string but is not a date. */
function isRealDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Which delay calendars a payment method observes.
 *
 * Everything observes `bank`. Only the cheque additionally observes `postal` — that is the whole
 * of rule 1 above. An **unrecorded** method observes both, deliberately: the engine already prices
 * a NULL method as a cheque because that is the conservative guess, and the calendar makes the
 * same conservative guess for the same reason. Being early is recoverable; being late is not.
 *
 * @param {string|null|undefined} method a `Mode of Payment` name
 * @returns {DelayScope[]}
 */
export function methodDelayScopes(method) {
  const key = method == null ? "" : String(method).trim();
  if (!key || key === CHEQUE_METHOD) return ["bank", "postal"];
  return ["bank"];
}

/**
 * The delay days the rules *suggest* for a year — every one unratified.
 *
 * Today that is bridge days only, scoped postal. It is deliberately a short list: the structural
 * days live in `bank-business-days.js`, and everything else is local knowledge no algorithm has.
 *
 * @param {number} year
 * @returns {DelayDay[]} sorted by date
 */
export function proposeDelayCalendar(year) {
  const y = Number(year);
  if (!Number.isInteger(y)) return [];
  /** @type {DelayDay[]} */
  const out = [];
  for (const holiday of usFederalHolidays(y)) {
    for (const candidate of [addDays(holiday, 1), addDays(holiday, -1)]) {
      if (candidate.slice(0, 4) !== String(y)) continue;
      if (!isBridgeDay(candidate)) continue;
      out.push({
        date: candidate,
        scope: "postal",
        reason: `Bridge day next to the ${holiday} federal holiday — mail crews take the long weekend`,
        source: "suggested",
        ratified: false,
      });
    }
  }
  return dedupe(out).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Parse an edited CSV back into entries.
 *
 * Tolerant of what a spreadsheet actually produces — a header row in any column order, CRLF, quoted
 * fields with embedded commas, blank lines — and **intolerant of a bad date**, which is reported as
 * an error rather than dropped silently. A row the user typed and this module discarded without
 * saying so is a delay day that quietly stops applying.
 *
 * `warnings` is separate from `errors` on purpose: an error means a row was **dropped**, a warning
 * means a row was **kept** under a reading the user should glance at (see `normalizeDelayDate`).
 *
 * @param {string} text
 * @returns {{ entries: DelayDay[], errors: string[], warnings: string[] }}
 */
export function parseDelayCalendarCsv(text) {
  // Strip the BOM our own Excel-friendly export writes, or it becomes part of the first header
  // cell, the header stops being recognised, and row 1 is parsed as data.
  const rows = splitCsv(String(text == null ? "" : text).replace(/^\ufeff/, ""));
  /** @type {DelayDay[]} */
  const entries = [];
  const errors = [];
  const warnings = [];
  if (!rows.length) return { entries, errors, warnings };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("date");
  const idx = hasHeader
    ? Object.fromEntries(DELAY_CSV_COLUMNS.map((c) => [c, header.indexOf(c)]))
    : Object.fromEntries(DELAY_CSV_COLUMNS.map((c, i) => [c, i]));

  for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row.length || row.every((c) => !c.trim())) continue;
    const lineNo = r + 1;

    const parsed = normalizeDelayDate(pick(row, idx.date));
    if (!parsed.date) {
      errors.push(`Line ${lineNo}: "${parsed.error}" is not a date this can read.`);
      continue;
    }
    const date = parsed.date;
    if (parsed.ambiguous) {
      warnings.push(
        `Line ${lineNo}: "${pick(row, idx.date).trim()}" read as ${date} (month first). ` +
          `Check it if your spreadsheet writes day first.`,
      );
    }
    const scopeRaw = pick(row, idx.scope).trim().toLowerCase();
    const scope = DELAY_SCOPES.includes(scopeRaw) ? scopeRaw : "";
    if (!scope) {
      errors.push(`Line ${lineNo}: scope must be "bank" or "postal", not "${scopeRaw || "(blank)"}".`);
      continue;
    }
    entries.push({
      date,
      scope: /** @type {DelayScope} */ (scope),
      reason: pick(row, idx.reason).trim(),
      // A hand-edited row is the user's own statement, so it defaults to ratified: they typed it.
      // A suggestion has to say so explicitly, which is what the exported file does.
      ratified: parseBool(pick(row, idx.ratified), true),
      source: pick(row, idx.source).trim() === "suggested" ? "suggested" : "user",
    });
  }
  return { entries: dedupe(entries), errors, warnings };
}

/**
 * Entries back to CSV, header included, sorted by date then scope so a re-export of an unchanged
 * calendar is byte-identical — a diffable file is the point of choosing CSV.
 *
 * `opts.excel` writes the file Excel opens cleanly on a double click: a BOM so UTF-8 in a reason
 * ("Nor'easter") survives, and CRLF line endings. It is **off by default** so the stored file and
 * the tests stay byte-identical to what this module has always written — the export button opts in,
 * nothing else does.
 *
 * @param {DelayDay[]} entries
 * @param {{ excel?: boolean }} [opts]
 * @returns {string}
 */
export function serializeDelayCalendarCsv(entries, opts = {}) {
  const list = (Array.isArray(entries) ? entries : [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.scope.localeCompare(b.scope));
  const lines = [DELAY_CSV_COLUMNS.join(",")];
  for (const e of list) {
    lines.push(
      [e.date, e.scope, csvCell(e.reason || ""), e.ratified ? "yes" : "no", e.source || "user"].join(","),
    );
  }
  const eol = opts.excel ? "\r\n" : "\n";
  return `${opts.excel ? BOM : ""}${lines.join(eol)}${eol}`;
}

/**
 * Fold `incoming` onto `existing`, keyed by `(date, scope)`.
 *
 * Two rules, both protecting a decision the user already made:
 * - **A user entry always beats a suggestion.** Re-running the proposer must never overwrite
 *   something typed by hand.
 * - **Ratification survives.** If the user ratified a suggestion and the same suggestion comes back
 *   from a later proposal run, it stays ratified rather than reverting to unratified.
 *
 * @param {DelayDay[]} existing
 * @param {DelayDay[]} incoming
 * @returns {DelayDay[]} sorted, new array; inputs are not mutated
 */
export function mergeDelayCalendar(existing, incoming) {
  /** @type {Map<string, DelayDay>} */
  const byKey = new Map();
  for (const e of Array.isArray(existing) ? existing : []) {
    if (e && ISO_RE.test(e.date)) byKey.set(keyOf(e), { ...e });
  }
  for (const e of Array.isArray(incoming) ? incoming : []) {
    if (!e || !ISO_RE.test(e.date)) continue;
    const key = keyOf(e);
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, { ...e });
      continue;
    }
    if (prior.source === "user" && e.source === "suggested") continue; // hand-typed wins
    byKey.set(key, { ...prior, ...e, ratified: prior.ratified || e.ratified });
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.scope.localeCompare(b.scope));
}

/**
 * A lookup for the date walker.
 *
 * 🔴 **Ratified entries only.** This is rule 2, enforced in the one place it has to be: an
 * unratified suggestion is a proposal on a screen, never a day that moved a payment.
 *
 * @param {DelayDay[]} entries
 * @returns {{ bank: Set<string>, postal: Set<string>, reasons: Map<string, string> }}
 */
export function delayCalendarIndex(entries) {
  const index = { bank: new Set(), postal: new Set(), reasons: new Map() };
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || !e.ratified || !ISO_RE.test(e.date) || !DELAY_SCOPES.includes(e.scope)) continue;
    index[e.scope].add(e.date);
    index.reasons.set(keyOf(e), e.reason || "");
  }
  return index;
}

/**
 * Is `isoDate` a ratified delay day for a payment sent by `method`?
 *
 * @param {ReturnType<typeof delayCalendarIndex>} index
 * @param {string} isoDate
 * @param {string|null|undefined} method
 * @returns {boolean}
 */
export function isDelayDay(index, isoDate, method) {
  if (!index) return false;
  return methodDelayScopes(method).some((scope) => index[scope] && index[scope].has(isoDate));
}

/** The reason a date is a delay day for `method`, or `""`. */
export function delayDayReason(index, isoDate, method) {
  if (!index) return "";
  for (const scope of methodDelayScopes(method)) {
    const r = index.reasons && index.reasons.get(`${isoDate}|${scope}`);
    if (r != null && index[scope] && index[scope].has(isoDate)) return r;
  }
  return "";
}

/**
 * The probe `bank-business-days.js::explainPayByDate` takes as `opts.delayDay` — the switch that
 * makes the ratified calendar, rather than the bridge-day rule, decide which judgement days move a
 * payment (P3d).
 *
 * Returns the entry's own reason when it has one, so the audit trail can say *"Nor'easter, carrier
 * stopped"* instead of *"delay day"*. A ratified entry with a blank reason still has to move the
 * date, so it falls back to a label rather than to `""` — an empty string means "not a delay day",
 * and a silent no would be the calendar failing to apply what the user signed off.
 *
 * @param {ReturnType<typeof delayCalendarIndex>} index
 * @param {string|null|undefined} method
 * @returns {(iso: string) => string}
 */
export function delayDayProbe(index, method) {
  return (iso) => {
    if (!isDelayDay(index, iso, method)) return "";
    return delayDayReason(index, iso, method) || "Ratified delay day";
  };
}

/**
 * How many entries are still awaiting sign-off — what the panel puts on its "N unratified" chip.
 * @param {DelayDay[]} entries
 */
export function unratifiedCount(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e && !e.ratified).length;
}

/** @param {DelayDay} e */
function keyOf(e) {
  return `${e.date}|${e.scope}`;
}

/** @param {DelayDay[]} list last one wins, matching CSV's own "later row overrides" intuition */
function dedupe(list) {
  const byKey = new Map();
  for (const e of list) byKey.set(keyOf(e), e);
  return [...byKey.values()];
}

/** @param {string} iso @param {number} n */
function addDays(iso, n) {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

/** @param {string[]} row @param {number} i */
function pick(row, i) {
  return i >= 0 && i < row.length ? row[i] : "";
}

/** @param {string} v @param {boolean} fallback */
function parseBool(v, fallback) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return fallback;
  return ["yes", "y", "true", "1", "ratified"].includes(s);
}

/** Quote a cell only when it needs it, so a plain reason stays diff-friendly. @param {string} s */
function csvCell(s) {
  const v = String(s).replace(/[\r\n]+/g, " ");
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Minimal RFC4180-ish split: handles quoted fields, doubled quotes inside them, and CRLF.
 * Enough for a spreadsheet round trip, and small enough to keep in-tree rather than take a dep.
 * @param {string} text
 * @returns {string[][]}
 */
function splitCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
