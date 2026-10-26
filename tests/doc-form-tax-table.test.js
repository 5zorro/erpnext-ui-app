/**
 * Plan 2026-10-25, R6a-1 step 3: the taxes table written once, the Bill's way
 * (`src/doc-form-tax-table-ui.js`), driven with stand-in cells, a stand-in table and api. On
 * doc-form these are new (5zorro 2026-10-26: "please merge the navigation", and the rate rule
 * "preferring the bill"); the spec `scaffold-bill-taxes` proves them on a real Item Receipt.
 *
 * @covers src/bill-form-page.js src/doc-form-page.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTaxTable } from "../src/doc-form-tax-table-ui.js";
import { BILL_TAX_SORTABLE_HEADERS } from "../src/bill-tax-sort.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
globalThis.requestAnimationFrame = (fn) => fn();

function cell(field, ri, value) {
  const listeners = {};
  const c = {
    value,
    tabIndex: 0,
    focused: 0,
    getAttribute: (a) => (a === "data-tax-field" ? field : a === "data-tax-row" ? String(ri) : null),
    closest: () => null,
    focus() {
      c.focused += 1;
    },
    select() {},
    addEventListener: (ev, fn) => (listeners[ev] ||= []).push(fn),
    fire: async (ev, arg) => {
      for (const fn of listeners[ev] || []) await fn(arg);
    },
  };
  return c;
}

const key = (k, shiftKey = false) => ({ key: k, shiftKey, preventDefault() {} });
const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(over = {}) {
  const calls = [];
  const state = {
    // net 400; row 0 is a 6% row, row 1 a fixed 20.00
    doc: {
      name: "MAT-PRE-1",
      net_total: 400,
      taxes: [
        { name: "t0", charge_type: "On Net Total", rate: 6, tax_amount: 24, account_head: "VAT", add_deduct_tax: "Add" },
        { name: "t1", charge_type: "Actual", rate: 0, tax_amount: 20, account_head: "Freight", add_deduct_tax: "Add" },
      ],
    },
    cells: [],
    dels: [],
  };
  const body = {
    innerHTML: "",
    querySelectorAll: (sel) => (sel === "[data-tax-row]" ? state.cells : sel === "[data-tax-del]" ? state.dels : []),
    querySelector: (sel) => {
      const m = sel.match(/data-tax-row="(\d+)"\]\[data-tax-field="(\w+)"/);
      return (m && state.cells.find((c) => c.getAttribute("data-tax-row") === m[1] && c.getAttribute("data-tax-field") === m[2])) || null;
    },
  };
  const taxAccount = { focused: 0, focus() { taxAccount.focused += 1; } };
  const el = {
    taxesBody: body,
    taxesTotals: { hidden: true },
    taxesSubtotal: { innerHTML: "" },
    taxAccount,
    addTax: { disabled: false, focus() {} },
  };
  const fixedByClerk = new Map();
  const api = {
    setTax: async (ri, field, value) => {
      calls.push(["setTax", ri, field, value]);
      return { ok: true, doc: state.doc };
    },
    deleteTax: async (ri) => (calls.push(["deleteTax", ri]), { ok: true, doc: state.doc }),
  };
  const deps = {
    el: () => el,
    head: () => null,
    api: () => api,
    lastDoc: () => state.doc,
    painting: () => false,
    editable: () => true,
    headers: BILL_TAX_SORTABLE_HEADERS,
    defaultSort: { key: "lineNo", asc: true },
    testIdPrefix: "doc",
    taxNotes: {
      fixedByClerk,
      fixedMarkerHtml: () => "",
      fixedNoteRowHtml: () => "",
      wireFixedNotes: () => {},
      followDoc: () => {},
    },
    mountLinkPicker: () => {},
    repaint: () => calls.push(["repaint"]),
    refresh: async () => calls.push(["refresh"]),
    setStatus: (text, cls) => calls.push(["status", text, cls]),
    noteUserEdit: () => {},
    sizeColumns: () => {},
    paintMoneyStack: () => {},
    ...over,
  };
  return { table: createTaxTable(/** @type {any} */ (deps)), calls, state, el, fixedByClerk };
}

describe("the shared taxes table: what it paints", () => {
  it("a fixed row's Rate % is worked out from the net total (20.00 of 400.00 is 5%)", () => {
    const { table, state } = setup();
    const html = table.rowsHtml(state.doc, [{ idx: 1, lineNo: 2, account_head: "Freight", description: "", charge_type: "Actual", rate: 0, tax_amount: 20, add_deduct_tax: "Add" }], true);
    assert.match(html, /value="5\.00" data-testid="doc-tax-1-rate"/);
  });

  it("the Line column; the Bill's own buttons sit beside ×", () => {
    const { table, state } = setup({
      testIdPrefix: "bill",
      rowButtonsHtml: (_t, idx) => `<button data-tax-alloc="${idx}"></button>`,
    });
    const html = table.rowsHtml(state.doc, [{ idx: 0, lineNo: 1, account_head: "VAT", description: "", charge_type: "On Net Total", rate: 6, tax_amount: 24, add_deduct_tax: "Add" }], true);
    assert.match(html, /<td><span class="ro">1<\/span><\/td>/);
    assert.match(html, /<button data-tax-alloc="0"><\/button>\s*<button type="button" class="del"/);
  });
});

