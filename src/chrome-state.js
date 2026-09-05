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
 * Should the toolbar show a **Doc** tab at all, and what will clicking it do?
 *
 * The tab is not a general escape hatch. It is offered when the page in front of you is
 * a Doc-skinnable *record*, or when you are exactly **one step** away from a transaction
 * entry form — i.e. you peeked at a master (edit Payment Terms from a Simplified Bill) and
 * there is a parked Doc or a peek parent to go back to. Arriving on an unrelated Vanilla
 * page from Home or from a Find/list route offers nothing to return to, so the tab is
 * hidden rather than inventing a new Bill (nav incident 2026-09-05).
 *
 * Two steps out is deliberately not modelled: peek children are depth-1, and 5zorro's call
 * is that re-entering the form is acceptable in that narrow case.
 *
 * @param {{
 *   onDoc?: boolean,
 *   hasDocSkinnedRecord?: boolean,
 *   hasParkedDoc?: boolean,
 *   hasPeekParent?: boolean,
 *   returnLabel?: string,
 * }} [state]
 * @returns {{ available: boolean, hint: string }}
 */
export function docTabState(state = {}) {
  if (state.onDoc) return { available: true, hint: "Doc skin" };
  if (state.hasDocSkinnedRecord) return { available: true, hint: "Doc skin for this page" };
  if (state.hasParkedDoc || state.hasPeekParent) {
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
