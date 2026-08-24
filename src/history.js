/**
 * Deduplicated navigation history — list vs form slots per doctype, most-recent first.
 */
import { routeInfo, titleizeDoctype, isNewDocRecord, normalizeAppRoute } from "./route-info.js";
import { formLabelForDoctype, listLabelForDoctype } from "./doctype-labels.js";
import {
  decorateHistoryEntry,
  shouldOmitHistoryRoute,
} from "./history-nav.js";

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
 * Primary flyout label only ("Bill", "Find Bills", "New Bill").
 * Document identity goes in `detail` (optionally muted) — not mashed into label.
 * @param {string} doctype
 * @param {string} [record]
 * @param {Record<string, string>} [labels]
 */
export function historyLabelFor(doctype, record, labels) {
  if (!record) return listLabelForDoctype(doctype, labels);
  const base = formLabelForDoctype(doctype, labels) || titleizeDoctype(doctype);
  if (isNewDocRecord(record)) return base ? `New ${base}` : "New";
  return base || titleizeDoctype(doctype) || String(doctype);
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
 * @typedef {{
 *   route: string,
 *   dt: string,
 *   label: string,
 *   slot?: string,
 *   detail?: string,
 *   detailMuted?: boolean,
 *   kind?: "doc"|"setup",
 * }} HistoryEntry
 */

/**
 * @param {HistoryEntry[]} list
 * @param {string} routeOrUrl
 * @param {{
 *   erpBase?: string,
 *   labels?: Record<string, string>,
 *   cap?: number,
 *   detail?: string,
 *   detailMuted?: boolean,
 *   labelOverride?: string,
 *   companyAbbr?: string|null,
 * }} [opts]
 * @returns {HistoryEntry[]} new list (does not mutate input)
 */
export function pushHistory(list, routeOrUrl, opts = {}) {
  const prev = Array.isArray(list) ? list : [];
  if (shouldOmitHistoryRoute(routeOrUrl, opts)) return prev.slice();

  const { doctype, path, record } = normalizeAppRoute(routeOrUrl, opts.erpBase);
  if (!doctype) return prev.slice();

  const labels = opts.labels || {};
  const cap = opts.cap ?? HISTORY_CAP;
  const slot = historySlotKey(doctype, record);
  const label =
    opts.labelOverride != null && String(opts.labelOverride).trim()
      ? String(opts.labelOverride).trim()
      : historyLabelFor(doctype, record, labels);

  let detail = "";
  if (opts.detail != null && String(opts.detail).trim()) {
    detail = String(opts.detail).trim();
  } else if (record && !isNewDocRecord(record) && !opts.labelOverride) {
    // Vanilla nav knows the name before Doc snap — show as secondary, full emphasis.
    detail = String(record);
  }

  const entry = decorateHistoryEntry(
    {
      route: path.startsWith("/") ? path : `/${path}`,
      dt: doctype,
      label,
      slot,
      detail,
      detailMuted: !!(detail && opts.detailMuted),
    },
    opts.erpBase,
  );

  const next = prev.filter((h) => historyEntrySlot(h, opts.erpBase) !== slot);
  next.unshift(entry);
  if (next.length > cap) next.length = cap;
  return next;
}
