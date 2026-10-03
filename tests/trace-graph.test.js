import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { traceChain } from "./fixtures/trace-chain.js";
import {
  TRACE_DOCTYPES, LINE_LINKS, HEADER_LINKS, TABLE_DOCTYPE, lineLinksFor, linksInto, traceDates, traceLineFields,
} from "../src/trace-links.js";
import {
  buildTraceGraph, reachFrom, landedLine, landedInTrace, unallocatedCharges, chargeAdvisories, paidShare, costForSalesOrderLine,
  outOfSequence, dateOrder, ancestorsOf, descendantsOf,
} from "../src/trace-graph.js";

const K = (dt, n) => `${dt}::${n}`;
const graph = () => buildTraceGraph(traceChain());
const edge = (g, from, to) => g.edges.filter((e) => e.from === from && e.to === to);

describe("trace-links: the registry", () => {
  it("names only doctypes the trace knows, each with a line table", () => {
    for (const l of [...LINE_LINKS, ...HEADER_LINKS]) {
      assert.ok(TRACE_DOCTYPES[l.doctype], l.doctype);
      assert.ok(TRACE_DOCTYPES[l.from], l.from);
    }
    for (const l of LINE_LINKS) assert.ok(TABLE_DOCTYPE[l.doctype], `${l.doctype} has a child doctype`);
  });
  it("lists a Bill's sources nearest first: receipt before PO", () => {
    const fields = lineLinksFor("Purchase Invoice").filter((l) => !l.via).map((l) => l.field);
    assert.deepEqual(fields.slice(0, 2), ["purchase_receipt", "purchase_order"]);
  });
  it("asks for every link field and row id on a line", () => {
    const f = traceLineFields("Purchase Invoice");
    for (const x of ["purchase_receipt", "pr_detail", "purchase_order", "po_detail", "item_tax_amount", "purchase_invoice_item"]) assert.ok(f.includes(x), x);
  });
  it("knows what points at a Sales Order (POs, receipts, material requests, notes, invoices) and that it can be paid", () => {
    const into = linksInto("Sales Order");
    assert.deepEqual(new Set(into.lines.map((l) => l.doctype)), new Set(["Material Request", "Purchase Order", "Purchase Receipt", "Delivery Note", "Sales Invoice"]));
    assert.equal(into.payments, true);
  });
  it("reads the paper date and the posted date per kind of document", () => {
    assert.deepEqual(traceDates({ doctype: "Purchase Invoice", bill_date: "2026-08-20", posting_date: "2026-08-22" }), { paper: "2026-08-20", posted: "2026-08-22" });
    assert.deepEqual(traceDates({ doctype: "Payment Entry", reference_date: "2026-08-27", posting_date: "2026-08-28" }), { paper: "2026-08-27", posted: "2026-08-28" });
    assert.deepEqual(traceDates({ doctype: "Purchase Receipt", posting_date: "2026-08-21", creation: "2026-08-23 10:00:00" }), { paper: "2026-08-21", posted: "2026-08-23" });
    assert.deepEqual(traceDates({ doctype: "Purchase Order", transaction_date: "2026-08-10", creation: "2026-08-10 09:00:00" }), { paper: "2026-08-10", posted: "2026-08-10" });
  });
});

