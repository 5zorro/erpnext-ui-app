import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcRibbonPlacement, CALC_RIBBON_MIN_PX } from "../src/calc/calc-ribbon-place.js";

// 5zorro 2026-10-11: the ribbon was exactly the field's width, so a long tape in a narrow cell spilled.
describe("calcRibbonPlacement", () => {
  const vw = 1400;
  it("a wide field with a short tape: the field's own width, as before", () => {
    assert.deepEqual(calcRibbonPlacement({ left: 400, right: 600 }, 120, "right", vw), { left: 400, width: 200 });
  });
  it("a narrow right-aligned cell grows leftwards, keeping its right edge (decimals line up)", () => {
    assert.deepEqual(calcRibbonPlacement({ left: 500, right: 560 }, 150, "right", vw), { left: 410, width: 150 });
  });
  it("a left-aligned field grows rightwards from its left edge", () => {
    assert.deepEqual(calcRibbonPlacement({ left: 300, right: 360 }, 150, "left", vw), { left: 300, width: 150 });
  });
  it("never narrower than the minimum", () => {
    assert.equal(calcRibbonPlacement({ left: 500, right: 520 }, 10, "right", vw).width, CALC_RIBBON_MIN_PX);
  });
  it("stays inside the window, sliding only as far as the edge needs", () => {
    assert.deepEqual(calcRibbonPlacement({ left: 20, right: 60 }, 150, "right", vw), { left: 16, width: 150 });
    assert.deepEqual(calcRibbonPlacement({ left: 1300, right: 1360 }, 150, "left", vw), { left: 1234, width: 150 });
    assert.equal(calcRibbonPlacement({ left: 100, right: 160 }, 5000, "right", 600).width, 568);
  });
});
