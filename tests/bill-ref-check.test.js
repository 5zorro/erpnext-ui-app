import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBillRef,
  billRefsEqual,
  evaluateBillRef,
  billRefContextFromSnapshot,
  compareBillRefToRecentPattern,
  billRefWaitingForVendorResult,
  resolveBillRefSupplier,
  BILL_REF_WAITING_FOR_VENDOR_TITLE,
} from "../src/bill-ref-check.js";

describe("bill-ref-check", () => {
  it("normalizes whitespace and case", () => {
    assert.equal(normalizeBillRef("  ASI-77821 "), "asi-77821");
    assert.ok(billRefsEqual("ASI-77821", "asi-77821"));
    assert.equal(billRefsEqual("", "x"), false);
  });

  it("idle when Ref empty", () => {
    const r = evaluateBillRef("", { existingBills: [{ name: "PI-1", bill_no: "X" }] });
    assert.equal(r.status, "idle");
  });

  it("flags duplicate on same vendor as high", () => {
    const r = evaluateBillRef("INV-1", {
      currentBillName: "PI-NEW",
      supplier: "SUP-A",
      existingBills: [
        {
          name: "PI-OLD",
          bill_no: "INV-1",
          supplier: "SUP-A",
          posting_date: "2026-07-01",
          grand_total: 100,
        },
      ],
    });
    assert.equal(r.status, "warn");
    assert.equal(r.warnings[0].code, "duplicate");
    assert.equal(r.warnings[0].severity, "high");
  });

  it("ignores self when current Bill name matches", () => {
    const r = evaluateBillRef("INV-1", {
      currentBillName: "PI-1",
      existingBills: [{ name: "PI-1", bill_no: "INV-1", supplier: "SUP-A" }],
    });
    assert.equal(r.status, "ok");
  });

  it("flags PO logbook title paste", () => {
    const r = evaluateBillRef("JOE-0001", {
      linkedPoTitles: ["JOE-0001"],
      linkedPoNames: ["PUR-ORD-2026-00001"],
    });
    assert.ok(r.warnings.some((w) => w.code === "logbook_po"));
  });

  it("flags vendor account number (Customer Number At Supplier)", () => {
    const r = evaluateBillRef("ACCT-998877", {
      vendorAccountNumbers: ["ACCT-998877"],
    });
    const w = r.warnings.find((x) => x.code === "vendor_account");
    assert.ok(w);
    assert.match(w.message, /account # at this vendor/i);
  });

  it("billRefContextFromSnapshot pulls titles and account #s", () => {
    const ctx = billRefContextFromSnapshot({
      linkedPos: [{ name: "PO-1", title: "TO0001" }],
      vendorAccountNumbers: ["CUST-44192"],
    });
    assert.deepEqual(ctx.linkedPoTitles, ["TO0001"]);
    assert.deepEqual(ctx.vendorAccountNumbers, ["CUST-44192"]);
  });

  it("S0 vs SO pattern: not like the others after dropping finance-charge outlier", () => {
    const recent = [
      "SO-123456",
      "SO-123457",
      "SO-123558",
      "SO-123655",
      "FIN CHRGE-001",
      "SO-123788",
    ];
    const cmp = compareBillRefToRecentPattern("S0-123895", recent);
    assert.equal(cmp.ok, false);
    assert.equal(cmp.droppedOutlier, "FIN CHRGE-001");
    assert.ok(cmp.reasons.some((r) => /letter\/digit|position/i.test(r)));

    const r = evaluateBillRef("S0-123895", { recentVendorRefs: recent });
    const w = r.warnings.find((x) => x.code === "pattern");
    assert.ok(w);
    assert.match(w.message, /Not like the others/i);
    assert.match(String(w.detail), /SO-123456/);
    assert.match(String(w.detail), /FIN CHRGE-001/);
  });

  it("matching SO-style ref against same history is ok", () => {
    const recent = [
      "SO-123456",
      "SO-123457",
      "SO-123558",
      "SO-123655",
      "FIN CHRGE-001",
      "SO-123788",
    ];
    const cmp = compareBillRefToRecentPattern("SO-123895", recent);
    assert.equal(cmp.ok, true);
    assert.equal(cmp.droppedOutlier, "FIN CHRGE-001");
  });

  it("billRefWaitingForVendorResult uses field-specific copy", () => {
    const r = billRefWaitingForVendorResult();
    assert.equal(r.status, "waiting");
    assert.equal(r.title, BILL_REF_WAITING_FOR_VENDOR_TITLE);
    assert.match(r.title, /Supplier ref no validation/i);
  });

  it("resolveBillRefSupplier prefers doc then hints", () => {
    assert.equal(
      resolveBillRefSupplier({
        docSupplier: "Doc Vendor",
        domSupplier: "DOM Vendor",
        pendingPickSupplier: "Pick Vendor",
      }),
      "Doc Vendor",
    );
    assert.equal(
      resolveBillRefSupplier({
        domSupplier: "DOM Vendor",
        pendingPickSupplier: "Pick Vendor",
      }),
      "DOM Vendor",
    );
    assert.equal(
      resolveBillRefSupplier({ pendingPickSupplier: "Pick Vendor" }),
      "Pick Vendor",
    );
    assert.equal(resolveBillRefSupplier({}), "");
  });
});
