/**
 * Drop Recent / Drafts / Submitted rows whose document no longer exists in ERP.
 *
 * Nav incident 2026-09-29: after the sandbox was reinstalled blank, the rail kept offering
 * documents from the old site ("the recents are no longer even in the database"), because
 * Drafts and Submitted are persisted in nav-state.json and nothing ever asked ERP whether
 * they are still there. The same happens, one row at a time, when a draft is deleted in a
 * plain browser.
 *
 * Pure: which records to ask about, how to ask, how to read the answer, what to drop. The
 * rule that matters is the last one — **only a clear answer drops a row**. A failed or
 * refused lookup (network, 403 on a doctype this clerk cannot list) keeps everything, so a
 * permissions gap can never empty someone's Drafts.
 */
import { routeInfo, isNewDocRecord, titleizeDoctype } from "./route-info.js";

/** Largest `name in (...)` list sent in one request — keeps the query string reasonable. */
export const PRUNE_BATCH_MAX = 50;

/**
 * @param {{ doctypeKey?: string, name?: string, route?: string }|null|undefined} entry
 * @param {string} [erpBase]
 * @returns {{ doctypeKey: string, name: string }|null} null for lists and unsaved drafts
 */
export function navRecordOf(entry, erpBase) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.doctypeKey && entry.name) {
    return isNewDocRecord(entry.name) ? null : { doctypeKey: String(entry.doctypeKey), name: String(entry.name) };
  }
  const info = routeInfo(entry.route || "", erpBase);
  if (!info.doctype || !info.record || isNewDocRecord(info.record)) return null;
  return { doctypeKey: info.doctype, name: info.record };
}

/**
 * @param {Array<Array<object>>} lists
 * @param {string} [erpBase]
 * @returns {Map<string, string[]>} doctypeKey -> unique names
 */
export function recordsToVerify(lists, erpBase) {
  /** @type {Map<string, Set<string>>} */
  const acc = new Map();
  for (const list of lists || []) {
    for (const e of Array.isArray(list) ? list : []) {
      const r = navRecordOf(e, erpBase);
      if (!r) continue;
      if (!acc.has(r.doctypeKey)) acc.set(r.doctypeKey, new Set());
      acc.get(r.doctypeKey).add(r.name);
    }
  }
  return new Map([...acc].map(([k, v]) => [k, [...v]]));
}

/**
 * `/api/resource/<Doctype>` filtered to these names, returning only `name`.
 * @param {string} doctypeKey e.g. "purchase-invoice"
 * @param {string[]} names at most PRUNE_BATCH_MAX
 */
export function existenceQueryPath(doctypeKey, names) {
  const dt = encodeURIComponent(titleizeDoctype(doctypeKey));
  const q = new URLSearchParams({
    filters: JSON.stringify([["name", "in", names]]),
    fields: JSON.stringify(["name"]),
    limit_page_length: "0",
  });
  return `/api/resource/${dt}?${q.toString()}`;
}

/**
 * @param {string[]} names what was asked about
 * @param {number|null} status
 * @param {unknown} body parsed JSON
 * @returns {string[]|null} the names ERP did not return, or null when the answer is not clear
 */
export function missingFromResponse(names, status, body) {
  if (status !== 200 || !body || typeof body !== "object") return null;
  const rows = /** @type {any} */ (body).data;
  if (!Array.isArray(rows)) return null;
  const present = new Set(rows.map((r) => (r && typeof r === "object" ? String(r.name) : "")));
  return names.filter((n) => !present.has(n));
}

/**
 * @param {string} doctypeKey
 * @param {string} name
 */
export function vanishedKey(doctypeKey, name) {
  return `${doctypeKey}\u0000${name}`;
}

/**
 * @template T
 * @param {T[]} list
 * @param {Set<string>} vanished keys from vanishedKey
 * @param {string} [erpBase]
 * @returns {{ kept: T[], dropped: T[] }}
 */
export function pruneVanished(list, vanished, erpBase) {
  const kept = [];
  const dropped = [];
  for (const e of Array.isArray(list) ? list : []) {
    const r = navRecordOf(/** @type {any} */ (e), erpBase);
    if (r && vanished.has(vanishedKey(r.doctypeKey, r.name))) dropped.push(e);
    else kept.push(e);
  }
  return { kept, dropped };
}
