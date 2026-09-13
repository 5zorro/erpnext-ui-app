import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSortMode,
  sortBillsForSchedule,
  rowIndexOf,
  orderAggregatesByFirstRow,
  aggregatesAreContiguous,
} from "../src/pay-flow-sort.js";

/** 3 invoices x 3 installments, batched one per invoice — 5zorro's 2026-09-08 test case. */
const CROSS = [
  { installmentKey: "A#0", invoice: "PI-A", dueDate: "2026-08-10" },
  { installmentKey: "A#1", invoice: "PI-A", dueDate: "2026-08-17" },
  { installmentKey: "A#2", invoice: "PI-A", dueDate: "2026-08-24" },
  { installmentKey: "B#0", invoice: "PI-B", dueDate: "2026-08-12" },
  { installmentKey: "B#1", invoice: "PI-B", dueDate: "2026-08-19" },
  { installmentKey: "B#2", invoice: "PI-B", dueDate: "2026-08-26" },
  { installmentKey: "C#0", invoice: "PI-C", dueDate: "2026-08-14" },
  { installmentKey: "C#1", invoice: "PI-C", dueDate: "2026-08-21" },
  { installmentKey: "C#2", invoice: "PI-C", dueDate: "2026-08-28" },
];
const GROUPS = [
  { payOn: "2026-08-10", keys: ["A#0", "B#0", "C#0"] },
  { payOn: "2026-08-17", keys: ["A#1", "B#1", "C#1"] },
  { payOn: "2026-08-24", keys: ["A#2", "B#2", "C#2"] },
];
const INVOICES = [
  { name: "PI-A", keys: ["A#0", "A#1", "A#2"] },
  { name: "PI-B", keys: ["B#0", "B#1", "B#2"] },
  { name: "PI-C", keys: ["C#0", "C#1", "C#2"] },
];

describe("normalizeSortMode", () => {
  it("only 'invoice' means invoice; everything else is date", () => {
    assert.equal(normalizeSortMode("invoice"), "invoice");
    for (const m of ["date", "", null, undefined, "Invoice", 7, {}]) {
      assert.equal(normalizeSortMode(m), "date");
    }
  });
});

describe("sortBillsForSchedule", () => {
  it("date mode is globally chronological", () => {
    const keys = sortBillsForSchedule(CROSS, "date").map((b) => b.installmentKey);
    assert.deepEqual(keys, ["A#0", "B#0", "C#0", "A#1", "B#1", "C#1", "A#2", "B#2", "C#2"]);
  });

  it("invoice mode keeps each invoice's installments contiguous and chronological", () => {
    const keys = sortBillsForSchedule(CROSS, "invoice").map((b) => b.installmentKey);
    assert.deepEqual(keys, ["A#0", "A#1", "A#2", "B#0", "B#1", "B#2", "C#0", "C#1", "C#2"]);
  });

  it("orders invoices by earliest due date, not alphabetically", () => {
    // Z is due first, so it belongs at the top even though its name sorts last. Alphabetical
    // ordering (what this did until 2026-09-08) put a bill due in months above an overdue one.
    const bills = [
      { installmentKey: "z1", invoice: "PI-Z", dueDate: "2026-01-05" },
      { installmentKey: "a1", invoice: "PI-A", dueDate: "2026-09-01" },
      { installmentKey: "a2", invoice: "PI-A", dueDate: "2026-09-08" },
      { installmentKey: "z2", invoice: "PI-Z", dueDate: "2026-02-05" },
    ];
    assert.deepEqual(
      sortBillsForSchedule(bills, "invoice").map((b) => b.installmentKey),
      ["z1", "z2", "a1", "a2"],
    );
  });

  it("two invoices due the same day get a stable order, not a reshuffle per render", () => {
    const bills = [
      { installmentKey: "b1", invoice: "PI-B", dueDate: "2026-05-01" },
      { installmentKey: "a1", invoice: "PI-A", dueDate: "2026-05-01" },
    ];
    const once = sortBillsForSchedule(bills, "invoice").map((b) => b.installmentKey);
    const twice = sortBillsForSchedule(bills.slice().reverse(), "invoice").map((b) => b.installmentKey);
    assert.deepEqual(once, ["a1", "b1"]);
    assert.deepEqual(twice, once);
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(CROSS));
    sortBillsForSchedule(CROSS, "invoice");
    assert.deepEqual(CROSS, copy);
  });

  it("junk input yields an empty list rather than throwing", () => {
    for (const junk of [null, undefined, "nope", 5, {}]) {
      assert.deepEqual(sortBillsForSchedule(junk, "date"), []);
    }
    assert.doesNotThrow(() => sortBillsForSchedule([{}, { invoice: "X" }], "invoice"));
  });
});

