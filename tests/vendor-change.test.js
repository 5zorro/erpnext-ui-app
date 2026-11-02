import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isVendorSwitch, vendorChangeLosses, vendorChangeDialogSpec } from "../src/vendor-change.js";
import { clearBeforeVendorSwitch } from "../src/vendor-change-ui.js";

/** Museum OI-200 (5zorro's option A, 2026-11-01). */

describe("isVendorSwitch", () => {
  it("is a switch only from one vendor to another", () => {
    assert.equal(isVendorSwitch("ALPINE SUPPLY CO", "SUMMIT TRADERS"), true);
    assert.equal(isVendorSwitch("", "SUMMIT TRADERS"), false, "a first pick clears nothing");
    assert.equal(isVendorSwitch(null, "SUMMIT TRADERS"), false);
    assert.equal(isVendorSwitch("ALPINE SUPPLY CO", ""), false, "clearing the box is not a switch");
    assert.equal(isVendorSwitch(" alpine supply co ", "ALPINE SUPPLY CO"), false);
  });
});

describe("vendorChangeLosses", () => {
  it("lists nothing when the clerk has typed nothing but the vendor", () => {
    const doc = {
      supplier: "ALPINE SUPPLY CO",
      address_display: "1 Main St",
      payment_terms_template: "Net 30",
      due_date: "2026-12-01",
      items: [{ item_code: "", qty: 0, amount: 0 }],
      taxes: [{ tax_amount: 0, rate: 0 }],
    };
    assert.deepEqual(vendorChangeLosses(doc), []);
    assert.deepEqual(vendorChangeLosses(null), []);
  });

  it("lists the typed header fields, the lines, their sources, charges and the memo", () => {
    const doc = {
      bill_no: "INV-77",
      bill_date: "2026-10-30",
      remarks: "call first",
      items: [
        { item_code: "SKU-1", qty: 2, purchase_order: "PUR-ORD-2026-00040" },
        { item_code: "SKU-2", qty: 1, purchase_order: "PUR-ORD-2026-00040", purchase_receipt: "MAT-PRE-2026-00009" },
        { item_code: "", qty: 0 },
      ],
      taxes: [{ tax_amount: 12.5 }, { rate: 6 }, { tax_amount: 0, rate: 0 }],
    };
    assert.deepEqual(vendorChangeLosses(doc, { dateExpected: "11/05/2026", amountDue: "120.00" }), [
      "the vendor's invoice number (INV-77)",
      "the invoice date (2026-10-30)",
      "the date expected (11/05/2026)",
      "the amount due (120.00)",
      "2 lines",
      "the link to PUR-ORD-2026-00040, MAT-PRE-2026-00009",
      "2 charge and tax rows",
      "the memo",
    ]);
  });

  it("names three sources and counts the rest", () => {
    const items = ["A", "B", "C", "D", "E"].map((s) => ({ item_code: s, qty: 1, purchase_order: `PO-${s}` }));
    assert.deepEqual(vendorChangeLosses({ items }), ["5 lines", "the link to PO-A, PO-B, PO-C and 2 more"]);
    assert.deepEqual(vendorChangeLosses({ items: items.slice(0, 1), taxes: [{ tax_amount: 3 }] }), [
      "1 line",
      "the link to PO-A",
      "1 charge or tax row",
    ]);
  });
});

describe("vendorChangeDialogSpec", () => {
  it("names both vendors, says what clears, and puts Keep first", () => {
    const s = vendorChangeDialogSpec({
      from: "ALPINE SUPPLY CO",
      to: "SUMMIT TRADERS",
      docLabel: "bill",
      losses: ["2 lines", "the memo"],
    });
    assert.equal(s.message, "Change the vendor from ALPINE SUPPLY CO to SUMMIT TRADERS?");
    assert.match(s.detail, /clears this whole bill: 2 lines; the memo\./);
    assert.match(s.detail, /screenshot/);
    assert.deepEqual(s.buttons, ["Keep ALPINE SUPPLY CO", "Change vendor and clear"]);
    assert.deepEqual(s.actions, ["keep", "clear"]);
  });
});

describe("clearBeforeVendorSwitch (the page half)", () => {
  const run = async (answer) => {
    const said = [];
    const logged = [];
    const cleared = [];
    const box = { value: "SUMMIT TRADERS" };
    const go = await clearBeforeVendorSwitch({
      api: { clearForVendorChange: async () => (answer instanceof Error ? Promise.reject(answer) : answer) },
      value: "SUMMIT TRADERS",
      box,
      kept: "ALPINE SUPPLY CO",
      docLabel: "bill",
      setStatus: (t, k) => said.push([t, k]),
      log: (e, d) => logged.push(`${e} ${d}`),
      onCleared: (res) => cleared.push(res.doc),
    });
    return { go, said, logged, cleared, box: box.value };
  };

  it("a first pick (nothing to clear) goes on and touches nothing", async () => {
    assert.deepEqual(await run({ ok: true, cleared: false }), { go: true, said: [], logged: [], cleared: [], box: "SUMMIT TRADERS" });
  });
  it("Keep: stops, puts the old vendor back in the box, says nothing was cleared", async () => {
    const r = await run({ ok: false, kept: true, supplier: "ALPINE SUPPLY CO" });
    assert.equal(r.go, false);
    assert.equal(r.box, "ALPINE SUPPLY CO");
    assert.deepEqual(r.said, [["Kept ALPINE SUPPLY CO; nothing cleared.", undefined]]);
  });
  it("cleared: repaints, keeps the new vendor in the box, goes on", async () => {
    const r = await run({ ok: true, cleared: true, doc: { name: "new-1" } });
    assert.equal(r.go, true);
    assert.deepEqual(r.cleared, [{ name: "new-1" }]);
    assert.equal(r.box, "SUMMIT TRADERS");
  });
  it("a call that throws stops the switch: no vendor is set on a half-cleared document", async () => {
    const r = await run(new Error("handler gone"));
    assert.equal(r.go, false);
    assert.equal(r.box, "ALPINE SUPPLY CO");
    assert.match(r.said[0][0], /Could not clear the bill for the new vendor: handler gone/);
    assert.equal(r.said[0][1], "err");
  });
});
