#!/usr/bin/env node
/**
 * Export a trace fixture from a **copy** of a seeded sandbox database (plan 2026-10-03 stage 1).
 *
 * It runs the real `fetchTrace` (src/trace-query.js) with SQL standing in for HTTP: `getDoc` reads a
 * document and its child tables, `getList` answers exactly the child-table filters the HTTP readers
 * send. So the fixture is what the trace would fetch from that site, in `/api/resource` shape, and
 * writing it also exercises the walk on real link fields.
 *
 *   DB=trace_fixture_ro node ops/trace/export-trace-fixture.js "Sales Order::SAL-ORD-2026-00543" … > tests/fixtures/x.json
 *
 * Reads only. Point it at a restored copy, never at the site 5zorro is dogfooding.
 * Keeps only the fields the trace reads (no company, no addresses, no owner beyond the user id).
 */

import { execFileSync } from "node:child_process";
import { TABLE_DOCTYPE, PAYMENT_LINK, traceLineFields } from "../../src/trace-links.js";
import { fetchTrace } from "../../src/trace-query.js";

const DB = process.env.DB;
if (!DB || DB === "_2bc462bbddf20743") { console.error("Set DB to a restored copy (not the live site's database)."); process.exit(2); }
const focus = process.argv.slice(2);

const q = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
function sql(query) {
  const out = execFileSync("docker", ["exec", "frappe_docker-db-1", "mariadb", "-uroot", "-padmin", "-B", DB, "-e", query], { encoding: "utf8", maxBuffer: 64 << 20 });
  const [head, ...lines] = out.split("\n").filter(Boolean);
  if (!head) return [];
  const cols = head.split("\t");
  return lines.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [cols[i], v === "NULL" ? null : v])));
}

const NUMERIC = new Set(["qty", "rate", "amount", "base_net_amount", "item_tax_amount", "landed_cost_voucher_amount", "valuation_rate", "grand_total",
  "base_grand_total", "outstanding_amount", "paid_amount", "allocated_amount", "tax_amount", "base_tax_amount_after_discount_amount", "docstatus", "is_return", "idx"]);
const keep = (row, fields) => Object.fromEntries(fields.filter((f) => row[f] !== undefined && row[f] !== null && row[f] !== "")
  .map((f) => [f, NUMERIC.has(f) ? Number(row[f]) : row[f]]));
const HEADER = ["name", "docstatus", "creation", "owner", "transaction_date", "posting_date", "bill_date", "due_date", "reference_date", "reference_no",
  "clearance_date", "paid_amount", "payment_type", "party_type", "party", "mode_of_payment", "party_name", "customer", "supplier", "po_no", "bill_no",
  "supplier_delivery_note", "is_return", "return_against", "amended_from", "grand_total", "base_grand_total", "outstanding_amount"];
const TAX = ["idx", "category", "charge_type", "add_deduct_tax", "description", "tax_amount", "base_tax_amount_after_discount_amount"];
const REF = ["idx", "reference_doctype", "reference_name", "allocated_amount"];

async function getDoc(doctype, name) {
  const [h] = sql(`SELECT * FROM \`tab${doctype}\` WHERE name=${q(name)}`);
  if (!h) return { ok: false, reason: "not found" };
  const doc = { doctype, ...keep(h, HEADER) };
  if (TABLE_DOCTYPE[doctype]) {
    doc.items = sql(`SELECT * FROM \`tab${TABLE_DOCTYPE[doctype]}\` WHERE parent=${q(name)} AND parenttype=${q(doctype)} ORDER BY idx`)
      .map((r) => keep(r, traceLineFields(doctype)));
  }
  if (doctype === "Purchase Invoice") {
    doc.taxes = sql(`SELECT * FROM \`tabPurchase Taxes and Charges\` WHERE parent=${q(name)} AND parenttype='Purchase Invoice' ORDER BY idx`).map((r) => keep(r, TAX));
  }
  if (doctype === PAYMENT_LINK.doctype) {
    doc.references = sql(`SELECT * FROM \`tab${PAYMENT_LINK.tableDoctype}\` WHERE parent=${q(name)} ORDER BY idx`).map((r) => keep(r, REF));
  }
  return { ok: true, doc };
}

async function getList({ doctype, filters }) {
  const where = [];
  for (const f of filters) {
    if (f.length === 3) where.push(`p.\`${f[0]}\`=${q(f[2])}`);
    else where.push(`EXISTS (SELECT 1 FROM \`tab${f[0]}\` c WHERE c.parent=p.name AND c.parenttype=${q(doctype)} AND c.\`${f[1]}\`=${q(f[3])})`);
  }
  const rows = sql(`SELECT p.name FROM \`tab${doctype}\` p WHERE ${where.join(" AND ")}`);
  return { ok: true, rows };
}

const t = await fetchTrace({ focus, getDoc, getList, maxDocs: 80 });
if (t.failed.length) console.error("failed:", t.failed);
process.stdout.write(JSON.stringify({ focus, exported: new Date().toISOString().slice(0, 10), truncated: t.truncated, docs: t.docs }, null, 1) + "\n");
console.error(`${t.docs.length} documents, ${t.asked} questions${t.truncated ? ", TRUNCATED" : ""}`);
