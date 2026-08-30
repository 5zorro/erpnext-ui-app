import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseGridText,
  detectGridDelimiter,
  detectHeaderRow,
  guessColumnMap,
  rowsToImportRecords,
  validateImportRecords,
  editableImportFields,
  importColumnOptions,
  defaultRowRoles,
  applyIgnoreFirstRows,
  resolveImportRecord,
  mergeImportDescription,
  MAX_ITEM_IMPORT_ROWS,
  IMPORT_COL_IGNORE,
  IMPORT_COL_DESCRIPTION_APPEND,
  IMPORT_COL_LINE_AMOUNT,
} from "../src/item-import-cleaner.js";
import { PO_ITEM_COLS } from "../src/po-map.js";
import { DOGFOOD_AP_SOURCES } from "../src/sample-data/dogfood-ap-sources.js";
import {
  buildMessyImportPaste,
  MESSY_VENDOR_11COL,
} from "../src/sample-data/dogfood-import-paste.js";

describe("parseGridText", () => {
  it("parses tab-separated paste", () => {
    const { rows, delimiter } = parseGridText("Item\tQty\nA\t2");
    assert.equal(delimiter, "tab");
    assert.deepEqual(rows, [
      ["Item", "Qty"],
      ["A", "2"],
    ]);
  });

  it("parses comma CSV", () => {
    const { rows, delimiter } = parseGridText('SKU,Description,Qty\n"W-1","Widget, large",3');
    assert.equal(delimiter, ",");
    assert.deepEqual(rows[1], ["W-1", "Widget, large", "3"]);
  });
});

describe("detectHeaderRow + guessColumnMap", () => {
  const options = importColumnOptions(PO_ITEM_COLS);

  it("detects a header row from labels", () => {
    const rows = [
      ["Item", "Description", "Qty", "Rate"],
      ["SKU-1", "Widget", "4", "9.99"],
    ];
    assert.equal(detectHeaderRow(rows, options), true);
    const map = guessColumnMap(rows[0], options, rows[0].length);
    assert.equal(map[0], "item_code");
    assert.equal(map[2], "qty");
  });

  it("maps extended amount column", () => {
    const header = MESSY_VENDOR_11COL.headerRow;
    const map = guessColumnMap(header, options, header.length);
    assert.equal(map[3], "item_code");
    assert.equal(map[5], "qty");
    assert.equal(map[9], IMPORT_COL_LINE_AMOUNT);
  });
});

describe("ignore dirty rows", () => {
  const fields = editableImportFields(PO_ITEM_COLS);

  it("skips first two rows via applyIgnoreFirstRows", () => {
    const rows = [
      ["junk", "export"],
      ["Item", "Qty"],
      ["SKU-1", "2"],
    ];
    const columnMap = ["item_code", "qty"];
    let rowRoles = defaultRowRoles(rows.length, false);
    rowRoles = applyIgnoreFirstRows(rowRoles, 2);
    const records = rowsToImportRecords(rows, { columnMap, rowRoles, editableFields: fields });
    assert.equal(records.length, 1);
    assert.deepEqual(records[0], { item_code: "SKU-1", qty: "2" });
  });

  it("supports append description and line amount", () => {
    const rows = [["SKU-1", "Lot note", "4", "40.00"]];
    const columnMap = ["item_code", IMPORT_COL_DESCRIPTION_APPEND, "qty", IMPORT_COL_LINE_AMOUNT];
    const rowRoles = ["data"];
    const records = rowsToImportRecords(rows, {
      columnMap,
      rowRoles,
      editableFields: fields,
    });
    assert.equal(records[0].item_code, "SKU-1");
    assert.equal(records[0]._appendDescription, "Lot note");
    assert.equal(records[0]._lineAmount, "40.00");
    const resolved = resolveImportRecord(records[0]);
    assert.equal(resolved.writes.rate, "10");
    assert.equal(resolved.appendDescription, "Lot note");
  });
});

describe("mergeImportDescription", () => {
  it("appends after ERP item name", () => {
    assert.equal(
      mergeImportDescription("Sample Item 07", "Lot note: red tag", undefined),
      "Sample Item 07 — Lot note: red tag",
    );
  });
});

describe("validateImportRecords", () => {
  it("blocks empty and over-max imports", () => {
    assert.equal(validateImportRecords([]).ok, false);
    const many = Array.from({ length: MAX_ITEM_IMPORT_ROWS + 1 }, () => ({ item_code: "X" }));
    assert.equal(validateImportRecords(many).ok, false);
  });
});

describe("detectGridDelimiter", () => {
  it("prefers tab when more tabs than commas", () => {
    assert.equal(detectGridDelimiter("a\tb\tc"), "tab");
    assert.equal(detectGridDelimiter("a,b,c"), ",");
  });
});

describe("DF-13 messy paste pack", () => {
  it("builds 11-column grid with 2 leading junk rows", () => {
    const doc = DOGFOOD_AP_SOURCES.find((d) => d.id === "DF-13");
    assert.ok(doc);
    const paste = buildMessyImportPaste(doc);
    assert.equal(paste.rows.length, 2 + doc.lines.length);
    assert.equal(paste.rows[0][0], "MA INC — OPEN ORDER EXPORT");
    assert.equal(paste.rows[1][3], "SKU");
    assert.match(paste.tsv, /SAMPLE-SKU-07/);
    const fields = editableImportFields(PO_ITEM_COLS);
    const columnMap = guessColumnMap(paste.rows[1], importColumnOptions(PO_ITEM_COLS), 11);
    const rowRoles = applyIgnoreFirstRows(defaultRowRoles(paste.rows.length, true), 2);
    const records = rowsToImportRecords(paste.rows, {
      columnMap,
      rowRoles,
      editableFields: fields,
    });
    assert.equal(records.length, doc.lines.length);
    assert.equal(records[0].item_code, "SAMPLE-SKU-07");
    assert.equal(records[0].qty, "10");
    assert.equal(resolveImportRecord(records[0]).writes.rate, "43");
  });
});
