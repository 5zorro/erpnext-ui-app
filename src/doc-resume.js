/**
 * Resuming a parked Doc skin (after a setup peek, or the Doc tab from Vanilla).
 *
 * The park remembers an address. When that address is the generic `/app/<doctype>/new`,
 * asking Frappe for it again makes a *fresh* blank draft — while the skin would paint the
 * copy of the old draft the shell kept. So a generic park is resumed by the draft's own name
 * (`new-purchase-invoice-…`), which Frappe still holds in memory (`locals`) and reopens as-is
 * (`formview.js` `fetch_and_render`). If Frappe no longer has it, it makes a new draft under a
 * different name, which `resumeDocMatches` catches.
 */

import { normalizeAppRoute, isGenericNewDocRoute } from "./route-info.js";

/**
 * @param {string} parkRoute the parked address
 * @param {{ name?: unknown, doctype?: unknown }|null|undefined} doc the shell's copy of the draft
 * @param {string} expectedDoctype the skin's doctype title, e.g. "Purchase Invoice"
 * @param {string} [erpBase]
 * @returns {string} the address to reopen
 */
export function resolveResumeRoute(parkRoute, doc, expectedDoctype, erpBase) {
  const route = typeof parkRoute === "string" ? parkRoute : "";
  if (!isGenericNewDocRoute(route, erpBase)) return route;
  const name = doc && doc.name != null ? String(doc.name).trim() : "";
  const doctype = doc && doc.doctype != null ? String(doc.doctype) : "";
  if (!name || name === "new") return route;
  if (expectedDoctype && doctype && doctype !== expectedDoctype) return route;
  const slug = normalizeAppRoute(route, erpBase).doctype;
  if (!slug) return route;
  return `/app/${slug}/${encodeURIComponent(name)}`;
}

/**
 * Did Frappe reopen the draft the shell parked, or something else?
 * A draft saved while parked is renamed (`new-…` → `ACC-PINV-…`); Frappe maps the old name in
 * `frappe.model.new_names`, so the caller passes that mapping when it has it.
 *
 * @param {string} expectedName
 * @param {string} liveName
 * @param {Record<string, string>} [newNames]
 */
export function resumeDocMatches(expectedName, liveName, newNames) {
  const want = expectedName == null ? "" : String(expectedName);
  const got = liveName == null ? "" : String(liveName);
  if (!want) return true;
  if (want === got) return true;
  return !!(newNames && newNames[want] && newNames[want] === got);
}

/**
 * The "route-hold" fallback parks a Bill when the shell's own state says a Doc Bill is in
 * flight but the surface flag has drifted (Recent flyout reporting `home`, OI-112 strike 2).
 * On Vanilla the clerk is looking at the Vanilla form itself — there is no Doc surface to hold,
 * and the shell's copy may be from an earlier Doc session, so parking it would later paint a
 * stale draft over the live one.
 *
 * @param {{ surfaceMode?: string, routeDoctype?: string, hasDirtyDoc?: boolean }} s
 */
export function shouldHoldBillPark(s) {
  const st = s || {};
  if (st.surfaceMode === "erp") return false;
  return st.routeDoctype === "purchase-invoice" && !!st.hasDirtyDoc;
}
