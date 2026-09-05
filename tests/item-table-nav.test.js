import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CELL_MODE_EDIT,
  CELL_MODE_NAV,
  ITEM_TABLE_NAV_FIELDS,
  caretAtCellStart,
  caretAtCellEnd,
  isPrintableInputKey,
  neighborItemCell,
  itemTableKeyDecision,
  shouldLeaveItemTableBackward,
} from "../src/item-table-nav.js";

describe("item-table-nav", () => {
  it("caret boundary helpers", () => {
    assert.equal(caretAtCellStart(0, 0, 5), true);
    assert.equal(caretAtCellStart(2, 2, 5), false);
    assert.equal(caretAtCellEnd(5, 5, 5), true);
    assert.equal(caretAtCellEnd(0, 0, 5), false);
  });

  it("neighborItemCell walks Excel-style", () => {
    assert.deepEqual(neighborItemCell("item_code", 1, 3, "up"), {
      rowIndex: 0,
      field: "item_code",
    });
    assert.deepEqual(neighborItemCell("description", 0, 2, "left"), {
      rowIndex: 0,
      field: "item_code",
    });
    assert.deepEqual(neighborItemCell("item_code", 1, 3, "left"), {
      rowIndex: 0,
      field: "project",
    });
    assert.deepEqual(neighborItemCell("project", 0, 2, "right"), {
      rowIndex: 1,
      field: "item_code",
    });
    assert.equal(neighborItemCell("item_code", 0, 2, "up"), null);
  });

  it("shouldLeaveItemTableBackward only at origin", () => {
    assert.equal(shouldLeaveItemTableBackward(null, "left"), true);
    assert.equal(shouldLeaveItemTableBackward(null, "up"), true);
    assert.equal(shouldLeaveItemTableBackward(null, "right"), false);
    assert.equal(
      shouldLeaveItemTableBackward({ rowIndex: 0, field: "item_code" }, "left"),
      false,
    );
  });

  it("edit: Up at start leaves to nav (second Up after caret hit start)", () => {
    const d = itemTableKeyDecision({
      mode: CELL_MODE_EDIT,
      key: "ArrowUp",
      selectionStart: 0,
      selectionEnd: 0,
      valueLength: 8,
    });
    assert.equal(d.action, "leave_edit_move");
    assert.equal(d.mode, CELL_MODE_NAV);
    assert.equal(d.direction, "up");
    assert.equal(d.preventDefault, true);
  });

  it("edit: Up mid-text passes through", () => {
    const d = itemTableKeyDecision({
      mode: CELL_MODE_EDIT,
      key: "ArrowUp",
      selectionStart: 3,
      selectionEnd: 3,
      valueLength: 8,
    });
    assert.equal(d.action, "passthrough");
    assert.equal(d.mode, CELL_MODE_EDIT);
  });

  it("edit: Left at start leaves to nav", () => {
    const d = itemTableKeyDecision({
      mode: CELL_MODE_EDIT,
      key: "ArrowLeft",
      selectionStart: 0,
      selectionEnd: 0,
      valueLength: 4,
    });
    assert.equal(d.action, "leave_edit_move");
    assert.equal(d.direction, "left");
  });

  it("Shift+Tab enters nav and moves left", () => {
    const d = itemTableKeyDecision({
      mode: CELL_MODE_EDIT,
      key: "Tab",
      shiftKey: true,
    });
    assert.equal(d.action, "tab");
    assert.equal(d.mode, CELL_MODE_NAV);
    assert.equal(d.direction, "left");
  });

  it("nav: arrows move; typing enters edit", () => {
    assert.equal(
      itemTableKeyDecision({ mode: CELL_MODE_NAV, key: "ArrowDown" }).action,
      "move",
    );
    const type = itemTableKeyDecision({ mode: CELL_MODE_NAV, key: "A" });
    assert.equal(type.action, "enter_edit");
    assert.equal(type.mode, CELL_MODE_EDIT);
    assert.equal(isPrintableInputKey("5"), true);
  });

  it("nav field list matches Tab order", () => {
    assert.deepEqual([...ITEM_TABLE_NAV_FIELDS], [
      "item_code",
      "description",
      "qty",
      "rate",
      "project",
    ]);
  });

  it("defers to open link dropdown", () => {
    const d = itemTableKeyDecision({
      mode: CELL_MODE_EDIT,
      key: "ArrowDown",
      selectionStart: 9,
      selectionEnd: 9,
      valueLength: 9,
      linkDropdownOpen: true,
    });
    assert.equal(d.action, "passthrough");
  });

  it("Escape leaves edit into nav without moving", () => {
    const d = itemTableKeyDecision({
      mode: CELL_MODE_EDIT,
      key: "Escape",
      selectionStart: 2,
      selectionEnd: 2,
      valueLength: 5,
    });
    assert.equal(d.action, "leave_edit");
    assert.equal(d.mode, CELL_MODE_NAV);
  });

  it("qty verticalArrowsAlwaysNav moves even mid-cell in edit", () => {
    const d = itemTableKeyDecision({
      mode: CELL_MODE_EDIT,
      key: "ArrowUp",
      selectionStart: 1,
      selectionEnd: 1,
      valueLength: 3,
      verticalArrowsAlwaysNav: true,
    });
    assert.equal(d.action, "leave_edit_move");
    assert.equal(d.direction, "up");
    assert.equal(d.preventDefault, true);
  });
});
