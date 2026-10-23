import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { costingBoxModel, costingNote, parseCostingNote, COSTING_TOKEN } from "../src/costing-assumptions.js";

const plan = {
  rows: [
    { salesOrder: "SO-A", salesOrderItem: "a1", open: 6, gets: 5, diff: -1, fromStock: false },
    { salesOrder: "SO-B", salesOrderItem: "b1", open: 2, gets: 0, diff: -2, fromStock: true },
    { salesOrder: "SO-C", salesOrderItem: "", open: 0, gets: 0, diff: 0, fromStock: false },
  ],
  toStock: 1.5,
};

describe("costing assumptions (review 10-19 R6b-4)", () => {
  it("the box says, per order, what comes from stock", () => {
    const m = costingBoxModel(plan);
    assert.deepEqual(m.rows.map((r) => [r.salesOrder, r.open, r.gets, r.note, r.canTick]), [
      ["SO-A", "6", "5", "1 from stock", true],
      ["SO-B", "2", "0", "all from stock (ticked)", true],
      ["SO-C", "0", "0", "no line for this item", false],
    ]);
    assert.equal(m.stockRow, "1.5 more than the orders need → into stock");
  });
  it("the note opens with the token, reads as text, and round-trips its data", () => {
    const note = costingNote({ bill: "INV-9", line: 2, item: "SKU", qty: 6.5, po: "PO-1", by: "Clerk", plan });
    assert.ok(note.startsWith(`${COSTING_TOKEN} INV-9 line 2, SKU × 6.5 → PO-1`));
    assert.match(note, /^SO-A: needed 6, from this bill 5 — 1 from stock$/m);
    const back = parseCostingNote(note);
    assert.equal(back.po, "PO-1");
    assert.deepEqual(back.rows, plan.rows);
    assert.equal(back.toStock, 1.5);
  });
  it("reads the note back as ERPNext may store it — HTML and escaped quotes", () => {
    const note = costingNote({ bill: "INV-9", line: 2, item: "SKU", qty: 6.5, po: "PO-1", by: "Clerk", plan });
    const html = "<div><p>" + note.replace(/&/g, "&amp;").replace(/"/g, "&quot;").split("\n").join("</p><p>") + "</p></div>";
    assert.deepEqual(parseCostingNote(html).rows, plan.rows);
  });
  it("anything else is not a costing note", () => {
    assert.equal(parseCostingNote("Allocation source: PERSON"), null);
    assert.equal(parseCostingNote(`${COSTING_TOKEN} broken\ndata: {nope`), null);
    assert.equal(parseCostingNote(null), null);
  });
});
