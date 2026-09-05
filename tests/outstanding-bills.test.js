import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAccountsPayableRow,
  attachDiscountWindow,
  explodeInstallments,
  buildOutstandingBillRows,
} from "../src/outstanding-bills.js";

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
      installmentKey: "ACC-PINV-2026-00229",
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
      installmentKey: "",
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

describe("outstanding-bills: explodeInstallments (OI-161 Packet G finding, 2026-09-05)", () => {
  const row = normalizeAccountsPayableRow(CAPTURED_SMALL_ROW); // invoice ACC-PINV-2026-00229, invoiced 4500

  it("one distinct due date -> null (nothing to explode, use attachDiscountWindow instead)", () => {
    assert.equal(explodeInstallments(row, [{ due_date: "2026-10-20", outstanding: 4500 }]), null);
  });

  it("two schedule rows on the same due date -> still null", () => {
    assert.equal(
      explodeInstallments(row, [
        { due_date: "2026-10-20", outstanding: 2000 },
        { due_date: "2026-10-20", outstanding: 2500 },
      ]),
      null,
    );
  });

  it("no schedule rows -> null", () => {
    assert.equal(explodeInstallments(row, []), null);
  });

  it("multiple distinct due dates -> one row per installment, sorted ascending, unique keys", () => {
    const out = explodeInstallments(row, [
      { due_date: "2026-08-02", outstanding: 100 },
      { due_date: "2026-08-01", outstanding: 100 },
      { due_date: "2026-08-03", outstanding: 100 },
    ]);
    assert.equal(out.length, 3);
    assert.deepEqual(
      out.map((r) => r.dueDate),
      ["2026-08-01", "2026-08-02", "2026-08-03"],
    );
    assert.deepEqual(
      out.map((r) => r.installmentKey),
      ["ACC-PINV-2026-00229#1", "ACC-PINV-2026-00229#2", "ACC-PINV-2026-00229#3"],
    );
    assert.ok(out.every((r) => r.invoice === "ACC-PINV-2026-00229"), "invoice stays the real ERP doc name");
    assert.ok(out.every((r) => r.outstanding === 100));
    assert.ok(out.every((r) => r.discountAmount === undefined));
  });

  it("excludes paid-off installments (outstanding: 0)", () => {
    const out = explodeInstallments(row, [
      { due_date: "2026-08-01", outstanding: 0 }, // already paid
      { due_date: "2026-08-02", outstanding: 100 },
      { due_date: "2026-08-03", outstanding: 100 },
    ]);
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((r) => r.dueDate),
      ["2026-08-02", "2026-08-03"],
    );
  });

  it("per-installment discount fields, not 'earliest across the whole invoice'", () => {
    const out = explodeInstallments(row, [
      { due_date: "2026-08-01", outstanding: 100 },
      {
        due_date: "2026-08-02",
        outstanding: 100,
        discount_type: "Percentage",
        discount: 2,
        discount_date: "2026-07-25",
      },
      { due_date: "2026-08-03", outstanding: 100 },
    ]);
    const [row1, row2, row3] = out;
    assert.equal(row1.discountAmount, undefined, "no discount on this installment");
    assert.equal(row2.discountDate, "2026-07-25");
    assert.equal(row2.discountAmount, 90, "4500 (invoiced) * 2%, not 100 * 2%");
    assert.equal(row3.discountAmount, undefined);
  });

  it("Amount discount type on an exploded installment", () => {
    const out = explodeInstallments(row, [
      { due_date: "2026-08-01", outstanding: 100, discount_type: "Amount", discount: 3.5, discount_date: "2026-07-25" },
      { due_date: "2026-08-02", outstanding: 100 },
    ]);
    assert.equal(out[0].discountAmount, 3.5);
  });

  it("does not mutate the input row", () => {
    const before = { ...row };
    explodeInstallments(row, [
      { due_date: "2026-08-01", outstanding: 100 },
      { due_date: "2026-08-02", outstanding: 100 },
    ]);
    assert.deepEqual(row, before);
  });
});

describe("outstanding-bills: buildOutstandingBillRows", () => {
  it("single-installment bill -> one row, same as attachDiscountWindow", () => {
    const rows = buildOutstandingBillRows(CAPTURED_SMALL_ROW, [
      { due_date: "2026-10-20", outstanding: 4500 },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].installmentKey, "ACC-PINV-2026-00229");
    assert.equal(rows[0].discountAmount, undefined);
  });

  it("multi-installment bill -> exploded rows", () => {
    const rows = buildOutstandingBillRows(CAPTURED_SMALL_ROW, [
      { due_date: "2026-08-01", outstanding: 2000 },
      { due_date: "2026-09-01", outstanding: 2500 },
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.installmentKey),
      ["ACC-PINV-2026-00229#1", "ACC-PINV-2026-00229#2"],
    );
  });

  it("end to end against the real captured SUP-DAILY fixture (90 daily installments)", () => {
    // Captured live via read-only MariaDB (2026-09-05) against Packet G's SUP-DAILY Bill: 90 rows,
    // $50.00 each, one per calendar day, 2026-07-23 through 2026-10-20 — exactly Packet G's design.
    const schedule = Array.from({ length: 90 }, (_, i) => ({
      due_date: dateForOffsetFromJuly23(i),
      outstanding: 50.0,
    }));
    const rows = buildOutstandingBillRows(CAPTURED_SMALL_ROW, schedule);
    assert.equal(rows.length, 90, "the fixture's whole point — 90 distinct payable obligations, not 1");
    assert.equal(rows[0].dueDate, "2026-07-23");
    assert.equal(rows[89].dueDate, "2026-10-20");
    assert.equal(new Set(rows.map((r) => r.installmentKey)).size, 90);
    const total = rows.reduce((s, r) => s + r.outstanding, 0);
    assert.ok(Math.abs(total - 4500) < 1e-9);
  });
});

/** July 23, 2026 + n days, as an ISO string (no library — this file has no other date math). */
function dateForOffsetFromJuly23(n) {
  const d = new Date(Date.UTC(2026, 6, 23 + n));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
