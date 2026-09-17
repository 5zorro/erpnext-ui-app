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
  normalizeDelayDate,
  delayDayProbe,
} from "../src/delay-calendar.js";
import { explainPayByDate, effectivePayByDate } from "../src/bank-business-days.js";

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
      ["date,scope,reason", "Good Friday,postal,typed the name not the date", "2026-04-03,postal,ok"].join("\n"),
    );
    assert.equal(entries.length, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Line 2/);
    assert.match(errors[0], /Good Friday/);
  });

  // 🔄 Widened by P3a: `04/03/2026` used to be an error here, back when ISO was the only accepted
  // form. Excel rewrites an ISO column into the machine's locale whether or not the row was
  // edited, so refusing it would mean the round trip only worked on files nobody opened. It is
  // read month-first and flagged, never dropped.
  it("accepts the locale date Excel writes back, with a flag rather than an error", () => {
    const { entries, errors, warnings } = parseDelayCalendarCsv(
      ["date,scope,reason", "04/03/2026,postal,Good Friday"].join("\n"),
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(entries.map((e) => e.date), ["2026-04-03"]);
    assert.equal(warnings.length, 1);
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

describe("delay-calendar: the Excel round trip (P3a)", () => {
  // 5zorro asked for a file that is "easy to edit in microsoft excel" — so the damage Excel does
  // on the way back is part of the contract, not an edge case.
  it("reads the locale dates Excel writes back over an ISO column", () => {
    for (const [raw, iso] of [
      ["2026-01-16", "2026-01-16"],
      ["1/16/2026", "2026-01-16"],
      ["01/16/2026", "2026-01-16"],
      ["1-16-26", "2026-01-16"],
      ["12.25.2026", "2026-12-25"],
    ]) {
      const got = normalizeDelayDate(raw);
      assert.equal(got.date, iso, `${raw} → ${iso}`);
      assert.equal(got.error, "");
    }
  });

  it("reads day-first when month-first is impossible, and says so when it cannot tell", () => {
    // 16 cannot be a month, so there is nothing to be ambiguous about.
    const unambiguous = normalizeDelayDate("16/1/2026");
    assert.equal(unambiguous.date, "2026-01-16");
    assert.equal(unambiguous.ambiguous, false);

    // 3/4 genuinely reads two ways. Month-first is chosen (US), and the caller is told.
    const ambiguous = normalizeDelayDate("3/4/2026");
    assert.equal(ambiguous.date, "2026-03-04");
    assert.equal(ambiguous.ambiguous, true);

    // Same under either reading — nothing to warn about.
    assert.equal(normalizeDelayDate("3/3/2026").ambiguous, false);

    // 13 cannot be a month, so this is a day-first date and not a bad one.
    assert.equal(normalizeDelayDate("13/1/2026").date, "2026-01-13");
  });

  it("refuses a day that does not exist instead of rolling it forward", () => {
    // `new Date("2026-02-30")` is happy to invent March 2nd. A delay calendar must not.
    for (const bad of ["2026-02-30", "13/13/2026", "2026-13-01", "31/4/2026", "not a date", ""]) {
      assert.equal(normalizeDelayDate(bad).date, "", bad);
    }
  });

  it("keeps an ambiguous row and warns; drops a bad row and errors", () => {
    const { entries, errors, warnings } = parseDelayCalendarCsv(
      ["date,scope,reason,ratified,source", "3/4/2026,bank,Ambiguous,yes,user", "2026-02-30,bank,Bad,yes,user"].join("\n"),
    );
    assert.deepEqual(entries.map((e) => e.date), ["2026-03-04"]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Line 3/);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /month first/);
  });

  it("survives its own Excel export: BOM, CRLF and all", () => {
    const entries = [
      { date: "2026-01-16", scope: "postal", reason: "Nor'easter, carrier stopped", source: "user", ratified: true },
      { date: "2026-07-03", scope: "postal", reason: "Bridge day, July 4th", source: "suggested", ratified: false },
    ];
    const csv = serializeDelayCalendarCsv(entries, { excel: true });
    assert.ok(csv.startsWith("\ufeff"), "BOM so Excel reads UTF-8");
    assert.ok(csv.includes("\r\n"), "CRLF so Excel does not run the file together");

    const back = parseDelayCalendarCsv(csv);
    assert.deepEqual(back.errors, []);
    assert.deepEqual(back.entries, entries);
  });

  it("leaves the stored format byte-identical when the Excel flag is off", () => {
    const entries = [{ date: "2026-01-16", scope: "postal", reason: "x", source: "user", ratified: true }];
    const plain = serializeDelayCalendarCsv(entries);
    assert.ok(!plain.includes("\ufeff") && !plain.includes("\r"));
    assert.deepEqual(parseDelayCalendarCsv(plain).entries, entries);
  });
});

describe("delay-calendar: the ratified calendar decides, once there is one (P3d)", () => {
  const ratified = (date, scope, reason) => ({ date, scope, reason, source: "user", ratified: true });

  it("moves a payment off a ratified day the algorithm could never have proposed", () => {
    // 5zorro's own counterexample: Good Friday is not a federal holiday, but the mail stops.
    // 2026-04-03 is a Friday and an ordinary working day to every rule in bank-business-days.
    assert.equal(effectivePayByDate("2026-04-03"), "2026-04-03");

    const index = delayCalendarIndex([ratified("2026-04-03", "postal", "Good Friday — mail delayed")]);
    const walk = explainPayByDate("2026-04-03", { delayDay: delayDayProbe(index, "USPS_Check") });
    assert.equal(walk.date, "2026-04-02");
    assert.deepEqual(walk.skipped[0].reasons, ["delay"]);
    assert.equal(walk.skipped[0].note, "Good Friday — mail delayed");
  });

  it("applies a postal day to the cheque and not to ACH", () => {
    const index = delayCalendarIndex([ratified("2026-04-03", "postal", "Good Friday")]);
    assert.equal(effectivePayByDate("2026-04-03", { delayDay: delayDayProbe(index, "USPS_Check") }), "2026-04-02");
    assert.equal(effectivePayByDate("2026-04-03", { delayDay: delayDayProbe(index, "ACH") }), "2026-04-03");
  });

  it("ignores an unratified suggestion, which is the whole point of the layer", () => {
    const suggested = [{ date: "2026-04-03", scope: "postal", reason: "guess", source: "suggested", ratified: false }];
    const probe = delayDayProbe(delayCalendarIndex(suggested), "USPS_Check");
    assert.equal(effectivePayByDate("2026-04-03", { delayDay: probe }), "2026-04-03");
  });

  it("replaces the bridge rule rather than stacking on it", () => {
    // 2026-01-19 is MLK day (a Monday), so 2026-01-16 is a Friday next to it — not a bridge day
    // under the corrected rule, but take a real one: the Friday after Thanksgiving 2026-11-27.
    assert.equal(effectivePayByDate("2026-11-27"), "2026-11-25", "bridge rule fires by default");

    // With a calendar in play, an unratified bridge day stops applying — the user must sign it off.
    const probe = delayDayProbe(delayCalendarIndex([]), "USPS_Check");
    assert.equal(effectivePayByDate("2026-11-27", { delayDay: probe }), "2026-11-27");

    // And once they do, it applies again, with their words on it.
    const signed = delayCalendarIndex([ratified("2026-11-27", "postal", "Day after Thanksgiving")]);
    assert.equal(effectivePayByDate("2026-11-27", { delayDay: delayDayProbe(signed, "USPS_Check") }), "2026-11-25");
  });

  it("a ratified entry with no reason still moves the date", () => {
    const index = delayCalendarIndex([ratified("2026-04-03", "postal", "")]);
    const walk = explainPayByDate("2026-04-03", { delayDay: delayDayProbe(index, "USPS_Check") });
    assert.equal(walk.date, "2026-04-02");
    assert.equal(walk.skipped[0].note, "Ratified delay day");
  });
});
