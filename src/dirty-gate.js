/**
 * Dirty-gate classifier (OI-033 / museum dirty-baseline.js) — pure state, no Frappe/DOM.
 *
 * Doc Bill contract: navigation prompts only when `userEdited` is true.
 * ERP `is_dirty` / baseline drift are diagnostics, not the leave gate.
 * Focus, tab-through, and whitespace-only no-ops must not set `userEdited`.
 */

/**
 * @param {object|null|undefined} doc
 * @returns {object}
 */
export function sanitizeDoc(doc) {
  if (!doc || typeof doc !== "object") return {};
  const copy = JSON.parse(JSON.stringify(doc));
  delete copy.__unsaved;
  return copy;
}

/**
 * @param {object|null|undefined} doc
 * @returns {string}
 */
export function captureBaseline(doc) {
  return JSON.stringify(sanitizeDoc(doc));
}

/**
 * @param {object|null|undefined} doc
 * @param {string|null|undefined} baselineJson
 */
export function docMatchesBaseline(doc, baselineJson) {
  if (!baselineJson || typeof baselineJson !== "string") return false;
  try {
    return JSON.stringify(sanitizeDoc(doc)) === baselineJson;
  } catch {
    return false;
  }
}

/**
 * Trim text for dirty compares (spaces-only ≡ empty).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEditableText(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @returns {number|null} null if blank / not a number
 */
export function normalizeEditableNumber(value) {
  const t = normalizeEditableText(value);
  if (t === "") return null;
  const n = Number(String(t).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * True when before/after are the same for dirty purposes.
 * @param {unknown} before
 * @param {unknown} after
 * @param {{ kind?: "text" | "number" | "date" }} [opts]
 */
export function valuesMeaningfullyEqual(before, after, opts = {}) {
  const kind = opts.kind || "text";
  if (kind === "number") {
    const a = normalizeEditableNumber(before);
    const b = normalizeEditableNumber(after);
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(a - b) < 1e-9;
  }
  // text + date: trim; "2026-07-18" vs same
  return normalizeEditableText(before) === normalizeEditableText(after);
}

/**
 * @param {string} field ERP field name or "__amount_due"
 * @returns {"text" | "number" | "date"}
 */
export function dirtyCompareKindForField(field) {
  if (field === "qty" || field === "rate" || field === "__amount_due") return "number";
  if (field === "posting_date" || field === "due_date") return "date";
  return "text";
}

/**
 * @param {{ isDirty?: boolean, isNew?: boolean, userEdited?: boolean }} state
 */
export function wasClean(state = {}) {
  // Doc Bill: ERP is_dirty alone is not "dirty" for our purposes.
  return !state.userEdited;
}

/**
 * Doc Bill / Doc skin leave gate — SSoT is application `userEdited` only.
 * ERP is_dirty and baseline drift must not prompt (OI-033 / museum lesson).
 *
 * @param {{
 *   isDirty?: boolean,
 *   isNew?: boolean,
 *   userEdited?: boolean,
 *   baselineJson?: string|null,
 *   doc?: object|null
 * }} state
 * @returns {boolean} true = prompt before navigate
 */
export function shouldGateNavigation(state = {}) {
  return !!state.userEdited;
}

/**
 * After lens/Doc apply on a previously clean form: clear userEdited + capture baseline.
 * @param {{ userEdited?: boolean, baselineJson?: string|null, doc?: object|null }} state
 * @param {boolean} wasCleanFlag
 */
export function finishLensApply(state = {}, wasCleanFlag) {
  const next = { ...state };
  if (!wasCleanFlag) return next;
  next.userEdited = false;
  if (next.doc) next.baselineJson = captureBaseline(next.doc);
  return next;
}

/**
 * @param {{ userEdited?: boolean }} state
 */
export function markUserEdited(state = {}) {
  return { ...state, userEdited: true };
}
