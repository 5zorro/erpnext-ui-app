/**
 * The trace's link registry (plan 2026-10-03, OI-041): which field on which document says "this
 * came from that one". One table, read by every trace view — the bowtie, the lifecycle table, the
 * statement and the Gantt — so a new kind of link is a new row here, never a new drawing rule
 * (5zorro 2026-09-29: "it would be really hard for a human to just intuitively know").
 *
 * Every field below was read from this instance's v16 schema (`tabDocField`, 2026-09-29) and is
 * proven by `ops/trace/probe-trace-queries.js` against the live site: Frappe answers a query on a
 * field that does not exist with "Field not permitted in query", so an empty answer is proof.
 *
 * Links are **line to line**. A line names the document it came from (`field`) and, normally, the
 * exact line on it (`row` — ERPNext's own `*_detail` / `*_item` ids). Matching by item code is
 * only the fallback for a line that names a document but no line on it, which is also how an item
 * that is not on its source document is caught.
 */

/**
 * What the trace knows about each kind of document.
 *   key   — short id used by the views
 *   lane  — "buy" (A/P) or "sell" (A/R)
 *   stage — its column in the lifecycle's "by stage" view
 *   role  — its doc wash (src/doc-wash.js)
 *   party — the header field naming the vendor or customer
 *   theirs — the header field holding the other side's number, if any (src/doc-number-pref.js
 *            THEIR_NUMBER says the same for the Doc skins)
 */
export const TRACE_DOCTYPES = Object.freeze({
  Quotation: Object.freeze({ key: "est", lane: "sell", stage: "quoted", role: "request", party: "party_name", theirs: "" }),
  "Sales Order": Object.freeze({ key: "so", lane: "sell", stage: "ordered", role: "order", party: "customer", theirs: "po_no" }),
  "Material Request": Object.freeze({ key: "mr", lane: "buy", stage: "requested", role: "request", party: "", theirs: "" }),
  "Purchase Order": Object.freeze({ key: "po", lane: "buy", stage: "bought", role: "order", party: "supplier", theirs: "" }),
  "Purchase Receipt": Object.freeze({ key: "pr", lane: "buy", stage: "received", role: "fulfill", party: "supplier", theirs: "supplier_delivery_note" }),
  "Purchase Invoice": Object.freeze({ key: "bill", lane: "buy", stage: "billed", role: "invoice", party: "supplier", theirs: "bill_no" }),
  "Delivery Note": Object.freeze({ key: "dn", lane: "sell", stage: "shipped", role: "fulfill", party: "customer", theirs: "" }),
  "Sales Invoice": Object.freeze({ key: "si", lane: "sell", stage: "invoiced", role: "invoice", party: "customer", theirs: "" }),
  "Payment Entry": Object.freeze({ key: "pay", lane: "", stage: "paid", role: "payment", party: "party", theirs: "reference_no" }),
});

/**
 * Line links: `doctype`'s `table` rows carry `field` (the source document) and `row` (the source
 * line). Listed per doctype **nearest source first**: a Bill line made from a receipt carries both
 * `purchase_receipt` and `purchase_order`, and its parent is the receipt — the PO is the
 * receipt's parent, one hop further. `via` marks a link that is normally a skip (the nearer one is
 * also set); it is still read, to check the two agree.
 *
 * Deliberately not here (yet), each noted in the plan: drop ship's back-links (Sales Order Item /
 * Sales Invoice Item / Delivery Note Item `purchase_order` — the PO line's own `sales_order` already
 * carries the link), Supplier Quotation, Blanket Order, Pick List, Production Plan, inter-company
 * references.
 */
export const LINE_LINKS = Object.freeze([
  { doctype: "Sales Order", table: "items", field: "prevdoc_docname", row: "quotation_item", from: "Quotation" },
  { doctype: "Material Request", table: "items", field: "sales_order", row: "sales_order_item", from: "Sales Order" },
  { doctype: "Purchase Order", table: "items", field: "material_request", row: "material_request_item", from: "Material Request" },
  { doctype: "Purchase Order", table: "items", field: "sales_order", row: "sales_order_item", from: "Sales Order" },
  { doctype: "Purchase Receipt", table: "items", field: "purchase_order", row: "purchase_order_item", from: "Purchase Order" },
  { doctype: "Purchase Receipt", table: "items", field: "material_request", row: "material_request_item", from: "Material Request" },
  { doctype: "Purchase Receipt", table: "items", field: "sales_order", row: "sales_order_item", from: "Sales Order", via: true },
  { doctype: "Purchase Invoice", table: "items", field: "purchase_receipt", row: "pr_detail", from: "Purchase Receipt" },
  { doctype: "Purchase Invoice", table: "items", field: "purchase_order", row: "po_detail", from: "Purchase Order" },
  { doctype: "Purchase Invoice", table: "items", field: "material_request", row: "material_request_item", from: "Material Request", via: true },
  { doctype: "Delivery Note", table: "items", field: "against_sales_order", row: "so_detail", from: "Sales Order" },
  { doctype: "Delivery Note", table: "items", field: "against_sales_invoice", row: "si_detail", from: "Sales Invoice" },
  { doctype: "Sales Invoice", table: "items", field: "delivery_note", row: "dn_detail", from: "Delivery Note" },
  { doctype: "Sales Invoice", table: "items", field: "sales_order", row: "so_detail", from: "Sales Order" },
].map((l) => Object.freeze({ via: false, ...l })));

