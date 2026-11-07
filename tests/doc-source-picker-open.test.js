/**
 * Opening a Doc form's source picker, written once for every Doc form (plan 2026-10-25 closeout,
 * item 4): the checks first, the pick's session, the one in flight, and another document
 * forgetting the session (the Bill's way).
 *
 * @covers src/doc-source-picker-open.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSourcePickerOpener } from "../src/doc-source-picker-open.js";

function opener(over = {}) {
  const runs = [];
  const status = [];
  let release;
  const picker = createSourcePickerOpener({
    api: () => ({ listSourceSlice: () => {} }),
    available: () => true,
    editable: () => true,
    lastDoc: () => ({ supplier: "" }),
    partyBox: () => /** @type {any} */ ({ value: "" }),
    title: () => "Purchase Order",
    sourceLabel: () => "Select PO",
    anotherDialogOpen: () => false,
    vendorIsMissing: async () => false,
    setStatus: (t, c) => status.push([t, c]),
    logFocus: () => {},
    run: (sup, trigger) => {
      runs.push([sup, trigger]);
      return new Promise((r) => (release = r));
    },
    ...over,
  });
  return { picker, runs, status, release: () => release({ ok: true }) };
}

describe("before the picker opens", () => {
  it("not a draft, no vendor, another dialog open: it does not", async () => {
    assert.equal((await opener({ editable: () => false }).picker.open("ACME")).reason, "not_editable");
    const none = opener();
    assert.equal((await none.picker.open("")).reason, "no_supplier");
    assert.deepEqual(none.status, [["Pick a vendor before Select PO.", "warn"]]);
    assert.equal((await opener({ anotherDialogOpen: () => true }).picker.open("ACME")).reason, "already_open");
    assert.equal((await opener({ vendorIsMissing: async () => true }).picker.open("ACME", { trigger: "toolbar" })).reason, "vendor_missing");
  });
  it("a vendor picked from the list was checked already", async () => {
    let asked = 0;
    const o = opener({ vendorIsMissing: async () => ((asked += 1), true) });
    o.picker.open("ACME", { trigger: "link_pick" });
    await Promise.resolve();
    assert.equal(asked, 0);
    assert.deepEqual(o.runs, [["ACME", "link_pick"]]);
  });
});

describe("the pick's session", () => {
  it("closed for this vendor: leaving the box does not open it again; the toolbar does", async () => {
    const o = opener();
    o.picker.notePick("ACME");
    o.picker.noteClosed("ACME");
    assert.equal((await o.picker.open("ACME", { trigger: "blur" })).reason, "pick_closed");
    o.picker.open("ACME", { trigger: "toolbar" });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(o.runs, [["ACME", "toolbar"]]);
  });
  it("another document forgets it", async () => {
    const o = opener();
    o.picker.notePick("ACME");
    o.picker.noteClosed("ACME");
    o.picker.forget();
    assert.equal(o.picker.pickedSupplier(), "");
    o.picker.open("ACME", { trigger: "blur" });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(o.runs, [["ACME", "blur"]]);
  });
  it("a second ask for the same vendor while one opens gets that one", async () => {
    const o = opener();
    const a = o.picker.open("ACME", { trigger: "blur" });
    await new Promise((r) => setImmediate(r));
    const b = o.picker.open("ACME", { trigger: "blur" });
    await new Promise((r) => setImmediate(r));
    assert.equal(o.runs.length, 1);
    o.release();
    assert.deepEqual(await a, await b);
  });
});
