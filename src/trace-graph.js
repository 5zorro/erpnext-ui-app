/**
 * The trace graph (plan 2026-10-03 stage 1, OI-041): ERPNext documents in, line-to-line links out,
 * and the readings every trace view shares — what came from what, what an item cost landed, what
 * margin it made, and where the story has a gap.
 *
 * Input is plain `/api/resource` documents (the shape `frappeResourceGetDoc` returns: header fields,
 * `doctype`, and child tables such as `items`, `taxes`, `references`). Nothing here fetches.
 *
 * The rules, each from 5zorro's mockup rounds (docs/mockups/bowtie-trace.html, Notes tab):
 *   - A line belongs to a story only through its own link: stock raised on a Material Request that
 *     rides on a customer's PO, receipt and bill never joins that customer's margin (`reachFrom`).
 *   - Landed cost is ERPNext's own number: the line plus its `item_tax_amount` (the "Valuation" /
 *     "Valuation and Total" charges ERPNext spread by net amount — buying_controller.py
 *     `update_valuation_rate`) plus `landed_cost_voucher_amount`. Charges ERPNext did not put into
 *     cost are reported beside it, never quietly spread (`unallocatedCharges`).
 *   - A gap is a mark on the line where it shows up (mark the row, don't prompt): a line naming a
 *     source that has no such item, more taken from a source line than it had, a document dated
 *     before the one it came from.
 */

import {
  TRACE_DOCTYPES,
  HEADER_LINKS,
  PAYMENT_LINK,
  RETURN_ROW,
  lineLinksFor,
  traceDates,
} from "./trace-links.js";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Where a line with no source means "typed by hand" (NIC) rather than "a story starts here". */
const NIC_DOCTYPES = new Set(["Purchase Invoice", "Purchase Receipt"]);

/** @param {{ doctype: string, name: string }} doc */
export function docKey(doc) {
  return `${doc.doctype}::${doc.name}`;
}

/** @param {string} key */
export function keyParts(key) {
  const i = key.indexOf("::");
  return { doctype: key.slice(0, i), name: key.slice(i + 2) };
}

/** A line's money: ERPNext's net amount when it has one (after discounts), else `amount`. */
export function lineAmount(row) {
  if (row && row.base_net_amount != null && row.base_net_amount !== "") return r2(row.base_net_amount);
  return r2(row && row.amount);
}

/**
 * A Bill line's landed cost: the line, its share of the charges ERPNext capitalised into stock,
 * and any Landed Cost Voucher amount. Per unit is landed ÷ qty.
 * @param {Record<string, any>} row a Purchase Invoice Item
 */
export function landedLine(row) {
  const amount = lineAmount(row);
  const charges = r2((Number(row.item_tax_amount) || 0) + (Number(row.landed_cost_voucher_amount) || 0));
  const landed = r2(amount + charges);
  const qty = Number(row.qty) || 0;
  return { amount, charges, landed, unit: qty ? r2(landed / qty) : 0 };
}

/**
 * A Bill line's landed cost **in the trace**: `landedLine`, plus the Landed Cost Voucher share that
 * sits on the receipt line it was made from. A voucher spreads a PO-wide cost (5zorro 2026-10-03:
 * "100 frt for this whole bill … 5 bills against the PO and only 1 will have frt") over receipts,
 * not bills, so a bill line made from a receipt carries its part of the receipt line's share — in
 * proportion to quantity, when the bill takes only part of the receipt line.
 * @param {TraceGraph} graph
 * @param {string} billKey
 * @param {number} i
 */
export function landedInTrace(graph, billKey, i) {
  const bill = graph.docs.get(billKey);
  const row = itemsOf(bill)[i];
  const own = landedLine(row);
  const e = graph.edges.find((x) => x.to === billKey && x.toRow === i && x.kind === "line" && keyParts(x.from).doctype === "Purchase Receipt" && x.fromRow !== null);
  if (!e) return { ...own, voucher: 0 };
  const pr = itemsOf(graph.docs.get(e.from))[e.fromRow];
  const prQty = Number(pr.qty) || 0, qty = Number(row.qty) || 0;
  const voucher = prQty ? r2((Number(pr.landed_cost_voucher_amount) || 0) * Math.min(1, qty / prQty)) : 0;
  const landed = r2(own.landed + voucher);
  return { ...own, voucher, charges: r2(own.charges + voucher), landed, unit: qty ? r2(landed / qty) : 0 };
}

