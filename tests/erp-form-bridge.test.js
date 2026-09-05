import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  formMatchesDoctype,
  stripHtmlPlain,
  rowNeedsItemEnrichment,
  pickItemAutofillFields,
  DOC_FORM_BRIDGE_VERSION,
  isMandatoryValuePresent,
  listMandatoryBlockersFromSnap,
  mergeSaveBlockers,
  shouldResetPostingDateToToday,
  postingDateYmd,
  doctypeKeyFromErpDoctype,
  supplierPartyBaseline,
  supplierPartyDetailChanged,
  isSupplierPartySettled,
  isSupplierPartyMetaOnlyChange,
  hasSupplierAddressDisplaySignals,
  supplierPartyQuietSliceMs,
  SUPPLIER_PARTY_SETTLE_MAX_MS,
  supplierSnapshotWaitSliceMs,
  supplierSnapshotAllowMetaOnly,
  supplierAddressSnapshotReady,
  supplierSnapshotReadyReason,
  hasSupplierBillingDisplay,
  SUPPLIER_BILLING_DISPLAY_FIELD,
} from "../src/erp-form-bridge.js";

describe("formMatchesDoctype", () => {
  it("matches doctype on frm or doc", () => {
    assert.equal(
      formMatchesDoctype({ doctype: "Purchase Invoice", doc: { doctype: "Purchase Invoice" } }, "Purchase Invoice"),
      true,
    );
    assert.equal(
      formMatchesDoctype({ doctype: "X", doc: { doctype: "Purchase Invoice" } }, "Purchase Invoice"),
      true,
    );
    assert.equal(formMatchesDoctype({ doctype: "X", doc: { doctype: "X" } }, "Purchase Invoice"), false);
    assert.equal(formMatchesDoctype(null, "Purchase Invoice"), false);
  });
});

describe("rowNeedsItemEnrichment", () => {
  it("true when description empty or rate zero", () => {
    assert.equal(rowNeedsItemEnrichment({ item_code: "SKU", description: "", rate: 0 }), true);
    assert.equal(rowNeedsItemEnrichment({ item_code: "SKU", description: "Tshirt", rate: 12 }), false);
    assert.equal(rowNeedsItemEnrichment({ item_code: "SKU", description: "<p>x</p>", rate: 0 }), true);
  });
});

describe("pickItemAutofillFields", () => {
  it("fills missing desc and rate from Item master", () => {
    const patch = pickItemAutofillFields(
      { item_name: "Tshirt", description: "<b>Tshirt</b>", last_purchase_rate: 9.5 },
      { description: "", rate: 0 },
    );
    assert.equal(patch.description, "Tshirt");
    assert.equal(patch.rate, 9.5);
  });

  it("skips fields already set", () => {
    const patch = pickItemAutofillFields(
      { item_name: "Tshirt", standard_rate: 3 },
      { description: "keep", rate: 1 },
    );
    assert.equal(patch.description, undefined);
    assert.equal(patch.rate, undefined);
  });
});

describe("stripHtmlPlain", () => {
  it("strips tags", () => {
    assert.equal(stripHtmlPlain("<p>Hi</p>"), "Hi");
    assert.equal(DOC_FORM_BRIDGE_VERSION, 20);
    assert.equal(SUPPLIER_PARTY_SETTLE_MAX_MS, 12000);
  });
});

describe("posting-date reset (Vanilla confirm yes-path)", () => {
  it("parses YYYY-MM-DD from posting_date", () => {
    assert.equal(postingDateYmd("2026-07-15"), "2026-07-15");
    assert.equal(postingDateYmd("2026-07-15 12:00:00"), "2026-07-15");
    assert.equal(postingDateYmd(""), "");
  });

  it("resets when Edit Posting Date is unchecked and date ≠ today", () => {
    assert.equal(
      shouldResetPostingDateToToday(
        { posting_date: "2026-07-15", set_posting_time: 0 },
        "2026-08-01",
      ),
      true,
    );
    assert.equal(
      shouldResetPostingDateToToday(
        { posting_date: "2026-08-01", set_posting_time: 0 },
        "2026-08-01",
      ),
      false,
    );
    assert.equal(
      shouldResetPostingDateToToday(
        { posting_date: "2026-07-15", set_posting_time: 1 },
        "2026-08-01",
      ),
      false,
    );
  });

  it("maps ERP doctype titles to shelf keys", () => {
    assert.equal(doctypeKeyFromErpDoctype("Purchase Invoice"), "purchase-invoice");
    assert.equal(doctypeKeyFromErpDoctype("Purchase Order"), "purchase-order");
  });
});

