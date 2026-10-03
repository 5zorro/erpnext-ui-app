import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { traceChain } from "./fixtures/trace-chain.js";
import { buildTraceGraph } from "../src/trace-graph.js";
import { lifecycleGroup, lifecycleGroups } from "../src/trace-lifecycle.js";

const K = (dt, n) => `${dt}::${n}`;
const SO = K("Sales Order", "SAL-ORD-0543");
const group = () => lifecycleGroup(buildTraceGraph(traceChain()), SO);
const rowOf = (g, item) => g.rows.find((r) => r.item === item);

describe("lifecycle: the customer's order", () => {
  it("has one row per item it touched, in the order's own order first", () => {
    assert.deepEqual(group().rows.map((r) => r.item), ["SKU-BOWTIE", "SKU-BOWTIE-B", "SKU-BOWTIE-C", "PALLET-WRAP"]);
  });
  it("keeps the stock line out of it", () => {
    assert.ok(!rowOf(group(), "SKU-BOWTIE-D"));
  });
  it("fills each stage with how many and what it cost — landed on the bill", () => {
    const r = rowOf(group(), "SKU-BOWTIE");
    const at = (s) => [r.cells[s].qty, r.cells[s].amt];
    assert.deepEqual(at("quoted"), [4, 600]);
    assert.deepEqual(at("ordered"), [4, 600]);
    assert.deepEqual(at("bought"), [4, 400]);
    assert.deepEqual(at("received"), [4, 400]);
    assert.deepEqual(at("billed"), [4, 414.37]);
    assert.deepEqual(at("invoiced"), [4, 600]);
    assert.equal(r.cells.paidAp.amt, 414.37);
    assert.equal(r.cells.paidAr.amt, 600);
  });
  it("puts the mismatch on the PO cell and on the item", () => {
    const r = rowOf(group(), "SKU-BOWTIE-C");
    assert.equal(r.warn, true);
    assert.equal(r.byDoc[K("Purchase Order", "PUR-ORD-0405")].marks[0].kind, "warn");
  });
  it("margin is invoiced minus landed cost; returned and NIC cost show as cost with no sale", () => {
    const g = group();
    assert.equal(rowOf(g, "SKU-BOWTIE").margin, 185.63);
    assert.equal(rowOf(g, "SKU-BOWTIE-B").margin, 151.38);
    assert.equal(rowOf(g, "SKU-BOWTIE-C").margin, -1.62);
    assert.match(rowOf(g, "SKU-BOWTIE-C").marginNote.text, /Returned/);
    assert.equal(rowOf(g, "PALLET-WRAP").margin, -20);
    assert.equal(rowOf(g, "PALLET-WRAP").nic, true);
    const total = g.rows.reduce((t, r) => t + (r.margin || 0), 0);
    assert.equal(Math.round(total * 100) / 100, 315.39);
  });
  it("orders its columns by the date on the paper, and marks the one link that runs backwards", () => {
    const g = group();
    assert.deepEqual(g.cols.map((k) => k.split("::")[1]), [
      "SAL-QTN-0608", "SAL-ORD-0543", "PUR-ORD-0404", "PUR-ORD-0405", "MAT-PRE-0211", "ACC-PINV-0268", "MAT-PRE-0212",
      "ACC-PAY-0004", "ACC-SINV-0525", "ACC-PINV-0273", "ACC-PAY-0005",
    ]);
    const back = g.links.filter((l) => l.back);
    assert.deepEqual(back.map((l) => [l.from, l.to]), [[K("Purchase Receipt", "MAT-PRE-0212"), K("Purchase Invoice", "ACC-PINV-0268")]]);
  });
  it("shows a payment's share per payment, as a percent", () => {
    const b = rowOf(group(), "SKU-BOWTIE").byDoc[K("Payment Entry", "ACC-PAY-0004")];
    assert.equal(b.qty, null);
    assert.equal(Math.round(b.pct), 100);
  });
});

describe("lifecycle: stock and the rest", () => {
  it("gives the Material Request its own story, with stock instead of a margin", () => {
    const g = lifecycleGroup(buildTraceGraph(traceChain()), K("Material Request", "MAT-MR-0031"));
    assert.deepEqual(g.rows.map((r) => r.item), ["SKU-BOWTIE-D"]);
    assert.equal(g.rows[0].marginNote.kind, "info");
    assert.equal(g.rows[0].cells.billed.amt, 155.39);
  });
  it("splits what is in view into stories, each bill line shown once", () => {
    const gr = buildTraceGraph(traceChain());
    const groups = lifecycleGroups(gr, gr.docs.keys());
    assert.deepEqual(groups.map((g) => g.kind), ["so", "mr"]);
    const nic = groups.filter((g) => g.rows.some((r) => r.item === "PALLET-WRAP"));
    assert.equal(nic.length, 1);
  });
  it("marks what is still open", () => {
    const docs = traceChain().filter((d) => d.name !== "MAT-PRE-0212");
    const r = lifecycleGroup(buildTraceGraph(docs), SO).rows.find((x) => x.item === "SKU-BOWTIE");
    assert.equal(r.cells.received.marks.length, 0);
    const docs2 = traceChain().filter((d) => d.name !== "ACC-SINV-0525" && d.name !== "ACC-PAY-0005");
    const r2 = lifecycleGroup(buildTraceGraph(docs2), SO).rows.find((x) => x.item === "SKU-BOWTIE");
    assert.equal(r2.notes.find((m) => /not invoiced/.test(m.text)).kind, "open");
  });
});
