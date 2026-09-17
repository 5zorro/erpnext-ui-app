import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPaymentTermName,
  checkTermNameArithmetic,
} from "../src/payment-term-name-health.js";
import { parsePaymentTermGrace } from "../src/payment-term-grace.js";
import { SAMPLE_PAYMENT_TERMS } from "../src/sample-data/corpus-plan.js";

describe("classifyPaymentTermName: names the grammar accepts", () => {
  const PARSED = [
    ["NET_30_DAYS (POSTAL) -3", -3],
    ["NET_30_DAYS (POSTAL) +16", 16],
    ["NET_30_DAYS (ACH) +2", 2],
    ["2%_10_NET_30 (ACH) +2", 2],
    ["NET_15_DAYS (DOM_WIRE) +0", 0],
    ["NET_10TH (ACH) +5", 5],
  ];
  for (const [name, grace] of PARSED) {
    it(`"${name}" is parsed with grace ${grace}`, () => {
      const h = classifyPaymentTermName(name);
      assert.equal(h.state, "parsed");
      assert.equal(h.graceDays, grace);
      assert.equal(h.confidence, "high");
      assert.equal(h.intent, undefined, "a parsed name needs no proposed intent");
    });
  }
});

// 🔴 The false positive that would kill the feature. Every name here is a legitimate, grace-free
// term; warning on any of them trains a clerk to ignore the chip, and then the one that mattered
// is ignored with it.
describe("classifyPaymentTermName: the negative control — grace-free names are never malformed", () => {
  const NO_CLAIM = [
    ["NET 45", "a plain credit period"],
    ["NET-45", "a hyphenated credit period — the hyphen-number IS the period"],
    ["NET_30_DAYS", "no method, no grace"],
    ["NET_30_DAYS (ACH)", "method but deliberately no grace"],
    ["2%_10_NET_30 (POSTAL)", "discount terms, no grace"],
    ["Due on receipt", "no numbers at all"],
    ["30 Days", "a period with no NET token"],
    ["NET 30 DAYS", "the sandbox's own space-separated template name"],
    ["", "empty"],
    [null, "null"],
    [undefined, "undefined"],
  ];
  for (const [name, why] of NO_CLAIM) {
    it(`${JSON.stringify(name)} is no-claim — ${why}`, () => {
      const h = classifyPaymentTermName(name);
      assert.equal(h.state, "no-claim", h.reason);
      assert.equal(h.intent, undefined);
      assert.equal(h.proposedName, undefined);
    });
  }
});

describe("classifyPaymentTermName: names the grammar refuses", () => {
  it("flags a signed token that is not last, and proposes the fix", () => {
    // The exact mistake 5zorro's first draft of the convention would have produced, and the
    // reason grace-last was chosen over grace-middle.
    const h = classifyPaymentTermName("NET_30_DAYS -3 (POSTAL)");
    assert.equal(h.state, "malformed");
    assert.equal(h.confidence, "high");
    assert.equal(h.intent, -3);
    assert.equal(h.proposedName, "NET_30_DAYS (POSTAL) -3");
  });

  it("the proposed name round-trips back through the real parser", () => {
    // A proposal the grammar would refuse again is worse than no proposal.
    for (const bad of ["NET_30_DAYS -3 (POSTAL)", "NET_30_DAYS+7", "NET_30_DAYS-3"]) {
      const h = classifyPaymentTermName(bad);
      assert.equal(h.state, "malformed", bad);
      assert.equal(parsePaymentTermGrace(h.proposedName), h.intent, `${bad} -> ${h.proposedName}`);
    }
  });

  it("flags a glued plus — a + is never part of a credit period", () => {
    const h = classifyPaymentTermName("NET_30_DAYS+7");
    assert.equal(h.state, "malformed");
    assert.equal(h.intent, 7);
    assert.equal(h.proposedName, "NET_30_DAYS +7");
  });

  it("flags a glued minus only AFTER the period token", () => {
    const h = classifyPaymentTermName("NET_30_DAYS-3");
    assert.equal(h.state, "malformed");
    assert.equal(h.confidence, "medium", "a hyphen is an ordinary separator, so never high");
    assert.equal(h.intent, -3);
    assert.equal(h.proposedName, "NET_30_DAYS -3");
  });

  it("refuses to guess a direction for a bare trailing integer", () => {
    // `7` could mean +7 or -7, and those are opposite instructions: one pays a week late, the
    // other a week early. Guessing is the silent wrong number the signed grammar exists to stop.
    const h = classifyPaymentTermName("NET_30_DAYS 7");
    assert.equal(h.state, "malformed");
    assert.equal(h.confidence, "low");
    assert.equal(h.intent, undefined);
    assert.equal(h.proposedName, undefined);
    assert.match(h.reason, /\+7/);
    assert.match(h.reason, /-7/);
  });

  it("refuses to pick between two misplaced signed tokens", () => {
    const h = classifyPaymentTermName("NET_30 +2 -3 (ACH)");
    assert.equal(h.state, "malformed");
    assert.equal(h.intent, undefined);
    assert.equal(h.proposedName, undefined);
  });

  // The classifier explains the parser; it never contradicts it. `NET_30 +2 -3` satisfies the
  // end-anchored grammar (it reads -3 and ignores +2), so reporting "malformed" here would be the
  // diagnostic drifting from the engine — which is the failure this module exists to avoid.
  it("reports a passing-but-odd name as parsed, with low confidence rather than a contradiction", () => {
    const h = classifyPaymentTermName("NET_30 +2 -3");
    assert.equal(h.state, "parsed");
    assert.equal(h.graceDays, parsePaymentTermGrace("NET_30 +2 -3"));
    assert.equal(h.confidence, "low");
    assert.match(h.reason, /2 signed numbers/);
  });

  it("always returns a renderable one-sentence reason", () => {
    for (const n of ["NET_30_DAYS -3 (POSTAL)", "NET 45", "NET_30_DAYS (ACH) +2", "", "NET_30_DAYS 7"]) {
      const h = classifyPaymentTermName(n);
      assert.equal(typeof h.reason, "string");
      assert.ok(h.reason.length > 0, JSON.stringify(n));
    }
  });
});

