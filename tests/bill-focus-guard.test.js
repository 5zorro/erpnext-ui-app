import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureBillFocus,
  isBillFormFocusTarget,
  restoreBillFocus,
} from "../src/bill-focus-guard.js";

describe("bill-focus-guard", () => {
  it("isBillFormFocusTarget recognizes data-field inputs", () => {
    const input = { getAttribute: (k) => (k === "data-field" ? "bill_no" : null) };
    assert.equal(isBillFormFocusTarget(input), true);
    assert.equal(isBillFormFocusTarget({ getAttribute: () => null }), false);
  });

  it("captureBillFocus returns null when nothing bill-focused", () => {
    const doc = {
      activeElement: { getAttribute: () => null },
    };
    const prev = globalThis.document;
    globalThis.document = doc;
    try {
      assert.deepEqual(captureBillFocus(), { element: null, field: null });
    } finally {
      globalThis.document = prev;
    }
  });

  it("restoreBillFocus skips when allowFocusVendor", () => {
    let focused = false;
    const el = {
      focus() {
        focused = true;
      },
      getAttribute: () => "bill_no",
    };
    restoreBillFocus({ element: el, field: "bill_no" }, { allowFocusVendor: true });
    assert.equal(focused, false);
  });

  describe("a repaint rebuilt the focused line cell", () => {
    /** A stand-in document holding `cells`, with focus on `active`. */
    function withDocument(cells, active, fn) {
      const prev = globalThis.document;
      globalThis.document = {
        activeElement: active,
        body: { tag: "body" },
        contains: (el) => cells.includes(el),
        querySelector: (sel) => cells.find((c) => sel.includes(`[data-row="${c.row}"]`) && sel.includes(`[data-field="${c.field}"]`)) || null,
      };
      try {
        fn();
      } finally {
        globalThis.document = prev;
      }
    }
    const cell = (row, field) => {
      const c = { row, field, focused: 0, getAttribute: (k) => (k === "data-field" ? field : k === "data-row" ? row : null), focus() { c.focused++; } };
      return c;
    };

    it("focus goes to the same row and field in the rebuilt table", () => {
      const gone = cell("0", "qty");
      const again = cell("0", "qty");
      withDocument([again], { tag: "body" }, () => restoreBillFocus({ element: gone, field: "qty", row: "0" }));
      assert.equal(again.focused, 1);
    });

    it("the line rows already put the clerk back (by line, with their typing): focus stays there (museum OI-202)", () => {
      const gone = cell("0", "item_code");
      const byIndex = cell("0", "item_code");
      const byLine = cell("1", "item_code"); // the clerk's line moved down when a line was added above it
      withDocument([byIndex, byLine], byLine, () => restoreBillFocus({ element: gone, field: "item_code", row: "0" }));
      assert.equal(byIndex.focused, 0);
    });
  });
});
