import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isEmptyItemCode,
  docHasCommittedItemLine,
  shouldBlockDeleteLastItemRow,
  emptyItemRowCleanupAction,
  itemRowDeleteAction,
  LAST_ITEM_ROW_TOAST,
  lastItemRowToast,
  ITEM_ROW_CLEAR_FIELDS,
} from "../src/bill-item-guard.js";

describe("bill-item-guard", () => {
  it("detects empty item codes", () => {
    assert.equal(isEmptyItemCode(""), true);
    assert.equal(isEmptyItemCode("  "), true);
    assert.equal(isEmptyItemCode("SKU-1"), false);
  });

  it("docHasCommittedItemLine ignores placeholder rows", () => {
    assert.equal(docHasCommittedItemLine(null), false);
    assert.equal(docHasCommittedItemLine({ items: [] }), false);
    assert.equal(docHasCommittedItemLine({ items: [{ item_code: "" }] }), false);
    assert.equal(docHasCommittedItemLine({ items: [{ item_code: "SKU-1" }] }), true);
  });

  it("blocks delete when only one row", () => {
    assert.equal(shouldBlockDeleteLastItemRow(1), true);
    assert.equal(shouldBlockDeleteLastItemRow(0), true);
    assert.equal(shouldBlockDeleteLastItemRow(2), false);
  });

  it("× on last row clears; × with extras deletes", () => {
    assert.deepEqual(itemRowDeleteAction(1), {
      action: "clear",
      reason: LAST_ITEM_ROW_TOAST,
    });
    assert.deepEqual(itemRowDeleteAction(3), { action: "delete" });
  });

  it("deletes empty extras but keeps the last blank row", () => {
    assert.deepEqual(emptyItemRowCleanupAction(3, ""), { action: "delete" });
    assert.equal(emptyItemRowCleanupAction(1, "").action, "keep");
    assert.match(emptyItemRowCleanupAction(1, "").reason || "", /at least 1 row/i);
    assert.equal(emptyItemRowCleanupAction(2, "SKU").action, "keep");
  });

  it("exports toast copy and clear-field list", () => {
    assert.match(LAST_ITEM_ROW_TOAST, /at least 1 row on the items table/i);
    assert.equal(lastItemRowToast("Purchase Order"), LAST_ITEM_ROW_TOAST);
    assert.ok(ITEM_ROW_CLEAR_FIELDS.some((f) => f.field === "item_code"));
    assert.ok(ITEM_ROW_CLEAR_FIELDS.some((f) => f.field === "qty" && f.value === 0));
  });
});
