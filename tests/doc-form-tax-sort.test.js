import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readBillTaxRowsForSort, sortBillTaxRows } from "../src/bill-tax-sort.js";

// Since plan 10-25 step 3 the IR's taxes are laid out like the Bill's, Line column included
// (5zorro 2026-10-26); tests/doc-form-tax-table.test.js checks both pages pass the Bill's headers.
describe("IR doc-form tax rows", () => {
  it("sorts IR tax rows by amount without losing ERP idx", () => {
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
});
