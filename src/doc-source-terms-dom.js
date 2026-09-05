/**
 * DOM paint for per-source terms/remarks blocks (Doc wash + labeled fields).
 */

import { setWashSourceAttr } from "./doc-wash.js";

/**
 * @typedef {import("./doc-source-terms.js").SourceTermsDisplayBlock} SourceTermsDisplayBlock
 */

/**
 * @param {HTMLElement|null|undefined} container
 * @param {SourceTermsDisplayBlock[]} blocks
 */
export function paintSourceTermsFields(container, blocks) {
  if (!container) return;
  container.replaceChildren();
  const list = Array.isArray(blocks) ? blocks : [];
  for (const block of list) {
    if (!block || !block.text) continue;
    const field = document.createElement("div");
    field.className = "field source-terms-field";

    const label = document.createElement("label");
    label.textContent = block.label || "Terms";
    if (block.title) label.title = block.title;

    const body = document.createElement("textarea");
    body.readOnly = true;
    body.tabIndex = -1;
    body.className = "source-terms-ro";
    body.value = block.text;
    const lineCount = block.text.split("\n").length;
    body.rows = Math.min(8, Math.max(2, lineCount + 1));
    if (block.testId) body.dataset.testid = block.testId;
    if (block.title) body.title = block.title;
    setWashSourceAttr(body, block.washRole);

    field.append(label, body);
    container.append(field);
  }
}
