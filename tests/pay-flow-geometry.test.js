/**
 * Review 10-19 R10b-3: the Pay Outstanding card geometry rules (HANDOFF § Pay Outstanding flow),
 * each paid for with a bug, now pinned outside the page.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ROW_HEIGHT,
  MIN_BRACE_H,
  MIN_STROKE,
  MAX_STROKE,
  rowCenterY,
  stackSpans,
  strokeForShare,
  placeStrands,
  bracePath,
  ribbonPath,
} from "../src/pay-flow-geometry.js";

describe("pay-flow-geometry", () => {
  it("row i's centre is i × ROW_HEIGHT + ROW_HEIGHT / 2", () => {
    assert.equal(rowCenterY(0), ROW_HEIGHT / 2);
    assert.equal(rowCenterY(12), 12 * ROW_HEIGHT + ROW_HEIGHT / 2);
  });

  it("a span is as tall as its members, never its dollar share, and at least one row", () => {
    // A 5-member payment and a 1-member one: heights 5 and 1 rows, whatever their amounts.
    assert.deepEqual(stackSpans([5, 1, 0]), [
      { y0: 0, y1: 5 * ROW_HEIGHT },
      { y0: 5 * ROW_HEIGHT, y1: 6 * ROW_HEIGHT },
      { y0: 6 * ROW_HEIGHT, y1: 7 * ROW_HEIGHT },
    ]);
  });

  it("columns built from the same rows are the schedule's height", () => {
    const spans = stackSpans([3, 2, 4]);
    assert.equal(spans.at(-1).y1, 9 * ROW_HEIGHT);
  });

  it("stroke is the strand's share, clamped", () => {
    assert.equal(strokeForShare(0, 100), MIN_STROKE);
    assert.equal(strokeForShare(100, 100), MAX_STROKE);
    assert.equal(strokeForShare(10, 100), 10 / 100 * MAX_STROKE * 4);
    assert.equal(strokeForShare(5, 0), MIN_STROKE);
  });

  it("the bundle is centred in its span, not spread over it", () => {
    const span = { y0: 0, y1: 8 * ROW_HEIGHT, keys: ["a", "b", "c"] };
    const pointY = new Map([["a", 10], ["b", 100], ["c", 200]]);
    const amounts = new Map([["a", 1], ["b", 1], ["c", 1]]);
    const { strands } = placeStrands(span, pointY, amounts, () => 6);
    const mid = (span.y0 + span.y1) / 2;
    const top = strands[0].sy - 3;
    const bot = strands.at(-1).sy + 3;
    assert.ok(Math.abs((top + bot) / 2 - mid) < 1e-9, "bundle centred on the span");
    assert.equal(bot - top, 18, "three 6px strands, not the span's 272px");
    assert.deepEqual(strands.map((s) => s.py), [10, 100, 200]);
  });

  it("a brace hugs the bundle, never under MIN_BRACE_H, and only for two or more strands", () => {
    const span = { y0: 0, y1: ROW_HEIGHT * 4, keys: ["a", "b"] };
    const pointY = new Map();
    const thin = placeStrands(span, pointY, new Map(), () => 2);
    assert.equal(thin.brace.bot - thin.brace.top, MIN_BRACE_H);
    const one = placeStrands({ ...span, keys: ["a"] }, pointY, new Map(), () => 2);
    assert.equal(one.brace, null);
  });

  it("path strings", () => {
    assert.equal(ribbonPath(0, 10, 100, 50), "M 0 10 C 50 10, 50 50, 100 50");
    assert.match(bracePath(0, 40, 60, "left"), /^M 15 0 Q 9 0 9 5 /);
    assert.match(bracePath(0, 40, 60, "right"), /^M 45 0 Q 51 0 51 5 /);
  });
});
