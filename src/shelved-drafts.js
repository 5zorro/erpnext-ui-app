/**
 * Shelved draft shelf for the left flyout (OI-060).
 * Shelf = successful Save with docstatus === 0 (not a separate verb).
 */
import { DOC_SKIN_PROFILES } from "./doc-skin-registry.js";
import { normalizeDoctypeKey } from "./lens-prefs.js";

/** Visible rows before Older dropdown. */
export const DRAFT_VISIBLE_MAX = 3;
/** Soft safety cap so userData cannot grow forever. */
export const DRAFT_SOFT_CAP = 100;

/**
 * Doctype keys that ship a Doc skin and can save drafts.
 * Completeness unit test keeps this honest vs DOC_SKIN_PROFILES.
 * @param {typeof DOC_SKIN_PROFILES} [profiles]
 * @returns {string[]}
 */
export function draftableDoctypeKeys(profiles = DOC_SKIN_PROFILES) {
  return Object.values(profiles)
    .map((p) => p.doctypeKey)
    .filter(Boolean)
    .sort();
}

/**
 * @param {string|Date|null|undefined} iso
 * @returns {string} e.g. 7/21/2026 (local calendar)
 */
export function formatDraftDate(iso) {
  if (iso == null || iso === "") return "";
  const s = String(iso).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return `${mo}/${d}/${y}`;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  const dt = new Date(t);
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
}

/**
 * First linked Purchase Order name from items (Bill / Item Receipt source).
 * @param {object|null|undefined} doc
 * @returns {string}
 */
export function firstPurchaseOrderFromItems(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  for (const it of items) {
    const po = it && it.purchase_order;
    if (po != null && String(po).trim()) return String(po).trim();
  }
  return "";
}

/**
 * Identity line for the Drafts section (not the Recent page name).
 * Bill w/ source: `INV I1234; PO 1234; 7/21/2026`
 * PO no source: `PO-0001; 7/23/2026`
 *
 * @param {string} doctypeKey
 * @param {object|null|undefined} doc
 * @returns {string}
 */
export function draftShelfLabel(doctypeKey, doc) {
  const key = normalizeDoctypeKey(doctypeKey);
  const name = doc && doc.name != null ? String(doc.name).trim() : "";
  const parts = [];

  if (key === "purchase-invoice") {
    const ref = doc && doc.bill_no != null ? String(doc.bill_no).trim() : "";
    if (ref) parts.push(ref.startsWith("INV") ? ref : `INV ${ref}`);
    else if (name && !/^new/i.test(name)) parts.push(name);
    const po = firstPurchaseOrderFromItems(doc);
    if (po) parts.push(po.startsWith("PO") ? po : `PO ${po}`);
    const date = formatDraftDate(doc && doc.posting_date);
    if (date) parts.push(date);
  } else if (key === "purchase-order") {
    if (name && !/^new/i.test(name)) parts.push(name);
    else parts.push("Purchase Order");
    const date = formatDraftDate(doc && doc.transaction_date);
    if (date) parts.push(date);
  } else if (key === "purchase-receipt") {
    const ref = doc && doc.lr_no != null ? String(doc.lr_no).trim() : "";
    if (ref) parts.push(ref);
    else if (name && !/^new/i.test(name)) parts.push(name);
    else parts.push("Item Receipt");
    const po = firstPurchaseOrderFromItems(doc);
    if (po) parts.push(po.startsWith("PO") ? po : `PO ${po}`);
    const date = formatDraftDate(doc && doc.posting_date);
    if (date) parts.push(date);
  } else if (name) {
    parts.push(name);
  }

  return parts.filter(Boolean).join("; ") || name || key || "Draft";
}

/**
 * @typedef {{
 *   doctypeKey: string,
 *   name: string,
 *   route: string,
 *   label: string,
 *   shelvedAt: string,
 * }} ShelvedDraft
 */

/**
 * @param {string} doctypeKey
 * @param {object} doc
 * @param {{ now?: string }} [opts]
 * @returns {ShelvedDraft|null}
 */
export function shelvedEntryFromDoc(doctypeKey, doc, opts = {}) {
  const key = normalizeDoctypeKey(doctypeKey);
  if (!key || !doc || typeof doc !== "object") return null;
  const name = doc.name != null ? String(doc.name).trim() : "";
  if (!name || /^new/i.test(name)) return null;
  if (Number(doc.docstatus) !== 0) return null;
  return {
    doctypeKey: key,
    name,
    route: `/app/${key}/${name}`,
    label: draftShelfLabel(key, doc),
    shelvedAt: opts.now || new Date().toISOString(),
  };
}

/**
 * @param {ShelvedDraft[]} list
 * @param {ShelvedDraft} entry
 * @param {{ softCap?: number }} [opts]
 * @returns {ShelvedDraft[]}
 */
export function pushShelvedDraft(list, entry, opts = {}) {
  const prev = Array.isArray(list) ? list : [];
  if (!entry || !entry.doctypeKey || !entry.name) return prev.slice();
  const softCap = opts.softCap ?? DRAFT_SOFT_CAP;
  const next = prev.filter(
    (e) => !(e.doctypeKey === entry.doctypeKey && e.name === entry.name),
  );
  next.unshift(entry);
  if (next.length > softCap) next.length = softCap;
  return next;
}

/**
 * @param {ShelvedDraft[]} list
 * @param {string} doctypeKey
 * @param {string} name
 * @returns {ShelvedDraft[]}
 */
export function removeShelvedDraft(list, doctypeKey, name) {
  const prev = Array.isArray(list) ? list : [];
  const key = normalizeDoctypeKey(doctypeKey);
  const n = name != null ? String(name).trim() : "";
  if (!key || !n) return prev.slice();
  return prev.filter((e) => !(e.doctypeKey === key && e.name === n));
}

/**
 * After save: shelf draft or drop if submitted/cancelled.
 * @param {ShelvedDraft[]} list
 * @param {string} doctypeKey
 * @param {object} doc
 * @param {{ now?: string }} [opts]
 * @returns {ShelvedDraft[]}
 */
export function applySaveToShelved(list, doctypeKey, doc, opts = {}) {
  if (!doc || typeof doc !== "object") return Array.isArray(list) ? list.slice() : [];
  const name = doc.name != null ? String(doc.name).trim() : "";
  if (Number(doc.docstatus) !== 0) {
    return removeShelvedDraft(list, doctypeKey, name);
  }
  const entry = shelvedEntryFromDoc(doctypeKey, doc, opts);
  if (!entry) return Array.isArray(list) ? list.slice() : [];
  return pushShelvedDraft(list, entry);
}

/**
 * @param {ShelvedDraft[]} list
 * @param {{ visibleMax?: number }} [opts]
 * @returns {{ visible: ShelvedDraft[], older: ShelvedDraft[] }}
 */
export function splitShelvedDrafts(list, opts = {}) {
  const all = Array.isArray(list) ? list : [];
  const visibleMax = opts.visibleMax ?? DRAFT_VISIBLE_MAX;
  if (visibleMax < 1) return { visible: [], older: all.slice() };
  return {
    visible: all.slice(0, visibleMax),
    older: all.slice(visibleMax),
  };
}
