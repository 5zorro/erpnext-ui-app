/**
 * Calculator session history (Packet C3 / OI-018).
 * Append-only ledger for the shell flyout; prune >24h; no ERP writes.
 */

import { normalizeDoctypeKey } from "../lens-prefs.js";
import { formatCalcResult, parseCalcNumber } from "./calc-engine.js";

/** Rolling forget window while the app is left long-running. */
export const CALC_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

/** Soft cap so userData cannot grow forever if prune is skipped. */
export const CALC_HISTORY_SOFT_CAP = 80;

/**
 * @typedef {{
 *   id: string,
 *   at: number,
 *   sourceLabel: string,
 *   fieldKind?: string,
 *   footing: string,
 *   total: string,
 *   priorSession?: boolean,
 * }} CalcHistoryEntry
 */

/**
 * Clerk-facing source label for a Doc skin (history block header).
 * @param {string|null|undefined} doctypeKey
 * @returns {string}
 */
export function calcSourceLabel(doctypeKey) {
  const key = normalizeDoctypeKey(doctypeKey || "");
  if (key === "purchase-invoice") return "Bill entry";
  if (key === "purchase-order") return "Purchase Order";
  if (key === "purchase-receipt") return "Item Receipt";
  if (key) return key.replace(/-/g, " ");
  return "Doc entry";
}

/**
 * Flyout display label (source + prior-session marker).
 * @param {CalcHistoryEntry|null|undefined} entry
 * @returns {string}
 */
export function calcHistoryDisplayLabel(entry) {
  if (!entry) return "";
  const src = entry.sourceLabel || "Doc entry";
  return entry.priorSession ? `${src} · Previous session` : src;
}

/**
 * Mark every loaded entry as from a previous app run (call once on shell start).
 * @param {CalcHistoryEntry[]} entries
 * @returns {CalcHistoryEntry[]}
 */
export function markCalcHistoryPriorSession(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter(Boolean)
    .map((e) => ({ ...e, priorSession: true }));
}

/**
 * @param {Partial<CalcHistoryEntry> & { total: string }} raw
 * @param {{ now?: number, id?: string }} [opts]
 * @returns {CalcHistoryEntry|null}
 */
export function makeCalcHistoryEntry(raw, opts = {}) {
  if (!raw || raw.total == null || String(raw.total).trim() === "") return null;
  const total = String(raw.total).trim();
  const footing = raw.footing != null ? String(raw.footing) : "";
  const now = opts.now != null ? opts.now : Date.now();
  const id =
    opts.id ||
    (raw.id != null && String(raw.id) ? String(raw.id) : `ch-${now}-${Math.random().toString(36).slice(2, 8)}`);
  return {
    id,
    at: Number.isFinite(raw.at) ? Number(raw.at) : now,
    sourceLabel: raw.sourceLabel != null && String(raw.sourceLabel).trim()
      ? String(raw.sourceLabel).trim()
      : "Doc entry",
    fieldKind: raw.fieldKind != null ? String(raw.fieldKind) : undefined,
    footing,
    total,
    priorSession: !!raw.priorSession,
  };
}

/**
 * Drop entries older than TTL; newest-first; soft-cap.
 * @param {CalcHistoryEntry[]} entries
 * @param {{ now?: number, ttlMs?: number, softCap?: number }} [opts]
 * @returns {CalcHistoryEntry[]}
 */
export function pruneCalcHistory(entries, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const ttl = opts.ttlMs != null ? opts.ttlMs : CALC_HISTORY_TTL_MS;
  const softCap = opts.softCap != null ? opts.softCap : CALC_HISTORY_SOFT_CAP;
  const list = Array.isArray(entries) ? entries : [];
  const kept = list
    .filter((e) => e && Number.isFinite(e.at) && now - e.at <= ttl)
    .sort((a, b) => b.at - a.at);
  return kept.slice(0, Math.max(1, softCap));
}

/**
 * Append one entry (newest first after prune). New entries are current-session.
 * @param {CalcHistoryEntry[]} entries
 * @param {CalcHistoryEntry|null|undefined} entry
 * @param {{ now?: number }} [opts]
 * @returns {CalcHistoryEntry[]}
 */
export function appendCalcHistory(entries, entry, opts = {}) {
  if (!entry || !entry.id) return pruneCalcHistory(entries, opts);
  const next = { ...entry, priorSession: false };
  const without = (Array.isArray(entries) ? entries : []).filter((e) => e && e.id !== next.id);
  return pruneCalcHistory([next, ...without], opts);
}

/**
 * Parse one footing line → number text + optional trailing op.
 * @param {string} line
 * @returns {{ num: string, op: string|null }|null}
 */
export function parseFootingLine(line) {
  const s = String(line || "").replace(/\s/g, "");
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)([+\-*/])?$/.exec(s);
  if (!m) return null;
  return { num: m[1], op: m[2] || null };
}

/**
 * Max fraction digits among number strings (for sheet padding).
 * @param {string[]} nums
 * @returns {number}
 */
function maxFractionDigits(nums) {
  let d = 0;
  for (const n of nums) {
    const m = /\.(\d+)/.exec(String(n));
    if (m) d = Math.max(d, m[1].length);
  }
  return d;
}

/**
 * Format a signed value for one spreadsheet cell.
 * @param {number} n
 * @param {number} decimals
 * @returns {string}
 */
function formatSheetCell(n, decimals) {
  if (!Number.isFinite(n)) return "";
  if (decimals > 0) {
    const s = Math.abs(n).toFixed(decimals);
    return n < 0 || Object.is(n, -0) ? `-${s}` : s;
  }
  const base = formatCalcResult(Math.abs(n));
  return n < 0 || Object.is(n, -0) ? `-${base}` : base;
}

