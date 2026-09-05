import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toolbarLensId,
  docTabState,
  lensTabsFor,
  historyRailWidth,
  HISTORY_RAIL_WIDTH,
  HISTORY_RAIL_COLLAPSED_WIDTH,
} from "../src/chrome-state.js";

describe("docTabState", () => {
  it("offered on Home / the Doc surface itself", () => {
    assert.equal(docTabState({ onDoc: true }).available, true);
  });

  it("offered on a Doc-skinnable record", () => {
    const s = docTabState({ hasDocSkinnedRecord: true });
    assert.equal(s.available, true);
    assert.match(s.hint, /this page/);
  });

  it("offered one step out — peeked a master from a form", () => {
    const peek = docTabState({ peekParentIsDocSkinned: true, returnLabel: "Bill" });
    assert.equal(peek.available, true);
    assert.equal(peek.hint, "Back to Bill");
    assert.equal(docTabState({ parkedIsDocSkinned: true, returnLabel: "Purchase Order" }).hint,
      "Back to Purchase Order");
    // still offered without a usable label
    assert.equal(docTabState({ parkedIsDocSkinned: true }).available, true);
  });

  it("a peek parent that is not a Doc-skinnable record does not count", () => {
    // nav incident 2026-09-05: peeking around a Payments dashboard made the dashboard the
    // peek parent, which lit the Doc tab on a page with no skin.
    assert.equal(docTabState({ peekParentIsDocSkinned: false }).available, false);
  });

  it("hidden on an unrelated Vanilla page with nothing to return to", () => {
    // e.g. arrived from Home, or a Find/list route: no park, no peek parent
    assert.deepEqual(docTabState({}), { available: false, hint: "" });
    assert.equal(docTabState({ hasDocSkinnedRecord: false }).available, false);
  });

  it("a doctype list is not a record — Find Bills does not offer the tab", () => {
    assert.equal(docTabState({ hasDocSkinnedRecord: false, hasPeekParent: false }).available, false);
  });
});

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

describe("lensTabsFor", () => {
  it("Vanilla only on an ordinary ERP page", () => {
    assert.deepEqual(lensTabsFor({}), {
      vanilla: true,
      simplified: false,
      doc: false,
      docHint: "",
    });
  });

  it("Bill record offers all three", () => {
    const t = lensTabsFor({ hasDocSkinnedRecord: true, hasSimplifiedLens: true });
    assert.deepEqual(
      { vanilla: t.vanilla, simplified: t.simplified, doc: t.doc },
      { vanilla: true, simplified: true, doc: true },
    );
  });

  it("PO record offers Vanilla + Doc, no Simplified", () => {
    const t = lensTabsFor({ hasDocSkinnedRecord: true, hasSimplifiedLens: false });
    assert.equal(t.simplified, false);
    assert.equal(t.doc, true);
  });

  it("a dashboard peeked from a Payments list offers Vanilla only", () => {
    const t = lensTabsFor({ peekParentIsDocSkinned: false, hasSimplifiedLens: false });
    assert.deepEqual(t, { vanilla: true, simplified: false, doc: false, docHint: "" });
  });
});
