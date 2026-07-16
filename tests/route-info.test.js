import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeInfo, titleizeDoctype } from "../src/route-info.js";

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
