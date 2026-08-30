/**
 * Source-document terms for AP skins — collect PO/PR refs from line links; format readonly blocks.
 */

import { plainTermsText } from "./doc-terms-fields.js";

/** @typedef {{ kind: "po"|"pr", name: string }} SourceDocRef */

/**
 * @param {object|null|undefined} doc
 * @returns {SourceDocRef[]}
 */
export function collectBillSourceRefs(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  /** @type {SourceDocRef[]} */
  const out = [];
  const seen = new Set();
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    for (const pair of [
      ["po", it.purchase_order],
      ["pr", it.purchase_receipt],
    ]) {
      const kind = /** @type {"po"|"pr"} */ (pair[0]);
      const name = pair[1] != null ? String(pair[1]).trim() : "";
      const key = `${kind}:${name}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({ kind, name });
    }
  }
  return out;
}

/**
 * @param {object|null|undefined} doc
 * @returns {SourceDocRef[]}
 */
export function collectReceiptSourceRefs(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  /** @type {SourceDocRef[]} */
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const name = it && it.purchase_order != null ? String(it.purchase_order).trim() : "";
    const key = `po:${name}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "po", name });
  }
  return out;
}

/**
 * @param {"bill"|"receipt"|string|null|undefined} profileId
 * @param {object|null|undefined} doc
 * @returns {SourceDocRef[]}
 */
export function collectSourceRefsForProfile(profileId, doc) {
  const id = String(profileId || "").trim();
  if (id === "receipt") return collectReceiptSourceRefs(doc);
  if (id === "bill") return collectBillSourceRefs(doc);
  return [];
}

/**
 * @param {SourceDocRef} ref
 * @returns {string}
 */
export function sourceRefLabel(ref) {
  if (!ref || !ref.name) return "";
  if (ref.kind === "po") return `PO ${ref.name}`;
  if (ref.kind === "pr") return `Item Receipt ${ref.name}`;
  return ref.name;
}

/**
 * @param {SourceDocRef} ref
 * @returns {string}
 */
export function sourceRefKey(ref) {
  return ref && ref.kind && ref.name ? `${ref.kind}:${ref.name}` : "";
}

/**
 * @param {SourceDocRef[]} refs
 * @param {Record<string, string>|null|undefined} termsByKey kind:name → plain text
 * @returns {string}
 */
export function formatSourceTermsReadonly(refs, termsByKey) {
  const list = Array.isArray(refs) ? refs : [];
  const map = termsByKey && typeof termsByKey === "object" ? termsByKey : {};
  /** @type {string[]} */
  const blocks = [];
  for (const ref of list) {
    const key = sourceRefKey(ref);
    const text = plainTermsText(map[key]);
    if (!text) continue;
    blocks.push(`${sourceRefLabel(ref)}:\n${text}`);
  }
  return blocks.join("\n\n");
}

/**
 * @param {SourceDocRef[]} refs
 * @returns {boolean}
 */
export function hasSourceTermsToShow(refs, termsByKey) {
  return formatSourceTermsReadonly(refs, termsByKey).length > 0;
}
