/**
 * Museum OI-200 (5zorro's option A): the page half of a vendor switch, shared by the Bill
 * (`bill-form-page.js`) and the PO / Item Receipt page (`doc-form-page.js`). Before a new vendor
 * is set, main warns (Keep is the default) when the clerk has typed anything, then clears the
 * whole document; the first pick on a document with no vendor clears nothing. Decisions and
 * wording: `vendor-change.js`.
 */

/**
 * @param {{
 *   api: { clearForVendorChange?: (v: string) => Promise<any> } | null | undefined,
 *   value: string,
 *   box: HTMLInputElement | null | undefined,
 *   kept: string,
 *   docLabel: string,
 *   setStatus: (text: string, kind?: string) => void,
 *   log: (event: string, detail: string) => void,
 *   onCleared: (res: { doc: object, amountDue?: string, scratch?: object }) => void,
 * }} o `kept`: the vendor the box showed before the pick; `onCleared` repaints the cleared document
 * @returns {Promise<boolean>} false when the clerk kept the old vendor, the clear failed, or a
 *   newer pick overtook this one (`superseded`, main's `queuedVendorWrite`): the caller then sets no
 *   vendor
 */
export async function clearBeforeVendorSwitch(o) {
  if (!o.api || !o.api.clearForVendorChange) return true;
  let res;
  try {
    res = await o.api.clearForVendorChange(o.value);
  } catch (e) {
    res = { ok: false, reason: `Could not clear the ${o.docLabel} for the new vendor: ${String((e && e.message) || e)}` };
  }
  if (res && res.ok && !res.cleared) return true;
  if (res && res.superseded) {
    // A newer pick owns the box and the document: say nothing, touch nothing.
    o.log("vendor-switch", "superseded");
    return false;
  }
  if (!res || !res.ok) {
    if (o.box) o.box.value = (res && res.supplier) || o.kept;
    if (res && res.kept) o.setStatus(`Kept ${res.supplier || o.kept}; nothing cleared.`);
    else o.setStatus((res && res.reason) || `Could not clear the ${o.docLabel} for the new vendor.`, "err");
    o.log("vendor-switch", res && res.kept ? "kept" : `failed: ${(res && res.reason) || ""}`);
    return false;
  }
  o.log("vendor-switch", "cleared");
  o.onCleared(res);
  if (o.box) o.box.value = o.value;
  return true;
}
