import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseCsv,
  trimSheet,
  sheetFitsOnePage,
  sheetTooBigNote,
  sheetTableHtml,
  readXlsxFirstSheet,
  SHEET_MAX_ROWS,
} from "../src/sheet-preview.js";

// 5zorro 2026-10-03: "csv and spreadsheets that are only one page is enough" — not "a csv that
// accidentally takes up 20 pages and no headers".
describe("sheet-preview", () => {
  it("reads CSV with quotes, embedded commas and newlines, and finds the delimiter", () => {
    assert.deepEqual(parseCsv('Item,Qty,Note\r\nWIDGET A,2,"box, dented"\r\n"WIDGET ""B""",1,"two\nlines"\r\n'), [
      ["Item", "Qty", "Note"],
      ["WIDGET A", "2", "box, dented"],
      ['WIDGET "B"', "1", "two\nlines"],
    ]);
    assert.deepEqual(parseCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
  });

  it("drops the empty rows and columns exports carry", () => {
    assert.deepEqual(trimSheet([["a", "", ""], ["", "", ""], ["b", "c", ""], ["", "", ""]]), [["a", ""], ["", ""], ["b", "c"]]);
  });

  it("one page or not — and the 20-page CSV says so", () => {
    assert.equal(sheetFitsOnePage([["a"], ["1"]]).fits, true);
    const long = Array.from({ length: SHEET_MAX_ROWS + 400 }, (_, i) => [String(i), "x"]);
    const size = sheetFitsOnePage(long);
    assert.equal(size.fits, false);
    assert.match(sheetTooBigNote("export.csv", size), /445 rows × 2 columns.*Excel/);
    assert.equal(sheetFitsOnePage([Array.from({ length: 11 }, () => "c")]).fits, false, "too wide is too big too");
  });

  it("a table with a header row; cell text is text", () => {
    const html = sheetTableHtml([["Item", "Qty"], ["<b>", "2"]]);
    assert.match(html, /<th>Item<\/th>/);
    assert.match(html, /<td>&lt;b&gt;<\/td>/);
  });

  it("reads the first sheet of a real .xlsx (written by Python's zipfile, deflated)", async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "xlsx-"));
    const file = path.join(dir, "t.xlsx");
    try {
      try {
        execFileSync("python3", ["-c", `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
z.writestr('[Content_Types].xml','<Types/>')
z.writestr('xl/workbook.xml','<workbook/>')
z.writestr('xl/sharedStrings.xml','<sst><si><t>Item</t></si><si><t>Qty</t></si><si><r><t>WIDGET </t></r><r><t>A</t></r></si></sst>')
z.writestr('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>2.5</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>x &amp; y</t></is></c><c r="B3" t="b"><v>1</v></c></row></sheetData></worksheet>')
z.close()`, file]);
      } catch {
        t.skip("python3 not available to write the .xlsx");
        return;
      }
      const rows = await readXlsxFirstSheet(new Uint8Array(readFileSync(file)));
      assert.deepEqual(rows, [
        ["Item", "Qty", ""],
        ["WIDGET A", "", "2.5"],
        ["x & y", "TRUE", ""],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
