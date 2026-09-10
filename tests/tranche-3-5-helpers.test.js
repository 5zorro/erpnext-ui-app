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

  it("builds Bill (return_against) and Sales Order routes (OI-082 / OI-165)", () => {
    assert.equal(
      linkedSourcePeekRoute("purchase-invoice", "ACC-PINV-2026-00231"),
      "/app/purchase-invoice/ACC-PINV-2026-00231",
    );
    assert.equal(linkedSourcePeekRoute("bill", "ACC-PINV-2026-00231"), "/app/purchase-invoice/ACC-PINV-2026-00231");
    assert.equal(linkedSourcePeekRoute("sales-order", "SAL-ORD-2026-00123"), "/app/sales-order/SAL-ORD-2026-00123");
    assert.equal(linkedSourcePeekRoute("so", "SAL-ORD-2026-00123"), "/app/sales-order/SAL-ORD-2026-00123");
  });

  it("allows peek routes for PO/PR/Bill/Sales Order", () => {
    assert.equal(canSoftPeekLinkedSourceRoute("/app/purchase-order/PO-1"), true);
    assert.equal(canSoftPeekLinkedSourceRoute("/app/purchase-invoice/PI-1"), true);
    assert.equal(canSoftPeekLinkedSourceRoute("/app/sales-order/SO-1"), true);
    assert.equal(canSoftPeekLinkedSourceRoute("/app/sales-invoice/SI-1"), false);
  });

  it("linkedSourcePeekKindLabel names PO, IR, Bill, Sales Order", () => {
    assert.equal(linkedSourcePeekKindLabel("purchase-order"), "Purchase Order");
    assert.equal(linkedSourcePeekKindLabel("purchase-receipt"), "Item Receipt");
    assert.equal(linkedSourcePeekKindLabel("purchase-invoice"), "Bill");
    assert.equal(linkedSourcePeekKindLabel("sales-order"), "Sales Order");
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
