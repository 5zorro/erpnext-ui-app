import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldRestoreFocusAnchor,
  shouldScheduleInvoiceDateFocus,
} from "../src/stale-focus-guard.js";

describe("stale-focus-guard", () => {
  it("shouldRestoreFocusAnchor allows body and matching field", () => {
    const anchor = { field: "transaction_date", row: null, scratch: null };
    const match = { getAttribute: (k) => (k === "data-field" ? "transaction_date" : null) };
    assert.equal(shouldRestoreFocusAnchor(anchor, null), true);
    assert.equal(shouldRestoreFocusAnchor(anchor, match), true);
    const moved = { getAttribute: (k) => (k === "data-field" ? "payment_terms_template" : null) };
    assert.equal(shouldRestoreFocusAnchor(anchor, moved), false);
  });

  it("shouldRestoreFocusAnchor matches item cells by row and field", () => {
    const anchor = { field: "item_code", row: "1", scratch: null };
    const same = {
      getAttribute: (k) => (k === "data-field" ? "item_code" : k === "data-row" ? "1" : null),
    };
    const otherRow = {
      getAttribute: (k) => (k === "data-field" ? "item_code" : k === "data-row" ? "2" : null),
    };
    assert.equal(shouldRestoreFocusAnchor(anchor, same), true);
    assert.equal(shouldRestoreFocusAnchor(anchor, otherRow), false);
  });

  it("shouldScheduleInvoiceDateFocus only before user moves past invoice date", () => {
    assert.equal(shouldScheduleInvoiceDateFocus(null), true);
    assert.equal(
      shouldScheduleInvoiceDateFocus({
        getAttribute: (k) => (k === "data-field" ? "supplier" : null),
      }),
      true,
    );
    assert.equal(
      shouldScheduleInvoiceDateFocus({
        getAttribute: (k) => (k === "data-field" ? "bill_date" : null),
      }),
      true,
    );
    assert.equal(
      shouldScheduleInvoiceDateFocus({
        getAttribute: (k) => (k === "data-field" ? "bill_no" : null),
      }),
      false,
    );
  });
});
