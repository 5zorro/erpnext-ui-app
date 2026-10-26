/**
 * Plan 2026-10-25, R6a-1 step 3: the lines table's rows written once (`src/doc-form-item-rows-ui.js`),
 * driven here with stand-in cells, a stand-in table and a stand-in api; each page's settings (the
 * Bill's and doc-form's) are checked to paint what that page painted before.
 *
 * @covers src/bill-form-page.js src/doc-form-page.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createItemRows } from "../src/doc-form-item-rows-ui.js";

const settle = () => new Promise((r) => setTimeout(r, 0));

function cell(field, ri, value, dataset = {}) {
  const listeners = {};
  return {
    tagName: "INPUT",
    type: "text",
    value,
    checked: false,
    dataset: { ...dataset },
    getAttribute: (a) => (a === "data-field" ? field : a === "data-row" ? String(ri) : null),
    closest: () => null,
    addEventListener: (ev, fn) => (listeners[ev] ||= []).push(fn),
    async fire(ev) {
      for (const fn of listeners[ev] || []) await fn();
    },
  };
}

function delButton(ri) {
  const btn = /** @type {any} */ ({ listeners: [] });
  btn.getAttribute = () => String(ri);
  btn.addEventListener = (_ev, fn) => btn.listeners.push(fn);
  btn.click = async () => {
    for (const fn of btn.listeners) await fn();
  };
  return btn;
}

const COLS = [
  { label: "Line", field: "__line_no", displayOnly: true, sortKey: "lineNo" },
  { label: "Item Code", field: "item_code" },
  { label: "Qty", field: "qty" },
  { label: "Rate", field: "rate" },
  { label: "Amount", field: null, displayOnly: true },
];

function setup(over = {}) {
  const calls = [];
  const state = {
    doc: { name: "PO-1", items: [{ item_code: "A", qty: 1, rate: 10 }, { item_code: "B", qty: 2, rate: 5 }] },
    editable: true,
    dest: { field: "qty", rowIndex: 1 },
    setItemRes: null,
    inputs: [],
    dels: [],
  };
  const table = {
    innerHTML: "",
    querySelectorAll: (sel) => (sel === "input[data-row]" ? state.inputs : sel === "button[data-del]" ? state.dels : []),
  };
  const api = {
    setItem: async (ri, field, value) => {
      calls.push(["setItem", ri, field, value]);
      return state.setItemRes || { ok: true, doc: state.doc };
    },
    addItem: async () => {
      calls.push(["addItem"]);
      const doc = { ...state.doc, items: [...state.doc.items, { item_code: "" }] };
      return { ok: true, doc };
    },
  };
  const wired = [];
  const deps = {
    table: () => table,
    api: () => api,
    lastDoc: () => state.doc,
    painting: () => false,
    editable: () => state.editable,
    lines: (doc) => (doc && Array.isArray(doc.items) ? doc.items : []),
    keyField: "item_code",
    itemKeys: {
      nextAfterEdit: () => state.dest,
      busy: () => false,
      wireCell: (inp, opts) => wired.push(opts),
    },
    calcActiveOn: () => false,
    testIdPrefix: "doc",
    rateLabel: "Rate",
    cellsOf: (model) => model.cells,
    canDeleteLines: () => true,
    deleteSkipsTab: true,
    afterRows: () => calls.push(["afterRows"]),
    navFields: () => ["item_code", "qty", "rate"],
    isMoneyField: (field) => field === "rate",
    linkDoctype: (field) => (field === "item_code" ? "Item" : null),
    mountLinkPicker: (_inp, doctype) => calls.push(["picker", doctype]),
    attachCalc: (_inp, opts) => calls.push(["calc", opts.kind]),
    deleteLine: async (ri) => (calls.push(["deleteLine", ri]), state.deleteRes),
    repaint: (res) => calls.push(["repaint", res.doc && res.doc.name]),
    lastRowToast: () => "Must have at least 1 row on the items table",
    showToast: (text) => calls.push(["toast", text]),
    setStatus: (text, cls) => calls.push(["status", text, cls]),
    noteUserEdit: () => calls.push(["edited"]),
    setItemCellMode: () => {},
    focusItemCell: (ri, field, opts) => calls.push(["focus", ri, field, opts && opts.mode]),
    focusAfterLeaving: () => calls.push(["left"]),
    userMoves: { mark: () => 0, movedSince: () => false },
    logFocus: () => {},
    refresh: async () => calls.push(["refresh"]),
    cleanupEmptyLine: async () => {},
    beginAmountBackIn: () => {},
    ...over,
  };
  return { rows: createItemRows(/** @type {any} */ (deps)), calls, state, table, wired };
}

