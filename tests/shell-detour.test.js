import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DETOUR_SURFACES,
  beginShellDetour,
  detourBackLabel,
  isDocErrandTarget,
  beginDocDetour,
  shouldEscReturnFromDetour,
} from "../src/shell-detour.js";

// Plan 2026-09-26 "Doors", door 4 (5zorro 2026-10-02): writing a check, open the bill it pays,
// fix it (void and amend included), come back to the payment work.
describe("shell-detour", () => {
  it("the payment board and the payment page can be return points; a Doc skin is not one", () => {
    assert.deepEqual(Object.keys(DETOUR_SURFACES).sort(), ["pay-outstanding", "payment-doc"]);
    assert.deepEqual(beginShellDetour("pay-outstanding"), { surface: "pay-outstanding", label: "Pay Outstanding", route: "" });
    assert.equal(beginShellDetour("payment-doc", "/app/payment-entry/ACC-PAY-1").route, "/app/payment-entry/ACC-PAY-1");
    assert.equal(beginShellDetour("doc"), null, "a Doc skin's errands are ordinary peeks");
    assert.equal(beginShellDetour("erp"), null);
  });

  it("the toolbar names the way back while away, and nothing once back", () => {
    const d = beginShellDetour("pay-outstanding");
    assert.equal(detourBackLabel(d, "doc"), "← Back to Pay Outstanding");
    assert.equal(detourBackLabel(d, "erp"), "← Back to Pay Outstanding", "not forced into any skin");
    assert.equal(detourBackLabel(d, "pay-outstanding"), "");
    assert.equal(detourBackLabel(null, "doc"), "");
  });

  it("Esc returns only when the page is not using it", () => {
    assert.equal(shouldEscReturnFromDetour({ key: "Escape" }), true);
    assert.equal(shouldEscReturnFromDetour({ key: "Escape", defaultPrevented: true }), false);
    assert.equal(shouldEscReturnFromDetour({ key: "Escape", dialogOpen: true }), false);
    assert.equal(shouldEscReturnFromDetour({ key: "Escape", editing: true }), false);
    assert.equal(shouldEscReturnFromDetour({ key: "Enter" }), false);
  });
});

// 5zorro 2026-10-11: from a bill to its PO / Item Receipt / Sales Order — ask at the door, then a way back.
describe("Doc page as the return point", () => {
  it("another Doc-skinned document is an errand; a setup master is a Vanilla peek", () => {
    assert.equal(isDocErrandTarget("/app/purchase-order/PUR-ORD-1"), true);
    assert.equal(isDocErrandTarget("/app/purchase-receipt/MAT-PRE-2026-00002"), true);
    assert.equal(isDocErrandTarget("/app/sales-order/SAL-ORD-1"), true);
    assert.equal(isDocErrandTarget("/app/supplier/SUMMIT%20TRADERS"), false);
    assert.equal(isDocErrandTarget("/app/item/new?item_code=X"), false);
    assert.equal(isDocErrandTarget("/app/purchase-order"), false, "a list is not a document");
  });
  it("the saved bill is the way back; a never-saved one has none", () => {
    assert.deepEqual(beginDocDetour({ doctypeKey: "purchase-invoice", name: "ACC-PINV-2026-00008", label: "Bill" }), {
      surface: "doc",
      label: "Bill ACC-PINV-2026-00008",
      route: "/app/purchase-invoice/ACC-PINV-2026-00008",
    });
    assert.equal(beginDocDetour({ doctypeKey: "purchase-invoice", name: "new-purchase-invoice-abcdefghij", label: "Bill" }), null);
    assert.equal(beginDocDetour({ doctypeKey: "", name: "X" }), null);
  });
  it("the back button shows until that document is on screen again", () => {
    const d = beginDocDetour({ doctypeKey: "purchase-invoice", name: "ACC-PINV-2026-00008", label: "Bill" });
    assert.equal(detourBackLabel(d, "doc", "/app/purchase-order/PUR-ORD-1"), "← Back to Bill ACC-PINV-2026-00008");
    assert.equal(detourBackLabel(d, "erp", "/app/purchase-order/PUR-ORD-1"), "← Back to Bill ACC-PINV-2026-00008");
    assert.equal(detourBackLabel(d, "doc", "/app/purchase-invoice/ACC-PINV-2026-00008"), "");
  });
});

