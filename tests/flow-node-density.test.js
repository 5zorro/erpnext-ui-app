import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  flowNodeDensity,
  flowNodePlan,
  FLOW_NODE_DENSITIES,
  STACKED_MIN_ROWS,
  FULL_MIN_ROWS,
} from "../src/flow-node-density.js";

const ROW = 34; // pay-outstanding.src.html's ROW_HEIGHT

describe("flowNodeDensity", () => {
  it("one row of height is compact — one line, nothing else fits", () => {
    assert.equal(flowNodeDensity(ROW, ROW), "compact");
  });

  it("two rows is medium, three or more is full", () => {
    assert.equal(flowNodeDensity(2 * ROW, ROW), "medium");
    assert.equal(flowNodeDensity(3 * ROW, ROW), "full");
    assert.equal(flowNodeDensity(90 * ROW, ROW), "full");
  });

  it("only ever returns a known density", () => {
    for (let h = 0; h <= 8 * ROW; h += 3) {
      assert.ok(FLOW_NODE_DENSITIES.includes(flowNodeDensity(h, ROW)));
    }
  });

  it("a 1px border does not demote a 2-row node to one line", () => {
    // Every alignment bug on this surface so far came from a 1px border, so the boundary has to
    // tolerate one: 67px is a 2-row node whose box lost a pixel, not a 1-row node.
    assert.equal(flowNodeDensity(2 * ROW - 1, ROW), "medium");
    assert.equal(flowNodeDensity(3 * ROW - 1, ROW), "full");
  });

  it("still steps down when a node is genuinely short of a row", () => {
    assert.equal(flowNodeDensity(ROW + 4, ROW), "compact");
    assert.equal(flowNodeDensity(2 * ROW + 4, ROW), "medium");
  });

  it("junk geometry degrades to compact — the layout that cannot overflow", () => {
    for (const [span, row] of [
      [0, ROW], [-100, ROW], [NaN, ROW], [undefined, ROW], [null, ROW],
      [ROW, 0], [ROW, -1], [ROW, NaN], [ROW, undefined], ["nope", "nope"],
    ]) {
      assert.equal(flowNodeDensity(span, row), "compact", `${span}/${row}`);
    }
  });

  it("scales with the row height rather than assuming 34px", () => {
    assert.equal(flowNodeDensity(60, 60), "compact");
    assert.equal(flowNodeDensity(120, 60), "medium");
    assert.equal(flowNodeDensity(180, 60), "full");
  });
});

describe("flowNodePlan", () => {
  it("compact: one line, no sub-line", () => {
    assert.deepEqual(flowNodePlan(ROW, ROW), {
      density: "compact", rows: 1, stacked: false, showSub: false,
    });
  });

  it("medium: a second line, but the sub-line still does not fit", () => {
    assert.deepEqual(flowNodePlan(2 * ROW, ROW), {
      density: "medium", rows: 2, stacked: true, showSub: false,
    });
  });

  it("full: everything", () => {
    assert.deepEqual(flowNodePlan(4 * ROW, ROW), {
      density: "full", rows: 4, stacked: true, showSub: true,
    });
  });

  it("rows counts the members the span was built from", () => {
    for (const n of [1, 2, 3, 5, 12, 90]) {
      assert.equal(flowNodePlan(n * ROW, ROW).rows, n);
    }
  });

  it("the thresholds it uses are the ones it exports", () => {
    assert.equal(flowNodePlan(STACKED_MIN_ROWS * ROW, ROW).stacked, true);
    assert.equal(flowNodePlan((STACKED_MIN_ROWS - 1) * ROW, ROW).stacked, false);
    assert.equal(flowNodePlan(FULL_MIN_ROWS * ROW, ROW).showSub, true);
    assert.equal(flowNodePlan((FULL_MIN_ROWS - 1) * ROW, ROW).showSub, false);
  });

  it("never claims room it does not have — a third line implies a second", () => {
    for (let h = 0; h <= 6 * ROW; h += 1) {
      const p = flowNodePlan(h, ROW);
      if (p.showSub) assert.ok(p.stacked, `showSub without stacked at ${h}px`);
    }
  });

  it("says nothing about labels — that is a width question, not a height one", () => {
    // A one-line node has width to spare, so hiding a button's label there would cost
    // discoverability for no gain. Any such rule belongs in a width media query.
    for (const h of [ROW, 2 * ROW, 5 * ROW]) {
      assert.ok(!("labelledAction" in flowNodePlan(h, ROW)));
    }
  });
});
