/**
 * The lifecycle table (plan 2026-10-03, the mockup's Lifecycle tab): one row per item, for each
 * story in focus — a Sales Order, a Material Request (stock), or a PO / Bill with no order behind
 * it. Each row carries the same numbers twice: by stage (quoted, ordered, … collected) and by
 * document, so the page can show "in date order" (one column per document, 5zorro 2026-09-30) or
 * "by stage" from one reading.
 *
 * A gap is marked on the cell where it shows up — ⚠ should not happen, ◌ still open, ⓘ worth
 * knowing — never prompted (5zorro's "mark the row" rule).
 */

import { TRACE_DOCTYPES } from "./trace-links.js";
import {
  costForSalesOrderLine, dateOrder, docKey, keyParts, landedInTrace, lineAmount, paidShare, reachFrom,
} from "./trace-graph.js";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The by-stage columns, in process order. */
export const LIFECYCLE_STAGES = Object.freeze([
  "quoted", "ordered", "requested", "bought", "received", "billed", "credited", "paidAp", "shipped", "invoiced", "paidAr",
]);

const STAGE_OF = (doc) => {
  if (doc.doctype === "Purchase Invoice" && doc.is_return) return "credited";
  if (doc.doctype === "Sales Invoice" && doc.is_return) return "invoiced"; // a credit note reduces what was invoiced
  return TRACE_DOCTYPES[doc.doctype].stage;
};

/**
 * @typedef {{ kind: "warn"|"open"|"info", text: string }} Mark
 * @typedef {{ qty: number|null, amt: number, pct: number|null, docs: Set<string>, marks: Mark[], due?: number }} Cell
 * @typedef {{ item: string, cells: Record<string, Cell>, byDoc: Record<string, Cell>, notes: Mark[],
 *   nic: boolean, warn: boolean, margin: number|null, marginNote: Mark|null }} LifecycleRow
 * @typedef {{ root: string, kind: "so"|"mr"|"po"|"bill", rows: LifecycleRow[], cols: string[],
 *   links: Array<{ from: string, to: string, back: boolean }>, docs: string[] }} LifecycleGroup
 */

/**
 * @param {import("./trace-graph.js").TraceGraph} graph
 * @param {string} rootKey
 * @param {Set<string>} claimedNic bill lines with no source already shown in an earlier group
 * @returns {LifecycleGroup}
 */
