import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MEMO_MAX_CHARS,
  isChequeMode,
  proposeModeOfPayment,
  proposePaidFrom,
  proposeReferenceNo,
  referenceNoInUse,
  shortCompanyName,
  paymentMemo,
  proposeMemo,
  proposePaymentEntryDefaults,
} from "../src/payment-entry-defaults.js";

// The sandbox as read on 2026-09-14: no electronic method has a default account for the main
// company, no numeric reference exists yet, and two suppliers carry customer numbers.
const SANDBOX = {
  company: "HECSANDBOX INCORPORATED",
  companyName: "HECSANDBOX INCORPORATED",
  abbr: "HI",
  modes: [
    { name: "ACH", type: "Bank", enabled: 1, accounts: [] },
    { name: "Check", type: "Bank", enabled: 1, accounts: [{ company: "HECSANDBOX INCORPORATED (Demo)", default_account: "Demo Bank Account - HID" }] },
    { name: "Cash", type: "Cash", enabled: 1, accounts: [{ company: "HECSANDBOX INCORPORATED", default_account: "Cash - HI" }] },
    { name: "DOM_WIRE", type: "Bank", enabled: 1, accounts: [] },
    { name: "USPS_Check", type: "Bank", enabled: 1, accounts: [] },
    { name: "Old Mode", type: "Bank", enabled: 0, accounts: [] },
  ],
  history: [
    { name: "ACC-PAY-2026-00003", party: "SAMPLE Vendor 03", mode_of_payment: "ACH", paid_from: "Cash - HI", reference_no: "Batch of 3", docstatus: 1, creation: "2026-09-14 23:19:28" },
    { name: "ACC-PAY-2026-00002", party: "SAMPLE Vendor 01", mode_of_payment: "ACH", paid_from: "Cash - HI", reference_no: "Batch of 2", docstatus: 1, creation: "2026-09-12 00:32:31.7" },
    { name: "ACC-PAY-2026-00001", party: "SAMPLE Vendor 01", mode_of_payment: "DOM_WIRE", paid_from: "Cash - HI", reference_no: "writepath-verify-2", docstatus: 0, creation: "2026-09-12 00:32:31.4" },
  ],
  customerNumbers: [{ company: "HECSANDBOX INCORPORATED", customer_number: "CUST-44192" }],
};

describe("payment-entry defaults: the sandbox, end to end", () => {
  it("fills all four fields for an ACH vendor, and says where each came from", () => {
    const d = proposePaymentEntryDefaults(SANDBOX, { supplier: "SAMPLE Vendor 01", termsMethod: "ACH" });
    assert.deepEqual(
      [d.modeOfPayment.value, d.paidFrom.value, d.referenceNo.value, d.memo.value],
      ["ACH", "Cash - HI", "ACH-000001", "HI CUST-44192"],
    );
    assert.equal(d.modeOfPayment.source, "terms");
    assert.equal(d.paidFrom.source, "last-mode", "ACH has no default account, so the last ACH account");
    assert.match(d.paidFrom.note, /last used with ACH \(ACC-PAY-2026-00003\)/);
    assert.equal(d.referenceNo.source, "first-electronic", '"Batch of 3" is not a reference sequence');
  });
});

describe("payment-entry defaults: Mode of Payment", () => {
  it("takes the method on the payment terms first", () => {
    const p = proposeModeOfPayment(SANDBOX, { supplier: "SAMPLE Vendor 01", termsMethod: "USPS_Check" });
    assert.deepEqual([p.value, p.source], ["USPS_Check", "terms"]);
  });

  it("falls back to this vendor's last method when the terms name no usable method", () => {
    const p = proposeModeOfPayment(SANDBOX, { supplier: "SAMPLE Vendor 01", termsMethod: "Old Mode" });
    assert.deepEqual([p.value, p.source], ["ACH", "last-supplier"], "00002 is newer than 00001");
    assert.match(p.note, /the terms say Old Mode, which is not an enabled Mode of Payment/);
  });

  it("then the last method used by anyone", () => {
    const p = proposeModeOfPayment(SANDBOX, { supplier: "SAMPLE Vendor 99" });
    assert.deepEqual([p.value, p.source], ["ACH", "last-any"]);
    assert.match(p.note, /ACC-PAY-2026-00003/);
  });

  it("proposes nothing from nothing", () => {
    assert.deepEqual(proposeModeOfPayment({}, {}), { value: "", source: "", note: "" });
    assert.deepEqual(proposeModeOfPayment(null), { value: "", source: "", note: "" });
  });

  it("trusts the terms when the method list could not be read", () => {
    const p = proposeModeOfPayment({ history: [] }, { termsMethod: "ACH" });
    assert.deepEqual([p.value, p.source], ["ACH", "terms"]);
  });
});

