/**
 * Detour: a peek whose return point is a shell page (plan 2026-09-26 "Doors: peek or navigate",
 * door 4, agreed 5zorro 2026-10-02). Writing a check, the clerk opens the bill it pays to correct
 * it — a void and amend included — and must land back on the payment work:
 *
 * - the shell page stays loaded behind (a half-written check is still there);
 * - the bill opens in the clerk's usual lens, not forced into any skin;
 * - "← Back to …" in the toolbar returns, and so does Esc when the page is not using it;
 * - nothing about the bill (its name changing on amend) ends the detour; leaving for other work
 *   (Home, Find, another shell page) does.
 *
 * Pure: main keeps the one live detour.
 */

/** Shell pages that can be a detour's return point, and how the back control names them. */
export const DETOUR_SURFACES = Object.freeze({
  "pay-outstanding": Object.freeze({ label: "Pay Outstanding" }),
  "payment-doc": Object.freeze({ label: "the payment" }),
});

/**
 * @typedef {{ surface: string, label: string, route: string }} ShellDetour
 */

/**
 * Start a detour from the page on screen, or null when that page cannot be a return point.
 * @param {string} surfaceMode
 * @param {string} [route] the shell page's own route (a payment page needs it to reload)
 * @returns {ShellDetour|null}
 */
export function beginShellDetour(surfaceMode, route = "") {
  const s = DETOUR_SURFACES[/** @type {keyof typeof DETOUR_SURFACES} */ (surfaceMode)];
  if (!s) return null;
  return { surface: surfaceMode, label: s.label, route: String(route || "") };
}

/**
 * Toolbar text while away on a detour; "" when there is none or the clerk is back on it.
 * @param {ShellDetour|null|undefined} detour
 * @param {string} surfaceMode
 */
export function detourBackLabel(detour, surfaceMode) {
  if (!detour || !detour.surface || surfaceMode === detour.surface) return "";
  return `← Back to ${detour.label}`;
}

/**
 * Esc on a Doc skin returns from a detour only when nothing on the page is using it: not already
 * handled, no dialog open, and not typing in a field (Esc there cancels the edit or closes a
 * picker).
 * @param {{ key: string, defaultPrevented?: boolean, dialogOpen?: boolean, editing?: boolean }} ev
 */
export function shouldEscReturnFromDetour(ev) {
  const e = ev || /** @type {any} */ ({});
  return e.key === "Escape" && !e.defaultPrevented && !e.dialogOpen && !e.editing;
}
