import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckDocViewModel,
  buildCheckDocViewModelFromPaymentEntry,
  blankCheckViewModel,
  paymentEntryStatusLabel,
} from "../src/check-doc-view.js";

const bills = [
  { installmentKey: "PINV-001", invoice: "PINV-001", dueDate: "2026-09-10", outstanding: 400 },
  { installmentKey: "PINV-002#1", invoice: "PINV-002", dueDate: "2026-09-12", outstanding: 150 },
];

const group = {
  supplier: "Acme Supply",
  bills: ["PINV-001", "PINV-002#1"],
  payOn: "2026-09-09",
  totalAmount: 550,
  feesSaved: 0.83,
  floatCost: 0.14,
  netBenefit: 0.69,
  rationale: "Batched to save one postage/check fee.",
  reason: "batch",
};

describe("buildCheckDocViewModel", () => {
  it("passes through the group's header fields", () => {
    const vm = buildCheckDocViewModel(group, bills);
    assert.equal(vm.payTo, "Acme Supply");
    assert.equal(vm.amount, 550);
    assert.equal(vm.payOn, "2026-09-09");
    assert.equal(vm.memo, "Batched to save one postage/check fee.");
  });

  it("maps stub rows in group.bills order, not bills-array order", () => {
    const reordered = [bills[1], bills[0]];
    const vm = buildCheckDocViewModel(group, reordered);
    assert.deepEqual(
      vm.stubRows.map((r) => r.invoice),
      ["PINV-001", "PINV-002"],
    );
  });

  it("stub row amounts come from the matching bill, not a recomputed split", () => {
    const vm = buildCheckDocViewModel(group, bills);
    assert.deepEqual(
      vm.stubRows.map((r) => r.amount),
      [400, 150],
    );
    // Header amount is the group's own total, never re-derived from the stub rows --
    // a single source of truth even if rounding ever drifted between the two.
    assert.equal(vm.amount, group.totalAmount);
  });

  it("a pay-alone group (single bill) still produces one stub row", () => {
    const single = { ...group, bills: ["PINV-001"], totalAmount: 400, reason: "pay-alone" };
    const vm = buildCheckDocViewModel(single, bills);
    assert.equal(vm.stubRows.length, 1);
    assert.equal(vm.stubRows[0].invoice, "PINV-001");
  });

  it("an installmentKey missing from the bills list falls back instead of throwing", () => {
    const vm = buildCheckDocViewModel({ ...group, bills: ["GHOST-1"] }, bills);
    assert.deepEqual(vm.stubRows, [{ invoice: "GHOST-1", dueDate: "", amount: 0 }]);
  });

  it("empty group.bills yields an empty stub list, not an error", () => {
    const vm = buildCheckDocViewModel({ ...group, bills: [] }, bills);
    assert.deepEqual(vm.stubRows, []);
  });

  it("junk input never throws", () => {
    assert.doesNotThrow(() => buildCheckDocViewModel(null, null));
    assert.doesNotThrow(() => buildCheckDocViewModel(undefined, undefined));
    assert.doesNotThrow(() => buildCheckDocViewModel({}, []));
  });

  it("null/undefined group falls back to empty strings and zero amount", () => {
    const vm = buildCheckDocViewModel(null, bills);
    assert.deepEqual(vm, { payTo: "", amount: 0, payOn: "", memo: "", stubRows: [] });
  });

  it("does not mutate its inputs", () => {
    const groupCopy = JSON.parse(JSON.stringify(group));
    const billsCopy = JSON.parse(JSON.stringify(bills));
    buildCheckDocViewModel(group, bills);
    assert.deepEqual(group, groupCopy);
    assert.deepEqual(bills, billsCopy);
  });
});

describe("paymentEntryStatusLabel", () => {
  it("maps docstatus to the ERP label", () => {
    assert.equal(paymentEntryStatusLabel(0), "Draft");
    assert.equal(paymentEntryStatusLabel(1), "Submitted");
    assert.equal(paymentEntryStatusLabel(2), "Cancelled");
  });
  it("junk/absent docstatus falls back to Draft rather than throwing", () => {
    assert.equal(paymentEntryStatusLabel(null), "Draft");
    assert.equal(paymentEntryStatusLabel(undefined), "Draft");
    assert.equal(paymentEntryStatusLabel("garbage"), "Draft");
    assert.equal(paymentEntryStatusLabel(99), "Draft");
  });
});

