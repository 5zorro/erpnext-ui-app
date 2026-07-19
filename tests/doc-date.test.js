import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterDateInputValue,
  isAllowedDateInputChar,
  nearestYearForMonthDay,
  parseDocDate,
  formatDocDateDisplay,
  monthDistance,
} from "../src/doc-date.js";

describe("filterDateInputValue", () => {
  it("keeps only digits and / - .", () => {
    assert.equal(filterDateInputValue("11/15/2019abc"), "11/15/2019");
    assert.equal(filterDateInputValue("03-04.05"), "03-04.05");
    assert.equal(isAllowedDateInputChar("/"), true);
    assert.equal(isAllowedDateInputChar("a"), false);
  });
});

describe("nearestYearForMonthDay", () => {
  it("Feb 2019 + 11/15 → 2018 (fewer months)", () => {
    const today = new Date(2019, 1, 10); // Feb 10, 2019
    assert.equal(nearestYearForMonthDay(11, 15, today), 2018);
  });

  it("Oct 2019 + 11/15 → 2019", () => {
    const today = new Date(2019, 9, 10); // Oct 10, 2019
    assert.equal(nearestYearForMonthDay(11, 15, today), 2019);
  });
});

describe("parseDocDate", () => {
  it("parses ISO and display forms", () => {
    assert.deepEqual(parseDocDate("2019-11-15"), {
      ok: true,
      iso: "2019-11-15",
      display: "11/15/2019",
    });
    assert.equal(parseDocDate("11/15/2019").iso, "2019-11-15");
    assert.equal(formatDocDateDisplay("2019-11-15"), "11/15/2019");
  });

  it("fills year from nearest month for MM/DD", () => {
    const today = new Date(2019, 1, 10);
    const r = parseDocDate("11/15", today);
    assert.equal(r.ok, true);
    assert.equal(r.iso, "2018-11-15");
  });

  it("rejects invalid day", () => {
    assert.equal(parseDocDate("02/31/2019").ok, false);
  });
});

describe("monthDistance", () => {
  it("counts calendar months", () => {
    assert.equal(monthDistance(new Date(2019, 1, 1), new Date(2018, 10, 15)), 3);
  });
});
