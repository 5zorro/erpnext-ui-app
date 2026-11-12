/**
 * A new form's opening focus in its Vendor (or Customer) box, the Bill's way, on every Doc form
 * (plan 2026-10-25 closeout, item 4; the Bill's rule since 2026-10-11, 5zorro: a slow load must
 * not pull the clerk out of a box they already clicked into).
 *
 * The focus is skipped when the clerk is already in one of the form's boxes, or has moved (a key
 * or a click, src/user-move-guard.js) since this form first appeared — counted from then, not from
 * this call, because a repaint can drop their focus before the opening focus is asked for. The box
 * that held the focus when this form first appeared does not count as "already in": the page keeps
 * its boxes from one document to the next, so that is the last document's place, and a new one
 * opened from the shell still starts in Vendor (probe `party-focus-kept`). It is
 * tried now and once more after layout, never later (the old 50 / 200 ms retries could land after
 * the clerk had moved).
 */

import { isBillFormFocusTarget } from "./bill-focus-guard.js";

/**
 * @param {{
 *   box: HTMLInputElement | null | undefined,
 *   shownMark: any,
 *   shownFocus?: Element | null,
 *   userMoves: { movedSince: (mark: any) => boolean },
 *   logFocus: (event: string, detail?: string) => void,
 *   activeElement?: () => Element | null,
 *   afterLayout?: (fn: () => void) => void,
 * }} deps
 * @returns {boolean} true when the focus was put there
 */
export function focusPartyBox(deps) {
  const box = deps.box;
  if (!box) return false;
  const already = deps.activeElement ? deps.activeElement() : document.activeElement;
  if (already && already !== box && already !== deps.shownFocus && isBillFormFocusTarget(already)) {
    deps.logFocus("focus-vendor-skipped", "clerk already in a field");
    return false;
  }
  if (deps.userMoves.movedSince(deps.shownMark)) {
    deps.logFocus("focus-vendor-skipped", "clerk moved since the form appeared");
    return false;
  }
  const tryFocus = () => {
    if (deps.userMoves.movedSince(deps.shownMark)) return;
    try {
      box.focus({ preventScroll: false });
      box.select();
    } catch {
      try {
        box.focus();
      } catch {
        /* ignore */
      }
    }
  };
  tryFocus();
  (deps.afterLayout || requestAnimationFrame)(tryFocus);
  return true;
}
