import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linkDropdownPlacement, LINK_DD_MIN_WIDTH_PX, LINK_DD_MAX_WIDTH_PX } from "../src/link-dropdown-place.js";

const vp = { width: 1400, height: 900 };
const box = (left, width, top = 300, height = 28) => ({ left, right: left + width, top, bottom: top + height });

describe("linkDropdownPlacement (DF-01: wider than the Item column)", () => {
  it("a narrow Item cell gets the minimum width, under the box", () => {
    const p = linkDropdownPlacement(box(200, 90), vp);
    assert.equal(p.width, LINK_DD_MIN_WIDTH_PX);
    assert.equal(p.left, 200);
    assert.equal(p.top, 330);
    assert.equal(p.above, false);
  });
  it("a wide header box keeps its own width, up to the cap", () => {
    assert.equal(linkDropdownPlacement(box(100, 420), vp).width, 420);
    assert.equal(linkDropdownPlacement(box(100, 900), vp).width, 900);
    assert.equal(linkDropdownPlacement(box(100, 400), vp).width <= LINK_DD_MAX_WIDTH_PX, true);
  });
  it("slides left to stay inside the window's 16px gutter", () => {
    const p = linkDropdownPlacement(box(1300, 90), vp);
    assert.equal(p.left + p.width, 1400 - 16);
  });
  it("never wider than the window allows", () => {
    const p = linkDropdownPlacement(box(10, 90), { width: 300, height: 900 });
    assert.equal(p.width, 268);
    assert.equal(p.left, 16);
  });
  it("opens above when the box sits near the bottom", () => {
    const p = linkDropdownPlacement(box(200, 90, 820), vp);
    assert.equal(p.above, true);
    assert.equal(p.top, null);
    assert.equal(p.bottom, 900 - 820 + 2);
    assert.equal(p.maxHeight, 220);
  });
  it("stays below when below still has more room than above", () => {
    const p = linkDropdownPlacement(box(200, 90, 60), { width: 1400, height: 220 });
    assert.equal(p.above, false);
    assert.ok(p.maxHeight >= 80);
  });
});
