import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  informalLinkView,
  filterInformalLinkRows,
  informalLinkRowLabel,
  informalLinkEmptyText,
  salesOrderLinkRows,
  informalLinkStatus,
  DECIDE_LATER_STATUS,
} from "../src/bill-informal-link.js";
import { soPickerBillLines } from "../src/so-picker.js";

describe("informal link — the three doors", () => {
  it("Informal link to Bill", () => {
    assert.deepEqual(informalLinkView("bill"), {
      isBill: true,
      sourcePick: false,
      label: "Bill",
      dialogLabel: "Informal link to Bill",
      title: "Informal link to Bill — same vendor by default; type/paste a name to search any vendor",
      placeholder: "Search Bills…",
      clearText: "Clear link",
      testId: "bill-informal-link-picker-bill",
      rowTestId: "bill-informal-link-bill-row",
    });
  });

  it("Informal link to Sales Order", () => {
    const v = informalLinkView("so");
    assert.equal(v.title, "Informal link to Sales Order (Sales Order picker — not restricted by vendor)");
    assert.equal(v.placeholder, "Filter Sales Orders…");
    assert.equal(v.clearText, "Clear link");
    assert.equal(v.testId, "bill-informal-link-picker-so");
    assert.equal(v.rowTestId, "bill-informal-link-so-row");
  });

  it("the source door (Credit memo → Yes) asks which Bill, and offers Decide later", () => {
    const v = informalLinkView("bill", "source");
    assert.equal(v.sourcePick, true);
    assert.equal(v.dialogLabel, "Which Bill is this credit against?");
    assert.match(v.title, /Skip this and the credit posts with no Bill behind it\.$/);
    assert.equal(v.clearText, "Decide later");
    assert.equal(v.testId, "bill-credit-source-picker");
    assert.equal(v.rowTestId, "bill-credit-source-row");
  });

  it("only a Bill has a source door", () => {
    assert.equal(informalLinkView("so", "source").sourcePick, false);
  });
});

describe("informal link — the list", () => {
  const rows = [
    { value: "ACC-PINV-1", description: "ALPINE SUPPLY CO, 563.06" },
    { value: "ACC-PINV-2", description: "ACC-PINV-2" },
    { value: "SO-7" },
  ];

  it("filters on name or description, any case, ignoring outer spaces", () => {
    assert.deepEqual(filterInformalLinkRows(rows, "  alpine ").map((r) => r.value), ["ACC-PINV-1"]);
    assert.deepEqual(filterInformalLinkRows(rows, "so-7").map((r) => r.value), ["SO-7"]);
    assert.equal(filterInformalLinkRows(rows, " ").length, 3);
  });

  it("labels a row with its description unless it only repeats the name", () => {
    assert.equal(informalLinkRowLabel(rows[0]), "ACC-PINV-1 — ALPINE SUPPLY CO, 563.06");
    assert.equal(informalLinkRowLabel(rows[1]), "ACC-PINV-2");
    assert.equal(informalLinkRowLabel(rows[2]), "SO-7");
  });

  it("an empty Bill list says whose Bills; anything typed says no matches", () => {
    assert.equal(informalLinkEmptyText(true, "", "ZZ VEND"), "No submitted Bills found for ZZ VEND. Type to search any vendor.");
    assert.equal(informalLinkEmptyText(true, " ", ""), "No submitted Bills found for this vendor. Type to search any vendor.");
    assert.equal(informalLinkEmptyText(true, "ACC", "ZZ VEND"), "No matches.");
    assert.equal(informalLinkEmptyText(false, "", "ZZ VEND"), "No matches.");
  });

  it("Sales Orders show the customer and total", () => {
    assert.deepEqual(
      salesOrderLinkRows([
        { name: "SO-1", customer_name: "First", customer: "C1", grand_total: 67.84 },
        { name: "SO-2", customer: "C2" },
        { name: "SO-3" },
      ]),
      [
        { value: "SO-1", description: "First — $67.84" },
        { value: "SO-2", description: "C2" },
        { value: "SO-3", description: "" },
      ],
    );
    assert.deepEqual(salesOrderLinkRows(null), []);
  });

  it("the Sales Order list's margins come from every Bill line's code, qty, rate and amount", () => {
    assert.deepEqual(soPickerBillLines([{ item_code: "A", qty: 2, rate: 5, amount: 10, idx: 1 }]), [{ item_code: "A", qty: 2, rate: 5, amount: 10 }]);
    assert.deepEqual(soPickerBillLines(undefined), []);
  });
});

describe("informal link — the status line", () => {
  it("linking and clearing", () => {
    assert.deepEqual(informalLinkStatus("Bill", "ACC-PINV-3"), {
      working: "Linking informally to Bill ACC-PINV-3…",
      done: "Noted in Remarks: informal link to Bill ACC-PINV-3.",
    });
    assert.deepEqual(informalLinkStatus("Sales Order", ""), {
      working: "Clearing informal Sales Order link…",
      done: "Informal Sales Order link cleared.",
    });
  });

  it("Decide later keeps the warning up", () => {
    assert.match(DECIDE_LATER_STATUS, /no Bill behind it.*warning below stays up/);
  });
});
