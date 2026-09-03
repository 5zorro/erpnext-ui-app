import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  headerDueDateFromPaymentSchedule,
  shouldSettlePaymentTermsAfterHeader,
} from "../src/bill-payment-terms-settle.js";

describe("bill-payment-terms-settle", () => {
  it("headerDueDateFromPaymentSchedule uses last schedule row", () => {
    assert.equal(
      headerDueDateFromPaymentSchedule({
        payment_schedule: [{ due_date: "2026-08-01" }, { due_date: "2026-08-30" }],
      }),
      "2026-08-30",
    );
    assert.equal(headerDueDateFromPaymentSchedule({ payment_schedule: [] }), "");
  });

  it("shouldSettlePaymentTermsAfterHeader for PI terms and dates", () => {
    assert.equal(
      shouldSettlePaymentTermsAfterHeader("Purchase Invoice", "payment_terms_template"),
      true,
    );
    assert.equal(shouldSettlePaymentTermsAfterHeader("Purchase Invoice", "posting_date"), true);
    assert.equal(shouldSettlePaymentTermsAfterHeader("Purchase Order", "payment_terms_template"), false);
    assert.equal(shouldSettlePaymentTermsAfterHeader("Purchase Invoice", "supplier"), false);
  });
});
