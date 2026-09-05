/**
 * Source-document terms for AP skins — collect PO/PR refs from line links; format readonly blocks.
 */

import { plainTermsText } from "./doc-terms-fields.js";
import { washRoleForSourceKind } from "./doc-wash.js";

/** @typedef {{ kind: "po"|"pr", name: string }} SourceDocRef */
/** @typedef {{ label: string, text: string, washRole: import("./doc-wash.js").DocWashRole|null, testId: string, title?: string }} SourceTermsDisplayBlock */

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
 * @param {Record<string, string>|null|undefined} [remarksByKey] kind:name → plain remarks (PR)
 * @returns {string}
 */
/**
 * @param {SourceDocRef[]} refs
 * @param {Record<string, string>|null|undefined} termsByKey
 * @param {Record<string, string>|null|undefined} [remarksByKey]
 * @returns {SourceTermsDisplayBlock[]}
 */
export function sourceTermsDisplayBlocks(refs, termsByKey, remarksByKey) {
  const list = Array.isArray(refs) ? refs : [];
  const termsMap = termsByKey && typeof termsByKey === "object" ? termsByKey : {};
  const remarksMap = remarksByKey && typeof remarksByKey === "object" ? remarksByKey : {};
  const poCount = list.filter((r) => r.kind === "po").length;
  const prCount = list.filter((r) => r.kind === "pr").length;
  let poIdx = 0;
  let prIdx = 0;
  /** @type {SourceTermsDisplayBlock[]} */
  const blocks = [];

  for (const ref of list) {
    const key = sourceRefKey(ref);
    const washRole = washRoleForSourceKind(ref.kind);
    const terms = plainTermsText(termsMap[key]);
    const remarks = plainTermsText(remarksMap[key]);

    if (terms) {
      if (ref.kind === "po") {
        poIdx += 1;
        const suffix = poCount > 1 ? ` (${poIdx})` : "";
        blocks.push({
          label: `PO terms${suffix}`,
          text: terms,
          washRole,
          testId: `source-terms-po-${ref.name}`,
          title: `Terms from ${sourceRefLabel(ref)}. Read-only.`,
        });
      } else if (ref.kind === "pr") {
        prIdx += 1;
        const suffix = prCount > 1 ? ` (${prIdx})` : "";
        blocks.push({
          label: `Item Receipt terms${suffix}`,
          text: terms,
          washRole,
          testId: `source-terms-pr-${ref.name}`,
          title: `Terms from ${sourceRefLabel(ref)}. Read-only.`,
        });
      }
    }

    if (ref.kind === "pr" && remarks) {
      const suffix = prCount > 1 ? ` (${prIdx})` : "";
      blocks.push({
        label: `Item Receipt remarks${suffix}`,
        text: remarks,
        washRole,
        testId: `source-remarks-pr-${ref.name}`,
        title: `Remarks from ${sourceRefLabel(ref)}. Read-only.`,
      });
    }
  }

  return blocks;
}

export function formatSourceTermsReadonly(refs, termsByKey, remarksByKey) {
  return sourceTermsDisplayBlocks(refs, termsByKey, remarksByKey)
    .map((b) => `${b.label}:\n${b.text}`)
    .join("\n\n");
}

/**
 * @param {SourceDocRef[]} refs
 * @param {Record<string, string>|null|undefined} termsByKey
 * @param {Record<string, string>|null|undefined} [remarksByKey]
 * @returns {boolean}
 */
export function hasSourceTermsToShow(refs, termsByKey, remarksByKey) {
  return sourceTermsDisplayBlocks(refs, termsByKey, remarksByKey).length > 0;
}
