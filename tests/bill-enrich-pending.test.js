import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billEnrichStillPending,
  defaultEnrichPendingForDoc,
  nextEnrichPending,
} from "../src/bill-enrich-pending.js";

describe("bill-enrich-pending", () => {
  it("defaultEnrichPendingForDoc flags linked PO and PR", () => {
    const pending = defaultEnrichPendingForDoc({
      items: [{ purchase_order: "PO-1", purchase_receipt: "PR-1", po_detail: "x" }],
    });
    assert.equal(pending.linkedPos, true);
    assert.equal(pending.linkedReceipts, true);
    assert.equal(pending.lineContext, true);
  });

  it("nextEnrichPending clears slices as results arrive", () => {
    const pending = { linkedPos: true, linkedReceipts: true, lineContext: true };
    const afterPo = nextEnrichPending(pending, { linkedPos: [{ name: "PO-1", title: "TO-1" }] });
    assert.equal(afterPo.linkedPos, false);
    assert.equal(afterPo.linkedReceipts, true);
    const done = nextEnrichPending(afterPo, {
      linkedReceipts: [{ name: "PR-1", lrNo: "BOL-9" }],
      poLineMeta: {},
      lineAllocations: {},
    });
    assert.equal(done.linkedReceipts, false);
    assert.equal(done.lineContext, false);
    assert.equal(billEnrichStillPending(done), false);
  });
});
