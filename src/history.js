/**
 * Deduplicated navigation history — one entry per doctype, most-recent first.
 */
import { routeInfo, titleizeDoctype } from "./route-info.js";

export const HISTORY_CAP = 12;
/** M1.5: visible in Recent; remainder goes under Older (collapsed). */
export const RECENT_MAX = 7;

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
 * @typedef {{ route: string, dt: string, label: string }} HistoryEntry
 */

/**
 * @param {HistoryEntry[]} list
 * @param {string} routeOrUrl
 * @param {{ erpBase?: string, labels?: Record<string, string>, cap?: number }} [opts]
 * @returns {HistoryEntry[]} new list (does not mutate input)
 */
export function pushHistory(list, routeOrUrl, opts = {}) {
  const prev = Array.isArray(list) ? list : [];
  const { doctype, path } = routeInfo(routeOrUrl, opts.erpBase);
  if (!doctype) return prev.slice();

  const labels = opts.labels || {};
  const cap = opts.cap ?? HISTORY_CAP;
  const label = labels[doctype] || titleizeDoctype(doctype);
  const entry = { route: path.startsWith("/") ? path : `/${path}`, dt: doctype, label };

  const next = prev.filter((h) => h.dt !== doctype);
  next.unshift(entry);
  if (next.length > cap) next.length = cap;
  return next;
}
