import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBillSourceLoadingGroups,
  buildSourceGroupFromSliceRows,
  applySourceSliceToGroups,
  SOURCE_LIST_SLICE_DEFS,
} from "../src/source-list-slices.js";
import { isSelectableSourceItem } from "../src/source-modal.js";

describe("buildBillSourceLoadingGroups", () => {
  it("includes NIC and loading placeholders per slice", () => {
    const g = buildBillSourceLoadingGroups();
    assert.equal(g[0].items[0].kind, "nic");
    assert.equal(g.length, 1 + SOURCE_LIST_SLICE_DEFS.length);
    for (let i = 1; i < g.length; i++) {
      assert.equal(g[i].loading, true);
      assert.equal(g[i].items[0].loading, true);
      assert.equal(isSelectableSourceItem(g[i].items[0]), false);
    }
  });
});

describe("applySourceSliceToGroups", () => {
  it("replaces loading slot and drops empty submitted groups", () => {
    let groups = buildBillSourceLoadingGroups();
    const poGroup = buildSourceGroupFromSliceRows("po_submitted", [
      { name: "PO-1", transaction_date: "2019-01-01", grand_total: 10 },
    ]);
    assert.ok(poGroup);
    groups = applySourceSliceToGroups(groups, poGroup);
    const po = groups.find((g) => g.id === "po_submitted");
    assert.ok(po);
    assert.equal(po.loading, false);
    assert.equal(isSelectableSourceItem(po.items[0]), true);

    const emptyPr = buildSourceGroupFromSliceRows("pr_submitted", []);
    assert.ok(emptyPr);
    groups = applySourceSliceToGroups(groups, emptyPr);
    assert.equal(groups.some((g) => g.id === "pr_submitted"), false);
  });
});
