import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { derivePaymentDate, summarizePaymentDate } from "../src/payment-date-derivation.js";
import { effectivePayByDate } from "../src/bank-business-days.js";

/**
 * A bill whose term and stored due date agree: Net 30 from 2026-10-30 is 2026-11-29.
 *
 * Thanksgiving weekend is the fixture because it is the one stretch that contains all three kinds
 * of skipped day at once — Sun, Sat, the bridge Friday, and the holiday itself.
 */
function agreeingBill(over = {}) {
  return {
    installmentKey: "ACC-PINV-2026-00001",
    supplier: "SAMPLE Vendor A",
    postingDate: "2026-10-30",
    dueDate: "2026-11-29",
    creditDays: 30,
    dueDateBasedOn: "Day(s) after invoice date",
    paymentTerm: "NET_30_DAYS (POSTAL) -3",
    ...over,
  };
}

describe("derivePaymentDate: the bumps, itemised", () => {
  it("answers 5zorro's question literally — 2 weekend days, 1 bridge day, 1 holiday", () => {
    // A bill due Sunday 2026-11-29 walks back over Sun, Sat, the bridge Friday after Thanksgiving,
    // and Thanksgiving itself — exactly the four kinds of day the audit trail distinguishes.
    const d = derivePaymentDate(agreeingBill());
    assert.equal(d.dueDate, "2026-11-29");
    assert.equal(d.payOn, "2026-11-25");
    assert.equal(d.totalDeltaDays, -4);
    assert.equal(d.onTime, false);
    assert.deepEqual(d.countsByRule, { weekend: 2, bridge: 1, holiday: 1 });
    assert.deepEqual(
      d.steps.map((s) => [s.rule, s.date, s.deltaDays]),
      [
        ["due-date", "2026-11-29", 0],
        ["weekend", "2026-11-28", -1],
        ["weekend", "2026-11-27", -1],
        ["bridge", "2026-11-26", -1],
        ["holiday", "2026-11-25", -1],
      ],
    );
  });

  it("every step names the day that actually fired the rule", () => {
    const d = derivePaymentDate(agreeingBill());
    assert.match(d.steps[1].detail, /2026-11-29/, "the Sunday itself, not the day we moved to");
    assert.match(d.steps[4].detail, /2026-11-26/);
  });

  // "Exactly on time" must be representable — a derivation with zero bumps renders as a row
  // saying so, not as an empty popup.
  it("renders being on time as a step, never as an empty list", () => {
    const d = derivePaymentDate(agreeingBill({ postingDate: "2026-08-12", dueDate: "2026-09-11" }));
    assert.equal(d.onTime, true);
    assert.equal(d.payOn, "2026-09-11");
    assert.equal(d.totalDeltaDays, 0);
    assert.deepEqual(d.countsByRule, {});
    assert.equal(d.steps.length, 2);
    assert.equal(d.steps[1].rule, "on-time");
    assert.match(d.steps[1].detail, /already a payable day/);
  });

  // The derivation is a description of the engine, not a second engine.
  it("its payOn is always effectivePayByDate of the stored due date", () => {
    let day = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 400; i++) {
      const iso = day.toISOString().slice(0, 10);
      assert.equal(derivePaymentDate({ dueDate: iso }).payOn, effectivePayByDate(iso), iso);
      day = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1));
    }
  });

  it("the last step's date is always payOn, and the deltas sum to totalDeltaDays", () => {
    for (const due of ["2026-09-07", "2026-11-27", "2026-01-01", "2026-05-25", "2026-09-11"]) {
      const d = derivePaymentDate({ dueDate: due });
      assert.equal(d.steps[d.steps.length - 1].date, d.payOn, due);
      assert.equal(
        d.steps.reduce((s, x) => s + x.deltaDays, 0),
        d.totalDeltaDays,
        due,
      );
    }
  });

  it("passes includeBridge through to the calendar", () => {
    const bill = { dueDate: "2026-11-27" }; // the Friday after Thanksgiving
    assert.equal(derivePaymentDate(bill).payOn, "2026-11-25");
    assert.equal(derivePaymentDate(bill, { includeBridge: false }).payOn, "2026-11-27");
    assert.equal(derivePaymentDate(bill, { includeBridge: false }).onTime, true);
  });
});

