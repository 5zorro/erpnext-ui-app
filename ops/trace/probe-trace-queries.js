#!/usr/bin/env node
/**
 * Prove every question the trace asks is valid on a live ERPNext — read-only (plan 2026-10-03,
 * stage 2). Frappe answers a query on a field that does not exist with "Field not permitted in
 * query", even when nothing matches; so asking about a document name that cannot exist proves each
 * field without touching data. Run against any site, blank or seeded:
 *
 *   ERP_URL=http://localhost:8080 ERP_USER=Administrator ERP_PASSWORD=… node ops/trace/probe-trace-queries.js
 *
 * Exit code 1 if any question is refused. Writes nothing (GETs only, after one login POST).
 */

import { TRACE_DOCTYPES, LINE_LINKS, RETURN_ROW, TABLE_DOCTYPE, PAYMENT_LINK, traceLineFields } from "../../src/trace-links.js";
import { downstreamQueries } from "../../src/trace-query.js";
import { buildFrappeResourceListUrl } from "../../src/erp-http-list.js";

const BASE = (process.env.ERP_URL || "http://localhost:8080").replace(/\/+$/, "");
const USER = process.env.ERP_USER || "Administrator";
const PASSWORD = process.env.ERP_PASSWORD;
if (!PASSWORD) { console.error("Set ERP_PASSWORD (and ERP_USER if not Administrator)."); process.exit(2); }
const NONE = "TRACE-PROBE-NO-SUCH-DOC";

/** Header fields the trace reads, per doctype (the ones that exist on it). */
const HEADER = {
  Quotation: ["transaction_date", "party_name", "amended_from"],
  "Sales Order": ["transaction_date", "customer", "po_no", "amended_from"],
  "Material Request": ["transaction_date", "amended_from"],
  "Purchase Order": ["transaction_date", "supplier", "amended_from"],
  "Purchase Receipt": ["posting_date", "supplier", "supplier_delivery_note", "is_return", "return_against", "amended_from"],
  "Purchase Invoice": ["posting_date", "bill_date", "due_date", "supplier", "bill_no", "is_return", "return_against", "grand_total", "base_grand_total", "outstanding_amount", "amended_from"],
  "Delivery Note": ["posting_date", "customer", "is_return", "return_against", "amended_from"],
  "Sales Invoice": ["posting_date", "due_date", "customer", "is_return", "return_against", "grand_total", "base_grand_total", "outstanding_amount", "amended_from"],
  "Payment Entry": ["posting_date", "reference_date", "reference_no", "clearance_date", "paid_amount", "payment_type", "party_type", "party", "mode_of_payment", "amended_from"],
};

let cookie = "";
async function login() {
  const res = await fetch(`${BASE}/api/method/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usr: USER, pwd: PASSWORD }) });
  cookie = (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")]).filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) throw new Error(`login ${res.status}`);
}
async function ask(doctype, query) {
  const url = buildFrappeResourceListUrl(BASE, doctype, { limit: 1, ...query });
  const res = await fetch(url, { headers: { cookie } });
  const body = await res.json().catch(() => ({}));
  const err = body.exception || body.exc_type || (res.ok ? "" : `HTTP ${res.status}`);
  return { ok: res.ok && !err, err: String(err).split("\n")[0] };
}

const results = [];
const run = async (what, doctype, query) => { const r = await ask(doctype, query); results.push({ what, ...r }); };

await login();
for (const [doctype, fields] of Object.entries(HEADER)) {
  if (!TRACE_DOCTYPES[doctype]) continue;
  await run(`${doctype}: header fields`, doctype, { fields: ["name", "docstatus", "creation", ...fields] });
}
for (const doctype of Object.keys(TABLE_DOCTYPE)) {
  for (const f of traceLineFields(doctype)) {
    if (f === "name" || f === "idx") continue;
    await run(`${TABLE_DOCTYPE[doctype]}.${f}`, doctype, { fields: ["name"], filters: [[TABLE_DOCTYPE[doctype], f, "=", NONE]] });
  }
}
for (const l of LINE_LINKS) await run(`link ${l.doctype}.${l.field} / ${l.row}`, l.doctype, { fields: ["name"], filters: [[TABLE_DOCTYPE[l.doctype], l.field, "=", NONE], [TABLE_DOCTYPE[l.doctype], l.row, "=", NONE]] });
for (const [doctype, f] of Object.entries(RETURN_ROW)) await run(`return row ${TABLE_DOCTYPE[doctype]}.${f}`, doctype, { fields: ["name"], filters: [[TABLE_DOCTYPE[doctype], f, "=", NONE]] });
for (const f of ["category", "charge_type", "add_deduct_tax", "description", "account_head", "tax_amount", "base_tax_amount_after_discount_amount", "allocate_full_amount_to_stock_items"]) {
  await run(`Purchase Taxes and Charges.${f}`, "Purchase Invoice", { fields: ["name"], filters: [["Purchase Taxes and Charges", f, "=", NONE]] });
}
await run("Payment Entry Reference fields", PAYMENT_LINK.doctype, { fields: ["name"], filters: [[PAYMENT_LINK.tableDoctype, PAYMENT_LINK.nameField, "=", NONE], [PAYMENT_LINK.tableDoctype, PAYMENT_LINK.doctypeField, "=", "Purchase Invoice"], [PAYMENT_LINK.tableDoctype, PAYMENT_LINK.amountField, ">", 0]] });
for (const doctype of Object.keys(TRACE_DOCTYPES)) {
  for (const q of downstreamQueries(`${doctype}::${NONE}`)) await run(`downstream of ${doctype}: ${q.why.replace(NONE, "…")}`, q.doctype, { fields: q.fields, filters: q.filters });
}

const bad = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.what}${r.ok ? "" : `  — ${r.err}`}`);
console.log(`\n${results.length - bad.length}/${results.length} questions accepted by ${BASE}`);
process.exit(bad.length ? 1 : 0);
