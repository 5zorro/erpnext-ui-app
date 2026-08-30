import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOME_GROUPS,
  HOME_TILES,
  AP_HOME_TILE_WASH,
  flattenHomeTiles,
  validateHomeTiles,
} from "../src/home-tiles.js";
import { DOC_WASH_BY_PROFILE } from "../src/doc-wash.js";

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

  it("uses /app/… for ERP tiles (OI-118); /desk root only for Vanilla Desk", () => {
    for (const t of flattenHomeTiles()) {
      if (t.disabled) continue;
      if (t.id === "desk") {
        assert.equal(t.route, "/desk");
        continue;
      }
      if (t.route === "/" || t.route === "/login") continue;
      assert.ok(t.route.startsWith("/app/"), `${t.id} → ${t.route}`);
    }
  });

  it("HOME_TILES matches flatten", () => {
    assert.equal(HOME_TILES.length, flattenHomeTiles().length);
  });

  it("AP vendor tiles carry doc wash roles (OI-125)", () => {
    assert.deepEqual(AP_HOME_TILE_WASH["po-new"], DOC_WASH_BY_PROFILE.po.role);
    assert.deepEqual(AP_HOME_TILE_WASH["receipt-new"], DOC_WASH_BY_PROFILE.receipt.role);
    assert.deepEqual(AP_HOME_TILE_WASH["bill-new"], DOC_WASH_BY_PROFILE.bill.role);
    assert.equal(AP_HOME_TILE_WASH["pay-bills"], "payment");
    for (const [tileId, role] of Object.entries(AP_HOME_TILE_WASH)) {
      const tile = flattenHomeTiles().find((t) => t.id === tileId);
      assert.equal(tile?.washRole, role, tileId);
    }
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
