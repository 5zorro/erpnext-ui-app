/**
 * Shared ALL-CAPS UI wiring for Doc skins (OI-111).
 * Bill and doc-form controllers use the same toggle + input listener.
 */

import {
  docCapsButtonLabel,
  docCapsButtonTitle,
  toggleDocCaps,
  shouldForceCapsOnElement,
  applyDocCapsValue,
} from "./doc-caps.js";

/**
 * @param {{ capsButton: HTMLElement|null, getCapsOn: () => boolean, setCapsOn: (next: boolean) => void, root?: Document|null }} opts
 * @returns {{ syncCapsButton: () => void }}
 */
export function wireDocCapsUi({ capsButton, getCapsOn, setCapsOn, root = document }) {
  function syncCapsButton() {
    if (!capsButton) return;
    capsButton.textContent = docCapsButtonLabel(getCapsOn());
    capsButton.title = docCapsButtonTitle(getCapsOn());
  }

  syncCapsButton();

  if (capsButton) {
    capsButton.addEventListener("click", () => {
      setCapsOn(toggleDocCaps(getCapsOn()));
      syncCapsButton();
    });
  }

  if (root) {
    root.addEventListener(
    "input",
    (ev) => {
      const t = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (ev.target);
      if (!shouldForceCapsOnElement(getCapsOn(), t)) return;
      const s = t.selectionStart;
      const en = t.selectionEnd;
      const up = applyDocCapsValue(t.value, true);
      if (up === t.value) return;
      t.value = up;
      try {
        if (typeof s === "number" && typeof en === "number") t.setSelectionRange(s, en);
      } catch {
        /* ignore */
      }
    },
      true,
    );
  }

  return { syncCapsButton };
}
