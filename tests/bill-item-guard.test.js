import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isEmptyItemCode,
  shouldBlockDeleteLastItemRow,
  emptyItemRowCleanupAction,
  LAST_ITEM_ROW_TOAST,
  lastItemRowToast,
} from "../src/bill-item-guard.js";

describe("bill-item-guard", () => {
  it("detects empty item codes", () => {
    assert.equal(isEmptyItemCode(""), true);
    assert.equal(isEmptyItemCode("  "), true);
    assert.equal(isEmptyItemCode("SKU-1"), false);
  });

  it("blocks delete when only one row", () => {
    assert.equal(shouldBlockDeleteLastItemRow(1), true);
    assert.equal(shouldBlockDeleteLastItemRow(0), true);
    assert.equal(shouldBlockDeleteLastItemRow(2), false);
  });

  it("deletes empty extras but keeps the last blank row", () => {
    assert.deepEqual(emptyItemRowCleanupAction(3, ""), { action: "delete" });
    assert.equal(emptyItemRowCleanupAction(1, "").action, "keep");
    assert.match(emptyItemRowCleanupAction(1, "").reason || "", /at least one/i);
    assert.equal(emptyItemRowCleanupAction(2, "SKU").action, "keep");
  });

  it("exports toast copy", () => {
    assert.match(LAST_ITEM_ROW_TOAST, /at least one item/i);
    assert.match(lastItemRowToast("Purchase Order"), /Purchase Order/);
  });
});
