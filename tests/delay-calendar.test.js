import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DELAY_SCOPES,
  DELAY_CSV_COLUMNS,
  methodDelayScopes,
  proposeDelayCalendar,
  parseDelayCalendarCsv,
  serializeDelayCalendarCsv,
  mergeDelayCalendar,
  delayCalendarIndex,
  isDelayDay,
  delayDayReason,
  unratifiedCount,
} from "../src/delay-calendar.js";

describe("delay-calendar: two calendars, not one", () => {
  // 🔴 5zorro: "ACH is bank days only, so the postage can't delay from a holiday."
  it("electronic rails observe bank days only", () => {
    for (const m of ["ACH", "DOM_WIRE", "INT_WIRE"]) {
      assert.deepEqual(methodDelayScopes(m), ["bank"], m);
    }
  });

  it("the cheque additionally observes postal delay days", () => {
    assert.deepEqual(methodDelayScopes("USPS_Check"), ["bank", "postal"]);
  });

  // Same conservative default as paymentMethodFee: unknown is treated as a cheque, because being
  // early is recoverable and being late is not.
  it("an unrecorded method observes both, conservatively", () => {
    for (const m of [null, undefined, "", "   "]) {
      assert.deepEqual(methodDelayScopes(m), ["bank", "postal"], JSON.stringify(m));
    }
  });

  it("exposes exactly the two scopes", () => {
    assert.deepEqual(DELAY_SCOPES, ["bank", "postal"]);
  });
});

describe("delay-calendar: what the rules propose", () => {
  const proposed = proposeDelayCalendar(2026);

  it("proposes the Friday after each Thursday holiday, scoped postal", () => {
    const dates = proposed.map((e) => e.date);
    assert.ok(dates.includes("2026-11-27"), "day after Thanksgiving");
    assert.ok(dates.includes("2026-01-02"), "day after New Year's Day (Thu)");
    assert.ok(proposed.every((e) => e.scope === "postal"), "bridge days are a postal phenomenon");
  });

  it("does not propose the Friday before a Monday holiday", () => {
    const dates = proposeDelayCalendar(2026).map((e) => e.date);
    assert.equal(dates.includes("2026-01-16"), false, "Friday before MLK Day");
    assert.equal(dates.includes("2026-09-04"), false, "Friday before Labor Day");
  });

  // 🔴 Rule 2. An unratified suggestion that silently moved a payment date is the exact failure
  // being corrected.
  it("proposes nothing as ratified", () => {
    assert.ok(proposed.length > 0);
    assert.ok(proposed.every((e) => e.ratified === false && e.source === "suggested"));
    assert.equal(unratifiedCount(proposed), proposed.length);
  });

  it("says why, in the entry itself", () => {
    const friday = proposed.find((e) => e.date === "2026-11-27");
    assert.match(friday.reason, /2026-11-26/);
    assert.match(friday.reason, /long weekend/);
  });

  it("stays inside the year it was asked about, and survives junk", () => {
    assert.ok(proposeDelayCalendar(2026).every((e) => e.date.startsWith("2026")));
    assert.deepEqual(proposeDelayCalendar("nope"), []);
    assert.deepEqual(proposeDelayCalendar(null), []);
  });
});

describe("delay-calendar: CSV round trip", () => {
  it("exports a header plus one row per entry", () => {
    const csv = serializeDelayCalendarCsv([
      { date: "2026-04-03", scope: "postal", reason: "Good Friday", source: "user", ratified: true },
    ]);
    assert.equal(csv.split("\n")[0], DELAY_CSV_COLUMNS.join(","));
    assert.equal(csv.split("\n")[1], "2026-04-03,postal,Good Friday,yes,user");
  });

  it("round-trips the proposed set unchanged", () => {
    const proposed = proposeDelayCalendar(2026);
    const back = parseDelayCalendarCsv(serializeDelayCalendarCsv(proposed));
    assert.deepEqual(back.errors, []);
    assert.deepEqual(back.entries, proposed);
  });

  it("re-exporting an unchanged calendar is byte-identical, so the file diffs cleanly", () => {
    const once = serializeDelayCalendarCsv(proposeDelayCalendar(2026));
    assert.equal(serializeDelayCalendarCsv(parseDelayCalendarCsv(once).entries), once);
  });

  it("quotes a reason containing a comma, and reads it back whole", () => {
    const entry = {
      date: "2026-02-10",
      scope: "postal",
      reason: 'Ice storm, statewide; carrier said "no runs"',
      source: "user",
      ratified: true,
    };
    const back = parseDelayCalendarCsv(serializeDelayCalendarCsv([entry]));
    assert.deepEqual(back.entries, [entry]);
  });

  // 5zorro's own counterexample: no algorithm produces Good Friday, so pasting a year of local
  // knowledge in has to work.
  it("accepts a hand-typed block with no source column and treats it as ratified user knowledge", () => {
    const { entries, errors } = parseDelayCalendarCsv(
      ["date,scope,reason", "2026-04-03,postal,Good Friday", "2026-02-10,postal,Ice storm"].join("\n"),
    );
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 2);
    assert.ok(entries.every((e) => e.ratified && e.source === "user"));
  });

  it("reads columns in whatever order the spreadsheet wrote them", () => {
    const { entries } = parseDelayCalendarCsv("reason,ratified,date,scope\nStrike,no,2026-05-04,bank");
    assert.deepEqual(entries, [
      { date: "2026-05-04", scope: "bank", reason: "Strike", ratified: false, source: "user" },
    ]);
  });

  it("tolerates CRLF and blank lines", () => {
    const { entries, errors } = parseDelayCalendarCsv(
      "date,scope,reason\r\n2026-04-03,postal,Good Friday\r\n\r\n",
    );
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 1);
  });

  // 🔴 A row the user typed and this module discarded without saying so is a delay day that
  // quietly stops applying.
  it("reports a bad date rather than dropping the row in silence", () => {
    const { entries, errors } = parseDelayCalendarCsv(
      ["date,scope,reason", "04/03/2026,postal,Good Friday", "2026-04-03,postal,ok"].join("\n"),
    );
    assert.equal(entries.length, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Line 2/);
    assert.match(errors[0], /04\/03\/2026/);
  });

  it("reports an unknown scope the same way", () => {
    const { errors } = parseDelayCalendarCsv("date,scope,reason\n2026-04-03,mail,Good Friday");
    assert.equal(errors.length, 1);
    assert.match(errors[0], /"bank" or "postal"/);
  });

  it("returns empty for empty input rather than throwing", () => {
    for (const bad of ["", null, undefined, "\n\n"]) {
      const r = parseDelayCalendarCsv(bad);
      assert.deepEqual(r.entries, []);
      assert.deepEqual(r.errors, []);
    }
  });
});

