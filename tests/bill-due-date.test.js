import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasBillPaymentTerms, billDueDateFieldMode } from "../src/bill-due-date.js";

describe("bill-due-date", () => {
  it("hasBillPaymentTerms", () => {
    assert.equal(hasBillPaymentTerms(""), false);
    assert.equal(hasBillPaymentTerms("Net 30"), true);
    assert.equal(hasBillPaymentTerms({ payment_terms_template: "Net 30" }), true);
    assert.equal(hasBillPaymentTerms({ payment_terms_template: "" }), false);
  });

  it("Terms set: due date not tabbable but still editable", () => {
    const locked = billDueDateFieldMode({ payment_terms_template: "Net 30" }, { editable: true });
    assert.equal(locked.tabbable, false);
    assert.equal(locked.readOnly, false);
    assert.match(locked.hint, /click to edit/i);

    const open = billDueDateFieldMode({ payment_terms_template: "" }, { editable: true });
    assert.equal(open.tabbable, true);
    assert.equal(open.readOnly, false);
  });
});
