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

/**
 * @typedef {{
 *   key: string,
 *   demandPx?: number,
 *   minPx?: number,
 *   maxPx?: number,
 *   fixedPx?: number,
 *   flex?: boolean,
 * }} ColDemand
 */

/**
 * Turn per-column content demand into actual column widths.
 *
 * Precedence, highest first: a user-dragged override, a `fixedPx` column
 * (line/qty/cost/amount — numeric columns whose width is a function of their
 * format, not their data), then measured demand clamped to the column's bounds.
 *
 * Overflow is absorbed by shrinking only the columns that have slack above
 * their own minimum, proportionally to how much slack each has, so a column
 * already at its minimum is never squeezed further and a single greedy column
 * gives back the most. Surplus goes to `flex` columns (in practice Description),
 * which is what makes the table fill the bleed rather than leaving dead space.
 *
 * @param {ColDemand[]} cols
 * @param {number} availablePx
 * @param {Record<string, number>} [overrides] user-dragged widths; win outright
 * @returns {Record<string, number>} column key -> integer px
 */
export function distributeColWidths(cols, availablePx, overrides = {}) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!Array.isArray(cols) || cols.length === 0) return out;

  const available = toFiniteNumber(availablePx);
  const over = overrides && typeof overrides === "object" ? overrides : {};

  /** @type {{ key: string, width: number, min: number, locked: boolean, flex: boolean }[]} */
  const resolved = [];

  for (const col of cols) {
    if (!col || typeof col.key !== "string" || !col.key) continue;
    const min = toFiniteNumber(col.minPx) ?? MIN_COL_WIDTH_PX;
    const max = toFiniteNumber(col.maxPx) ?? MAX_COL_WIDTH_PX;
    const bounds = { min, max };

    const override = clampColWidthPx(over[col.key], bounds);
    const fixed = toFiniteNumber(col.fixedPx);

    let width;
    let locked;
    if (override != null) {
      width = override;
      locked = true;
    } else if (fixed != null) {
      // A declared fixed width is not negotiated, so the *global* 40px floor
      // must not apply: c-line is 38px and c-act 32px by design. Only the
      // column's own explicit bounds constrain it.
      width = clampColWidthPx(fixed, { min: toFiniteNumber(col.minPx) ?? 1, max }) ?? fixed;
      locked = true;
    } else {
      width = clampColWidthPx(col.demandPx, bounds) ?? min;
      locked = false;
    }
    resolved.push({ key: col.key, width, min: Math.min(min, max), locked, flex: col.flex === true });
  }

  if (resolved.length === 0) return out;

  if (available != null && available > 0) {
    const total = resolved.reduce((sum, c) => sum + c.width, 0);

    if (total > available) {
      // Shrink proportionally to each column's slack above its own minimum.
      // The ratio is computed once from the original slack: decrementing a
      // running total inside the loop would hand later columns a bigger share
      // than their slack warrants.
      const excess = total - available;
      const shrinkable = resolved.filter((c) => !c.locked && c.width > c.min);
      const slack = shrinkable.reduce((sum, c) => sum + (c.width - c.min), 0);
      if (slack > 0) {
        const ratio = Math.min(1, excess / slack);
        for (const c of shrinkable) c.width -= (c.width - c.min) * ratio;
      }
      // If excess still exceeds total slack every column is at its minimum and
      // the table legitimately overflows -- #panel-items scrolls it.
    } else if (total < available) {
      const surplus = available - total;
      const flexers = resolved.filter((c) => !c.locked && c.flex);
      if (flexers.length > 0) {
        const each = surplus / flexers.length;
        for (const c of flexers) c.width += each;
      }
    }
  }

  for (const c of resolved) out[c.key] = Math.max(1, Math.round(c.width));
  return out;
}

/**
 * Per-column sizing rules, keyed by the column's sort key (which both row
 * builders already emit as `th[data-sort]`).
 *
 * Numeric columns are `fixedPx`: their width is a function of their *format*
 * (a money column is as wide as "1,234,567.89" whatever the data says), so
 * measuring them wastes width that Description can use. Text columns are
 * measured and clamped. Description is the single `flex` column, so it absorbs
 * whatever the bleed hands back.
 */
const COL_RULES = Object.freeze({
  lineNo: { fixedPx: 38, minPx: 30 },
  poLine: { fixedPx: 54, minPx: 40 },
  item_code: { minPx: 90, maxPx: 420 },
  description: { minPx: 120, maxPx: 900, flex: true },
  qty: { fixedPx: 58, minPx: 48 },
  rate: { fixedPx: 88, minPx: 70 },
  amount: { fixedPx: 96, minPx: 76 },
  __action: { fixedPx: 32, minPx: 28 },
});

/** Text columns with no explicit rule (customer, project, sales orders, …). */
export const DEFAULT_COL_RULE = Object.freeze({ minPx: 70, maxPx: 260 });

/**
 * @param {string|null|undefined} key column sort key
 * @returns {{ minPx: number, maxPx?: number, fixedPx?: number, flex?: boolean }}
 */
export function colRuleFor(key) {
  if (typeof key === "string" && Object.prototype.hasOwnProperty.call(COL_RULES, key)) {
    return { ...DEFAULT_COL_RULE, ...COL_RULES[key] };
  }
  return { ...DEFAULT_COL_RULE };
}
