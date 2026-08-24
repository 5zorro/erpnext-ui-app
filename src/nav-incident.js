/**
 * Fail-loud nav incident records (OI-127).
 * Clerk note + frozen shell snapshot. No cookies, field values, or full doc JSON.
 */

export const NAV_INCIDENT_NOTE_MAX = 4000;
export const NAV_INCIDENT_TRAIL_MAX = 20;
export const NAV_INCIDENT_HISTORY_MAX = 12;
export const NAV_INCIDENT_RING_MAX = 15;
export const NAV_INCIDENT_KIND = "nav-incident";

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeNavIncidentNote(raw) {
  let s = raw == null ? "" : String(raw);
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = s.trim();
  if (s.length > NAV_INCIDENT_NOTE_MAX) s = s.slice(0, NAV_INCIDENT_NOTE_MAX);
  return s;
}

/**
 * @param {unknown} list
 * @returns {Array<{ route: string, label: string, kind: string, detail: string }>}
 */
export function slimHistoryForIncident(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows.slice(0, NAV_INCIDENT_HISTORY_MAX).map((h) => ({
    route: h && h.route != null ? String(h.route) : "",
    label: h && h.label != null ? String(h.label) : "",
    kind: h && h.kind != null ? String(h.kind) : "",
    detail: h && h.detail != null ? String(h.detail) : "",
  }));
}

/**
 * @param {unknown} doc
 * @returns {{ doctype: string, name: string, docstatus: number|null }|null}
 */
export function slimDocIdentity(doc) {
  if (!doc || typeof doc !== "object") return null;
  const doctype = doc.doctype != null ? String(doc.doctype) : "";
  const name = doc.name != null ? String(doc.name) : "";
  if (!doctype && !name) return null;
  let docstatus = null;
  if (doc.docstatus != null && doc.docstatus !== "") {
    const n = Number(doc.docstatus);
    docstatus = Number.isFinite(n) ? n : null;
  }
  return { doctype, name, docstatus };
}

/**
 * @param {unknown} entries
 * @returns {Array<{ at: string, event: string, surfaceMode: string, currentRoute: string, detail: string }>}
 */
export function slimNavTrail(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  return rows.slice(-NAV_INCIDENT_TRAIL_MAX).map((e) => ({
    at: e && e.at != null ? String(e.at) : "",
    event: e && e.event != null ? String(e.event) : "",
    surfaceMode: e && e.surfaceMode != null ? String(e.surfaceMode) : "",
    currentRoute: e && e.currentRoute != null ? String(e.currentRoute) : "",
    detail: e && e.detail != null ? String(e.detail) : "",
  }));
}

/**
 * @param {unknown} parked
 * @returns {{ mode: string, skinId: string, route: string }|null}
 */
export function slimParked(parked) {
  if (!parked || typeof parked !== "object") return null;
  return {
    mode: parked.mode != null ? String(parked.mode) : "",
    skinId: parked.skinId != null ? String(parked.skinId) : "",
    route: parked.route != null ? String(parked.route) : "",
  };
}

/**
 * @param {unknown} list
 * @returns {string[]}
 */
export function slimPeekChildren(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows
    .slice(0, 8)
    .map((r) => (r != null ? String(r) : ""))
    .filter(Boolean);
}

/**
 * @typedef {{
 *   surfaceMode: string,
 *   currentRoute: string,
 *   erpPath: string,
 *   activeDocSkin: string,
 *   preferredLens: string,
 *   userEdited: boolean,
 *   isDirty: boolean,
 *   isNew: boolean,
 *   companyAbbr: string,
 *   guestWindowCount: number,
 *   shelvedCount: number,
 *   parked: ReturnType<typeof slimParked>,
 *   peekParent: string,
 *   peekChildren: string[],
 *   doc: ReturnType<typeof slimDocIdentity>,
 *   history: ReturnType<typeof slimHistoryForIncident>,
 *   navTrail: ReturnType<typeof slimNavTrail>,
 * }} NavIncidentContext
 */

/**
 * @param {object} [raw]
 * @returns {NavIncidentContext}
 */
