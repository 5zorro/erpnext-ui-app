/**
 * Rolling focus debug ring — pure; no field values / keystrokes.
 * @see docs/bug-bounty-source-modal-vendor-pick.md (focus class)
 */

/**
 * @typedef {{
 *   tag?: string,
 *   id?: string,
 *   field?: string,
 *   testid?: string,
 *   role?: string,
 *   connected?: boolean,
 *   readOnly?: boolean,
 *   tabIndex?: number|null,
 *   summary?: string,
 * }} FocusActiveSummary
 */

/**
 * @typedef {{
 *   at: string,
 *   event: string,
 *   surfaceMode?: string,
 *   surface?: string,
 *   currentRoute?: string,
 *   detail?: string,
 *   active?: FocusActiveSummary|null,
 * }} FocusDebugEntry
 */

/**
 * @param {Element|null|undefined} el
 * @returns {FocusActiveSummary|null}
 */
export function summarizeActiveElement(el) {
  if (!el) return null;
  const tag = el.tagName || "?";
  if (tag === "BODY" || (typeof el.nodeName === "string" && el.nodeName.toUpperCase() === "BODY")) {
    return { tag: "BODY", summary: "BODY" };
  }
  if (!(typeof el.getAttribute === "function")) return null;
  const id = el.id ? String(el.id) : "";
  const field =
    el.getAttribute && el.getAttribute("data-field")
      ? String(el.getAttribute("data-field"))
      : "";
  const testid =
    el.getAttribute && el.getAttribute("data-testid")
      ? String(el.getAttribute("data-testid"))
      : "";
  const role = el.getAttribute && el.getAttribute("role") ? String(el.getAttribute("role")) : "";
  const connected = el.isConnected === true;
  const readOnly = "readOnly" in el ? !!/** @type {HTMLInputElement} */ (el).readOnly : false;
  let tabIndex = null;
  if ("tabIndex" in el) {
    const n = Number(/** @type {HTMLElement} */ (el).tabIndex);
    tabIndex = Number.isFinite(n) ? n : null;
  }
  const parts = [tag];
  if (field) parts.push(`field=${field}`);
  else if (testid) parts.push(`testid=${testid}`);
  else if (id) parts.push(`id=${id}`);
  if (role) parts.push(`role=${role}`);
  if (!connected) parts.push("detached");
  if (readOnly) parts.push("ro");
  if (tabIndex != null && tabIndex < 0) parts.push(`tab=${tabIndex}`);
  return {
    tag,
    id,
    field,
    testid,
    role,
    connected,
    readOnly,
    tabIndex,
    summary: parts.join(" "),
  };
}

/**
 * @param {FocusDebugEntry[]} entries
 * @param {FocusDebugEntry} entry
 * @param {{ maxEntries?: number }} [opts]
 * @returns {FocusDebugEntry[]}
 */
export function appendFocusDebug(entries, entry, opts = {}) {
  const prev = Array.isArray(entries) ? entries : [];
  if (!entry || !entry.at || !entry.event) return prev.slice();
  const maxEntries = opts.maxEntries ?? 60;
  const next = [...prev, entry];
  if (next.length > maxEntries) return next.slice(next.length - maxEntries);
  return next;
}

/**
 * @param {FocusActiveSummary|null|undefined} active
 * @returns {string}
 */
export function formatFocusActive(active) {
  if (!active) return "";
  if (active.summary) return String(active.summary);
  return active.tag || "?";
}

/**
 * @param {FocusDebugEntry[]} entries
 * @returns {string[]}
 */
export function formatFocusDebugLines(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) return ["--- Focus debug ---", "(no focus events yet this session)"];
  const lines = ["--- Focus debug (newest last; paste with Focus issue / DB diagnose) ---"];
  for (const e of rows) {
    const t = e.at ? e.at.slice(11, 19) : "??:??:??";
    const surf = e.surfaceMode != null ? e.surfaceMode : "?";
    const src = e.surface ? `/${e.surface}` : "";
    const detail = e.detail != null && String(e.detail).trim() ? ` | ${e.detail}` : "";
    const active = e.active ? ` → ${formatFocusActive(e.active)}` : "";
    lines.push(`${t} [${surf}${src}] ${e.event}${detail}${active}`);
  }
  return lines;
}
