import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  routeInfo,
  titleizeDoctype,
  isNewDocRecord,
  normalizeAppRoute,
  routesReferToSameDoc,
} from "../src/route-info.js";

describe("routeInfo", () => {
  it("parses desk doctype and record", () => {
    assert.deepEqual(routeInfo("/desk/purchase-invoice/ACC-PINV-0001"), {
      path: "/desk/purchase-invoice/ACC-PINV-0001",
      doctype: "purchase-invoice",
      record: "ACC-PINV-0001",
    });
  });

  it("parses app routes and strips query", () => {
    const r = routeInfo("/app/sales-order/new?foo=1");
    assert.equal(r.doctype, "sales-order");
    assert.equal(r.record, "new");
    assert.equal(r.path, "/app/sales-order/new");
  });

  it("strips erpBase from full URLs", () => {
    const r = routeInfo("http://localhost:8080/desk/item", "http://localhost:8080");
    assert.equal(r.doctype, "item");
    assert.equal(r.path, "/desk/item");
  });

  it("returns empty doctype for bare desk", () => {
    assert.equal(routeInfo("/desk").doctype, "");
    assert.equal(routeInfo("/login").doctype, "");
  });
});

describe("titleizeDoctype", () => {
  it("title-cases slug", () => {
    assert.equal(titleizeDoctype("purchase-invoice"), "Purchase Invoice");
  });
});

describe("isNewDocRecord / normalizeAppRoute", () => {
  it("treats new and new-* as new", () => {
    assert.equal(isNewDocRecord("new"), true);
    assert.equal(isNewDocRecord("new-purchase-invoice-xyz"), true);
    assert.equal(isNewDocRecord(""), true);
    assert.equal(isNewDocRecord("ACC-PINV-1"), false);
  });

  it("rewrites desk paths to app", () => {
    const n = normalizeAppRoute("/desk/purchase-invoice/new");
    assert.equal(n.path, "/app/purchase-invoice/new");
    assert.equal(n.doctype, "purchase-invoice");
    assert.equal(n.isNew, true);
  });
});

describe("routesReferToSameDoc", () => {
  it("matches same saved name across desk/app", () => {
    assert.equal(
      routesReferToSameDoc(
        "/app/purchase-invoice/ACC-1",
        "/desk/purchase-invoice/ACC-1",
      ),
      true,
    );
  });

  it("matches any two new-bill routes (Recent must not reload)", () => {
    assert.equal(
      routesReferToSameDoc(
        "/app/purchase-invoice/new-purchase-invoice-abc",
        "/app/purchase-invoice/new",
      ),
      true,
    );
  });

  it("does not match different saved docs", () => {
    assert.equal(
      routesReferToSameDoc(
        "/app/purchase-invoice/ACC-1",
        "/app/purchase-invoice/ACC-2",
      ),
      false,
    );
  });

  it("does not match different doctypes", () => {
    assert.equal(
      routesReferToSameDoc("/app/purchase-invoice/new", "/app/sales-order/new"),
      false,
    );
  });
});
