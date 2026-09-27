import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planModeChange,
  describeModeChange,
  summarizeModeChange,
} from "../src/mode-change-plan.js";
import { applyAmendPatch, verifyAmendPatch } from "../src/doc-actions.js";

/** One installment row as the dashboard holds it. */
function row(invoice, n, dueDate, mode, outstanding = 100) {
  return {
    invoice,
    installmentKey: n == null ? invoice : `${invoice}#${n}`,
    supplier: "SAMPLE Vendor 01",
    dueDate,
    outstanding,
    ...(mode === undefined ? {} : { modeOfPayment: mode }),
  };
}

describe("planModeChange — five payments are not five amends", () => {
  /**
   * 🔴 The point of the whole packet. 5zorro: *"if i have 5 payments for a bill that is 'check'
   * that i don't have to amend it 5 times by clicking in 5 spots."* Installments live inside one
   * document, so five rows on one bill is one cancel.
   */
  it("collapses a bill's installments into one amend", () => {
    const plan = planModeChange({
      rows: [
        row("ACC-PINV-1", 1, "2026-10-01", "Cheque"),
        row("ACC-PINV-1", 2, "2026-11-01", "Cheque"),
        row("ACC-PINV-1", 3, "2026-12-01", "Cheque"),
        row("ACC-PINV-1", 4, "2027-01-01", "Cheque"),
        row("ACC-PINV-1", 5, "2027-02-01", "Cheque"),
      ],
      targetMode: "ACH",
    });
    assert.equal(plan.amendCount, 1, "one document, one cancel");
    assert.equal(plan.rowCount, 5, "…but five rows actually change");
    assert.equal(plan.work[0].patch.setScheduleRows.length, 5);
  });

  it("counts documents, not rows, across several bills", () => {
    const plan = planModeChange({
      rows: [
        row("ACC-PINV-1", 1, "2026-10-01", "Cheque"),
        row("ACC-PINV-1", 2, "2026-11-01", "Cheque"),
        row("ACC-PINV-2", null, "2026-10-15", "Cheque"),
      ],
      targetMode: "ACH",
    });
    assert.equal(plan.amendCount, 2);
    assert.equal(plan.rowCount, 3);
  });

  // The default 5zorro asked for: the method is a vendor fact, so everything starts selected.
  it("takes every row when no selection is given", () => {
    const rows = [row("A", 1, "2026-10-01", "Cheque"), row("B", null, "2026-11-01", "Cheque")];
    assert.equal(planModeChange({ rows, targetMode: "ACH" }).amendCount, 2);
    assert.equal(planModeChange({ rows, targetMode: "ACH", selectedKeys: null }).amendCount, 2);
  });

  it("lets one installment opt out without dragging its siblings along", () => {
    const plan = planModeChange({
      rows: [
        row("ACC-PINV-1", 1, "2026-10-01", "Cheque"),
        row("ACC-PINV-1", 2, "2026-11-01", "Cheque"),
      ],
      targetMode: "ACH",
      selectedKeys: ["ACC-PINV-1#2"],
    });
    assert.equal(plan.rowCount, 1);
    assert.deepEqual(
      plan.work[0].patch.setScheduleRows.map((r) => r.matchDueDate),
      ["2026-11-01"],
    );
  });

  /**
   * 🔴 The header's `mode_of_payment` is the bill's *default* method. Moving it when only one of
   * two installments moves would leave the header describing something untrue of the other.
   */
  it("moves the header only when every known row moves", () => {
    const both = planModeChange({
      rows: [row("A", 1, "2026-10-01", "Cheque"), row("A", 2, "2026-11-01", "Cheque")],
      targetMode: "ACH",
    });
    assert.deepEqual(both.work[0].patch.setHeader, { mode_of_payment: "ACH" });

    const one = planModeChange({
      rows: [row("A", 1, "2026-10-01", "Cheque"), row("A", 2, "2026-11-01", "Cheque")],
      targetMode: "ACH",
      selectedKeys: ["A#1"],
    });
    assert.equal(one.work[0].patch.setHeader, undefined);
  });

  // Cancelling a document to write the value it already holds is pure loss: a new ID, detached
  // payments, and nothing different at the end of it.
  it("leaves bills that are already on the target method alone", () => {
    const plan = planModeChange({
      rows: [row("A", null, "2026-10-01", "ACH"), row("B", null, "2026-10-02", "Cheque")],
      targetMode: "ACH",
    });
    assert.equal(plan.amendCount, 1);
    assert.deepEqual(plan.work.map((w) => w.invoice), ["B"]);
    assert.deepEqual(plan.skipped.map((w) => w.invoice), ["A"]);
  });

  it("blocks with a reason rather than planning nothing", () => {
    assert.match(planModeChange({ rows: [row("A", null, "2026-10-01", "Cheque")] }).blocked, /Pick the method/);
    assert.match(
      planModeChange({ rows: [row("A", null, "2026-10-01", "ACH")], targetMode: "ACH" }).blocked,
      /already on ACH/,
    );
    assert.match(planModeChange({ rows: [], targetMode: "ACH" }).blocked, /Nothing selected/);
  });

  it("flags bills that already have payments against them", () => {
    const plan = planModeChange({
      rows: [row("A", null, "2026-10-01", "Cheque"), row("B", null, "2026-10-02", "Cheque")],
      targetMode: "ACH",
      paymentsByInvoice: { A: 2 },
    });
    assert.deepEqual(plan.atRisk.map((w) => w.invoice), ["A"]);
    assert.equal(plan.work.find((w) => w.invoice === "B").linkedPaymentCount, null, "unread is not zero");
  });

  it("treats a row with no method at all as something to change", () => {
    const plan = planModeChange({ rows: [row("A", null, "2026-10-01", undefined)], targetMode: "ACH" });
    assert.equal(plan.amendCount, 1);
    assert.deepEqual(plan.work[0].fromModes, []);
  });
});

