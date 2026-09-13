import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  paymentTermLabel,
  summarizePaymentTerm,
  explainPaymentTerm,
} from "../src/payment-term-summary.js";

describe("paymentTermLabel", () => {
  it("prefers the Payment Term's own name, with the grace suffix stripped", () => {
    assert.deepEqual(paymentTermLabel({ paymentTerm: "NET_30_DAYS (POSTAL) -3" }), {
      label: "NET_30_DAYS (POSTAL)",
      source: "name",
    });
  });

  it("derives Net N when no Payment Term is linked", () => {
    // Real case, not hypothetical: the sandbox's "NET 30 DAYS" template has a NULL payment_term
    // but real credit_days, so the period is knowable even though nobody named it.
    assert.deepEqual(paymentTermLabel({ creditDays: 30 }), { label: "Net 30", source: "derived" });
  });

  it("derives 'Due on receipt' for a genuine zero credit period", () => {
    assert.deepEqual(paymentTermLabel({ creditDays: 0 }), {
      label: "Due on receipt",
      source: "derived",
    });
  });

  it("derives months when the term is month-based", () => {
    assert.equal(paymentTermLabel({ creditMonths: 2 }).label, "Net 2 months");
    assert.equal(paymentTermLabel({ creditMonths: 1 }).label, "Net 1 month");
  });

  it("names a discount window when one is recorded", () => {
    assert.equal(
      paymentTermLabel({ creditDays: 30, discountValidity: 10, discountAmount: 90 }).label,
      "Discount to day 10, then Net 30",
    );
  });

  it("returns undefined rather than inventing a term — the A2 rule", () => {
    assert.equal(paymentTermLabel({}), undefined);
    assert.equal(paymentTermLabel(null), undefined);
    assert.equal(paymentTermLabel({ modeOfPayment: "ACH" }), undefined);
    // A bill with an outstanding balance but no term structure at all: today's whole sandbox.
    assert.equal(paymentTermLabel({ outstanding: 4500, dueDate: "2026-08-31" }), undefined);
  });

  it("does not treat an absent creditDays as zero", () => {
    // "Due on receipt" would be a fabricated claim here, not a safe default.
    assert.equal(paymentTermLabel({ creditMonths: 0 }), undefined);
  });
});

describe("summarizePaymentTerm", () => {
  it("carries label, grace, method and description together", () => {
    assert.deepEqual(
      summarizePaymentTerm({
        paymentTerm: "2%_10_NET_30 (ACH) +2",
        modeOfPayment: "ACH",
        termDescription: "2% if paid within 10 days",
      }),
      {
        label: "2%_10_NET_30 (ACH)",
        source: "name",
        graceDays: 2,
        method: "ACH",
        description: "2% if paid within 10 days",
      },
    );
  });

  it("omits graceDays when the name encodes none — absent stays absent", () => {
    const got = summarizePaymentTerm({ paymentTerm: "NET 45" });
    assert.equal("graceDays" in got, false);
    assert.equal(got.label, "NET 45");
  });

  it("keeps an explicit +0 as a real zero", () => {
    assert.equal(summarizePaymentTerm({ paymentTerm: "NET_30 (ACH) +0" }).graceDays, 0);
  });

  it("takes the method from mode_of_payment, not from the name's parenthetical", () => {
    // The "(POSTAL)" in a term name is decoration for humans. mode_of_payment is the SSoT, and if
    // the two ever disagree the field wins — parsing the name would create a second source.
    const got = summarizePaymentTerm({
      paymentTerm: "NET_30_DAYS (POSTAL) -3",
      modeOfPayment: "ACH",
    });
    assert.equal(got.method, "ACH");
  });

  it("summarises a method-only row (useful on the check drawer)", () => {
    assert.deepEqual(summarizePaymentTerm({ modeOfPayment: "DOM_WIRE" }), {
      label: "",
      source: "derived",
      method: "DOM_WIRE",
    });
  });

  it("returns undefined when the row carries no term structure at all", () => {
    assert.equal(summarizePaymentTerm({ outstanding: 4500 }), undefined);
    assert.equal(summarizePaymentTerm(null), undefined);
  });
});

describe("explainPaymentTerm", () => {
  it("explains a full term line by line", () => {
    const lines = explainPaymentTerm({
      paymentTerm: "NET_30_DAYS (POSTAL) -3",
      modeOfPayment: "USPS_Check",
      creditDays: 30,
      dueDateBasedOn: "Day(s) after invoice date",
      termDescription: "Net 30, cheque by post",
    });
    assert.deepEqual(lines, [
      "Term: NET_30_DAYS (POSTAL)",
      "Due date: 30 day(s) after invoice date",
      "Grace: must land 3 days before the due date",
      "Method: USPS_Check",
      "Vendor's wording: Net 30, cheque by post",
    ]);
  });

  it("says positive grace is still on time", () => {
    const lines = explainPaymentTerm({ paymentTerm: "NET_30 (ACH) +7", modeOfPayment: "ACH" });
    assert.equal(
      lines[1],
      "Grace: 7 days after the due date is still on time for this vendor",
    );
  });

  it("marks a derived label as derived, so nobody reads it as recorded truth", () => {
    const lines = explainPaymentTerm({ creditDays: 30 });
    assert.equal(lines[0], "Term: Net 30 (derived — no Payment Term recorded on this bill)");
  });

  it("reports partial payment and discount already taken", () => {
    const lines = explainPaymentTerm({
      paymentTerm: "NET_30 (ACH) +2",
      paidAmount: 2500,
      discountedAmount: 45,
    });
    assert.ok(lines.includes("Already paid: 2500"));
    assert.ok(lines.includes("Discount already taken: 45"));
  });

  it("stays silent about a zero grace, a zero paid amount and a zero discount", () => {
    const lines = explainPaymentTerm({
      paymentTerm: "NET_30 (ACH) +0",
      paidAmount: 0,
      discountedAmount: 0,
    });
    assert.deepEqual(lines, ["Term: NET_30 (ACH)"]);
  });

  it("returns an empty list when there is nothing to explain", () => {
    assert.deepEqual(explainPaymentTerm({ outstanding: 4500 }), []);
    assert.deepEqual(explainPaymentTerm(null), []);
  });

  it("returns separable lines, not a joined paragraph (B5 audit trail needs attribution)", () => {
    const lines = explainPaymentTerm({
      paymentTerm: "NET_30_DAYS (POSTAL) -3",
      modeOfPayment: "USPS_Check",
    });
    assert.ok(Array.isArray(lines));
    for (const line of lines) assert.equal(line.includes("\n"), false);
  });
});
