/**
 * Leaving a Vanilla page that has unsaved changes.
 *
 * A Frappe form that goes dirty adds a `beforeunload` listener (`form.js` `dirty()`). A browser
 * answers it by asking the clerk "Leave site?". Electron asks nobody: unless the app handles
 * `will-prevent-unload`, the load is cancelled silently and the shell sits waiting for a page
 * that never comes (nav incident 2026-10-01T03:52).
 *
 * The shell has its own unsaved-changes check for Doc skins. When that check has just passed —
 * the Doc skin was clean, or the clerk answered its prompt — Frappe's listener is a second
 * question about the same edits, so the load goes through. Otherwise the edits were typed in
 * Vanilla, and the clerk is asked, as a browser would.
 */

/** How long a passed shell check covers the loads that follow it (one open can load twice). */
export const ERP_UNLOAD_CLEAR_MS = 20000;

/**
 * @param {{ clearedAt?: number, now: number, windowMs?: number }} s
 * @returns {"allow"|"ask"}
 */
export function decideErpUnload(s) {
  const clearedAt = Number(s && s.clearedAt) || 0;
  const now = Number(s && s.now) || 0;
  const windowMs = s && s.windowMs != null ? Number(s.windowMs) : ERP_UNLOAD_CLEAR_MS;
  if (clearedAt > 0 && now >= clearedAt && now - clearedAt <= windowMs) return "allow";
  return "ask";
}

/** Button 0 is the safe answer: Enter, Esc and closing the box all keep the edits. */
export const ERP_UNLOAD_STAY = 0;
export const ERP_UNLOAD_LEAVE = 1;

/**
 * `dialog.showMessageBoxSync` options. Frappe's listener does not say which form it belongs to,
 * so the box names the page the ERP view is on (usually that form) as "last page", not as fact.
 * @param {{ pageLabel?: string }} [opts]
 * @returns {{ type: string, title: string, message: string, detail: string, buttons: string[], defaultId: number, cancelId: number, noLink: boolean }}
 */
export function erpUnloadDialogSpec(opts = {}) {
  const page = opts && opts.pageLabel ? String(opts.pageLabel).trim() : "";
  return {
    type: "warning",
    title: "Unsaved changes",
    message: "A document you were editing has changes that are not saved.",
    detail:
      (page ? `Last page: ${page}\n\n` : "") +
      "Leaving discards them. Stay to go back and save first (Ctrl+S), " +
      "or leave and discard them.",
    buttons: ["Stay and keep them", "Leave and discard"],
    defaultId: ERP_UNLOAD_STAY,
    cancelId: ERP_UNLOAD_STAY,
    noLink: true,
  };
}

/**
 * "Bill — new-purchase-invoice-abc" from a route; the record is decoded for reading.
 * @param {{ doctype?: string, record?: string }} info
 * @param {Record<string, string>} [labels] doctype slug → clerk label
 */
export function erpUnloadPageLabel(info, labels = {}) {
  const slug = info && info.doctype ? String(info.doctype) : "";
  if (!slug) return "";
  const label =
    (labels && labels[slug]) ||
    slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  let record = info && info.record ? String(info.record) : "";
  try {
    record = decodeURIComponent(record);
  } catch {
    /* keep as typed */
  }
  return record ? `${label} — ${record}` : label;
}

/** @param {number} response */
export function isLeaveChoice(response) {
  return response === ERP_UNLOAD_LEAVE;
}
