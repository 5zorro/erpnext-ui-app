/**
 * Warm pick lists (plan 2026-10-21, OI-185): a copy of a link list kept in the main process, so a
 * picker's search is answered at once instead of by a round trip through the ERPNext page.
 *
 * 🔴 The copy must answer **in ERPNext's order**, or a practised clerk's fast Tab (review 10-19
 * R5b-1, choice "a": the first match) picks something else depending on which source answered.
 * `frappe.desk.search.search_link` (v16.31.0) orders in two passes, mirrored here:
 * 1. which rows: those whose name / title / search fields contain the text, by where the text
 *    first appears in the *name* (not there: last), then `idx desc`, then the list's own sort —
 *    the last two are the `rank` each row carries — and the first 25 of those;
 * 2. shown as: names starting with the text first, then the rest, each in plain string order.
 * Vendors are then re-ranked by Purchase Order activity, as a live search is (OI-131).
 *
 * Pure: no ERPNext calls. `electron/main.js` loads and refreshes the copy.
 */

import { rankSupplierLinkOptions } from "./vendor-activity.js";

/** Lists worth copying: rarely changed, searched all day, never filtered by the pickers. */
export const WARM_LINK_DOCTYPES = Object.freeze([
  "Supplier",
  "Customer",
  "Item",
  "Payment Terms Template",
  "Mode of Payment",
  "Project",
  "Sales Taxes and Charges Template",
  "Purchase Taxes and Charges Template",
]);

/** Over this many rows a list stays live: the copy would cost more than it saves. */
export const LINK_LIST_MAX_ROWS = 50_000;
/** Rows a search shows — the shell's live `search_link` asks for the same. */
export const LINK_SEARCH_PAGE = 25;
/** "Changed since" at most this often while searching (and on every Doc page open). */
export const LINK_LIST_CHECK_EVERY_MS = 60_000;

/**
 * Case and accents aside, as MariaDB's default collation compares in `LIKE` and `LOCATE`.
 * @param {unknown} s
 */
export function foldLinkText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * @typedef {{ value: string, description: string, label?: string }} LinkRow
 * @typedef {LinkRow & { rank: number, hay: string, folded: string }} CopiedRow
 * @typedef {{
 *   doctype: string,
 *   rows: CopiedRow[],
 *   loadedAt: number,
 *   checkedAt: number,
 *   newestModified: string,
 *   lastPo: Record<string, string>|null,
 *   fyStart: string,
 * }} LinkListCopy
 */

/** @param {LinkRow} row @param {number} rank @returns {CopiedRow|null} */
function copyRow(row, rank) {
  const value = String((row && row.value) ?? "").trim();
  if (!value) return null;
  const description = String((row && row.description) ?? "").trim() || value;
  const label = row && row.label != null ? String(row.label) : "";
  return {
    value,
    description,
    ...(label ? { label } : {}),
    rank,
    folded: foldLinkText(value),
    hay: foldLinkText(`${value}\n${label}\n${description}`),
  };
}

/**
 * @param {string} doctype
 * @param {LinkRow[]} rows `search_link` with an empty text and no page limit
 * @param {string[]} rankNames every name, ordered `idx desc, <the list's sort>`
 * @param {{ now: number, newestModified?: string, lastPo?: Record<string, string>|null, fyStart?: string }} meta
 * @returns {LinkListCopy}
 */
export function buildLinkListCopy(doctype, rows, rankNames, meta) {
  /** @type {Map<string, number>} */
  const rankOf = new Map();
  (Array.isArray(rankNames) ? rankNames : []).forEach((n, i) => {
    if (!rankOf.has(String(n))) rankOf.set(String(n), i);
  });
  /** @type {CopiedRow[]} */
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const c = copyRow(r, rankOf.get(String((r && r.value) ?? "").trim()) ?? Infinity);
    if (c) out.push(c);
  }
  return {
    doctype,
    rows: out,
    loadedAt: meta.now,
    checkedAt: meta.now,
    newestModified: String(meta.newestModified || ""),
    lastPo: meta.lastPo || null,
    fyStart: String(meta.fyStart || ""),
  };
}

/**
 * A search answered from the copy, in ERPNext's order (see the file comment).
 * @param {LinkListCopy} copy
 * @param {string} txt
 * @param {{ limit?: number, asOf?: string }} [opts] `asOf` (YYYY-MM-DD) for the vendor ranking
 * @returns {{ results: LinkRow[], miss: boolean }} `miss`: text typed and nothing matched
 */
