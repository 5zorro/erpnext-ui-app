/**
 * Per-doctype lens preference (last lens wins; persisted in lens-prefs.json).
 * Empty prefs → Doc (installer gets the Doc app experience). Opening Doc or
 * Vanilla **form** updates the pref; list-only Find must not flip it.
 */

/** @typedef {"vanilla"|"simplified"|"doc"} LensId */

export const DEFAULT_LENS = /** @type {LensId} */ ("doc");

/** @type {LensId[]} */
export const LENS_IDS = ["vanilla", "simplified", "doc"];

/**
 * @param {string|null|undefined} doctype slug or title (purchase-invoice / Purchase Invoice)
 * @returns {string}
 */
export function normalizeDoctypeKey(doctype) {
  if (typeof doctype !== "string" || !doctype.trim()) return "";
  return doctype
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

/**
 * @param {string|null|undefined} doctype
 * @param {Record<string, string>} [prefs]
 * @param {LensId} [fallback=DEFAULT_LENS]
 * @returns {LensId}
 */
export function preferredLens(doctype, prefs = {}, fallback = DEFAULT_LENS) {
  const key = normalizeDoctypeKey(doctype);
  if (!key) return fallback;
  const v = prefs[key];
  if (v === "vanilla" || v === "simplified" || v === "doc") return v;
  return fallback;
}

/**
 * @param {Record<string, string>} prefs
 * @param {string|null|undefined} doctype
 * @param {LensId} lens
 * @returns {Record<string, string>} new prefs object (immutable)
 */
export function rememberLens(prefs, doctype, lens) {
  const key = normalizeDoctypeKey(doctype);
  if (!key || !LENS_IDS.includes(lens)) {
    return prefs && typeof prefs === "object" ? { ...prefs } : {};
  }
  return { ...(prefs || {}), [key]: lens };
}

/**
 * Where Home "Enter …" / open-entry should land given last preference.
 * @param {string} doctypeKey e.g. purchase-invoice
 * @param {Record<string, string>} [prefs]
 * @param {{ newRoute?: string }} [opts]
 * @returns {{ lens: LensId, surface: "doc-form"|"erp-form", route: string }}
 */
export function resolveEntryOpen(doctypeKey, prefs = {}, opts = {}) {
  const key = normalizeDoctypeKey(doctypeKey) || "purchase-invoice";
  const lens = preferredLens(key, prefs);
  const route = opts.newRoute || `/app/${key}/new`;
  if (lens === "doc") return { lens, surface: "doc-form", route };
  // vanilla + simplified share erp-form until a simplified shell exists
  return { lens, surface: "erp-form", route };
}

/**
 * Whether a Desk form route should open Doc skin given prefs.
 * Lists (no record) stay Vanilla. Forms (incl. new-*) follow preferredLens.
 * @param {string|null|undefined} doctype
 * @param {string|null|undefined} record
 * @param {Record<string, string>} [prefs]
 * @param {{ hasDocSkin?: boolean }} [opts]
 * @returns {boolean}
 */
export function shouldOpenDocLens(doctype, record, prefs = {}, opts = {}) {
  const key = normalizeDoctypeKey(doctype);
  if (!key || !record) return false;
  if (opts.hasDocSkin === false) return false;
  return preferredLens(key, prefs) === "doc";
}
