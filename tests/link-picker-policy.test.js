import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  initialLinkHighlightIndex,
  nextLinkHighlightIndex,
  resolveLinkPickIndex,
  linkPickerKeyAction,
  nextFieldAfterLinkPick,
  nextItemFieldAfterEdit,
  nextItemFocusAfterEdit,
  itemNavFieldsFromCols,
  scrollLinkOptionIntoView,
  DEFAULT_ITEM_NAV_FIELDS,
} from "../src/link-picker-policy.js";
import { PO_ITEM_COLS } from "../src/po-map.js";
import { RECEIPT_ITEM_COLS } from "../src/receipt-map.js";

describe("initialLinkHighlightIndex", () => {
  it("highlights first when any options", () => {
    assert.equal(initialLinkHighlightIndex(0), -1);
    assert.equal(initialLinkHighlightIndex(1), 0);
    assert.equal(initialLinkHighlightIndex(5), 0);
  });
});

describe("nextLinkHighlightIndex", () => {
  it("moves within bounds", () => {
    assert.equal(nextLinkHighlightIndex(-1, 3, "down"), 0);
    assert.equal(nextLinkHighlightIndex(0, 3, "down"), 1);
    assert.equal(nextLinkHighlightIndex(2, 3, "down"), 2);
    assert.equal(nextLinkHighlightIndex(2, 3, "up"), 1);
    assert.equal(nextLinkHighlightIndex(0, 3, "up"), 0);
  });
});

describe("resolveLinkPickIndex", () => {
  it("uses highlight or falls back to first", () => {
    assert.equal(resolveLinkPickIndex(2, 4), 2);
    assert.equal(resolveLinkPickIndex(-1, 4), 0);
    assert.equal(resolveLinkPickIndex(0, 0), -1);
  });
});

describe("linkPickerKeyAction", () => {
  it("Tab/Enter pick when open with options", () => {
    assert.equal(linkPickerKeyAction("Tab", { dropdownOpen: true, optionCount: 2 }), "pick");
    assert.equal(linkPickerKeyAction("Enter", { dropdownOpen: true, optionCount: 1 }), "pick");
    assert.equal(linkPickerKeyAction("Tab", { dropdownOpen: false, optionCount: 2 }), "none");
    assert.equal(linkPickerKeyAction("Escape", { dropdownOpen: true, optionCount: 2 }), "close");
    assert.equal(linkPickerKeyAction("ArrowDown", { dropdownOpen: false, optionCount: 0 }), "search");
    assert.equal(linkPickerKeyAction("ArrowDown", { dropdownOpen: true, optionCount: 3 }), "move_down");
  });
});

describe("nextFieldAfterLinkPick / nextItemFieldAfterEdit", () => {
  it("walks Item → Description → Qty → Cost → Project", () => {
    assert.equal(nextItemFieldAfterEdit("item_code"), "description");
    assert.equal(nextFieldAfterLinkPick("item_code"), "description");
    assert.equal(nextItemFieldAfterEdit("description"), "qty");
    assert.equal(nextItemFieldAfterEdit("qty"), "rate");
    assert.equal(nextItemFieldAfterEdit("rate"), "project");
    assert.equal(nextItemFieldAfterEdit("project"), null);
  });

  it("nextItemFocusAfterEdit wraps or adds a row at the table end", () => {
    assert.deepEqual(nextItemFocusAfterEdit("qty", 0, 2), {
      rowIndex: 0,
      field: "rate",
      addRow: false,
      deleteRow: false,
      leaveTable: false,
    });
    assert.deepEqual(nextItemFocusAfterEdit("project", 0, 2), {
      rowIndex: 1,
      field: "item_code",
      addRow: false,
      deleteRow: false,
      leaveTable: false,
    });
    assert.deepEqual(nextItemFocusAfterEdit("project", 1, 2), {
      rowIndex: 1,
      field: null,
      addRow: true,
      deleteRow: false,
      leaveTable: false,
    });
  });

  it("Tab on empty Item leaves the table and deletes the invalid row", () => {
    assert.deepEqual(nextItemFocusAfterEdit("item_code", 1, 2, { cellValue: "" }), {
      rowIndex: 1,
      field: null,
      addRow: false,
      deleteRow: true,
      leaveTable: true,
    });
    assert.deepEqual(nextItemFocusAfterEdit("item_code", 1, 2, { cellValue: "  " }), {
      rowIndex: 1,
      field: null,
      addRow: false,
      deleteRow: true,
      leaveTable: true,
    });
    assert.deepEqual(nextItemFocusAfterEdit("item_code", 0, 1, { cellValue: "SKU-1" }), {
      rowIndex: 0,
      field: "description",
      addRow: false,
      deleteRow: false,
      leaveTable: false,
    });
  });
});

describe("itemNavFieldsFromCols / PO Tab order", () => {
  it("defaults match Bill project order", () => {
    assert.deepEqual([...DEFAULT_ITEM_NAV_FIELDS], [
      "item_code",
      "description",
      "qty",
      "rate",
      "project",
    ]);
    assert.deepEqual(itemNavFieldsFromCols(RECEIPT_ITEM_COLS), [
      "item_code",
      "description",
      "qty",
      "rate",
      "project",
    ]);
  });

  it("PO ends with sales_order + drop ship + schedule_date so Tab adds a row", () => {
    const fields = itemNavFieldsFromCols(PO_ITEM_COLS);
    assert.deepEqual(fields, [
      "item_code",
      "description",
      "qty",
      "rate",
      "sales_order",
      "delivered_by_supplier",
      "schedule_date",
    ]);
    assert.deepEqual(nextItemFocusAfterEdit("schedule_date", 0, 1, { fields }), {
      rowIndex: 0,
      field: null,
      addRow: true,
      deleteRow: false,
      leaveTable: false,
    });
  });
});

describe("scrollLinkOptionIntoView", () => {
  it("calls scrollIntoView nearest when present", () => {
    let seen = null;
    const el = {
      scrollIntoView(opts) {
        seen = opts;
      },
    };
    assert.equal(scrollLinkOptionIntoView(el), true);
    assert.deepEqual(seen, { block: "nearest" });
    assert.equal(scrollLinkOptionIntoView(null), false);
  });
});