const models = [
  { rowIndex: 0, cells: [1, "A", 1, 10, 10] },
  { rowIndex: 1, cells: [2, "B", 2, 5, 10] },
];

describe("the shared rows: what each page paints", () => {
  it("doc-form: the line number names the document; × is out of the Tab order", () => {
    const { rows } = setup({ lineNoTitle: () => "Purchase Order line number" });
    const html = rows.rowsHtml({}, models, COLS);
    assert.match(html, /<span class="ro" title="Purchase Order line number">1<\/span>/);
    assert.match(html, /data-del="0" title="Remove line" tabindex="-1" data-testid="doc-del-0"/);
    assert.match(html, /Amount ÷ Qty → Rate\)" data-testid="doc-amt-1"/);
    assert.match(html, /data-testid="doc-cell-1-rate"/);
  });

  it("the Bill: its own cells first, its row attributes, × kept in the Tab order, Amount backs into Cost", () => {
    const { rows } = setup({
      testIdPrefix: "bill",
      rateLabel: "Cost",
      deleteSkipsTab: false,
      rowAttrs: (m) => ` data-wash-source="w${m.rowIndex}"`,
      cellHtml: (col) => (col.field === "item_code" ? "<td>BILL-OWN</td>" : null),
    });
    const html = rows.rowsHtml({}, models, COLS);
    assert.match(html, /<tr data-rowidx="0" data-wash-source="w0"><td class="num line-meta"><span class="ro">1<\/span><\/td><td>BILL-OWN<\/td>/);
    assert.match(html, /data-del="1" title="Remove line" data-testid="bill-del-1"/);
    assert.match(html, /Amount ÷ Qty → Cost\)" data-testid="bill-amt-0"/);
    assert.doesNotMatch(html, /doc-/);
  });

  it("a submitted document: read-only text, no × and no Amount button", () => {
    const { rows, state } = setup();
    state.editable = false;
    const html = rows.rowsHtml({}, models, COLS);
    assert.match(html, /<td class="cell-wrap"><span class="cell-text ro">A<\/span><\/td>/);
    assert.match(html, /<span class="ro money-cost">10\.00<\/span>/);
    assert.doesNotMatch(html, /data-del=|amount-back-in|<input/);
  });
});

