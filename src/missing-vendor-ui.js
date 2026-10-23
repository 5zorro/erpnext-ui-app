/**
 * Plan 2026-10-21 D2 / review 10-19 R5b-5: the page half of "this vendor is not in ERPNext",
 * shared by the Bill (`bill-form-page.js`) and the PO / Item Receipt (`doc-form-page.js`) so the
 * two do not drift (R6a-1). Wording and decisions are in `bill-missing-vendor.js`.
 */

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
