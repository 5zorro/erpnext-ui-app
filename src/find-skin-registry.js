/**
 * Find pages — SSoT for which document lists have a Doc "Find" page (OI-056).
 *
 * A Find page is the list half of a transaction-entry form: Find Bills belongs to the Bill,
 * Find Purchase Orders to the PO. It is a shell page (`find-doc.html`), not a restyled Vanilla
 * list — the Vanilla list stays one click away as the escape hatch.
 *
 * `lens-context.js` derives its Find rows from this table (the same way Simplified derives its
 * tabs from `SEED_PROFILES`), so a document type gets a Find page by gaining a row here — there
 * is no second list to keep in step.
 *
 * Every `field` below is a real fieldname on that doctype, checked against the doctype JSON on
 * the sandbox tag (2026-09-26). They double as the `?field=value` filters handed to the Vanilla
 * list, which Frappe applies by itself (router.js `set_route_options_from_url`).
 *
 * Search boxes follow the two ways a clerk actually starts looking (OI-056): everything for one
 * vendor/customer, or one document by the *other side's* reference number. The one that matches
 * how the clerk arrived gets the cursor (`focusFor`).
 */

import { listLabelForDoctype, formLabelForDoctype } from "./doctype-labels.js";

/**
 * @typedef {"text"|"date"|"money"|"percent"|"status"} FindColumnKind
 * @typedef {{ field: string, label: string, kind: FindColumnKind }} FindColumn
 * @typedef {{ id: string, field: string, label: string, hint: string }} FindSearch
 * @typedef {"request"|"order"|"fulfill"|"invoice"|"payment"} FindWashRole
 * @typedef {{
 *   doctypeKey: string,
 *   doctype: string,
 *   desk: "ap"|"ar"|"both",
 *   washRole: FindWashRole,
 *   stage: "mockup"|"live",
 *   party: { field: string, label: string },
 *   searches: FindSearch[],
 *   statuses: string[],
 *   columns: FindColumn[],
 *   directional?: boolean,
 * }} FindSkin
 */