export function slimNavIncidentContext(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const guest = Number(src.guestWindowCount);
  const shelved = Number(src.shelvedCount);
  return {
    surfaceMode: src.surfaceMode != null ? String(src.surfaceMode) : "",
    currentRoute: src.currentRoute != null ? String(src.currentRoute) : "",
    erpPath: src.erpPath != null ? String(src.erpPath) : "",
    activeDocSkin: src.activeDocSkin != null ? String(src.activeDocSkin) : "",
    preferredLens: src.preferredLens != null ? String(src.preferredLens) : "",
    userEdited: !!src.userEdited,
    isDirty: !!src.isDirty,
    isNew: !!src.isNew,
    companyAbbr: src.companyAbbr != null ? String(src.companyAbbr) : "",
    guestWindowCount: Number.isFinite(guest) ? guest : 0,
    shelvedCount: Number.isFinite(shelved) ? shelved : 0,
    parked: slimParked(src.parked),
    peekParent: src.peekParent != null ? String(src.peekParent) : "",
    peekChildren: slimPeekChildren(src.peekChildren),
    doc: slimDocIdentity(src.doc),
    history: slimHistoryForIncident(src.history),
    navTrail: slimNavTrail(src.navTrail),
  };
}

/**
 * Compact preview for the incident dialog (no trail dump).
 * @param {object} [ctx]
 * @returns {string[]}
 */
export function formatNavIncidentContextLines(ctx) {
  const c = slimNavIncidentContext(ctx);
  const parked = c.parked ? `${c.parked.mode} ${c.parked.route}` : "(none)";
  const doc = c.doc ? `${c.doc.doctype} ${c.doc.name} ds=${c.doc.docstatus}` : "(none)";
  return [
    `surface: ${c.surfaceMode || "?"}`,
    `route: ${c.currentRoute || "?"}`,
    `erp path: ${c.erpPath || "?"}`,
    `parked: ${parked}`,
    `peeks: ${c.peekParent || "(none)"}${c.peekChildren.length ? ` → ${c.peekChildren.join(", ")}` : ""}`,
    `doc: ${doc}`,
    `edits: userEdited=${c.userEdited} isDirty=${c.isDirty} isNew=${c.isNew}`,
    `lens: skin=${c.activeDocSkin || "-"} preferred=${c.preferredLens || "-"}`,
    `windows: ${c.guestWindowCount}  drafts: ${c.shelvedCount}  company: ${c.companyAbbr || "-"}`,
  ];
}

/**
 * @param {object} ctx
 * @param {unknown} note
 * @param {string} [at]
 * @returns {{ kind: string, at: string, note: string, context: NavIncidentContext }|null}
 */
export function buildNavIncident(ctx, note, at) {
  const clean = sanitizeNavIncidentNote(note);
  if (!clean) return null;
  const when = at != null && String(at).trim() ? String(at) : new Date().toISOString();
  return {
    kind: NAV_INCIDENT_KIND,
    at: when,
    note: clean,
    context: slimNavIncidentContext(ctx),
  };
}

/**
 * @param {ReturnType<typeof buildNavIncident>} incident
 * @returns {string[]}
 */
export function formatNavIncidentLines(incident) {
  if (!incident || incident.kind !== NAV_INCIDENT_KIND) return [];
  return [
    `--- Nav incident ${incident.at || ""} ---`,
    `Note: ${incident.note || ""}`,
    ...formatNavIncidentContextLines(incident.context || {}),
  ];
}

/**
 * @param {object[]} ring
 * @param {object} incident
 * @param {{ maxEntries?: number }} [opts]
 * @returns {object[]}
 */
export function appendNavIncident(ring, incident, opts = {}) {
  const prev = Array.isArray(ring) ? ring : [];
  if (!incident || incident.kind !== NAV_INCIDENT_KIND) return prev.slice();
  const max = opts.maxEntries ?? NAV_INCIDENT_RING_MAX;
  const next = [...prev, incident];
  if (next.length > max) return next.slice(next.length - max);
  return next;
}

/**
 * @param {object[]} incidents
 * @returns {string[]}
 */
export function formatNavIncidentsDigest(incidents) {
  const rows = Array.isArray(incidents) ? incidents : [];
  if (!rows.length) return ["--- Nav incidents ---", "(none this session)"];
  const lines = ["--- Nav incidents (newest last) ---"];
  for (const inc of rows) {
    lines.push(...formatNavIncidentLines(inc), "");
  }
  return lines;
}

/**
 * @param {object} incident
 * @returns {string}
 */
export function serializeNavIncidentLine(incident) {
  return `${JSON.stringify(incident)}\n`;
}