describe("checkTermNameArithmetic", () => {
  // The whole seeded corpus must agree with itself: grace folds into credit_days, so every
  // fixture's name arithmetic has to reproduce its own creditDays. This is the check that would
  // have caught the stale re-seed, where the terms kept 30-day credit_days under +16 names.
  for (const t of SAMPLE_PAYMENT_TERMS) {
    it(`fixture ${t.name} agrees with its ${t.creditDays}-day credit period`, () => {
      const check = checkTermNameArithmetic({ paymentTerm: t.name, creditDays: t.creditDays });
      assert.equal(check.state, "agree", check.reason);
      assert.equal(check.nameImpliesDays, t.creditDays);
      assert.equal(check.deltaDays, 0);
    });
  }

  it("catches a name edited without its credit period", () => {
    const check = checkTermNameArithmetic({ paymentTerm: "NET_30_DAYS (POSTAL) +16", creditDays: 30 });
    assert.equal(check.state, "disagree");
    assert.equal(check.nameImpliesDays, 46);
    assert.equal(check.creditDays, 30);
    assert.equal(check.deltaDays, -16);
    assert.match(check.reason, /the name is the part that is wrong/);
  });

  it("reads the period from NET, not from a discount window", () => {
    const check = checkTermNameArithmetic({ paymentTerm: "2%_10_NET_30 (ACH) +2", creditDays: 32 });
    assert.equal(check.state, "agree", check.reason);
    assert.equal(check.nameImpliesDays, 32, "30 + 2, not 10 + 2");
  });

  it("treats an absent grace suffix as zero rather than unknown", () => {
    const check = checkTermNameArithmetic({ paymentTerm: "NET 45", creditDays: 45 });
    assert.equal(check.state, "agree", check.reason);
    assert.equal(check.nameImpliesDays, 45);
  });

  // Never `disagree` on missing data — an unknown is not a fault, and reporting one as a fault is
  // the same false positive the classifier guards against.
  const UNKNOWN = [
    [{}, "nothing at all"],
    [{ creditDays: 30 }, "no term name"],
    [{ paymentTerm: "NET_30_DAYS (ACH) +2" }, "no credit period recorded"],
    [{ paymentTerm: "Due on receipt", creditDays: 0 }, "a name with no arithmetic in it"],
    [null, "null row"],
  ];
  for (const [row, why] of UNKNOWN) {
    it(`is unknown, not a disagreement, when there is ${why}`, () => {
      assert.equal(checkTermNameArithmetic(row).state, "unknown");
    });
  }
});
