import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PAYMENT_BATCH_PREFS,
  validatePaymentBatchPrefs,
  mergePaymentBatchPrefs,
  paymentMethodFee,
  paymentMethodFeeResolver,
  KNOWN_PAYMENT_METHODS,
  composedChequeFee,
  paymentMethodLabel,
  describePaymentMethod,
} from "../src/payment-batch-prefs.js";

describe("payment-batch-prefs: defaults", () => {
  it("has the documented default values", () => {
    assert.deepEqual(DEFAULT_PAYMENT_BATCH_PREFS, {
      apr: 0.09,
      postage: 0.78,
      perCheck: 0.05,
      runIntervalDays: 14,
      nextRunDate: "",
      runEarlyOn: "",
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
    const r = validatePaymentBatchPrefs({ ...DEFAULT_PAYMENT_BATCH_PREFS, apr: Infinity });
    assert.equal(r.ok, false);
  });

  it("rejects a missing field", () => {
    const { perCheck, ...partial } = DEFAULT_PAYMENT_BATCH_PREFS;
    const r = validatePaymentBatchPrefs(partial);
    assert.equal(r.ok, false);
    assert.match(r.errors.join(";"), /perCheck must be a finite number/);
  });

  it("reports every invalid field at once, not just the first", () => {
    const r = validatePaymentBatchPrefs({ apr: -1, postage: NaN, perCheck: 0.05 });
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 2);
  });

  it("rejects a check-run date that is not a date, and an interval that is not whole days", () => {
    const r = validatePaymentBatchPrefs({
      ...DEFAULT_PAYMENT_BATCH_PREFS,
      nextRunDate: "09/28/2026",
      runEarlyOn: "tomorrow",
      runIntervalDays: 1.5,
    });
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 3);
    assert.match(r.errors.join(";"), /nextRunDate must be a YYYY-MM-DD date, or empty/);
    assert.match(r.errors.join(";"), /runIntervalDays must be a whole number of days/);
  });

  it("accepts an empty run date — that is how the cutoff is turned off", () => {
    assert.deepEqual(
      validatePaymentBatchPrefs({ ...DEFAULT_PAYMENT_BATCH_PREFS, nextRunDate: "", runIntervalDays: 0 }),
      { ok: true, errors: [] },
    );
  });

  it("allows zero (a legitimate, if extreme, configuration)", () => {
    const r = validatePaymentBatchPrefs({ apr: 0, postage: 0, perCheck: 0 });
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
    const custom = {
      apr: 0.05,
      postage: 0.6,
      perCheck: 0.1,
      runIntervalDays: 7,
      nextRunDate: "2026-09-28",
      runEarlyOn: "2026-09-14",
    };
    assert.deepEqual(mergePaymentBatchPrefs(custom), custom);
  });

  // C8. A prefs.json written before the cutoff existed has none of these, and must load as "no run".
  it("gives an older prefs file the check-run defaults, which leave the cutoff off", () => {
    const merged = mergePaymentBatchPrefs({ apr: 0.09, postage: 0.78, perCheck: 0.05 });
    assert.equal(merged.runIntervalDays, 14);
    assert.equal(merged.nextRunDate, "");
    assert.equal(merged.runEarlyOn, "");
  });

  it("keeps a valid run date and interval, and drops a bad one to its own default", () => {
    const merged = mergePaymentBatchPrefs({ nextRunDate: "2026-02-30", runIntervalDays: 7.5, runEarlyOn: "2026-09-14" });
    assert.equal(merged.nextRunDate, "", "not a real date");
    assert.equal(merged.runIntervalDays, 14, "not a whole number of days");
    assert.equal(merged.runEarlyOn, "2026-09-14");
    assert.equal(mergePaymentBatchPrefs({ nextRunDate: "2026-09-28" }).nextRunDate, "2026-09-28");
    assert.equal(mergePaymentBatchPrefs({ nextRunDate: "" }).nextRunDate, "", "clearing the date is allowed");
  });

  // Retired 2026-09-12 with the greedy clustering it bounded. A prefs.json saved before then still
  // carries it, and it must not come back to life in the panel or reach the engine.
  it("drops a groupWindowDays saved by an older build", () => {
    const merged = mergePaymentBatchPrefs({ apr: 0.05, groupWindowDays: 7 });
    assert.equal("groupWindowDays" in merged, false);
    assert.deepEqual(merged, { ...DEFAULT_PAYMENT_BATCH_PREFS, apr: 0.05 });
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

describe("payment-batch-prefs: C1 panel model", () => {
  it("lists the methods the panel gives an input to, cheapest-first after the composed one", () => {
    assert.deepEqual(KNOWN_PAYMENT_METHODS, ["USPS_Check", "ACH", "DOM_WIRE", "INT_WIRE"]);
  });

  it("composes the cheque fee from its two parts, and says what they were", () => {
    assert.deepEqual(composedChequeFee({ postage: 0.78, perCheck: 0.05 }), {
      postage: 0.78,
      perCheck: 0.05,
      total: 0.83,
    });
  });

  it("composedChequeFee falls back to defaults rather than NaN", () => {
    assert.equal(composedChequeFee(null).total, 0.83);
    assert.equal(composedChequeFee({ postage: "nonsense" }).total, 0.83);
  });

  // Without this the C1 inputs would save and then vanish: the round trip is
  // setPrefs -> merge -> disk -> merge -> panel, and merge used to drop the whole map.
  it("carries methodFees through the merge round trip", () => {
    const merged = mergePaymentBatchPrefs({ apr: 0.09, methodFees: { ACH: 0.35, DOM_WIRE: 30 } });
    assert.deepEqual(merged.methodFees, { ACH: 0.35, DOM_WIRE: 30 });
    assert.deepEqual(mergePaymentBatchPrefs(merged).methodFees, { ACH: 0.35, DOM_WIRE: 30 });
  });

  it("drops only the bad entries of methodFees, never the whole map", () => {
    const merged = mergePaymentBatchPrefs({ methodFees: { ACH: 0.35, DOM_WIRE: -1, INT_WIRE: "x" } });
    assert.deepEqual(merged.methodFees, { ACH: 0.35 });
  });

  it("omits methodFees entirely when nothing valid survives", () => {
    assert.equal("methodFees" in mergePaymentBatchPrefs({ methodFees: { ACH: -3 } }), false);
    assert.equal("methodFees" in mergePaymentBatchPrefs({}), false);
  });
});

describe("payment-batch-prefs: method labels (C3)", () => {
  it("turns Link identifiers into something a clerk reads", () => {
    assert.equal(paymentMethodLabel("USPS_Check"), "Check");
    assert.equal(paymentMethodLabel("ACH"), "ACH");
    assert.equal(paymentMethodLabel("DOM_WIRE"), "Wire");
    assert.equal(paymentMethodLabel("INT_WIRE"), "Int'l wire");
    assert.equal(paymentMethodLabel("DOM_WIRE", { long: true }), "Domestic wire");
  });

  it("de-snakes an unknown method rather than hiding it", () => {
    assert.equal(paymentMethodLabel("SEPA_Credit"), "SEPA Credit");
  });

  // The engine prices a NULL method as a cheque. Reporting that guess to the clerk as "Check"
  // would state a fact about the bill that the bill does not contain.
  it("never calls an unrecorded method a cheque", () => {
    for (const empty of [null, undefined, "", "   "]) {
      assert.equal(paymentMethodLabel(empty), "No method");
      assert.equal(paymentMethodLabel(empty, { long: true }), "No method of payment recorded");
    }
  });
});

describe("payment-batch-prefs: describePaymentMethod", () => {
  const prefs = { apr: 0.09, postage: 0.78, perCheck: 0.05, groupWindowDays: 7 };

  it("attributes the cheque fee to its composition", () => {
    const d = describePaymentMethod(prefs, "USPS_Check");
    assert.equal(d.fee, 0.83);
    assert.equal(d.feeSource, "composed");
    assert.equal(d.label, "Check");
  });

  it("attributes a table fee to the default table", () => {
    assert.deepEqual(
      { fee: describePaymentMethod(prefs, "INT_WIRE").fee, src: describePaymentMethod(prefs, "INT_WIRE").feeSource },
      { fee: 50, src: "default" },
    );
  });

  it("attributes a tuned fee to the override", () => {
    const d = describePaymentMethod({ ...prefs, methodFees: { ACH: 0.25 } }, "ACH");
    assert.equal(d.fee, 0.25);
    assert.equal(d.feeSource, "override");
  });

  // The distinction C4's chip is built on: same $0.83, entirely different claim.
  it("marks an unrecorded method's fee as a fallback, not as the cheque composition", () => {
    const d = describePaymentMethod(prefs, null);
    assert.equal(d.fee, 0.83);
    assert.equal(d.feeSource, "fallback");
    assert.equal(d.label, "No method");
  });

  it("marks an unknown named method as a fallback too", () => {
    const d = describePaymentMethod(prefs, "SEPA_Credit");
    assert.equal(d.fee, 0.83);
    assert.equal(d.feeSource, "fallback");
  });
});