describe("live meta mandatory preflight helpers", () => {
  it("treats Check fields as always present", () => {
    assert.equal(isMandatoryValuePresent(0, "Check"), true);
    assert.equal(isMandatoryValuePresent("", "Data"), false);
    assert.equal(isMandatoryValuePresent("Alpine", "Data"), true);
    assert.equal(isMandatoryValuePresent([], "Table"), false);
    assert.equal(isMandatoryValuePresent([{}], "Table"), true);
  });

  it("formats parent and child-table missing fields like Vanilla", () => {
    const lines = listMandatoryBlockersFromSnap({
      parent: [
        { label: "Supplier", required: true, present: false },
        { label: "Credit To", required: true, present: true },
      ],
      tables: [
        {
          label: "Items",
          totalRows: 2,
          missing: [{ label: "Item Name", rows: [1, 2] }],
        },
      ],
    });
    assert.ok(lines.some((l) => /Supplier is required/i.test(l)));
    assert.ok(lines.some((l) => /Item Name is required in every row/i.test(l)));
    assert.ok(!lines.some((l) => /Credit To/i.test(l)));
  });

  it("merges Doc-skin and meta blockers uniquely", () => {
    assert.deepEqual(
      mergeSaveBlockers(
        ["Vendor (Supplier) is required.", "Amount Due must match Grand total (checksum)."],
        ["Supplier is required.", "Items is required."],
      ),
      [
        "Vendor (Supplier) is required.",
        "Amount Due must match Grand total (checksum).",
        "Supplier is required.",
        "Items is required.",
      ],
    );
  });
});

