/**
 * Where a link picker's dropdown goes (5zorro DF-01/DF-03: "the dropdown box was constrained by the
 * same width restriction of the item number column"). A line cell clips what overflows it, so the
 * dropdown is placed against the window instead: at least LINK_DD_MIN_WIDTH_PX wide, never wider than
 * LINK_DD_MAX_WIDTH_PX or the window, kept inside a 16px gutter, and opened above the box when there
 * is not room below. Pure: the page measures, this decides.
 */

export const LINK_DD_MIN_WIDTH_PX = 360;
export const LINK_DD_MAX_WIDTH_PX = 560;
export const LINK_DD_MAX_HEIGHT_PX = 220;
const GUTTER_PX = 16;
const GAP_PX = 2;
/** Below this much room under the box, open above it if there is more room there. */
const MIN_ROOM_BELOW_PX = 140;

/**
 * @param {{ left: number, right: number, top: number, bottom: number }} anchor the picker's box
 * @param {{ width: number, height: number }} viewport
 * @returns {{ left: number, top: number|null, bottom: number|null, width: number, maxHeight: number, above: boolean }}
 *   `top` when opening below, `bottom` (distance from the window's bottom) when above
 */
export function linkDropdownPlacement(anchor, viewport) {
  const vw = Math.max(0, Number(viewport && viewport.width) || 0);
  const vh = Math.max(0, Number(viewport && viewport.height) || 0);
  const a = anchor || { left: 0, right: 0, top: 0, bottom: 0 };
  const boxWidth = Math.max(0, a.right - a.left);
  const room = Math.max(0, vw - 2 * GUTTER_PX);
  const width = Math.min(room, Math.max(boxWidth, LINK_DD_MIN_WIDTH_PX), Math.max(boxWidth, LINK_DD_MAX_WIDTH_PX));
  // Start under the box's left edge; slide left only as far as the window needs.
  const left = Math.max(GUTTER_PX, Math.min(a.left, vw - GUTTER_PX - width));
  const below = vh - a.bottom - GAP_PX - GUTTER_PX;
  const aboveRoom = a.top - GAP_PX - GUTTER_PX;
  const above = below < MIN_ROOM_BELOW_PX && aboveRoom > below;
  const maxHeight = Math.max(80, Math.min(LINK_DD_MAX_HEIGHT_PX, above ? aboveRoom : below));
  return above
    ? { left, top: null, bottom: vh - a.top + GAP_PX, width, maxHeight, above: true }
    : { left, top: a.bottom + GAP_PX, bottom: null, width, maxHeight, above: false };
}
