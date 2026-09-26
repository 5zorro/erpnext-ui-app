import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveOpenTarget, lensPrefKey, pageHasOwnDocSkin } from "../src/nav-destination.js";

const open = (route, lensPrefs = {}, extra = {}) =>
  resolveOpenTarget({ route, lensPrefs, erpBase: "http://localhost:8080", ...extra });

describe("lensPrefKey", () => {
  it("forms keep the bare doctype; lists get their own key", () => {
    assert.equal(lensPrefKey("purchase-invoice", "ACC-PINV-1"), "purchase-invoice");
    assert.equal(lensPrefKey("purchase-invoice", "new"), "purchase-invoice");
    assert.equal(lensPrefKey("purchase-invoice", ""), "purchase-invoice:list");
    assert.equal(lensPrefKey("", ""), "");
  });
});

describe("resolveOpenTarget — forms answer as the doors did before 2026-09-26", () => {
  it("a Bill opens its Doc skin by default and Vanilla once Vanilla was chosen", () => {
    assert.equal(open("/app/purchase-invoice/ACC-PINV-2026-00001").surface, "doc-form");
    const v = open("/app/purchase-invoice/ACC-PINV-2026-00001", { "purchase-invoice": "vanilla" });
    assert.equal(v.surface, "erp");
    assert.equal(v.lens, "vanilla");
  });

  it("Simplified is a Vanilla-page lens, so it resolves to the ERP surface", () => {
    const s = open("/app/purchase-order/PUR-ORD-2026-00001", { "purchase-order": "simplified" });
    assert.equal(s.surface, "erp");
    assert.equal(s.lens, "simplified");
  });

  it("a new payment opens Pay Bills; a Receive one stays Vanilla (AR not built)", () => {
    const pay = open("/app/payment-entry/new", {}, { paymentDirection: "Pay" });
    assert.equal(pay.surface, "pay-outstanding");
    assert.equal(pay.route, "/app/payment-entry/new");
    assert.equal(open("/app/payment-entry/new", {}, { paymentDirection: "Receive" }).surface, "erp");
  });

  it("an existing payment opens the check page", () => {
    const t = open("/app/payment-entry/ACC-PAY-2026-00001");
    assert.equal(t.surface, "payment-doc");
    assert.equal(t.route, "/app/payment-entry/ACC-PAY-2026-00001");
  });

  it("a record with no skin is Vanilla whatever the lens memory says", () => {
    const t = open("/app/sales-order/SAL-ORD-2026-00001", { "sales-order": "doc" });
    assert.equal(t.surface, "erp");
    assert.equal(t.lens, "vanilla");
    assert.equal(open("/app/supplier/SAMPLE%20Vendor%2001").surface, "erp");
  });

  it("Desk, site root and reports are Vanilla", () => {
    assert.equal(open("/desk").surface, "erp");
    assert.equal(open("/app").surface, "erp");
    assert.equal(open("/app/query-report/Balance%20Sheet").surface, "erp");
  });
});

describe("resolveOpenTarget — lists and their Find pages", () => {
  it("a list with a Find page opens it by default", () => {
    const t = open("/app/purchase-invoice");
    assert.equal(t.surface, "find-doc");
    assert.equal(t.route, "/app/purchase-invoice");
    assert.equal(t.doctype, "purchase-invoice");
  });

  it("the form's lens never decides the list's", () => {
    assert.equal(open("/app/purchase-invoice", { "purchase-invoice": "vanilla" }).surface, "find-doc");
    assert.equal(
      open("/app/purchase-invoice", { "purchase-invoice:list": "vanilla" }).surface,
      "erp",
    );
    assert.equal(
      open("/app/purchase-invoice/ACC-PINV-1", { "purchase-invoice:list": "vanilla" }).surface,
      "doc-form",
    );
  });

  it("Report / Kanban views share the list's Find page and address", () => {
    const t = open("/app/purchase-invoice/view/report");
    assert.equal(t.surface, "find-doc");
    assert.equal(t.route, "/app/purchase-invoice");
  });

  it("A/R lists have Find pages before their forms have skins", () => {
    for (const dt of ["quotation", "sales-order", "sales-invoice", "payment-entry"]) {
      assert.equal(open(`/app/${dt}`).surface, "find-doc", dt);
    }
  });

  it("a list with no Find page is Vanilla", () => {
    assert.equal(open("/app/item").surface, "erp");
    assert.equal(open("/app/journal-entry").surface, "erp");
  });

  it("filters in the address do not change the answer", () => {
    assert.equal(open("/app/purchase-invoice?supplier=X").surface, "find-doc");
  });
});

describe("pageHasOwnDocSkin (toolbar Doc tab)", () => {
  it("true for skinned records and Find-page lists, false for Desk and masters", () => {
    assert.equal(pageHasOwnDocSkin({ route: "/app/purchase-invoice/X", doctype: "purchase-invoice", record: "X" }), true);
    assert.equal(pageHasOwnDocSkin({ route: "/app/purchase-invoice", doctype: "purchase-invoice", record: "" }), true);
    assert.equal(pageHasOwnDocSkin({ route: "/desk", doctype: "", record: "" }), false);
    assert.equal(pageHasOwnDocSkin({ route: "/app/tax-category/Capital", doctype: "tax-category", record: "Capital" }), false);
  });

  it("matches the Payment Entry rule the toolbar used to hand-code", () => {
    const pe = (record, paymentDirection) =>
      pageHasOwnDocSkin({ route: `/app/payment-entry/${record}`, doctype: "payment-entry", record, paymentDirection });
    assert.equal(pe("new", "Pay"), true);
    assert.equal(pe("new", "Receive"), false);
    assert.equal(pe("ACC-PAY-2026-00001", "Receive"), true);
  });
});

describe("resolveOpenTarget — explicit lens (the toolbar Doc tab)", () => {
  it("overrides the remembered lens", () => {
    const prefs = { "purchase-invoice": "vanilla", "purchase-invoice:list": "vanilla" };
    assert.equal(open("/app/purchase-invoice/X", prefs, { lens: "doc" }).surface, "doc-form");
    assert.equal(open("/app/purchase-invoice", prefs, { lens: "doc" }).surface, "find-doc");
  });
  it("still cannot conjure a skin", () => {
    assert.equal(open("/app/item", {}, { lens: "doc" }).surface, "erp");
  });
});
