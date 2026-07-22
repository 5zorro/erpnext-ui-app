import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BILL_SAVE_TIMEOUT_MS,
  commitGateProgressLabel,
  commitGateSuccessLabel,
  listLocalSaveBlockers,
  commitGateSaveWarning,
  commitGateSaveEnabled,
  reduceCommitGatePhase,
  isPurchaseInvoiceListRoute,
  isPurchaseInvoiceFormRoute,
  classifyFindBillResult,
  printFormMatchesBill,
  normalizePrintIpcResult,
  timeoutFailure,
  billExpensesTaxOrientation,
  billToolbarActionMatrix,
  gateTriggerLabel,
  nextAfterGate,
  commitGateErpFailureView,
  isPrintPreviewRoute,
  classifyPrintNavResult,
} from "../src/bill-action-flow.js";
import {
  shouldOpenCommitGate,
  commitGateContinues,
  commitGateAllowsAction,
} from "../src/bill-toolbar.js";
import { BILL_EXPENSE_NOTE } from "../src/bill-map.js";

describe("commit gate save messaging (OI-057)", () => {
  it("uses distinct draft vs submit progress labels", () => {
    assert.equal(commitGateProgressLabel("save"), "Saving draft…");
    assert.equal(commitGateProgressLabel("submit"), "Saving & submitting…");
    assert.equal(commitGateSuccessLabel("save"), "Saved draft.");
    assert.equal(commitGateSuccessLabel("submit"), "Submitted.");
    assert.ok(!/submit/i.test(commitGateProgressLabel("save")));
  });

  it("lists checksum, vendor, and empty-items blockers", () => {
    const blockers = listLocalSaveBlockers({
      amountDue: "10",
      doc: { grand_total: 20, items: [], taxes: [] },
      supplier: "",
    });
    assert.ok(blockers.some((b) => /checksum|Grand total/i.test(b)));
    assert.ok(blockers.some((b) => /Vendor/i.test(b)));
    assert.ok(blockers.some((b) => /Item line/i.test(b)));
    assert.equal(commitGateSaveEnabled(blockers), false);
    assert.match(commitGateSaveWarning(blockers), /Cannot save yet/);
  });

  it("warns that ERPNext still validates when local blockers are clear", () => {
    const blockers = listLocalSaveBlockers({
      amountDue: "100",
      doc: { grand_total: 100, supplier: "Acme", items: [{ qty: 1, rate: 100, amount: 100 }] },
      supplier: "Acme",
    });
    assert.deepEqual(blockers, []);
    assert.equal(commitGateSaveEnabled(blockers), true);
    assert.match(commitGateSaveWarning(blockers), /live ERP meta|server-side rules/i);
  });

  it("surfaces ERP rejection distinctly from local preflight", () => {
    const view = commitGateErpFailureView("Mandatory field: Credit To");
    assert.equal(view.blocked, true);
    assert.match(view.title, /ERPNext rejected/i);
    assert.equal(view.blockers[0], "Mandatory field: Credit To");
  });

  it("reduces busy phases and recovers on error", () => {
    const start = reduceCommitGatePhase("idle", { type: "start-save", choice: "save" });
    assert.equal(start.phase, "saving");
    assert.equal(start.busy, true);
    assert.match(start.label, /Saving draft/);

    const submit = reduceCommitGatePhase("idle", { type: "start-save", choice: "submit" });
    assert.equal(submit.phase, "submitting");
    assert.match(submit.label, /submitting/i);

    const err = reduceCommitGatePhase("saving", { type: "error", reason: "Mandatory field missing" });
    assert.equal(err.phase, "error");
    assert.equal(err.busy, false);
    assert.equal(err.ok, false);
    assert.match(err.reason, /Mandatory/);

    const idle = reduceCommitGatePhase("error", { type: "reset" });
    assert.equal(idle.phase, "idle");
    assert.equal(idle.busy, false);
  });

  it("exposes a finite save timeout constant", () => {
    assert.ok(BILL_SAVE_TIMEOUT_MS >= 15_000);
  });

  it("shapes timeout failures without claiming success", () => {
    const t = timeoutFailure("Save draft");
    assert.equal(t.ok, false);
    assert.equal(t.timedOut, true);
    assert.match(t.reason, /timed out/i);
  });
});

describe("Find Bill list confirmation (OI-056)", () => {
  it("recognizes list vs form routes", () => {
    assert.equal(isPurchaseInvoiceListRoute("/app/purchase-invoice"), true);
    assert.equal(isPurchaseInvoiceListRoute("/desk/purchase-invoice"), true);
    assert.equal(isPurchaseInvoiceListRoute("/app/purchase-invoice/new"), false);
    assert.equal(isPurchaseInvoiceListRoute("/app/purchase-invoice/ACC-PINV-0001"), false);
    assert.equal(isPurchaseInvoiceFormRoute("/app/purchase-invoice/new"), true);
    assert.equal(isPurchaseInvoiceFormRoute("/app/purchase-invoice"), false);
  });

  it("rejects form landings as Find failures", () => {
    assert.equal(classifyFindBillResult("/app/purchase-invoice").ok, true);
    const form = classifyFindBillResult("/app/purchase-invoice/new");
    assert.equal(form.ok, false);
    assert.match(form.reason, /Bill list/i);
  });
});