describe("payment-entry defaults: Pay from account", () => {
  it("uses the method's own default account for this company, as Vanilla does", () => {
    const p = proposePaidFrom(SANDBOX, { mode: "Cash" });
    assert.deepEqual([p.value, p.source], ["Cash - HI", "mode-default"]);
  });

  it("ignores another company's default account", () => {
    const p = proposePaidFrom(SANDBOX, { mode: "Check" });
    assert.notEqual(p.value, "Demo Bank Account - HID");
    assert.equal(p.source, "last-any", "no Check history either, so the last account at all");
  });

  it("proposes nothing with no default and no history", () => {
    assert.deepEqual(proposePaidFrom({ modes: SANDBOX.modes, company: SANDBOX.company }, { mode: "ACH" }).value, "");
  });
});

describe("payment-entry defaults: check numbers", () => {
  const chase = (reference_no, extra = {}) => ({
    name: `PE-${reference_no}`, mode_of_payment: "Check", paid_from: "Chase - HI", reference_no, docstatus: 1, ...extra,
  });
  const facts = {
    history: [
      chase("10231"),
      chase("10240", { docstatus: 2 }), // cancelled: a voided check still used its number
      chase("10235", { mode_of_payment: "USPS_Check", docstatus: 0 }),
      chase("50000", { paid_from: "Other Bank - HI" }), // another account's cheque stock
      chase("Batch of 3"),
    ],
  };

  it("counts up from the highest number used on this bank account, voided checks included", () => {
    const p = proposeReferenceNo(facts, { mode: "Check", paidFrom: "Chase - HI" });
    assert.deepEqual([p.value, p.source], ["10241", "next-cheque"]);
    assert.match(p.note, /after 10240 \(PE-10240\)/);
  });

  it("keeps each account's check stock separate", () => {
    assert.equal(proposeReferenceNo(facts, { mode: "USPS_Check", paidFrom: "Other Bank - HI" }).value, "50001");
  });

  it("keeps zero padding", () => {
    const p = proposeReferenceNo({ history: [chase("000999")] }, { mode: "Check", paidFrom: "Chase - HI" });
    assert.equal(p.value, "001000");
  });

  // 🔴 Nothing can know where a cheque stock starts; a guessed number would print a wrong check.
  it("asks for the first number rather than inventing one", () => {
    const p = proposeReferenceNo({ history: [chase("Batch of 3")] }, { mode: "Check", paidFrom: "Chase - HI" });
    assert.deepEqual([p.value, p.source], ["", "needs-first"]);
    assert.match(p.note, /type the first one/);
  });

  it("waits for an account before numbering a check", () => {
    assert.deepEqual(proposeReferenceNo(facts, { mode: "Check" }), { value: "", source: "", note: "" });
  });

  it("recognises cheque rails by name", () => {
    for (const m of ["Check", "Cheque", "USPS_Check"]) assert.equal(isChequeMode(m), true, m);
    for (const m of ["ACH", "DOM_WIRE", "Cash", ""]) assert.equal(isChequeMode(m), false, m);
  });
});

describe("payment-entry defaults: electronic references", () => {
  const facts = {
    history: [
      { name: "PE-1", mode_of_payment: "ACH", reference_no: "ACH-000123" },
      { name: "PE-2", mode_of_payment: "ACH", reference_no: "ACH-000120" },
      { name: "PE-3", mode_of_payment: "DOM_WIRE", reference_no: "DOM_WIRE-000500" },
      { name: "PE-4", mode_of_payment: "ACH", reference_no: "Batch of 2" },
    ],
  };

  it("counts up per method", () => {
    assert.equal(proposeReferenceNo(facts, { mode: "ACH" }).value, "ACH-000124");
    assert.equal(proposeReferenceNo(facts, { mode: "DOM_WIRE" }).value, "DOM_WIRE-000501");
  });

  it("starts a method with no references at 000001", () => {
    const p = proposeReferenceNo(facts, { mode: "INT_WIRE" });
    assert.deepEqual([p.value, p.source], ["INT_WIRE-000001", "first-electronic"]);
  });

  it("notices a reference already used on the same rail", () => {
    assert.equal(referenceNoInUse(facts, "ACH-000123", { mode: "ACH" }).name, "PE-1");
    assert.equal(referenceNoInUse(facts, "ACH-000123", { mode: "DOM_WIRE" }), null);
    assert.equal(referenceNoInUse(facts, "ACH-000123", { mode: "ACH", currentName: "PE-1" }), null);
    assert.equal(referenceNoInUse(facts, "", { mode: "ACH" }), null);
  });

  it("scopes a duplicate cheque number to its bank account", () => {
    const cheques = { history: [{ name: "PE-9", mode_of_payment: "Check", paid_from: "Chase - HI", reference_no: "10231" }] };
    assert.equal(referenceNoInUse(cheques, "10231", { mode: "Check", paidFrom: "Chase - HI" }).name, "PE-9");
    assert.equal(referenceNoInUse(cheques, "10231", { mode: "Check", paidFrom: "Other - HI" }), null);
  });
});

