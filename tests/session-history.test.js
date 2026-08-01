import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CALC_HISTORY_TTL_MS,
  makeCalcHistoryEntry,
  appendCalcHistory,
  pruneCalcHistory,
  formatCalcCopyTable,
  formatCalcCopyTotal,
  footingToSpreadsheetRows,
  findCalcHistoryEntry,
  calcSourceLabel,
  calcHistoryDisplayLabel,
  markCalcHistoryPriorSession,
  calcHistoryTapeOrder,
  groupCalcHistoryForFlyout,
  splitCalcHistoryFlyoutSections,
} from "../src/calc/session-history.js";

describe("calcSourceLabel", () => {
  it("maps Doc skins to clerk labels", () => {
    assert.equal(calcSourceLabel("purchase-invoice"), "Bill entry");
    assert.equal(calcSourceLabel("purchase-order"), "Purchase Order");
    assert.equal(calcSourceLabel("purchase-receipt"), "Item Receipt");
  });
});

describe("prior session marking", () => {
  it("marks loaded rows and labels them in the flyout", () => {
    const e = makeCalcHistoryEntry(
      { total: "125", footing: "100+\n25", sourceLabel: "Bill entry" },
      { id: "a" },
    );
    assert.equal(e.priorSession, false);
    const marked = markCalcHistoryPriorSession([e]);
    assert.equal(marked[0].priorSession, true);
    assert.equal(calcHistoryDisplayLabel(marked[0]), "Bill entry · Previous session");
    const list = appendCalcHistory(marked, makeCalcHistoryEntry(
      { total: "3", footing: "1+\n2", sourceLabel: "Bill entry" },
      { id: "b" },
    ));
    assert.equal(list.find((x) => x.id === "b").priorSession, false);
    assert.equal(list.find((x) => x.id === "a").priorSession, true);
  });
});

describe("append / prune calc history", () => {
  it("appends newest-first and prunes past 24h", () => {
    const now = 1_700_000_000_000;
    const fresh = makeCalcHistoryEntry(
      { total: "125", footing: "100+\n25", sourceLabel: "Bill entry" },
      { now, id: "a" },
    );
    const stale = makeCalcHistoryEntry(
      {
        total: "9",
        footing: "9",
        sourceLabel: "Bill entry",
        at: now - CALC_HISTORY_TTL_MS - 1,
      },
      { now: now - CALC_HISTORY_TTL_MS - 1, id: "b" },
    );
    let list = appendCalcHistory([], stale, { now });
    assert.equal(list.length, 0);
    list = appendCalcHistory(list, fresh, { now });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "a");
    list = pruneCalcHistory(
      [
        fresh,
        makeCalcHistoryEntry(
          { total: "1", footing: "1", sourceLabel: "x", at: now - CALC_HISTORY_TTL_MS - 5 },
          { id: "old" },
        ),
      ],
      { now },
    );
    assert.equal(list.length, 1);
  });

  it("findCalcHistoryEntry by id", () => {
    const e = makeCalcHistoryEntry({ total: "3", footing: "1+\n2", sourceLabel: "Bill entry" }, { id: "x" });
    const list = appendCalcHistory([], e);
    assert.equal(findCalcHistoryEntry(list, "x").total, "3");
    assert.equal(findCalcHistoryEntry(list, "missing"), null);
  });
});

describe("copy-as-table (spreadsheet-friendly)", () => {
  it("turns trailing ops into signed column rows", () => {
    assert.deepEqual(footingToSpreadsheetRows("111.00+\n111.00-\n10.00"), [
      "111.00",
      "111.00",
      "-10.00",
    ]);
    const e = makeCalcHistoryEntry(
      {
        total: "212",
        footing: "111.00+\n111.00-\n10.00",
        sourceLabel: "Bill entry",
      },
      { id: "t" },
    );
    assert.equal(formatCalcCopyTable(e), "111.00\n111.00\n-10.00\n------\n212.00");
    assert.equal(formatCalcCopyTotal(e), "212");
  });

  it("money tape 104.00+ / 206.50 copies as two positive rows", () => {
    const e = makeCalcHistoryEntry(
      { total: "310.50", footing: "104.00+\n206.50", sourceLabel: "Bill entry" },
      { id: "m" },
    );
    assert.equal(formatCalcCopyTable(e), "104.00\n206.50\n------\n310.50");
  });
});

describe("calcHistoryTapeOrder / groupCalcHistoryForFlyout", () => {
  it("orders oldest → newest (newest at bottom)", () => {
    const a = makeCalcHistoryEntry(
      { total: "1", footing: "1", sourceLabel: "Bill entry", at: 100 },
      { id: "a" },
    );
    const b = makeCalcHistoryEntry(
      { total: "2", footing: "2", sourceLabel: "Purchase Order", at: 200 },
      { id: "b" },
    );
    const ordered = calcHistoryTapeOrder([b, a]);
    assert.equal(ordered[0].id, "a");
    assert.equal(ordered[1].id, "b");
  });

  it("groups consecutive same source under one label", () => {
    const a = makeCalcHistoryEntry(
      { total: "1", footing: "1", sourceLabel: "Bill entry", at: 100 },
      { id: "a" },
    );
    const b = makeCalcHistoryEntry(
      { total: "2", footing: "2", sourceLabel: "Bill entry", at: 150 },
      { id: "b" },
    );
    const c = makeCalcHistoryEntry(
      { total: "3", footing: "3", sourceLabel: "Purchase Order", at: 200 },
      { id: "c" },
    );
    const groups = groupCalcHistoryForFlyout([c, a, b]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].label, "Bill entry");
    assert.deepEqual(groups[0].entries.map((e) => e.id), ["a", "b"]);
    assert.equal(groups[1].label, "Purchase Order");
    assert.equal(groups[1].entries[0].id, "c");
  });

  it("collapses prior under dropdown only when current session has entries", () => {
    const prior = makeCalcHistoryEntry(
      { total: "1", footing: "1", sourceLabel: "Bill entry", at: 100, priorSession: true },
      { id: "p" },
    );
    const cur = makeCalcHistoryEntry(
      { total: "2", footing: "2", sourceLabel: "Bill entry", at: 200 },
      { id: "c" },
    );
    const both = splitCalcHistoryFlyoutSections([prior, cur]);
    assert.equal(both.collapsePrior, true);
    assert.equal(both.priorEntryCount, 1);
    assert.equal(both.current.length, 1);
    assert.equal(both.prior[0].label, "Bill entry");

    const onlyPrior = splitCalcHistoryFlyoutSections([prior]);
    assert.equal(onlyPrior.collapsePrior, false);
  });
});