/** @type {Readonly<Record<string, FindSkin>>} */
export const FIND_SKINS = Object.freeze({
  quotation: {
    doctypeKey: "quotation",
    doctype: "Quotation",
    desk: "ar",
    washRole: "request",
    stage: "mockup",
    party: { field: "party_name", label: "Customer" },
    searches: [
      { id: "party", field: "party_name", label: "Customer", hint: "Every estimate for one customer" },
      { id: "ref", field: "name", label: "Estimate no.", hint: "One estimate by its number" },
    ],
    statuses: ["Draft", "Open", "Replied", "Partially Ordered", "Ordered", "Lost", "Expired"],
    columns: [
      { field: "name", label: "Estimate", kind: "text" },
      { field: "transaction_date", label: "Date", kind: "date" },
      { field: "valid_till", label: "Valid till", kind: "date" },
      { field: "grand_total", label: "Amount", kind: "money" },
      { field: "status", label: "Status", kind: "status" },
    ],
  },
  "sales-order": {
    doctypeKey: "sales-order",
    doctype: "Sales Order",
    desk: "ar",
    washRole: "order",
    stage: "mockup",
    party: { field: "customer", label: "Customer" },
    searches: [
      { id: "party", field: "customer", label: "Customer", hint: "Every order for one customer" },
      { id: "ref", field: "po_no", label: "Customer's PO no.", hint: "One order by the customer's PO" },
    ],
    statuses: ["Draft", "To Deliver and Bill", "To Bill", "To Deliver", "Completed", "On Hold", "Closed"],
    columns: [
      { field: "name", label: "Sales Order", kind: "text" },
      { field: "po_no", label: "Customer PO", kind: "text" },
      { field: "transaction_date", label: "Date", kind: "date" },
      { field: "delivery_date", label: "Deliver by", kind: "date" },
      { field: "grand_total", label: "Amount", kind: "money" },
      { field: "per_delivered", label: "Delivered", kind: "percent" },
      { field: "per_billed", label: "Invoiced", kind: "percent" },
      { field: "status", label: "Status", kind: "status" },
    ],
  },
  "purchase-order": {
    doctypeKey: "purchase-order",
    doctype: "Purchase Order",
    desk: "ap",
    washRole: "order",
    stage: "mockup",
    party: { field: "supplier", label: "Vendor" },
    searches: [
      { id: "ref", field: "title", label: "PO# (logbook)", hint: "One order by its logbook number" },
      { id: "party", field: "supplier", label: "Vendor", hint: "Every order to one vendor" },
    ],
    statuses: ["Draft", "To Receive and Bill", "To Receive", "To Bill", "Completed", "On Hold", "Closed"],
    columns: [
      { field: "title", label: "PO# (logbook)", kind: "text" },
      { field: "transaction_date", label: "Ordered", kind: "date" },
      { field: "schedule_date", label: "Expected", kind: "date" },
      { field: "grand_total", label: "Amount", kind: "money" },
      { field: "per_received", label: "Received", kind: "percent" },
      { field: "per_billed", label: "Billed", kind: "percent" },
      { field: "status", label: "Status", kind: "status" },
    ],
  },
  "purchase-receipt": {
    doctypeKey: "purchase-receipt",
    doctype: "Purchase Receipt",
    desk: "ap",
    washRole: "fulfill",
    stage: "mockup",
    party: { field: "supplier", label: "Vendor" },
    searches: [
      { id: "party", field: "supplier", label: "Vendor", hint: "Every receipt from one vendor" },
      {
        id: "ref",
        field: "supplier_delivery_note",
        label: "Packing slip no.",
        hint: "One receipt by the vendor's packing slip",
      },
    ],
    statuses: ["Draft", "To Bill", "Partly Billed", "Completed", "Return", "Closed"],
    columns: [
      { field: "name", label: "Item Receipt", kind: "text" },
      { field: "supplier_delivery_note", label: "Packing slip", kind: "text" },
      { field: "posting_date", label: "Received", kind: "date" },
      { field: "grand_total", label: "Amount", kind: "money" },
      { field: "per_billed", label: "Billed", kind: "percent" },
      { field: "status", label: "Status", kind: "status" },
    ],
  },
  "purchase-invoice": {
    doctypeKey: "purchase-invoice",
    doctype: "Purchase Invoice",
    desk: "ap",
    washRole: "invoice",
    stage: "mockup",
    party: { field: "supplier", label: "Vendor" },
    searches: [
      { id: "ref", field: "bill_no", label: "Vendor's invoice no.", hint: "One bill by the vendor's Ref No." },
      { id: "party", field: "supplier", label: "Vendor", hint: "Every bill from one vendor" },
    ],
    statuses: ["Draft", "Unpaid", "Overdue", "Partly Paid", "Paid", "Return"],
    columns: [
      { field: "bill_no", label: "Ref No.", kind: "text" },
      { field: "bill_date", label: "Bill date", kind: "date" },
      { field: "due_date", label: "Due", kind: "date" },
      { field: "grand_total", label: "Amount", kind: "money" },
      { field: "outstanding_amount", label: "Open balance", kind: "money" },
      { field: "status", label: "Status", kind: "status" },
    ],
  },
  "payment-entry": {
    doctypeKey: "payment-entry",
    doctype: "Payment Entry",
    desk: "both",
    washRole: "payment",
    stage: "mockup",
    // Pay and Receive are one doctype; the page switches direction (payment_type) and the
    // party label follows it. See findPartyLabel.
    directional: true,
    party: { field: "party", label: "Vendor" },
    searches: [
      { id: "party", field: "party", label: "Vendor", hint: "Every payment to one vendor" },
      { id: "ref", field: "reference_no", label: "Check / reference no.", hint: "One payment by its check no." },
    ],
    statuses: ["Draft", "Submitted", "Cancelled"],
    columns: [
      { field: "reference_no", label: "Check / ref", kind: "text" },
      { field: "posting_date", label: "Date", kind: "date" },
      { field: "mode_of_payment", label: "Method", kind: "text" },
      { field: "paid_amount", label: "Amount", kind: "money" },
      { field: "unallocated_amount", label: "Unapplied", kind: "money" },
      { field: "status", label: "Status", kind: "status" },
    ],
  },
  "sales-invoice": {
    doctypeKey: "sales-invoice",
    doctype: "Sales Invoice",
    desk: "ar",
    washRole: "invoice",
    stage: "mockup",
    party: { field: "customer", label: "Customer" },
    searches: [
      { id: "party", field: "customer", label: "Customer", hint: "Every invoice for one customer" },
      { id: "ref", field: "po_no", label: "Customer's PO no.", hint: "One invoice by the customer's PO" },
    ],
    statuses: ["Draft", "Unpaid", "Overdue", "Partly Paid", "Paid", "Return"],
    columns: [
      { field: "name", label: "Invoice", kind: "text" },
      { field: "po_no", label: "Customer PO", kind: "text" },
      { field: "posting_date", label: "Date", kind: "date" },
      { field: "due_date", label: "Due", kind: "date" },
      { field: "grand_total", label: "Amount", kind: "money" },
      { field: "outstanding_amount", label: "Open balance", kind: "money" },
      { field: "status", label: "Status", kind: "status" },
    ],
  },
});

