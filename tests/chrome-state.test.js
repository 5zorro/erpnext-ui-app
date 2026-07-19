import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initialChromeState, reduceChrome } from "../src/chrome-state.js";

describe("reduceChrome", () => {
  it("starts on Doc Workflow Home with unknown health", () => {
    const s = initialChromeState();
    assert.equal(s.lens, "doc");
    assert.equal(s.showingHome, true);
    assert.equal(s.health, "unknown");
  });

  it("go-home and leave-home toggle showingHome", () => {
    let s = initialChromeState();
    s = reduceChrome(s, { type: "leave-home" });
    assert.equal(s.showingHome, false);
    s = reduceChrome(s, { type: "go-home" });
    assert.equal(s.showingHome, true);
    assert.equal(s.lens, "doc");
  });

  it("accepts simplified lens", () => {
    let s = initialChromeState();
    s = reduceChrome(s, { type: "set-lens", lens: "simplified" });
    assert.equal(s.lens, "simplified");
  });

  it("set-health updates status", () => {
    let s = initialChromeState();
    s = reduceChrome(s, { type: "set-health", health: "ok" });
    assert.equal(s.health, "ok");
    s = reduceChrome(s, { type: "set-health", health: "bad" });
    assert.equal(s.health, "bad");
  });

  it("ignores invalid actions", () => {
    const s = initialChromeState();
    assert.equal(reduceChrome(s, { type: "nope" }), s);
    assert.deepEqual(reduceChrome(s, { type: "set-health", health: "meh" }), s);
  });
});
