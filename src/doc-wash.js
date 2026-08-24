/**
 * Doc wash tints (OI-125) — role washes, desk stamps, pattern preference.
 * Sourced read-only fields inherit upstream role wash (not generic RO gray).
 */

/** @typedef {"request"|"order"|"fulfill"|"invoice"|"payment"} DocWashRole */
/** @typedef {"ap"|"ar"} DocWashDesk */
/** @typedef {"ar"|"ap"|"both"|"none"} DocWashPatternPref */

/** Okabe–Ito-derived washes (SSoT for CSS vars + tests). */
export const DOC_WASH_COLORS = Object.freeze({
  request: "#eef6fb",
  order: "#e8f4fc",
  fulfill: "#fff4e0",
  invoice: "#f6eaf2",
  payment: "#e6f5f0",
});

/** @type {Record<DocWashRole, string>} */
export const DOC_WASH_ACCENTS = Object.freeze({
  request: "#0072B2",
  order: "#56B4E9",
  fulfill: "#E69F00",
  invoice: "#CC79A7",
  payment: "#009E73",
});

export const DEFAULT_PATTERN_PREF = /** @type {DocWashPatternPref} */ ("ar");

/** @type {DocWashPatternPref[]} */
export const PATTERN_PREF_IDS = ["ar", "ap", "both", "none"];

/**
 * Profile id → wash role + buying/selling desk.
 * @type {Record<string, { role: DocWashRole, desk: DocWashDesk }>}
 */
export const DOC_WASH_BY_PROFILE = Object.freeze({
  bill: { role: "invoice", desk: "ap" },
  po: { role: "order", desk: "ap" },
  receipt: { role: "fulfill", desk: "ap" },
});

/**
 * Upstream doc kind → wash role for sourced RO fields.
 * @type {Record<string, DocWashRole>}
 */
export const SOURCE_KIND_WASH_ROLE = Object.freeze({
  mr: "request",
  material_request: "request",
  quotation: "request",
  qt: "request",
  po: "order",
  purchase_order: "order",
  so: "order",
  sales_order: "order",
  pr: "fulfill",
  purchase_receipt: "fulfill",
  ir: "fulfill",
  dn: "fulfill",
  delivery_note: "fulfill",
  pi: "invoice",
  purchase_invoice: "invoice",
  bill: "invoice",
  si: "invoice",
  sales_invoice: "invoice",
  pe: "payment",
  payment_entry: "payment",
});

/**
 * @param {string|null|undefined} value
 * @returns {DocWashPatternPref}
 */
export function normalizePatternPref(value) {
  const v = value != null ? String(value).trim().toLowerCase() : "";
  if (v === "ar" || v === "ap" || v === "both" || v === "none") return v;
  return DEFAULT_PATTERN_PREF;
}

/**
 * @param {DocWashPatternPref|string|null|undefined} pref
 * @param {DocWashDesk|string|null|undefined} desk
 * @returns {boolean}
 */
export function patternAppliesToDesk(pref, desk) {
  const p = normalizePatternPref(pref);
  const d = desk === "ar" || desk === "ap" ? desk : null;
  if (!d || p === "none") return false;
  if (p === "both") return true;
  return p === d;
}

/**
 * @param {string|null|undefined} profileId
 * @returns {{ role: DocWashRole, desk: DocWashDesk }|null}
 */
export function washForProfile(profileId) {
  if (!profileId) return null;
  return DOC_WASH_BY_PROFILE[String(profileId)] || null;
}

/**
 * @param {string|null|undefined} sourceKind
 * @returns {DocWashRole|null}
 */
export function washRoleForSourceKind(sourceKind) {
  if (!sourceKind) return null;
  const key = String(sourceKind).trim().toLowerCase().replace(/\s+/g, "_");
  return SOURCE_KIND_WASH_ROLE[key] || null;
}

/**
 * Apply wash attributes on documentElement. Pattern pref from opts or localStorage.
 * @param {Document} doc
 * @param {{
 *   profileId?: string|null,
 *   role?: DocWashRole|null,
 *   desk?: DocWashDesk|null,
 *   patternPref?: DocWashPatternPref|string|null,
 *   storage?: { getItem?: (k: string) => string|null, setItem?: (k: string, v: string) => void }|null,
 * }} [opts]
 * @returns {{ role: DocWashRole|null, desk: DocWashDesk|null, patternPref: DocWashPatternPref }}
 */
export function applyDocWashToDocument(doc, opts = {}) {
  const fromProfile = washForProfile(opts.profileId);
  const role = opts.role || (fromProfile && fromProfile.role) || null;
  const desk = opts.desk || (fromProfile && fromProfile.desk) || null;

  let patternPref = normalizePatternPref(opts.patternPref);
  const storage = opts.storage !== undefined ? opts.storage : defaultWashStorage();
  if (opts.patternPref == null && storage && typeof storage.getItem === "function") {
    try {
      patternPref = normalizePatternPref(storage.getItem(PATTERN_PREF_STORAGE_KEY));
    } catch {
      patternPref = DEFAULT_PATTERN_PREF;
    }
  }

  const root = doc && doc.documentElement;
  if (root) {
    if (role) root.dataset.docRole = role;
    else delete root.dataset.docRole;
    if (desk) root.dataset.docDesk = desk;
    else delete root.dataset.docDesk;
    root.dataset.pattern = patternPref;
  }

  return { role, desk, patternPref };
}

export const PATTERN_PREF_STORAGE_KEY = "doc-wash-pattern";

/**
 * @param {DocWashPatternPref|string} pref
 * @param {{ setItem?: (k: string, v: string) => void }|null} [storage]
 * @returns {DocWashPatternPref}
 */
export function persistPatternPref(pref, storage = defaultWashStorage()) {
  const normalized = normalizePatternPref(pref);
  if (storage && typeof storage.setItem === "function") {
    try {
      storage.setItem(PATTERN_PREF_STORAGE_KEY, normalized);
    } catch {
      /* ignore quota / private mode */
    }
  }
  return normalized;
}

/**
 * Mark a control as sourced RO wash (upstream role). Clears when role is null.
 * @param {HTMLElement|null|undefined} el
 * @param {DocWashRole|string|null|undefined} role
 */
export function setWashSourceAttr(el, role) {
  if (!el || !el.dataset) return;
  const r = role != null ? String(role).trim().toLowerCase() : "";
  if (
    r === "request" ||
    r === "order" ||
    r === "fulfill" ||
    r === "invoice" ||
    r === "payment"
  ) {
    el.dataset.washSource = r;
  } else {
    delete el.dataset.washSource;
  }
}

/** @returns {{ getItem: (k: string) => string|null, setItem: (k: string, v: string) => void }|null} */
function defaultWashStorage() {
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    /* ignore */
  }
  return null;
}
