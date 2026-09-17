import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  paymentTermName,
  planPaymentTermCreate,
  planPaymentTermsCreate,
  AFFECTS_COPY,
  DAY_BASED_DUE_DATE_BASES,
} from "../src/payment-term-plan.js";
import { SAMPLE_PAYMENT_TERMS } from "../src/sample-data/corpus-plan.js";
import { classifyPaymentTermName, checkTermNameArithmetic } from "../src/payment-term-name-health.js";
import { parsePaymentTermGrace } from "../src/payment-term-grace.js";

/** The seeded corpus is the proven shape. A generator that cannot reproduce it is not the same convention. */
describe("paymentTermName: reproduces every A5 fixture from its own numbers", () => {
  for (const t of SAMPLE_PAYMENT_TERMS) {
    it(`rebuilds ${t.name}`, () => {
      const grace = parsePaymentTermGrace(t.name) ?? 0;
      const contractDays = t.creditDays - grace;
      assert.equal(
        paymentTermName({
          contractDays,
          graceDays: grace,
          method: t.modeOfPayment,
          dueDateBasedOn: t.dueDateBasedOn,
          discount: t.discount,
          discountType: t.discountType,
          discountValidity: t.discountValidity,
        }),
        t.name,
      );
    });
  }
});

describe("paymentTermName: the convention itself", () => {
  it("puts grace last, after the method, always signed", () => {
    assert.equal(
      paymentTermName({ contractDays: 30, graceDays: -3, method: "USPS_Check" }),
      "NET_30_DAYS (POSTAL) -3",
    );
    assert.equal(paymentTermName({ contractDays: 15, graceDays: 0, method: "DOM_WIRE" }), "NET_15_DAYS (DOM_WIRE) +0");
  });

  it("writes POSTAL for USPS_Check — the token is not always the Link value", () => {
    assert.match(paymentTermName({ contractDays: 30, graceDays: 0, method: "USPS_Check" }), /\(POSTAL\)/);
  });

  it("omits the method parenthetical entirely when there is no method", () => {
    assert.equal(paymentTermName({ contractDays: 45, graceDays: 0 }), "NET_45_DAYS +0");
  });

  // Whatever it emits must survive the real parser and the real classifier, or the tool is
  // manufacturing exactly the malformed names C7 exists to complain about.
  it("every generated name parses cleanly and classifies as parsed", () => {
    for (const contractDays of [0, 10, 30, 45, 90]) {
      for (const graceDays of [-5, -1, 0, 2, 16]) {
        for (const method of [undefined, "USPS_Check", "ACH", "DOM_WIRE", "INT_WIRE"]) {
          for (const discount of [undefined, 2]) {
            const name = paymentTermName({ contractDays, graceDays, method, discount, discountValidity: 10 });
            assert.equal(parsePaymentTermGrace(name), graceDays, name);
            assert.equal(classifyPaymentTermName(name).state, "parsed", name);
          }
        }
      }
    }
  });

  it("the name it emits agrees with the credit_days it plans", () => {
    for (const [contractDays, graceDays] of [[30, 16], [30, -3], [15, 0], [10, 5]]) {
      const plan = planPaymentTermCreate({ contractDays, graceDays, method: "ACH" });
      const check = checkTermNameArithmetic({ paymentTerm: plan.name, creditDays: plan.creditDays });
      assert.equal(check.state, "agree", `${plan.name} vs ${plan.creditDays}: ${check.reason}`);
    }
  });
});

describe("planPaymentTermCreate: the two documents", () => {
  const plan = planPaymentTermCreate({
    contractDays: 30,
    graceDays: 16,
    method: "USPS_Check",
    dueDateBasedOn: "Day(s) after invoice date",
  });

  it("folds grace into credit_days rather than leaving it in the name only", () => {
    assert.equal(plan.creditDays, 46);
    assert.equal(plan.term.credit_days, 46);
    assert.equal(plan.name, "NET_30_DAYS (POSTAL) +16");
  });

  it("names the template after the term, so a Supplier can link it", () => {
    assert.equal(plan.template.template_name, plan.name);
    assert.equal(plan.template.terms[0].payment_term, plan.name);
  });

  // The non-obvious half of A5: get_payment_terms reads the TEMPLATE DETAIL, and the detail's
  // fetch_from only fires client-side. A row that leans on fetch_from reaches a server-made bill empty.
  it("copies every field onto the template detail row, not just onto the master", () => {
    for (const [k, v] of Object.entries(plan.fields)) {
      assert.deepEqual(plan.template.terms[0][k], v, `template detail is missing ${k}`);
      assert.deepEqual(plan.term[k], v, `master is missing ${k}`);
    }
  });

  it("sets mode_of_payment to match the (METHOD) it wrote into the name", () => {
    assert.equal(plan.term.mode_of_payment, "USPS_Check");
    assert.match(plan.name, /\(POSTAL\)/);
  });

  it("carries a discount quartet only when there is a discount", () => {
    assert.equal("discount" in plan.fields, false);
    const d = planPaymentTermCreate({ contractDays: 30, graceDays: 2, method: "ACH", discount: 2, discountValidity: 10 });
    assert.equal(d.name, "2%_10_NET_30 (ACH) +2");
    assert.equal(d.fields.discount, 2);
    assert.equal(d.fields.discount_type, "Percentage");
    assert.equal(d.fields.discount_validity, 10);
    assert.equal(d.fields.discount_validity_based_on, "Day(s) after invoice date");
  });
});