/**
 * Turn vertical tape footing into spreadsheet-friendly signed rows.
 * Example: `111.00+` / `111.00-` / `10.00` → `111.00` / `111.00` / `-10.00`
 *
 * `*` / `/` rows keep an op prefix (`*1.10`) so paste stays auditable.
 *
 * @param {string} footing
 * @returns {string[]}
 */
export function footingToSpreadsheetRows(footing) {
  const lines = String(footing || "")
    .split(/\n/)
    .map((l) => l.replace(/\s+$/g, "").trim())
    .filter((l) => l !== "");
  /** @type {{ kind: "add"|"mul", value: number, raw: string }[]} */
  const tokens = [];
  /** @type {"+"|"-"|"*"|"/"|null} */
  let pending = "+";

  for (const line of lines) {
    const parsed = parseFootingLine(line);
    if (!parsed) continue;
    const n = parseCalcNumber(parsed.num);
    if (n == null) continue;

    if (pending === "*" || pending === "/") {
      tokens.push({ kind: "mul", value: n, raw: `${pending}${parsed.num}` });
    } else if (pending === "-") {
      tokens.push({ kind: "add", value: -Math.abs(n), raw: parsed.num });
    } else {
      // First operand or after +: keep the number’s own sign if present.
      tokens.push({ kind: "add", value: n, raw: parsed.num });
    }
    pending = parsed.op;
  }

  const decimals = maxFractionDigits(tokens.map((t) => t.raw));
  return tokens.map((t) => {
    if (t.kind === "mul") {
      const op = t.raw[0];
      const rest = t.raw.slice(1);
      const abs = parseCalcNumber(rest);
      if (abs == null) return t.raw;
      return `${op}${formatSheetCell(Math.abs(abs), decimals)}`;
    }
    return formatSheetCell(t.value, decimals);
  });
}

/**
 * Copy-as-table clipboard text — spreadsheet-friendly signed column + rule + total.
 * @param {CalcHistoryEntry|null|undefined} entry
 * @returns {string}
 */
export function formatCalcCopyTable(entry) {
  if (!entry) return "";
  const rows = footingToSpreadsheetRows(entry.footing);
  const totalRaw = String(entry.total || "").trim();
  const totalN = parseCalcNumber(totalRaw);
  const decimals = Math.max(
    maxFractionDigits(rows.map((r) => r.replace(/^[*/]/, ""))),
    maxFractionDigits([totalRaw]),
  );
  const total =
    totalN != null ? formatSheetCell(totalN, decimals > 0 ? decimals : maxFractionDigits(rows) || 0) : totalRaw;
  if (!rows.length && !total) return "";
  if (!rows.length) return total;
  const width = Math.max(5, ...rows.map((r) => r.length), total.length);
  const rule = "-".repeat(width);
  return `${rows.join("\n")}\n${rule}\n${total}`;
}

/**
 * Copy total only (single cell).
 * @param {CalcHistoryEntry|null|undefined} entry
 * @returns {string}
 */
export function formatCalcCopyTotal(entry) {
  if (!entry) return "";
  return String(entry.total || "").trim();
}

/**
 * Oldest → newest (newest at bottom — matches field tape / scratch-pad expectation).
 * @param {CalcHistoryEntry[]} entries
 * @returns {CalcHistoryEntry[]}
 */
export function calcHistoryTapeOrder(entries) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  return list.sort((a, b) => (a.at || 0) - (b.at || 0));
}

/**
 * Flyout sections: consecutive same source+session share one label / border / tint.
 * Entries inside each group are oldest → newest.
 *
 * @param {CalcHistoryEntry[]} entries
 * @returns {{ key: string, label: string, priorSession: boolean, entries: CalcHistoryEntry[] }[]}
 */
export function groupCalcHistoryForFlyout(entries) {
  const ordered = calcHistoryTapeOrder(entries);
  /** @type {{ key: string, label: string, priorSession: boolean, entries: CalcHistoryEntry[] }[]} */
  const groups = [];
  for (const e of ordered) {
    if (!e) continue;
    const prior = !!e.priorSession;
    const src = e.sourceLabel || "Doc entry";
    const key = `${prior ? "1" : "0"}|${src}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(e);
    } else {
      groups.push({
        key,
        // Under a “Previous sessions” dropdown the section title is enough — use source only.
        label: prior ? src : calcHistoryDisplayLabel(e),
        priorSession: prior,
        entries: [e],
      });
    }
  }
  return groups;
}

/**
 * Split flyout into current-session groups vs prior-session groups.
 * When the current session has ≥1 entry, prior should sit under a collapsed dropdown.
 *
 * @param {CalcHistoryEntry[]} entries
 * @returns {{
 *   current: ReturnType<typeof groupCalcHistoryForFlyout>,
 *   prior: ReturnType<typeof groupCalcHistoryForFlyout>,
 *   collapsePrior: boolean,
 *   priorEntryCount: number,
 * }}
 */
export function splitCalcHistoryFlyoutSections(entries) {
  const groups = groupCalcHistoryForFlyout(entries);
  const current = groups.filter((g) => !g.priorSession);
  const prior = groups.filter((g) => g.priorSession);
  const currentCount = current.reduce((n, g) => n + g.entries.length, 0);
  const priorEntryCount = prior.reduce((n, g) => n + g.entries.length, 0);
  return {
    current,
    prior,
    collapsePrior: currentCount > 0 && priorEntryCount > 0,
    priorEntryCount,
  };
}

/**
 * Find by id.
 * @param {CalcHistoryEntry[]} entries
 * @param {string} id
 * @returns {CalcHistoryEntry|null}
 */
export function findCalcHistoryEntry(entries, id) {
  if (!id) return null;
  const list = Array.isArray(entries) ? entries : [];
  return list.find((e) => e && e.id === id) || null;
}
