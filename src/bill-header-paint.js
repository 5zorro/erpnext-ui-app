/**
 * Header paint guards — skip overwriting inputs the user is editing (OI focus / chaos paint clobber).
 */

import {
  valuesMeaningfullyEqual,
  dirtyCompareKindForField,
  normalizeEditableText,
} from "./dirty-gate.js";

/**
 * True when paint() must not replace the input value (focused or locally dirty vs doc).
 *
 * @param {{
 *   field: string,
 *   paintedValue: unknown,
 *   currentValue: unknown,
 *   isFocused?: boolean,
 * }} opts
 */
export function shouldPreserveHeaderInputDuringPaint(opts) {
  const { field, paintedValue, currentValue, isFocused = false } = opts;
  if (isFocused) return true;
  const kind = dirtyCompareKindForField(field);
  const painted = normalizeEditableText(paintedValue);
  const current = normalizeEditableText(currentValue);
  // Blank Doc field → accept ERP/header value (fixes Bill Due Date after Terms settle).
  if (!current && painted) return false;
  return !valuesMeaningfullyEqual(paintedValue, currentValue, { kind });
}

/**
 * Assign painted header value unless the user is mid-edit.
 *
 * @param {HTMLInputElement|HTMLTextAreaElement|null|undefined} input
 * @param {string} field ERP field name (`data-field`)
 * @param {string} paintedValue value paint would write
 * @param {{ activeElement?: Element|null, onSkip?: (reason: "focused"|"dirty") => void, forcePaint?: boolean }} [opts]
 * @returns {boolean} true when value was assigned
 */
export function paintHeaderInputIfAllowed(input, field, paintedValue, opts = {}) {
  if (!input) return false;
  if (opts.forcePaint) {
    input.value = paintedValue;
    return true;
  }
  const activeElement =
    opts.activeElement !== undefined
      ? opts.activeElement
      : typeof document !== "undefined"
        ? document.activeElement
        : null;
  const isFocused = activeElement === input;
  const preserve = shouldPreserveHeaderInputDuringPaint({
    field,
    paintedValue,
    currentValue: input.value,
    isFocused,
  });
  if (preserve) {
    opts.onSkip?.(isFocused ? "focused" : "dirty");
    return false;
  }
  input.value = paintedValue;
  return true;
}

/**
 * Link-picker header field — also syncs `dataset.linkCommitted` when painted.
 *
 * @param {HTMLInputElement|null|undefined} input
 * @param {string} field
 * @param {string} paintedValue
 * @param {{ activeElement?: Element|null, onSkip?: (reason: "focused"|"dirty") => void }} [opts]
 * @returns {boolean}
 */
export function paintHeaderLinkInputIfAllowed(input, field, paintedValue, opts = {}) {
  if (!paintHeaderInputIfAllowed(input, field, paintedValue, opts)) return false;
  input.dataset.linkCommitted = paintedValue;
  return true;
}
