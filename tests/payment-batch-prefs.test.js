import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PAYMENT_BATCH_PREFS,
  validatePaymentBatchPrefs,
  mergePaymentBatchPrefs,
  paymentMethodFee,
  paymentMethodFeeResolver,
} from "../src/payment-batch-prefs.js";

describe("payment-batch-prefs: defaults", () => {
  it("has the documented default values", () => {
    assert.deepEqual(DEFAULT_PAYMENT_BATCH_PREFS, {
      apr: 0.09,
      postage: 0.78,
      perCheck: 0.05,
      groupWindowDays: 7,
    });
  });

  it("defaults pass validation", () => {
    assert.deepEqual(validatePaymentBatchPrefs(DEFAULT_PAYMENT_BATCH_PREFS), { ok: true, errors: [] });
  });
});

describe("payment-batch-prefs: validatePaymentBatchPrefs", () => {
  it("rejects non-object input", () => {
    for (const bad of [null, undefined, "nope", 42, []]) {
      const r = validatePaymentBatchPrefs(bad);
      assert.equal(r.ok, false, JSON.stringify(bad));
    }
  });

  it("rejects a negative field", () => {
    const r = validatePaymentBatchPrefs({ ...DEFAULT_PAYMENT_BATCH_PREFS, apr: -0.01 });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(";"), /apr must not be negative/);
  });

  it("rejects NaN and non-numeric fields", () => {
    const r1 = validatePaymentBatchPrefs({ ...DEFAULT_PAYMENT_BATCH_PREFS, postage: NaN });
    assert.equal(r1.ok, false);
    assert.match(r1.errors.join(";"), /postage must be a finite number/);

    const r2 = validatePaymentBatchPrefs({ ...DEFAULT_PAYMENT_BATCH_PREFS, perCheck: "0.05" });
    assert.equal(r2.ok, false);
    assert.match(r2.errors.join(";"), /perCheck must be a finite number/);
  });

  it("rejects Infinity", () => {
    const r = validatePaymentBatchPrefs({ ...DEFAULT_PAYMENT_BATCH_PREFS, groupWindowDays: Infinity });
    assert.equal(r.ok, false);
  });

  it("rejects a missing field", () => {
    const { groupWindowDays, ...partial } = DEFAULT_PAYMENT_BATCH_PREFS;
    const r = validatePaymentBatchPrefs(partial);
    assert.equal(r.ok, false);
    assert.match(r.errors.join(";"), /groupWindowDays must be a finite number/);
  });

  it("reports every invalid field at once, not just the first", () => {
    const r = validatePaymentBatchPrefs({ apr: -1, postage: NaN, perCheck: 0.05, groupWindowDays: 7 });
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 2);
  });

  it("allows zero (a legitimate, if extreme, configuration)", () => {
    const r = validatePaymentBatchPrefs({ apr: 0, postage: 0, perCheck: 0, groupWindowDays: 0 });
    assert.deepEqual(r, { ok: true, errors: [] });
  });
});

describe("payment-batch-prefs: mergePaymentBatchPrefs", () => {
  it("no overrides -> exactly the defaults", () => {
    assert.deepEqual(mergePaymentBatchPrefs(null), DEFAULT_PAYMENT_BATCH_PREFS);
    assert.deepEqual(mergePaymentBatchPrefs(undefined), DEFAULT_PAYMENT_BATCH_PREFS);
    assert.deepEqual(mergePaymentBatchPrefs({}), DEFAULT_PAYMENT_BATCH_PREFS);
  });

  it("a partial override object still yields a complete PaymentBatchPrefs", () => {
    const merged = mergePaymentBatchPrefs({ apr: 0.12 });
    assert.deepEqual(merged, { ...DEFAULT_PAYMENT_BATCH_PREFS, apr: 0.12 });
  });

  it("a fully-specified override replaces every field", () => {
    const custom = { apr: 0.05, postage: 0.6, perCheck: 0.1, groupWindowDays: 10 };
    assert.deepEqual(mergePaymentBatchPrefs(custom), custom);
  });

  it("an invalid field falls back to its own default, not the whole object", () => {
    const merged = mergePaymentBatchPrefs({ apr: -1, postage: 0.5 });
    assert.deepEqual(merged, { ...DEFAULT_PAYMENT_BATCH_PREFS, postage: 0.5 });
  });

  it("ignores unknown extra fields", () => {
    const merged = mergePaymentBatchPrefs({ apr: 0.1, somethingElse: "ignored" });
    assert.deepEqual(merged, { ...DEFAULT_PAYMENT_BATCH_PREFS, apr: 0.1 });
  });

  it("non-object input falls back to full defaults", () => {
    assert.deepEqual(mergePaymentBatchPrefs("garbage"), DEFAULT_PAYMENT_BATCH_PREFS);
    assert.deepEqual(mergePaymentBatchPrefs(42), DEFAULT_PAYMENT_BATCH_PREFS);
  });

  it("does not mutate DEFAULT_PAYMENT_BATCH_PREFS", () => {
    const before = { ...DEFAULT_PAYMENT_BATCH_PREFS };
    mergePaymentBatchPrefs({ apr: 0.5 }).apr = 999; // mutate the returned object, not the default
    assert.deepEqual(DEFAULT_PAYMENT_BATCH_PREFS, before);
  });
});

