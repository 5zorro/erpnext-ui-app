import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_DRAWER_STOPS,
  CHECK_DRAWER_STOP_LABEL,
  CHECK_DRAWER_MIN_PX,
  DEFAULT_CHECK_DRAWER_STOP,
  normalizeDrawerStop,
  nextDrawerStop,
  drawerMaxHeightPx,
  readDrawerStop,
  writeDrawerStop,
} from "../src/check-drawer-height.js";

/** Minimal injectable storage, incl. the throwing variant real browsers produce. */
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}
const throwingStorage = {
  getItem() {
    throw new Error("storage blocked");
  },
  setItem() {
    throw new Error("storage blocked");
  },
};

describe("check drawer stops", () => {
  it("every stop has a label, and the default is one of them", () => {
    for (const s of CHECK_DRAWER_STOPS) {
      assert.equal(typeof CHECK_DRAWER_STOP_LABEL[s], "string");
      assert.ok(CHECK_DRAWER_STOP_LABEL[s].length > 0);
    }
    assert.ok(CHECK_DRAWER_STOPS.includes(DEFAULT_CHECK_DRAWER_STOP));
    assert.equal(Object.keys(CHECK_DRAWER_STOP_LABEL).length, CHECK_DRAWER_STOPS.length);
  });

  it("stops are ordered smallest to largest", () => {
    const heights = CHECK_DRAWER_STOPS.map((s) => drawerMaxHeightPx(s, 1080));
    for (let i = 1; i < heights.length; i += 1) {
      assert.ok(heights[i] > heights[i - 1], `${CHECK_DRAWER_STOPS[i]} must exceed its predecessor`);
    }
  });

  it("normalizes junk to the default rather than throwing", () => {
    for (const junk of [null, undefined, "", "enormous", 7, {}, []]) {
      assert.equal(normalizeDrawerStop(junk), DEFAULT_CHECK_DRAWER_STOP);
    }
    assert.equal(normalizeDrawerStop("full"), "full");
  });

  it("cycles through every stop and wraps", () => {
    let stop = CHECK_DRAWER_STOPS[0];
    const seen = [stop];
    for (let i = 0; i < CHECK_DRAWER_STOPS.length - 1; i += 1) {
      stop = nextDrawerStop(stop);
      seen.push(stop);
    }
    assert.deepEqual(seen, [...CHECK_DRAWER_STOPS]);
    assert.equal(nextDrawerStop(stop), CHECK_DRAWER_STOPS[0]);
  });

  it("cycling from junk still lands on a real stop", () => {
    assert.ok(CHECK_DRAWER_STOPS.includes(nextDrawerStop("not-a-stop")));
  });
});

describe("drawerMaxHeightPx", () => {
  it("full leaves the page header reachable — never the whole viewport", () => {
    assert.ok(drawerMaxHeightPx("full", 1080) < 1080);
  });

  it("peek is a real reduction at 1080p (this is the whole point of step 6)", () => {
    // The shipped drawer measured 631px of 1080 (58%). Peek has to be well under that.
    assert.ok(drawerMaxHeightPx("peek", 1080) < 400);
  });

  it("holds the floor up to the point the viewport itself is the tighter limit", () => {
    // Both caps are real and they conflict on a very short window. The viewport wins there —
    // a drawer taller than the window would put its own Close button off screen.
    assert.equal(drawerMaxHeightPx("peek", 1080), Math.max(CHECK_DRAWER_MIN_PX, Math.round(1080 * 0.3)));
    for (const vh of [200, 400, 1080]) {
      assert.ok(drawerMaxHeightPx("peek", vh) >= Math.min(CHECK_DRAWER_MIN_PX, vh));
      assert.ok(drawerMaxHeightPx("peek", vh) <= vh);
    }
  });

  it("never exceeds the viewport, even when the floor would", () => {
    assert.equal(drawerMaxHeightPx("full", 120), 120);
  });

  it("junk viewport falls back to the floor instead of NaN", () => {
    for (const vh of [null, undefined, "tall", NaN, Infinity, -500]) {
      const px = drawerMaxHeightPx("half", vh);
      assert.ok(Number.isFinite(px), `got ${px} for ${String(vh)}`);
      assert.equal(px, CHECK_DRAWER_MIN_PX);
    }
  });

  it("returns whole pixels", () => {
    for (const vh of [1080, 999, 733]) {
      for (const s of CHECK_DRAWER_STOPS) {
        assert.equal(drawerMaxHeightPx(s, vh) % 1, 0);
      }
    }
  });
});

describe("drawer stop prefs (only an explicit choice persists)", () => {
  it("empty storage yields the default and writes nothing", () => {
    const s = memStorage();
    assert.equal(readDrawerStop(s), DEFAULT_CHECK_DRAWER_STOP);
    assert.deepEqual(s.dump(), {});
  });

  it("round-trips an explicit choice", () => {
    const s = memStorage();
    assert.equal(writeDrawerStop(s, "full"), "full");
    assert.equal(readDrawerStop(s), "full");
  });

  it("a corrupt stored value falls back to the default, it does not disable the drawer", () => {
    assert.equal(readDrawerStop(memStorage({ "check-drawer-stop": "gigantic" })), DEFAULT_CHECK_DRAWER_STOP);
  });

  it("storage that throws on read or write never propagates", () => {
    assert.equal(readDrawerStop(throwingStorage), DEFAULT_CHECK_DRAWER_STOP);
    assert.doesNotThrow(() => writeDrawerStop(throwingStorage, "peek"));
    assert.equal(writeDrawerStop(throwingStorage, "peek"), "peek");
  });

  it("absent storage is not an error (headless render, no window)", () => {
    assert.equal(readDrawerStop(null), DEFAULT_CHECK_DRAWER_STOP);
    assert.equal(readDrawerStop(undefined), DEFAULT_CHECK_DRAWER_STOP);
    assert.equal(writeDrawerStop(null, "full"), "full");
  });

  it("writing junk stores the normalized default, never the junk", () => {
    const s = memStorage();
    assert.equal(writeDrawerStop(s, "nope"), DEFAULT_CHECK_DRAWER_STOP);
    assert.equal(s.dump()["check-drawer-stop"], DEFAULT_CHECK_DRAWER_STOP);
  });
});
