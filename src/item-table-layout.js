/**
 * Item/tax line-grid layout (Packet T) — bleed gutter, column widths, density.
 *
 * Pure: every function is total and side-effect free except the explicitly
 * storage-taking prefs helpers, which follow the `doc-wash.js` pattern
 * (injectable storage; never reach for `localStorage` from pure code).
 *
 * Business rule (5zorro 2026-09-06): readable is the *default state*, not a
 * mode you enable. Only widths the user explicitly dragged are persisted, so a
 * stale saved width can never be the reason a column is unreadable.
 */

export const COL_WIDTH_STORAGE_KEY = "doc-item-col-widths";
export const DENSITY_STORAGE_KEY = "doc-item-density";

/** Narrower than this and a header label cannot show at all. */
export const MIN_COL_WIDTH_PX = 40;
/** Wider than this and one column starves every other column. */
export const MAX_COL_WIDTH_PX = 900;

/** @type {readonly string[]} */
export const DENSITIES = ["compact", "standard", "comfortable"];
export const DEFAULT_DENSITY = "standard";

/**
 * Strict numeric coercion. `Number()` alone is unusable here: `Number(null)`,
 * `Number("")`, `Number([])` and `Number(false)` are all `0`, which would turn
 * a corrupt/absent stored width into a real 40px column instead of "no value".
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Width of the vertical scrollbar gutter, for scrollbar-safe `100vw` bleed.
 *
 * `100vw` includes the scrollbar on platforms that reserve a gutter, so a
 * naive full-bleed element overflows by exactly this much and summons a
 * horizontal scrollbar. Callers subtract this.
 *
 * @param {number|null|undefined} innerWidth `window.innerWidth` (includes gutter)
 * @param {number|null|undefined} clientWidth `documentElement.clientWidth` (excludes it)
 * @returns {number} px, never negative, 0 when either input is unusable
 */
export function scrollbarGutterPx(innerWidth, clientWidth) {
  const outer = toFiniteNumber(innerWidth);
  const inner = toFiniteNumber(clientWidth);
  if (outer == null || inner == null) return 0;
  const gutter = outer - inner;
  if (gutter <= 0) return 0;
  // A gutter wider than this is not a scrollbar; refuse to trust it.
  if (gutter > 40) return 0;
  return Math.round(gutter);
}

/**
 * @param {unknown} px
 * @param {{ min?: number, max?: number }} [opts]
 * @returns {number|null} clamped px, or null when not a usable number
 */
export function clampColWidthPx(px, opts = {}) {
  const n = toFiniteNumber(px);
  if (n == null) return null;
  const min = toFiniteNumber(opts.min) ?? MIN_COL_WIDTH_PX;
  const max = toFiniteNumber(opts.max) ?? MAX_COL_WIDTH_PX;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.round(Math.min(hi, Math.max(lo, n)));
}

/**
 * Column width that fits `measuredPx` of text plus cell padding, clamped.
 * Used for double-click auto-fit.
 *
 * @param {unknown} measuredPx widest rendered text in the column
 * @param {{ padPx?: number, min?: number, max?: number }} [opts]
 * @returns {number|null}
 */
export function autoFitWidthPx(measuredPx, opts = {}) {
  const n = toFiniteNumber(measuredPx);
  if (n == null || n < 0) return null;
  const pad = toFiniteNumber(opts.padPx) ?? 16;
  return clampColWidthPx(n + pad, opts);
}

/**
 * @param {string|null|undefined} doctypeKey
 * @returns {string}
 */
export function normalizeTableKey(doctypeKey) {
  if (typeof doctypeKey !== "string" || !doctypeKey.trim()) return "";
  return doctypeKey.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

/** @typedef {{ getItem?: (k: string) => string|null, setItem?: (k: string, v: string) => void }} PrefStorage */

/**
 * @param {PrefStorage|null|undefined} storage
 * @param {string} key
 * @returns {unknown}
 */
function readJson(storage, key) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {PrefStorage|null|undefined} storage
 * @param {string} key
 * @param {unknown} value
 */
function writeJson(storage, key, value) {
  if (!storage || typeof storage.setItem !== "function") return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — a lost display pref is not worth throwing over */
  }
}

