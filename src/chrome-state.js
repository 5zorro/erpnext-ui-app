/**
 * Pure chrome UI state — toolbar lens chip + left rail geometry.
 * Electron reads these; no DOM here.
 */

import { routeInfo } from "./route-info.js";
import { preferredLens } from "./lens-prefs.js";

/** @typedef {"vanilla"|"simplified"|"doc"} LensId */

/** Recent / Drafts rail, expanded and collapsed (px). */
export const HISTORY_RAIL_WIDTH = 176;
export const HISTORY_RAIL_COLLAPSED_WIDTH = 22;

/**
 * @param {boolean} collapsed
 * @returns {number}
 */
export function historyRailWidth(collapsed) {
  return collapsed ? HISTORY_RAIL_COLLAPSED_WIDTH : HISTORY_RAIL_WIDTH;
}

/**
 * Which lens tabs the toolbar may show for the page in front of you.
 *
 * Vanilla is always available — it is the ERP itself. Every other tab must be earned by
 * *this page*: Simplified only where the lens has a profile and a record to act on, Doc only
 * for a Doc-skinnable record or a genuine **one-step** return to one (you peeked at a master
 * while editing a Bill, so the parked Doc / peek parent is that Bill).
 *
 * The return target has to be a Doc-skinnable record, not merely "some peek parent": peeking
 * from a Payments dashboard made the dashboard a peek parent and lit the Doc tab on a page
 * with no skin at all (nav incident 2026-09-05).
 *
 * Two steps out is deliberately not modelled: peek children are depth-1, and 5zorro's call
 * is that re-entering the form is acceptable in that narrow case.
 *
 * @param {{
 *   onDoc?: boolean,
 *   hasDocSkinnedRecord?: boolean,
 *   hasSimplifiedLens?: boolean,
 *   parkedIsDocSkinned?: boolean,
 *   peekParentIsDocSkinned?: boolean,
 *   returnLabel?: string,
 * }} [state]
 * @returns {{ vanilla: boolean, simplified: boolean, doc: boolean, docHint: string }}
 */
export function lensTabsFor(state = {}) {
  const doc = docTabState(state);
  return {
    vanilla: true,
    // On the Doc surface the ERP form behind it is still the Simplified target.
    simplified: !!state.hasSimplifiedLens,
    doc: doc.available,
    docHint: doc.hint,
  };
}

/**
 * Doc tab availability + what clicking it will actually do. See {@link lensTabsFor}.
 * @param {Parameters<typeof lensTabsFor>[0]} [state]
 * @returns {{ available: boolean, hint: string }}
 */
export function docTabState(state = {}) {
  if (state.onDoc) return { available: true, hint: "Document-skin" };
  if (state.hasDocSkinnedRecord) return { available: true, hint: "Document-skin for this page" };
  if (state.parkedIsDocSkinned || state.peekParentIsDocSkinned) {
    const label = state.returnLabel != null ? String(state.returnLabel).trim() : "";
    return { available: true, hint: label ? `Back to ${label}` : "Back to the form you came from" };
  }
  return { available: false, hint: "" };
}

/**
 * Which lens the toolbar should show as active.
 *
 * Reads the **live** ERP path in preference to the route the shell believes it is on:
 * currentRoute can lag the page (a stale nav event, or a reload that never happened),
 * and this chip is what tells the clerk which lens they are in — a chip that says
 * Vanilla over a still-Simplified page is the bug this exists to prevent
 * (nav incident 2026-09-03).
 *
 * @param {{
 *   onDoc?: boolean,
 *   surfaceMode?: string,
 *   shellRoute?: string,
 *   liveErpPath?: string,
 *   lensPrefs?: Record<string, string>,
 *   erpBase?: string,
 * }} [state]
 * @returns {LensId}
 */
export function toolbarLensId(state = {}) {
  if (state.onDoc) return "doc";
  if (state.surfaceMode !== "erp") return "vanilla";
  const path = state.liveErpPath || state.shellRoute || "";
  const info = routeInfo(path, state.erpBase);
  if (!info.doctype || !info.record) return "vanilla";
  return preferredLens(info.doctype, state.lensPrefs || {}) === "simplified"
    ? "simplified"
    : "vanilla";
}