describe("derivePaymentDate: due-date provenance (step 0)", () => {
  it("says the term and the stored date agree, when they do", () => {
    const d = derivePaymentDate(agreeingBill());
    assert.equal(d.steps[0].rule, "due-date");
    assert.equal(d.overridesTerm, false);
    assert.equal(d.termImpliedDueDate, "2026-11-29");
    assert.equal(d.steps[0].severity, undefined, "agreement is not a warning");
    assert.match(d.steps[0].detail, /agree/);
  });

  // 🔴 ERPNext will not tell you: validate_due_date_with_template throws only when the due date is
  // LATER than the term allows. An earlier one passes in complete silence.
  it("flags a stored due date the term does not justify", () => {
    const d = derivePaymentDate(agreeingBill({ dueDate: "2026-11-09" })); // posting + 10, not + 30
    assert.equal(d.overridesTerm, true);
    assert.equal(d.steps[0].rule, "term-override");
    assert.equal(d.steps[0].label, "DUE DATE OVERRIDING TERMS");
    assert.equal(d.steps[0].severity, "warn");
    assert.equal(d.termImpliedDueDate, "2026-11-29");
    assert.match(d.steps[0].detail, /2026-11-29/);
    assert.match(d.steps[0].detail, /-20 days/);
  });

  it("computes from the stored date, not the term's, once they disagree", () => {
    const d = derivePaymentDate(agreeingBill({ dueDate: "2026-11-09" }));
    assert.equal(d.payOn, effectivePayByDate("2026-11-09"));
    assert.notEqual(d.payOn, effectivePayByDate("2026-11-29"));
  });

  it("mentions the posting-date caveat only when no bill date was supplied", () => {
    const bare = derivePaymentDate(agreeingBill({ dueDate: "2026-11-09" }));
    assert.match(bare.steps[0].detail, /supplier invoice date/i);
    const exact = derivePaymentDate(agreeingBill({ dueDate: "2026-11-09" }), { billDate: "2026-10-30" });
    assert.doesNotMatch(exact.steps[0].detail, /supplier invoice date/i);
  });

  it("stays quiet when the term states no basis to compare against", () => {
    const d = derivePaymentDate({ postingDate: "2026-08-08", dueDate: "2026-08-18" });
    assert.equal(d.overridesTerm, false);
    assert.equal(d.termImpliedDueDate, undefined);
    assert.equal(d.steps[0].rule, "due-date");
  });

  // Mirrors party.py::get_due_date_from_template, read from the running ERPNext 2026-09-11.
  it("reproduces ERPNext's month-end basis", () => {
    const d = derivePaymentDate({
      postingDate: "2026-08-08",
      dueDate: "2026-09-15",
      creditDays: 15,
      dueDateBasedOn: "Day(s) after the end of the invoice month",
    });
    assert.equal(d.termImpliedDueDate, "2026-09-15", "2026-08-31 + 15");
    assert.equal(d.overridesTerm, false);
  });

  it("reproduces ERPNext's Month(s)-after-month-end basis, which lands on a last day", () => {
    const d = derivePaymentDate({
      postingDate: "2026-01-31",
      dueDate: "2026-02-28",
      creditMonths: 1,
      dueDateBasedOn: "Month(s) after the end of the invoice month",
    });
    // add_months clamps Jan 31 to Feb 28, then get_last_day keeps it at Feb 28.
    assert.equal(d.termImpliedDueDate, "2026-02-28");
    assert.equal(d.overridesTerm, false);
  });

  it("applies ERPNext's floor — an implied date can never precede the invoice", () => {
    const d = derivePaymentDate({
      postingDate: "2026-08-08",
      dueDate: "2026-08-08",
      creditDays: -5,
      dueDateBasedOn: "Day(s) after invoice date",
    });
    assert.equal(d.termImpliedDueDate, "2026-08-08");
    assert.equal(d.overridesTerm, false);
  });

  // 🔴 Grace is already inside credit_days (the 2026-09-09 reversal). A grace step here would
  // double-count it — the same bug that deleted applyGraceToDueDate.
  it("never adds a grace step for a name that carries one", () => {
    const d = derivePaymentDate(agreeingBill({ paymentTerm: "NET_30_DAYS (POSTAL) +16" }));
    assert.equal(d.steps.some((s) => /grace/i.test(s.rule + s.label)), false);
    assert.equal(d.payOn, "2026-11-25", "unchanged by the +16 in the name");
  });

  // We do not have transitDays/clearDays, so there must be no transit row inventing them.
  it("invents no transit step", () => {
    const d = derivePaymentDate(agreeingBill({ modeOfPayment: "USPS_Check" }));
    assert.equal(d.steps.some((s) => /transit/i.test(s.rule + s.label)), false);
  });
});