/** Doctype keys with a Find page, in the order the sample-data flow runs. */
export const FIND_SKIN_DOCTYPES = Object.freeze(Object.keys(FIND_SKINS));

/**
 * @param {string|null|undefined} doctypeKey slug or title ("purchase-invoice" / "Purchase Invoice")
 * @returns {FindSkin|null}
 */
export function findSkinFor(doctypeKey) {
  const key = String(doctypeKey || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  return Object.prototype.hasOwnProperty.call(FIND_SKINS, key) ? FIND_SKINS[key] : null;
}

/**
 * Page title — the same words Recent uses for this list's slot, so the row and the page agree.
 * @param {string} doctypeKey
 */
export function findSkinTitle(doctypeKey) {
  return listLabelForDoctype(doctypeKey);
}

/**
 * Singular noun for the "New …" button ("New Bill").
 * @param {string} doctypeKey
 */
export function findSkinEntryLabel(doctypeKey) {
  return formLabelForDoctype(doctypeKey);
}

/**
 * Party label for a direction — Payment Entry pays a Vendor or receives from a Customer.
 * @param {FindSkin} skin
 * @param {"Pay"|"Receive"|string} [direction]
 */
export function findPartyLabel(skin, direction) {
  if (!skin) return "";
  if (skin.directional) return direction === "Receive" ? "Customer" : "Vendor";
  return skin.party.label;
}

/**
 * Which search box gets the cursor.
 *
 * A Find button on a document is a request to locate *one* document, so it lands on the
 * reference-number box (OI-056 point 3); any other door (Recent, the Doc tab on a list) is
 * general browsing and lands on the party box. A prefilled box wins either way — the clerk
 * arrived with that value in hand.
 *
 * @param {FindSkin|null} skin
 * @param {{ via?: "find-button"|"browse", prefill?: Record<string, string> }} [opts]
 * @returns {string} search id, or "" when the skin has none
 */
export function focusFor(skin, opts = {}) {
  if (!skin || !skin.searches.length) return "";
  const prefill = opts.prefill && typeof opts.prefill === "object" ? opts.prefill : {};
  const filled = skin.searches.find((s) => String(prefill[s.field] ?? "").trim());
  if (filled) return filled.id;
  const wanted = opts.via === "find-button" ? "ref" : "party";
  const hit = skin.searches.find((s) => s.id === wanted);
  return (hit || skin.searches[0]).id;
}

/**
 * Keep only prefill values the skin actually searches by (the rest would become filters on
 * fields the page never shows).
 * @param {FindSkin|null} skin
 * @param {Record<string, unknown>|null|undefined} values keyed by fieldname
 * @returns {Record<string, string>}
 */
export function findSearchValues(skin, values) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!skin || !values || typeof values !== "object") return out;
  for (const s of skin.searches) {
    const v = values[s.field];
    const text = v == null ? "" : String(v).trim();
    if (text) out[s.field] = text;
  }
  return out;
}

/**
 * The Vanilla list address with the Find page's searches as filters — Frappe reads
 * `?field=value` into list filters itself, so nothing has to be typed into its page.
 *
 * @param {string} doctypeKey
 * @param {{ values?: Record<string, unknown>, status?: string, direction?: string }} [opts]
 * @returns {string} e.g. `/app/purchase-invoice?bill_no=123&supplier=SAMPLE%20Vendor%2001`
 */
export function findVanillaListRoute(doctypeKey, opts = {}) {
  const skin = findSkinFor(doctypeKey);
  if (!skin) return "";
  const params = new URLSearchParams();
  const values = findSearchValues(skin, opts.values);
  for (const [field, value] of Object.entries(values)) params.set(field, value);
  const status = opts.status != null ? String(opts.status).trim() : "";
  if (status && skin.statuses.includes(status)) params.set("status", status);
  if (skin.directional && (opts.direction === "Pay" || opts.direction === "Receive")) {
    params.set("payment_type", opts.direction);
  }
  const qs = params.toString().replace(/\+/g, "%20");
  return `/app/${skin.doctypeKey}${qs ? `?${qs}` : ""}`;
}
