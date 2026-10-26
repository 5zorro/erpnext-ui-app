/**
 * Plan 2026-10-25, R6a-1 step 1: code the Bill and doc-form pages carried twice, written once —
 * the date box's filter, the Items / Expenses tabs and the taxes table's notes (the site's
 * rounding is in `site-rounding.test.js`). Driven here with stand-in elements; the last block checks
 * that both pages call the shared copy and keep none of their own.
 *
 * @covers src/bill-form-page.js src/doc-form-page.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { wireDateField } from "../src/doc-form-date-field-ui.js";
import { setLineTab, wireLineTabs } from "../src/doc-form-line-tabs-ui.js";
import { createTaxNotes } from "../src/doc-form-tax-notes-ui.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** A stand-in element: class list, attributes, `hidden`, handlers by event type. */
function fakeEl() {
  const classes = new Set();
  const attrs = {};
  /** @type {Record<string, Function>} */
  const on = {};
  return {
    hidden: false,
    textContent: "",
    innerHTML: "",
    classList: { toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) },
    setAttribute: (k, v) => (attrs[k] = v),
    getAttribute: (k) => attrs[k],
    addEventListener: (type, fn) => (on[type] = fn),
    querySelectorAll: () => [],
    querySelector: () => null,
    on,
  };
}

describe("wireDateField: a date box takes digits and / - . only", () => {
  it("a typed letter is refused; a digit or a slash goes in; deleting is never refused", () => {
    const inp = fakeEl();
    wireDateField(/** @type {any} */ (inp));
    const typed = (data, inputType = "insertText") => {
      let prevented = false;
      inp.on.beforeinput({ data, inputType, preventDefault: () => (prevented = true) });
      return prevented;
    };
    assert.equal(typed("a"), true);
    assert.equal(typed("7"), false);
    assert.equal(typed("/"), false);
    assert.equal(typed(null, "deleteContentBackward"), false);
  });

  it("whatever got in anyway (autofill) is filtered out, and the caret stays where it was", () => {
    const inp = Object.assign(fakeEl(), { value: "11/1x", selectionStart: 5, caret: null });
    inp.setSelectionRange = (a) => (inp.caret = a);
    wireDateField(/** @type {any} */ (inp));
    inp.on.input();
    assert.equal(inp.value, "11/1");
    assert.equal(inp.caret, 4);
  });
});

describe("setLineTab / wireLineTabs: the Items / Expenses tabs", () => {
  it("one tab active and its panel shown; clicking the other switches", () => {
    const el = { tabItems: fakeEl(), tabExpenses: fakeEl(), panelItems: fakeEl(), panelExpenses: fakeEl() };
    wireLineTabs(/** @type {any} */ (el));
    el.tabExpenses.onclick();
    assert.equal(el.tabExpenses.classList.has("active"), true);
    assert.equal(el.tabItems.getAttribute("aria-selected"), "false");
    assert.deepEqual([el.panelItems.hidden, el.panelExpenses.hidden], [true, false]);
    setLineTab(/** @type {any} */ (el), "items");
    assert.equal(el.tabItems.classList.has("active"), true);
    assert.deepEqual([el.panelItems.hidden, el.panelExpenses.hidden], [false, true]);
  });

  it("a page without the tabs is left alone", () => {
    assert.doesNotThrow(() => setLineTab({}, "expenses"));
    assert.doesNotThrow(() => wireLineTabs({}));
  });
});

