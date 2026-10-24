import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { costingBoxModel, costingNote, parseCostingNote, costingNotesByLine, costingLookbackCaption, COSTING_TOKEN } from "../src/costing-assumptions.js";

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
    assert.equal(costingBoxModel({ ...plan, uom: "Nos" }).stockRow, "1.5 Nos more than the orders need → into stock");
  });
  it("an order On Hold or Closed is shown as not counted, with no tick", () => {
    const m = costingBoxModel({ rows: [{ salesOrder: "SO-H", salesOrderItem: "h1", open: 4, gets: 0, diff: 0, fromStock: false, held: "On Hold" }], toStock: 0 });
    assert.deepEqual([m.rows[0].note, m.rows[0].canTick], ["On Hold — not counted", false]);
  });
  it("the note opens with the token, reads as text, and round-trips its data", () => {
    const note = costingNote({ bill: "INV-9", line: 2, item: "SKU", qty: 6.5, uom: "Nos", po: "PO-1", by: "Clerk", plan });
    assert.ok(note.startsWith(`${COSTING_TOKEN} INV-9 line 2, SKU × 6.5 Nos → PO-1`));
    assert.ok(note.split("<br>").includes("SO-A: needed 6, from this bill 5 — 1 from stock"));
    const back = parseCostingNote(note);
    assert.equal(back.po, "PO-1");
    assert.deepEqual(back.rows, plan.rows);
    assert.equal(back.toStock, 1.5);
    assert.equal(back.uom, "Nos");
  });
  it("a typed bill no. cannot put HTML into ERPNext's timeline", () => {
    const note = costingNote({ bill: '<img src=x onerror="alert(1)">', line: 1, item: "SKU", qty: 1, po: "PO-1", by: "Clerk", plan });
    assert.doesNotMatch(note, /<img/);
    assert.equal(parseCostingNote(note).bill, '<img src=x onerror="alert(1)">');
  });
  it("reads the note back as ERPNext may store it — HTML and escaped quotes", () => {
    const note = costingNote({ bill: "INV-9", line: 2, item: "SKU", qty: 6.5, po: "PO-1", by: "Clerk", plan });
    // The note is already escaped with <br> lines; a Text Editor may wrap it in its own markup.
    const html = "<div class=\"ql-editor read-mode\"><p>" + note + "</p></div>";
    assert.deepEqual(parseCostingNote(html).rows, plan.rows);
  });
  it("anything else is not a costing note", () => {
    assert.equal(parseCostingNote("Allocation source: PERSON"), null);
    assert.equal(parseCostingNote(`${COSTING_TOKEN} broken\ndata: {nope`), null);
    assert.equal(parseCostingNote(null), null);
  });
});

describe("the Sales Order's look-back (plan 10-19 R6b-4 step 8)", () => {
  const note = (bill, created, name) => ({
    name,
    creation: created,
    content: costingNote({ bill, line: 1, item: "SKU", qty: 5, uom: "Nos", po: `PO-${bill}`, by: "Clerk", plan }),
  });
  it("puts each note on the order lines it split, newest first", () => {
    const by = costingNotesByLine(
      [note("B1", "2026-10-01 09:00:00.1", "c1"), note("B2", "2026-10-02 09:00:00.1", "c2"), note("B2", "2026-10-02 09:00:00.1", "c2")],
      "SO-A",
    );
    assert.deepEqual(Object.keys(by), ["a1"]);
    assert.deepEqual(by.a1.map((e) => e.note.bill), ["B2", "B1"]);
    assert.equal(costingLookbackCaption(by.a1[0]), "2026-10-02 09:00 · Bill B2 line 1: SKU × 5 Nos → PO-B2");
  });
  it("an order the note names without a line, other comments and junk are left out", () => {
    assert.deepEqual(costingNotesByLine([note("B1", "x", "c1")], "SO-C"), {});
    assert.deepEqual(costingNotesByLine([{ name: "c9", content: "Looks fine" }, null], "SO-A"), {});
    assert.deepEqual(costingNotesByLine(null, "SO-A"), {});
  });
  it("reads a note after ERPNext's sanitizer has turned its quotes back into plain text", () => {
    const c = note("B1", "2026-10-01 09:00:00", "c1");
    c.content = `<p>${c.content.replace(/&quot;/g, '"')}</p>`;
    assert.deepEqual(Object.keys(costingNotesByLine([c], "SO-B")), ["b1"]);
  });
});
