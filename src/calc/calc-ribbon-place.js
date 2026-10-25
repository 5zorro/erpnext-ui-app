/**
 * Where the calculator's ribbon goes and how wide it is (5zorro 2026-10-11: "does the ribbon get a
 * shortened width depending on the cell?" — it did: exactly the field's width, so a long tape in a
 * narrow Qty or Cost cell spilled out of the dark box). It stays lined up with the field — the
 * field's right edge for right-aligned numbers (decimals under decimals), its left edge for
 * left-aligned ones — and grows away from that edge to fit its tape, inside a 16px window gutter.
 * Pure: the page measures, this decides.
 */

export const CALC_RIBBON_MIN_PX = 72;
const GUTTER_PX = 16;

/**
 * @param {{ left: number, right: number }} anchor the field's box
 * @param {number} contentWidth the tape's natural width, padding included
 * @param {"left"|"right"|string} align the field's text alignment
 * @param {number} viewportWidth
 * @returns {{ left: number, width: number }}
 */
export function calcRibbonPlacement(anchor, contentWidth, align, viewportWidth) {
  const a = anchor || { left: 0, right: 0 };
  const vw = Math.max(0, Number(viewportWidth) || 0);
  const fieldW = Math.max(0, Math.round(a.right - a.left));
  const room = Math.max(CALC_RIBBON_MIN_PX, vw - 2 * GUTTER_PX);
  const width = Math.min(room, Math.max(CALC_RIBBON_MIN_PX, fieldW, Math.ceil(Number(contentWidth) || 0)));
  let left = align === "right" ? Math.round(a.right) - width : Math.round(a.left);
  // Inside the window: slide back only as far as the edge needs.
  left = Math.min(left, vw - GUTTER_PX - width);
  left = Math.max(left, Math.min(GUTTER_PX, Math.max(0, Math.round(a.left))));
  return { left, width };
}