describe("the patch the plan produces survives the round trip", () => {
  /**
   * 🔴 Rows are matched by due date because `installmentKey` is the dashboard's own ordinal over
   * *unpaid* rows (`outstanding-bills.js`) — so on a bill whose first installment is already paid,
   * row `#1` in the plan is row 2 in the document. Matching by index would write the wrong row.
   */
  it("targets the right schedule row when an earlier installment is already paid", () => {
    // The dashboard only ever saw the two unpaid rows, so its keys are #1 and #2.
    const plan = planModeChange({
      rows: [row("A", 1, "2026-11-01", "Cheque"), row("A", 2, "2026-12-01", "Cheque")],
      targetMode: "ACH",
      selectedKeys: ["A#1"],
    });
    // The document still has all three, paid one first.
    const draft = {
      mode_of_payment: "Cheque",
      payment_schedule: [
        { due_date: "2026-10-01", mode_of_payment: "Cheque" },
        { due_date: "2026-11-01", mode_of_payment: "Cheque" },
        { due_date: "2026-12-01", mode_of_payment: "Cheque" },
      ],
    };
    const applied = applyAmendPatch(draft, plan.work[0].patch);
    assert.deepEqual(applied.missed, []);
    assert.deepEqual(
      draft.payment_schedule.map((r) => r.mode_of_payment),
      ["Cheque", "ACH", "Cheque"],
      "only the row the clerk ticked moved",
    );
    assert.equal(draft.mode_of_payment, "Cheque", "one of three rows is not the bill's default");
    assert.equal(verifyAmendPatch(draft, plan.work[0].patch).ok, true);
  });

  it("verify fails when ERP hands back something the patch did not ask for", () => {
    const plan = planModeChange({ rows: [row("A", null, "2026-10-01", "Cheque")], targetMode: "ACH" });
    const asErpReturnedIt = {
      mode_of_payment: "ACH",
      payment_schedule: [{ due_date: "2026-10-01", mode_of_payment: "Cheque" }],
    };
    const v = verifyAmendPatch(asErpReturnedIt, plan.work[0].patch);
    assert.equal(v.ok, false);
    assert.deepEqual(v.mismatches, ["payment_schedule@2026-10-01.mode_of_payment"]);
  });

  it("tolerates a datetime where it expected a date", () => {
    const plan = planModeChange({ rows: [row("A", null, "2026-10-01", "Cheque")], targetMode: "ACH" });
    const draft = { payment_schedule: [{ due_date: "2026-10-01 00:00:00", mode_of_payment: "Cheque" }] };
    assert.deepEqual(applyAmendPatch(draft, plan.work[0].patch).missed, []);
  });
});

