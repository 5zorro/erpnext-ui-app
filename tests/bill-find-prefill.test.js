import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billFindPrefillFromDupeWarning,
  billRefCheckHasDupeWarning,
} from "../src/bill-find-prefill.js";

describe("bill-find-prefill", () => {
  it("detects duplicate warnings", () => {
    assert.equal(billRefCheckHasDupeWarning(null), false);
    assert.equal(
      billRefCheckHasDupeWarning({
        status: "warn",
        warnings: [{ code: "pattern", message: "nope" }],
      }),
      false,
    );
    assert.equal(
      billRefCheckHasDupeWarning({
        status: "warn",
        warnings: [{ code: "duplicate", message: "Possible duplicate" }],
      }),
      true,
    );
  });

  it("builds list filter payload from ref + vendor", () => {
    assert.deepEqual(
      billFindPrefillFromDupeWarning({ billNo: "  INV-1  ", supplier: " Alpine " }),
      { billNo: "INV-1", supplier: "Alpine" },
    );
    assert.deepEqual(billFindPrefillFromDupeWarning({ billNo: "INV-2", supplier: "" }), {
      billNo: "INV-2",
    });
    assert.equal(billFindPrefillFromDupeWarning({ billNo: "   " }), null);
  });
});
