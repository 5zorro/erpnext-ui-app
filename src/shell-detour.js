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
 * A Doc page can be the return point too (5zorro 2026-10-11): from a bill to a document with its
 * own Doc skin (its PO, Item Receipt, Sales Order, a payment) is an errand. ERPNext keeps an unsaved
 * bill only in the hidden form's memory, which opening another Doc skin can reload away — so the
 * unsaved-changes gate asks **at the door** (5zorro: more intuitive than asking at the moment of
 * danger), and "← Back to …" / Esc reopen the bill, by then saved. The lasting answer is a second
 * window per errand (OI-040, multi-window); this is the temporary one.
 *
 * Pure: main keeps the one live detour.
 */
import { isNewDocRecord, normalizeAppRoute, routesReferToSameDoc } from "./route-info.js";
import { isSoftPeekRoute } from "./history-nav.js";

/** Shell pages that can be a detour's return point, and how the back control names them. */
export const DETOUR_SURFACES = Object.freeze({
  "pay-outstanding": Object.freeze({ label: "Pay Outstanding" }),
  "payment-doc": Object.freeze({ label: "the payment" }),
});

/**
 * @typedef {{ surface: string, label: string, route: string }} ShellDetour
 * `surface` "doc" = a Doc page is the return point; `route` is the document to reopen.
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
 * Does opening this address from a Doc page leave for another Doc-skinned document (an errand that
 * gets the door gate), rather than a setup master that peeks in Vanilla (vendor, item, terms)?
 * @param {string} route
 * @param {string} [erpBase]
 */
export function isDocErrandTarget(route, erpBase) {
  const n = normalizeAppRoute(route, erpBase);
  if (!n.doctype || !n.record || n.doctype === "query-report") return false;
  return !isSoftPeekRoute(route, erpBase);
}

/**
 * The return point once the gate has let the clerk go. A document that was never saved has no
 * address to come back to (the gate's Discard on a new bill), so there is no way back to offer.
 * @param {{ doctypeKey: string, name: string, label: string }} parent
 * @returns {ShellDetour|null}
 */
export function beginDocDetour(parent) {
  const p = parent || /** @type {any} */ ({});
  const name = String(p.name || "").trim();
  const key = String(p.doctypeKey || "").trim();
  if (!name || !key || isNewDocRecord(name)) return null;
  return { surface: "doc", label: `${p.label || "the document"} ${name}`, route: `/app/${key}/${encodeURIComponent(name)}` };
}

/**
 * Toolbar text while away on a detour; "" when there is none or the clerk is back on it.
 * @param {ShellDetour|null|undefined} detour
 * @param {string} surfaceMode
 * @param {string} [currentRoute] a Doc-page detour is over when that document is on screen again
 * @param {string} [erpBase]
 */
export function detourBackLabel(detour, surfaceMode, currentRoute = "", erpBase = "") {
  if (!detour || !detour.surface) return "";
  if (detour.surface === "doc") {
    if (surfaceMode === "doc" && routesReferToSameDoc(currentRoute, detour.route, erpBase)) return "";
  } else if (surfaceMode === detour.surface) return "";
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
