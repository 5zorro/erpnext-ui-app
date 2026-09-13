import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PAYMENT_DIRECTION,
  normalizePaymentDirection,
  preferredPaymentDirection,
  rememberPaymentDirection,
  mergePaymentDirectionPrefs,
  resolvePaymentDirection,
} from "../src/payment-direction-prefs.js";

describe("normalizePaymentDirection", () => {
  it("accepts exactly Pay or Receive", () => {
    assert.equal(normalizePaymentDirection("Pay"), "Pay");
    assert.equal(normalizePaymentDirection("Receive"), "Receive");
  });
  it("rejects everything else", () => {
    assert.equal(normalizePaymentDirection("pay"), null);
    assert.equal(normalizePaymentDirection("receive"), null);
    assert.equal(normalizePaymentDirection(""), null);
    assert.equal(normalizePaymentDirection(null), null);
    assert.equal(normalizePaymentDirection(undefined), null);
    assert.equal(normalizePaymentDirection(1), null);
  });
});

describe("preferredPaymentDirection", () => {
  it("defaults to Pay when unset", () => {
    assert.equal(preferredPaymentDirection({}), "Pay");
    assert.equal(preferredPaymentDirection(null), "Pay");
    assert.equal(preferredPaymentDirection(undefined), "Pay");
  });
  it("reads a valid stored direction", () => {
    assert.equal(preferredPaymentDirection({ direction: "Receive" }), "Receive");
  });
  it("falls back on a corrupt stored value", () => {
    assert.equal(preferredPaymentDirection({ direction: "sideways" }), "Pay");
  });
});

describe("rememberPaymentDirection", () => {
  it("sets a valid direction", () => {
    const next = rememberPaymentDirection({}, "Receive");
    assert.equal(next.direction, "Receive");
  });
  it("is immutable", () => {
    const prefs = { direction: "Pay" };
    const next = rememberPaymentDirection(prefs, "Receive");
    assert.notEqual(next, prefs);
    assert.equal(prefs.direction, "Pay");
  });
  it("ignores an invalid direction, keeping prior state", () => {
    const prefs = { direction: "Receive" };
    const next = rememberPaymentDirection(prefs, "sideways");
    assert.equal(next.direction, "Receive");
  });
  it("junk prefs input falls back to an empty base rather than throwing", () => {
    assert.doesNotThrow(() => rememberPaymentDirection(null, "Pay"));
    assert.equal(rememberPaymentDirection(null, "Pay").direction, "Pay");
  });
});

describe("mergePaymentDirectionPrefs", () => {
  it("defaults are Pay", () => {
    assert.deepEqual(mergePaymentDirectionPrefs({}), { direction: "Pay" });
  });
  it("valid stored direction passes through", () => {
    assert.deepEqual(mergePaymentDirectionPrefs({ direction: "Receive" }), { direction: "Receive" });
  });
  it("corrupt/absent input falls back to the default without throwing", () => {
    assert.deepEqual(mergePaymentDirectionPrefs(null), { direction: DEFAULT_PAYMENT_DIRECTION });
    assert.deepEqual(mergePaymentDirectionPrefs(undefined), { direction: DEFAULT_PAYMENT_DIRECTION });
    assert.deepEqual(mergePaymentDirectionPrefs("garbage"), { direction: DEFAULT_PAYMENT_DIRECTION });
    assert.deepEqual(mergePaymentDirectionPrefs({ direction: 42 }), { direction: DEFAULT_PAYMENT_DIRECTION });
  });
});

describe("resolvePaymentDirection — resolution order", () => {
  it("tile intent beats a stored pref", () => {
    assert.equal(
      resolvePaymentDirection({ tileIntent: "Receive", prefs: { direction: "Pay" } }),
      "Receive",
    );
  });
  it("falls back to the stored pref when no tile intent", () => {
    assert.equal(resolvePaymentDirection({ prefs: { direction: "Receive" } }), "Receive");
  });
  it("falls back to the default when neither is present", () => {
    assert.equal(resolvePaymentDirection({}), "Pay");
    assert.equal(resolvePaymentDirection(), "Pay");
  });
  it("an invalid tile intent does not shadow a valid stored pref", () => {
    assert.equal(
      resolvePaymentDirection({ tileIntent: "sideways", prefs: { direction: "Receive" } }),
      "Receive",
    );
  });
});
