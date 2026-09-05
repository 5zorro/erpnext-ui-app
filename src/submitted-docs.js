/**
 * "Submitted this session" — the trail a clerk needs after submitting and moving on.
 *
 * Drafts (shelved-drafts.js) only holds `docstatus === 0` and drops a doc the moment it is
 * submitted, and Recent keeps one row per doctype slot (OI-062), so three submitted Bills
 * collapse to one Recent row. Submit-and-move-on therefore left no way back except Find.
 * This is that way back: one flyout row with a running count, opening a chronological panel.
 */

import { normalizeAppRoute } from "./route-info.js";
import { normalizeDoctypeKey } from "./lens-prefs.js";
import { formLabelForDoctype } from "./doctype-labels.js";

/** Panel is a glance-back list, not an audit log. */
export const SUBMITTED_CAP = 25;

/**
 * @typedef {{
 *   doctypeKey: string,
 *   name: string,
 *   route: string,
 *   label: string,
 *   detail: string,
 *   at: string,
 *   priorSession?: boolean,
 * }} SubmittedEntry
 */

/**
 * Flyout row label: "Bill", "Purchase Order", … with the ERP name as the detail.
 * @param {string} doctypeKey
 * @param {Record<string, string>} [labels]
 * @returns {string}
 */
export function submittedEntryLabel(doctypeKey, labels) {
  const key = normalizeDoctypeKey(doctypeKey);
  return formLabelForDoctype(key, labels) || key || "Document";
}

/**
 * Project a just-submitted ERP doc into a panel row, or null when it is not submitted.
 * @param {string} doctypeKey
 * @param {object|null|undefined} doc
 * @param {{ labels?: Record<string, string>, at?: string, copyRef?: string }} [opts]
 * @returns {SubmittedEntry|null}
 */
export function submittedEntryFromDoc(doctypeKey, doc, opts = {}) {
  if (!doc || typeof doc !== "object") return null;
  if (Number(doc.docstatus) !== 1) return null;
  const key = normalizeDoctypeKey(doctypeKey || doc.doctype);
  const name = doc.name != null ? String(doc.name).trim() : "";
  if (!key || !name) return null;
  const detail = opts.copyRef != null && String(opts.copyRef).trim() ? String(opts.copyRef).trim() : name;
  return {
    doctypeKey: key,
    name,
    route: `/app/${key}/${name}`,
    label: submittedEntryLabel(key, opts.labels),
    detail,
    at: opts.at || new Date().toISOString(),
  };
}

/**
 * Newest first, one row per document.
 * @param {SubmittedEntry[]} list
 * @param {SubmittedEntry|null|undefined} entry
 * @param {{ cap?: number }} [opts]
 * @returns {SubmittedEntry[]} new list (input untouched)
 */
export function pushSubmittedDoc(list, entry, opts = {}) {
  const prev = Array.isArray(list) ? list : [];
  if (!entry || !entry.name || !entry.doctypeKey) return prev.slice();
  const cap = opts.cap ?? SUBMITTED_CAP;
  const next = prev.filter(
    (e) => !(e && e.name === entry.name && e.doctypeKey === entry.doctypeKey),
  );
  next.unshift({ ...entry });
  if (next.length > cap) next.length = cap;
  return next;
}

/**
 * Rows restored from disk belong to an earlier run — the counter must not claim them.
 * @param {SubmittedEntry[]} list
 * @returns {SubmittedEntry[]}
 */
export function markSubmittedPriorSession(list) {
  const prev = Array.isArray(list) ? list : [];
  return prev
    .filter((e) => e && e.name && e.doctypeKey)
    .map((e) => ({ ...e, priorSession: true }));
}

/**
 * The number on the flyout row: submissions made in *this* run.
 * @param {SubmittedEntry[]} list
 * @returns {number}
 */
export function submittedThisSessionCount(list) {
  const prev = Array.isArray(list) ? list : [];
  return prev.filter((e) => e && !e.priorSession).length;
}

/**
 * Sub-label under the flyout row.
 * @param {SubmittedEntry[]} list
 * @returns {string}
 */
export function submittedRowSummary(list) {
  const prev = Array.isArray(list) ? list : [];
  const n = submittedThisSessionCount(prev);
  const earlier = prev.length - n;
  if (!n && !earlier) return "Nothing submitted yet";
  const head = n === 0 ? "None this session" : n === 1 ? "1 this session" : `${n} this session`;
  if (!earlier) return `${head} · open panel`;
  return `${head} · ${earlier} earlier · open panel`;
}

/**
 * Route to open when a panel row is clicked (Recent's own open policy takes it from there).
 * @param {SubmittedEntry|null|undefined} entry
 * @param {string} [erpBase]
 * @returns {string}
 */
export function submittedEntryRoute(entry, erpBase) {
  if (!entry || !entry.route) return "";
  return normalizeAppRoute(entry.route, erpBase).path || entry.route;
}