describe("payment-entry defaults: memo", () => {
  it("abbreviates only the legal suffix", () => {
    assert.equal(shortCompanyName("ABC Company"), "ABC Co");
    assert.equal(shortCompanyName("HECSANDBOX INCORPORATED"), "HECSANDBOX Inc");
    assert.equal(shortCompanyName("Acme Corporation"), "Acme Corp");
    assert.equal(shortCompanyName("Widgets Limited Liability Company"), "Widgets LLC");
    assert.equal(shortCompanyName("Foo Limited."), "Foo Ltd");
    assert.equal(shortCompanyName("Plain Name"), "Plain Name");
  });

  it("reads like 5zorro's example", () => {
    assert.equal(paymentMemo({ companyName: "ABC Company", customerNumber: "1234" }), "ABC Co Cust#1234");
  });

  it("does not label a number that labels itself", () => {
    assert.equal(paymentMemo({ companyName: "ABC Company", customerNumber: "ACCT-998877" }), "ABC Co ACCT-998877");
  });

  // The customer number is what the vendor applies the payment by, so it is what survives.
  it("uses the abbreviation before cutting anything when the name does not fit", () => {
    assert.equal(paymentMemo({ companyName: "HECSANDBOX INCORPORATED", abbr: "HI", customerNumber: "CUST-44192" }), "HI CUST-44192");
  });

  it("is never longer than the ACH discretionary data field", () => {
    const cases = [
      { companyName: "An Extremely Long Company Name Incorporated", abbr: "AELCNI", customerNumber: "12345678901234567890123" },
      { companyName: "An Extremely Long Company Name Incorporated" },
      { companyName: "ABC Company", customerNumber: "1234" },
    ];
    for (const c of cases) assert.ok(paymentMemo(c).length <= MEMO_MAX_CHARS, JSON.stringify(c));
    assert.equal(MEMO_MAX_CHARS, 20);
  });

  it("is just the company when the vendor has no customer number", () => {
    assert.equal(paymentMemo({ companyName: "ABC Company" }), "ABC Co");
  });

  it("uses this company's customer number, and says how to add a missing one", () => {
    const withNumber = proposeMemo(SANDBOX, { supplier: "SAMPLE Vendor 01" });
    assert.deepEqual([withNumber.value, withNumber.source], ["HI CUST-44192", "customer-number"]);

    const otherCompany = proposeMemo(
      { ...SANDBOX, customerNumbers: [{ company: "Someone Else", customer_number: "X-1" }] },
      { supplier: "SAMPLE Vendor 01" },
    );
    assert.deepEqual([otherCompany.value, otherCompany.source], ["HECSANDBOX Inc", "company-only"]);
    assert.match(otherCompany.note, /add one there/);
  });

  it("proposes no memo before there is a payee", () => {
    assert.equal(proposeMemo(SANDBOX, {}).value, "");
  });
});

describe("payment-entry defaults: what the clerk already chose wins", () => {
  it("proposes the account and number for the method the clerk picked, not the terms'", () => {
    const facts = {
      ...SANDBOX,
      history: [
        ...SANDBOX.history,
        { name: "PE-C", party: "X", mode_of_payment: "Check", paid_from: "Chase - HI", reference_no: "10231", creation: "2026-09-01" },
      ],
    };
    const d = proposePaymentEntryDefaults(facts, { supplier: "SAMPLE Vendor 01", termsMethod: "ACH", mode: "Check", paidFrom: "Chase - HI" });
    assert.equal(d.referenceNo.value, "10232");
  });
});
