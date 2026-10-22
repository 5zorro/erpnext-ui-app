import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createOpenPickerSet } from "../src/link-picker-open-set.js";

/** Review 10-19 R5-1: one set of page-wide listeners, walking only the open dropdowns. */

function fakeTarget() {
  const calls = [];
  return { calls, addEventListener: (type, fn, capture) => calls.push({ type, fn, capture }) };
}

function picker(inside = []) {
  const p = {
    placed: 0,
    wrap: { isConnected: true, contains: (n) => inside.includes(n) },
    dd: { hidden: false },
    place: () => {
      p.placed++;
    },
  };
  return p;
}

describe("createOpenPickerSet", () => {
  it("installs one resize, one capture scroll and one click listener, however many pickers open", () => {
    const win = fakeTarget();
    const doc = fakeTarget();
    const set = createOpenPickerSet(win, doc);
    assert.equal(win.calls.length + doc.calls.length, 0, "nothing until a dropdown opens");
    for (let i = 0; i < 50; i++) set.opened(picker());
    assert.deepEqual(
      win.calls.map((c) => [c.type, !!c.capture]),
      [["resize", false], ["scroll", true]],
    );
    assert.deepEqual(doc.calls.map((c) => c.type), ["click"]);
  });

  it("re-opening the same picker keeps one entry", () => {
    const set = createOpenPickerSet(fakeTarget(), fakeTarget());
    const p = picker();
    for (let i = 0; i < 30; i++) set.opened(p);
    set.placeAll();
    assert.equal(p.placed, 1);
  });

  it("places only open, connected dropdowns and forgets the rest", () => {
    const set = createOpenPickerSet(fakeTarget(), fakeTarget());
    const open = picker();
    const closed = picker();
    const gone = picker();
    [open, closed, gone].forEach((p) => set.opened(p));
    closed.dd.hidden = true;
    gone.wrap.isConnected = false; // its row was repainted away
    set.placeAll();
    assert.equal(open.placed, 1);
    assert.equal(closed.placed + gone.placed, 0);
    assert.equal(set.size(), 1);
  });

  it("a click outside a dropdown closes it; a click inside its own box does not", () => {
    const set = createOpenPickerSet(fakeTarget(), fakeTarget());
    const a = picker(["a-chevron"]);
    const b = picker(["b-option"]);
    set.opened(a);
    set.opened(b);
    set.closeOutside({ target: "a-chevron" });
    assert.equal(a.dd.hidden, false);
    assert.equal(b.dd.hidden, true);
    assert.equal(set.size(), 1);
  });
});

describe("link-picker-ui uses the shared set", () => {
  const ui = readFileSync(fileURLToPath(new URL("../src/link-picker-ui.js", import.meta.url)), "utf8");
  it("mountLinkPicker adds no window or document listener of its own", () => {
    assert.doesNotMatch(ui, /window\.addEventListener|document\.addEventListener/);
    assert.match(ui, /const openEntry = \{ wrap, dd, place: placeDropdown \};/);
    assert.match(ui, /openPickers\.opened\(openEntry\)/);
  });
});
