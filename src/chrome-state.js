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
 * What clicking the Doc tab should *do*, in the same precedence {@link docTabState} uses for
 * what the tab *says*. These two disagreed until 2026-09-08: the hint put "this page's own
 * Doc skin" ahead of "back to where you came from" (docTabState above), while main.js's
 * openDocSkin() tried the two return paths first. Invisible for two years of Bill/PO/IR
 * because every peek parent and every parked return was a page with no Doc skin of its own —
 * Payment Entry is the first doctype that is *both* soft-peekable (`vanilla-always`, no
 * doc-form profile, so `isSoftPeekRoute` is true) and Doc-skinned (lens-context routes it to
 * pay-outstanding / payment-doc). Clicking Doc on it returned to Vanilla instead of opening
 * its skin — 5zorro's nav incident, 2026-09-08.
 *
 * `parkedIsSameDoc` is the one case a return still wins: same destination either way, but
 * resuming keeps unsaved edits instead of re-opening the form clean (OI-112 soft-peek return).
 *
 * `peekParentIsCurrent` exists because a peek stack can outlive its child — leave the child
 * and the parent-only stack stays armed while you are standing *on* the parent. "Returning"
 * there navigates to the page you are already on, which reads as the Doc tab doing nothing.
 * Never return in that case; the caller should collapse the stale stack instead.
 *
 * @param {{
 *   hasOwnDocSkin?: boolean,
 *   hasParked?: boolean,
 *   parkedIsSameDoc?: boolean,
 *   hasPeekParent?: boolean,
 *   peekParentIsCurrent?: boolean,
 * }} [state]
 * @returns {"resume-parked"|"open-own-skin"|"return-peek"|"fallback"}
 */
export function docTabAction(state = {}) {
  if (state.hasParked && state.parkedIsSameDoc) return "resume-parked";
  if (state.hasOwnDocSkin) return "open-own-skin";
  if (state.hasParked) return "resume-parked";
  if (state.hasPeekParent && !state.peekParentIsCurrent) return "return-peek";
  return "fallback";
}

/**
 * Which lens tab the toolbar paints as **selected**.
 *
 * Main already knows this — {@link toolbarLensId} answers it, and its `onDoc` input is the
 * wide `isShellDocSurface()`, not just "doc-form.html is in front". The toolbar used to throw
 * that answer away and re-derive selection from `showingBill || showingDocForm`, two flags
 * that only ever describe doc-form.html. On the two Payment Entry Doc surfaces both are false,
 * so the Document-skin tab was never emphasized *and* "not home, not doc-form" made the page
 * look like an ERP form, which lit Default-skin instead — the toolbar claiming the clerk was
 * in Vanilla while they sat in the Doc skin (nav incident 2026-09-10).
 *
 * Same rule as {@link lensTabsFor}: the toolbar renders the answer, it never guesses.
 *
 * @param {{ lens?: LensId|string, docAvailable?: boolean }} [state]
 * @returns {{ doc: boolean, vanilla: boolean, simplified: boolean }}
 */
export function lensTabEmphasis(state = {}) {
  const lens = state.lens === "doc" || state.lens === "simplified" ? state.lens : "vanilla";
  const onDoc = lens === "doc";
  return {
    // A tab that is hidden must not also be the selected one.
    doc: onDoc && state.docAvailable !== false,
    vanilla: !onDoc && lens !== "simplified",
    simplified: !onDoc && lens === "simplified",
  };
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
