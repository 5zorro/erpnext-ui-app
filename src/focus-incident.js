/**
 * Fail-loud focus incident records — clerk note + frozen shell/focus snapshot.
 * Reuses nav incident context slimming; adds focus trail. No field values.
 */

import {
  NAV_INCIDENT_NOTE_MAX,
  sanitizeNavIncidentNote,
  slimNavIncidentContext,
  formatNavIncidentContextLines,
} from "./nav-incident.js";
import { formatFocusActive } from "./focus-debug.js";

export const FOCUS_INCIDENT_NOTE_MAX = NAV_INCIDENT_NOTE_MAX;
export const FOCUS_INCIDENT_TRAIL_MAX = 30;
export const FOCUS_INCIDENT_RING_MAX = 15;
export const FOCUS_INCIDENT_KIND = "focus-incident";

export const sanitizeFocusIncidentNote = sanitizeNavIncidentNote;

/**
 * @param {unknown} entries
 * @returns {Array<{ at: string, event: string, surfaceMode: string, surface: string, detail: string, active: string }>}
 */
export function slimFocusTrail(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  return rows.slice(-FOCUS_INCIDENT_TRAIL_MAX).map((e) => ({
    at: e && e.at != null ? String(e.at) : "",
    event: e && e.event != null ? String(e.event) : "",
    surfaceMode: e && e.surfaceMode != null ? String(e.surfaceMode) : "",
    surface: e && e.surface != null ? String(e.surface) : "",
    detail: e && e.detail != null ? String(e.detail) : "",
    active: e && e.active ? formatFocusActive(e.active) : "",
  }));
}

/**
 * @param {object} [raw]
 */
export function slimFocusIncidentContext(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    ...slimNavIncidentContext(src),
    focusTrail: slimFocusTrail(src.focusTrail),
  };
}

/**
 * @param {object} [ctx]
 * @returns {string[]}
 */
export function formatFocusIncidentContextLines(ctx) {
  const c = slimFocusIncidentContext(ctx);
  const base = formatNavIncidentContextLines(c);
  const trail = c.focusTrail || [];
  if (!trail.length) {
    return [...base, "", "--- Focus trail ---", "(empty — reproduce then click Focus issue)"];
  }
  const trailLines = ["--- Focus trail (newest last) ---"];
  for (const e of trail) {
    const t = e.at ? e.at.slice(11, 19) : "??:??:??";
    const src = e.surface ? `/${e.surface}` : "";
    const detail = e.detail ? ` | ${e.detail}` : "";
    const active = e.active ? ` → ${e.active}` : "";
    trailLines.push(`${t} [${e.surfaceMode || "?"}${src}] ${e.event}${detail}${active}`);
  }
  return [...base, "", ...trailLines];
}

/**
 * @param {object} ctx
 * @param {unknown} note
 * @param {string} [at]
 */
export function buildFocusIncident(ctx, note, at) {
  const clean = sanitizeFocusIncidentNote(note);
  if (!clean) return null;
  const when = at != null && String(at).trim() ? String(at) : new Date().toISOString();
  return {
    kind: FOCUS_INCIDENT_KIND,
    at: when,
    note: clean,
    context: slimFocusIncidentContext(ctx),
  };
}

/**
 * @param {ReturnType<typeof buildFocusIncident>} incident
 * @returns {string[]}
 */
export function formatFocusIncidentLines(incident) {
  if (!incident || incident.kind !== FOCUS_INCIDENT_KIND) return [];
  return [
    `--- Focus incident ${incident.at || ""} ---`,
    `Note: ${incident.note || ""}`,
    ...formatFocusIncidentContextLines(incident.context || {}),
  ];
}

/**
 * @param {object[]} ring
 * @param {object} incident
 * @param {{ maxEntries?: number }} [opts]
 */
export function appendFocusIncident(ring, incident, opts = {}) {
  const prev = Array.isArray(ring) ? ring : [];
  if (!incident || incident.kind !== FOCUS_INCIDENT_KIND) return prev.slice();
  const max = opts.maxEntries ?? FOCUS_INCIDENT_RING_MAX;
  const next = [...prev, incident];
  if (next.length > max) return next.slice(next.length - max);
  return next;
}

/**
 * @param {object[]} incidents
 * @returns {string[]}
 */
export function formatFocusIncidentsDigest(incidents) {
  const rows = Array.isArray(incidents) ? incidents : [];
  if (!rows.length) return ["--- Focus incidents ---", "(none this session)"];
  const lines = ["--- Focus incidents (newest last) ---"];
  for (const inc of rows) {
    lines.push(...formatFocusIncidentLines(inc), "");
  }
  return lines;
}

/**
 * @param {object} incident
 * @returns {string}
 */
export function serializeFocusIncidentLine(incident) {
  return `${JSON.stringify(incident)}\n`;
}