describe("derivePaymentDate: degenerate input", () => {
  const BAD = [null, undefined, {}, { dueDate: "" }, { dueDate: "not-a-date" }, { dueDate: "2026-13-45x" }];
  for (const row of BAD) {
    it(`returns a renderable derivation for ${JSON.stringify(row)} rather than throwing`, () => {
      const d = derivePaymentDate(row);
      assert.equal(d.steps.length, 1);
      assert.equal(d.steps[0].severity, "warn");
      assert.equal(d.payOn, "");
    });
  }
});

describe("summarizePaymentDate", () => {
  it("counts each rule in words", () => {
    const s = summarizePaymentDate(derivePaymentDate(agreeingBill()));
    assert.equal(
      s,
      "2 weekend days + 1 bridge day + 1 federal holiday — 4 days earlier than the 2026-11-29 due date.",
    );
  });

  it("says so plainly when nothing moved", () => {
    const s = summarizePaymentDate(derivePaymentDate({ dueDate: "2026-09-11" }));
    assert.equal(s, "Payable exactly on the 2026-09-11 due date.");
  });

  it("uses the singular for a one-day move", () => {
    const s = summarizePaymentDate(derivePaymentDate({ dueDate: "2026-09-12" })); // a Saturday
    assert.equal(s, "1 weekend day — 1 day earlier than the 2026-09-12 due date.");
  });

  it("degrades rather than throws on a bill with no due date", () => {
    assert.equal(summarizePaymentDate(derivePaymentDate({})), "No due date recorded.");
    assert.equal(summarizePaymentDate(null), "No due date recorded.");
  });
});

describe("derivePaymentDate: a discount window is a different obligation", () => {
  const bill = {
    postingDate: "2026-08-08",
    dueDate: "2026-08-18", // the discount deadline, passed in place of the due date
    creditDays: 30,
    dueDateBasedOn: "Day(s) after invoice date",
    paymentTerm: "2%_10_NET_30 (ACH) +2",
  };

  // Without this, every 2/10-net-30 bill in the corpus would report itself as overriding its own
  // terms — a false warning on correct data, which is the failure C7 is written to avoid.
  it("does not compare a discount deadline against the credit period", () => {
    const d = derivePaymentDate(bill, { obligation: "discount-window" });
    assert.equal(d.overridesTerm, false);
    assert.equal(d.steps[0].rule, "due-date");
    assert.equal(d.steps[0].label, "Discount window closes");
    assert.equal(d.steps[0].severity, undefined);
  });

  it("still walks the calendar back from it", () => {
    const d = derivePaymentDate({ ...bill, dueDate: "2026-11-29" }, { obligation: "discount-window" });
    assert.equal(d.payOn, "2026-11-25");
    assert.deepEqual(d.countsByRule, { weekend: 2, bridge: 1, holiday: 1 });
  });

  it("would have warned without the flag — proving the flag is what suppresses it", () => {
    assert.equal(derivePaymentDate(bill).overridesTerm, true);
  });
});

describe("payment-date-derivation: naming the right deadline", () => {
  // Caught by rendering it: every discount capture said "Payable exactly on the … due date",
  // which is a claim about the wrong deadline. The discount date is not the due date.
  it("calls a discount deadline a discount deadline, in both the summary and the on-time step", () => {
    const d = derivePaymentDate({ dueDate: "2026-09-15" }, { obligation: "discount-window" });
    assert.equal(d.obligation, "discount-window");
    assert.equal(summarizePaymentDate(d), "Payable exactly on the 2026-09-15 discount deadline.");
    assert.match(d.steps[1].detail, /discount deadline is already a payable day/);
  });

  it("still says due date when it is one", () => {
    const d = derivePaymentDate({ dueDate: "2026-09-11" });
    assert.equal(d.obligation, "due-date");
    assert.equal(summarizePaymentDate(d), "Payable exactly on the 2026-09-11 due date.");
    assert.match(d.steps[1].detail, /due date is already a payable day/);
  });

  it("names it in the moved-date summary too", () => {
    const d = derivePaymentDate({ dueDate: "2026-09-12" }, { obligation: "discount-window" });
    assert.match(summarizePaymentDate(d), /discount deadline\.$/);
  });
});