/**
 * Persisted column widths for one doctype. Only user-dragged columns appear;
 * everything absent stays auto-fit.
 *
 * @param {PrefStorage|null|undefined} storage
 * @param {string|null|undefined} doctypeKey
 * @returns {Record<string, number>}
 */
export function readColWidthPrefs(storage, doctypeKey) {
  const key = normalizeTableKey(doctypeKey);
  if (!key) return {};
  const all = readJson(storage, COL_WIDTH_STORAGE_KEY);
  if (!all || typeof all !== "object" || Array.isArray(all)) return {};
  const forDoctype = /** @type {Record<string, unknown>} */ (all)[key];
  if (!forDoctype || typeof forDoctype !== "object" || Array.isArray(forDoctype)) return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const [field, px] of Object.entries(forDoctype)) {
    const clamped = clampColWidthPx(px);
    if (clamped != null && field) out[field] = clamped;
  }
  return out;
}

/**
 * @param {PrefStorage|null|undefined} storage
 * @param {string|null|undefined} doctypeKey
 * @param {string|null|undefined} field
 * @param {number|null} px null clears the override (column returns to auto)
 * @returns {Record<string, number>} the doctype's prefs after the write
 */
export function writeColWidthPref(storage, doctypeKey, field, px) {
  const key = normalizeTableKey(doctypeKey);
  const col = typeof field === "string" ? field.trim() : "";
  const current = readColWidthPrefs(storage, doctypeKey);
  if (!key || !col) return current;

  const next = { ...current };
  if (px == null) {
    delete next[col];
  } else {
    const clamped = clampColWidthPx(px);
    if (clamped == null) return current;
    next[col] = clamped;
  }

  const all = readJson(storage, COL_WIDTH_STORAGE_KEY);
  const base =
    all && typeof all === "object" && !Array.isArray(all)
      ? { ...(/** @type {Record<string, unknown>} */ (all)) }
      : {};
  if (Object.keys(next).length === 0) delete base[key];
  else base[key] = next;
  writeJson(storage, COL_WIDTH_STORAGE_KEY, base);
  return next;
}

/**
 * @param {unknown} value
 * @returns {string} one of DENSITIES
 */
export function normalizeDensity(value) {
  if (typeof value === "string" && DENSITIES.includes(value)) return value;
  return DEFAULT_DENSITY;
}

/**
 * @param {PrefStorage|null|undefined} storage
 * @returns {string}
 */
export function readDensity(storage) {
  if (!storage || typeof storage.getItem !== "function") return DEFAULT_DENSITY;
  try {
    return normalizeDensity(storage.getItem(DENSITY_STORAGE_KEY));
  } catch {
    return DEFAULT_DENSITY;
  }
}

/**
 * @param {PrefStorage|null|undefined} storage
 * @param {unknown} density
 * @returns {string} the density actually stored
 */
export function writeDensity(storage, density) {
  const next = normalizeDensity(density);
  if (storage && typeof storage.setItem === "function") {
    try {
      storage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }
  return next;
}

/**
 * Next width while dragging a column edge.
 * @param {number} startWidthPx width when the drag began
 * @param {number} deltaPx pointer movement along x
 * @param {{ min?: number, max?: number }} [opts]
 * @returns {number|null}
 */
export function draggedColWidthPx(startWidthPx, deltaPx, opts = {}) {
  const start = toFiniteNumber(startWidthPx);
  const delta = toFiniteNumber(deltaPx);
  if (start == null || delta == null) return null;
  return clampColWidthPx(start + delta, opts);
}

/** @returns {PrefStorage|null} */
export function defaultTableStorage() {
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return /** @type {PrefStorage} */ (globalThis.localStorage);
    }
  } catch {
    /* ignore */
  }
  return null;
}
