/**
 * doc-form.html runs one of two page controllers, chosen once per page load
 * (`doc-form-boot.js`): the Bill's own (`bill-form-page.js`) or the shared PO/IR/A-R one
 * (`doc-form-page.js`). Switching between the two needs a page reload; switching within one
 * does not. Every door that changes the active Doc skin asks this one rule.
 */

/**
 * @param {string|null|undefined} skinId
 * @returns {"bill"|"doc-form"}
 */
export function docShellKind(skinId) {
  return skinId === "bill" ? "bill" : "doc-form";
}

/**
 * True when the page loaded for `priorSkin` cannot paint `nextSkin` without a reload.
 * No prior skin means the page has not booted a controller yet — it boots on the next one.
 * @param {string|null|undefined} priorSkin
 * @param {string|null|undefined} nextSkin
 */
export function needsDocShellReload(priorSkin, nextSkin) {
  if (!priorSkin || !nextSkin) return false;
  return docShellKind(priorSkin) !== docShellKind(nextSkin);
}
