import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOC_TAX_SORTABLE_HEADERS,
  readBillTaxRowsForSort,
  sortBillTaxRows,
} from "../src/bill-tax-sort.js";

describe("DOC_TAX_SORTABLE_HEADERS (IR doc-form)", () => {
  it("excludes Line# column present on Bill", () => {
    const keys = DOC_TAX_SORTABLE_HEADERS.map((h) => h.sortKey);
    assert.equal(keys.includes("lineNo"), false);
    assert.deepEqual(keys, [
      "account_head",
      "description",
      "charge_type",
      "rate",
      "tax_amount",
      "add_deduct_tax",
    ]);
  });

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
