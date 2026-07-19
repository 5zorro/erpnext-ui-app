import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSearchLinkResults,
  filterLinkOptions,
  linkOptionLabel,
  linkDoctypeForBillField,
} from "../src/link-search.js";

describe("normalizeSearchLinkResults", () => {
  it("maps search_link shape", () => {
    const out = normalizeSearchLinkResults([
      { value: "SUP-001", description: "Acme Hardware" },
      { name: "ITEM-1", item_name: "Widget" },
      "RAW-CODE",
    ]);
    assert.deepEqual(out, [
      { value: "SUP-001", description: "Acme Hardware" },
      { value: "ITEM-1", description: "Widget" },
      { value: "RAW-CODE", description: "RAW-CODE" },
    ]);
  });

  it("ignores junk", () => {
    assert.deepEqual(normalizeSearchLinkResults(null), []);
    assert.deepEqual(normalizeSearchLinkResults([{}, { value: "" }]), []);
  });
});

describe("filterLinkOptions", () => {
  const opts = [
    { value: "SUP-1", description: "Acme" },
    { value: "SUP-2", description: "Beta Co" },
    { value: "VEN-9", description: "Acme West" },
  ];

  it("filters by value or description", () => {
    assert.equal(filterLinkOptions(opts, "acme").length, 2);
    assert.equal(filterLinkOptions(opts, "SUP-2")[0].value, "SUP-2");
  });

  it("limits and prefers prefix matches", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      value: `X${i}`,
      description: i === 5 ? "zzztarget" : `n${i}`,
    }));
    many.push({ value: "target", description: "Exact" });
    const hit = filterLinkOptions(many, "target", { limit: 5 });
    assert.ok(hit.length <= 5);
    assert.equal(hit[0].value, "target");
  });
});

describe("linkOptionLabel", () => {
  it("shows description with value when distinct", () => {
    assert.equal(
      linkOptionLabel({ value: "SUP-1", description: "Acme" }),
      "Acme (SUP-1)",
    );
    assert.equal(linkOptionLabel({ value: "A", description: "A" }), "A");
  });
});

describe("linkDoctypeForBillField", () => {
  it("maps Bill link fields", () => {
    assert.equal(linkDoctypeForBillField("supplier"), "Supplier");
    assert.equal(linkDoctypeForBillField("item_code"), "Item");
    assert.equal(linkDoctypeForBillField("qty"), null);
  });
});
