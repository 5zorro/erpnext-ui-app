import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifySurface,
  resolveDocSkinTarget,
  hasDocSkin,
  lookupDocSkin,
  DOC_SKIN_INDEX,
  docSkinRouteMatrix,
  docSkinTargetRoute,
  paymentEntryRoute,
  PAYMENT_ENTRY_NEW_ROUTE,
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

describe("Payment Entry routing (Packet 4b step 5)", () => {
  it("payment-entry is indexed and ready", () => {
    const entry = DOC_SKIN_INDEX.find((e) => e.id === "payment-entry");
    assert.equal(entry?.ready, true);
  });

  it("isNew (/new, Pay direction) resolves to the pay-outstanding dashboard", () => {
    const ctx = { showingHome: false, lens: "doc", route: "/app/payment-entry/new", paymentDirection: "Pay" };
    assert.equal(hasDocSkin(ctx), true);
    assert.deepEqual(resolveDocSkinTarget(ctx), { kind: "pay-outstanding" });
  });

  it("isNew with no direction supplied defaults to available (Pay is the tranche default)", () => {
    const ctx = { showingHome: false, lens: "doc", route: "/app/payment-entry/new" };
    assert.equal(hasDocSkin(ctx), true);
    assert.deepEqual(resolveDocSkinTarget(ctx), { kind: "pay-outstanding" });
  });

  it("isNew + Receive direction: no tab, no target -- AR isn't built", () => {
    const ctx = { showingHome: false, lens: "doc", route: "/app/payment-entry/new", paymentDirection: "Receive" };
    assert.equal(hasDocSkin(ctx), false);
    assert.equal(resolveDocSkinTarget(ctx), null);
  });

  it("an existing record resolves to the check document regardless of paymentDirection", () => {
    const ctx = {
      showingHome: false,
      lens: "doc",
      route: "/app/payment-entry/ACC-PAY-2026-00001",
      paymentDirection: "Receive",
    };
    assert.equal(hasDocSkin(ctx), true);
    assert.deepEqual(resolveDocSkinTarget(ctx), {
      kind: "payment-doc",
      doctype: "payment-entry",
      record: "ACC-PAY-2026-00001",
      route: "/app/payment-entry/ACC-PAY-2026-00001",
    });
  });

  it("a payment-entry new-* tab name (Frappe's promoted /new route) still counts as new", () => {
    const ctx = {
      showingHome: false,
      lens: "doc",
      route: "/app/payment-entry/new-payment-entry-1",
      paymentDirection: "Pay",
    };
    assert.deepEqual(resolveDocSkinTarget(ctx), { kind: "pay-outstanding" });
  });

  it("a payment-entry list (no record) has no Doc tab", () => {
    const ctx = { showingHome: false, lens: "doc", route: "/app/payment-entry" };
    assert.equal(hasDocSkin(ctx), false);
    assert.equal(resolveDocSkinTarget(ctx), null);
  });
});

describe("docSkinTargetRoute", () => {
  it("gives the two shell-local Payment Entry surfaces an ERP route to stand on", () => {
    assert.equal(docSkinTargetRoute({ kind: "pay-outstanding" }), PAYMENT_ENTRY_NEW_ROUTE);
    assert.equal(
      docSkinTargetRoute({ kind: "payment-doc", record: "ACC-PAY-2026-00001" }),
      "/app/payment-entry/ACC-PAY-2026-00001",
    );
  });

  it("matches the route the same document has under Vanilla, so Recent keeps one slot", () => {
    const ctx = {
      showingHome: false,
      lens: "doc",
      route: "/app/payment-entry/ACC-PAY-2026-00001",
      paymentDirection: "Pay",
    };
    assert.equal(docSkinTargetRoute(resolveDocSkinTarget(ctx)), ctx.route);
  });

  it("passes a doc-form target's own route straight through", () => {
    assert.equal(
      docSkinTargetRoute({ kind: "doc-form", route: "/app/purchase-invoice/new" }),
      "/app/purchase-invoice/new",
    );
  });

  it("Workflow Home is not an ERP page, so it has no route", () => {
    assert.equal(docSkinTargetRoute({ kind: "workflow-home" }), "");
    assert.equal(docSkinTargetRoute(null), "");
    assert.equal(docSkinTargetRoute(undefined), "");
  });
});

describe("paymentEntryRoute", () => {
  it("an empty or new record is the blank decision surface", () => {
    assert.equal(paymentEntryRoute(""), PAYMENT_ENTRY_NEW_ROUTE);
    assert.equal(paymentEntryRoute(null), PAYMENT_ENTRY_NEW_ROUTE);
    assert.equal(paymentEntryRoute("new"), PAYMENT_ENTRY_NEW_ROUTE);
    assert.equal(paymentEntryRoute("new-payment-entry-kwzqoxkuwm"), PAYMENT_ENTRY_NEW_ROUTE);
  });

  it("a saved payment is its own route", () => {
    assert.equal(paymentEntryRoute("ACC-PAY-2026-00001"), "/app/payment-entry/ACC-PAY-2026-00001");
  });
});
