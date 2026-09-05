/**
 * Copyable clerk ref from Recent / Drafts flyout (nav feature request 2026-08-30).
 * Bill → Supplier Invoice No. (`bill_no`); PO / Item Receipt → document `name`.
 */
import { normalizeDoctypeKey } from "./lens-prefs.js";

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function looksLikeBillErpName(text) {
  const s = text == null ? "" : String(text).trim();
  if (!s) return false;
  if (/^new-purchase-invoice-/i.test(s)) return true;
  if (/^ACC-PINV-\d{4}-\d+$/i.test(s)) return true;
  return false;
}

/** @deprecated use looksLikeBillErpName for Bill rows */
export function looksLikeErpDocName(text) {
  return looksLikeBillErpName(text);
}

/**
 * @param {string|null|undefined} segment
 * @returns {string}
 */
export function normalizeBillRefSegment(segment) {
  const s = segment == null ? "" : String(segment).trim();
  if (!s) return "";
  return s.replace(/^INV\s+/i, "").trim() || s;
}

/**
 * @param {string|null|undefined} doctypeKey
 * @param {object|null|undefined} doc
 * @returns {string}
 */
export function copyRefForDoc(doctypeKey, doc) {
  const key = normalizeDoctypeKey(doctypeKey);
  if (!doc || typeof doc !== "object") return "";
  if (key === "purchase-invoice") {
    const ref = doc.bill_no != null ? String(doc.bill_no).trim() : "";
    return ref;
  }
  if (key === "purchase-order" || key === "purchase-receipt") {
    const name = doc.name != null ? String(doc.name).trim() : "";
    if (name && !/^new/i.test(name)) return name;
  }
  return "";
}

/**
 * @param {{ copyRef?: string, detail?: string, dt?: string, label?: string, kind?: string }} entry
 * @returns {string}
 */
export function historyEntryCopyRef(entry) {
  if (!entry || typeof entry !== "object") return "";
  const stored = entry.copyRef != null ? String(entry.copyRef).trim() : "";
  if (stored) return stored;

  const key = normalizeDoctypeKey(entry.dt);
  if (key !== "purchase-invoice" && key !== "purchase-order" && key !== "purchase-receipt") {
    return "";
  }
  if (entry.kind === "setup") return "";

  const detail = entry.detail != null ? String(entry.detail).trim() : "";
  if (!detail) return "";

  if (key === "purchase-order" || key === "purchase-receipt") {
    return detail.includes(";") ? detail.split(";")[0].trim() : detail;
  }

  if (looksLikeBillErpName(detail)) return "";

  if (detail.includes(";")) {
    const first = normalizeBillRefSegment(detail.split(";")[0]);
    return first && !looksLikeBillErpName(first) ? first : "";
  }

  return normalizeBillRefSegment(detail);
}

/**
 * @param {{ copyRef?: string, label?: string, doctypeKey?: string }} entry
 * @returns {string}
 */
export function shelvedDraftCopyRef(entry) {
  if (!entry || typeof entry !== "object") return "";
  const stored = entry.copyRef != null ? String(entry.copyRef).trim() : "";
  if (stored) return stored;

  const key = normalizeDoctypeKey(entry.doctypeKey);
  const label = entry.label != null ? String(entry.label).trim() : "";
  if (!label) return "";

  const first = label.split(";")[0].trim();
  if (!first) return "";

  if (key === "purchase-invoice") {
    if (looksLikeBillErpName(first)) return "";
    return normalizeBillRefSegment(first);
  }
  if (key === "purchase-order" || key === "purchase-receipt") return first;
  return "";
}

/**
 * @param {{ copyRef?: string, detail?: string, dt?: string, label?: string, kind?: string, doctypeKey?: string }} entry
 * @param {{ draft?: boolean }} [opts]
 * @returns {string}
 */
export function flyoutRowCopyRef(entry, opts = {}) {
  if (opts.draft) return shelvedDraftCopyRef(entry);
  return historyEntryCopyRef(entry);
}
