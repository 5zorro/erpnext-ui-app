import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeAccountsPayableRow, attachDiscountWindow } from "../src/outstanding-bills.js";

// Captured live from the sandbox (bench execute frappe.desk.query_report.run, report_name=
// "Accounts Payable", 2026-09-05) against OI-161 Packet G's SUP-DAILY / SUP-DAILY-LG fixtures —
// real field names, not guessed. Trimmed to the columns this module cares about; the report also
// returns ageing range0..range5, supplier_group, etc. that normalizeAccountsPayableRow ignores.
const CAPTURED_SMALL_ROW = Object.freeze({
  voucher_type: "Purchase Invoice",
  voucher_no: "ACC-PINV-2026-00229",
  party: "SAMPLE Vendor Daily Payrun",
  party_type: "Supplier",
  posting_date: "2026-07-22",
  due_date: "2026-10-20",
  invoiced: 4500.0,
  paid: 0.0,
  outstanding: 4500.0,
  currency: "USD",
  age: 44,
});

const CAPTURED_LARGE_ROW = Object.freeze({
  voucher_type: "Purchase Invoice",
  voucher_no: "ACC-PINV-2026-00230",
  party: "SAMPLE Vendor Daily Payrun Large",
  party_type: "Supplier",
  posting_date: "2026-07-22",
  due_date: "2026-10-20",
  invoiced: 225000.0,
  paid: 0.0,
  outstanding: 225000.0,
  currency: "USD",
  age: 44,
});

describe("outstanding-bills: normalizeAccountsPayableRow", () => {
  it("maps the captured small-dollar AP report row", () => {
    const row = normalizeAccountsPayableRow(CAPTURED_SMALL_ROW);
    assert.deepEqual(row, {
      invoice: "ACC-PINV-2026-00229",
      supplier: "SAMPLE Vendor Daily Payrun",
      postingDate: "2026-07-22",
      dueDate: "2026-10-20",
      invoiced: 4500.0,
      outstanding: 4500.0,
      currency: "USD",
    });
  });

  it("maps the captured large-dollar AP report row", () => {
    const row = normalizeAccountsPayableRow(CAPTURED_LARGE_ROW);
    assert.equal(row.invoice, "ACC-PINV-2026-00230");
    assert.equal(row.invoiced, 225000.0);
    assert.equal(row.outstanding, 225000.0);
  });

  it("falls back to name/supplier_name when voucher_no/party are absent", () => {
    const row = normalizeAccountsPayableRow({
      name: "ACC-PINV-2026-99999",
      supplier_name: "SAMPLE Vendor Fallback",
      posting_date: "2026-01-01",
      due_date: "2026-01-31",
      invoiced: 100,
      outstanding: 100,
      currency: "USD",
    });
    assert.equal(row.invoice, "ACC-PINV-2026-99999");
    assert.equal(row.supplier, "SAMPLE Vendor Fallback");
  });

  it("defaults missing/non-numeric amounts to 0, missing strings to empty", () => {
    const row = normalizeAccountsPayableRow({});
    assert.deepEqual(row, {
      invoice: "",
      supplier: "",
      postingDate: "",
      dueDate: "",
      invoiced: 0,
      outstanding: 0,
      currency: "",
    });
  });
});

describe("outstanding-bills: attachDiscountWindow", () => {
  const baseRow = normalizeAccountsPayableRow(CAPTURED_SMALL_ROW); // invoiced: 4500

  it("no schedule rows → row unchanged, discount fields absent (undefined, not 0)", () => {
    const out = attachDiscountWindow(baseRow, []);
    assert.deepEqual(out, baseRow);
    assert.equal(out.discountDate, undefined);
    assert.equal(out.discountAmount, undefined);
    assert.equal("discountAmount" in out, false);
  });

  it("schedule rows with no discount set → unchanged", () => {
    const out = attachDiscountWindow(baseRow, [
      { due_date: "2026-08-01", payment_amount: 50 },
      { due_date: "2026-08-02", payment_amount: 50, discount: 0 },
    ]);
    assert.equal(out.discountAmount, undefined);
  });

  it("Percentage discount computes off the bill's invoiced total, not payment_amount", () => {
    const out = attachDiscountWindow(baseRow, [
      { due_date: "2026-08-01", payment_amount: 50, discount_type: "Percentage", discount: 2, discount_date: "2026-07-30" },
    ]);
    assert.equal(out.discountDate, "2026-07-30");
    assert.equal(out.discountAmount, 90.0); // 4500 * 2% = 90, not 50 * 2% = 1
  });

  it("Amount discount type uses the flat discount value directly", () => {
    const out = attachDiscountWindow(baseRow, [
      { due_date: "2026-08-01", payment_amount: 50, discount_type: "Amount", discount: 25.5, discount_date: "2026-07-30" },
    ]);
    assert.equal(out.discountAmount, 25.5);
  });

  it("multiple discount-bearing rows: picks the earliest discount_date", () => {
    const out = attachDiscountWindow(baseRow, [
      { due_date: "2026-09-01", payment_amount: 50, discount_type: "Amount", discount: 5, discount_date: "2026-08-15" },
      { due_date: "2026-08-01", payment_amount: 50, discount_type: "Amount", discount: 10, discount_date: "2026-07-20" },
      { due_date: "2026-10-01", payment_amount: 50, discount_type: "Amount", discount: 1, discount_date: "2026-09-25" },
    ]);
    assert.equal(out.discountDate, "2026-07-20");
    assert.equal(out.discountAmount, 10);
  });

  it("does not mutate the input row", () => {
    const before = { ...baseRow };
    attachDiscountWindow(baseRow, [
      { discount_type: "Amount", discount: 5, discount_date: "2026-07-25" },
    ]);
    assert.deepEqual(baseRow, before);
  });
});
