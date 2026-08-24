/**
 * ALL-CAPS data entry for Doc skins (OI-111).
 * Default ON when a Doc page opens; toggle off for the page only (not sticky).
 * Values are uppercased as typed so stored ERP text is caps — not CSS-only.
 */

/**
 * @param {boolean|undefined|null} capsOn
 * @returns {boolean} true when forcing uppercase (default ON)
 */
export function isDocCapsOn(capsOn) {
  return capsOn !== false;
}

/**
 * @param {boolean|undefined|null} capsOn
 * @returns {boolean} next toggle state
 */
export function toggleDocCaps(capsOn) {
  return !isDocCapsOn(capsOn);
}

/**
 * @param {boolean|undefined|null} capsOn
 * @returns {string}
 */
export function docCapsButtonLabel(capsOn) {
  return isDocCapsOn(capsOn) ? "⇪ CAPS: ON" : "⇪ caps: off";
}

/**
 * @param {boolean|undefined|null} capsOn
 * @returns {string}
 */
export function docCapsButtonTitle(capsOn) {
  return isDocCapsOn(capsOn)
    ? "ALL-CAPS entry is on — click to type mixed case on this page"
    : "ALL-CAPS entry is off for this page — click to turn back on";
}

/**
 * Should this control force uppercase while caps is on?
 * @param {boolean|undefined|null} capsOn
 * @param {{ tagName?: string, type?: string, readOnly?: boolean, disabled?: boolean }} el
 * @returns {boolean}
 */
export function shouldForceCapsOnElement(capsOn, el) {
  if (!isDocCapsOn(capsOn) || !el) return false;
  if (el.readOnly || el.disabled) return false;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
  const ty = String(el.type || "text").toLowerCase();
  if (
    ty === "date" ||
    ty === "number" ||
    ty === "checkbox" ||
    ty === "radio" ||
    ty === "file" ||
    ty === "hidden" ||
    ty === "password" ||
    ty === "range" ||
    ty === "color"
  ) {
    return false;
  }
  return true;
}

/**
 * @param {string|null|undefined} value
 * @param {boolean|undefined|null} capsOn
 * @returns {string}
 */
export function applyDocCapsValue(value, capsOn) {
  const s = value == null ? "" : String(value);
  if (!isDocCapsOn(capsOn)) return s;
  return s.toUpperCase();
}
