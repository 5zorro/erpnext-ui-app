import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billRowHasSource,
  formatQtyForErp,
  humanizeBillErpMessage,
  isOverBillingError,
  maxBillableQtyForSourceItem,
  overlimitNicDescription,
  planBillLineQtySplit,
  saveFailureIsOverBilling,
  listOverbillCapCacheBlockers,
  OVERBILL_CAP_CACHE_BLOCKER,
} from "../src/bill-po-qty-split.js";
import { indexPoLineMeta } from "../src/bill-po-hydrate.js";

describe("bill-po-qty-split", () => {
  it("maxBillableQtyForSourceItem uses amount minus billed_amt", () => {
    assert.equal(
      maxBillableQtyForSourceItem({
        qty: 1,
        rate: 400,
        amount: 400,
        billed_amt: 0,
      }),
      1,
    );
    assert.equal(
      maxBillableQtyForSourceItem({
        qty: 1,
        rate: 400,
        amount: 400,
        billed_amt: 200,
      }),
      0.5,
    );
    assert.equal(
      maxBillableQtyForSourceItem({
        qty: 1,
        rate: 400,
        amount: 400,
        billed_amt: 400,
      }),
      0,
    );
  });

  it("planBillLineQtySplit splits excess onto NIC row plan", () => {
    const row = {
      item_code: "SKU001",
      purchase_order: "PO-1",
      po_detail: "POI-1",
      rate: 400,
    };
    const plan = planBillLineQtySplit(row, 1, "2");
    assert.equal(plan.action, "split");
    if (plan.action !== "split") return;
    assert.equal(plan.sourcedQty, 1);
    assert.equal(plan.excessQty, 1);
    assert.equal(plan.itemCode, "SKU001");
    assert.match(plan.excessDescription, /approval required/);
  });

  it("planBillLineQtySplit noop when within cap", () => {
    const row = { purchase_order: "PO-1", po_detail: "POI-1", item_code: "X" };
    assert.deepEqual(planBillLineQtySplit(row, 1, "1"), { action: "noop" });
    assert.deepEqual(planBillLineQtySplit(row, 1, "0.5"), { action: "noop" });
  });

  it("planBillLineQtySplit blocked when PO line fully billed", () => {
    const row = { purchase_order: "PO-1", po_detail: "POI-1", item_code: "X" };
    const plan = planBillLineQtySplit(row, 0, "2");
    assert.equal(plan.action, "blocked");
  });

  it("planBillLineQtySplit noop for NIC rows", () => {
    assert.deepEqual(
      planBillLineQtySplit({ item_code: "SKU001", qty: 2 }, 1, "5"),
      { action: "noop" },
    );
  });

  it("humanizeBillErpMessage rewrites document → bill", () => {
    const raw =
      'This document is over limit by Amount 400.0 for item SKU001. Are you making another Purchase Invoice against the same Purchase Order Item?To allow over billing, update "Over Billing Allowance" in Accounts Settings or the Item.';
    const out = humanizeBillErpMessage(raw);
    assert.match(out, /^This bill is over limit/i);
    assert.doesNotMatch(out, /Over Billing Allowance/i);
    assert.match(out, /NIC row/i);
  });

  it("isOverBillingError detects ERP over-limit messages", () => {
    assert.equal(
      isOverBillingError(
        "This document is over limit by Amount 400.0 for item SKU001.",
      ),
      true,
    );
    assert.equal(isOverBillingError("Over Billing Allowance"), true);
    assert.equal(isOverBillingError("Supplier is required"), false);
  });

  it("saveFailureIsOverBilling checks reason and blockers", () => {
    assert.equal(
      saveFailureIsOverBilling({
        reason: "over limit by Amount 400",
        blockers: [],
      }),
      true,
    );
  });

  it("billRowHasSource detects PO-linked rows", () => {
    assert.equal(billRowHasSource({ po_detail: "POI-1" }), true);
    assert.equal(billRowHasSource({ item_code: "X" }), false);
  });

  it("listOverbillCapCacheBlockers when cap missing on sourced row", () => {
    const items = [{ purchase_order: "PO-1", item_code: "SKU001", qty: 2 }];
    assert.deepEqual(listOverbillCapCacheBlockers(items, () => null), [
      OVERBILL_CAP_CACHE_BLOCKER,
    ]);
    assert.deepEqual(listOverbillCapCacheBlockers(items, () => 1), []);
    assert.deepEqual(listOverbillCapCacheBlockers([], () => null), []);
  });

  it("formatQtyForErp trims float noise", () => {
    assert.equal(formatQtyForErp(2), "2");
    assert.equal(formatQtyForErp(0.5), "0.5");
    assert.equal(overlimitNicDescription(1), "Over-PO qty (+1) — approval required");
  });

  it("indexPoLineMeta attaches maxBillableQty from PO item", () => {
    const doc = {
      items: [{ purchase_order: "PO-1", po_detail: "POI-99", item_code: "SKU001" }],
    };
    const meta = indexPoLineMeta(
      doc,
      { "POI-99": { idx: 1, qty: 1, rate: 400, amount: 400, billed_amt: 0 } },
      {},
      {},
    );
    assert.equal(meta[0].maxBillableQty, 1);
  });
});
