import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SHELL_RELAYOUT_EVENTS,
  RELAYOUT_SETTLE_MS,
  contentSizeChanged,
} from "../src/shell-relayout.js";

describe("shell relayout triggers", () => {
  // The incident: fullscreen on a 1080p monitor left dead space under the rail and the page.
  it("listens for the window-state changes, not only resize", () => {
    for (const ev of ["resize", "show", "enter-full-screen", "leave-full-screen", "maximize", "unmaximize"]) {
      assert.ok(SHELL_RELAYOUT_EVENTS.includes(ev), `missing ${ev}`);
    }
  });

  // Win+Right snap: the resize event carries the pre-snap size; only the moves that follow
  // carry the real one.
  it("treats a move as a possible resize", () => {
    assert.ok(SHELL_RELAYOUT_EVENTS.includes("move"));
    assert.ok(SHELL_RELAYOUT_EVENTS.includes("moved"));
  });

  it("keeps a synchronous pass and at least one late pass", () => {
    assert.equal(RELAYOUT_SETTLE_MS[0], 0, "the immediate pass must stay");
    assert.ok(RELAYOUT_SETTLE_MS.length >= 2, "bounds can land after the event");
    const sorted = [...RELAYOUT_SETTLE_MS].sort((a, b) => a - b);
    assert.deepEqual([...RELAYOUT_SETTLE_MS], sorted, "delays must ascend");
    assert.ok(Math.max(...RELAYOUT_SETTLE_MS) <= 1000, "a settle pass this late would be visible");
  });

  it("both lists are frozen — they are read in a hot resize path", () => {
    assert.ok(Object.isFrozen(SHELL_RELAYOUT_EVENTS));
    assert.ok(Object.isFrozen(RELAYOUT_SETTLE_MS));
  });
});

describe("contentSizeChanged", () => {
  it("is true when either dimension moves", () => {
    assert.equal(contentSizeChanged({ width: 100, height: 50 }, { width: 101, height: 50 }), true);
    assert.equal(contentSizeChanged({ width: 100, height: 50 }, { width: 100, height: 51 }), true);
  });

  it("is false for a move with no resize", () => {
    assert.equal(contentSizeChanged({ x: 0, y: 0, width: 100, height: 50 }, { x: 9, y: 9, width: 100, height: 50 }), false);
  });

  it("treats a missing or junk rect as changed rather than skipping the work", () => {
    assert.equal(contentSizeChanged(null, { width: 1, height: 1 }), true);
    assert.equal(contentSizeChanged({ width: 1, height: 1 }, undefined), true);
    assert.equal(contentSizeChanged({ width: NaN, height: 1 }, { width: 0, height: 1 }), false);
  });
});
