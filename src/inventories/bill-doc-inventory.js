/**
 * Curated warm-load interactable inventory — Bill Doc skin (Purchase Invoice).
 * Production SSoT for what Simplified may show/hide; scraper in CI asserts completeness
 * against electron/bill.html (+ synthetic line/tax templates not in static HTML).
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
  { id: "bill-refresh", kind: "button", modeSwitch: "none" },
  { id: "bill-vanilla", kind: "button", modeSwitch: "none" },
  // Assumptions disclosure
  { id: "bill-assumptions", kind: "disclosure", modeSwitch: "none", notes: "details/summary" },
  // Header fields
  { id: "bill-vendor", kind: "text", modeSwitch: "none" },
  { id: "bill-terms", kind: "text", modeSwitch: "none" },
  { id: "bill-date", kind: "date", modeSwitch: "date" },
  { id: "bill-ref", kind: "text", modeSwitch: "none" },
  { id: "bill-amount-due", kind: "money", modeSwitch: "tenkey" },
  { id: "bill-due-date", kind: "date", modeSwitch: "date" },
  // Tabs
  { id: "bill-tab-items", kind: "tab", modeSwitch: "none" },
  { id: "bill-tab-expenses", kind: "tab", modeSwitch: "none" },
  // Lines / taxes chrome (empty table — add controls)
  { id: "bill-add-line", kind: "button", modeSwitch: "none" },
  { id: "bill-tax-account", kind: "text", modeSwitch: "none" },
  { id: "bill-tax-amount", kind: "money", modeSwitch: "tenkey" },
  { id: "bill-add-tax", kind: "button", modeSwitch: "none" },
  { id: "bill-attach", kind: "button", modeSwitch: "none" },
  { id: "bill-memo", kind: "textarea", modeSwitch: "none" },
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
  surface: "electron/bill.html",
  doctype: "Purchase Invoice",
});
