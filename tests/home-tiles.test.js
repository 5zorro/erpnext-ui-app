import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOME_GROUPS,
  HOME_TILES,
  flattenHomeTiles,
  validateHomeTiles,
} from "../src/home-tiles.js";

describe("HOME_GROUPS", () => {
  it("validates with unique ids and routes (except disabled)", () => {
    assert.equal(validateHomeTiles(HOME_GROUPS).length, 0);
    assert.ok(flattenHomeTiles().length >= 10);
  });

  it("includes Enter Bills and Vanilla Desk", () => {
    const ids = new Set(flattenHomeTiles().map((t) => t.id));
    assert.ok(ids.has("bill-new"));
    assert.ok(ids.has("desk"));
  });

  it("HOME_TILES matches flatten", () => {
    assert.equal(HOME_TILES.length, flattenHomeTiles().length);
  });
});

describe("validateHomeTiles", () => {
  it("rejects empty list", () => {
    assert.ok(validateHomeTiles([]).length > 0);
  });

  it("rejects duplicate ids and bad routes", () => {
    const errs = validateHomeTiles([
      { id: "a", label: "A", route: "/desk" },
      { id: "a", label: "B", route: "desk" },
    ]);
    assert.ok(errs.some((e) => /duplicate/.test(e)));
    assert.ok(errs.some((e) => /route must start/.test(e)));
  });

  it("allows disabled tile without route", () => {
    assert.equal(
      validateHomeTiles([
        { id: "x", label: "X", route: "", disabled: true },
        { id: "y", label: "Y", route: "/desk" },
      ]).length,
      0,
    );
  });
});
