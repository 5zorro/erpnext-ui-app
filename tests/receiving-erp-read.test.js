import test from "node:test";
import assert from "node:assert/strict";

import { purchaseOrderPath, readFailure, signInPath } from "../src/receiving/erp-read.js";

test("an order is read from ERPNext's standard resource address", () => {
  assert.equal(purchaseOrderPath("PUR-ORD-2026-00386"), "/api/resource/Purchase%20Order/PUR-ORD-2026-00386");
});

test("an order number cannot step outside its own address", () => {
  // Slashes appear in some naming series; unescaped, they would read a different resource.
  assert.equal(purchaseOrderPath(" PO/2026/7 "), "/api/resource/Purchase%20Order/PO%2F2026%2F7");
  assert.equal(purchaseOrderPath("../../method/logout"), "/api/resource/Purchase%20Order/..%2F..%2Fmethod%2Flogout");
  assert.throws(() => purchaseOrderPath("   "), /no order number/);
});

test("sign-in sends the person back to the page they were on", () => {
  assert.equal(signInPath("/receiving/po-sheet.html"), "/login?redirect-to=%2Freceiving%2Fpo-sheet.html");
});

test("each failure says something different and actionable", () => {
  assert.equal(readFailure(403, "X").kind, "sign-in");
  assert.equal(readFailure(401, "X").kind, "sign-in");
  assert.equal(readFailure(404, "PO-9").kind, "not-found");
  assert.match(readFailure(404, "PO-9").message, /PO-9/);
  assert.equal(readFailure(417, "X").kind, "not-allowed");
  assert.match(readFailure(0, "X").message, /No answer/);
  assert.match(readFailure(502, "X").message, /502/);
});