describe("createTaxNotes: the taxes table's notes", () => {
  function setup(over = {}) {
    const status = [];
    const removes = [];
    const el = { taxesBody: fakeEl(), taxDefaultNote: Object.assign(fakeEl(), { hidden: true }) };
    const state = { doc: { name: "PO-1", supplier: "ZZ V", taxes_and_charges: "", taxes: [] }, removing: false, facts: null };
    const api = { taxDefaultFacts: async () => state.facts };
    const notes = createTaxNotes({
      el: () => el,
      api: () => api,
      lastDoc: () => state.doc,
      setStatus: (text, cls) => status.push([text, cls]),
      removingTaxes: () => state.removing,
      removeAllTaxes: async (opts) => removes.push(opts),
      testIdPrefix: "doc",
      ...over,
    });
    return { notes, el, state, status, removes };
  }

  it("a row whose Amount the clerk typed over a percentage gets an ⓘ and a note row; others get nothing", () => {
    const { notes } = setup();
    notes.fixedByClerk.set("T1", 6.5);
    const fixed = { name: "T1", charge_type: "Actual" };
    assert.match(notes.fixedMarkerHtml(fixed, 0), /data-testid="doc-tax-0-fixed"/);
    assert.match(notes.fixedMarkerHtml(fixed, 0), /Was 6\.50% of the net total/);
    assert.match(notes.fixedNoteRowHtml(fixed, 0, 7), /colspan="7"/);
    assert.equal(notes.fixedMarkerHtml({ name: "T1", charge_type: "On Net Total" }, 0), "");
    assert.equal(notes.fixedNoteRowHtml({ name: "T2", charge_type: "Actual" }, 1, 7), "");
  });

  it("a refill on a document the clerk emptied is removed again, three times; then it is reported and left", () => {
    const { notes, state, status, removes } = setup();
    notes.removedOn.add("PO-1");
    state.doc = { name: "PO-1", supplier: "ZZ V", taxes_and_charges: "T", taxes: [{}] };
    for (let i = 0; i < 4; i += 1) notes.followDoc(state.doc);
    assert.equal(removes.length, 3);
    assert.deepEqual(removes[0], { quiet: true });
    assert.equal(status.length, 1);
    assert.equal(status[0][1], "warn");
    assert.equal(notes.removedOn.has("PO-1"), false);
  });

  it("nothing is removed while a Remove all is running, or on a document the clerk did not empty", () => {
    const { notes, state, removes } = setup();
    state.doc = { name: "PO-1", taxes_and_charges: "T", taxes: [{}] };
    notes.followDoc(state.doc);
    notes.removedOn.add("PO-1");
    state.removing = true;
    notes.followDoc(state.doc);
    assert.equal(removes.length, 0);
  });

  it("the default note opens, says why, and closes when the document or the vendor changes", async () => {
    const { notes, el, state } = setup();
    state.facts = { ok: true, defaultTemplate: "D" };
    await notes.toggleDefaultNote();
    assert.equal(el.taxDefaultNote.hidden, false);
    assert.match(el.taxDefaultNote.innerHTML, /<p>/);
    notes.followDoc(state.doc);
    assert.equal(el.taxDefaultNote.hidden, false);
    notes.followDoc({ ...state.doc, supplier: "ZZ OTHER" });
    assert.equal(el.taxDefaultNote.hidden, true);
  });

  it("the note explains the document as it is when ERPNext answers, not as it was when asked", async () => {
    const { notes, el, state } = setup();
    let answer;
    state.facts = new Promise((r) => (answer = r));
    const open = notes.toggleDefaultNote();
    assert.equal(el.taxDefaultNote.textContent, "Reading the tax defaults…");
    state.doc = { ...state.doc, taxes_and_charges: "Exempt" };
    answer({ ok: true, defaultTemplate: "D" });
    await open;
    assert.match(el.taxDefaultNote.innerHTML, /Exempt/);
  });

  it("a failed read says so in the note", async () => {
    const { notes, el, state } = setup();
    state.facts = { ok: false, reason: "ERPNext is down." };
    await notes.toggleDefaultNote();
    assert.equal(el.taxDefaultNote.textContent, "ERPNext is down.");
    await notes.toggleDefaultNote();
    assert.equal(el.taxDefaultNote.hidden, true);
  });
});

describe("both pages call the shared copy and keep none of their own", () => {
  for (const [page, prefix] of [
    ["../src/bill-form-page.js", "bill"],
    ["../src/doc-form-page.js", "doc"],
  ]) {
    const src = read(page);
    it(`${page.slice(7)}`, () => {
      assert.match(src, new RegExp(`createTaxNotes\\(\\{[\\s\\S]*?testIdPrefix: "${prefix}"`));
      assert.match(src, /taxNotes\.followDoc\(doc\)/);
      assert.match(src, /taxNotes\.fixedByClerk\.set\(/);
      assert.match(src, /wireLineTabs\(el\)/);
      assert.match(src, /wireDateField\(/);
      for (const gone of ["function wireDateField", "function setLineTab", "function taxFixedNote", "function keepTaxesRemoved", "function toggleTaxDefaultNote", "function loadSiteRounding"]) {
        assert.ok(!src.includes(gone), `${gone} is still in ${page}`);
      }
    });
  }
});
