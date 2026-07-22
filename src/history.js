/**
 * Deduplicated navigation history — list vs form slots per doctype, most-recent first.
 */
import { routeInfo, titleizeDoctype } from "./route-info.js";

export const HISTORY_CAP = 12;
/** M1.5: visible in Recent; remainder goes under Older (collapsed). */
export const RECENT_MAX = 7;

/**
 * Slot key: list and form of the same doctype no longer overwrite each other
 * (Find Bills vs Bill entry — OI-062).
 * @param {string} doctype
 * @param {string} [record]
 * @returns {string}
 */
export function historySlotKey(doctype, record) {
  const dt = doctype == null ? "" : String(doctype);
  if (!dt) return "";
  return record ? `${dt}:form` : `${dt}:list`;
}

/**
 * @param {HistoryEntry} entry
 * @param {string} [erpBase]
 * @returns {string}
 */
export function historyEntrySlot(entry, erpBase) {
  if (!entry) return "";
  if (entry.slot) return entry.slot;
  const info = routeInfo(entry.route || "", erpBase);
  return historySlotKey(info.doctype || entry.dt || "", info.record);
}

/**
 * @param {string} doctype
 * @param {string} [record]
 * @param {Record<string, string>} [labels]
 */
export function historyLabelFor(doctype, record, labels = {}) {
  const dt = doctype == null ? "" : String(doctype);
  if (!record) {
    if (labels[`${dt}:list`]) return labels[`${dt}:list`];
    const base = labels[dt] || titleizeDoctype(dt) || "Documents";
    // "Bill" → "Find Bills"; "Item" → "Find Items"
    if (/s$/i.test(base)) return `Find ${base}`;
    return `Find ${base}s`;
  }
  return labels[dt] || titleizeDoctype(dt);
}

/**
 * Split deduped history for the flyout: small Recent group + Older overflow.
 * @param {HistoryEntry[]} list
 * @param {{ recentMax?: number }} [opts]
 * @returns {{ recent: HistoryEntry[], older: HistoryEntry[] }}
 */
export function splitHistory(list, opts = {}) {
  const all = Array.isArray(list) ? list : [];
  const recentMax = opts.recentMax ?? RECENT_MAX;
  if (recentMax < 1) return { recent: [], older: all.slice() };
  return {
    recent: all.slice(0, recentMax),
    older: all.slice(recentMax),
  };
}

/**
 * @typedef {{ route: string, dt: string, label: string, slot?: string }} HistoryEntry
 */

/**
 * @param {HistoryEntry[]} list
 * @param {string} routeOrUrl
 * @param {{ erpBase?: string, labels?: Record<string, string>, cap?: number }} [opts]
 * @returns {HistoryEntry[]} new list (does not mutate input)
 */
export function pushHistory(list, routeOrUrl, opts = {}) {
  const prev = Array.isArray(list) ? list : [];
  const { doctype, path, record } = routeInfo(routeOrUrl, opts.erpBase);
  if (!doctype) return prev.slice();

  const labels = opts.labels || {};
  const cap = opts.cap ?? HISTORY_CAP;
  const slot = historySlotKey(doctype, record);
  const label = historyLabelFor(doctype, record, labels);
  const entry = {
    route: path.startsWith("/") ? path : `/${path}`,
    dt: doctype,
    label,
    slot,
  };

  const next = prev.filter((h) => historyEntrySlot(h, opts.erpBase) !== slot);
  next.unshift(entry);
  if (next.length > cap) next.length = cap;
  return next;
}