describe("rowIndexOf", () => {
  it("maps installmentKey to position", () => {
    const idx = rowIndexOf(sortBillsForSchedule(CROSS, "date"));
    assert.equal(idx.get("A#0"), 0);
    assert.equal(idx.get("C#2"), 8);
  });
  it("ignores rows with no key, and keeps the first of a duplicate", () => {
    const idx = rowIndexOf([{}, { installmentKey: "x" }, { installmentKey: "x" }]);
    assert.equal(idx.get("x"), 1);
    assert.equal(idx.size, 1);
  });
});

describe("orderAggregatesByFirstRow", () => {
  it("under the date sort, suggested payments come out in payOn order anyway", () => {
    const idx = rowIndexOf(sortBillsForSchedule(CROSS, "date"));
    const ordered = orderAggregatesByFirstRow(GROUPS, (g) => g.keys, idx);
    assert.deepEqual(ordered.map((g) => g.payOn), GROUPS.map((g) => g.payOn));
  });

  it("under the invoice sort, it follows the rows instead of payOn", () => {
    // Rows are A#0,A#1,A#2,B#0,... so group 1 (A#0) is first, group 2 (A#1) second — which here
    // matches payOn, but the ordering is now derived from the rows rather than assumed.
    const idx = rowIndexOf(sortBillsForSchedule(CROSS, "invoice"));
    const ordered = orderAggregatesByFirstRow(GROUPS, (g) => g.keys, idx);
    assert.deepEqual(ordered.map((g) => g.keys[0]), ["A#0", "A#1", "A#2"]);
  });

  it("re-orders when payOn and row position genuinely disagree", () => {
    const rows = [{ installmentKey: "late" }, { installmentKey: "early" }];
    const groups = [
      { payOn: "2026-01-01", keys: ["early"] },
      { payOn: "2026-06-01", keys: ["late"] },
    ];
    const ordered = orderAggregatesByFirstRow(groups, (g) => g.keys, rowIndexOf(rows));
    assert.deepEqual(ordered.map((g) => g.keys[0]), ["late", "early"]);
  });

  it("aggregates with no visible member sort last, keeping their relative order", () => {
    const rows = [{ installmentKey: "k1" }];
    const groups = [{ keys: ["ghost-a"] }, { keys: ["k1"] }, { keys: ["ghost-b"] }];
    const ordered = orderAggregatesByFirstRow(groups, (g) => g.keys, rowIndexOf(rows));
    assert.deepEqual(ordered.map((g) => g.keys[0]), ["k1", "ghost-a", "ghost-b"]);
  });

  it("does not mutate its input, and survives junk", () => {
    const copy = JSON.parse(JSON.stringify(GROUPS));
    orderAggregatesByFirstRow(GROUPS, (g) => g.keys, new Map());
    assert.deepEqual(GROUPS, copy);
    assert.deepEqual(orderAggregatesByFirstRow(null, () => [], new Map()), []);
  });
});

describe("aggregatesAreContiguous — the sort tradeoff, computed", () => {
  it("date sort: suggested payments line up, invoices do not", () => {
    const idx = rowIndexOf(sortBillsForSchedule(CROSS, "date"));
    assert.equal(aggregatesAreContiguous(GROUPS, idx), true);
    assert.equal(aggregatesAreContiguous(INVOICES.map((i) => ({ keys: i.keys })), idx), false);
  });

  it("invoice sort: exactly the mirror image", () => {
    const idx = rowIndexOf(sortBillsForSchedule(CROSS, "invoice"));
    assert.equal(aggregatesAreContiguous(GROUPS, idx), false);
    assert.equal(aggregatesAreContiguous(INVOICES.map((i) => ({ keys: i.keys })), idx), true);
  });

  it("one invoice per group is the easy case — both sides line up under either sort", () => {
    const bills = [
      { installmentKey: "a1", invoice: "PI-A", dueDate: "2026-08-01" },
      { installmentKey: "a2", invoice: "PI-A", dueDate: "2026-08-02" },
      { installmentKey: "b1", invoice: "PI-B", dueDate: "2026-08-20" },
    ];
    const groups = [{ keys: ["a1", "a2"] }, { keys: ["b1"] }];
    const invs = [{ keys: ["a1", "a2"] }, { keys: ["b1"] }];
    for (const mode of ["date", "invoice"]) {
      const idx = rowIndexOf(sortBillsForSchedule(bills, mode));
      assert.equal(aggregatesAreContiguous(groups, idx), true, mode);
      assert.equal(aggregatesAreContiguous(invs, idx), true, mode);
    }
  });

  it("empty and junk are trivially contiguous, not an error", () => {
    assert.equal(aggregatesAreContiguous([], new Map()), true);
    assert.equal(aggregatesAreContiguous(null, new Map()), true);
    assert.equal(aggregatesAreContiguous([{}, { keys: [] }], new Map()), true);
  });
});
