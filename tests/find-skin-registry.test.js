import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FIND_SKINS,
  FIND_SKIN_DOCTYPES,
  findSkinFor,
  findSkinTitle,
  findSkinEntryLabel,
  findPartyLabel,
  focusFor,
  findSearchValues,
  findVanillaListRoute,
} from "../src/find-skin-registry.js";
import { DOC_SKIN_INDEX } from "../src/lens-context.js";
import { findSkinSampleRows, groupRowsByParty } from "../src/find-skin-mock.js";

describe("FIND_SKINS table", () => {
  it("covers every document in the sample-data flow", () => {
    assert.deepEqual([...FIND_SKIN_DOCTYPES].sort(), [
      "payment-entry",
      "purchase-invoice",
      "purchase-order",
      "purchase-receipt",
      "quotation",
      "sales-invoice",
      "sales-order",
    ]);
  });

  it("every skin has two searches (party and ref), a status list and columns", () => {
    for (const dt of FIND_SKIN_DOCTYPES) {
      const s = FIND_SKINS[dt];
      assert.equal(s.doctypeKey, dt);
      assert.deepEqual(s.searches.map((x) => x.id).sort(), ["party", "ref"], dt);
      assert.ok(s.statuses.length > 1, dt);
      assert.ok(s.columns.some((c) => c.field === "status"), `${dt} shows status`);
      assert.ok(["request", "order", "fulfill", "invoice", "payment"].includes(s.washRole), dt);
    }
  });

  it("the skin index gets exactly one Find row per skin (derived, not a second list)", () => {
    const rows = DOC_SKIN_INDEX.filter((e) => e.match.listOnly);
    assert.deepEqual(rows.map((r) => r.match.doctypes[0]).sort(), [...FIND_SKIN_DOCTYPES].sort());
  });
});

describe("labels", () => {
  it("the page title is the Recent label for the list slot", () => {
    assert.equal(findSkinTitle("purchase-invoice"), "Find Bills");
    assert.equal(findSkinTitle("purchase-receipt"), "Find Item Receipts");
    assert.equal(findSkinTitle("payment-entry"), "Find Payments");
    assert.equal(findSkinEntryLabel("purchase-invoice"), "Bill");
  });

  it("the Doc lens says Estimate where ERPNext says Quotation (5zorro 2026-09-26)", () => {
    assert.equal(findSkinTitle("quotation"), "Find Estimates");
    assert.equal(findSkinEntryLabel("quotation"), "Estimate");
  });

  it("payments name the party by direction", () => {
    const pe = findSkinFor("Payment Entry");
    assert.equal(findPartyLabel(pe, "Pay"), "Vendor");
    assert.equal(findPartyLabel(pe, "Receive"), "Customer");
    assert.equal(findPartyLabel(findSkinFor("sales-order"), "Pay"), "Customer");
  });
});

describe("focusFor (OI-056: the entry point says which box)", () => {
  const bill = findSkinFor("purchase-invoice");
  it("a Find button means one document: the reference box", () => {
    assert.equal(focusFor(bill, { via: "find-button" }), "ref");
  });
  it("browsing (Recent, Doc tab) starts from the party", () => {
    assert.equal(focusFor(bill, { via: "browse" }), "party");
    assert.equal(focusFor(bill), "party");
  });
  it("a prefilled box wins", () => {
    assert.equal(focusFor(bill, { via: "find-button", prefill: { supplier: "SAMPLE Vendor 01" } }), "party");
  });
  it("no skin, no focus", () => {
    assert.equal(focusFor(null), "");
  });
});

describe("findVanillaListRoute (filters in the address, not typed into the page)", () => {
  it("carries only the skin's own search fields", () => {
    assert.equal(
      findVanillaListRoute("purchase-invoice", {
        values: { bill_no: "INV 42", supplier: "SAMPLE Vendor 01", discount: "x" },
      }),
      "/app/purchase-invoice?bill_no=INV%2042&supplier=SAMPLE%20Vendor%2001",
    );
  });
  it("drops empty values and gives the bare list when nothing is typed", () => {
    assert.equal(findVanillaListRoute("purchase-order", { values: { title: "  " } }), "/app/purchase-order");
  });
  it("adds a known status and a payment direction", () => {
    assert.equal(
      findVanillaListRoute("payment-entry", { status: "Draft", direction: "Receive" }),
      "/app/payment-entry?status=Draft&payment_type=Receive",
    );
    assert.equal(findVanillaListRoute("purchase-invoice", { status: "Bogus" }), "/app/purchase-invoice");
  });
  it("unknown doctype → empty", () => {
    assert.equal(findVanillaListRoute("item"), "");
  });
  it("findSearchValues trims and filters", () => {
    assert.deepEqual(
      findSearchValues(findSkinFor("purchase-order"), { title: " L-1 ", name: "PO-1", supplier: "" }),
      { title: "L-1" },
    );
  });
});

describe("find-skin-mock (stage F1 only)", () => {
  it("is deterministic and fills every column", () => {
    for (const dt of FIND_SKIN_DOCTYPES) {
      const a = findSkinSampleRows(dt);
      const b = findSkinSampleRows(dt);
      assert.deepEqual(a, b, dt);
      assert.equal(a.length, 12);
      for (const row of a) {
        for (const col of FIND_SKINS[dt].columns) {
          assert.ok(row[col.field] !== undefined && row[col.field] !== "", `${dt}.${col.field}`);
        }
        const lines = row.items.reduce((sum, l) => sum + Math.round(l.amount * 100), 0);
        const total = row.grand_total ?? row.paid_amount;
        assert.equal(lines, Math.round(total * 100), `${dt} lines add up`);
      }
    }
  });

  it("sample parties are SAMPLE-named and grouped busiest first", () => {
    const groups = groupRowsByParty(findSkinSampleRows("purchase-invoice", { count: 30 }));
    assert.ok(groups.every((g) => g.party.startsWith("SAMPLE Vendor ")));
    for (let i = 1; i < groups.length; i++) {
      assert.ok(groups[i - 1].rows.length >= groups[i].rows.length);
    }
    const receive = findSkinSampleRows("payment-entry", { direction: "Receive" });
    assert.ok(receive.every((r) => r.party.startsWith("SAMPLE Customer ")));
  });
});
