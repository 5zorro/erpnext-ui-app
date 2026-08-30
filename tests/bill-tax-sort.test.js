import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readBillTaxRowsForSort,
  sortBillTaxRows,
  billTaxesSubtotal,
} from "../src/bill-tax-sort.js";

describe("bill-tax-sort", () => {
  it("uses ERP idx as lineNo when present", () => {
    const rows = readBillTaxRowsForSort({
      taxes: [
        { idx: 2, account_head: "B", tax_amount: 5, add_deduct_tax: "Add" },
        { idx: 1, account_head: "A", tax_amount: 3, add_deduct_tax: "Add" },
      ],
    });
    assert.equal(rows[0].idx, 0);
    assert.equal(rows[0].lineNo, 2);
    assert.equal(rows[1].lineNo, 1);
  });

  it("sorts by amount without losing ERP idx", () => {
    const rows = sortBillTaxRows(
      readBillTaxRowsForSort({
        taxes: [
          { idx: 1, account_head: "A", tax_amount: 10, add_deduct_tax: "Add" },
          { idx: 2, account_head: "B", tax_amount: 3, add_deduct_tax: "Add" },
        ],
      }),
      [{ key: "tax_amount", asc: true }],
    );
    assert.equal(rows[0].account_head, "B");
    assert.equal(rows[0].idx, 1);
  });

  it("billTaxesSubtotal nets Add/Deduct", () => {
    assert.equal(
      billTaxesSubtotal({
        taxes: [
          { tax_amount: 10, add_deduct_tax: "Add" },
          { tax_amount: 4, add_deduct_tax: "Deduct" },
        ],
      }),
      6,
    );
    assert.equal(billTaxesSubtotal({ total_taxes_and_charges: 12.5, taxes: [] }), 12.5);
  });
});
