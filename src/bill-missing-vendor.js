/**
 * Plan 2026-10-21 D2: a vendor that is not (or no longer) in ERPNext.
 *
 * 5zorro's dogfood: he picked a vendor deleted 13 s earlier from a stale list. The Bill opened
 * its source picker for it at once, he chose NIC, and ~38 s later (chaos mode) ERPNext cleared the
 * vendor box — then a late vendor write re-opened the source picker two minutes on. Now the Bill
 * asks ERPNext first and, for a missing vendor, shows a banner and opens nothing.
 *
 * Review 10-19 R5b-5 (2026-10-22): the PO / Item Receipt page (`doc-form-page.js`) does the same;
 * the banner and the typing watch both pages use are in `missing-vendor-ui.js`.
 *
 * Pure: wording and decisions only.
 */

/**
 * @param {string} name the vendor as typed or picked
 * @param {"vendor"|"sources"} attempt setting the vendor, or opening its sources (Select PO / NIC)
 * @param {{ doc?: string, nic?: boolean }} [opts] the document's name in a sentence ("purchase
 *   order"; default "bill") and whether it offers NIC (the Bill only) — review 10-19 R5b-5
 */
export function missingVendorBannerText(name, attempt, opts = {}) {
  const who = `“${String(name ?? "").trim()}”`;
  const doc = String(opts.doc || "bill").trim().toLowerCase();
  const nic = opts.nic ?? doc === "bill";
  const lead = `Vendor ${who} is not in ERPNext — it may have been deleted or renamed.`;
  return attempt === "sources"
    ? `${lead} Its sources${nic ? " (and NIC)" : ""} cannot be chosen; pick another vendor.`
    : `${lead} Pick another vendor; the ${doc} keeps its old one.`;
}

/**
 * A vendor write answered: may it still open the source picker? Not when the clerk has moved
 * on (5zorro: "a source selection box pops up … from timing out"). Tab out of the vendor box puts
 * the cursor in the next field at once, and a vendor with no address on file legitimately waits
 * ~9–12 s for its fields — so "moved on" is having *typed* in another field since, not a clock.
 * @param {{ wanted: string, boxNow: string, activeIsOtherField: boolean, modalOpen: boolean, typedElsewhere: boolean }} s
 * @returns {{ open: boolean, reason?: string }}
 */
export function lateVendorMayOpenSources(s) {
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  if (s.modalOpen) return { open: false, reason: "modal_open" };
  if (norm(s.boxNow) !== norm(s.wanted)) return { open: false, reason: "vendor_changed" };
  if (s.activeIsOtherField && s.typedElsewhere) return { open: false, reason: "moved_on" };
  return { open: true };
}