describe("buildCheckDocViewModelFromPaymentEntry", () => {
  const pe = {
    party: "ALPINE SUPPLY",
    paid_amount: 848,
    reference_date: "2026-08-20",
    remarks: "Batch of 2",
    mode_of_payment: "Check",
    paid_from: "Demo Bank Account - HID",
    reference_no: "10231",
    docstatus: 1,
    references: [
      { reference_name: "ACC-PINV-2026-00011", due_date: "2026-08-20", allocated_amount: 424 },
      { reference_name: "ACC-PINV-2026-00012", due_date: "2026-08-20", allocated_amount: 424 },
    ],
  };

  it("maps a real submitted Payment Entry's fields directly", () => {
    const vm = buildCheckDocViewModelFromPaymentEntry(pe);
    assert.equal(vm.payTo, "ALPINE SUPPLY");
    assert.equal(vm.amount, 848);
    assert.equal(vm.payOn, "2026-08-20");
    assert.equal(vm.memo, "Batch of 2");
    assert.equal(vm.modeOfPayment, "Check");
    assert.equal(vm.bankAccount, "Demo Bank Account - HID");
    assert.equal(vm.referenceNo, "10231");
    assert.equal(vm.status, "Submitted");
    assert.equal(vm.stubRows.length, 2);
    assert.deepEqual(vm.stubRows[0], {
      invoice: "ACC-PINV-2026-00011",
      dueDate: "2026-08-20",
      amount: 424,
    });
  });

  it("a draft doc (docstatus 0) reports status Draft", () => {
    const vm = buildCheckDocViewModelFromPaymentEntry({ ...pe, docstatus: 0 });
    assert.equal(vm.status, "Draft");
  });

  it("falls back to posting_date when the doc carries no reference_date", () => {
    // reference_date is only mandatory alongside reference_no, so an ACH/wire or a
    // Vanilla-created PE routinely has none -- without this the check face rendered a
    // blank Date on a real, dated document.
    const { reference_date, reference_no, ...noRefDate } = pe;
    const vm = buildCheckDocViewModelFromPaymentEntry({ ...noRefDate, posting_date: "2026-08-18" });
    assert.equal(vm.payOn, "2026-08-18");
  });

  it("reference_date still wins over posting_date when both are present", () => {
    const vm = buildCheckDocViewModelFromPaymentEntry({ ...pe, posting_date: "2026-08-18" });
    assert.equal(vm.payOn, "2026-08-20");
  });

  it("no date of either kind yields an empty payOn, not undefined", () => {
    const { reference_date, ...noDates } = pe;
    assert.equal(buildCheckDocViewModelFromPaymentEntry(noDates).payOn, "");
  });

  it("carries the fields ERPNext already computed — written amount and bank block", () => {
    const vm = buildCheckDocViewModelFromPaymentEntry({
      ...pe,
      in_words: "Eight Hundred Forty Eight Dollars only",
      bank: "Demo Bank",
      bank_account_no: "000123456",
    });
    assert.equal(vm.inWords, "Eight Hundred Forty Eight Dollars only");
    assert.equal(vm.bankName, "Demo Bank");
    assert.equal(vm.bankAccountNo, "000123456");
    assert.equal(vm.referenceDate, "2026-08-20");
  });

  it("falls back to base_in_words when in_words is absent", () => {
    const vm = buildCheckDocViewModelFromPaymentEntry({ ...pe, base_in_words: "USD Eight Hundred" });
    assert.equal(vm.inWords, "USD Eight Hundred");
  });

  it("a proposal carries none of them — nothing is invented before a PE exists", () => {
    const vm = buildCheckDocViewModel(group, bills);
    assert.equal(vm.inWords, undefined);
    assert.equal(vm.bankName, undefined);
    assert.equal(vm.bankAccountNo, undefined);
    assert.equal(vm.isDraft, undefined);
  });

  it("isDraft follows the document's own docstatus, not a caller preference", () => {
    assert.equal(buildCheckDocViewModelFromPaymentEntry({ ...pe, docstatus: 0 }).isDraft, true);
    assert.equal(buildCheckDocViewModelFromPaymentEntry({ ...pe, docstatus: 1 }).isDraft, false);
    assert.equal(buildCheckDocViewModelFromPaymentEntry({ ...pe, docstatus: 2 }).isDraft, false);
    // No docstatus at all reads as a draft — matches paymentEntryStatusLabel's own default.
    assert.equal(buildCheckDocViewModelFromPaymentEntry({ party: "X" }).isDraft, true);
  });

  it("junk input never throws and yields empty-but-shaped output", () => {
    assert.doesNotThrow(() => buildCheckDocViewModelFromPaymentEntry(null));
    assert.doesNotThrow(() => buildCheckDocViewModelFromPaymentEntry(undefined));
    const vm = buildCheckDocViewModelFromPaymentEntry(null);
    assert.equal(vm.payTo, "");
    assert.equal(vm.amount, 0);
    assert.deepEqual(vm.stubRows, []);
    assert.equal(vm.status, "Draft");
  });

  it("a reference row missing allocated_amount contributes 0, not NaN", () => {
    const vm = buildCheckDocViewModelFromPaymentEntry({
      ...pe,
      references: [{ reference_name: "X", due_date: "2026-01-01" }],
    });
    assert.equal(vm.stubRows[0].amount, 0);
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(pe));
    buildCheckDocViewModelFromPaymentEntry(pe);
    assert.deepEqual(pe, copy);
  });
});

describe("blankCheckViewModel", () => {
  it("is empty on purpose — the clerk supplies every field", () => {
    const vm = blankCheckViewModel("2026-09-08");
    assert.equal(vm.payTo, "");
    assert.equal(vm.amount, 0);
    assert.equal(vm.memo, "");
    assert.deepEqual(vm.stubRows, []);
  });

  it("defaults the date to today so the date line is never blank on a fresh check", () => {
    assert.equal(blankCheckViewModel("2026-09-08").payOn, "2026-09-08");
  });

  it("no date given yields an empty string, not undefined", () => {
    assert.equal(blankCheckViewModel().payOn, "");
  });

  it("invents none of the saved-document fields", () => {
    const vm = blankCheckViewModel("2026-09-08");
    for (const k of ["inWords", "bankName", "bankAccountNo", "referenceNo", "status"]) {
      assert.equal(vm[k], undefined, k);
    }
  });

  it("returns a fresh object each call", () => {
    const a = blankCheckViewModel("2026-09-08");
    a.payTo = "mutated";
    assert.equal(blankCheckViewModel("2026-09-08").payTo, "");
  });
});