/**
 * The bill's charges that are *not* in any line's cost: rows marked "Total" only (ERPNext adds
 * them to what the vendor is owed but not to stock value), and the share of a valuation charge
 * ERPNext computed for a non-stock line but does not capitalise. 5zorro decides whether the
 * shell spreads these (plan 2026-10-03, open question 1); until then they are shown, not hidden.
 * @param {Record<string, any>} bill a Purchase Invoice
 */
export function unallocatedCharges(bill) {
  const taxes = Array.isArray(bill && bill.taxes) ? bill.taxes : [];
  const sign = (t) => (t.add_deduct_tax === "Deduct" ? -1 : 1);
  const amt = (t) => Number(t.base_tax_amount_after_discount_amount ?? t.tax_amount) || 0;
  // A deduction (tax withheld) lowers what the vendor is paid; it is not a charge, so it is
  // reported on its own (seen on the seeded sandbox: a withholding row, Total / Deduct).
  const totalOnly = r2(taxes.filter((t) => t.category === "Total" && t.add_deduct_tax !== "Deduct").reduce((s, t) => s + amt(t), 0));
  const deducted = r2(taxes.filter((t) => t.add_deduct_tax === "Deduct").reduce((s, t) => s + amt(t), 0));
  const valuation = r2(taxes.filter((t) => t.category === "Valuation" || t.category === "Valuation and Total")
    .reduce((s, t) => s + sign(t) * (Number(t.base_tax_amount_after_discount_amount ?? t.tax_amount) || 0), 0));
  const capitalised = r2((bill.items || []).reduce((s, row) => s + (Number(row.item_tax_amount) || 0), 0));
  return { totalOnly, deducted, notCapitalised: r2(valuation - capitalised) };
}

/**
 * @typedef {{ key: string, i: number, row: Record<string, any> }} TraceLine
 * @typedef {{
 *   from: string, fromRow: number|null, to: string, toRow: number|null,
 *   kind: "line"|"return"|"payment", amount: number, qty: number|null,
 *   field: string, flag: null|{ kind: "warn"|"info", code: string, text: string },
 * }} TraceEdge
 * @typedef {{
 *   docs: Map<string, Record<string, any>>,
 *   edges: TraceEdge[],
 *   unresolved: Array<{ to: string, toRow: number, from: string, field: string }>,
 *   amends: Array<{ from: string, to: string }>,
 *   unsourced: TraceLine[],
 * }} TraceGraph
 */

const itemsOf = (doc) => (Array.isArray(doc && doc.items) ? doc.items : []);

/**
 * Build the graph from whatever documents were fetched. A link to a document that was not
 * fetched is kept in `unresolved` (the views show it as "N more not in focus"), never dropped.
 * @param {Array<Record<string, any>>} docsIn
 * @returns {TraceGraph}
 */
