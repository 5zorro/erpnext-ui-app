/**
 * Curated warm-load interactable inventory — Doc-form shell (PO + Item Receipt).
 * Profile-parameterized SSoT; CI scrape asserts static electron/doc-form.html ids
 * against the union inventory (+ synthetic line/tax/header templates).
 */

import { DOC_SKIN_PROFILES } from "../doc-skin-registry.js";
import { PO_HEADER_FIELDS, PO_ITEM_COLS } from "../po-map.js";
import { RECEIPT_HEADER_FIELDS, RECEIPT_ITEM_COLS } from "../receipt-map.js";

/** @typedef {import("../interactable-scrape.js").ModeSwitch} ModeSwitch */
/**
 * @typedef {{
 *   id: string,
 *   kind: string,
 *   modeSwitch: ModeSwitch,
 *   synthetic?: boolean,
 *   notes?: string,
 * }} CuratedInteractable
 */

/** @param {string} label */
function slugLabel(label) {
  return String(label || "field")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Mirror doc-form-page buildHeaderFields testid rules.
 * @param {{ label: string, field?: string|null, type?: string, readOnly?: boolean, scratch?: boolean }} meta
 */
function headerFieldTestId(meta) {
  const isReadOnly = meta.readOnly || !meta.field;
  if (isReadOnly) return `doc-header-${slugLabel(meta.label)}`;
  if (meta.type === "date" && meta.scratch) return "doc-date-expected";
  if (meta.field) return `doc-${meta.field}`;
  return `doc-header-${slugLabel(meta.label)}`;
}

/**
 * @param {readonly { label: string, field?: string|null, type?: string, readOnly?: boolean, scratch?: boolean, displayOnly?: boolean }[]} fields
 * @returns {CuratedInteractable[]}
 */
function headerFieldInventory(fields) {
  /** @type {CuratedInteractable[]} */
  const rows = [];
  for (const meta of fields) {
    const id = headerFieldTestId(meta);
    const isReadOnly = meta.readOnly || !meta.field;
    const isDate = meta.type === "date" && !isReadOnly;
    rows.push({
      id,
      kind: isReadOnly ? "text" : isDate ? "date" : "text",
      modeSwitch: isDate ? "date" : "none",
      synthetic: true,
      notes: `Header: ${meta.label}`,
    });
  }
  if (fields.some((f) => f.addressRole || f.column === "addresses")) {
    rows.push({
      id: "doc-header-addresses",
      kind: "section",
      modeSwitch: "none",
      synthetic: true,
      notes: "PO address row (runtime when addresses column present)",
    });
  }
  return rows;
}

/**
 * @param {readonly { label: string, field?: string|null, type?: string, displayOnly?: boolean }[]} cols
 * @returns {CuratedInteractable[]}
 */
function lineTemplateInventory(cols) {
  /** @type {CuratedInteractable[]} */
  const rows = [];
  for (const col of cols) {
    if (!col.field || String(col.field).startsWith("__")) continue;
    const money = col.field === "qty" || col.field === "rate";
    const isDate = col.type === "date";
    rows.push({
      id: `doc-line-template:${col.field}`,
      kind: money ? "money" : isDate ? "date" : "text",
      modeSwitch: money ? "tenkey" : isDate ? "date" : "none",
      synthetic: true,
      notes: `Item col ${col.label}`,
    });
  }
  rows.push({
    id: "doc-line-template:amount",
    kind: "money",
    modeSwitch: "tenkey",
    synthetic: true,
    notes: "Amount display / back-in button",
  });
  rows.push({
    id: "doc-line-template:delete",
    kind: "button",
    modeSwitch: "none",
    synthetic: true,
    notes: "Per-row delete",
  });
  return rows;
}

/** @returns {CuratedInteractable[]} */
function taxLineTemplate() {
  return Object.freeze([
    { id: "doc-tax-template:account", kind: "text", modeSwitch: "none", synthetic: true },
    { id: "doc-tax-template:desc", kind: "text", modeSwitch: "none", synthetic: true },
    { id: "doc-tax-template:rate", kind: "money", modeSwitch: "tenkey", synthetic: true },
    { id: "doc-tax-template:amount", kind: "money", modeSwitch: "tenkey", synthetic: true },
    { id: "doc-tax-template:adddeduct", kind: "select", modeSwitch: "none", synthetic: true },
    {
      id: "doc-tax-template:delete",
      kind: "button",
      modeSwitch: "none",
      synthetic: true,
      notes: "Per-row tax delete",
    },
  ]);
}

/** Shared static + runtime chrome present on every doc-form profile. */
const DOC_FORM_SHARED = Object.freeze([
  // Toolbar — File
  { id: "doc-print", kind: "button", modeSwitch: "none" },
  { id: "doc-revert", kind: "button", modeSwitch: "none" },
  { id: "doc-save", kind: "button", modeSwitch: "none" },
  { id: "doc-submit", kind: "button", modeSwitch: "none" },
  // Toolbar — Navigate
  { id: "doc-find", kind: "button", modeSwitch: "none" },
  { id: "doc-new", kind: "button", modeSwitch: "none" },
  { id: "doc-refresh", kind: "button", modeSwitch: "none" },
  { id: "doc-vanilla", kind: "button", modeSwitch: "none" },
  { id: "doc-caps", kind: "button", modeSwitch: "none", notes: "OI-111 ALL-CAPS toggle" },
  // Assumptions + lines chrome
  { id: "doc-assumptions", kind: "disclosure", modeSwitch: "none", notes: "details/summary" },
  {
    id: "doc-panel-items",
    kind: "section",
    modeSwitch: "none",
    notes: "Items tab panel",
  },
  {
    id: "doc-add-line",
    kind: "button",
    modeSwitch: "none",
    notes: "Mouse-only (OI-099); auto empty-line",
  },
  {
    id: "doc-import-items",
    kind: "button",
    modeSwitch: "none",
    notes: "Paste/CSV import; mouse-only (OI-099)",
  },
  { id: "doc-back-top", kind: "button", modeSwitch: "none" },
  // Commit gate (hidden in static HTML; shown at runtime)
  { id: "doc-gate-discard", kind: "button", modeSwitch: "none", synthetic: true },
  { id: "doc-gate-save", kind: "button", modeSwitch: "none", synthetic: true },
  { id: "doc-gate-submit", kind: "button", modeSwitch: "none", synthetic: true },
  { id: "doc-gate-cancel", kind: "button", modeSwitch: "none", synthetic: true },
  { id: "doc-retry", kind: "button", modeSwitch: "none", synthetic: true, notes: "Load failure retry" },
]);

/** Profile-conditional blocks (HTML exists but hidden until profile wires features). */
const DOC_FORM_RECEIPT_ONLY = Object.freeze([
  { id: "doc-select-source", kind: "button", modeSwitch: "none", notes: "IR: Select PO" },
  { id: "doc-attach-toolbar", kind: "button", modeSwitch: "none", notes: "IR memo toolbar attach" },
  {
    id: "doc-line-tabs",
    kind: "section",
    modeSwitch: "none",
    notes: "Items / Expenses tabs",
  },
  { id: "doc-tab-items", kind: "tab", modeSwitch: "none", notes: "mouse-only (OI-099)" },
  { id: "doc-tab-expenses", kind: "tab", modeSwitch: "none", notes: "mouse-only (OI-099)" },
  { id: "doc-panel-expenses", kind: "section", modeSwitch: "none" },
  { id: "doc-expense-note", kind: "text", modeSwitch: "none", notes: "Expenses tab copy" },
  { id: "doc-taxes-block", kind: "section", modeSwitch: "none" },
  { id: "doc-tax-account", kind: "text", modeSwitch: "none" },
  { id: "doc-tax-amount", kind: "money", modeSwitch: "tenkey" },
  { id: "doc-add-tax", kind: "button", modeSwitch: "none" },
  { id: "doc-ms-items", kind: "text", modeSwitch: "none", notes: "Money stack readout" },
  { id: "doc-ms-taxes", kind: "text", modeSwitch: "none" },
  { id: "doc-ms-grand", kind: "text", modeSwitch: "none" },
  { id: "doc-ms-note", kind: "text", modeSwitch: "none" },
  { id: "doc-memo-block", kind: "section", modeSwitch: "none" },
  { id: "doc-attach", kind: "button", modeSwitch: "none" },
  { id: "doc-memo", kind: "textarea", modeSwitch: "none" },
  {
    id: "doc-source-modal",
    kind: "section",
    modeSwitch: "none",
    synthetic: true,
    notes: "Runtime source picker overlay (IR)",
  },
]);

const DOC_FORM_PO_ONLY = Object.freeze([
  {
    id: "doc-line-totals",
    kind: "section",
    modeSwitch: "none",
    notes: "Σ Qty footer",
  },
  {
    id: "doc-clear-qty",
    kind: "button",
    modeSwitch: "none",
    synthetic: true,
    notes: "Clear qty column (runtime in line totals)",
  },
]);

/**
 * @param {"po"|"receipt"} profileId
 * @returns {readonly CuratedInteractable[]}
 */
export function docFormCuratedForProfile(profileId) {
  const p = DOC_SKIN_PROFILES[profileId];
  if (!p || p.shell !== "doc-form") return Object.freeze([]);

  /** @type {CuratedInteractable[]} */
  const rows = [...DOC_FORM_SHARED];

  if (profileId === "po") {
    rows.push(...DOC_FORM_PO_ONLY);
    rows.push(...headerFieldInventory(PO_HEADER_FIELDS));
    rows.push(...lineTemplateInventory(PO_ITEM_COLS));
  } else   if (profileId === "receipt") {
    rows.push(...DOC_FORM_RECEIPT_ONLY);
    rows.push(...headerFieldInventory(RECEIPT_HEADER_FIELDS));
    rows.push(...lineTemplateInventory(RECEIPT_ITEM_COLS));
    rows.push(...taxLineTemplate());
    rows.push(
      { id: "doc-source-terms-block", kind: "section", modeSwitch: "none", notes: "IR source terms" },
    );
  }

  return Object.freeze(rows);
}

/** Union inventory — covers static scrape ids for either profile. */
export const DOC_FORM_CURATED_UNION = Object.freeze([
  ...DOC_FORM_SHARED,
  ...DOC_FORM_PO_ONLY,
  ...DOC_FORM_RECEIPT_ONLY,
  ...headerFieldInventory(PO_HEADER_FIELDS),
  ...headerFieldInventory(RECEIPT_HEADER_FIELDS),
  ...lineTemplateInventory(PO_ITEM_COLS),
  ...lineTemplateInventory(RECEIPT_ITEM_COLS),
  ...taxLineTemplate(),
  { id: "doc-source-terms-block", kind: "section", modeSwitch: "none", synthetic: true },
  { id: "doc-terms-text", kind: "textarea", modeSwitch: "none", synthetic: true },
]);

/** @type {readonly CuratedInteractable[]} */
export const PO_DOC_CURATED = docFormCuratedForProfile("po");

/** @type {readonly CuratedInteractable[]} */
export const RECEIPT_DOC_CURATED = docFormCuratedForProfile("receipt");

export const PO_DOC_INVENTORY_META = Object.freeze({
  anchor: "purchase-order",
  lens: "doc",
  surface: "electron/doc-form.html",
  doctype: "Purchase Order",
  profileId: "po",
});

export const RECEIPT_DOC_INVENTORY_META = Object.freeze({
  anchor: "item-receipt",
  lens: "doc",
  surface: "electron/doc-form.html",
  doctype: "Purchase Receipt",
  profileId: "receipt",
});
