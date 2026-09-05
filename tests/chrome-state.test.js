import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toolbarLensId,
  historyRailWidth,
  HISTORY_RAIL_WIDTH,
  HISTORY_RAIL_COLLAPSED_WIDTH,
} from "../src/chrome-state.js";

const BASE = "http://localhost:8080";
const BILL = "/app/purchase-invoice/ACC-PINV-2026-00145";

describe("toolbarLensId", () => {
  it("Doc surface and Home both read as doc", () => {
    assert.equal(toolbarLensId({ onDoc: true, surfaceMode: "doc" }), "doc");
    assert.equal(toolbarLensId({ onDoc: true, surfaceMode: "home" }), "doc");
  });

  it("non-ERP surfaces are vanilla", () => {
    assert.equal(toolbarLensId({ surfaceMode: "home" }), "vanilla");
  });

  it("simplified only on a form whose pref says so", () => {
    const prefs = { "purchase-invoice": "simplified" };
    assert.equal(
      toolbarLensId({ surfaceMode: "erp", liveErpPath: BILL, lensPrefs: prefs, erpBase: BASE }),
      "simplified",
    );
    // list route (no record) is plain Vanilla
    assert.equal(
      toolbarLensId({
        surfaceMode: "erp",
        liveErpPath: "/app/purchase-invoice",
        lensPrefs: prefs,
        erpBase: BASE,
      }),
      "vanilla",
    );
    assert.equal(
      toolbarLensId({
        surfaceMode: "erp",
        liveErpPath: BILL,
        lensPrefs: { "purchase-invoice": "vanilla" },
        erpBase: BASE,
      }),
      "vanilla",
    );
  });

  it("live ERP path wins over a stale shell route (nav incident 2026-09-03)", () => {
    const prefs = { "purchase-invoice": "simplified" };
    // Shell still believes it is on the Bill; the page has actually moved to Desk.
    assert.equal(
      toolbarLensId({
        surfaceMode: "erp",
        shellRoute: BILL,
        liveErpPath: "/app",
        lensPrefs: prefs,
        erpBase: BASE,
      }),
      "vanilla",
    );
    // And the reverse: page is still the Simplified Bill, shell route has moved on.
    assert.equal(
      toolbarLensId({
        surfaceMode: "erp",
        shellRoute: "/app/payment-entry",
        liveErpPath: BILL,
        lensPrefs: prefs,
        erpBase: BASE,
      }),
      "simplified",
    );
  });

  it("falls back to the shell route when there is no live path", () => {
    assert.equal(
      toolbarLensId({
        surfaceMode: "erp",
        shellRoute: BILL,
        lensPrefs: { "purchase-invoice": "simplified" },
        erpBase: BASE,
      }),
      "simplified",
    );
  });
});

describe("historyRailWidth", () => {
  it("collapses to a grab strip and back", () => {
    assert.equal(historyRailWidth(false), HISTORY_RAIL_WIDTH);
    assert.equal(historyRailWidth(true), HISTORY_RAIL_COLLAPSED_WIDTH);
    assert.ok(HISTORY_RAIL_COLLAPSED_WIDTH > 0, "collapsed rail stays clickable");
  });
});
