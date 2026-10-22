import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLinkListCopy,
  searchLinkListCopy,
  mergeChangedSince,
  linkListCheckDue,
  linkListCopyable,
  linkListAsOfText,
  foldLinkText,
  LINK_LIST_CHECK_EVERY_MS,
} from "../src/link-list-cache.js";

/** Plan 2026-10-21 (warm pick lists). */

const row = (value, description = value, label) => ({ value, description, ...(label ? { label } : {}) });
const values = (r) => r.results.map((o) => o.value);

// Shaped like the sandbox's Item list from `search_link` (probe 2026-10-21).
const items = [
  row("SAMPLE-SKU-01", "SAMPLE ITEM 01, Products"),
  row("SAMPLE-SKU-02", "SAMPLE ITEM 02, Products"),
  row("SAMPLE-SKU-03", "SAMPLE ITEM 03, Products"),
  row("WIDGET A", "Widget A, Products"),
  row("WIDGET-B", "Widget B, Products"),
];
const itemRank = ["SAMPLE-SKU-03", "WIDGET A", "SAMPLE-SKU-02", "SAMPLE-SKU-01", "WIDGET-B"];

describe("searchLinkListCopy — ERPNext's order", () => {
  const copy = buildLinkListCopy("Item", items, itemRank, { now: 0 });
  it("names starting with the text first, then the rest, each in string order", () => {
    // "-0" is inside SAMPLE-SKU-0x; "Widget" matches WIDGET A/B by name and description.
    assert.deepEqual(values(searchLinkListCopy(copy, "sku")), ["SAMPLE-SKU-01", "SAMPLE-SKU-02", "SAMPLE-SKU-03"]);
    assert.deepEqual(values(searchLinkListCopy(copy, "w")), ["WIDGET A", "WIDGET-B"]);
    assert.deepEqual(values(searchLinkListCopy(copy, "02")), ["SAMPLE-SKU-02"]);
  });
  it("matches the description and title too, case and accents aside", () => {
    assert.deepEqual(values(searchLinkListCopy(copy, "item 03")), ["SAMPLE-SKU-03"]);
    const c = buildLinkListCopy("Supplier", [row("CAFE SUPPLY", "Café Supply"), row("ACME")], [], { now: 0 });
    assert.deepEqual(values(searchLinkListCopy(c, "café")), ["CAFE SUPPLY"]);
    assert.equal(foldLinkText("Éclair"), "eclair");
  });
  it("prefix matches lead; inside them, capitals sort before small letters (Python's order)", () => {
    const c = buildLinkListCopy("Customer", [row("beta"), row("Beta"), row("ALPHA beta")], [], { now: 0 });
    assert.deepEqual(values(searchLinkListCopy(c, "be")), ["Beta", "beta", "ALPHA beta"]);
  });
  it("past 25 matches, which 25 follows where the text sits in the name, then rank", () => {
    const rows = [];
    for (let i = 1; i <= 30; i++) rows.push(row(`X-${String(i).padStart(2, "0")}`));
    rows.push(row("AX-99")); // text at position 1: after every name that starts with it
    // Rank: X-30 is the most linked, X-01 the least.
    const rank = rows.map((r) => r.value).filter((v) => v !== "AX-99").reverse();
    const c = buildLinkListCopy("Item", rows, rank.concat(["AX-99"]), { now: 0 });
    const got = values(searchLinkListCopy(c, "x"));
    assert.equal(got.length, 25);
    assert.equal(got[0], "X-06"); // X-01…X-05 ranked lowest, left out
    assert.ok(!got.includes("AX-99"));
    assert.ok(got.includes("X-30"));
  });
  it("an empty text shows the 25 best ranked, in string order", () => {
    const rows = [];
    for (let i = 1; i <= 30; i++) rows.push(row(`R-${String(i).padStart(2, "0")}`));
    const c = buildLinkListCopy("Item", rows, rows.map((r) => r.value).reverse(), { now: 0 });
    const got = values(searchLinkListCopy(c, ""));
    assert.equal(got[0], "R-06");
    assert.equal(got[24], "R-30");
  });
  it("nothing matched is a miss (the caller asks ERPNext); an empty text never is", () => {
    assert.deepEqual(searchLinkListCopy(copy, "zz"), { results: [], miss: true });
    assert.equal(searchLinkListCopy(copy, "").miss, false);
  });
  it("vendors are re-ranked by Purchase Order activity, as a live search is", () => {
    const c = buildLinkListCopy("Supplier", [row("ALPINE SUPPLY CO"), row("SUMMIT TRADERS")], [], {
      now: 0,
      lastPo: { "SUMMIT TRADERS": "2026-10-01" },
      fyStart: "2026-01-01",
    });
    assert.deepEqual(values(searchLinkListCopy(c, "", { asOf: "2026-10-21" })), ["SUMMIT TRADERS", "ALPINE SUPPLY CO"]);
  });
});

describe("mergeChangedSince", () => {
  const copy = buildLinkListCopy("Item", items, itemRank, { now: 0, newestModified: "2026-10-01 00:00:00" });
  it("a changed row is replaced and keeps its rank; a disabled one goes; a new one sorts after the ranked", () => {
    const { copy: next, changed, removed } = mergeChangedSince(
      copy,
      ["SAMPLE-SKU-02", "WIDGET-B", "NEW-1"],
      [row("SAMPLE-SKU-02", "SAMPLE ITEM 02 renamed"), row("NEW-1")],
      { now: 5, newestModified: "2026-10-21 09:00:00" },
    );
    assert.equal(changed, 3);
    assert.equal(removed, 1);
    assert.ok(!next.rows.some((r) => r.value === "WIDGET-B"));
    assert.equal(next.rows.find((r) => r.value === "SAMPLE-SKU-02").description, "SAMPLE ITEM 02 renamed");
    assert.equal(next.rows.find((r) => r.value === "SAMPLE-SKU-02").rank, 2);
    assert.equal(next.rows.find((r) => r.value === "NEW-1").rank, Infinity);
    assert.equal(next.newestModified, "2026-10-21 09:00:00");
    assert.equal(next.checkedAt, 5);
    assert.deepEqual(values(searchLinkListCopy(next, "renamed")), ["SAMPLE-SKU-02"]);
  });
  it("an older timestamp never moves the mark back", () => {
    const { copy: next } = mergeChangedSince(copy, [], [], { now: 1, newestModified: "2025-01-01 00:00:00" });
    assert.equal(next.newestModified, "2026-10-01 00:00:00");
  });
});

describe("when the copy answers, and when it checks", () => {
  it("only the listed lists, and never a filtered search", () => {
    assert.equal(linkListCopyable("Supplier", null), true);
    assert.equal(linkListCopyable("Supplier", { company: "X" }), false);
    assert.equal(linkListCopyable("Account", null), false);
    assert.equal(linkListCopyable("Sales Order", {}), false);
  });
  it("changed-since at most once a minute", () => {
    const copy = buildLinkListCopy("Item", items, itemRank, { now: 1000 });
    assert.equal(linkListCheckDue(copy, 1000 + LINK_LIST_CHECK_EVERY_MS - 1), false);
    assert.equal(linkListCheckDue(copy, 1000 + LINK_LIST_CHECK_EVERY_MS), true);
    assert.equal(linkListCheckDue(null, 1e12), false);
  });
  it("the line under the dropdown names the list and its time", () => {
    assert.equal(linkListAsOfText("Supplier", 0, () => "10:42"), "Vendors as of 10:42");
    assert.equal(linkListAsOfText("Sales Taxes and Charges Template", 0, () => "09:05"), "List as of 09:05");
  });
});
