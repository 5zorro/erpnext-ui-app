/**
 * Shared "which number leads" wiring for Doc skins (OI-170, DF-01 E). Bill and doc-form controllers
 * call this the way they call wireDocCapsUi: one button in the File group, one identity line in the
 * banner. The setting itself is app-wide and lives in main; main broadcasts a change as a
 * `doc-number-lead` window event so every open page follows it.
 */

import {
  DEFAULT_NUMBER_LEAD,
  docNumbers,
  flipNumberLead,
  normalizeNumberLead,
  numberLeadButtonLabel,
} from "./doc-number-pref.js";

/**
 * @param {{
 *   api: { getNumberLead?: () => Promise<unknown>, setNumberLead?: (lead: string) => Promise<unknown> }|null,
 *   button: HTMLElement|null,
 *   identEl: HTMLElement|null,
 *   getDoctypeKey: () => string,
 *   getDoc: () => Record<string, unknown>|null,
 * }} opts
 * @returns {{ paint: () => void }}
 */
export function wireDocNumberLead({ api, button, identEl, getDoctypeKey, getDoc }) {
  let lead = DEFAULT_NUMBER_LEAD;

  function paint() {
    const key = getDoctypeKey();
    if (button) {
      button.textContent = numberLeadButtonLabel(key, lead);
      button.title =
        "Which number leads on every page — the vendor's / customer's own number, or ERPNext's ID. " +
        "The other is always shown beside it. ERPNext's ID changes on every void-and-amend; theirs does not.";
    }
    if (!identEl) return;
    const doc = getDoc();
    const n = docNumbers(key, doc, lead);
    if (!doc || (!n.primary.value && !(n.secondary && n.secondary.value))) {
      identEl.hidden = true;
      identEl.textContent = "";
      return;
    }
    identEl.hidden = false;
    identEl.textContent = "";
    const main = document.createElement("strong");
    main.className = "doc-ident-primary";
    main.dataset.testid = "doc-ident-primary";
    main.textContent = n.primary.value;
    main.title = n.primary.label;
    identEl.append(main);
    if (n.secondary) {
      const other = document.createElement("span");
      other.className = "doc-ident-secondary";
      other.dataset.testid = "doc-ident-secondary";
      other.textContent = `${n.secondary.label}: ${n.secondary.value || "—"}`;
      identEl.append(other);
    }
  }

  if (button) {
    button.addEventListener("click", async () => {
      const next = flipNumberLead(lead);
      lead = next;
      paint();
      try {
        if (api && api.setNumberLead) lead = normalizeNumberLead(await api.setNumberLead(next));
      } catch {
        /* keep the local flip; it is only a display setting */
      }
      paint();
    });
  }

  window.addEventListener("doc-number-lead", (ev) => {
    lead = normalizeNumberLead(/** @type {CustomEvent} */ (ev).detail);
    paint();
  });

  if (api && api.getNumberLead) {
    api
      .getNumberLead()
      .then((v) => {
        lead = normalizeNumberLead(v);
        paint();
      })
      .catch(() => {});
  }
  paint();
  return { paint };
}
