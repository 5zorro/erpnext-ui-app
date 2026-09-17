import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billAdvisories,
  vendorAdvisories,
  advisoryLevel,
} from "../src/payment-bill-advisories.js";

const ids = (list) => list.map((a) => a.id);

/** A completely well-formed bill: correct term name, matching credit period, method, no discount. */
function cleanBill(over = {}) {
  return {
    installmentKey: "PI-1",
    supplier: "Vendor A",
    postingDate: "2026-08-08",
    dueDate: "2026-09-07",
    outstanding: 5000,
    invoiced: 5000,
    paymentTerm: "NET_30_DAYS (ACH) +0",
    modeOfPayment: "ACH",
    creditDays: 30,
    dueDateBasedOn: "Day(s) after invoice date",
    ...over,
  };
}

// 🔴 A chip on every row is a chip on no rows. Correct data must produce complete silence.
describe("billAdvisories: silence on correct data", () => {
  it("says nothing at all about a well-formed bill", () => {
    assert.deepEqual(billAdvisories(cleanBill()), []);
  });

  it("says nothing about a term that legitimately states no grace", () => {
    // posting 2026-08-08 + 45 = 2026-09-22, so the term and the stored due date agree.
    const b = cleanBill({ paymentTerm: "NET 45", creditDays: 45, dueDate: "2026-09-22" });
    assert.deepEqual(billAdvisories(b), []);
  });

  it("says nothing about a live discount window", () => {
    const b = cleanBill({ discountDate: "2026-09-20", discountAmount: 100 });
    assert.deepEqual(billAdvisories(b, { today: "2026-09-11" }), []);
  });

  it("says nothing about a discount date when no clock was supplied", () => {
    const b = cleanBill({ discountDate: "2020-01-01", discountAmount: 100 });
    assert.deepEqual(billAdvisories(b), [], "a pure module must not invent a today");
  });
});

describe("billAdvisories: what it does flag", () => {
  it("flags a bill with no terms at all as info, not a fault", () => {
    const a = billAdvisories({ dueDate: "2026-09-07", modeOfPayment: "ACH" });
    assert.deepEqual(ids(a), ["no-term"]);
    assert.equal(a[0].level, "info");
  });

  it("flags a missing method and says the cheque price is an assumption", () => {
    const a = billAdvisories(cleanBill({ modeOfPayment: undefined }), {
      prefs: { postage: 0.78, perCheck: 0.05 },
    });
    assert.deepEqual(ids(a), ["no-method"]);
    assert.match(a[0].body, /\$0\.83/);
    assert.match(a[0].body, /assumption, not a fact/);
  });

  it("flags a malformed term name and carries the proposed fix", () => {
    const a = billAdvisories(cleanBill({ paymentTerm: "NET_30_DAYS -3 (POSTAL)", creditDays: 27 }));
    assert.ok(ids(a).includes("term-name-malformed"));
    const chip = a.find((x) => x.id === "term-name-malformed");
    assert.equal(chip.level, "warn");
    assert.match(chip.body, /NET_30_DAYS \(POSTAL\) -3/);
    // Post-reversal the engine is unaffected -- the chip must not overstate the damage.
    assert.match(chip.body, /payment date is unaffected/);
  });

  it("flags a name that disagrees with its own credit period", () => {
    const a = billAdvisories(cleanBill({ paymentTerm: "NET_30_DAYS (ACH) +16", creditDays: 30 }));
    const chip = a.find((x) => x.id === "term-arithmetic");
    assert.ok(chip);
    assert.match(chip.body, /46/);
    assert.match(chip.body, /never by renaming this one/);
  });

  it("flags a due date the term does not justify", () => {
    const a = billAdvisories(cleanBill({ dueDate: "2026-08-18" }));
    const chip = a.find((x) => x.id === "due-date-overrides-terms");
    assert.ok(chip);
    assert.equal(chip.level, "warn");
    assert.equal(chip.title, "DUE DATE OVERRIDING TERMS");
    assert.match(chip.body, /2026-09-07/);
  });

  it("flags an expired discount window once a clock is supplied", () => {
    const b = cleanBill({ discountDate: "2026-08-18", discountAmount: 120 });
    const a = billAdvisories(b, { today: "2026-09-11" });
    assert.deepEqual(ids(a), ["discount-expired"]);
    assert.equal(a[0].level, "info");
    assert.match(a[0].body, /\$120\.00/);
  });

  it("reports several at once without collapsing them", () => {
    const a = billAdvisories(
      { dueDate: "2026-09-12", supplier: "V", postingDate: "2026-08-08" },
      { today: "2026-09-11" },
    );
    assert.deepEqual(ids(a).sort(), ["no-method", "no-term"]);
  });

  it("survives junk rather than throwing — it renders on a dashboard", () => {
    for (const bad of [null, undefined, {}, { dueDate: "nope" }]) {
      assert.ok(Array.isArray(billAdvisories(bad)));
    }
  });
});

describe("vendorAdvisories: the mixed-method case", () => {
  // 🔴 The flagship. True today, invisible today, and it reads as the engine failing to find a
  // saving. It is info, not warn: the engine is right.
  it("explains that different rails cannot batch together", () => {
    const a = vendorAdvisories([
      cleanBill({ modeOfPayment: "ACH" }),
      cleanBill({ modeOfPayment: "DOM_WIRE" }),
    ]);
    assert.deepEqual(ids(a), ["mixed-methods"]);
    assert.equal(a[0].level, "info");
    assert.match(a[0].body, /ACH, Wire/);
    assert.match(a[0].body, /one mode of payment/);
    assert.match(a[0].body, /per schedule row, not per vendor/);
  });

  it("counts an unrecorded method as its own rail, because it is one", () => {
    const a = vendorAdvisories([cleanBill({ modeOfPayment: "ACH" }), cleanBill({ modeOfPayment: undefined })]);
    assert.deepEqual(ids(a), ["mixed-methods"]);
    assert.match(a[0].body, /No method/);
  });

  it("stays silent when every bill is on the same rail", () => {
    assert.deepEqual(vendorAdvisories([cleanBill(), cleanBill(), cleanBill()]), []);
  });

  it("stays silent for a single bill, and for none", () => {
    assert.deepEqual(vendorAdvisories([cleanBill()]), []);
    assert.deepEqual(vendorAdvisories([]), []);
    assert.deepEqual(vendorAdvisories(null), []);
  });
});

describe("advisoryLevel", () => {
  it("reports the worst level present", () => {
    assert.equal(advisoryLevel([{ level: "info" }, { level: "warn" }]), "warn");
    assert.equal(advisoryLevel([{ level: "info" }]), "info");
    assert.equal(advisoryLevel([]), "");
    assert.equal(advisoryLevel(null), "");
  });
});
