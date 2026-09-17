import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  usFederalHolidays,
  isWeekend,
  isFederalHoliday,
  isBankHoliday,
  isBridgeDay,
  effectivePayByDate,
  explainPayByDate,
} from "../src/bank-business-days.js";

// Ground truth below was computed independently with plain `new Date(Date.UTC(...)).getUTCDay()`
// (not this module's logic) before writing these assertions.

describe("bank-business-days: usFederalHolidays", () => {
  it("2026: fixed-date holidays landing on a weekday need no observed shift", () => {
    const h = usFederalHolidays(2026);
    assert.ok(h.has("2026-01-01"), "New Year's Day (Thu, unchanged)");
    assert.ok(h.has("2026-06-19"), "Juneteenth (Fri, unchanged)");
    assert.ok(h.has("2026-11-11"), "Veterans Day (Wed, unchanged)");
    assert.ok(h.has("2026-12-25"), "Christmas (Fri, unchanged)");
  });

  it("2026: nth-weekday-of-month holidays", () => {
    const h = usFederalHolidays(2026);
    assert.ok(h.has("2026-01-19"), "MLK Day — 3rd Monday of January");
    assert.ok(h.has("2026-02-16"), "Washington's Birthday — 3rd Monday of February");
    assert.ok(h.has("2026-05-25"), "Memorial Day — last Monday of May");
    assert.ok(h.has("2026-09-07"), "Labor Day — 1st Monday of September");
    assert.ok(h.has("2026-10-12"), "Columbus Day — 2nd Monday of October");
    assert.ok(h.has("2026-11-26"), "Thanksgiving — 4th Thursday of November");
    assert.equal(h.size, 11);
  });

  it("observed-date shift: Saturday holiday moves to the prior Friday", () => {
    // Independence Day 2026 falls on a Saturday.
    const h = usFederalHolidays(2026);
    assert.ok(h.has("2026-07-03"), "observed Friday");
    assert.ok(!h.has("2026-07-04"), "the actual Saturday is not itself listed");
  });

  it("observed-date shift: Sunday holiday moves to the next Monday", () => {
    // Independence Day 2027 falls on a Sunday.
    const h = usFederalHolidays(2027);
    assert.ok(h.has("2027-07-05"), "observed Monday");
    assert.ok(!h.has("2027-07-04"));
  });

  it("observed-date shift can spill into the prior December", () => {
    // New Year's Day 2028 falls on a Saturday -> observed Friday Dec 31, 2027.
    const h2028 = usFederalHolidays(2028);
    assert.ok(h2028.has("2027-12-31"));
    assert.ok(!h2028.has("2028-01-01"));
  });
});

describe("bank-business-days: isWeekend / isFederalHoliday / isBankHoliday", () => {
  it("isWeekend recognizes Saturday and Sunday only", () => {
    assert.equal(isWeekend("2026-07-04"), true); // Saturday
    assert.equal(isWeekend("2026-07-05"), true); // Sunday
    assert.equal(isWeekend("2026-07-06"), false); // Monday
  });

  it("isFederalHoliday sees spillover across the year boundary", () => {
    // Checking a 2027 date must still see 2028's New Year's Day spilling back to 2027-12-31.
    assert.equal(isFederalHoliday("2027-12-31"), true);
    assert.equal(isFederalHoliday("2027-12-30"), false);
  });

  it("isBankHoliday is weekend OR federal holiday", () => {
    assert.equal(isBankHoliday("2026-06-19"), true); // Juneteenth, a Friday
    assert.equal(isBankHoliday("2026-06-20"), true); // plain Saturday
    assert.equal(isBankHoliday("2026-06-18"), false); // plain Thursday
  });
});

// 🔴 Corrected 2026-09-11 (plan B3). A bridge day is the lone workday STRANDED between a holiday
// and a weekend. The rule shipped before this was wrong in both directions, and both directions
// have a test below.
describe("bank-business-days: isBridgeDay", () => {
  it("the Friday after a Thursday holiday is a bridge day", () => {
    assert.equal(isBridgeDay("2026-11-27"), true); // day after Thanksgiving (Thu 2026-11-26)
    assert.equal(isBridgeDay("2026-01-02"), true); // day after New Year's Day (Thu 2026-01-01)
  });

  // The half the old rule was missing entirely.
  it("the Monday before a Tuesday holiday is a bridge day", () => {
    const tuesdayHolidays = [];
    for (let y = 2024; y <= 2034; y++) {
      for (const iso of usFederalHolidays(y)) {
        if (new Date(`${iso}T00:00:00Z`).getUTCDay() === 2) tuesdayHolidays.push(iso);
      }
    }
    assert.ok(tuesdayHolidays.length, "the range must actually contain a Tuesday holiday");
    for (const iso of tuesdayHolidays) {
      const monday = new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      assert.equal(isBridgeDay(monday), true, `${monday} before ${iso}`);
    }
  });

  // The half the old rule wrongly included: nobody is off yet, the long weekend has not started.
  it("the Friday BEFORE a Monday holiday is not a bridge day", () => {
    assert.equal(isBridgeDay("2026-01-16"), false); // Friday before MLK Day (Mon 2026-01-19)
    assert.equal(isBridgeDay("2026-09-04"), false); // Friday before Labor Day (Mon 2026-09-07)
  });

  it("an ordinary Friday or Monday with no adjacent holiday is not a bridge day", () => {
    assert.equal(isBridgeDay("2026-03-06"), false); // plain Friday
    assert.equal(isBridgeDay("2026-03-09"), false); // plain Monday
  });

  it("only Mondays and Fridays can be bridge days", () => {
    assert.equal(isBridgeDay("2026-11-26"), false); // Thanksgiving itself is a Thursday
    assert.equal(isBridgeDay("2026-11-25"), false); // the Wednesday before it
  });
});

