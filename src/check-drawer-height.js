/**
 * How tall the pay-outstanding check drawer is (Packet 4b step 6).
 *
 * Packet 4b's Height row asked for a drawer "expandable toward full height, not a fixed strip";
 * step 2 shipped a fixed `max-height: 70vh` with no control. Measuring it (2026-09-07) showed the
 * cap was not actually the binding constraint — at 1080p the drawer rendered 631px against a
 * 756px cap, i.e. it was already content-sized. The height came from the *check* being laid out
 * as a 560px-wide vertical column when a real check is ~2.4:1 wide/short, which is the shape the
 * same Height row describes. So step 6 is two things: a wider check layout (CSS, not this file)
 * and this — a real stop control for the cases a wide layout still cannot shrink (an ACH advice,
 * or the 30-bills-on-one-check stub Packet G parks as a future stress test).
 *
 * Pure: no DOM, no localStorage. Storage is injected, the way item-col-widths.js and doc-wash.js
 * already do it.
 */

/** @typedef {"peek"|"half"|"full"} CheckDrawerStop */

/**
 * Ordered smallest → largest; the control cycles in this order.
 * `peek` is deliberately not "as small as possible" — it has to keep the drawer head (title +
 * Close) and the top of the check on screen, or the control that got you there is unreachable.
 * @type {readonly CheckDrawerStop[]}
 */
export const CHECK_DRAWER_STOPS = Object.freeze(["peek", "half", "full"]);

/** Fraction of the viewport each stop is allowed to occupy. */
const STOP_FRACTION = Object.freeze({ peek: 0.3, half: 0.55, full: 0.9 });

/** Human label for the control. */
export const CHECK_DRAWER_STOP_LABEL = Object.freeze({
  peek: "Peek",
  half: "Half",
  full: "Full",
});

/** @type {CheckDrawerStop} */
export const DEFAULT_CHECK_DRAWER_STOP = "half";

/** Below this the drawer head stops being usable, so no viewport is small enough to go under it. */
export const CHECK_DRAWER_MIN_PX = 180;

/**
 * @param {unknown} raw
 * @returns {CheckDrawerStop}
 */
export function normalizeDrawerStop(raw) {
  const s = raw == null ? "" : String(raw);
  return CHECK_DRAWER_STOPS.includes(/** @type {CheckDrawerStop} */ (s))
    ? /** @type {CheckDrawerStop} */ (s)
    : DEFAULT_CHECK_DRAWER_STOP;
}

/**
 * Cycle to the next stop, wrapping. One button rather than three — the drawer head is narrow and
 * three stops do not earn a segmented control.
 * @param {unknown} stop
 * @returns {CheckDrawerStop}
 */
export function nextDrawerStop(stop) {
  const i = CHECK_DRAWER_STOPS.indexOf(normalizeDrawerStop(stop));
  return CHECK_DRAWER_STOPS[(i + 1) % CHECK_DRAWER_STOPS.length];
}

/**
 * The `max-height` to apply, in px. Content shorter than this still renders short — this is a
 * ceiling, never a floor, so "peek" on a one-bill check does not pad the drawer out to 30% of
 * the screen.
 * @param {unknown} stop
 * @param {unknown} viewportH
 * @returns {number}
 */
export function drawerMaxHeightPx(stop, viewportH) {
  const vh = Number(viewportH);
  if (!Number.isFinite(vh) || vh <= 0) return CHECK_DRAWER_MIN_PX;
  const raw = vh * STOP_FRACTION[normalizeDrawerStop(stop)];
  // Never below the floor, and never taller than the viewport itself.
  return Math.round(Math.min(vh, Math.max(CHECK_DRAWER_MIN_PX, raw)));
}

/**
 * Only an explicit choice persists — same rule Packet T C locked for column widths, so a stale
 * stored value can never be the reason the surface is unusable. Absent/corrupt storage yields
 * the default rather than throwing (a private-mode or blocked-storage read can throw outright).
 * @param {{ getItem?: (k: string) => unknown }|null|undefined} storage
 * @param {string} [key]
 * @returns {CheckDrawerStop}
 */
export function readDrawerStop(storage, key = "check-drawer-stop") {
  if (!storage || typeof storage.getItem !== "function") return DEFAULT_CHECK_DRAWER_STOP;
  try {
    return normalizeDrawerStop(storage.getItem(key));
  } catch {
    return DEFAULT_CHECK_DRAWER_STOP;
  }
}

/**
 * @param {{ setItem?: (k: string, v: string) => unknown }|null|undefined} storage
 * @param {unknown} stop
 * @param {string} [key]
 * @returns {CheckDrawerStop} what was actually stored (normalized)
 */
export function writeDrawerStop(storage, stop, key = "check-drawer-stop") {
  const value = normalizeDrawerStop(stop);
  if (storage && typeof storage.setItem === "function") {
    try {
      storage.setItem(key, value);
    } catch {
      /* storage unavailable — the choice still applies for this session */
    }
  }
  return value;
}
