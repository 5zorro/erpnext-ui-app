/**
 * The trace on real ERPNext rows: the seeded sandbox's traced chain (ops/sample-data/README.md,
 * "The traced chain") and an amended, withheld, batch-paid bill — exported from a copy of the
 * 2026-09-28 backup by ops/trace/export-trace-fixture.js, which runs the real fetchTrace walk.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildTraceGraph, outOfSequence, paidShare, landedLine, unallocatedCharges } from "../src/trace-graph.js";
import { lifecycleGroup } from "../src/trace-lifecycle.js";
import { writtenPaymentsFrom } from "../src/payment-timeline.js";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/trace-seeded-chain.json", import.meta.url), "utf8"));
const g = buildTraceGraph(fixture.docs);
const SO = "Sales Order::SAL-ORD-2026-00543";

describe("the seeded traced chain, read back", () => {
  it("the walk fetched both sides of the order: estimate, PO, receipt, bill, payment, delivery note, invoice, receipt of payment", () => {
    const g0 = lifecycleGroup(g, SO);
    assert.deepEqual(g0.cols.map((k) => k.split("::")[0]), [
      "Quotation", "Sales Order", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Payment Entry", "Delivery Note", "Sales Invoice", "Payment Entry",
    ]);
  });
  it("makes exactly the margin the sample-data contract promises: 4 × 150 − 4 × 125 = 100.00", () => {
    const [row] = lifecycleGroup(g, SO).rows;
    assert.equal(row.item, "SAMPLE-SKU-BOWTIE");
    assert.equal(row.margin, 100);
    assert.equal(row.cells.billed.amt, 500, "no tax, no withholding, no charges on this vendor");
  });
  it("takes the invoice's nearest source to be its delivery note", () => {
    const e = g.edges.filter((x) => x.to === "Sales Invoice::ACC-SINV-2026-00525");
    assert.deepEqual(e.map((x) => [x.from, x.field]), [["Delivery Note::MAT-DN-2026-00001", "delivery_note"]]);
  });
  it("matches the seed's PO lines to their Sales Order by item — the seed names the order but not its line", () => {
    const flags = g.edges.filter((x) => x.flag).map((x) => [x.to, x.flag.code]);
    assert.deepEqual(flags, [["Purchase Order::PUR-ORD-2026-00404", "by-item"], ["Purchase Order::PUR-ORD-2026-00370", "by-item"]]);
  });
  it("finds a real backwards link: a PO dated the day before the Sales Order it was linked to", () => {
    assert.deepEqual(outOfSequence(g), [{ from: "Sales Order::SAL-ORD-2026-00513", to: "Purchase Order::PUR-ORD-2026-00370", fromDate: "2026-09-09", toDate: "2026-09-08" }]);
  });
  it("both invoices are paid in full by their payments", () => {
    assert.equal(paidShare(g, "Purchase Invoice::ACC-PINV-2026-00268").frac, 1);
    assert.equal(paidShare(g, "Sales Invoice::ACC-SINV-2026-00525").frac, 1);
  });
});

describe("an amended, withheld, batch-paid bill", () => {
  const bill = fixture.docs.find((d) => d.name === "ACC-PINV-2026-00231-1");
  it("knows it amends the cancelled original", () => {
    assert.deepEqual(g.amends, [{ from: "Purchase Invoice::ACC-PINV-2026-00231", to: "Purchase Invoice::ACC-PINV-2026-00231-1" }]);
  });
  it("reports the withholding as a deduction, not as a charge in no line's cost", () => {
    assert.deepEqual(unallocatedCharges(bill), { totalOnly: 0, deducted: 1, notCapitalised: 0 });
    assert.equal(landedLine(bill.items[0]).landed, 10);
  });
  it("keeps the batch payment's other bill as one not fetched (Other payables)", () => {
    assert.deepEqual(g.unresolved.map((u) => [u.from, u.to]), [["Purchase Invoice::ACC-PINV-2026-00255", "Payment Entry::ACC-PAY-2026-00002"]]);
  });
  it("reads the seed's payments as checks — none has a clearance date", () => {
    const w = writtenPaymentsFrom(fixture.docs);
    assert.deepEqual(w.map((p) => [p.ref, p.cleared]).sort(), [["BT-PE-PAY", ""], ["BT-PE-RCV", ""], ["Batch of 2", ""]]);
  });
});
