/**
 * DC-4 (plan 2026-10-24, 5zorro chose A — match Vanilla): the ERPNext page reloaded under a Doc page.
 *
 * Vanilla keeps nothing across a reload, and nor does the shell: what was typed and not saved is
 * gone. The shell cannot ask first — it never reloads the ERPNext page itself; ERPNext does (an
 * expired session, a new version, a crash), and Chromium skips Frappe's "leave?" for typing done in
 * the Doc page (G23). So it says so after, and repaints the Doc page from the reloaded form: never
 * the stale typing, never the dead `new-…` name.
 *
 * Pure: is this load a reload under the Doc page, and what to say.
 */
import { normalizeAppRoute, isNewDocRecord } from "./route-info.js";

/**
 * @param {{
 *   surfaceMode: string,
 *   shellLoading: boolean,   the shell started this load (its load waiter is set)
 *   shellLoadFrom?: string,  the surface the shell's load was started from
 *   docRoute: string,        the route the Doc page is showing
 *   loadedUrl: string,       what the ERPNext page committed
 *   userEdited: boolean,     unsaved typing on the Doc page
 *   midSave?: boolean,       a Save from the Doc page was under way (it may or may not have landed)
 *   docLabel?: string,       "bill", "purchase order", …
 *   erpBase?: string,
 * }} s
 * @returns {{ doctype: string, typed: boolean, wasNew: boolean, notice: string } | null}
 */
export function erpReloadUnderDoc(s) {
  if (!s || s.surfaceMode !== "doc") return null;
  // The Doc page's own load: it paints what it asked for.
  if (s.shellLoading && s.shellLoadFrom === "doc") return null;
  const doc = normalizeAppRoute(s.docRoute || "", s.erpBase);
  const loaded = normalizeAppRoute(s.loadedUrl || "", s.erpBase);
  // A reload of that form: the same doctype comes back (a new document under a new `new-…` name).
  if (!doc.doctype || !doc.record || loaded.doctype !== doc.doctype) return null;
  // A load the shell started from Vanilla or Home that lands after the clerk is already on the Doc
  // page (Doc tab clicked at once): it cut off the page's own reads, which left no lines (nav matrix
  // N-7). Nothing typed was lost — the open was gated — so repaint, say nothing.
  if (s.shellLoading) return { doctype: doc.doctype, typed: false, wasNew: isNewDocRecord(doc.record), notice: "" };
  const typed = !!s.userEdited;
  const wasNew = isNewDocRecord(doc.record);
  const midSave = !!s.midSave;
  return { doctype: doc.doctype, typed, wasNew, notice: reloadNotice({ typed, wasNew, midSave, name: doc.record, docLabel: s.docLabel }) };
}

/**
 * @param {{ typed: boolean, wasNew: boolean, midSave?: boolean, name?: string, docLabel?: string }} r
 * @returns {string} empty when nothing was lost (the repaint says enough)
 */
export function reloadNotice(r) {
  if (!r) return "";
  const label = String(r.docLabel || "document").trim() || "document";
  // A Save was under way: it may have landed (R2-1) — never claim it did not.
  if (r.midSave) {
    return r.wasNew
      ? `ERPNext reloaded during the save — it may or may not have saved. Look for this ${label} with Find before typing it again.`
      : `ERPNext reloaded during the save — check that this ${label} has your changes.`;
  }
  if (!r.typed) return "";
  if (r.wasNew) return `ERPNext reloaded — this ${label} was never saved, so what you typed is gone.`;
  let name = String(r.name || "").trim();
  try {
    name = decodeURIComponent(name);
  } catch {
    /* keep as is */
  }
  return `ERPNext reloaded — your unsaved changes to ${name || `this ${label}`} are gone; this is the saved draft.`;
}
