import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SO_CREATE_ENTRIES,
  canCreatePoFrom,
  poPendingLines,
  draftQtyBySoLine,
  poSelection,
  createdPosMessage,
  pendingForSave,
} from "../src/so-create-po.js";

// Plan 2026-10-12 S2: Create ▾ › Purchase Order… on the Sales Order, every PO a draft.
const so = {
  docstatus: 1,
  status: "To Deliver and Bill",
  items: [
    { name: "r1", item_code: "SAMPLE-SKU-01", item_name: "Sample Item 01", qty: 2, stock_qty: 2, conversion_factor: 1, ordered_qty: 0, uom: "Nos" },
    { name: "r2", item_code: "SAMPLE-SKU-02", item_name: "Sample Item 02", qty: 2, stock_qty: 2, conversion_factor: 1, ordered_qty: 0, uom: "Nos", supplier: "ACME" },
    { name: "r3", item_code: "BOX", item_name: "Box of 12", qty: 3, stock_qty: 36, conversion_factor: 12, ordered_qty: 12, uom: "Box" },
    { name: "r4", item_code: "DONE", qty: 1, stock_qty: 1, conversion_factor: 1, ordered_qty: 1, uom: "Nos" },
  ],
};

describe("canCreatePoFrom", () => {
  it("a submitted, open order", () => {
    assert.deepEqual(canCreatePoFrom(so), { ok: true });
  });
  it("not a draft, not a closed or held order", () => {
    assert.match(canCreatePoFrom({ ...so, docstatus: 0 }).reason, /Submit the Sales Order first/);
    assert.match(canCreatePoFrom({ ...so, status: "Closed" }).reason, /Closed/);
    assert.match(canCreatePoFrom({ ...so, status: "On Hold" }).reason, /On Hold/);
    assert.equal(canCreatePoFrom(null).ok, false);
  });
});

describe("poPendingLines", () => {
  it("what is still to order, in the line's unit, as Vanilla counts it", () => {
    const lines = poPendingLines(so);
    assert.deepEqual(lines.map((l) => [l.rowName, l.pendingQty, l.uom, l.supplier]), [
      ["r1", 2, "Nos", ""],
      ["r2", 2, "Nos", "ACME"],
      ["r3", 2, "Box", ""], // (36 − 12) ÷ 12
    ]);
  });
  it("quantity on draft POs for this order counts as ordered (ERPNext counts only submitted ones)", () => {
    const onDrafts = draftQtyBySoLine([
      { name: "PUR-ORD-2026-00001", sales_order_item: "r1", stock_qty: 2 },
      { name: "PUR-ORD-2026-00002", sales_order_item: "r3", stock_qty: 12 },
      { name: "PUR-ORD-2026-00002", sales_order_item: "r3", stock_qty: 0 },
      { name: "X", sales_order_item: "", stock_qty: 9 },
    ]);
    assert.deepEqual(onDrafts, {
      r1: { stockQty: 2, pos: ["PUR-ORD-2026-00001"] },
      r3: { stockQty: 12, pos: ["PUR-ORD-2026-00002"] },
    });
    const lines = poPendingLines(so, onDrafts);
    const r1 = lines.find((l) => l.rowName === "r1");
    assert.deepEqual([r1.pendingQty, r1.fullyOnDrafts, r1.onDraftPos], [0, true, ["PUR-ORD-2026-00001"]]);
    const r3 = lines.find((l) => l.rowName === "r3");
    assert.deepEqual([r3.pendingQty, r3.fullyOnDrafts], [1, false]);
  });
});

describe("poSelection", () => {
  const picks = poPendingLines(so).map((l) => ({ ...l, ticked: true, supplier: l.supplier || "SUMMIT" }));
  it("what ERPNext's make_purchase_order reads (selected_items)", () => {
    const r = poSelection(picks);
    assert.equal(r.ok, true);
    assert.deepEqual(r.selectedItems[0], { name: "r1", item_code: "SAMPLE-SKU-01", item_name: "Sample Item 01", pending_qty: 2, uom: "Nos", supplier: "SUMMIT" });
    assert.deepEqual(r.selectedItems.map((s) => s.supplier), ["SUMMIT", "ACME", "SUMMIT"]);
  });
  it("needs a ticked line, and a vendor on each", () => {
    assert.match(poSelection(picks.map((p) => ({ ...p, ticked: false }))).reason, /Tick at least one line/);
    assert.match(poSelection([{ ...picks[0], supplier: " " }]).reason, /needs a vendor — missing on SAMPLE-SKU-01/);
  });
  it("one item, one vendor (ERPNext maps by item code)", () => {
    const twice = [picks[0], { ...picks[0], rowName: "r9", supplier: "OTHER" }];
    assert.match(poSelection(twice).reason, /SAMPLE-SKU-01 is on two lines with two vendors/);
  });
  it("a line already fully on drafts is never sent", () => {
    const r = poSelection([{ ...picks[0], pendingQty: 0 }, picks[1]]);
    assert.deepEqual(r.selectedItems.map((s) => s.name), ["r2"]);
  });
});

describe("createdPosMessage / SO_CREATE_ENTRIES", () => {
  it("one, several, and what failed", () => {
    assert.equal(createdPosMessage(["PUR-ORD-2026-00001"]), "Purchase order PUR-ORD-2026-00001 saved as a draft (see Drafts).");
    assert.match(createdPosMessage(["A", "B"]), /^2 purchase orders saved as drafts: A, B/);
    assert.match(createdPosMessage([], [{ supplier: "ACME", reason: "Missing schedule date" }]), /Not saved for ACME: Missing schedule date/);
    assert.equal(createdPosMessage([]), "No purchase order was made.");
  });
  it("the menu starts with Purchase Order", () => {
    assert.deepEqual(SO_CREATE_ENTRIES.map((e) => e.id), ["purchase-order"]);
  });
});

describe("pendingForSave (review R8-1, R8-2)", () => {
  const fresh = [
    { rowName: "L1", pendingQty: 4 },
    { rowName: "L2", pendingQty: 3 },
    { rowName: "L3", pendingQty: 0 },
  ];
  it("an unticked line gets 0, so the unticked twin of a ticked item is trimmed off the PO", () => {
    const r = pendingForSave([{ rowName: "L1", ticked: true }, { rowName: "L2", ticked: false }], fresh);
    assert.deepEqual(r.pending, { L1: 4, L2: 0 });
    assert.equal(r.anyLeft, true);
  });
  it("reads what is left now: a line another run put on a draft since has nothing to order", () => {
    const r = pendingForSave([{ rowName: "L3", ticked: true }, { rowName: "L4", ticked: true }], fresh);
    assert.deepEqual(r.pending, { L3: 0, L4: 0 });
    assert.equal(r.anyLeft, false);
  });
});
