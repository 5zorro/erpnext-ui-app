/**
 * Curated warm-load interactable inventory — Bill Doc skin (Purchase Invoice).
 * Production SSoT for what Simplified may show/hide; scraper in CI asserts completeness
 * against electron/doc-form.html bill shell (+ synthetic line/tax templates not in static HTML).
 */

import { BILL_ITEM_COLS } from "../bill-map.js";

/** @typedef {import("./interactable-scrape.js").ModeSwitch} ModeSwitch */
/**
 * @typedef {{
 *   id: string,
 *   kind: string,
 *   modeSwitch: ModeSwitch,
 *   synthetic?: boolean,
 *   notes?: string,
 * }} CuratedInteractable
 */

/** @type {readonly CuratedInteractable[]} */
const BILL_DOC_STATIC = Object.freeze([
  // Toolbar — File
  { id: "bill-print", kind: "button", modeSwitch: "none" },
  { id: "bill-revert", kind: "button", modeSwitch: "none" },
  { id: "bill-save", kind: "button", modeSwitch: "none" },
  { id: "bill-submit", kind: "button", modeSwitch: "none" },
  // Toolbar — Navigate
  { id: "bill-find", kind: "button", modeSwitch: "none" },
  { id: "bill-new", kind: "button", modeSwitch: "none" },
  { id: "bill-select-po", kind: "button", modeSwitch: "none" },
  { id: "bill-assign-0", kind: "button", modeSwitch: "none" },
  { id: "bill-refresh", kind: "button", modeSwitch: "none" },
  { id: "bill-vanilla", kind: "button", modeSwitch: "none" },
  // Assumptions disclosure
  { id: "bill-assumptions", kind: "disclosure", modeSwitch: "none", notes: "details/summary" },
  {
    id: "bill-doc-section",
    kind: "section",
    modeSwitch: "none",
    notes: "Document header + ship addresses",
  },
  {
    id: "bill-already-paid",
    kind: "section",
    modeSwitch: "none",
    notes: "OI-135 Already paid draft memory → Submit JIT PE; colocated with OI-139 applied PE table",
  },
  { id: "bill-is-paid", kind: "button", modeSwitch: "none", notes: "Already paid No/Yes switch" },
  { id: "bill-mode-of-payment", kind: "text", modeSwitch: "none" },
  { id: "bill-cash-bank", kind: "text", modeSwitch: "none" },
  { id: "bill-paid-amount", kind: "money", modeSwitch: "tenkey" },
  {
    id: "bill-payments-section",
    kind: "section",
    modeSwitch: "none",
    notes: "Payment card wrapping Already paid + Applied payments",
  },
  {
    id: "bill-doc-status",
    kind: "section",
    modeSwitch: "none",
    notes: "Banner Paid/Draft status pill",
  },
  // Header fields
  { id: "bill-vendor", kind: "text", modeSwitch: "none" },
  { id: "bill-terms", kind: "text", modeSwitch: "none" },
  { id: "bill-date", kind: "date", modeSwitch: "date" },
  { id: "bill-ref", kind: "text", modeSwitch: "none" },
  { id: "bill-amount-due", kind: "money", modeSwitch: "tenkey" },
  { id: "bill-due-date", kind: "date", modeSwitch: "date" },
  { id: "bill-caps", kind: "button", modeSwitch: "none", notes: "OI-111 ALL-CAPS toggle" },
  {
    id: "bill-lines-section",
    kind: "section",
    modeSwitch: "none",
    notes: "Items / Expenses tabbed table",
  },
  {
    id: "bill-summary-section",
    kind: "section",
    modeSwitch: "none",
    notes: "Item subtotal + taxes + grand total",
  },
  {
    id: "bill-notes-section",
    kind: "section",
    modeSwitch: "none",
    notes: "Memo + attach",
  },
  // Tabs (mouse-only — tabindex=-1; still scraped as buttons)
  { id: "bill-tab-items", kind: "tab", modeSwitch: "none", notes: "mouse-only (OI-099)" },
  { id: "bill-tab-expenses", kind: "tab", modeSwitch: "none", notes: "mouse-only (OI-099)" },
  // Lines / taxes chrome (empty table — add controls)
  { id: "bill-add-line", kind: "button", modeSwitch: "none", notes: "Mouse-only (OI-099); auto empty-line" },
  {
    id: "bill-add-source",
    kind: "button",
    modeSwitch: "none",
    notes: "Mouse-only alias of toolbar Select PO / source (OI-099)",
  },
  {
    id: "bill-import-items",
    kind: "button",
    modeSwitch: "none",
    notes: "OI-132 paste/CSV import; mouse-only (OI-099)",
  },
  { id: "bill-tax-account", kind: "text", modeSwitch: "none" },
  { id: "bill-tax-amount", kind: "money", modeSwitch: "tenkey" },
  { id: "bill-add-tax", kind: "button", modeSwitch: "none" },
  {
    id: "bill-open-landed-cost",
    kind: "button",
    modeSwitch: "none",
    notes: "OI-140 link to Vanilla Landed Cost Voucher",
  },
  {
    id: "bill-applied-payments",
    kind: "section",
    modeSwitch: "none",
    notes: "OI-139 submitted Bill PE table",
  },
  {
    id: "bill-tax-alloc-template",
    kind: "button",
    modeSwitch: "none",
    synthetic: true,
    notes: "OI-140 → Stock allocate on Add charge rows",
  },
  { id: "bill-attach", kind: "button", modeSwitch: "none" },
  {
    id: "bill-source-terms-block",
    kind: "section",
    modeSwitch: "none",
    notes: "Read-only terms from linked PO/PR sources",
  },
  { id: "bill-memo", kind: "textarea", modeSwitch: "none", notes: "remarks — Remarks & Freehand Memo" },
  { id: "bill-billing-address", kind: "textarea", modeSwitch: "none", notes: "OI-136 address picker" },
  { id: "bill-ship-from", kind: "textarea", modeSwitch: "none", notes: "OI-136 dispatch picker" },
  { id: "bill-ship-to", kind: "textarea", modeSwitch: "none", notes: "OI-136 shipping picker" },
  { id: "bill-back-top", kind: "button", modeSwitch: "none" },
]);

/**
 * One representative item line (runtime-rendered; not in static bill.html).
 * @returns {CuratedInteractable[]}
 */
function billDocLineTemplate() {
  /** @type {CuratedInteractable[]} */
  const rows = [];
  for (const col of BILL_ITEM_COLS) {
    if (!col.field) continue; // Amount display-only
    const money = col.field === "qty" || col.field === "rate";
    rows.push({
      id: `bill-line-template:${col.field}`,
      kind: money ? "money" : "text",
      modeSwitch: money ? "tenkey" : "none",
      synthetic: true,
      notes: `Item col ${col.label}`,
    });
  }
  rows.push({
    id: "bill-line-template:delete",
    kind: "button",
    modeSwitch: "none",
    synthetic: true,
    notes: "Per-row delete",
  });
  return rows;
}

/** @type {readonly CuratedInteractable[]} */
export const BILL_DOC_CURATED = Object.freeze([
  ...BILL_DOC_STATIC,
  ...billDocLineTemplate(),
]);

export const BILL_DOC_INVENTORY_META = Object.freeze({
  anchor: "purchase-invoice",
  lens: "doc",
  surface: "electron/doc-form.html#bill-shell",
  doctype: "Purchase Invoice",
});
