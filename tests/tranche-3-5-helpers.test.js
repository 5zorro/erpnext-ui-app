import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  linkedSourcePeekRoute,
  canSoftPeekLinkedSourceRoute,
  linkedSourcePeekKindLabel,
} from "../src/source-doc-peek.js";
import {
  billRemarksPoSearchHint,
  shouldPrefillBillRemarksFromPo,
} from "../src/bill-remarks-po.js";
import { poFindPrefillFromLogbook, poFindListFilterPayload, poFindPrefillFromDoc } from "../src/po-find-prefill.js";

describe("source-doc-peek", () => {
  it("builds PO and PR routes", () => {
    assert.equal(linkedSourcePeekRoute("purchase-order", "PO-1"), "/app/purchase-order/PO-1");
    assert.equal(
      linkedSourcePeekRoute("purchase-receipt", "PR-1"),
      "/app/purchase-receipt/PR-1",
    );
    assert.equal(linkedSourcePeekRoute("purchase-order", ""), null);
  });

  it("allows peek routes for PO/PR only", () => {
    assert.equal(canSoftPeekLinkedSourceRoute("/app/purchase-order/PO-1"), true);
    assert.equal(canSoftPeekLinkedSourceRoute("/app/purchase-invoice/PI-1"), false);
  });

  it("linkedSourcePeekKindLabel names PO and IR", () => {
    assert.equal(linkedSourcePeekKindLabel("purchase-order"), "Purchase Order");
    assert.equal(linkedSourcePeekKindLabel("purchase-receipt"), "Item Receipt");
  });
});

describe("bill-remarks-po", () => {
  it("prefers logbook title in remarks hint", () => {
    assert.equal(
      billRemarksPoSearchHint([{ name: "PUR-ORD-1", title: "JE0001" }]),
      "PO# JE0001 (PUR-ORD-1)",
    );
    assert.equal(billRemarksPoSearchHint([{ name: "PUR-ORD-1", title: "" }]), "PO PUR-ORD-1");
  });

  it("shouldPrefillBillRemarksFromPo only when remarks empty", () => {
    assert.equal(
      shouldPrefillBillRemarksFromPo({ remarks: "" }, [{ name: "PO-1", title: "L1" }]),
      true,
    );
    assert.equal(
      shouldPrefillBillRemarksFromPo({ remarks: "note" }, [{ name: "PO-1", title: "L1" }]),
      false,
    );
  });
});

describe("po-find-prefill", () => {
  it("prefers title over name", () => {
    assert.deepEqual(poFindPrefillFromLogbook({ name: "PO-1", title: "JE0001" }), {
      title: "JE0001",
    });
    assert.deepEqual(poFindListFilterPayload({ title: "JE0001" }), { title: "JE0001" });
    assert.deepEqual(poFindPrefillFromDoc({ name: "PO-1", title: "JE0001" }), { title: "JE0001" });
  });
});
