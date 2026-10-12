import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachmentSource, attachmentRows, formatFileSize, formatAddedDate } from "../src/attachment-list.js";

// 5zorro 2026-10-12: the attached files as a table under the notes, with Peek and Download.
describe("attachmentSource", () => {
  it("a saved document is listed by its name", () => {
    assert.deepEqual(attachmentSource({ doctype: "Sales Order", name: "SAL-ORD-2026-00001" }), {
      doctype: "Sales Order",
      name: "SAL-ORD-2026-00001",
    });
  });
  it("an unsaved draft has nothing to list yet", () => {
    assert.equal(attachmentSource({ doctype: "Sales Order", name: "new-sales-order-xxisrhsdhj" }), null);
    assert.equal(attachmentSource({ doctype: "Purchase Invoice", name: "new" }), null);
    assert.equal(attachmentSource({ doctype: "", name: "X" }), null);
    assert.equal(attachmentSource(null), null);
  });
});

describe("attachmentRows", () => {
  const files = [
    { name: "f2", file_name: "second.png", file_url: "/private/files/second.png", is_private: 1, creation: "2026-10-12 09:00:00", file_size: 2_500_000 },
    { name: "f1", file_name: "DF-03a_purchase_order.pdf", file_url: "/private/files/DF-03a_purchase_order.pdf", is_private: 1, creation: "2026-10-11 20:50:45.798404", file_size: 14_336 },
    { name: "link", file_name: "", file_url: "", creation: "2026-10-12 10:00:00" },
  ];
  it("oldest first, with size and date the clerk reads; a record with no file is left out", () => {
    assert.deepEqual(attachmentRows(files), [
      { key: "f1", fileName: "DF-03a_purchase_order.pdf", fileUrl: "/private/files/DF-03a_purchase_order.pdf", size: "14 KB", added: "10/11/2026", isPrivate: true },
      { key: "f2", fileName: "second.png", fileUrl: "/private/files/second.png", size: "2.4 MB", added: "10/12/2026", isPrivate: true },
    ]);
  });
  it("a file with no file_name is named from its address", () => {
    const [row] = attachmentRows([{ name: "x", file_url: "/files/My%20Scan.pdf", is_private: 0 }]);
    assert.equal(row.fileName, "My Scan.pdf");
    assert.equal(row.isPrivate, false);
    assert.equal(row.size, "");
  });
  it("nothing in, nothing out", () => {
    assert.deepEqual(attachmentRows(null), []);
  });
});

describe("formatFileSize / formatAddedDate", () => {
  it("sizes", () => {
    assert.equal(formatFileSize(820), "820 B");
    assert.equal(formatFileSize(1024), "1 KB");
    assert.equal(formatFileSize(12 * 1024 * 1024), "12 MB");
    assert.equal(formatFileSize(""), "");
    assert.equal(formatFileSize(null), "");
  });
  it("dates", () => {
    assert.equal(formatAddedDate("2026-01-05 08:00:00"), "1/5/2026");
    assert.equal(formatAddedDate(""), "");
  });
});
