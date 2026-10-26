/**
 * The lines table's keys, written once (plan 2026-10-25 step 0a): `src/item-table-keys-ui.js`,
 * driven here with stand-in inputs, and the two pages that call it. Step 0b's fixes (T-1 … T-3)
 * add their failing-first tests here.
 *
 * @covers src/bill-form-page.js src/doc-form-page.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createItemTableKeys } from "../src/item-table-keys-ui.js";
import { holdLineOrder } from "../src/item-sort-hold.js";
import { DEFAULT_ITEM_NAV_FIELDS } from "../src/link-picker-policy.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A stand-in for one cell's `<input>`: records its keydown handler and what took focus. */
function fakeInput(row, field, value, focused) {
  /** @type {Record<string, Function>} */
  const on = {};
  const inp = {
    dataset: { row: String(row), field },
    value,
    selectionStart: 0,
    selectionEnd: String(value).length,
    closest: () => null,
    addEventListener: (type, fn) => {
      on[type] = fn;
    },
    focus: () => focused.push(`${row}:${field}`),
    select: () => {},
    setSelectionRange: () => {},
    key: (key, mods = {}) => {
      let prevented = false;
      on.keydown({ key, ...mods, preventDefault: () => (prevented = true) });
      return prevented;
    },
  };
  return inp;
}

/**
 * Lines, each with every default column as an input; the deps a page would pass. `screen`: the
 * line indexes in the order they are painted (a sorted table); left out, ERPNext's order.
 */
function setup({ lines, lineKey, doc, leaveBackward = () => {}, apply, afterEdit, screen } = {}) {
  const focused = [];
  const inputs = [];
  const table = {
    dataset: {},
    querySelectorAll: () => inputs,
    querySelector: (sel) => {
      const m = sel.match(/data-row="(\d+)"\]\[data-field="(\w+)"/);
      return m ? inputs.find((i) => i.dataset.row === m[1] && i.dataset.field === m[2]) || null : null;
    },
  };
  const lastDoc = doc || { items: [{ item_code: "A", qty: 1 }, { item_code: "B", qty: 2 }] };
  const keys = createItemTableKeys({
    table: () => table,
    editable: () => true,
    painting: () => false,
    calcActiveOn: () => false,
    lastDoc: () => lastDoc,
    lines: lines || ((d) => (d && Array.isArray(d.items) ? d.items : [])),
    lineKey: lineKey || ((l) => l.item_code),
    leaveBackward,
    repaint: () => {},
  });
  const calls = [];
  const all = lines ? lines(lastDoc) : lastDoc.items;
  for (const ri of screen || all.map((_, i) => i)) {
    const line = all[ri];
    for (const field of DEFAULT_ITEM_NAV_FIELDS) {
      const inp = fakeInput(ri, field, line[field] ?? "", focused);
      keys.wireCell(inp, {
        field,
        rowIndex: ri,
        readValue: () => inp.value,
        apply: apply || (async (v, o) => calls.push(["apply", ri, field, v, o])),
        afterEdit: afterEdit || (async () => calls.push(["afterEdit", ri, field])),
      });
      inputs.push(inp);
    }
  }
  const cell = (ri, field) => inputs.find((i) => i.dataset.row === String(ri) && i.dataset.field === field);
  return { keys, table, focused, calls, cell };
}

describe("item-table-keys-ui: the moves", () => {
  it("Escape leaves edit mode, and the table says so", () => {
    const { keys, table, cell } = setup();
    keys.setMode("edit");
    cell(0, "qty").key("Escape");
    assert.equal(keys.mode(), "nav");
    assert.equal(table.dataset.cellMode, "nav");
  });

  it("↓ / ↑ in nav mode move to the same box on the next / previous line", async () => {
    const { keys, focused, cell } = setup();
    keys.setMode("nav");
    cell(0, "description").key("ArrowDown");
    await settle();
    cell(1, "description").key("ArrowUp");
    await settle();
    assert.deepEqual(focused, ["1:description", "0:description"]);
  });

  it("Tab moves along the line", async () => {
    const { focused, cell } = setup();
    cell(0, "item_code").key("Tab");
    await settle();
    assert.deepEqual(focused, ["0:description"]);
  });

  it("the busy flag is up while a Tab's write is out, and down after", async () => {
    let finish;
    const { keys, cell } = setup({ apply: () => new Promise((r) => (finish = r)) });
    const qty = cell(0, "qty");
    qty.value = "5";
    qty.key("Tab");
    await settle();
    assert.equal(keys.busy(), true);
    finish();
    await settle();
    assert.equal(keys.busy(), false);
  });

  it("Tab past the last box of the last line asks the page where to go (a new line)", async () => {
    const { calls, cell } = setup();
    cell(1, "project").key("Tab");
    await settle();
    assert.deepEqual(calls, [["afterEdit", 1, "project"]]);
  });

  it("a changed box is written before the move, and the write carries where to land", async () => {
    const { calls, cell } = setup();
    const qty = cell(0, "qty");
    qty.value = "5";
    qty.key("ArrowDown");
    await settle();
    assert.equal(calls.length, 1);
    const [what, ri, field, v, opts] = calls[0];
    assert.deepEqual([what, ri, field, v], ["apply", 0, "qty", "5"]);
    assert.deepEqual(opts.focus, { rowIndex: 1, field: "qty", mode: "nav" });
  });

  it("Shift+Tab out of the first line's first box hands off to the page", async () => {
    let left = 0;
    const { cell } = setup({ leaveBackward: () => left++ });
    cell(0, "item_code").key("Tab", { shiftKey: true });
    await settle();
    assert.equal(left, 1);
  });

  it("a line is whatever the page says: lines and their key come from deps", () => {
    const doc = { references: [{ reference_name: " SINV-1 " }, { reference_name: null }] };
    const { keys } = setup({ doc, lines: (d) => d.references, lineKey: (l) => l.reference_name });
    assert.equal(keys.lineKeyAt(doc, 0), "SINV-1");
    assert.equal(keys.lineKeyAt(doc, 1), "");
    assert.equal(keys.lineKeyAt(doc, 5), "");
  });
});