describe("the shared taxes table: the Taxes subtotal under it (both pages, the Bill's layout)", () => {
  it("shows the sum of the rows, and hides with no rows", () => {
    const { table, state, el } = setup();
    table.paint(state.doc);
    assert.equal(el.taxesTotals.hidden, false);
    assert.equal(el.taxesSubtotal.innerHTML, `$44.<span class="money-cents">00</span>`);
    table.paint({ ...state.doc, taxes: [] });
    assert.equal(el.taxesTotals.hidden, true);
  });
});

describe("the shared taxes table: the walk and the writes (the Bill's way)", () => {
  it("every cell is out of the browser's Tab order; the walk moves it", () => {
    const { table, state } = setup();
    state.cells = [cell("account_head", 0, "VAT"), cell("rate", 0, "6"), cell("description", 0, "")];
    table.paint(state.doc);
    assert.deepEqual(state.cells.map((c) => c.tabIndex), [-1, -1, -1]);
  });

  it("Tab from Account on a % row goes to Rate %; on a fixed row to Amount", async () => {
    const { table, state } = setup();
    const a0 = cell("account_head", 0, "VAT");
    const r0 = cell("rate", 0, "6");
    const a1 = cell("account_head", 1, "Freight");
    const m1 = cell("tax_amount", 1, "20");
    state.cells = [a0, r0, a1, m1];
    table.paint(state.doc);
    await a0.fire("keydown", key("Tab"));
    await a1.fire("keydown", key("Tab"));
    await settle();
    assert.equal(r0.focused, 1);
    assert.equal(m1.focused, 1);
  });

  it("Tab past the last row's number goes to the Add box", async () => {
    const { table, state, el } = setup();
    const m1 = cell("tax_amount", 1, "20");
    state.cells = [m1];
    table.paint(state.doc);
    await m1.fire("keydown", key("Tab"));
    await settle();
    assert.equal(el.taxAccount.focused, 1);
  });

  it("a Rate typed on a fixed row writes its Amount from the net total (10% of 400 is 40.00)", async () => {
    const { table, state, calls } = setup();
    const r1 = cell("rate", 1, "10");
    state.cells = [r1];
    table.paint(state.doc);
    await r1.fire("change");
    await settle();
    assert.deepEqual(calls.find((c) => c[0] === "setTax"), ["setTax", 1, "tax_amount", "40"]);
  });

  it("an Amount typed on a % row is written as is, and the row is marked made fixed by the clerk", async () => {
    const { table, state, calls, fixedByClerk } = setup();
    const m0 = cell("tax_amount", 0, "30");
    state.cells = [m0];
    table.paint(state.doc);
    await m0.fire("change");
    assert.deepEqual(calls.find((c) => c[0] === "setTax"), ["setTax", 0, "tax_amount", "30"]);
    assert.equal(fixedByClerk.get("t0"), 6);
  });

  it("× says why when the page blocks it (the Bill's open Allocate)", async () => {
    const del = { tabIndex: 0, disabled: false, listeners: [], getAttribute: () => "0", addEventListener(_e, fn) { del.listeners.push(fn); } };
    const { table, state, calls } = setup({ deleteBlockedReason: () => "Finish or cancel Allocate to stock before removing a tax row." });
    state.dels = [del];
    table.paint(state.doc);
    assert.equal(del.disabled, true);
    await del.listeners[0]();
    assert.deepEqual(calls.at(-1), ["status", "Finish or cancel Allocate to stock before removing a tax row.", "warn"]);
    assert.equal(calls.some((c) => c[0] === "deleteTax"), false);
  });
});

describe("the shared taxes table: both pages use it", () => {
  for (const [page, prefix] of [
    ["../src/bill-form-page.js", "bill"],
    ["../src/doc-form-page.js", "doc"],
  ]) {
    it(`${page.slice(7)} keeps no tax walk of its own`, () => {
      const src = read(page);
      assert.match(src, new RegExp(`createTaxTable\\(\\{[\\s\\S]*?headers: BILL_TAX_SORTABLE_HEADERS,\\s*defaultSort: \\{ key: "lineNo"[\\s\\S]*?testIdPrefix: "${prefix}"`));
      assert.doesNotMatch(src, /function paintTaxes\(|taxTabGuard|neighborTaxCell|syncTaxRateAndAmount/);
    });
  }
});