describe("describeModeChange — before the batch runs", () => {
  const plan = (over = {}) =>
    planModeChange({
      rows: [
        row("ACC-PINV-1", 1, "2026-10-01", "Cheque"),
        row("ACC-PINV-1", 2, "2026-11-01", "Cheque"),
        row("ACC-PINV-2", null, "2026-10-15", "Cheque"),
      ],
      targetMode: "ACH",
      ...over,
    });

  it("says how many documents get cancelled, not how many rows change", () => {
    const text = describeModeChange(plan(), { supplier: "SAMPLE Vendor 01" }).lines.join("\n");
    assert.match(text, /3 payments across 2 bills/);
    assert.match(text, /That is 2 cancels/);
    assert.match(text, /ACC-PINV-1 → ACC-PINV-1-1/);
  });

  it("warns that a batch can stop halfway, before it does", () => {
    const text = describeModeChange(plan()).lines.join("\n");
    assert.match(text, /if one fails, the ones before it have already happened/i);
  });

  it("names the bills whose payments come unstuck, and what this site does about it", () => {
    const detaches = describeModeChange(plan({ paymentsByInvoice: { "ACC-PINV-2": 1 } }), {
      unlinksPaymentsOnCancel: true,
    }).lines.join("\n");
    assert.match(detaches, /ACC-PINV-2/);
    assert.match(detaches, /detaches/i);

    const refuses = describeModeChange(plan({ paymentsByInvoice: { "ACC-PINV-2": 1 } }), {
      unlinksPaymentsOnCancel: false,
    }).lines.join("\n");
    assert.match(refuses, /refuse to cancel/i);
    assert.doesNotMatch(refuses, /detaches/i);
  });

  it("mentions the bills it is leaving alone", () => {
    const p = planModeChange({
      rows: [row("A", null, "2026-10-01", "ACH"), row("B", null, "2026-10-02", "Cheque")],
      targetMode: "ACH",
    });
    assert.match(describeModeChange(p).lines.join("\n"), /1 bill already on ACH is left alone/);
  });
});

describe("summarizeModeChange — one outcome per bill", () => {
  it("reports each bill separately", () => {
    const told = summarizeModeChange([
      { invoice: "A", ok: true, amendedName: "A-1", verified: true },
      { invoice: "B", ok: true, amendedName: "B-1", verified: true },
    ]);
    assert.equal(told.ok, true);
    assert.deepEqual(told.lines, ["A → A-1 ✓", "B → B-1 ✓"]);
    assert.match(told.headline, /2 bills changed/);
  });

  // 🔴 The outcome that needs a human now, and it must lead — not be the third line of a summary
  // that opens with "1 of 2 changed".
  it("leads with a stranded document", () => {
    const told = summarizeModeChange([
      { invoice: "A", ok: true, amendedName: "A-1", verified: true },
      { invoice: "B", ok: false, cancelled: true, reason: "Cannot link cancelled document." },
      { invoice: "C", ok: false, cancelled: false, reason: "Not attempted — stopped after B." },
    ]);
    assert.equal(told.ok, false);
    assert.deepEqual(told.stranded, ["B"]);
    assert.match(told.headline, /cancelled with no replacement/i);
    assert.match(told.lines[1], /CANCELLED, not replaced/);
    assert.match(told.lines[2], /not changed/i);
  });

  it("does not call an unverified amendment a success", () => {
    const told = summarizeModeChange([{ invoice: "A", ok: true, amendedName: "A-1", verified: false }]);
    assert.equal(told.ok, false);
    assert.deepEqual(told.unverified, ["A"]);
    assert.match(told.lines[0], /did not read the method back/i);
  });

  it("stays quiet about verification when nothing was read back", () => {
    const told = summarizeModeChange([{ invoice: "A", ok: true, amendedName: "A-1" }]);
    assert.equal(told.ok, true);
    assert.equal(told.lines[0], "A → A-1 ✓");
  });
});

describe("the batch confirm names the amendments correctly too", () => {
  it("increments a bill that is already an amendment", () => {
    const plan = planModeChange({
      rows: [row("ACC-PINV-1-1", null, "2026-10-01", "Cheque")],
      targetMode: "ACH",
      amendmentsByInvoice: { "ACC-PINV-1-1": true },
    });
    assert.equal(plan.work[0].isAmendment, true);
    const text = describeModeChange(plan).lines.join("\n");
    assert.match(text, /ACC-PINV-1-1 → ACC-PINV-1-2/);
    assert.doesNotMatch(text, /1-1-1/);
  });

  it("omits the examples rather than guessing when the site does not use the counter", () => {
    const plan = planModeChange({ rows: [row("A", null, "2026-10-01", "Cheque")], targetMode: "ACH" });
    const text = describeModeChange(plan, { amendCounter: false }).lines.join("\n");
    assert.match(text, /a new ERPNext ID\. The vendor's own numbers/);
    assert.doesNotMatch(text, /→/);
  });
});