describe("T-3: a Tab while an earlier one is still working is dropped (DF-03)", () => {
  it("two Tabs past the last box while the line is being added: the second does nothing", async () => {
    let finish;
    const adds = [];
    const { cell } = setup({
      afterEdit: (doc, v) => {
        adds.push(v);
        return new Promise((r) => (finish = r));
      },
    });
    const last = cell(1, "project");
    last.key("Tab");
    await settle();
    const prevented = last.key("Tab");
    await settle();
    finish();
    await settle();
    assert.equal(adds.length, 1);
    assert.equal(prevented, true, "the dropped Tab must not move focus the browser's way either");
  });

  it("an arrow while a write is out is dropped too", async () => {
    let finish;
    const writes = [];
    const { cell } = setup({
      apply: (v) => {
        writes.push(v);
        return new Promise((r) => (finish = r));
      },
    });
    const qty = cell(0, "qty");
    qty.value = "5";
    qty.key("ArrowDown");
    await settle();
    qty.key("ArrowDown");
    await settle();
    finish();
    await settle();
    assert.deepEqual(writes, ["5"]);
  });

  it("a write that never answers does not freeze the keys: after the hold, a move goes through", async () => {
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      const writes = [];
      const { cell } = setup({ apply: (v) => (writes.push(v), new Promise(() => {})) });
      const qty = cell(0, "qty");
      qty.value = "5";
      qty.key("ArrowDown");
      await settle();
      now += 2_000;
      qty.key("ArrowDown");
      await settle();
      assert.equal(writes.length, 1, "held while young");
      now += 10_000;
      qty.key("ArrowDown");
      await settle();
      assert.equal(writes.length, 2, "let through once the hold is over");
    } finally {
      Date.now = realNow;
    }
  });

  it("typing and Escape still go through while it works", async () => {
    let finish;
    const { keys, cell } = setup({ apply: () => new Promise((r) => (finish = r)) });
    const qty = cell(0, "qty");
    qty.value = "5";
    qty.key("Tab");
    await settle();
    assert.equal(qty.key("7"), false);
    qty.key("Escape");
    assert.equal(keys.mode(), "nav");
    finish();
    await settle();
  });
});

describe("T-2: moves between lines follow the order on screen (DF-03)", () => {
  // Three lines sorted so the screen shows line 3, then line 1, then line 2.
  const doc = { items: [{ item_code: "A", qty: 1 }, { item_code: "B", qty: 2 }, { item_code: "C", qty: 3 }] };
  const screen = [2, 0, 1];

  it("↓ goes to the line below on screen, ↑ to the line above", async () => {
    const { keys, focused, cell } = setup({ doc, screen });
    keys.setMode("nav");
    cell(2, "qty").key("ArrowDown");
    await settle();
    cell(0, "qty").key("ArrowUp");
    await settle();
    assert.deepEqual(focused, ["0:qty", "2:qty"]);
  });

  it("↑ from the top line on screen does not move", async () => {
    const { keys, focused, cell } = setup({ doc, screen });
    keys.setMode("nav");
    cell(2, "qty").key("ArrowUp");
    await settle();
    assert.deepEqual(focused, []);
  });

  it("Tab past a line's last box goes to the next line on screen", async () => {
    // Line 3 is ERPNext's last but the top line on screen: the next one is line 1, not a new line.
    const { calls, focused, cell } = setup({ doc, screen });
    cell(2, "project").key("Tab");
    await settle();
    assert.deepEqual(focused, ["0:item_code"]);
    assert.deepEqual(calls, []);
  });

  it("Tab past the last box of the last line on screen adds a line, even when it is not ERPNext's last", async () => {
    const { calls, focused, cell } = setup({ doc, screen: [2, 1, 0] });
    cell(0, "project").key("Tab");
    await settle();
    assert.deepEqual(focused, []);
    assert.deepEqual(calls, [["afterEdit", 0, "project"]]);
  });

  it("Shift+Tab out of a line's first box goes to the line above on screen", async () => {
    const { focused, cell } = setup({ doc, screen });
    cell(0, "item_code").key("Tab", { shiftKey: true });
    await settle();
    assert.deepEqual(focused, ["2:project"]);
  });

  it("Shift+Tab out of the top line on screen leaves the table backward", async () => {
    let left = 0;
    const { cell } = setup({ doc, screen, leaveBackward: () => left++ });
    cell(2, "item_code").key("Tab", { shiftKey: true });
    await settle();
    assert.equal(left, 1);
  });

  it("after a write, where to go is worked out on screen too", () => {
    const { keys } = setup({ doc, screen });
    assert.deepEqual(keys.nextAfterEdit("project", 0, doc, { cellValue: "P" }), {
      rowIndex: 1, field: "item_code", addRow: false, deleteRow: false, leaveTable: false,
    });
    assert.equal(keys.nextAfterEdit("project", 1, doc, { cellValue: "P" }).addRow, true);
  });

  it("a blank line last on screen is deleted on Tab, not focused", () => {
    const blank = { items: [{ item_code: "" }, { item_code: "B" }, { item_code: "C" }] };
    const { keys } = setup({ doc: blank, screen: [2, 1, 0] });
    const d = keys.nextAfterEdit("project", 1, blank, { cellValue: "P" });
    assert.deepEqual([d.rowIndex, d.deleteRow, d.leaveTable], [0, true, true]);
  });
});