export function lifecycleGroup(graph, rootKey, claimedNic = new Set()) {
  const root = graph.docs.get(rootKey);
  const kind = { "Sales Order": "so", "Material Request": "mr", "Purchase Order": "po" }[root.doctype] || "bill";
  // A PO or Bill with no order behind it starts from its own lines that name no source.
  const sourced = new Set(graph.edges.filter((e) => e.to === rootKey).map((e) => e.toRow));
  const reached = reachFrom(graph, rootKey, (row) => kind === "so" || kind === "mr" || !sourced.has((root.items || []).indexOf(row)));

  /** @type {Map<string, LifecycleRow>} */
  const rows = new Map();
  const row = (item) => {
    if (!rows.has(item)) rows.set(item, { item, cells: {}, byDoc: {}, notes: [], nic: false, warn: false, margin: null, marginNote: null });
    return rows.get(item);
  };
  const cell = (bag, k) => (bag[k] || (bag[k] = { qty: 0, amt: 0, pct: null, docs: new Set(), marks: [] }));
  const add = (stage, key, item, qty, amt) => {
    const r = row(item);
    for (const c of [cell(r.cells, stage), cell(r.byDoc, key)]) { c.qty += qty; c.amt = r2(c.amt + amt); c.docs.add(key); }
  };
  const addPaid = (stage, item, base, share) => {
    const r = row(item), c = cell(r.cells, stage);
    c.qty = null; c.amt = r2(c.amt + base * share.frac); c.due = r2((c.due || 0) + base);
    for (const p of share.pays) {
      c.docs.add(p.key);
      const b = cell(r.byDoc, p.key);
      b.qty = null; b.pct = (b.pct || 0) + p.frac * 100; b.amt = r2(b.amt + base * p.frac);
    }
  };

  // Upstream of a Sales Order: the Estimate lines it came from.
  if (kind === "so") {
    for (const e of graph.edges) {
      if (e.to !== rootKey || e.fromRow === null) continue;
      const est = graph.docs.get(e.from), l = est.items[e.fromRow];
      add("quoted", e.from, l.item_code, Number(l.qty) || 0, lineAmount(l));
    }
  }

  const flagsInto = new Map(); // `${key}#${i}` → flag
  for (const e of graph.edges) if (e.flag && e.toRow !== null) flagsInto.set(`${e.to}#${e.toRow}`, e.flag);

  for (const [k, idx] of reached) {
    const doc = graph.docs.get(k), stage = STAGE_OF(doc);
    const share = doc.doctype === "Purchase Invoice" || doc.doctype === "Sales Invoice" ? paidShare(graph, k) : null;
    const lines = doc.items || [];
    const take = new Set(idx);
    // The bill's lines with no source at all (NIC) join the first story that claims the bill.
    if (doc.doctype === "Purchase Invoice" && !doc.is_return && (kind === "so" || !onASalesOrder(graph, k))) {
      graph.unsourced.filter((u) => u.key === k && !claimedNic.has(`${k}#${u.i}`)).forEach((u) => { take.add(u.i); claimedNic.add(`${k}#${u.i}`); row(u.row.item_code).nic = true; });
    }
    for (const i of take) {
      const l = lines[i];
      const amt = doc.doctype === "Purchase Invoice" && !doc.is_return ? landedInTrace(graph, k, i).landed : lineAmount(l);
      add(stage, k, l.item_code, Number(l.qty) || 0, amt);
      const f = flagsInto.get(`${k}#${i}`);
      if (f) { const m = { kind: f.kind, text: f.text }; cell(row(l.item_code).byDoc, k).marks.push(m); cell(row(l.item_code).cells, stage).marks.push(m); }
      if (share && !doc.is_return) addPaid(doc.doctype === "Purchase Invoice" ? "paidAp" : "paidAr", l.item_code, amt, share);
    }
  }

  const q = (r, s) => (r.cells[s] ? r.cells[s].qty || 0 : 0);
  const a = (r, s) => (r.cells[s] ? r.cells[s].amt || 0 : 0);
  const mark = (r, s, kind, text) => cell(r.cells, s).marks.push({ kind, text });
  for (const r of rows.values()) {
    if (kind === "mr" && q(r, "requested") > q(r, "bought")) mark(r, "bought", "open", `${q(r, "requested") - q(r, "bought")} requested, not ordered from a vendor yet.`);
    if (q(r, "bought") > q(r, "received")) mark(r, "received", "open", `${q(r, "bought") - q(r, "received")} not received yet.`);
    if (!r.nic && q(r, "received") > q(r, "billed")) mark(r, "billed", "open", `${q(r, "received") - q(r, "billed")} received, not billed yet.`);
    if (r.nic) mark(r, "billed", "info", "Typed on the bill with no source (NIC) — no PO or receipt behind it.");
    if (q(r, "credited")) mark(r, "credited", "info", `${Math.abs(q(r, "credited"))} credited back by the vendor.`);
    for (const s of ["paidAp", "paidAr"]) {
      const c = r.cells[s];
      if (c && c.due - c.amt > 0.005) mark(r, s, "open", `${r2(c.due - c.amt).toFixed(2)} ${s === "paidAp" ? "of the bill not paid yet" : "not collected yet"}.`);
    }
    if (kind === "so" && q(r, "ordered") > q(r, "invoiced")) mark(r, "invoiced", "open", `${q(r, "ordered") - q(r, "invoiced")} ordered, not invoiced yet.`);
  }

  // Margin: only a customer's order has a sale to measure against; stock bought ahead is not a loss.
  if (kind === "so") {
    const soItems = root.items || [];
    for (const r of rows.values()) {
      const invQ = q(r, "invoiced");
      if (invQ) {
        let cost = 0, known = true;
        soItems.forEach((l, i) => {
          if (l.item_code !== r.item) return;
          const c = costForSalesOrderLine(graph, rootKey, i);
          if (!c) known = false; else cost += c.unit * Math.min(invQ, Number(l.qty) || 0);
        });
        if (known) r.margin = r2(a(r, "invoiced") - cost);
        else r.marginNote = { kind: "warn", text: "Invoiced, but no cost traced to it." };
      } else if (q(r, "billed")) {
        r.margin = r2(-(a(r, "billed") - Math.abs(a(r, "credited"))));
        r.marginNote = q(r, "credited")
          ? { kind: "warn", text: "Returned, but not all of its landed cost (its share of the charges) was credited." }
          : { kind: "warn", text: `Cost with no sale: billed on this order, never invoiced.${r.nic ? " Overhead, or should it be on the invoice?" : ""}` };
      }
    }
  } else {
    for (const r of rows.values()) r.marginNote = { kind: "info", text: "Bought for stock (no Sales Order) — its margin shows when it sells." };
  }

  // A stage's marks show on the documents behind it; a mark with no document belongs to the item.
  for (const r of rows.values()) {
    for (const c of Object.values(r.cells)) for (const m of c.marks) {
      if (c.docs.size) c.docs.forEach((k) => { const b = r.byDoc[k]; if (b && !b.marks.includes(m)) b.marks.push(m); });
      else r.notes.push(m);
    }
    r.warn = Object.values(r.cells).some((c) => c.marks.some((m) => m.kind === "warn")) || (r.marginNote && r.marginNote.kind === "warn");
  }

  const cols = dateOrder(graph, [...new Set([...rows.values()].flatMap((r) => Object.keys(r.byDoc)))]);
  const inGroup = new Set(cols);
  const links = [];
  const seen = new Set();
  for (const e of graph.edges) {
    if (!inGroup.has(e.from) || !inGroup.has(e.to) || seen.has(e.from + ">" + e.to)) continue;
    seen.add(e.from + ">" + e.to);
    links.push({ from: e.from, to: e.to, back: cols.indexOf(e.to) < cols.indexOf(e.from) });
  }
  const order = [...(root.items || []).map((l) => l.item_code), ...rows.keys()];
  return { root: rootKey, kind, cols, links, docs: [...reached.keys()], rows: [...new Set(order)].filter((k) => rows.has(k)).map((k) => rows.get(k)) };
}