export function searchLinkListCopy(copy, txt, opts = {}) {
  const limit = opts.limit ?? LINK_SEARCH_PAGE;
  const typed = String(txt ?? "").trim();
  const want = foldLinkText(typed);
  const rows = copy && Array.isArray(copy.rows) ? copy.rows : [];
  const hits = rows
    .map((row, i) => ({ row, i, at: want ? row.folded.indexOf(want) : 0 }))
    .filter((h) => !want || h.row.hay.includes(want));
  hits.sort((a, b) => {
    const pa = a.at < 0 ? Infinity : a.at;
    const pb = b.at < 0 ? Infinity : b.at;
    if (pa !== pb) return pa - pb;
    if (a.row.rank !== b.row.rank) return a.row.rank < b.row.rank ? -1 : 1;
    return a.i - b.i;
  });
  const lowered = typed.toLowerCase();
  const page = hits.slice(0, limit).map((h) => h.row);
  page.sort((a, b) => {
    const sa = a.value.toLowerCase().startsWith(lowered) ? 0 : 1;
    const sb = b.value.toLowerCase().startsWith(lowered) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  });
  /** @type {LinkRow[]} */
  let results = page.map((r) => ({ value: r.value, description: r.description }));
  if (copy && copy.doctype === "Supplier" && copy.lastPo && results.length) {
    results = rankSupplierLinkOptions(results, copy.lastPo, {
      fyStart: copy.fyStart || "",
      ...(opts.asOf ? { asOf: opts.asOf } : {}),
    });
  }
  return { results, miss: !!want && results.length === 0 };
}

/**
 * Put a "changed since" answer into the copy: every changed name is taken out, and the ones
 * `search_link` still returns go back in (a disabled one does not). A row keeps its rank; a new
 * one sorts after the ranked rows until the next full load.
 * @param {LinkListCopy} copy
 * @param {string[]} changedNames every row modified since `copy.newestModified`, disabled included
 * @param {LinkRow[]} freshRows `search_link` limited to those names
 * @param {{ now: number, newestModified?: string, lastPo?: Record<string, string>|null }} meta
 * @returns {{ copy: LinkListCopy, changed: number, removed: number }}
 */
export function mergeChangedSince(copy, changedNames, freshRows, meta) {
  const changed = new Set((Array.isArray(changedNames) ? changedNames : []).map(String));
  /** @type {Map<string, number>} */
  const rankOf = new Map(copy.rows.map((r) => [r.value, r.rank]));
  const kept = copy.rows.filter((r) => !changed.has(r.value));
  const back = [];
  for (const r of Array.isArray(freshRows) ? freshRows : []) {
    const value = String((r && r.value) ?? "").trim();
    const c = copyRow(r, rankOf.get(value) ?? Infinity);
    if (c) back.push(c);
  }
  const backNames = new Set(back.map((r) => r.value));
  const removed = [...changed].filter((n) => rankOf.has(n) && !backNames.has(n)).length;
  const newest = String(meta.newestModified || "");
  return {
    copy: {
      ...copy,
      rows: kept.concat(back),
      checkedAt: meta.now,
      newestModified: newest > copy.newestModified ? newest : copy.newestModified,
      lastPo: meta.lastPo !== undefined ? meta.lastPo : copy.lastPo,
    },
    changed: changed.size,
    removed,
  };
}

/**
 * @param {LinkListCopy|null|undefined} copy
 * @param {number} now
 */
export function linkListCheckDue(copy, now) {
  return !!copy && now - copy.checkedAt >= LINK_LIST_CHECK_EVERY_MS;
}

/**
 * Should a search for this list be answered from a copy at all?
 * @param {string} doctype
 * @param {unknown} filters any filter → live
 */
export function linkListCopyable(doctype, filters) {
  if (!WARM_LINK_DOCTYPES.includes(String(doctype || "").trim())) return false;
  if (filters && typeof filters === "object" && Object.keys(filters).length) return false;
  return true;
}

/**
 * "Vendors as of 10:42" for the line under the dropdown.
 * @param {string} doctype
 * @param {number} at ms
 * @param {(ms: number) => string} [clock] formats a time; defaults to HH:MM local
 */
export function linkListAsOfText(doctype, at, clock) {
  const fmt =
    clock ||
    ((ms) => {
      const d = new Date(ms);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    });
  const names = {
    Supplier: "Vendors",
    Customer: "Customers",
    Item: "Items",
    Project: "Projects",
    "Payment Terms Template": "Terms",
    "Mode of Payment": "Methods",
  };
  const name = names[doctype] || "List";
  return `${name} as of ${fmt(at)}`;
}
