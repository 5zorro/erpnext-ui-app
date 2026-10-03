/**
 * Fetching a trace over HTTP (plan 2026-10-03 stage 2). Pure: which questions to ask ERPNext, and
 * an orchestrator that asks them through injected `getDoc` / `getList` (main.js passes its
 * `session.fetch`-backed `frappeResourceGetDoc` / `frappeResourceGetList`, the G1 path — never
 * the hidden ERP page).
 *
 * The walk, from each document in focus:
 *   - **up** — the documents its own lines (and its `return_against`, and a payment's references)
 *     name. Free: they are fields on a document already fetched.
 *   - **down** — every document whose lines name it. One list query per link pointing at its
 *     doctype, filtering on the child table's field (`[["Purchase Invoice Item", "purchase_receipt",
 *     "=", name]]`), plus returns against it and payments referencing it.
 * A document reached going up keeps going up; one reached going down keeps going down. So a
 * payment found under a bill is not walked back into the other bills it paid — they stay
 * "Other payables" until the payment itself is put in focus (5zorro 2026-09-28).
 *
 * Only submitted documents (`docstatus` 1) are followed: a cancelled original is replaced by its
 * amendment, which carries `amended_from`.
 */

import { TRACE_DOCTYPES, TABLE_DOCTYPE, PAYMENT_LINK, LINE_LINKS, linksInto } from "./trace-links.js";
import { docKey, keyParts } from "./trace-graph.js";

/** A trace never fetches more than this many documents (a busy Sales Order could reach hundreds). */
export const TRACE_MAX_DOCS = 80;

/**
 * The list queries that find a document's children. Each returns names only.
 * @param {string} key "Doctype::name"
 * @returns {Array<{ doctype: string, filters: unknown[], fields: string[], why: string }>}
 */
export function downstreamQueries(key) {
  const { doctype, name } = keyParts(key);
  const into = linksInto(doctype);
  const submitted = ["docstatus", "=", 1];
  const out = into.lines.map((l) => ({
    doctype: l.doctype,
    filters: [[TABLE_DOCTYPE[l.doctype], l.field, "=", name], submitted],
    fields: ["name"],
    why: `${l.doctype} lines whose ${l.field} is ${name}`,
  }));
  for (const h of into.headers) {
    out.push({ doctype: h.doctype, filters: [[h.field, "=", name], ["is_return", "=", 1], submitted], fields: ["name"], why: `returns against ${name}` });
  }
  if (into.payments) {
    out.push({
      doctype: PAYMENT_LINK.doctype,
      filters: [[PAYMENT_LINK.tableDoctype, PAYMENT_LINK.nameField, "=", name], [PAYMENT_LINK.tableDoctype, PAYMENT_LINK.doctypeField, "=", doctype], submitted],
      fields: ["name"],
      why: `payments referencing ${name}`,
    });
  }
  // Two links can point the same way (a receipt names both its PO and that PO's Sales Order):
  // ask each question once.
  const seen = new Set();
  return out.filter((q) => { const k = JSON.stringify([q.doctype, q.filters]); if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * The documents a fetched document names: its lines' sources (every link field, including the
 * skip-level ones, so the walk up never misses a hop), its `return_against`, a payment's
 * references. Keys of doctypes the trace does not know (a Journal Entry reference) are left out.
 * @param {Record<string, any>} doc
 * @returns {string[]}
 */
export function upstreamKeys(doc) {
  const out = new Set();
  for (const row of doc.items || []) {
    for (const l of LINE_LINKS.filter((x) => x.doctype === doc.doctype)) if (row[l.field]) out.add(`${l.from}::${row[l.field]}`);
  }
  if (doc.is_return && doc.return_against) out.add(`${doc.doctype}::${doc.return_against}`);
  if (doc.doctype === PAYMENT_LINK.doctype) {
    for (const r of doc[PAYMENT_LINK.table] || []) {
      if (TRACE_DOCTYPES[r[PAYMENT_LINK.doctypeField]]) out.add(`${r[PAYMENT_LINK.doctypeField]}::${r[PAYMENT_LINK.nameField]}`);
    }
  }
  return [...out];
}

/**
 * Fetch a trace: the focus documents, everything they came from, everything that came from them.
 *
 * @param {object} opts
 * @param {string[]} opts.focus keys "Doctype::name"
 * @param {(doctype: string, name: string) => Promise<{ ok: boolean, doc?: Record<string, any>, reason?: string }>} opts.getDoc
 * @param {(q: { doctype: string, filters: unknown[], fields: string[] }) => Promise<{ ok: boolean, rows?: Array<{ name: string }>, reason?: string }>} opts.getList
 * @param {number} [opts.maxDocs]
 * @returns {Promise<{ docs: Array<Record<string, any>>, truncated: boolean, failed: Array<{ key: string, reason: string }>, asked: number }>}
 */
export async function fetchTrace({ focus, getDoc, getList, maxDocs = TRACE_MAX_DOCS }) {
  /** @type {Map<string, Record<string, any>>} */
  const docs = new Map();
  const failed = [];
  let asked = 0, truncated = false;
  /** @type {Array<{ key: string, up: boolean, down: boolean }>} */
  const queue = focus.map((key) => ({ key, up: true, down: true }));
  const dirs = new Map(); // key → { up, down } already walked

  while (queue.length) {
    const { key, up, down } = queue.shift();
    const was = dirs.get(key) || { up: false, down: false };
    if ((was.up || !up) && (was.down || !down)) continue; // nothing new to walk from here
    dirs.set(key, { up: was.up || up, down: was.down || down });

    let doc = docs.get(key);
    if (!doc) {
      if (docs.size >= maxDocs) { truncated = true; continue; }
      const { doctype, name } = keyParts(key);
      if (!TRACE_DOCTYPES[doctype]) continue;
      asked++;
      const res = await getDoc(doctype, name);
      if (!res || !res.ok || !res.doc) { failed.push({ key, reason: (res && res.reason) || "not found" }); continue; }
      if (Number(res.doc.docstatus) !== 1) continue; // drafts and cancelled originals are not followed
      doc = { doctype, ...res.doc };
      docs.set(key, doc);
    }
    if (up && !was.up) for (const k of upstreamKeys(doc)) queue.push({ key: k, up: true, down: false });
    if (down && !was.down) {
      for (const q of downstreamQueries(key)) {
        asked++;
        const res = await getList(q);
        if (!res || !res.ok) { failed.push({ key, reason: `${q.why}: ${(res && res.reason) || "failed"}` }); continue; }
        for (const row of res.rows || []) queue.push({ key: `${q.doctype}::${row.name}`, up: false, down: true });
      }
    }
  }
  return { docs: [...docs.values()], truncated, failed, asked };
}

export { docKey };