/** Is this bill part of some customer order's story? Its NIC lines then belong to that order. */
function onASalesOrder(graph, billKey) {
  for (const k of graph.docs.keys()) {
    if (keyParts(k).doctype === "Sales Order" && reachFrom(graph, k).has(billKey)) return true;
  }
  return false;
}

/**
 * The stories for whatever is in focus: each Sales Order, each Material Request, then any PO or
 * Bill no story has claimed yet.
 * @param {import("./trace-graph.js").TraceGraph} graph
 * @param {Iterable<string>} keys the documents in view
 */
export function lifecycleGroups(graph, keys) {
  const groups = [], claimedNic = new Set();
  const list = [...keys].filter((k) => graph.docs.has(k));
  const of = (dt) => list.filter((k) => keyParts(k).doctype === dt);
  const has = (k) => groups.some((g) => g.docs.includes(k));
  for (const k of of("Sales Order")) groups.push(lifecycleGroup(graph, k, claimedNic));
  for (const k of of("Material Request")) groups.push(lifecycleGroup(graph, k, claimedNic));
  for (const k of of("Purchase Order")) if (!has(k)) groups.push(lifecycleGroup(graph, k, claimedNic));
  for (const k of of("Purchase Invoice")) if (!has(k)) groups.push(lifecycleGroup(graph, k, claimedNic));
  return groups.filter((g) => g.rows.length);
}

export { docKey };