export function buildTraceGraph(docsIn) {
  /** @type {Map<string, Record<string, any>>} */
  const docs = new Map();
  for (const d of docsIn || []) if (d && d.doctype && d.name && TRACE_DOCTYPES[d.doctype]) docs.set(docKey(d), d);
  /** @type {TraceEdge[]} */
  const edges = [];
  const unresolved = [];
  const amends = [];
  /** @type {TraceLine[]} */
  const unsourced = [];
  const rowIndexIn = (doc, rowName) => itemsOf(doc).findIndex((r) => r.name === rowName);

  for (const [key, doc] of docs) {
    // Header: amendments are a relation; returns are lines pointing back at the lines they reverse.
    for (const h of HEADER_LINKS.filter((l) => l.doctype === doc.doctype)) {
      const v = doc[h.field];
      if (!v) continue;
      if (h.kind === "amends") amends.push({ from: `${h.from}::${v}`, to: key });
    }
    const returnOf = doc.is_return && doc.return_against ? `${doc.doctype}::${doc.return_against}` : "";

    itemsOf(doc).forEach((row, i) => {
      if (returnOf) {
        const src = docs.get(returnOf);
        const rowField = RETURN_ROW[doc.doctype];
        if (!src) { unresolved.push({ to: key, toRow: i, from: returnOf, field: "return_against" }); return; }
        let j = rowField && row[rowField] ? rowIndexIn(src, row[rowField]) : -1;
        if (j < 0) j = itemsOf(src).findIndex((r) => r.item_code === row.item_code);
        edges.push({ from: returnOf, fromRow: j >= 0 ? j : null, to: key, toRow: i, kind: "return", amount: Math.abs(lineAmount(row)),
          qty: Math.abs(Number(row.qty) || 0), field: "return_against", flag: j >= 0 ? null : notOnSource(doc, row, src) });
        return;
      }
      // Nearest source first: the first link field that is set is this line's parent.
      const link = lineLinksFor(doc.doctype).find((l) => !l.via && row[l.field]);
      // No source: on a Bill or receipt that is a line typed by hand (NIC); on an Estimate, a
      // Material Request or a PO raised for stock it is simply where a story starts.
      if (!link) { if (NIC_DOCTYPES.has(doc.doctype)) unsourced.push({ key, i, row }); return; }
      const fromKey = `${link.from}::${row[link.field]}`;
      const src = docs.get(fromKey);
      if (!src) { unresolved.push({ to: key, toRow: i, from: fromKey, field: link.field }); return; }
      let j = row[link.row] ? rowIndexIn(src, row[link.row]) : -1;
      let flag = null;
      if (j < 0) {
        // Named the document but not a line on it (a PO line typed against a Sales Order, say):
        // fall back to the item; no such item at all is the mismatch 5zorro wants caught.
        j = itemsOf(src).findIndex((r) => r.item_code === row.item_code);
        flag = j >= 0
          ? { kind: "info", code: "by-item", text: `Linked to ${src.name}, not to one of its lines — matched by item ${row.item_code}.` }
          : notOnSource(doc, row, src);
      }
      edges.push({ from: fromKey, fromRow: j >= 0 ? j : null, to: key, toRow: i, kind: "line", amount: lineAmount(row),
        qty: Number(row.qty) || 0, field: link.field, flag });
    });

    if (doc.doctype === PAYMENT_LINK.doctype) {
      (doc[PAYMENT_LINK.table] || []).forEach((ref, i) => {
        const fromKey = `${ref[PAYMENT_LINK.doctypeField]}::${ref[PAYMENT_LINK.nameField]}`;
        if (!docs.has(fromKey)) { unresolved.push({ to: key, toRow: i, from: fromKey, field: PAYMENT_LINK.nameField }); return; }
        edges.push({ from: fromKey, fromRow: null, to: key, toRow: i, kind: "payment", amount: r2(ref[PAYMENT_LINK.amountField]), qty: null,
          field: PAYMENT_LINK.nameField, flag: null });
      });
    }
  }

  // More taken from a source line than it had — counted per kind of child, because the buy side
  // (POs) and the sell side (invoices) each draw on a Sales Order line separately.
  const taken = new Map();
  for (const e of edges) {
    if (e.kind !== "line" || e.fromRow === null) continue;
    const k = `${e.from}#${e.fromRow}>${keyParts(e.to).doctype}`;
    taken.set(k, (taken.get(k) || 0) + (e.qty || 0));
  }
  for (const e of edges) {
    if (e.kind !== "line" || e.fromRow === null || e.flag) continue;
    const src = docs.get(e.from), had = Number(itemsOf(src)[e.fromRow].qty) || 0;
    const want = taken.get(`${e.from}#${e.fromRow}>${keyParts(e.to).doctype}`) || 0;
    if (want > had + 1e-9) {
      e.flag = { kind: "warn", code: "over", text: `${keyParts(e.to).doctype} lines drawn from ${src.name} ask for ${want} ${itemsOf(src)[e.fromRow].item_code}; it has ${had}.` };
    }
  }
  return { docs, edges, unresolved, amends, unsourced };
}

function notOnSource(doc, row, src) {
  return { kind: "warn", code: "not-on-source",
    text: `${row.item_code} on ${doc.name} says it came from ${src.name}, but ${src.name} has no ${row.item_code} line.` };
}

/** Documents a document came from / led to, at document level. */
export function ancestorsOf(graph, key) { return walkDocs(graph, key, (e) => e.to, (e) => e.from); }
export function descendantsOf(graph, key) { return walkDocs(graph, key, (e) => e.from, (e) => e.to); }
function walkDocs(graph, key, here, next) {
  const seen = new Set(), stack = [key];
  while (stack.length) {
    const k = stack.pop();
    for (const e of graph.edges) if (here(e) === k && !seen.has(next(e))) { seen.add(next(e)); stack.push(next(e)); }
  }
  return seen;
}

/**
 * Every line that descends from a root's chosen lines, line by line (edges only — a line never
 * joins a story because its document did). A flagged edge with no source row (the item is not on
 * its source) still belongs to the document it names.
 * @param {TraceGraph} graph
 * @param {string} rootKey
 * @param {(row: Record<string, any>) => boolean} [pick]
 * @returns {Map<string, Set<number>>} document key → reached line indexes
 */