describe("planPaymentTermCreate: what it refuses", () => {
  it("refuses a month-based term rather than approximating the grace fold", () => {
    const p = planPaymentTermCreate({
      contractDays: 1,
      graceDays: 5,
      dueDateBasedOn: "Month(s) after the end of the invoice month",
    });
    assert.equal(p.ok, false);
    assert.match(p.errors.join(" "), /cannot fold into a month count/);
  });

  it("refuses a grace that pulls the term before the invoice", () => {
    const p = planPaymentTermCreate({ contractDays: 10, graceDays: -40 });
    assert.equal(p.ok, false);
    assert.match(p.errors.join(" "), /-30-day term/);
  });

  it("refuses a negative credit period", () => {
    assert.equal(planPaymentTermCreate({ contractDays: -5 }).ok, false);
  });

  it("refuses a non-numeric credit period", () => {
    assert.equal(planPaymentTermCreate({ contractDays: "soon" }).ok, false);
  });

  // Ahead of unique:1's traceback, which is what the clerk would otherwise be shown.
  it("explains a name collision in words before the DB does it in a stack trace", () => {
    const p = planPaymentTermCreate(
      { contractDays: 30, graceDays: -3, method: "USPS_Check" },
      { existingNames: ["NET_30_DAYS (POSTAL) -3", "NET 45"] },
    );
    assert.equal(p.ok, false);
    assert.match(p.errors.join(" "), /already exists/);
    assert.doesNotMatch(p.errors.join(" "), /Traceback|DuplicateEntry/);
  });

  it("does not collide with a term that differs only in grace", () => {
    const p = planPaymentTermCreate(
      { contractDays: 30, graceDays: 2, method: "USPS_Check" },
      { existingNames: ["NET_30_DAYS (POSTAL) -3"] },
    );
    assert.equal(p.ok, true);
  });
});

describe("planPaymentTermCreate: what it says out loud", () => {
  // 🔴 The distinction this modal must not blur — a "create term" button on a dashboard full of
  // bills reads exactly like a fix for those bills, and it is not one.
  it("always states that it changes nothing about the bills already on screen", () => {
    const p = planPaymentTermCreate({ contractDays: 30, graceDays: 0, method: "ACH" });
    assert.equal(p.affects, AFFECTS_COPY);
    assert.match(p.affects, /changes nothing on the bills already/);
    assert.match(p.affects, /cancelling and amending/);
  });

  // 🔴 allow_rename:1 rewrites payment_schedule.payment_term on every historical bill.
  it("always warns against renaming, and offers no rename path", () => {
    const p = planPaymentTermCreate({ contractDays: 30, graceDays: 0, method: "ACH" });
    assert.match(p.warnings.join(" "), /Renaming a Payment Term rewrites it on every historical bill/);
  });

  it("warns that positive grace means paying after the contractual due date", () => {
    const p = planPaymentTermCreate({ contractDays: 30, graceDays: 16, method: "USPS_Check" });
    assert.match(p.warnings.join(" "), /46-day due date/);
  });

  it("warns when no method is chosen, because the engine then prices it as a cheque", () => {
    assert.match(planPaymentTermCreate({ contractDays: 30 }).warnings.join(" "), /costed as cheques/);
  });

  it("warnings never block", () => {
    const p = planPaymentTermCreate({ contractDays: 30, graceDays: 16, method: "USPS_Check" });
    assert.ok(p.warnings.length >= 2);
    assert.equal(p.ok, true);
  });

  it("writes a description a human would recognise when none is given", () => {
    const p = planPaymentTermCreate({ contractDays: 30, graceDays: -3, method: "USPS_Check" });
    assert.match(String(p.fields.description), /Net 30 from invoice date/);
    assert.match(String(p.fields.description), /cheque by post/);
    assert.match(String(p.fields.description), /27-day credit period/);
  });

  it("keeps a description the clerk actually typed", () => {
    const p = planPaymentTermCreate({ contractDays: 30, description: "Per the 2024 MSA, §7." });
    assert.equal(p.fields.description, "Per the 2024 MSA, §7.");
  });

  it("exposes the day-based bases it accepts", () => {
    assert.deepEqual(DAY_BASED_DUE_DATE_BASES, [
      "Day(s) after invoice date",
      "Day(s) after the end of the invoice month",
    ]);
  });
});

