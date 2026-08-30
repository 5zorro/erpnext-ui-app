import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  copyRefForDoc,
  historyEntryCopyRef,
  shelvedDraftCopyRef,
  flyoutRowCopyRef,
  looksLikeErpDocName,
  normalizeBillRefSegment,
} from "../src/history-copy-ref.js";

describe("history-copy-ref", () => {
  it("copyRefForDoc uses bill_no for Bill", () => {
    assert.equal(
      copyRefForDoc("purchase-invoice", { bill_no: "MA010044", name: "ACC-PINV-2026-00188" }),
      "MA010044",
    );
  });

  it("copyRefForDoc uses name for PO / Item Receipt", () => {
    assert.equal(copyRefForDoc("purchase-order", { name: "PUR-ORD-2026-00214" }), "PUR-ORD-2026-00214");
    assert.equal(copyRefForDoc("purchase-receipt", { name: "MAT-PRE-2026-00001" }), "MAT-PRE-2026-00001");
  });

  it("historyEntryCopyRef prefers stored copyRef", () => {
    assert.equal(
      historyEntryCopyRef({
        dt: "purchase-invoice",
        kind: "doc",
        detail: "ACC-PINV-2026-00188",
        copyRef: "MA010044",
      }),
      "MA010044",
    );
  });

  it("historyEntryCopyRef parses viewed-draft detail suffix", () => {
    assert.equal(
      historyEntryCopyRef({
        dt: "purchase-invoice",
        kind: "doc",
        detail: "INV MA010044; PO PUR-ORD-1; 8/30/2026",
        detailMuted: true,
      }),
      "MA010044",
    );
  });

  it("historyEntryCopyRef skips ERP internal names without copyRef", () => {
    assert.equal(
      historyEntryCopyRef({
        dt: "purchase-invoice",
        kind: "doc",
        detail: "ACC-PINV-2026-00188",
      }),
      "",
    );
  });

  it("shelvedDraftCopyRef reads label first segment", () => {
    assert.equal(
      shelvedDraftCopyRef({
        doctypeKey: "purchase-invoice",
        label: "INV MA010044; PO PUR-ORD-1; 8/30/2026",
      }),
      "MA010044",
    );
  });

  it("flyoutRowCopyRef routes draft vs recent", () => {
    const row = { doctypeKey: "purchase-order", label: "PUR-ORD-2026-00214; 8/30/2026" };
    assert.equal(flyoutRowCopyRef(row, { draft: true }), "PUR-ORD-2026-00214");
    assert.equal(
      flyoutRowCopyRef({ dt: "purchase-order", kind: "doc", copyRef: "PUR-ORD-2026-00214" }),
      "PUR-ORD-2026-00214",
    );
  });

  it("looksLikeBillErpName detects Bill internal ids only", () => {
    assert.equal(looksLikeErpDocName("ACC-PINV-2026-00188"), true);
    assert.equal(looksLikeErpDocName("PUR-ORD-2026-00214"), false);
    assert.equal(looksLikeErpDocName("MA010044"), false);
  });

  it("normalizeBillRefSegment strips INV prefix", () => {
    assert.equal(normalizeBillRefSegment("INV MA010044"), "MA010044");
    assert.equal(normalizeBillRefSegment("MA010044"), "MA010044");
  });
});
