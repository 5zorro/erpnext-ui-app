/**
 * A text date box (`src/doc-date.js`: not <input type=date>, so Tab leaves in one key) takes only
 * digits and / - . — as typed, dropped or pasted. Written once for every Doc form page (plan
 * 2026-10-25, R6a-1 step 1).
 */

import { filterDateInputValue, isAllowedDateInputChar } from "./doc-date.js";

/** @param {HTMLInputElement} input */
export function wireDateField(input) {
  input.addEventListener("beforeinput", (ev) => {
    if (ev.inputType && ev.inputType.startsWith("delete")) return;
    if (ev.inputType === "insertFromPaste" || ev.inputType === "insertFromDrop") return;
    if (ev.data && [...ev.data].some((c) => !isAllowedDateInputChar(c))) {
      ev.preventDefault();
    }
  });
  input.addEventListener("input", () => {
    const filtered = filterDateInputValue(input.value);
    if (filtered !== input.value) {
      const pos = input.selectionStart;
      input.value = filtered;
      try {
        input.setSelectionRange(pos - 1, pos - 1);
      } catch {
        /* ignore */
      }
    }
  });
  input.addEventListener("paste", (ev) => {
    ev.preventDefault();
    const text = filterDateInputValue(ev.clipboardData.getData("text") || "");
    document.execCommand("insertText", false, text);
  });
}
