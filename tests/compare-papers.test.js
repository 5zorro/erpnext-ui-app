import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SIDE_BY_SIDE_MIN_PX,
  frappeDownloadPath,
  paperKind,
  paperCantShow,
  paperSources,
  orderPapers,
  paneLayout,
  paperFromLabel,
  hasPaperSources,
  printedDocsFor,
  onePdfHtml,
} from "../src/compare-papers.js";

// 5zorro 2026-10-03: compare a bill against scanned / photographed / written .png .pdf .docx, all as
// if one PDF, to the right of the bill.
describe("compare-papers", () => {
  it("knows how to show each kind of paper", () => {
    assert.equal(paperKind("scan.PDF"), "pdf");
    assert.equal(paperKind("photo.jpeg"), "image");
    assert.equal(paperKind("IMG_0042.HEIC"), "heic");
    assert.equal(paperKind("notes.docx"), "docx");
    assert.equal(paperKind("blob", "application/pdf"), "pdf");
    assert.equal(paperKind("old.doc"), "other");
    assert.match(paperCantShow("heic", "IMG_1.HEIC"), /JPG/);
    assert.match(paperCantShow("other", "old.doc"), /\.docx/);
  });

  it("a bill's papers are its own and its source POs' and receipts', once each", () => {
    const s = paperSources({
      doctype: "Purchase Invoice",
      name: "ACC-PINV-2026-00004",
      items: [{ purchase_order: "PO-1" }, { purchase_order: "PO-1", purchase_receipt: "MAT-PRE-1" }, {}],
    });
    assert.deepEqual(s, [
      { doctype: "Purchase Invoice", name: "ACC-PINV-2026-00004", role: "self" },
      { doctype: "Purchase Order", name: "PO-1", role: "source" },
      { doctype: "Purchase Receipt", name: "MAT-PRE-1", role: "source" },
    ]);
    assert.deepEqual(paperSources({ doctype: "Purchase Invoice", name: "new-purchase-invoice-x" }), [], "an unsaved draft has no attachments yet");
  });

  it("own papers first, then sources, then dropped — oldest first inside each", () => {
    const p = (fileName, role, creation) => ({ key: fileName, fileName, role, kind: "pdf", from: "", creation });
    const out = orderPapers([p("drop.png", "dropped", "3"), p("po.pdf", "source", "1"), p("b2.pdf", "self", "2"), p("b1.pdf", "self", "1")]);
    assert.deepEqual(out.map((x) => x.fileName), ["b1.pdf", "b2.pdf", "po.pdf", "drop.png"]);
  });

  it("side by side from 1700px when the pane gets a useful width; otherwise over the document", () => {
    assert.equal(SIDE_BY_SIDE_MIN_PX, 1700);
    assert.deepEqual(paneLayout(1900, 1150), { mode: "side", paneWidth: 750 });
    assert.equal(paneLayout(1250, 1150).mode, "overlay");
    assert.ok(paneLayout(1250, 1150).paneWidth >= 520);
  });

  it("labels where a paper came from", () => {
    assert.equal(paperFromLabel({ doctype: "Purchase Invoice", name: "X", role: "self" }, "Bill"), "This Bill");
    assert.equal(paperFromLabel({ doctype: "Purchase Order", name: "PO-1", role: "source" }), "PO PO-1");
    assert.equal(paperFromLabel(null), "Dropped here");
  });
});

// 5zorro 2026-10-03: "can i have a toggle to include the po and ir attachments if any?"
describe("including the PO and receipt papers", () => {
  const bill = { doctype: "Purchase Invoice", name: "B1", items: [{ purchase_order: "PO-1", purchase_receipt: "PR-1" }] };
  it("off: the bill's own papers only", () => {
    assert.deepEqual(paperSources(bill, { includeSources: false }).map((s) => s.name), ["B1"]);
  });
  it("on: the bill's, then its PO's and receipt's", () => {
    assert.deepEqual(paperSources(bill, { includeSources: true }).map((s) => s.name), ["B1", "PO-1", "PR-1"]);
  });
  it("the toggle only shows when there is a PO or receipt to include", () => {
    assert.equal(hasPaperSources(bill), true);
    assert.equal(hasPaperSources({ doctype: "Purchase Invoice", name: "B2", items: [{}] }), false);
  });
});

// 5zorro 2026-10-03: "save all attachments as zip" … "save as pdf next to the zip".
describe("ZIP and one PDF", () => {
  const bill = { doctype: "Purchase Invoice", name: "B1", items: [{ purchase_order: "PO-1" }] };
  it("the printed documents follow the PO / receipt toggle", () => {
    assert.deepEqual(printedDocsFor(bill, false), [{ doctype: "Purchase Invoice", name: "B1" }]);
    assert.deepEqual(printedDocsFor(bill, true).map((d) => d.name), ["B1", "PO-1"]);
  });
  it("one page per paper, page breaks between, nothing silently dropped", () => {
    const html = onePdfHtml("B1 papers", [
      { title: "B1.pdf", from: "Printed Bill", pages: ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"] },
      { title: "notes.docx", html: "<p>Received</p>" },
      { title: "IMG_1.HEIC", note: "cannot be drawn" },
    ]);
    assert.equal((html.match(/<img /g) || []).length, 2);
    assert.equal((html.match(/class="brk"/g) || []).length, 2, "every paper after the first starts a page");
    assert.match(html, /<p>Received<\/p>/);
    assert.match(html, /cannot be drawn/);
    const hostile = onePdfHtml("x", [{ title: "<script>alert(1)</script>" }]);
    assert.match(hostile, /&lt;script&gt;alert\(1\)/, "a file name is text, never markup");
    assert.equal((hostile.match(/<script>/g) || []).length, 0);
  });
});

// 5zorro 2026-10-03: a picture fits one page; "microsoft word is okay, microsoft excel doesn't render
// to pdf consistently well".
describe("one page per picture; Word whole; spreadsheets left to their own program", () => {
  it("every picture is held to one page; Word is not shrunk", () => {
    const html = onePdfHtml("x", [{ title: "a.png", pages: ["data:image/png;base64,AA"] }, { title: "b.docx", html: "<p>x</p>" }]);
    assert.match(html, /max-height:24cm/);
    assert.doesNotMatch(html, /zoom/);
  });
  // 5zorro 2026-10-03: "csv and spreadsheets that are only one page is enough".
  it("a CSV or .xlsx is a sheet (a table when it fits one page); an old .xls says to open it in Excel", () => {
    assert.equal(paperKind("costs.xlsx"), "sheet");
    assert.equal(paperKind("export.CSV"), "sheet");
    assert.equal(paperKind("old.xls"), "other");
    assert.match(paperCantShow("other", "old.xls"), /spreadsheet.*Excel/);
  });
});

// 5zorro 2026-10-12: an attached private .html answered 403 by its own address (the frappe_docker
// web server strips ".html"); Frappe's download method serves it.
describe("frappeDownloadPath", () => {
  it("asks download_file for the file by its address", () => {
    assert.equal(
      frappeDownloadPath("/private/files/DF-03a_purchase_order.html"),
      "/api/method/download_file?file_url=%2Fprivate%2Ffiles%2FDF-03a_purchase_order.html",
    );
    assert.equal(frappeDownloadPath("/files/My Scan.pdf"), "/api/method/download_file?file_url=%2Ffiles%2FMy%20Scan.pdf");
  });
});
