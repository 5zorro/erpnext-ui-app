import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifySurface,
  resolveDocSkinTarget,
  hasDocSkin,
  lookupDocSkin,
  DOC_SKIN_INDEX,
  docSkinRouteMatrix,
} from "../src/lens-context.js";

describe("classifySurface", () => {
  it("workflow home when showingHome", () => {
    assert.equal(classifySurface({ showingHome: true }), "workflow-home");
  });

  it("erp desk home on bare /desk and /app", () => {
    assert.equal(classifySurface({ showingHome: false, route: "/desk" }), "erp-desk-home");
    assert.equal(classifySurface({ showingHome: false, route: "/app" }), "erp-desk-home");
  });

  it("erp-form vs doc-form on Bill entry", () => {
    assert.equal(
      classifySurface({
        showingHome: false,
        route: "/app/purchase-invoice/new",
        lens: "vanilla",
      }),
      "erp-form",
    );
    assert.equal(
      classifySurface({
        showingHome: false,
        route: "/app/purchase-invoice/new",
        lens: "doc",
      }),
      "doc-form",
    );
  });
});

describe("DOC_SKIN_INDEX readiness", () => {
  it("home, bill, po, and receipt are ready (T4)", () => {
    const home = DOC_SKIN_INDEX.find((e) => e.id === "workflow-home");
    const bill = DOC_SKIN_INDEX.find((e) => e.id === "bill");
    const po = DOC_SKIN_INDEX.find((e) => e.id === "po");
    const receipt = DOC_SKIN_INDEX.find((e) => e.id === "receipt");
    assert.equal(home?.ready, true);
    assert.equal(bill?.ready, true);
    assert.equal(po?.ready, true);
    assert.equal(receipt?.ready, true);
  });

  it("lookup and hasDocSkin true for Bill form", () => {
    const ctx = { showingHome: false, route: "/app/purchase-invoice/new" };
    assert.equal(lookupDocSkin(ctx)?.id, "bill");
    assert.equal(hasDocSkin(ctx), true);
    assert.equal(resolveDocSkinTarget(ctx)?.kind, "doc-form");
  });

  it("lookup and hasDocSkin true for PO and Item Receipt forms", () => {
    assert.equal(lookupDocSkin({ route: "/app/purchase-order/new" })?.id, "po");
    assert.equal(hasDocSkin({ route: "/app/purchase-order/PO-1" }), true);
    assert.equal(lookupDocSkin({ route: "/app/purchase-receipt/new" })?.id, "receipt");
    assert.equal(resolveDocSkinTarget({ route: "/app/purchase-receipt/new" })?.layoutKey, "item-receipt");
  });
});

describe("docSkinRouteMatrix (anti-rot)", () => {
  for (const row of docSkinRouteMatrix()) {
    it(`${row.name}: tab=${row.expectTab}`, () => {
      assert.equal(hasDocSkin(row.ctx), row.expectTab, row.name);
      const target = resolveDocSkinTarget(row.ctx);
      if (row.expectKind == null) assert.equal(target, null);
      else assert.equal(target?.kind, row.expectKind);
    });
  }
});
