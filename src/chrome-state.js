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
