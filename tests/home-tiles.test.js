import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HOME_TILES, validateHomeTiles } from "../src/home-tiles.js";

describe("HOME_TILES", () => {
  it("has unique ids and routes starting with /", () => {
    assert.equal(validateHomeTiles(HOME_TILES).length, 0);
    assert.ok(HOME_TILES.length >= 3);
  });

  it("includes Desk and Bill entry points", () => {
    const ids = new Set(HOME_TILES.map((t) => t.id));
    assert.ok(ids.has("desk"));
    assert.ok(ids.has("bills") || ids.has("bill-new"));
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
});
