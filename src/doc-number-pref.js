/**
 * Which number leads — theirs or ours (OI-170; plan 2026-09-16 P1e, plan 2026-09-26 DF-01 E).
 *
 * 5zorro: "i mostly track bills and po's based on their 'logbook number' or their 'supplier ref
 * number' and not the 'unique id stamped by erpnext'." The ERPNext ID also changes on every amend
 * (`<name>-1`, `-2`), while the vendor's ref and the logbook number survive it. So one global
 * setting decides which number reads first on every Doc skin and on the payment board; the other is
 * always shown beside it, never hidden.
 *
 * Pure: the setting is kept in main (`doc-number-prefs.json`), like the payment direction.
 */

/** @typedef {"theirs"|"ours"} NumberLead */

/** @type {NumberLead} */
export const DEFAULT_NUMBER_LEAD = "theirs";
export const NUMBER_LEADS = /** @type {const} */ (["theirs", "ours"]);
export const OUR_NUMBER_LABEL = "Our No";

/**
 * "Their" number per doctype — the one a clerk tracks by. A doctype missing here has none, and
 * leads with the ERPNext ID whatever the setting. Each field verified on the v16 doctype JSON.
 */
export const THEIR_NUMBER = Object.freeze({
  "purchase-invoice": Object.freeze({ field: "bill_no", label: "Supplier No" }),
  // The logbook PO# lives in `title` (po-map.js, OI-121).
  "purchase-order": Object.freeze({ field: "title", label: "Logbook PO#" }),
  // The Item Receipt skin tracks by its packing list / BOL ref (receipt-map.js), not the supplier
  // delivery note.
  "purchase-receipt": Object.freeze({ field: "lr_no", label: "Packing list / BOL" }),
  "sales-order": Object.freeze({ field: "po_no", label: "Customer PO" }),
  "sales-invoice": Object.freeze({ field: "po_no", label: "Customer PO" }),
  "payment-entry": Object.freeze({ field: "reference_no", label: "Check / Ref No" }),
});

/** @param {unknown} value @returns {NumberLead} */
export function normalizeNumberLead(value) {
  return value === "ours" || value === "theirs" ? value : DEFAULT_NUMBER_LEAD;
}

/** @param {unknown} raw @returns {{ lead: NumberLead }} */
export function mergeNumberPrefs(raw) {
  const r = raw && typeof raw === "object" ? /** @type {any} */ (raw) : {};
  return { lead: normalizeNumberLead(r.lead) };
}

/** @param {NumberLead} lead @returns {NumberLead} */
export function flipNumberLead(lead) {
  return normalizeNumberLead(lead) === "theirs" ? "ours" : "theirs";
}

/** @param {string|null|undefined} doctypeKey */
function keyOf(doctypeKey) {
  return String(doctypeKey || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

/** @param {string|null|undefined} doctypeKey */
export function theirNumberFor(doctypeKey) {
  return THEIR_NUMBER[/** @type {keyof typeof THEIR_NUMBER} */ (keyOf(doctypeKey))] || null;
}

/** An unsaved draft's name (`new-purchase-invoice-abc`) is a placeholder, not a number. */
function isPlaceholderName(name) {
  return !name || /^new-[a-z-]+-\w+$/i.test(name);
}

/**
 * @typedef {{ label: string, value: string }} LabeledNumber
 * @typedef {{ primary: LabeledNumber, secondary: LabeledNumber|null }} DocNumbers
 */

/**
 * The two numbers in lead order. When the chosen one is still blank, the other leads, so the
 * banner never opens on an empty slot; the blank one still shows, as a dash, in second place.
 * @param {string} ourName ERPNext name
 * @param {string} theirValue
 * @param {{ label: string }|null} theirMeta
 * @param {NumberLead} lead
 * @returns {DocNumbers}
 */
function order(ourName, theirValue, theirMeta, lead) {
  const ours = { label: OUR_NUMBER_LABEL, value: isPlaceholderName(ourName) ? "" : ourName };
  if (!theirMeta) return { primary: ours, secondary: null };
  const theirs = { label: theirMeta.label, value: theirValue };
  let [first, second] = normalizeNumberLead(lead) === "ours" ? [ours, theirs] : [theirs, ours];
  if (!first.value && second.value) [first, second] = [second, first];
  return { primary: first, secondary: second };
}

/**
 * @param {string|null|undefined} doctypeKey e.g. "purchase-invoice"
 * @param {Record<string, unknown>|null|undefined} doc
 * @param {NumberLead} lead
 * @returns {DocNumbers}
 */
export function docNumbers(doctypeKey, doc, lead) {
  const d = doc || {};
  const meta = theirNumberFor(doctypeKey);
  const their = meta ? String(d[meta.field] ?? "").trim() : "";
  return order(String(d.name ?? "").trim(), their, meta, lead);
}

/**
 * Same for a Pay Outstanding row (`invoice` = ERPNext name, `billNo` = the vendor's ref).
 * @param {{ invoice?: string, billNo?: string }|null|undefined} bill
 * @param {NumberLead} lead
 * @returns {DocNumbers}
 */
export function billRowNumbers(bill, lead) {
  const b = bill || {};
  return order(String(b.invoice ?? "").trim(), String(b.billNo ?? "").trim(), THEIR_NUMBER["purchase-invoice"], lead);
}

/**
 * Toggle button text: says which number leads now, for this doctype.
 * @param {string|null|undefined} doctypeKey
 * @param {NumberLead} lead
 */
export function numberLeadButtonLabel(doctypeKey, lead) {
  const meta = theirNumberFor(doctypeKey);
  const theirLabel = meta ? meta.label : "Their No";
  return `No.: ${normalizeNumberLead(lead) === "ours" ? OUR_NUMBER_LABEL : theirLabel}`;
}