describe("supplier party settle (parallel-safe setHeader)", () => {
  it("not settled when only supplier link changed (party ajax still in flight)", () => {
    const baseline = supplierPartyBaseline({});
    const doc = { supplier: "Alpine Supply" };
    assert.equal(isSupplierPartySettled(doc, { targetSupplier: "Alpine Supply", baseline }), false);
  });

  it("not settled on supplier_name alone — wait for address_display", () => {
    const baseline = supplierPartyBaseline({});
    const doc = { supplier: "Alpine Supply", supplier_name: "Alpine Supply Co" };
    assert.equal(isSupplierPartyMetaOnlyChange(doc, baseline), true);
    assert.equal(isSupplierPartySettled(doc, { targetSupplier: "Alpine Supply", baseline }), false);
    assert.equal(
      isSupplierPartySettled(doc, { targetSupplier: "Alpine Supply", baseline, allowMetaOnly: true }),
      true,
    );
  });

  it("settled when address display fields change from baseline", () => {
    const baseline = supplierPartyBaseline({ supplier: "Alpine Supply" });
    const doc = {
      supplier: "Alpine Supply",
      supplier_name: "Alpine Supply Co",
      address_display: "<p>1 Mountain Rd<br>Denver, CO</p>",
    };
    assert.equal(supplierPartyDetailChanged(doc, baseline), true);
    assert.equal(isSupplierPartySettled(doc, { targetSupplier: "Alpine Supply", baseline }), true);
  });

  it("settled on same-supplier re-pick when address displays already present", () => {
    const baseline = supplierPartyBaseline({
      supplier: "Alpine Supply",
      supplier_name: "Alpine Supply Co",
      address_display: "<p>1 Mountain Rd</p>",
    });
    const doc = { ...baseline };
    assert.equal(hasSupplierAddressDisplaySignals(doc), true);
    assert.equal(isSupplierPartySettled(doc, { targetSupplier: "Alpine Supply", baseline }), true);
  });

  it("quiet slice respects deadline", () => {
    assert.equal(supplierPartyQuietSliceMs(1000, 900), 500);
    assert.equal(supplierPartyQuietSliceMs(Date.now() + 10000), 4000);
  });

  it("snapshot wait slice is short poll cadence", () => {
    assert.equal(supplierSnapshotWaitSliceMs(1000, 980), 50);
    assert.equal(supplierSnapshotWaitSliceMs(Date.now() + 5000), 500);
  });

  it("supplierAddressSnapshotReady requires address_display HTML, not link alone", () => {
    const baseline = supplierPartyBaseline({});
    const linkOnly = {
      supplier: "Alpine Supply",
      supplier_name: "Alpine Supply Co",
      supplier_address: "Alpine Supply-Billing",
    };
    assert.equal(hasSupplierBillingDisplay(linkOnly), false);
    assert.equal(
      supplierAddressSnapshotReady(linkOnly, {
        targetSupplier: "Alpine Supply",
        baseline,
        allowMetaOnlyAtDeadline: false,
      }),
      false,
    );
    assert.equal(
      supplierSnapshotReadyReason(linkOnly, {
        targetSupplier: "Alpine Supply",
        baseline,
        allowMetaOnlyAtDeadline: false,
      }).reason,
      "waiting",
    );
  });

  it("supplierAddressSnapshotReady requires address before deadline", () => {
    const baseline = supplierPartyBaseline({});
    const metaOnly = { supplier: "Alpine Supply", supplier_name: "Alpine Supply Co" };
    assert.equal(
      supplierAddressSnapshotReady(metaOnly, {
        targetSupplier: "Alpine Supply",
        baseline,
        allowMetaOnlyAtDeadline: false,
      }),
      false,
    );
    assert.equal(
      supplierAddressSnapshotReady(metaOnly, {
        targetSupplier: "Alpine Supply",
        baseline,
        allowMetaOnlyAtDeadline: true,
      }),
      true,
    );
    const withAddr = {
      supplier: "Alpine Supply",
      address_display: "<p>1 Mountain Rd</p>",
    };
    assert.equal(
      supplierAddressSnapshotReady(withAddr, {
        targetSupplier: "Alpine Supply",
        baseline,
        allowMetaOnlyAtDeadline: false,
      }),
      true,
    );
  });

  it("meta-only grace opens only near deadline", () => {
    const deadline = Date.now() + 5000;
    assert.equal(supplierSnapshotAllowMetaOnly(deadline), false);
    assert.equal(supplierSnapshotAllowMetaOnly(deadline, deadline - 2500), true);
  });
});

describe("erp-form-bridge-page save settle contract", () => {
  it("exposes saveDoc and listMandatoryMissing on the bridge", () => {
    const page = readFileSync(
      fileURLToPath(new URL("../electron/erp-form-bridge-page.js", import.meta.url)),
      "utf8",
    );
    assert.match(page, /listMandatoryMissing:\s*listMandatoryMissing/);
    assert.match(page, /saveDoc:\s*saveDoc/);
    assert.match(page, /takeLastSavedDoc:\s*takeLastSavedDoc/);
    assert.match(page, /peekShelveDoc:\s*peekShelveDoc/);
    assert.match(page, /pickShelveDoc/);
    assert.match(page, /alignPostingDateLikeVanillaOk/);
    assert.match(page, /withAutoAcceptConfirm/);
    assert.match(page, /isPostingDateConfirmMsg/);
    assert.match(page, /var VERSION = 20/);
    assert.match(page, /waitForSupplierBillingSnapshot/);
    assert.match(page, /hasSupplierBillingDisplay/);
    assert.match(page, /isSupplierPartyMetaOnlyChange/);
    assert.match(page, /clearRow:\s*clearRow/);
    assert.match(page, /SAVE_CALL_TIMEOUT_MS\s*=\s*12000/);
    assert.match(page, /collectVisibleVanillaErrors/);
    assert.match(page, /description:\s*true/);
    assert.match(page, /frappe\.desk\.form\.save\.savedocs/);
  });
});
