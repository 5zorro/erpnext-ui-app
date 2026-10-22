/**
 * Plan 2026-10-21 D2: a vendor that is not (or no longer) in ERPNext.
 *
 * 5zorro's dogfood: he picked a vendor deleted 13 s earlier from a stale list. The Bill opened
 * its source picker for it at once, he chose NIC, and ~38 s later (chaos mode) ERPNext cleared the
 * vendor box — then a late vendor write re-opened the source picker two minutes on. Now the Bill
 * asks ERPNext first and, for a missing vendor, shows a banner and opens nothing.
 *
 * Pure: wording and decisions only.
 */

/**
 * @param {string} name the vendor as typed or picked
 * @param {"vendor"|"sources"} attempt setting the vendor, or opening its sources (Select PO / NIC)
 */
export function missingVendorBannerText(name, attempt) {
  const who = `“${String(name ?? "").trim()}”`;
  const lead = `Vendor ${who} is not in ERPNext — it may have been deleted or renamed.`;
  return attempt === "sources"
    ? `${lead} Its sources (and NIC) cannot be chosen; pick another vendor.`
    : `${lead} Pick another vendor; the bill keeps its old one.`;
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
