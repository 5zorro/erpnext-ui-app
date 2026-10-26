/**
 * The taxes table's notes, written once for every Doc form page (plan 2026-10-25, R6a-1 step 1):
 *   - the ⓘ on a row whose Amount the clerk typed over a percentage ("Was 6% of the net total…"),
 *     its note opening as a full-width line under the row;
 *   - "Vendor tax template default ⓘ" (5zorro DF-02): why these taxes, and how to change them;
 *   - Remove all taxes holding: a vendor change refills taxes from a template, and on a document
 *     the clerk emptied they are emptied again (at most three times, then reported).
 * The Bill and doc-form pages both call this; what differs comes in through `deps`.
 */

import { uiIconHtml } from "./ui-icons.js";
import { formatGroupedNumber } from "./money.js";
import { taxDefaultWhy } from "./tax-default-why.js";

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @typedef {{
 *   el: () => { taxesBody?: HTMLElement|null, taxDefaultNote?: HTMLElement|null } | null | undefined,
 *   api: () => { taxDefaultFacts?: (supplier: string) => Promise<any>, softPeekRoute?: (route: any) => any } | null | undefined,
 *   lastDoc: () => object | null | undefined,
 *   setStatus: (text: string, cls?: string) => void,
 *   removingTaxes: () => boolean,
 *   removeAllTaxes: (opts: { quiet?: boolean }) => Promise<void>,
 *   testIdPrefix: string,
 * }} TaxNotesDeps
 *
 * `removingTaxes` / `removeAllTaxes`: the page's Remove all (it adds the document to `removedOn`).
 * `testIdPrefix`: "bill" or "doc", for the ⓘ's test id.
 */

/** @param {TaxNotesDeps} deps */
export function createTaxNotes(deps) {
  /** Tax row name → its Rate % before the clerk typed its Amount (this entry only). */
  const fixedByClerk = new Map();
  /** Documents whose taxes the clerk removed; a rename on first save carries the mark over. */
  const removedOn = new Set();
  /** Re-clears per document: a refill that keeps coming back is reported, not fought forever. */
  const reclears = new Map();
  /** Which document + vendor the open note explains; anything else closes it (5zorro DF-02). */
  let noteKey = "";
  const noteKeyOf = (doc) => `${(doc && doc.name) || ""}|${(doc && doc.supplier) || ""}`;

  /** Why a row is fixed, when the clerk typed its Amount over a percentage this entry; else "". */
  function fixedNote(taxRaw) {
    const name = taxRaw && taxRaw.name ? String(taxRaw.name) : "";
    if (!name || !fixedByClerk.has(name) || taxRaw.charge_type !== "Actual") return "";
    const was = fixedByClerk.get(name);
    const pct = was === "" || was == null ? "a percentage" : `${formatGroupedNumber(Number(was))}%`;
    return `Was ${pct} of the net total. You typed this row's Amount, so it is a fixed amount now and no longer follows the item lines.`;
  }

  /** The note opens as a full-width line under its row (a narrow Type cell made the row a tower). */
  function fixedNoteRowHtml(taxRaw, idx, cols) {
    const note = fixedNote(taxRaw);
    return note
      ? `<tr class="row-note-row" data-tax-note-text="${idx}" hidden><td colspan="${cols}" class="row-note">${escapeHtml(note)}</td></tr>`
      : "";
  }

  /** ⓘ on a row whose Amount the clerk typed over a percentage; the note opens on click. */
  function fixedMarkerHtml(taxRaw, idx) {
    const note = fixedNote(taxRaw);
    if (!note) return "";
    return ` <button type="button" class="row-note-btn" data-tax-note="${idx}" tabindex="-1" title="${escapeHtml(note)}" aria-label="Why this row is a fixed amount" data-testid="${deps.testIdPrefix}-tax-${idx}-fixed">${uiIconHtml("info", { size: 12 })}</button>`;
  }

  /** After the taxes are painted: each ⓘ opens and closes its note. */
  function wireFixedNotes() {
    const el = deps.el();
    const body = el && el.taxesBody;
    if (!body) return;
    body.querySelectorAll("[data-tax-note]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = body.querySelector(`[data-tax-note-text="${btn.getAttribute("data-tax-note")}"]`);
        if (t) t.hidden = !t.hidden;
      });
    });
  }

  /** A vendor change refills taxes from a template; on a document the clerk emptied, empty them again. */
  function keepTaxesRemoved(doc) {
    if (deps.removingTaxes() || !doc || !removedOn.has(String(doc.name || ""))) return;
    if (!doc.taxes_and_charges || !(Array.isArray(doc.taxes) && doc.taxes.length)) return;
    const key = String(doc.name || "");
    const n = (reclears.get(key) || 0) + 1;
    reclears.set(key, n);
    if (n > 3) {
      removedOn.delete(key);
      deps.setStatus("ERPNext keeps putting the template's taxes back here; leaving them. Remove all again, or check the vendor's tax defaults (ⓘ).", "warn");
      return;
    }
    void deps.removeAllTaxes({ quiet: true });
  }

  /** Close the note: on Refresh, on a fresh snapshot, or when the document or vendor changes. */
  function collapseDefaultNote() {
    const el = deps.el();
    if (el && el.taxDefaultNote) el.taxDefaultNote.hidden = true;
    noteKey = "";
  }

  /** At the end of painting the taxes: hold a Remove all, and close a note about another document or vendor. */
  function followDoc(doc) {
    keepTaxesRemoved(doc);
    if (noteKey && noteKey !== noteKeyOf(doc)) collapseDefaultNote();
  }

  /** "Vendor tax template default ⓘ": why these taxes, and how to change them. */
  async function toggleDefaultNote() {
    const el = deps.el();
    const note = el && el.taxDefaultNote;
    if (!note) return;
    if (!note.hidden) {
      collapseDefaultNote();
      return;
    }
    const asked = deps.lastDoc();
    const api = deps.api();
    note.hidden = false;
    noteKey = noteKeyOf(asked);
    note.textContent = "Reading the tax defaults…";
    const supplier = (asked && asked.supplier) || "";
    const facts = api && api.taxDefaultFacts ? await api.taxDefaultFacts(supplier) : null;
    if (!(facts && facts.ok)) {
      note.textContent = (facts && facts.reason) || "Could not read the tax defaults.";
      return;
    }
    const lastDoc = deps.lastDoc();
    const why = taxDefaultWhy({
      supplier,
      current: (lastDoc && lastDoc.taxes_and_charges) || "",
      defaultTemplate: facts.defaultTemplate,
      vendorRule: facts.vendorRule,
      removed: removedOn.has(String((lastDoc && lastDoc.name) || "")),
    });
    note.innerHTML =
      why.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
      `<div class="tax-default-links">${why.links
        .map((k, i) => `<button type="button" class="linkish" data-tax-default-link="${i}" tabindex="-1">${escapeHtml(k.label)} ↗</button>`)
        .join("")}</div>`;
    note.querySelectorAll("[data-tax-default-link]").forEach((b) => {
      b.addEventListener("click", () => {
        const link = why.links[Number(b.getAttribute("data-tax-default-link"))];
        const peekApi = deps.api();
        if (!link || !peekApi || !peekApi.softPeekRoute) return;
        deps.setStatus(`Opening ${link.label} (Esc returns here)…`);
        void peekApi.softPeekRoute(link.route);
      });
    });
  }

  return {
    fixedByClerk,
    removedOn,
    fixedNoteRowHtml,
    fixedMarkerHtml,
    wireFixedNotes,
    followDoc,
    collapseDefaultNote,
    toggleDefaultNote,
  };
}
