import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DETOUR_SURFACES,
  beginShellDetour,
  detourBackLabel,
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
