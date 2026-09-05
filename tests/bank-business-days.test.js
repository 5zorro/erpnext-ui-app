import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  usFederalHolidays,
  isWeekend,
  isFederalHoliday,
  isBankHoliday,
  isBlurDay,
  effectivePayByDate,
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

describe("bank-business-days: isBlurDay", () => {
  it("the Friday before a Monday holiday is blur", () => {
    assert.equal(isBlurDay("2026-01-16"), true); // Friday before MLK Day (Mon 2026-01-19)
  });

  it("the Friday after a Thursday holiday is blur", () => {
    assert.equal(isBlurDay("2026-11-27"), true); // day after Thanksgiving (Thu 2026-11-26)
  });

  it("an ordinary Friday with no adjacent holiday is not blur", () => {
    assert.equal(isBlurDay("2026-03-06"), false);
  });

  it("only Fridays can be blur days", () => {
    assert.equal(isBlurDay("2026-11-26"), false); // Thanksgiving itself is a Thursday
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

  it("blur shifts back one more day than plain weekend/holiday would", () => {
    // Friday 2026-01-16 is blur (day before MLK); Thursday 2026-01-15 is a plain business day.
    assert.equal(effectivePayByDate("2026-01-16"), "2026-01-15");
  });

  it("includeBlur: false disables blur but keeps weekend/holiday shifting", () => {
    assert.equal(effectivePayByDate("2026-01-16", { includeBlur: false }), "2026-01-16");
    assert.equal(effectivePayByDate("2026-07-04", { includeBlur: false }), "2026-07-02");
  });
});
