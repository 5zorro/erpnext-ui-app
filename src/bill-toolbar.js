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
  { id: "btn-print", label: "Print", museumEquivalent: "Print" },
  { id: "btn-find", label: "Find Bill…", museumEquivalent: "Find Bills" },
  { id: "btn-new", label: "New Bill", museumEquivalent: "New" },
  { id: "btn-save", label: "Save draft", museumEquivalent: "Save" },
  { id: "btn-submit", label: "Save draft & submit", museumEquivalent: "Save" },
  { id: "btn-revert", label: "Revert unsaved changes", museumEquivalent: null },
  { id: "btn-select-po", label: "Select PO / source", museumEquivalent: "Select PO" },
  { id: "btn-refresh", label: "Refresh", museumEquivalent: null },
  { id: "btn-vanilla", label: "Open in Vanilla", museumEquivalent: null },
]);

/** Actions that use the dirty commit popover (T3a). */
export const BILL_COMMIT_GATE_ACTIONS = Object.freeze(["find", "new", "print"]);

/**
 * Clean Bill → run Find/New/Print immediately; dirty → show commit popover.
 * @param {boolean} userEdited
 * @returns {boolean}
 */
export function shouldOpenCommitGate(userEdited) {
  return !!userEdited;
}

/**
 * @param {"discard"|"save"|"submit"|"cancel"|string} choice
 * @returns {"discard"|"save"|"submit"|"cancel"|null}
 */
export function normalizeCommitGateChoice(choice) {
  if (choice === "discard" || choice === "save" || choice === "submit" || choice === "cancel") {
    return choice;
  }
  return null;
}

/**
 * After commit choice, may the pending action run?
 * @param {"discard"|"save"|"submit"|"cancel"|null} choice
 */
export function commitGateContinues(choice) {
  return choice === "discard" || choice === "save" || choice === "submit";
}

/**
 * Print needs a saved document name — discard on a brand-new Bill cannot print yet.
 * @param {"find"|"new"|"print"} action
 * @param {"discard"|"save"|"submit"} choice
 * @param {{ isNew?: boolean }} [ctx]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function commitGateAllowsAction(action, choice, ctx = {}) {
  if (action === "print" && choice === "discard" && ctx.isNew) {
    return { ok: false, reason: "Save the Bill before printing." };
  }
  return { ok: true };
}

/**
 * Museum footer "Revert Changes Since Last Save" — alpha ships as toolbar Revert.
 * @returns {FeatureStatus}
 */
export function revertUnsavedStatus() {
  return "present";
}
/**
 * @param {string} museumLabel
 * @returns {FeatureStatus}
 */
export function museumToolbarActionStatus(museumLabel) {
  const hit = ALPHA_BILL_TOOLBAR.find((a) => a.museumEquivalent === museumLabel);
  if (hit) {
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