describe("T-1: the sort holds still while the clerk types (DF-03)", () => {
  const m = (rowIndex) => ({ rowIndex });
  const key = (ri) => ["a", "b", "c", "d"][ri];

  it("not holding: the sort's own order", () => {
    const sorted = [m(1), m(0)];
    assert.deepEqual(holdLineOrder(sorted, key, null), { models: sorted, outOfDate: false });
  });

  it("holding: the order last shown, and out of date when the sort would differ", () => {
    // Shown a, b, c; an edit makes the sort want c, a, b.
    const r = holdLineOrder([m(2), m(0), m(1)], key, ["a", "b", "c"]);
    assert.deepEqual(r.models.map((x) => x.rowIndex), [0, 1, 2]);
    assert.equal(r.outOfDate, true);
  });

  it("a new line goes at the bottom; a deleted one drops out", () => {
    const r = holdLineOrder([m(3), m(0), m(2)], key, ["c", "b", "a"]);
    assert.deepEqual(r.models.map((x) => x.rowIndex), [2, 0, 3]);
  });

  it("held and sorted the same: not out of date", () => {
    assert.equal(holdLineOrder([m(0), m(1)], key, ["a", "b"]).outOfDate, false);
  });

  /** A page's paint through the module: sorted by qty, lines named by `name`. */
  function painter() {
    const doc = { name: "PO-1", items: [{ name: "a", qty: 1 }, { name: "b", qty: 2 }, { name: "c", qty: 3 }] };
    const { keys } = setup({ doc });
    const bySort = () => doc.items.map((l, rowIndex) => ({ rowIndex, qty: l.qty })).sort((x, y) => x.qty - y.qty);
    const paint = () => keys.orderForPaint(bySort(), doc).map((x) => doc.items[x.rowIndex].name).join("");
    return { doc, keys, paint };
  }
  const inCell = { closest: () => null };

  it("in the table, an edit does not move the line, and the banner says the sort is out of date", () => {
    const { doc, keys, paint } = painter();
    assert.equal(paint(), "abc");
    keys.noteFocus(inCell, true);
    doc.items[0].qty = 9;
    assert.equal(paint(), "abc");
    assert.equal(keys.sortIsStale(), true);
  });

  it("clicking away sorts it", () => {
    const { doc, keys, paint } = painter();
    paint();
    keys.noteFocus(inCell, true);
    doc.items[0].qty = 9;
    paint();
    keys.noteFocus(inCell, false);
    assert.equal(paint(), "bca");
    assert.equal(keys.sortIsStale(), false);
  });

  it("a header click (or 🔄) sorts now, even with the clerk in the table", () => {
    const { doc, keys, paint } = painter();
    paint();
    keys.noteFocus(inCell, true);
    doc.items[0].qty = 9;
    paint();
    keys.sortNow();
    assert.equal(paint(), "bca");
    assert.equal(keys.sortIsStale(), false);
  });

  it("another document (or a new one saved under its name) is sorted, not held", () => {
    const { doc, keys, paint } = painter();
    paint();
    keys.noteFocus(inCell, true);
    doc.items[0].qty = 9;
    doc.name = "PO-2";
    assert.equal(paint(), "bca");
  });
});

describe("item-table-keys-ui: both pages use it", () => {
  for (const page of ["../src/bill-form-page.js", "../src/doc-form-page.js"]) {
    const src = read(page);
    it(`${page}: wires every item cell through the shared keys, with its own columns`, () => {
      assert.match(src, /itemKeys\.wireCell\(inp, \{[^}]*navFields/);
      assert.doesNotMatch(src, /itemTableKeyDecision|neighborItemCell/, "a copy of the key handler is back");
    });
  }
});
