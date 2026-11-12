/**
 * The lines and taxes both Doc form pages share (plan 2026-10-25 closeout, item 4): what each page
 * did the same is written once, and what only one form does comes in through its options.
 *
 * @covers src/doc-form-lines-ui.js
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createDocLines } from "../src/doc-form-lines-ui.js";

function fakePage(over = {}) {
  const calls = { status: [], repaint: [], toast: [], api: [], focusAfter: 0, edits: 0 };
  let doc = over.doc || { name: "PO-1", docstatus: 0, items: [{ item_code: "A", qty: 2, rate: 5 }], taxes: [{}, {}], taxes_and_charges: "T" };
  const api = {
    setHeader: async (field, value) => {
      calls.api.push(["setHeader", field, value]);
      doc = { ...doc, taxes_and_charges: value };
      return { ok: true, doc, scratch: { dateExpected: "2026-11-06" } };
    },
    deleteTax: async (i) => {
      calls.api.push(["deleteTax", i]);
      doc = { ...doc, taxes: doc.taxes.slice(0, i) };
      return { ok: true, doc };
    },
    addItem: async () => {
      calls.api.push(["addItem"]);
      doc = { ...doc, items: [{}] };
      return { ok: true, doc };
    },
    deleteItem: async (ri) => {
      calls.api.push(["deleteItem", ri]);
      return { ok: true, doc };
    },
    ...over.api,
  };
  const page = {
    title: () => over.title || "Purchase Order",
    testIdPrefix: "doc",
    rateLabel: "Rate",
    el: () => over.el || {},
    api: () => api,
    lastDoc: () => doc,
    painting: () => false,
    editable: () => true,
    repaint: (res) => calls.repaint.push(res),
    refresh: async () => {},
    setStatus: (text, cls) => calls.status.push([text, cls]),
    noteUserEdit: () => (calls.edits += 1),
    showToast: (text) => calls.toast.push(text),
    logFocus: () => {},
    userMoves: { mark: () => 0, movedSince: () => false },
    calcUi: { getState: () => ({ mode: "idle" }), getInput: () => null, clear: () => {} },
    attachCalc: () => {},
    itemKeys: /** @type {any} */ ({ setMode: () => {}, focusCell: () => {}, busy: () => false }),
  };
  const opts = {
    tableKey: (t) => `doc-${t}`,
    lastRowToast: () => "Keep one line.",
    focusAfterLeaving: () => (calls.focusAfter += 1),
    taxNotes: { removedOn: new Set() },
    rows: {},
    ...over.opts,
  };
  return { lines: createDocLines(/** @type {any} */ (page), /** @type {any} */ (opts)), calls, opts, setDoc: (d) => (doc = d) };
}

describe("Remove all taxes", () => {
  it("clears the template first, then every row from the last, and repaints with the template's reply", async () => {
    const { lines, calls, opts } = fakePage();
    await lines.removeAllTaxes();
    assert.deepEqual(calls.api, [["setHeader", "taxes_and_charges", ""], ["deleteTax", 1], ["deleteTax", 0]]);
    assert.equal(calls.repaint.length, 1);
    assert.deepEqual(calls.repaint[0].doc.taxes, []);
    // doc-form's repaint keeps the scratch a reply carried (its Date Expected).
    assert.deepEqual(calls.repaint[0].scratch, { dateExpected: "2026-11-06" });
    assert.ok(opts.taxNotes.removedOn.has("PO-1"));
    assert.equal(lines.removingTaxes(), false);
  });
  it("says the form's own name when ERPNext put the template back", async () => {
    const { lines, calls } = fakePage({ title: "Bill" });
    await lines.removeAllTaxes({ quiet: true });
    assert.match(calls.status.at(-1)[0], /you removed all taxes on this bill\./);
  });
  it("the Bill's Allocate lock: nothing is removed and the clerk is told why", async () => {
    const { lines, calls } = fakePage({ opts: { taxesLocked: () => "Finish or cancel Allocate to stock before removing taxes." } });
    await lines.removeAllTaxes();
    assert.deepEqual(calls.api, []);
    assert.deepEqual(calls.status, [["Finish or cancel Allocate to stock before removing taxes.", "warn"]]);
  });
  it("a refused template clear stops there", async () => {
    const { lines, calls } = fakePage({ api: { setHeader: async () => ({ ok: false, reason: "No." }) } });
    await lines.removeAllTaxes();
    assert.deepEqual(calls.status, [["No.", "err"]]);
    assert.equal(calls.repaint.length, 0);
    assert.equal(lines.removingTaxes(), false);
  });
});