// --- Packet B2a: per-method payment fees --------------------------------------------------------

describe("paymentMethodFee (B2a)", () => {
  const PREFS = { apr: 0.09, postage: 0.78, perCheck: 0.05, groupWindowDays: 7 };

  it("composes the cheque fee from postage + perCheck", () => {
    // The composition that used to live in pay-outstanding.src.html:1417.
    assert.equal(paymentMethodFee(PREFS, "USPS_Check"), 0.83);
  });

  it("uses 5zorro's real per-push costs (2026-09-08)", () => {
    assert.equal(paymentMethodFee(PREFS, "ACH"), 0.4);
    assert.equal(paymentMethodFee(PREFS, "DOM_WIRE"), 25);
    assert.equal(paymentMethodFee(PREFS, "INT_WIRE"), 50);
  });

  it("keeps INT_WIRE flat — intermediary count is deliberately not modelled", () => {
    assert.equal(paymentMethodFee(PREFS, "INT_WIRE"), 25 + 25);
  });

  it("follows the postage/perCheck prefs when the clerk changes them", () => {
    assert.equal(paymentMethodFee({ ...PREFS, postage: 1.0, perCheck: 0.1 }, "USPS_Check"), 1.1);
    // ...but an electronic method must not move when postage does.
    assert.equal(paymentMethodFee({ ...PREFS, postage: 1.0 }, "ACH"), 0.4);
  });

  it("falls back to the cheque fee for an unknown or missing method, never to zero", () => {
    // Every payment_schedule row in the sandbox has a NULL mode_of_payment today. A $0 fee would
    // make the engine claim fee savings that do not exist.
    assert.equal(paymentMethodFee(PREFS, null), 0.83);
    assert.equal(paymentMethodFee(PREFS, undefined), 0.83);
    assert.equal(paymentMethodFee(PREFS, ""), 0.83);
    assert.equal(paymentMethodFee(PREFS, "Bank Draft"), 0.83);
  });

  it("trims a padded method name", () => {
    assert.equal(paymentMethodFee(PREFS, "  ACH  "), 0.4);
  });

  it("lets a methodFees override win over the default", () => {
    assert.equal(paymentMethodFee({ ...PREFS, methodFees: { ACH: 0.25 } }, "ACH"), 0.25);
    assert.equal(paymentMethodFee({ ...PREFS, methodFees: { ACH: 0.25 } }, "DOM_WIRE"), 25);
  });

  it("accepts a zero override — some banks really do bundle ACH", () => {
    assert.equal(paymentMethodFee({ ...PREFS, methodFees: { ACH: 0 } }, "ACH"), 0);
  });

  it("ignores a junk override rather than discarding the whole prefs object", () => {
    assert.equal(paymentMethodFee({ ...PREFS, methodFees: { ACH: -5 } }, "ACH"), 0.4);
    assert.equal(paymentMethodFee({ ...PREFS, methodFees: { ACH: "free" } }, "ACH"), 0.4);
    assert.equal(paymentMethodFee({ ...PREFS, methodFees: "nope" }, "ACH"), 0.4);
  });

  it("survives a wholly invalid prefs object by falling back to defaults", () => {
    assert.equal(paymentMethodFee(null, "USPS_Check"), 0.83);
    assert.equal(paymentMethodFee(undefined, "ACH"), 0.4);
  });
});

describe("paymentMethodFeeResolver (B2a)", () => {
  it("binds prefs into a (method) => fee function", () => {
    const fee = paymentMethodFeeResolver({ apr: 0.09, postage: 0.78, perCheck: 0.05, groupWindowDays: 7 });
    assert.equal(fee("ACH"), 0.4);
    assert.equal(fee("USPS_Check"), 0.83);
    assert.equal(fee(null), 0.83);
  });
});