/**
 * Header links. `return` is a credit or return pointing at what it reverses (it settles like a
 * payment — 5zorro 2026-09-29 — so the views put it in the payment column); `amends` is the
 * void-and-amend chain (`…-1`), a relation and not a flow.
 */
export const HEADER_LINKS = Object.freeze([
  { doctype: "Purchase Invoice", field: "return_against", from: "Purchase Invoice", kind: "return" },
  { doctype: "Sales Invoice", field: "return_against", from: "Sales Invoice", kind: "return" },
  { doctype: "Purchase Receipt", field: "return_against", from: "Purchase Receipt", kind: "return" },
  { doctype: "Delivery Note", field: "return_against", from: "Delivery Note", kind: "return" },
  ...Object.keys(TRACE_DOCTYPES).map((doctype) => ({ doctype, field: "amended_from", from: doctype, kind: "amends" })),
].map((l) => Object.freeze(l)));

/**
 * A return's lines point at the line they reverse with a row id only — the document is the header's
 * `return_against` (Purchase Invoice Item / Sales Invoice Item, v16 schema).
 */
export const RETURN_ROW = Object.freeze({
  "Purchase Invoice": "purchase_invoice_item",
  "Sales Invoice": "sales_invoice_item",
  "Purchase Receipt": "purchase_receipt_item",
  "Delivery Note": "dn_detail",
});

/**
 * A payment's links are its Payment Entry Reference rows. `reference_doctype` can also be a Purchase
 * Order or Sales Order (an advance, paid before any invoice) or a Journal Entry.
 */
export const PAYMENT_LINK = Object.freeze({
  doctype: "Payment Entry",
  table: "references",
  tableDoctype: "Payment Entry Reference",
  doctypeField: "reference_doctype",
  nameField: "reference_name",
  amountField: "allocated_amount",
});

/** The child doctype behind each `table` (what a child-field filter names). */
export const TABLE_DOCTYPE = Object.freeze({
  Quotation: "Quotation Item",
  "Sales Order": "Sales Order Item",
  "Material Request": "Material Request Item",
  "Purchase Order": "Purchase Order Item",
  "Purchase Receipt": "Purchase Receipt Item",
  "Purchase Invoice": "Purchase Invoice Item",
  "Delivery Note": "Delivery Note Item",
  "Sales Invoice": "Sales Invoice Item",
});

/**
 * The date a document happened (the date on the paper), and the date it reached the books.
 *
 * | doctype | paper date | posted |
 * |---|---|---|
 * | Bill | the vendor's invoice date (`bill_date`), else posting | `posting_date` |
 * | Payment | the check date (`reference_date`), else posting | `posting_date` |
 * | Receipt / Delivery Note / Invoice | `posting_date` (for a receipt, the day the goods arrived) | the day it was created |
 * | PO / Sales Order / Estimate / Material Request | `transaction_date` | the day it was created |
 *
 * "Created" stands in for "submitted" (right 9 times in 10, 5zorro 2026-09-28) until the submitter is
 * read from the version history — an open item in the plan.
 *
 * @param {Record<string, any>} doc an `/api/resource` document
 * @returns {{ paper: string, posted: string }} YYYY-MM-DD, "" when unknown
 */
export function traceDates(doc) {
  const d = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");
  const created = d(doc && doc.creation);
  switch (doc && doc.doctype) {
    case "Purchase Invoice":
      return { paper: d(doc.bill_date) || d(doc.posting_date), posted: d(doc.posting_date) || created };
    case "Payment Entry":
      return { paper: d(doc.reference_date) || d(doc.posting_date), posted: d(doc.posting_date) || created };
    case "Purchase Receipt":
    case "Delivery Note":
    case "Sales Invoice":
      return { paper: d(doc.posting_date), posted: created || d(doc.posting_date) };
    default:
      return { paper: d(doc && doc.transaction_date) || created, posted: created };
  }
}

/** Line links of one doctype, nearest source first. @param {string} doctype */
export function lineLinksFor(doctype) {
  return LINE_LINKS.filter((l) => l.doctype === doctype);
}

/** Every link that points *at* a doctype — what to ask to find a document's children. @param {string} doctype */
export function linksInto(doctype) {
  return {
    lines: LINE_LINKS.filter((l) => l.from === doctype),
    headers: HEADER_LINKS.filter((l) => l.from === doctype && l.kind === "return"),
    payments: ["Purchase Invoice", "Sales Invoice", "Purchase Order", "Sales Order"].includes(doctype),
  };
}

/** The fields a trace needs on each line of a doctype: its own, plus every link field and row id. @param {string} doctype */
export function traceLineFields(doctype) {
  // A Material Request line has no net amount (proven by the probe, 2026-10-03): its `amount` is all there is.
  const base = ["name", "idx", "item_code", "item_name", "qty", "rate", "amount", ...(doctype === "Material Request" ? [] : ["base_net_amount"])];
  // A Landed Cost Voucher writes its share onto the *receipt's* line (or a stock-updating bill's).
  const extra = doctype === "Purchase Invoice" ? ["item_tax_amount", "landed_cost_voucher_amount", "valuation_rate", "is_fixed_asset"]
    : doctype === "Purchase Receipt" ? ["item_tax_amount", "landed_cost_voucher_amount", "valuation_rate"] : [];
  const links = lineLinksFor(doctype).flatMap((l) => [l.field, l.row]);
  const ret = RETURN_ROW[doctype] ? [RETURN_ROW[doctype]] : [];
  return [...new Set([...base, ...extra, ...links, ...ret])];
}
