/**
 * A new form's opening focus in its party box, the Bill's way on every Doc form (plan 2026-10-25
 * closeout, item 4): skipped when the clerk is already in a box or has moved since the form
 * appeared, and never retried late.
 *
 * @covers src/party-focus.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { focusPartyBox } from "../src/party-focus.js";

function setup({ moved = false, active = null } = {}) {
  const box = { focused: 0, focus() { this.focused += 1; }, select() {} };
  const later = [];
  const logs = [];
  let movedNow = moved;
  const deps = {
    box: /** @type {any} */ (box),
    shownMark: 1,
    userMoves: { movedSince: () => movedNow },
    logFocus: (e, d) => logs.push([e, d]),
    activeElement: () => active,
    afterLayout: (fn) => later.push(fn),
  };
  return { box, deps, later, logs, move: () => (movedNow = true) };
}

describe("the opening focus in Vendor", () => {
  it("lands now and once after layout", () => {
    const { box, deps, later } = setup();
    assert.equal(focusPartyBox(deps), true);
    assert.equal(box.focused, 1);
    assert.equal(later.length, 1);
    later[0]();
    assert.equal(box.focused, 2);
  });
  it("the clerk moved before layout: the second try does nothing", () => {
    const { box, deps, later, move } = setup();
    focusPartyBox(deps);
    move();
    later[0]();
    assert.equal(box.focused, 1);
  });
  it("the clerk moved since the form appeared: not at all", () => {
    const { box, deps, logs } = setup({ moved: true });
    assert.equal(focusPartyBox(deps), false);
    assert.equal(box.focused, 0);
    assert.deepEqual(logs[0], ["focus-vendor-skipped", "clerk moved since the form appeared"]);
  });
  it("the clerk is already in one of the form's boxes: not at all", () => {
    const inLine = { getAttribute: (a) => (a === "data-field" ? "qty" : null) };
    const { box, deps } = setup({ active: inLine });
    assert.equal(focusPartyBox(deps), false);
    assert.equal(box.focused, 0);
  });
  it("the box left focused from the last document is not the clerk's place on this one", () => {
    const leftOver = { getAttribute: (a) => (a === "data-field" ? "transaction_date" : null) };
    const { box, deps } = setup({ active: leftOver });
    assert.equal(focusPartyBox({ ...deps, shownFocus: /** @type {any} */ (leftOver) }), true);
    assert.equal(box.focused, 1);
  });
  it("no party box: nothing", () => {
    const { deps } = setup();
    assert.equal(focusPartyBox({ ...deps, box: null }), false);
  });
});
