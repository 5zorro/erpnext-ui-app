/**
 * Purchase Order list Find prefill — logbook # (`title`) preferred over ERP `name` (OI-154).
 */

/**
 * @param {{ name?: string|null, title?: string|null, logbook?: string|null }} ctx
 * @returns {{ title?: string, name?: string }|null}
 */
export function poFindPrefillFromLogbook(ctx = {}) {
  const title = String(ctx.title ?? ctx.logbook ?? "").trim();
  const name = String(ctx.name ?? "").trim();
  if (title) return { title };
  if (name) return { name };
  return null;
}

/**
 * Standard-filter fields to set on PO list Find (may be multiple).
 * @param {{ title?: string, name?: string }|null|undefined} prefill
 * @returns {Record<string, string>}
 */
export function poFindListFilterPayload(prefill) {
  if (!prefill || typeof prefill !== "object") return {};
  /** @type {Record<string, string>} */
  const out = {};
  const title = prefill.title != null ? String(prefill.title).trim() : "";
  const name = prefill.name != null ? String(prefill.name).trim() : "";
  if (title) out.title = title;
  else if (name) out.name = name;
  return out;
}

/**
 * Prefill for PO Find from the open PO doc (logbook title preferred).
 * @param {object|null|undefined} doc
 * @returns {{ title?: string, name?: string }|null}
 */
export function poFindPrefillFromDoc(doc) {
  if (!doc || typeof doc !== "object") return null;
  return poFindPrefillFromLogbook({
    name: doc.name,
    title: doc.title,
  });
}
