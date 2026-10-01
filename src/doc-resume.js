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

/**
 * Vanilla → Doc on the document the ERP view is already showing: read that form instead of
 * reloading it. A reload drops an unsaved draft from Frappe's memory — the clerk's Vanilla
 * typing — and, with the will-prevent-unload guard, asks them to discard it. Same record only:
 * a generic `/new` target means "a fresh blank draft", never the draft that happens to be open.
 *
 * @param {string} liveRoute where the ERP view is (URL or path)
 * @param {string} targetRoute where the Doc skin is opening
 * @param {string} [erpBase]
 */
export function opensInPlace(liveRoute, targetRoute, erpBase) {
  if (!liveRoute || !targetRoute) return false;
  if (isGenericNewDocRoute(targetRoute, erpBase)) return false;
  const live = normalizeAppRoute(liveRoute, erpBase);
  const target = normalizeAppRoute(targetRoute, erpBase);
  if (!live.doctype || live.doctype !== target.doctype) return false;
  if (!live.record || !target.record) return false;
  const dec = (r) => {
    try {
      return decodeURIComponent(r);
    } catch {
      return r;
    }
  };
  return dec(live.record) === dec(target.record);
}

/**
 * Did the clerk leave work on a form the Doc skin just picked up in place? Frappe calls every
 * new draft unsaved from birth (`__unsaved`), so `is_dirty()` alone would make an untouched
 * blank form ask "save or discard?" on the way out. A new draft counts once it holds something
 * a clerk typed and would miss: a party, or a line with an item.
 *
 * @param {Record<string, any>|null|undefined} doc
 * @param {{ isDirty?: boolean, isNew?: boolean, partyField?: string }} s
 */
export function carriesClerkEdits(doc, s) {
  const st = s || {};
  if (!doc || !st.isDirty) return false;
  if (!st.isNew) return true;
  const fields = st.partyField ? [st.partyField] : ["supplier", "customer", "party"];
  if (fields.some((f) => doc[f] != null && String(doc[f]).trim() !== "")) return true;
  const lines = Array.isArray(doc.items) ? doc.items : [];
  return lines.some((row) => row && row.item_code);
}
