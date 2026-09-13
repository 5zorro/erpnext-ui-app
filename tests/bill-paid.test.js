import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultPaidAmountForIsPaid,
  isPaidToggleWrites,
  isPaidChecked,
  DEFAULT_CREDIT_CARD_MODE_OF_PAYMENT,
  isBillPaidErpField,
  captureAlreadyPaidIntent,
  clearIsPaidForJitPeWrites,
  listJitPaymentEntryBlockers,
  projectBillPaymentRows,
  billDocStatusBadge,
  billCanAddPayment,
} from "../src/bill-paid.js";

describe("bill-paid (OI-135 draft is_paid → JIT PE)", () => {
  it("defaults paid amount from Amount Due then grand_total", () => {
    assert.equal(defaultPaidAmountForIsPaid({ grand_total: 40 }, "42.5"), 42.5);
    assert.equal(defaultPaidAmountForIsPaid({ rounded_total: 99, grand_total: 40 }, ""), 99);
    assert.equal(defaultPaidAmountForIsPaid({ grand_total: 40 }, ""), 40);
  });

  it("check writes is_paid, Credit Card MoP when empty, and paid_amount", () => {
    const writes = isPaidToggleWrites(
      { grand_total: 50, paid_amount: 0, mode_of_payment: "" },
      true,
      { amountDue: "50" },
    );
    assert.deepEqual(writes[0], { field: "is_paid", value: 1 });
    assert.deepEqual(writes[1], {
      field: "mode_of_payment",
      value: DEFAULT_CREDIT_CARD_MODE_OF_PAYMENT,
    });
    assert.deepEqual(writes[2], { field: "paid_amount", value: 50 });
  });

  it("uncheck clears is_paid and paid_amount", () => {
    assert.deepEqual(isPaidToggleWrites({ is_paid: 1, paid_amount: 50 }, false), [
      { field: "is_paid", value: 0 },
      { field: "paid_amount", value: 0 },
    ]);
  });

  it("does not overwrite existing MoP or paid_amount on check", () => {
    const writes = isPaidToggleWrites(
      { mode_of_payment: "Check", paid_amount: 12, grand_total: 50 },
      true,
    );
    assert.deepEqual(writes, [{ field: "is_paid", value: 1 }]);
  });

  it("isPaidChecked / field allowlist", () => {
    assert.equal(isPaidChecked(1), true);
    assert.equal(isPaidChecked(0), false);
    assert.equal(isBillPaidErpField("cash_bank_account"), true);
    assert.equal(isBillPaidErpField("supplier"), false);
  });

  it("captures intent only when is_paid", () => {
    assert.equal(captureAlreadyPaidIntent({ is_paid: 0, paid_amount: 10 }), null);
    assert.deepEqual(
      captureAlreadyPaidIntent({
        is_paid: 1,
        mode_of_payment: "Credit Card",
        cash_bank_account: "CC - HI",
        paid_amount: 42.5,
      }),
      {
        modeOfPayment: "Credit Card",
        cashBankAccount: "CC - HI",
        paidAmount: 42.5,
      },
    );
  });

  it("clearIsPaidForJitPeWrites zeros is_paid + paid_amount", () => {
    assert.deepEqual(clearIsPaidForJitPeWrites(), [
      { field: "is_paid", value: 0 },
      { field: "paid_amount", value: 0 },
    ]);
  });

  it("JIT PE blockers require cash bank and paid amount", () => {
    assert.deepEqual(listJitPaymentEntryBlockers(null), []);
    assert.match(listJitPaymentEntryBlockers({ paidAmount: 0, cashBankAccount: "" })[0], /Paid Amount/);
    assert.match(
      listJitPaymentEntryBlockers({ paidAmount: 10, cashBankAccount: "" })[0],
      /Cash \/ Bank/,
    );
    assert.deepEqual(
      listJitPaymentEntryBlockers({ paidAmount: 10, cashBankAccount: "Bank", modeOfPayment: "" }),
      [],
    );
  });

  it("projects payment table rows", () => {
    const rows = projectBillPaymentRows([
      {
        name: "PE-1",
        posting_date: "2026-08-25",
        mode_of_payment: "Credit Card",
        allocated_amount: 10,
        paid_amount: 10,
        status: "Submitted",
        docstatus: 1,
      },
    ]);
    assert.equal(rows[0].paymentEntry, "PE-1");
    assert.equal(rows[0].allocatedAmount, 10);
  });

  it("billDocStatusBadge maps Paid / Draft / Submitted", () => {
    assert.equal(billDocStatusBadge({ docstatus: 0, name: "new-pi-1" }).tone, "draft");
    assert.equal(billDocStatusBadge({ docstatus: 1, status: "Paid" }).tone, "paid");
    assert.equal(billDocStatusBadge({ docstatus: 1, status: "Paid" }).label, "Paid");
    assert.equal(
      billDocStatusBadge({ docstatus: 1, status: "Partly Paid" }).tone,
      "partial",
    );
    assert.equal(
      billDocStatusBadge({ docstatus: 1, outstanding_amount: 0, status: "" }).tone,
      "paid",
    );
    assert.equal(billDocStatusBadge({ docstatus: 2 }).label, "Cancelled");
  });

  it("billDocStatusBadge relabels a credit memo (is_return) as Vendor Credit — OI-082", () => {
    const b = billDocStatusBadge({ docstatus: 1, is_return: 1, status: "Return" });
    assert.equal(b.label, "Vendor Credit");
    assert.equal(b.tone, "credit-memo");
  });

  it("credit memo relabel wins even without a status string", () => {
    const b = billDocStatusBadge({ docstatus: 1, is_return: 1 });
    assert.equal(b.label, "Vendor Credit");
  });

  it("ignores stale status Draft when docstatus is submitted", () => {
    const b = billDocStatusBadge({
      docstatus: 1,
      status: "Draft",
      outstanding_amount: 100,
    });
    assert.notEqual(b.label, "Draft");
    assert.equal(b.tone, "submitted");
  });

  it("billCanAddPayment allows submitted unpaid and blocks paid", () => {
    assert.equal(
      billCanAddPayment({ docstatus: 1, outstanding_amount: 50, status: "Unpaid" }),
      true,
    );
    assert.equal(
      billCanAddPayment({ docstatus: 1, outstanding_amount: 0, status: "Paid" }),
      false,
    );
    assert.equal(billCanAddPayment({ docstatus: 0, outstanding_amount: 50 }), false);
    assert.equal(
      billCanAddPayment({ docstatus: 1, status: "Partly Paid", outstanding_amount: 10 }),
      true,
    );
  });
});
