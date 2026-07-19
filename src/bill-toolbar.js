/**
 * Bill toolbar / chrome feature contracts — museum docs.js vs alpha Bill surface.
 * Status values drive the feature-catalog tests; UI wiring stays in Electron.
 */

/** @typedef {"present"|"missing"|"partial"|"buggy"} FeatureStatus */

/**
 * Museum Bill toolbar labels (docs.js DOC_LAYOUTS.bill.toolbar).
 * @type {readonly string[]}
 */
export const MUSEUM_BILL_TOOLBAR = Object.freeze([
  "Find Bills",
  "New",
  "Save",
  "Delete",
  "Create Copy",
  "Print",
  "Attach File",
  "Select PO",
  "Recalculate",
  "Pay Bill",
]);

/**
 * Alpha Bill toolbar as shipped in electron/bill.html (labels normalized).
 * @type {readonly { id: string, label: string, museumEquivalent: string|null }[]}
 */
export const ALPHA_BILL_TOOLBAR = Object.freeze([
  { id: "btn-save", label: "Save draft", museumEquivalent: "Save" },
  { id: "btn-submit", label: "Save draft & submit", museumEquivalent: "Save" },
  { id: "btn-select-po", label: "Select PO / source", museumEquivalent: "Select PO" },
  { id: "btn-refresh", label: "Refresh", museumEquivalent: null },
  { id: "btn-vanilla", label: "Open in Vanilla", museumEquivalent: null },
]);

/**
 * @param {string} museumLabel
 * @returns {FeatureStatus}
 */
export function museumToolbarActionStatus(museumLabel) {
  const hit = ALPHA_BILL_TOOLBAR.find((a) => a.museumEquivalent === museumLabel);
  if (hit) {
    if (museumLabel === "Select PO") return "buggy"; // open-after-vendor / dogfood strike-3
    if (museumLabel === "Save") return "partial"; // draft + submit, not museum Save&Close bar
    return "present";
  }
  return "missing";
}

/**
 * @returns {{ label: string, status: FeatureStatus }[]}
 */
export function billToolbarGapMatrix() {
  return MUSEUM_BILL_TOOLBAR.map((label) => ({
    label,
    status: museumToolbarActionStatus(label),
  }));
}

/** Museum nav tabs on Bill layout. */
export const MUSEUM_BILL_NAV_TABS = Object.freeze([
  "Bill",
  "Bill Credit",
  "Item Receipt (no bill)",
]);

/** Museum line tabs. */
export const MUSEUM_BILL_LINE_TABS = Object.freeze(["Items", "Expenses"]);

/** Museum footer actions. */
export const MUSEUM_BILL_FOOTER = Object.freeze([
  "Save & Close",
  "Save & New",
  "Revert Changes Since Last Save",
]);
