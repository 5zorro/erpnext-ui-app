/**
 * Shelved draft shelf for the left flyout (OI-060).
 * Shelf = successful Save with docstatus === 0 (not a separate verb).
 */
import { DOC_SKIN_PROFILES } from "./doc-skin-registry.js";
import { normalizeDoctypeKey } from "./lens-prefs.js";
import { copyRefForDoc } from "./history-copy-ref.js";

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
 * Recent flyout suffix for a draft form row.
 * - Viewed only (not on Drafts shelf): muted identity string (keep de-emphasis).
 * - On Drafts shelf (edited/saved): empty — Recent shows “Bill” only; identity lives in Drafts.
 *
 * @param {{
 *   isDraft: boolean,
 *   onShelf: boolean,
 *   shelfLabel?: string,
 *   fallbackName?: string,
 * }} opts
 * @returns {{ detail: string, detailMuted: boolean }}
 */
export function recentDraftDetailForHistory(opts) {
  if (!opts || !opts.isDraft) {
    return { detail: "", detailMuted: false };
  }
  if (opts.onShelf) {
    return { detail: "", detailMuted: false };
  }
  const detail = String(opts.shelfLabel || opts.fallbackName || "").trim();
  return { detail, detailMuted: !!detail };
}

/**
 * @typedef {{
 *   doctypeKey: string,
 *   name: string,
 *   route: string,
 *   label: string,
 *   shelvedAt: string,
 *   copyRef?: string,
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
    copyRef: copyRefForDoc(key, doc),
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
 * Plain fields for shelf sync — Frappe locals are circular; never JSON.stringify(doc).
 * Bridge page mirrors this shape (cannot import ESM into injected script).
 * @param {object|null|undefined} doc
 * @returns {object|null}
 */
export function pickShelveDocFields(doc) {
  if (!doc || typeof doc !== "object") return null;
  const name = doc.name != null ? String(doc.name).trim() : "";
  if (!name) return null;
  const itemsIn = Array.isArray(doc.items) ? doc.items : [];
  const items = [];
  for (const it of itemsIn) {
    if (!it || typeof it !== "object") continue;
    const po = it.purchase_order;
    items.push({
      purchase_order: po != null && String(po).trim() ? String(po).trim() : "",
    });
  }
  return {
    name,
    doctype: doc.doctype != null ? String(doc.doctype) : "",
    docstatus: doc.docstatus == null ? 0 : Number(doc.docstatus),
    posting_date: doc.posting_date != null ? String(doc.posting_date) : "",
    bill_no: doc.bill_no != null ? String(doc.bill_no) : "",
    transaction_date: doc.transaction_date != null ? String(doc.transaction_date) : "",
    lr_no: doc.lr_no != null ? String(doc.lr_no) : "",
    items,
  };
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
 * When opening a form: drop submitted/cancelled; refresh label/MRU only if already shelved.
 * Does not invent new Drafts rows on mere open (OI-060 = shelf on Save).
 * @param {ShelvedDraft[]} list
 * @param {string} doctypeKey
 * @param {object} doc
 * @param {{ now?: string }} [opts]
 * @returns {ShelvedDraft[]}
 */
export function reconcileShelvedWithOpenDoc(list, doctypeKey, doc, opts = {}) {
  const prev = Array.isArray(list) ? list : [];
  if (!doc || typeof doc !== "object") return prev.slice();
  const key = normalizeDoctypeKey(doctypeKey);
  const name = doc.name != null ? String(doc.name).trim() : "";
  if (!key || !name || /^new/i.test(name)) return prev.slice();
  if (Number(doc.docstatus) !== 0) {
    return removeShelvedDraft(prev, key, name);
  }
  const exists = prev.some((e) => e.doctypeKey === key && e.name === name);
  if (!exists) return prev.slice();
  return applySaveToShelved(prev, key, doc, opts);
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
