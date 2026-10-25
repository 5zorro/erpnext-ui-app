/**
 * Plan 2026-10-21 D2 / review 10-19 R5b-5: the page half of "this vendor is not in ERPNext",
 * shared by the Bill (`bill-form-page.js`) and the PO / Item Receipt (`doc-form-page.js`) so the
 * two do not drift (R6a-1). Wording and decisions are in `missing-vendor.js`.
 */

import { missingVendorBannerText, vendorBoxMayRevert } from "./missing-vendor.js";
import { normalizeEditableText } from "./dirty-gate.js";

const BANNER_ID = "doc-missing-vendor";

/** A banner across the top while the vendor named is not in ERPNext. @param {string} text */
export function showMissingVendorBanner(text) {
  let b = document.getElementById(BANNER_ID);
  if (!b) {
    b = document.createElement("div");
    b.id = BANNER_ID;
    b.className = "doc-alert-banner";
    b.setAttribute("role", "alert");
    b.dataset.testid = BANNER_ID;
    b.innerHTML = `<span class="doc-alert-text"></span><button type="button" class="doc-alert-close" tabindex="-1" title="Dismiss">×</button>`;
    /** @type {HTMLElement} */ (b.querySelector(".doc-alert-close")).onclick = () => hideMissingVendorBanner();
    const head = document.querySelector("#doc-chrome .banner");
    if (head && head.parentNode) head.parentNode.insertBefore(b, head.nextSibling);
    else document.body.prepend(b);
  }
  /** @type {HTMLElement} */ (b.querySelector(".doc-alert-text")).textContent = text;
  b.hidden = false;
}

export function hideMissingVendorBanner() {
  const b = document.getElementById(BANNER_ID);
  if (b) b.hidden = true;
}

/**
 * While a vendor write is out, notice whether the clerk types somewhere else (D2's late guard:
 * `lateVendorMayOpenSources`' `typedElsewhere`). Call `stop()` when the write answers.
 * @param {Element|null} vendorBox
 * @returns {{ typed: () => boolean, stop: () => void }}
 */
export function watchTypingElsewhere(vendorBox) {
  let typed = false;
  /** @param {KeyboardEvent} ev */
  const note = (ev) => {
    if (ev.target !== vendorBox && ev.key && ev.key.length === 1) typed = true;
  };
  document.addEventListener("keydown", note, true);
  return {
    typed: () => typed,
    stop: () => document.removeEventListener("keydown", note, true),
  };
}

/** @param {Element|null} vendorBox is focus in another field (not the vendor box, not a button)? */
export function focusIsInOtherField(vendorBox) {
  const active = document.activeElement;
  return !!active && active !== vendorBox && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || "");
}

/**
 * Ask ERPNext (live, not the warm copy) whether this vendor exists. A missing one gets the banner,
 * and on a vendor write the box goes back to the document's vendor — unless the clerk typed in it
 * since; "could not tell" never blocks.
 * @param {{
 *   api: { linkExists?: (doctype: string, name: string) => Promise<{ exists?: boolean|null }> } | null,
 *   name: string,
 *   attempt: "vendor"|"sources",
 *   doc?: string,
 *   box: HTMLInputElement|null,
 *   kept: string,
 *   log: (event: string, detail: string) => void,
 *   setStatus: (text: string, kind?: string) => void,
 * }} o
 * @returns {Promise<boolean>} true when the vendor is missing
 */
export async function vendorIsMissing(o) {
  const n = normalizeEditableText(o.name);
  if (!n || !o.api || !o.api.linkExists) return false;
  const r = await o.api.linkExists("Supplier", n);
  if (!r || r.exists !== false) return false;
  o.log("vendor-missing", `${o.attempt}:${n.slice(0, 60)}`);
  showMissingVendorBanner(missingVendorBannerText(n, o.attempt, o.doc ? { doc: o.doc } : {}));
  if (o.attempt === "vendor" && o.box && vendorBoxMayRevert(n, o.box.value)) {
    o.box.value = o.kept;
    o.box.dataset.linkCommitted = o.kept;
  }
  o.setStatus(`Vendor “${n}” is not in ERPNext.`, "err");
  return true;
}
