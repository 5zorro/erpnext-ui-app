import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldPreserveHeaderInputDuringPaint,
  paintHeaderInputIfAllowed,
  paintHeaderLinkInputIfAllowed,
} from "../src/bill-header-paint.js";

describe("shouldPreserveHeaderInputDuringPaint", () => {
  it("preserves when focused", () => {
    assert.equal(
      shouldPreserveHeaderInputDuringPaint({
        field: "bill_no",
        paintedValue: "",
        currentValue: "INV-12",
        isFocused: true,
      }),
      true,
    );
  });

  it("preserves when dirty vs painted doc", () => {
    assert.equal(
      shouldPreserveHeaderInputDuringPaint({
        field: "bill_no",
        paintedValue: "",
        currentValue: "INV-12",
        isFocused: false,
      }),
      true,
    );
  });

  it("allows paint when in sync with doc", () => {
    assert.equal(
      shouldPreserveHeaderInputDuringPaint({
        field: "bill_no",
        paintedValue: "INV-9",
        currentValue: "INV-9",
        isFocused: false,
      }),
      false,
    );
  });

  it("treats whitespace-only as empty for text fields", () => {
    assert.equal(
      shouldPreserveHeaderInputDuringPaint({
        field: "remarks",
        paintedValue: "",
        currentValue: "   ",
        isFocused: false,
      }),
      false,
    );
  });

  it("allows paint when UI blank and ERP has due date", () => {
    assert.equal(
      shouldPreserveHeaderInputDuringPaint({
        field: "due_date",
        paintedValue: "09/30/2026",
        currentValue: "",
        isFocused: false,
      }),
      false,
    );
  });

  it("preserves partial date entry while typing", () => {
    assert.equal(
      shouldPreserveHeaderInputDuringPaint({
        field: "posting_date",
        paintedValue: "08/01/2026",
        currentValue: "08/3",
        isFocused: true,
      }),
      true,
    );
  });
});

describe("paintHeaderInputIfAllowed", () => {
  it("skips assign when focused", () => {
    const input = { value: "typed" };
    const ok = paintHeaderInputIfAllowed(input, "bill_no", "", {
      activeElement: input,
    });
    assert.equal(ok, false);
    assert.equal(input.value, "typed");
  });

  it("assigns when not focused and not dirty", () => {
    const input = { value: "INV-1" };
    const ok = paintHeaderInputIfAllowed(input, "bill_no", "INV-1", {
      activeElement: null,
    });
    assert.equal(ok, true);
    assert.equal(input.value, "INV-1");
  });

  it("calls onSkip with reason", () => {
    const input = { value: "x" };
    let reason = "";
    paintHeaderInputIfAllowed(input, "bill_no", "", {
      activeElement: input,
      onSkip: (r) => {
        reason = r;
      },
    });
    assert.equal(reason, "focused");
  });

  it("forcePaint overwrites stale due date after terms settle", () => {
    const input = { value: "09/29/2026" };
    const ok = paintHeaderInputIfAllowed(input, "due_date", "10/14/2026", {
      activeElement: null,
      forcePaint: true,
    });
    assert.equal(ok, true);
    assert.equal(input.value, "10/14/2026");
  });
});

describe("paintHeaderLinkInputIfAllowed", () => {
  it("syncs linkCommitted when painted", () => {
    const input = { value: "Acme", dataset: {} };
    const ok = paintHeaderLinkInputIfAllowed(input, "supplier", "Acme", {
      activeElement: null,
    });
    assert.equal(ok, true);
    assert.equal(input.dataset.linkCommitted, "Acme");
  });

  it("does not touch linkCommitted when skipped", () => {
    const input = { value: "typing", dataset: { linkCommitted: "Old" } };
    paintHeaderLinkInputIfAllowed(input, "supplier", "New", {
      activeElement: input,
    });
    assert.equal(input.value, "typing");
    assert.equal(input.dataset.linkCommitted, "Old");
  });
});