describe("payment-term-plan: installments (P4e)", () => {
  const thirds = {
    method: "ACH",
    installments: [
      { contractDays: 30, portion: 33.33 },
      { contractDays: 60, portion: 33.33 },
      { contractDays: 90, portion: 33.34 },
    ],
  };

  it("builds one template with a row per payment, each pointing at its own term", () => {
    const plan = planPaymentTermsCreate(thirds);
    assert.equal(plan.ok, true);
    assert.equal(plan.templateName, "3_PAYMENTS_30_60_90 (ACH)");
    assert.equal(plan.terms.length, 3);
    assert.deepEqual(
      plan.template.terms.map((r) => [r.payment_term, r.invoice_portion, r.credit_days]),
      [
        ["NET_30_DAYS (ACH) +0", 33.33, 30],
        ["NET_60_DAYS (ACH) +0", 33.33, 60],
        ["NET_90_DAYS (ACH) +0", 33.34, 90],
      ],
    );
    // Every row carries its own explicit copy of the fields, because get_payment_terms reads the
    // detail row and its fetch_from is client-side only.
    for (const row of plan.template.terms) assert.equal(row.mode_of_payment, "ACH");
  });

  // validate_invoice_portion: "Combined invoice portion must equal 100%", raise_exception=1.
  it("refuses portions that do not total exactly 100, and says what they total", () => {
    const plan = planPaymentTermsCreate({
      method: "ACH",
      installments: [
        { contractDays: 30, portion: 50 },
        { contractDays: 60, portion: 49 },
      ],
    });
    assert.equal(plan.ok, false);
    assert.match(plan.errors.join(" "), /99% of the invoice, not 100%/);
  });

  it("accepts thirds that only total 100 because the last one absorbs the cent", () => {
    assert.equal(planPaymentTermsCreate(thirds).ok, true);
    assert.equal(
      planPaymentTermsCreate({
        method: "ACH",
        installments: [
          { contractDays: 30, portion: 33.33 },
          { contractDays: 60, portion: 33.33 },
          { contractDays: 90, portion: 33.33 },
        ],
      }).ok,
      false,
      "99.99 is not 100 — ERPNext rounds to 2dp and refuses",
    );
  });

  // validate_terms: the (payment_term, credit_days, credit_months, due_date_based_on) tuple.
  it("refuses two installments that are the same term", () => {
    const plan = planPaymentTermsCreate({
      method: "ACH",
      installments: [
        { contractDays: 30, portion: 50 },
        { contractDays: 30, portion: 50 },
      ],
    });
    assert.equal(plan.ok, false);
    assert.match(plan.errors.join(" "), /Payments 1 and 2 are the same term/);
  });

  it("numbers a row's own error so the clerk knows which payment is wrong", () => {
    const plan = planPaymentTermsCreate({
      method: "ACH",
      installments: [
        { contractDays: 30, portion: 50 },
        { contractDays: -5, portion: 50 },
      ],
    });
    assert.equal(plan.ok, false);
    assert.match(plan.errors.join(" "), /Payment 2: A credit period cannot be negative/);
  });

  it("one installment is the old single-term plan, unchanged", () => {
    const single = planPaymentTermsCreate({ contractDays: 30, method: "ACH" });
    const legacy = planPaymentTermCreate({ contractDays: 30, method: "ACH" });
    assert.equal(single.ok, true);
    assert.equal(single.templateName, legacy.name, "the template still takes the term's own name");
    assert.equal(single.terms.length, 1);
    assert.deepEqual(single.terms[0], legacy.term);
    assert.deepEqual(single.template.terms, legacy.template.terms);
    // No error for a portion nobody typed: one payment is the whole invoice.
    assert.equal(single.template.terms[0].invoice_portion, 100);
  });

  it("does not let a collision be discovered by the database", () => {
    const plan = planPaymentTermsCreate(thirds, { existingTemplateNames: ["3_PAYMENTS_30_60_90 (ACH)"] });
    assert.equal(plan.ok, false);
    assert.match(plan.errors.join(" "), /already exists/);
  });

  it("keeps the never-rename warning once, not once per row", () => {
    const plan = planPaymentTermsCreate(thirds);
    const renames = plan.warnings.filter((w) => /Renaming a Payment Term/.test(w));
    assert.equal(renames.length, 1);
  });
});
