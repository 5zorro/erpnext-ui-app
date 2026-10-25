import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createUserMoveGuard, isUserMoveKey } from "../src/user-move-guard.js";

// 5zorro focus incident 2026-10-11: Tab to Qty, yanked back to Description by a late post-pick move.
describe("user-move-guard", () => {
  it("navigation keys count; typing does not", () => {
    for (const k of ["Tab", "Enter", "Escape", "ArrowDown", "ArrowLeft"]) assert.equal(isUserMoveKey(k), true, k);
    for (const k of ["a", "7", ".", "Backspace", "Shift", ""]) assert.equal(isUserMoveKey(k), false, k);
  });
  it("a move between mark and the answer means: leave focus where the clerk put it", () => {
    const g = createUserMoveGuard();
    const m = g.mark();
    assert.equal(g.movedSince(m), false);
    g.bump();
    assert.equal(g.movedSince(m), true);
    assert.equal(g.movedSince(g.mark()), false);
  });
});