describe("trace-graph: line to line", () => {
  it("links each line to the exact line it came from, by ERPNext's row ids", () => {
    const g = graph();
    const e = edge(g, K("Purchase Receipt", "MAT-PRE-0211"), K("Purchase Invoice", "ACC-PINV-0268"));
    assert.deepEqual(e.map((x) => [x.fromRow, x.toRow]), [[0, 0], [1, 1]]);
    assert.equal(e[0].flag, null);
  });
  it("takes the receipt as a Bill line's parent even though the line also names the PO", () => {
    const g = graph();
    assert.equal(edge(g, K("Purchase Order", "PUR-ORD-0404"), K("Purchase Invoice", "ACC-PINV-0268")).length, 0);
  });
  it("marks a line whose source has no such item — and still files it under that source", () => {
    const g = graph();
    const e = edge(g, K("Sales Order", "SAL-ORD-0543"), K("Purchase Order", "PUR-ORD-0405")).find((x) => x.toRow === 1);
    assert.equal(e.fromRow, null);
    assert.equal(e.flag.kind, "warn");
    assert.equal(e.flag.code, "not-on-source");
    assert.match(e.flag.text, /SKU-BOWTIE-C/);
  });
  it("falls back to the item, as information, when a line names a document but no line on it", () => {
    const docs = traceChain();
    docs.find((d) => d.name === "PUR-ORD-0404").items[0].sales_order_item = "";
    const e = edge(buildTraceGraph(docs), K("Sales Order", "SAL-ORD-0543"), K("Purchase Order", "PUR-ORD-0404"))[0];
    assert.equal(e.fromRow, 0);
    assert.equal(e.flag.code, "by-item");
  });
  it("flags more taken from a line than it had — counting the buy side and the sell side separately", () => {
    const g0 = graph();
    assert.ok(!g0.edges.some((e) => e.flag && e.flag.code === "over"), "PO 4 + invoice 4 from a line of 4 is not over");
    const docs = traceChain();
    docs.find((d) => d.name === "PUR-ORD-0404").items[0].qty = 5;
    const g = buildTraceGraph(docs);
    const over = g.edges.filter((e) => e.flag && e.flag.code === "over");
    assert.equal(over.length, 1);
    assert.match(over[0].flag.text, /ask for 5 SKU-BOWTIE; it has 4/);
  });
  it("links a credit's lines to the bill lines they reverse", () => {
    const e = edge(graph(), K("Purchase Invoice", "ACC-PINV-0268"), K("Purchase Invoice", "ACC-PINV-0273"))[0];
    assert.equal(e.kind, "return");
    assert.equal(e.fromRow, 3);
    assert.equal(e.amount, 45);
  });
  it("keeps links to documents that were not fetched, instead of dropping them", () => {
    const g = graph();
    const other = g.unresolved.filter((u) => u.to === K("Payment Entry", "ACC-PAY-0004")).map((u) => u.from);
    assert.deepEqual(other, [K("Purchase Invoice", "ACC-PINV-0255"), K("Purchase Invoice", "ACC-PINV-0261")]);
  });
  it("records a bill line with no source at all (NIC)", () => {
    assert.deepEqual(graph().unsourced.map((u) => u.row.item_code), ["PALLET-WRAP"]);
  });
});

describe("trace-graph: whose story a line belongs to", () => {
  it("never pulls stock raised on a Material Request into the customer's order", () => {
    const g = graph();
    const r = reachFrom(g, K("Sales Order", "SAL-ORD-0543"));
    assert.deepEqual([...r.get(K("Purchase Order", "PUR-ORD-0404"))], [0], "the stock line on the same PO is not the customer's");
    assert.deepEqual([...r.get(K("Purchase Invoice", "ACC-PINV-0268"))].sort(), [0, 2, 3]);
    assert.ok(r.has(K("Purchase Invoice", "ACC-PINV-0273")), "the credit for the mismatched item follows it");
    assert.ok(r.has(K("Sales Invoice", "ACC-SINV-0525")));
  });
  it("follows the Material Request's own line through the same PO, receipt and bill", () => {
    const r = reachFrom(graph(), K("Material Request", "MAT-MR-0031"));
    assert.deepEqual([...r.keys()].sort(), [K("Material Request", "MAT-MR-0031"), K("Purchase Invoice", "ACC-PINV-0268"), K("Purchase Order", "PUR-ORD-0404"), K("Purchase Receipt", "MAT-PRE-0211")].sort());
    assert.deepEqual([...r.get(K("Purchase Invoice", "ACC-PINV-0268"))], [1]);
  });
  it("walks documents up and down", () => {
    const g = graph();
    assert.ok(ancestorsOf(g, K("Purchase Invoice", "ACC-PINV-0268")).has(K("Quotation", "SAL-QTN-0608")));
    assert.ok(descendantsOf(g, K("Purchase Invoice", "ACC-PINV-0268")).has(K("Payment Entry", "ACC-PAY-0004")));
  });
});

describe("trace-graph: what it cost and what it made", () => {
  it("reads landed cost from ERPNext's own allocation, not a second spread", () => {
    const bill = traceChain().find((d) => d.name === "ACC-PINV-0268");
    assert.deepEqual(landedLine(bill.items[0]), { amount: 400, charges: 14.37, landed: 414.37, unit: 103.59 });
    assert.equal(landedLine(bill.items[4]).landed, 20, "a non-stock line gets no capitalised share");
  });
  it("reports the charges that are in no line's cost", () => {
    const bill = traceChain().find((d) => d.name === "ACC-PINV-0268");
    assert.deepEqual(unallocatedCharges(bill), { totalOnly: 15, deducted: 0, notCapitalised: 0 });
  });
  it("finds a Sales Order line's cost through its PO, receipt and bill lines", () => {
    const c = costForSalesOrderLine(graph(), K("Sales Order", "SAL-ORD-0543"), 0);
    assert.equal(c.billed, 414.37);
    assert.equal(c.qty, 4);
  });
  it("says how much of a bill its payments paid", () => {
    const s = paidShare(graph(), K("Purchase Invoice", "ACC-PINV-0268"));
    assert.equal(s.frac, 1);
    assert.deepEqual(s.pays.map((p) => [p.key, p.amount]), [[K("Payment Entry", "ACC-PAY-0004"), 900]]);
  });
});

