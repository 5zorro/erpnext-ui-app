import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatDocLineNumber,
  sortableHeadersFromCols,
  sortDocItemRowModels,
} from "../src/doc-item-sort.js";
import { PO_ITEM_COLS, readPoItemRows } from "../src/po-map.js";

describe("formatDocLineNumber", () => {
  it("prefers ERP idx", () => {
    assert.equal(formatDocLineNumber(0, { idx: 3 }), "3");
    assert.equal(formatDocLineNumber(2, {}), "3");
  });
});

describe("sortableHeadersFromCols / sortDocItemRowModels", () => {
  it("builds PO sort headers including Line", () => {
    const h = sortableHeadersFromCols(PO_ITEM_COLS);
    assert.equal(h[0].sortKey, "lineNo");
    assert.ok(h.some((x) => x.sortKey === "item_code"));
  });

  it("sorts PO rows by item_code without changing ERP rowIndex", () => {
    const doc = {
      items: [
        { idx: 1, item_code: "Z", qty: 1, rate: 1, amount: 1 },
        { idx: 2, item_code: "A", qty: 2, rate: 2, amount: 4 },
      ],
    };
    const models = sortDocItemRowModels(doc, PO_ITEM_COLS, readPoItemRows, "item_code", true);
    assert.equal(models[0].rowIndex, 1);
    assert.equal(models[0].cells[1], "A");
    assert.equal(models[1].rowIndex, 0);
    assert.equal(models[1].cells[0], "1");
  });

  it("multi-column sort then lineNo tie-break", () => {
    const doc = {
      items: [
        { idx: 1, item_code: "B", qty: 2, rate: 1, amount: 2 },
        { idx: 2, item_code: "A", qty: 2, rate: 1, amount: 2 },
        { idx: 3, item_code: "C", qty: 1, rate: 1, amount: 1 },
      ],
    };
    const models = sortDocItemRowModels(doc, PO_ITEM_COLS, readPoItemRows, [
      { key: "amount", asc: false },
      { key: "item_code", asc: true },
    ]);
    assert.deepEqual(
      models.map((m) => m.cells[1]),
      ["A", "B", "C"],
    );
  });
});
