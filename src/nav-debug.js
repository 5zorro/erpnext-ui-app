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
 * @param {NavDebugEntry[]} entries
 * @param {NavDebugEntry} entry
 * @param {{ maxEntries?: number }} [opts]
 * @returns {NavDebugEntry[]}
 */
export function appendNavDebug(entries, entry, opts = {}) {
  const prev = Array.isArray(entries) ? entries : [];
  if (!entry || !entry.at || !entry.event) return prev.slice();
  const maxEntries = opts.maxEntries ?? 40;
  const next = [...prev, entry];
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
