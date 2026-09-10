import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePaymentTermGrace,
  stripGraceSuffix,
  withGraceSuffix,
} from "../src/payment-term-grace.js";

describe("parsePaymentTermGrace", () => {
  // The naming convention 5zorro locked 2026-09-08: CREDIT_PERIOD (METHOD) ±GRACE, grace last.
  const CONVENTION = [
    ["NET_30_DAYS (POSTAL) -3", -3],
    ["NET_30_DAYS (ACH) +2", 2],
    ["2%_10_NET_30 (ACH) +2", 2],
    ["NET_45 (DOM_WIRE) +10", 10],
    ["NET_30_DAYS (INT_WIRE) -1", -1],
  ];
  for (const [name, expected] of CONVENTION) {
    it(`reads ${expected} from "${name}"`, () => {
      assert.equal(parsePaymentTermGrace(name), expected);
    });
  }

  // Every row here is a name that must NOT yield a number. Each one is a silent-wrong-date bug if
  // the grammar guesses instead of refusing.
  const MUST_REFUSE = [
    ["NET 45", "unsigned trailing digits are a credit period, not a grace token"],
    ["NET_15 (WIRE) 0", "bare 0 carries no sign"],
    ["NET-45", "no whitespace before the sign — this is a hyphenated name"],
    ["NET_30_DAYS", "no numeric suffix at all"],
    ["NET_30_DAYS -3 (POSTAL)", "grace is not last — convention violated, refuse rather than hunt"],
    ["2%_10_NET_30", "percent sign is not a grace token"],
    ["", "empty"],
    [null, "null"],
    [undefined, "undefined"],
  ];
  for (const [name, why] of MUST_REFUSE) {
    it(`returns undefined for ${JSON.stringify(name)} — ${why}`, () => {
      assert.equal(parsePaymentTermGrace(name), undefined);
    });
  }

  it("distinguishes an explicit +0 from an absent grace", () => {
    // Absent must stay absent (the A1 rule); "+0" is how a term says "deliberately none".
    assert.equal(parsePaymentTermGrace("NET_30_DAYS (ACH) +0"), 0);
    assert.equal(parsePaymentTermGrace("NET_30_DAYS (ACH)"), undefined);
  });

  it("tolerates trailing whitespace", () => {
    assert.equal(parsePaymentTermGrace("NET_30_DAYS (POSTAL) -3   "), -3);
  });

  it("reads multi-digit grace", () => {
    assert.equal(parsePaymentTermGrace("NET_60 (POSTAL) -14"), -14);
    assert.equal(parsePaymentTermGrace("NET_60 (POSTAL) +120"), 120);
  });
});

describe("stripGraceSuffix", () => {
  it("removes the suffix and leaves the human-readable term", () => {
    assert.equal(stripGraceSuffix("NET_30_DAYS (POSTAL) -3"), "NET_30_DAYS (POSTAL)");
    assert.equal(stripGraceSuffix("2%_10_NET_30 (ACH) +2"), "2%_10_NET_30 (ACH)");
  });

  it("leaves a name with no suffix alone", () => {
    assert.equal(stripGraceSuffix("NET 45"), "NET 45");
    assert.equal(stripGraceSuffix("NET-45"), "NET-45");
  });

  it("is safe on empty input", () => {
    assert.equal(stripGraceSuffix(null), "");
    assert.equal(stripGraceSuffix(undefined), "");
    assert.equal(stripGraceSuffix(""), "");
  });
});

describe("withGraceSuffix", () => {
  it("adds a signed suffix", () => {
    assert.equal(withGraceSuffix("NET_30_DAYS (POSTAL)", -3), "NET_30_DAYS (POSTAL) -3");
    assert.equal(withGraceSuffix("NET_30_DAYS (ACH)", 2), "NET_30_DAYS (ACH) +2");
    assert.equal(withGraceSuffix("NET_30_DAYS (ACH)", 0), "NET_30_DAYS (ACH) +0");
  });

  it("replaces an existing suffix rather than appending a second", () => {
    assert.equal(withGraceSuffix("NET_30_DAYS (POSTAL) -3", 5), "NET_30_DAYS (POSTAL) +5");
  });

  it("strips the suffix when given no grace", () => {
    assert.equal(withGraceSuffix("NET_30_DAYS (POSTAL) -3", null), "NET_30_DAYS (POSTAL)");
    assert.equal(withGraceSuffix("NET_30_DAYS (POSTAL) -3", undefined), "NET_30_DAYS (POSTAL)");
  });

  it("round-trips with the parser", () => {
    for (const g of [-14, -3, 0, 2, 120]) {
      assert.equal(parsePaymentTermGrace(withGraceSuffix("NET_30 (ACH)", g)), g);
    }
  });
});