describe("delay-calendar: merge protects decisions already made", () => {
  const suggestion = {
    date: "2026-11-27",
    scope: "postal",
    reason: "Bridge day",
    source: "suggested",
    ratified: false,
  };

  it("keeps a ratification when the same suggestion is proposed again", () => {
    const ratified = { ...suggestion, ratified: true };
    const merged = mergeDelayCalendar([ratified], [suggestion]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].ratified, true, "re-proposing must not un-ratify");
  });

  it("never lets a suggestion overwrite a hand-typed entry", () => {
    const mine = { ...suggestion, source: "user", reason: "Our own dock is shut", ratified: true };
    const merged = mergeDelayCalendar([mine], [suggestion]);
    assert.deepEqual(merged, [mine]);
  });

  it("treats (date, scope) as the key, so the two calendars do not collide", () => {
    const merged = mergeDelayCalendar(
      [{ ...suggestion, scope: "bank" }],
      [{ ...suggestion, scope: "postal" }],
    );
    assert.equal(merged.length, 2);
  });

  it("adds genuinely new entries and sorts the result", () => {
    const merged = mergeDelayCalendar(
      [{ ...suggestion, date: "2026-12-24" }],
      [suggestion, { ...suggestion, date: "2026-01-02" }],
    );
    assert.deepEqual(merged.map((e) => e.date), ["2026-01-02", "2026-11-27", "2026-12-24"]);
  });

  it("mutates neither input", () => {
    const a = [{ ...suggestion, ratified: true }];
    const b = [suggestion];
    mergeDelayCalendar(a, b);
    assert.equal(a[0].ratified, true);
    assert.equal(b[0].ratified, false);
  });

  it("survives junk on either side", () => {
    assert.deepEqual(mergeDelayCalendar(null, null), []);
    assert.deepEqual(mergeDelayCalendar([{ date: "nope" }], []), []);
  });
});

describe("delay-calendar: only ratified days move a date", () => {
  const entries = [
    { date: "2026-11-27", scope: "postal", reason: "Bridge day", source: "suggested", ratified: true },
    { date: "2026-01-02", scope: "postal", reason: "Bridge day", source: "suggested", ratified: false },
    { date: "2026-05-04", scope: "bank", reason: "Fed maintenance", source: "user", ratified: true },
  ];
  const index = delayCalendarIndex(entries);

  // 🔴 Rule 2, enforced in the one place it has to be.
  it("an unratified suggestion is invisible to the walker", () => {
    assert.equal(isDelayDay(index, "2026-01-02", "USPS_Check"), false);
    assert.equal(isDelayDay(index, "2026-11-27", "USPS_Check"), true);
  });

  it("a postal delay day does not touch an ACH payment", () => {
    assert.equal(isDelayDay(index, "2026-11-27", "ACH"), false);
    assert.equal(isDelayDay(index, "2026-11-27", "DOM_WIRE"), false);
  });

  it("a bank delay day touches every rail, cheque included", () => {
    for (const m of ["ACH", "DOM_WIRE", "INT_WIRE", "USPS_Check", null]) {
      assert.equal(isDelayDay(index, "2026-05-04", m), true, String(m));
    }
  });

  it("an unrecorded method is treated as a cheque", () => {
    assert.equal(isDelayDay(index, "2026-11-27", null), true);
  });

  it("carries the reason through for the audit trail", () => {
    assert.equal(delayDayReason(index, "2026-11-27", "USPS_Check"), "Bridge day");
    assert.equal(delayDayReason(index, "2026-11-27", "ACH"), "", "wrong rail, no reason");
    assert.equal(delayDayReason(index, "2026-06-01", "USPS_Check"), "");
  });

  it("an ordinary day is not a delay day", () => {
    assert.equal(isDelayDay(index, "2026-06-01", "USPS_Check"), false);
    assert.equal(isDelayDay(null, "2026-11-27", "USPS_Check"), false);
  });

  it("counts what is still awaiting sign-off", () => {
    assert.equal(unratifiedCount(entries), 1);
    assert.equal(unratifiedCount([]), 0);
    assert.equal(unratifiedCount(null), 0);
  });
});