describe("Print form identity (OI-058)", () => {
  it("requires a saved name and matching cur_frm doc", () => {
    assert.equal(printFormMatchesBill(null, "PINV-1").ok, false);
    assert.match(printFormMatchesBill(null, "PINV-1").reason, /No form loaded/);
    assert.equal(printFormMatchesBill({ doctype: "Purchase Invoice", name: "new" }, "PINV-1").ok, false);
    assert.equal(
      printFormMatchesBill({ doctype: "Purchase Invoice", name: "OTHER" }, "PINV-1").ok,
      false,
    );
    assert.equal(
      printFormMatchesBill({ doctype: "Purchase Invoice", name: "PINV-1" }, "PINV-1").ok,
      true,
    );
  });

  it("never normalizes a failed print into success", () => {
    assert.deepEqual(normalizePrintIpcResult({ ok: false, reason: "No form loaded." }), {
      ok: false,
      reason: "No form loaded.",
    });
    assert.equal(normalizePrintIpcResult({ ok: true, reason: "Print opened." }).ok, true);
    assert.equal(normalizePrintIpcResult(null).ok, false);
  });

  it("classifies Vanilla print preview navigation", () => {
    assert.equal(isPrintPreviewRoute("/app/print/Purchase%20Invoice/PINV-1"), true);
    assert.equal(isPrintPreviewRoute("/app/purchase-invoice/PINV-1"), false);
    assert.equal(
      classifyPrintNavResult("/app/print/Purchase%20Invoice/PINV-1", "PINV-1").ok,
      true,
    );
    assert.equal(classifyPrintNavResult("/app/purchase-invoice/PINV-1", "PINV-1").ok, false);
  });
});

describe("Expenses → Taxes orientation (OI-059)", () => {
  it("points Expenses copy at Items and Taxes and Charges", () => {
    const o = billExpensesTaxOrientation();
    assert.equal(o.note, BILL_EXPENSE_NOTE);
    assert.match(o.note, /two ways/i);
    assert.match(o.note, /Chart-of-Accounts-mapped/i);
    assert.match(o.note, /Taxes and Charges/i);
    assert.equal(o.itemsJumpLabel, "click here");
    assert.equal(o.jumpTarget, "bill-taxes-block");
  });
});

describe("T3 dogfood action matrix", () => {
  it("covers dirty discard, blocked save, and print-on-new rules", () => {
    const matrix = billToolbarActionMatrix();
    assert.ok(matrix.length >= 6);

    for (const row of matrix) {
      assert.equal(shouldOpenCommitGate(row.dirty), row.expectOpenGate);

      if (!row.choice) continue;

      if (row.choice === "discard" || row.choice === "save" || row.choice === "submit") {
        assert.equal(commitGateContinues(row.choice), true);
      }

      const allow = commitGateAllowsAction(row.action, row.choice, { isNew: !!row.isNew });
      if (row.id === "print-discard-new-blocked") {
        assert.equal(allow.ok, false);
        assert.match(allow.reason || "", row.expectReason);
        assert.equal(row.expectContinue, false);
      }

      if (row.blockers) {
        const warn = commitGateSaveWarning(row.blockers);
        if (row.expectReason) assert.match(warn, row.expectReason);
        if (row.blockers.length) {
          assert.equal(commitGateSaveEnabled(row.blockers), false);
          assert.equal(row.expectContinue, false);
        }
      }
    }
  });

  it("keeps discard path continuing for New while save stays conditional", () => {
    const discard = matrixRow("dirty-discard-new");
    assert.equal(discard.expectContinue, true);
    const blocked = matrixRow("dirty-save-blocked-checksum");
    assert.equal(blocked.expectContinue, false);
    assert.equal(commitGateSaveEnabled(blocked.blockers), false);
  });
});

describe("unified dirty-gate SSoT (toolbar + nav share one gate)", () => {
  it("labels the gate title from any trigger", () => {
    assert.equal(gateTriggerLabel({ kind: "toolbar", action: "find" }), "Find Bill…");
    assert.equal(gateTriggerLabel({ kind: "toolbar", action: "new" }), "New Bill");
    assert.equal(gateTriggerLabel({ kind: "toolbar", action: "print" }), "Print");
    assert.equal(gateTriggerLabel({ kind: "nav", label: "going Home" }), "going Home");
    assert.equal(gateTriggerLabel({ kind: "nav" }), "leaving this Bill");
    assert.equal(gateTriggerLabel(null), "continue");
  });

  it("routes continue to run-action for toolbar and proceed-nav for navigation", () => {
    const toolbar = { kind: "toolbar", action: "new" };
    const nav = { kind: "nav", navToken: "nav-1" };
    for (const choice of ["discard", "save", "submit"]) {
      assert.equal(nextAfterGate(toolbar, choice).then, "run-action");
      assert.equal(nextAfterGate(nav, choice).then, "proceed-nav");
    }
  });

  it("closes (stays) on cancel / unknown / missing trigger", () => {
    assert.equal(nextAfterGate({ kind: "nav" }, "cancel").then, "close");
    assert.equal(nextAfterGate({ kind: "toolbar", action: "find" }, null).then, "close");
    assert.equal(nextAfterGate(null, "save").then, "close");
  });
});

function matrixRow(id) {
  const row = billToolbarActionMatrix().find((r) => r.id === id);
  assert.ok(row, id);
  return row;
}
