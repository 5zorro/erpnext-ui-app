/**
 * When the shell must re-place its views, and how long to keep watching after it does.
 *
 * The bug this exists for (5zorro dogfood incident 2026-09-17, surfaceMode "home"): "tried
 * testing by putting the screen at full screen on a 1080p monitor and it does not use all
 * vertical space. something didn't update." The shell listened to `resize` alone. A fullscreen
 * transition does fire `resize`, but it fires *during* the transition, so `getContentBounds()`
 * still reports the pre-fullscreen size; the views were placed against that and nothing asked
 * again. The window grew, the views did not, and the desktop showed through under the history
 * rail and under the page.
 *
 * Two parts to the answer, and both are needed:
 *   1. Listen to the state changes themselves, not just `resize` — a window manager is free to
 *      order these differently, and Linux/WSLg does.
 *   2. Re-place a few times after the event, because the final bounds can land after the event
 *      that announced them. Cheap: placing views is arithmetic plus a setBounds call.
 */

/** Window events after which the views may be the wrong size. */
export const SHELL_RELAYOUT_EVENTS = Object.freeze([
  "resize",
  // First paint counts too: the window is created hidden and shown on ready-to-show, and its
  // content box can settle a few px after that (window decorations). Without this the views
  // start slightly taller than the window and the last rows sit below its bottom edge.
  "show",
  // Snap-to-half (Win+Right) measured 2026-09-17: the `resize` it fires still reports the OLD
  // size, and the new one shows up only in the `move` events that follow. So a move is treated
  // as a possible resize — `contentSizeChanged` makes that free for an ordinary window drag.
  "move",
  "moved",
  "resized",
  "maximize",
  "unmaximize",
  "restore",
  "enter-full-screen",
  "leave-full-screen",
]);

/**
 * Delays (ms from the event) at which to re-place. 0 keeps the synchronous pass that already
 * worked; the later two catch bounds that settle after the transition animation.
 */
export const RELAYOUT_SETTLE_MS = Object.freeze([0, 80, 250, 600]);

/**
 * @typedef {{ x?: number, y?: number, width?: number, height?: number }} RectLike
 */

/**
 * Did the content area actually change size? Position alone never changes view layout — the
 * views are placed relative to the content box, so a dragged window needs no work.
 *
 * @param {RectLike|null|undefined} a
 * @param {RectLike|null|undefined} b
 * @returns {boolean}
 */
export function contentSizeChanged(a, b) {
  if (!a || !b) return true;
  return num(a.width) !== num(b.width) || num(a.height) !== num(b.height);
}

/** @param {unknown} v */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