describe("one line to type in, and an empty line removed", () => {
  it("a form with no lines gets one; a form whose lines the clerk cannot add does not", async () => {
    const a = fakePage();
    a.setDoc({ name: "new-1", items: [] });
    await a.lines.ensureAtLeastOneItemRow({ items: [] });
    assert.deepEqual(a.calls.api, [["addItem"]]);
    const b = fakePage({ opts: { canAddLines: () => false } });
    await b.lines.ensureAtLeastOneItemRow({ items: [] });
    assert.deepEqual(b.calls.api, []);
  });
  it("leaving an empty line removes it through the page's own delete (the Bill keeps Rec'd)", async () => {
    const deleted = [];
    const { lines, calls, setDoc } = fakePage({ opts: { deleteLine: async (ri) => (deleted.push(ri), { ok: true, doc: {} }) } });
    setDoc({ name: "PO-1", items: [{ item_code: "A" }, { item_code: "" }] });
    await lines.cleanupEmptyItemRow(1, "");
    assert.deepEqual(deleted, [1]);
    assert.deepEqual(calls.api, []);
    assert.equal(calls.status.at(-1)[0], "Empty line removed.");
    assert.equal(calls.focusAfter, 1);
  });
  it("a line a create peek was opened from is kept", async () => {
    const { lines, calls, setDoc } = fakePage();
    setDoc({ name: "PO-1", items: [{ item_code: "A" }, { item_code: "" }] });
    lines.notePeekFrom({ dataset: { row: "1", field: "item_code" } }, "Item");
    await lines.cleanupEmptyItemRow(1, "");
    assert.deepEqual(calls.api, []);
  });
  it("back from a header box's peek with no header return (the Bill): nothing is written", async () => {
    const { lines, calls } = fakePage();
    lines.notePeekFrom({ dataset: { field: "customer" } }, "Customer");
    await lines.comeBackFromPeek("/app/customer/CUST-1");
    assert.deepEqual(calls.api, []);
  });
});

describe("the totals", () => {
  let saved;
  beforeEach(() => {
    saved = globalThis.document;
    const els = { "tot-qty": { textContent: "" }, "tot-amt": { innerHTML: "" } };
    globalThis.document = /** @type {any} */ ({ getElementById: (id) => els[id] || null, els });
  });
  afterEach(() => {
    globalThis.document = saved;
  });
  it("the line totals use the page's sums; none means hidden", () => {
    const el = { lineTotals: { hidden: true } };
    const { lines } = fakePage({ el, opts: { lineSums: () => ({ sumQty: () => 3, sumAmt: () => 12.5, formatTotal: (n) => `#${n}` }) } });
    lines.paintLineTotals({ items: [{}] });
    assert.equal(el.lineTotals.hidden, false);
    assert.equal(/** @type {any} */ (globalThis.document).els["tot-qty"].textContent, "#3");
    lines.paintLineTotals({ items: [] });
    assert.equal(el.lineTotals.hidden, true);
  });
  it("the money stack is skipped on a form with no taxes", () => {
    const el = { msItems: { innerHTML: "" } };
    fakePage({ el, opts: { showsTaxes: () => false } }).lines.paintMoneyStack({ items: [] });
    assert.equal(el.msItems.innerHTML, "");
    fakePage({ el }).lines.paintMoneyStack({ items: [] });
    assert.notEqual(el.msItems.innerHTML, "");
  });
});