describe("trace-graph: time", () => {
  it("finds the link that runs backwards: a bill dated before the receipt it bills", () => {
    assert.deepEqual(outOfSequence(graph()), [{ from: K("Purchase Receipt", "MAT-PRE-0212"), to: K("Purchase Invoice", "ACC-PINV-0268"), fromDate: "2026-08-21", toDate: "2026-08-20" }]);
  });
  it("orders documents by paper date, a source before what came from it on a tie", () => {
    const docs = traceChain();
    docs.find((d) => d.name === "MAT-PRE-0211").posting_date = "2026-08-10"; // same day as its PO
    const g = buildTraceGraph(docs);
    const order = dateOrder(g, [K("Purchase Receipt", "MAT-PRE-0211"), K("Purchase Order", "PUR-ORD-0404"), K("Sales Order", "SAL-ORD-0543")]);
    assert.deepEqual(order, [K("Sales Order", "SAL-ORD-0543"), K("Purchase Order", "PUR-ORD-0404"), K("Purchase Receipt", "MAT-PRE-0211")]);
  });
});

describe("trace-graph: a PO-wide cost spread by a Landed Cost Voucher", () => {
  // 5zorro 2026-10-03: "100 frt for this whole bill" on the PO, five bills, only one carries it.
  // ERPNext's way is a Landed Cost Voucher over the PO's receipts; it writes each receipt line's
  // share to landed_cost_voucher_amount, so the bill line made from that receipt must carry it.
  const withVoucher = () => {
    const docs = traceChain();
    docs.find((d) => d.name === "MAT-PRE-0211").items[0].landed_cost_voucher_amount = 40; // SKU-BOWTIE × 4
    return buildTraceGraph(docs);
  };
  it("adds the receipt line's voucher share to the bill line made from it", () => {
    const L = landedInTrace(withVoucher(), K("Purchase Invoice", "ACC-PINV-0268"), 0);
    assert.deepEqual(L, { amount: 400, charges: 54.37, landed: 454.37, unit: 113.59, voucher: 40 });
  });
  it("takes only its part when the bill takes only part of the receipt line", () => {
    const docs = traceChain();
    docs.find((d) => d.name === "MAT-PRE-0211").items[0].landed_cost_voucher_amount = 40;
    docs.find((d) => d.name === "ACC-PINV-0268").items[0].qty = 1;
    assert.equal(landedInTrace(buildTraceGraph(docs), K("Purchase Invoice", "ACC-PINV-0268"), 0).voucher, 10);
  });
  it("is nothing extra on a line with no receipt behind it", () => {
    assert.equal(landedInTrace(withVoucher(), K("Purchase Invoice", "ACC-PINV-0268"), 4).voucher, 0);
  });
  it("flows into the customer's margin", () => {
    const c = costForSalesOrderLine(withVoucher(), K("Sales Order", "SAL-ORD-0543"), 0);
    assert.equal(c.billed, 454.37);
  });
});

describe("trace-graph: why a charge is in no item's cost", () => {
  it("explains a Total-only charge and names the setting that would spread it", () => {
    const bill = traceChain().find((d) => d.name === "ACC-PINV-0268");
    const [a] = chargeAdvisories(bill);
    assert.equal(a.code, "total-only");
    assert.equal(a.amount, 15);
    assert.match(a.text, /Fuel surcharge 15\.00 is in no item's cost/);
    assert.match(a.fix, /Valuation and Total/);
    assert.match(a.fix, /void and amend/, "a submitted bill changes through Edit");
    assert.equal(a.route, "/app/purchase-invoice/ACC-PINV-0268");
  });
  it("explains a valuation share that fell on a non-stock line", () => {
    const bill = traceChain().find((d) => d.name === "ACC-PINV-0268");
    bill.items[3].item_tax_amount = 0.62; // 1.00 of the freight left on the pallet wrap
    const a = chargeAdvisories(bill).find((x) => x.code === "non-stock-share");
    assert.equal(a.amount, 1);
    assert.match(a.fix, /Allocate full amount to stock items/);
  });
  it("says nothing about a withholding deduction", () => {
    const bill = { name: "B", docstatus: 1, taxes: [{ category: "Total", add_deduct_tax: "Deduct", tax_amount: 1, description: "TDS" }], items: [] };
    assert.deepEqual(chargeAdvisories(bill), []);
  });
});
