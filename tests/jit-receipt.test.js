import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripReceivedBlock,
  parseReceivedBlock,
  withReceivedBlock,
  blockEntriesFor,
  pendingFromBlock,
  remapPending,
  receiptRemarks,
  receivedByOf,
  dayBefore,
  jitPlan,
  receiptDocFor,
} from "../src/jit-receipt.js";

// 5zorro's worked example (2026-10-10): two PO lines, a NIC line, a line already from a receipt.
const bill = {
  name: "ACC-PINV-2026-00010", docstatus: 0, supplier: "V", company: "C", currency: "USD", conversion_rate: 1,
  bill_date: "2026-10-05", set_warehouse: "Stores - C",
  items: [
    { name: "r1", idx: 1, item_code: "SKU-1", qty: 4, rate: 10, uom: "Nos", purchase_order: "PO-1", po_detail: "pod1" },
    { name: "r2", idx: 2, item_code: "SKU-2", qty: 6, rate: 12, uom: "Nos", purchase_order: "PO-1", po_detail: "pod2" },
    { name: "r3", idx: 3, item_code: "SKU-3", qty: 2, rate: 7, uom: "Nos" },
    { name: "r4", idx: 4, item_code: "SKU-4", qty: 5, rate: 3, uom: "Nos", purchase_receipt: "IR-7", pr_detail: "prd4" },
  ],
};
const stock = ["SKU-1", "SKU-2", "SKU-3", "SKU-4"];

describe("Remarks block (draft keeps who/when without a custom field)", () => {
  const entries = [{ line: 1, item_code: "SKU-1", by: "Jason", on: "2026-10-04" }, { line: 3, item_code: "SKU-3", by: "John", on: "2026-10-04" }];
  it("round-trips and leaves the clerk's text alone", () => {
    const r = withReceivedBlock("Call vendor about freight", entries);
    assert.equal(r, "Call vendor about freight\n\n[received]\n1 | SKU-1 | Jason | 2026-10-04\n3 | SKU-3 | John | 2026-10-04\n[/received]");
    assert.deepEqual(parseReceivedBlock(r), entries);
    assert.equal(stripReceivedBlock(r), "Call vendor about freight");
  });
  it("no pending → no block; replacing a block does not stack a second one", () => {
    assert.equal(withReceivedBlock("memo", []), "memo");
    const once = withReceivedBlock("memo", entries);
    assert.equal(withReceivedBlock(once, entries.slice(0, 1)).match(/\[received\]/g).length, 1);
  });
  it("pending ↔ block by line number + item code; a moved line is dropped, not guessed", () => {
    const pending = new Map([["r1", { by: "Jason", on: "2026-10-04" }], ["r3", { by: "John", on: "2026-10-04" }]]);
    assert.deepEqual(blockEntriesFor(bill, pending), entries);
    const back = pendingFromBlock(bill, [...entries, { line: 2, item_code: "SKU-9", by: "X", on: "2026-10-01" }]);
    assert.deepEqual([...back.pending.keys()], ["r1", "r3"]);
    assert.equal(back.dropped.length, 1);
  });
  it("a save renames rows; pending follows by line + item code", () => {
    const pending = new Map([["new-1", { by: "Jason", on: "2026-10-04" }]]);
    const out = remapPending(pending, [{ name: "new-1", idx: 1, item_code: "SKU-1" }], [{ name: "abc", idx: 1, item_code: "SKU-1" }]);
    assert.deepEqual([...out.entries()], [["abc", { by: "Jason", on: "2026-10-04" }]]);
  });
});

describe("who received a receipt", () => {
  it("Remarks first, else its creator", () => {
    assert.equal(receivedByOf({ remarks: receiptRemarks("Jason", "B-1"), owner: "admin@x" }), "Jason");
    assert.equal(receivedByOf({ remarks: "", owner: "maria@x", owner_name: "Maria" }), "Maria");
  });
});

describe("dayBefore (the default Received on)", () => {
  it("handles month and year edges", () => {
    assert.equal(dayBefore("2026-10-05"), "2026-10-04");
    assert.equal(dayBefore("2026-03-01"), "2026-02-28");
    assert.equal(dayBefore("2027-01-01"), "2026-12-31");
    assert.equal(dayBefore(""), "");
  });
});

describe("jitPlan", () => {
  it("the worked example: two receipts (John 10/4: lines 1+3; Jason 10/4: line 2), IR line untouched", () => {
    const pending = new Map([
      ["r1", { by: "John", on: "2026-10-04" }],
      ["r2", { by: "Jason", on: "2026-10-04" }],
      ["r3", { by: "john", on: "2026-10-04" }],
    ]);
    const p = jitPlan({ doc: bill, stockCodes: stock, pending });
    assert.equal(p.route, "receipts");
    assert.deepEqual(p.groups, [{ by: "Jason", on: "2026-10-04", rows: [1] }, { by: "John", on: "2026-10-04", rows: [0, 2] }]);
    assert.deepEqual(p.missing, []);
  });
  it("a line already from a receipt forces the receipt route; unfilled lines are 'missing'", () => {
    const p = jitPlan({ doc: bill, stockCodes: stock, pending: new Map() });
    assert.equal(p.route, "receipts");
    assert.deepEqual(p.missing, [0, 1, 2]);
  });
  it("no receipt source and no who/when → Update Stock route, as before", () => {
    const plain = { ...bill, items: bill.items.slice(0, 3) };
    assert.deepEqual(jitPlan({ doc: plain, stockCodes: stock, pending: new Map() }), { route: "update-stock", groups: [], missing: [] });
  });
  it("only who without when is not enough", () => {
    const plain = { ...bill, items: bill.items.slice(0, 1) };
    const p = jitPlan({ doc: plain, stockCodes: stock, pending: new Map([["r1", { by: "Jason", on: "" }]]) });
    assert.deepEqual(p.missing, [0]);
  });
});

describe("receiptDocFor", () => {
  it("bill is the source of truth: qty, rate, PO link, warehouse, dated the day received, who in Remarks", () => {
    const r = receiptDocFor({ bill, group: { by: "John", on: "2026-10-04", rows: [0, 2] } });
    assert.equal(r.ok, true);
    assert.equal(r.doc.posting_date, "2026-10-04");
    assert.equal(r.doc.set_posting_time, 1);
    assert.equal(r.doc.remarks, "Received by: John\nMade from bill ACC-PINV-2026-00010 by the Doc shell");
    assert.deepEqual(r.doc.items.map((i) => [i.item_code, i.qty, i.rate, i.warehouse, i.purchase_order_item || ""]), [
      ["SKU-1", 4, 10, "Stores - C", "pod1"],
      ["SKU-3", 2, 7, "Stores - C", ""],
    ]);
  });
  it("no warehouse anywhere → a reason, not a bad receipt", () => {
    const b = { ...bill, set_warehouse: "" };
    const r = receiptDocFor({ bill: b, group: { by: "J", on: "2026-10-04", rows: [2] } });
    assert.equal(r.ok, false);
    assert.match(r.reason, /no warehouse/);
  });
});