describe("bank-business-days: effectivePayByDate", () => {
  it("an ordinary weekday is returned unchanged", () => {
    assert.equal(effectivePayByDate("2026-06-18"), "2026-06-18"); // plain Thursday
  });

  it("Sunday shifts back to the prior Friday (skipping Saturday)", () => {
    assert.equal(effectivePayByDate("2028-08-06"), "2028-08-04");
  });

  it("a weekday federal holiday shifts back to the prior business day", () => {
    assert.equal(effectivePayByDate("2026-06-19"), "2026-06-18"); // Juneteenth (Fri) -> Thursday
  });

  it("a Saturday-observed holiday shifts back through both non-business days", () => {
    // Independence Day 2026: actual Sat 7/4, observed Fri 7/3. Both are non-payable; prior
    // Thursday 7/2 is a plain business day.
    assert.equal(effectivePayByDate("2026-07-04"), "2026-07-02");
  });

  it("a bridge day shifts back one more day than plain weekend/holiday would", () => {
    // Friday 2026-11-27 is a bridge day (after Thanksgiving Thu 11-26); Wednesday 11-25 is plain.
    assert.equal(effectivePayByDate("2026-11-27"), "2026-11-25");
  });

  // The correction, stated as behaviour: this used to return 2026-01-15.
  it("no longer shifts off the Friday BEFORE a Monday holiday", () => {
    assert.equal(effectivePayByDate("2026-01-16"), "2026-01-16");
  });

  it("includeBridge: false disables bridge days but keeps weekend/holiday shifting", () => {
    assert.equal(effectivePayByDate("2026-11-27", { includeBridge: false }), "2026-11-27");
    assert.equal(effectivePayByDate("2026-07-04", { includeBridge: false }), "2026-07-02");
  });
});

describe("bank-business-days: explainPayByDate", () => {
  it("keeps the walk that effectivePayByDate throws away", () => {
    // Thanksgiving weekend 2026 is the case that contains all three kinds of day 5zorro asked to
    // be able to count: "2 weekend days, 1 blur day, 1 holiday". A bill due Sunday 11-29 walks
    // back over Sun, Sat, the bridge Friday and Thanksgiving itself.
    const walk = explainPayByDate("2026-11-29");
    assert.equal(walk.from, "2026-11-29");
    assert.equal(walk.date, "2026-11-25");
    assert.equal(walk.exhausted, false);
    assert.deepEqual(
      walk.skipped.map((s) => [s.date, s.reasons.join("+")]),
      [
        ["2026-11-29", "weekend"],
        ["2026-11-28", "weekend"],
        ["2026-11-27", "bridge"],
        ["2026-11-26", "holiday"],
      ],
    );
  });

  it("records nothing when the due date is already payable", () => {
    const walk = explainPayByDate("2026-09-11"); // a plain Friday
    assert.equal(walk.date, "2026-09-11");
    assert.deepEqual(walk.skipped, []);
  });

  // The whole point of routing effectivePayByDate through this: an audit trail that can disagree
  // with the engine it audits is worse than none, because it is believed.
  it("agrees with effectivePayByDate on every day of 2026", () => {
    let d = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 365; i++) {
      const iso = d.toISOString().slice(0, 10);
      assert.equal(explainPayByDate(iso).date, effectivePayByDate(iso), iso);
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    }
  });

  it("honours includeBridge:false the same way effectivePayByDate does", () => {
    const walk = explainPayByDate("2026-11-27", { includeBridge: false }); // day after Thanksgiving
    assert.equal(walk.date, "2026-11-27");
    assert.deepEqual(walk.skipped, []);
    assert.equal(effectivePayByDate("2026-11-27", { includeBridge: false }), "2026-11-27");
  });

  it("names every reason a single day is unpayable, not just the first", () => {
    // 2026-11-27 is the Friday after Thanksgiving: a bridge day, but not a weekend or a holiday.
    const [first] = explainPayByDate("2026-11-27").skipped;
    assert.deepEqual(first, { date: "2026-11-27", reasons: ["bridge"] });
  });
});