export function reachFrom(graph, rootKey, pick = () => true) {
  const reached = new Map();
  const mark = (k, i) => { if (!reached.has(k)) reached.set(k, new Set()); const s = reached.get(k); if (s.has(i)) return false; s.add(i); return true; };
  const root = graph.docs.get(rootKey);
  if (!root) return reached;
  itemsOf(root).forEach((row, i) => { if (pick(row)) mark(rootKey, i); });
  for (let grew = true; grew;) {
    grew = false;
    for (const e of graph.edges) {
      if (e.kind === "payment" || e.toRow === null) continue;
      const src = reached.get(e.from);
      if (!src) continue;
      if (e.fromRow === null ? src.size > 0 : src.has(e.fromRow)) grew = mark(e.to, e.toRow) || grew;
    }
  }
  return reached;
}

/**
 * How much of each invoice its payments (and applied credits) have paid, payment by payment.
 * @returns {{ frac: number, pays: Array<{ key: string, amount: number, frac: number }> }}
 */
export function paidShare(graph, invoiceKey) {
  const inv = graph.docs.get(invoiceKey);
  const total = Math.abs(Number(inv && (inv.base_grand_total ?? inv.grand_total)) || 0);
  const pays = graph.edges.filter((e) => e.kind === "payment" && e.from === invoiceKey)
    .map((e) => ({ key: e.to, amount: e.amount, frac: total ? e.amount / total : 0 }));
  return { frac: Math.min(1, pays.reduce((t, p) => t + p.frac, 0)), pays };
}

/**
 * The landed cost per unit of what was bought for one Sales Order line: its PO lines, their
 * receipt lines, and the Bill lines those became — less anything returned on those Bill lines.
 * @returns {{ unit: number, billed: number, returned: number, qty: number }|null}
 */
export function costForSalesOrderLine(graph, soKey, soRow) {
  const reached = new Map([[soKey, new Set([soRow])]]);
  // Walk the buy side only: a Sales Order line's invoice is not its cost.
  for (let grew = true; grew;) {
    grew = false;
    for (const e of graph.edges) {
      if (e.kind === "payment" || e.toRow === null) continue;
      const lane = TRACE_DOCTYPES[keyParts(e.to).doctype].lane;
      if (lane !== "buy") continue;
      // A link naming the order but no line on it (the mismatch) belongs to the order as a whole,
      // never to one of its lines' cost.
      const src = reached.get(e.from);
      if (!src || e.fromRow === null || !src.has(e.fromRow)) continue;
      if (!reached.has(e.to)) reached.set(e.to, new Set());
      if (!reached.get(e.to).has(e.toRow)) { reached.get(e.to).add(e.toRow); grew = true; }
    }
  }
  let qty = 0, billed = 0, returned = 0;
  for (const [k, idx] of reached) {
    const doc = graph.docs.get(k);
    if (doc.doctype !== "Purchase Invoice") continue;
    idx.forEach((i) => {
      const L = landedInTrace(graph, k, i);
      if (doc.is_return) returned += Math.abs(L.landed); else { billed += L.landed; qty += Number(itemsOf(doc)[i].qty) || 0; }
    });
  }
  return qty ? { unit: billed / qty, billed: r2(billed), returned: r2(returned), qty } : null;
}

/**
 * Links that run backwards in time: a document dated (on its paper) before the one it came from —
 * e.g. a vendor that dates its invoice the day before the goods arrive.
 * @returns {Array<{ from: string, to: string, fromDate: string, toDate: string }>}
 */
export function outOfSequence(graph) {
  const seen = new Set(), out = [];
  for (const e of graph.edges) {
    if (e.kind !== "line") continue;
    const k = `${e.from}>${e.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const a = traceDates(graph.docs.get(e.from)).paper, b = traceDates(graph.docs.get(e.to)).paper;
    if (a && b && b < a) out.push({ from: e.from, to: e.to, fromDate: a, toDate: b });
  }
  return out;
}

/**
 * The order the lifecycle's columns read in: the date on the paper (else the posting date); on a
 * tie, a document before anything that came from it, then by name.
 * @param {TraceGraph} graph
 * @param {string[]} keys
 */
export function dateOrder(graph, keys) {
  const date = (k) => traceDates(graph.docs.get(k)).paper;
  return [...keys].sort((x, y) => date(x).localeCompare(date(y))
    || (ancestorsOf(graph, y).has(x) ? -1 : ancestorsOf(graph, x).has(y) ? 1 : 0)
    || x.localeCompare(y));
}
