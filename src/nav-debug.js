/**
 * Rolling nav debug ring (OI-112 dogfood) — pure; no secrets / keystrokes.
 */

/**
 * @typedef {{
 *   at: string,
 *   event: string,
 *   surfaceMode?: string,
 *   currentRoute?: string,
 *   detail?: string,
 * }} NavDebugEntry
 */

/**
 * Volume telemetry, not navigation decisions. `chaos-lag` fires on every delayed channel
 * call, several times a second under `npm run start:chaos`, and on a plain FIFO ring it
 * evicts the events that actually explain a bug: the nav incident filed
 * 2026-09-08T03:38 had a trail of 20 entries, all 20 of them `chaos-lag`, with the
 * showErp / nav-intent / trackNav-stale sequence that caused it already gone.
 *
 * These entries still reach `nav-debug.log` on disk in full — the quota only applies to
 * the in-memory ring that incident snapshots are cut from.
 * @type {Set<string>}
 */
export const NAV_DEBUG_NOISE_EVENTS = new Set(["chaos-lag"]);

/** @param {NavDebugEntry} e */
function isNoiseEntry(e) {
  return !!(e && NAV_DEBUG_NOISE_EVENTS.has(String(e.event)));
}

/**
 * @param {NavDebugEntry[]} entries
 * @param {NavDebugEntry} entry
 * @param {{ maxEntries?: number, maxNoise?: number }} [opts]
 * @returns {NavDebugEntry[]}
 */
export function appendNavDebug(entries, entry, opts = {}) {
  const prev = Array.isArray(entries) ? entries : [];
  if (!entry || !entry.at || !entry.event) return prev.slice();
  const maxEntries = opts.maxEntries ?? 40;
  const maxNoise = opts.maxNoise ?? Math.max(1, Math.floor(maxEntries / 5));
  let next = [...prev, entry];
  // Trim surplus noise (oldest first) *before* the length cap, so telemetry volume can
  // never push a navigation decision out of the ring.
  let surplus = next.filter(isNoiseEntry).length - maxNoise;
  if (surplus > 0) {
    next = next.filter((e) => {
      if (surplus > 0 && isNoiseEntry(e)) {
        surplus -= 1;
        return false;
      }
      return true;
    });
  }
  if (next.length > maxEntries) return next.slice(next.length - maxEntries);
  return next;
}

/**
 * @param {NavDebugEntry[]} entries
 * @returns {string[]}
 */
export function formatNavDebugLines(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) return ["--- Nav debug ---", "(no clicks yet this session)"];
  const lines = ["--- Nav debug (newest last; paste with Feedback / DB diagnose) ---"];
  for (const e of rows) {
    const t = e.at ? e.at.slice(11, 19) : "??:??:??";
    const surf = e.surfaceMode != null ? e.surfaceMode : "?";
    const route = e.currentRoute != null ? e.currentRoute : "";
    const detail = e.detail != null && String(e.detail).trim() ? ` | ${e.detail}` : "";
    lines.push(`${t} [${surf}] ${e.event}${route ? ` @ ${route}` : ""}${detail}`);
  }
  return lines;
}
