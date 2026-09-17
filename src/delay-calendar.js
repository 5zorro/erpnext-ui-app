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
 * @param {string} text
 * @returns {{ entries: DelayDay[], errors: string[] }}
 */
export function parseDelayCalendarCsv(text) {
  const rows = splitCsv(String(text == null ? "" : text));
  /** @type {DelayDay[]} */
  const entries = [];
  const errors = [];
  if (!rows.length) return { entries, errors };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("date");
  const idx = hasHeader
    ? Object.fromEntries(DELAY_CSV_COLUMNS.map((c) => [c, header.indexOf(c)]))
    : Object.fromEntries(DELAY_CSV_COLUMNS.map((c, i) => [c, i]));

  for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row.length || row.every((c) => !c.trim())) continue;
    const lineNo = r + 1;

    const date = pick(row, idx.date).trim();
    if (!ISO_RE.test(date)) {
      errors.push(`Line ${lineNo}: "${date || "(blank)"}" is not a YYYY-MM-DD date.`);
      continue;
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
  return { entries: dedupe(entries), errors };
}

/**
 * Entries back to CSV, header included, sorted by date then scope so a re-export of an unchanged
 * calendar is byte-identical — a diffable file is the point of choosing CSV.
 *
 * @param {DelayDay[]} entries
 * @returns {string}
 */
export function serializeDelayCalendarCsv(entries) {
  const list = (Array.isArray(entries) ? entries : [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.scope.localeCompare(b.scope));
  const lines = [DELAY_CSV_COLUMNS.join(",")];
  for (const e of list) {
    lines.push(
      [e.date, e.scope, csvCell(e.reason || ""), e.ratified ? "yes" : "no", e.source || "user"].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
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