describe("the shared rows: a cell's write", () => {
  it("a typed Rate is written as a number, then focus goes where the keys say", async () => {
    const { rows, calls, state } = setup();
    const rate = cell("rate", 0, "1,234.5");
    state.inputs = [rate];
    rows.paint(state.doc, models, COLS);
    await rate.fire("change");
    assert.deepEqual(
      calls.filter((c) => ["setItem", "repaint", "focus"].includes(c[0])),
      [["setItem", 0, "rate", "1234.5"], ["repaint", "PO-1"], ["focus", 1, "qty", "nav"]],
    );
    assert.equal(rows.applyInFlight(), null);
  });

  it("a value that did not change writes nothing", async () => {
    const { rows, calls, state } = setup();
    const qty = cell("qty", 1, "2");
    state.inputs = [qty];
    rows.paint(state.doc, models, COLS);
    await qty.fire("change");
    assert.equal(calls.some((c) => c[0] === "setItem"), false);
  });

  it("caps: text is upper-cased when the page has caps on; doc-form passes none", async () => {
    const { rows, calls, state } = setup({ capsOn: () => true });
    const item = cell("item_code", 0, "abc");
    state.inputs = [item];
    rows.paint(state.doc, models, COLS);
    await item.fire("change");
    assert.deepEqual(calls.find((c) => c[0] === "setItem"), ["setItem", 0, "item_code", "ABC"]);
  });

  it("a refused write the page takes (the Bill's Qty over the PO) shows no error and does not reload", async () => {
    const taken = [];
    const { rows, calls, state } = setup({
      afterRefused: async (field, ri, value, reason) => (taken.push([field, ri, value, reason]), true),
    });
    state.setItemRes = { ok: false, reason: "over billing" };
    const qty = cell("qty", 0, "9");
    state.inputs = [qty];
    rows.paint(state.doc, models, COLS);
    await qty.fire("change");
    assert.deepEqual(taken, [["qty", 0, "9", "over billing"]]);
    assert.equal(calls.some((c) => c[0] === "refresh" || c[2] === "err"), false);
  });

  it("a refused write nobody takes says why and reloads", async () => {
    const { rows, calls, state } = setup();
    state.setItemRes = { ok: false, reason: "nope" };
    const qty = cell("qty", 0, "9");
    state.inputs = [qty];
    rows.paint(state.doc, models, COLS);
    await qty.fire("change");
    assert.deepEqual(calls.slice(-2), [["status", "nope", "err"], ["refresh"]]);
  });

  it("Tab past the last box adds a line and lands on its Item", async () => {
    const { rows, calls, state } = setup();
    state.dest = { addRow: true };
    const rate = cell("rate", 1, "6");
    state.inputs = [rate];
    rows.paint(state.doc, models, COLS);
    await rate.fire("change");
    assert.deepEqual(calls.slice(-2), [["focus", 2, "item_code", "nav"], ["status", "Line added.", undefined]]);
  });

  it("each cell gets the keys, the pick list on a link field, the tape on Qty and Rate", () => {
    const { rows, calls, state, wired } = setup();
    state.inputs = [cell("item_code", 0, "A"), cell("qty", 0, "1"), cell("rate", 0, "10")];
    rows.paint(state.doc, models, COLS);
    assert.deepEqual(wired.map((w) => w.field), ["item_code", "qty", "rate"]);
    assert.deepEqual(calls.filter((c) => c[0] === "picker" || c[0] === "calc"), [["picker", "Item"], ["calc", "qty"], ["calc", "rate"]]);
  });
});

describe("the shared rows: ×", () => {
  it("clearing the only line repaints through the page's own hook (the Bill drops its assignment)", async () => {
    const cleared = [];
    const { rows, calls, state } = setup({ repaintCleared: (res, ri) => cleared.push([res.doc.name, ri]) });
    state.deleteRes = { ok: true, clearedLastRow: true, doc: { name: "PO-1" } };
    const del = delButton(0);
    state.dels = [del];
    rows.paint(state.doc, models, COLS);
    await del.click();
    await settle();
    assert.deepEqual(cleared, [["PO-1", 0]]);
    assert.deepEqual(calls.slice(-2), [["toast", "Must have at least 1 row on the items table"], ["status", "Last line cleared.", undefined]]);
  });

  it("removing a line repaints and says so", async () => {
    const { rows, calls, state } = setup();
    state.deleteRes = { ok: true, doc: { name: "PO-1" } };
    const del = delButton(1);
    state.dels = [del];
    rows.paint(state.doc, models, COLS);
    await del.click();
    assert.deepEqual(calls.slice(-4), [["deleteLine", 1], ["edited"], ["repaint", "PO-1"], ["status", "Line removed.", undefined]]);
  });
});
