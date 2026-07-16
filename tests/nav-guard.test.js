import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAllowedErpUrl, erpUrl } from "../src/nav-guard.js";

describe("isAllowedErpUrl", () => {
  const base = "http://localhost:8080";

  it("allows ERP origin and paths", () => {
    assert.equal(isAllowedErpUrl(base, "http://localhost:8080"), true);
    assert.equal(isAllowedErpUrl(base, "http://localhost:8080/desk"), true);
    assert.equal(isAllowedErpUrl(base, "http://localhost:8080/login"), true);
  });

  it("allows blank/blob/data for print helpers", () => {
    assert.equal(isAllowedErpUrl(base, "about:blank"), true);
    assert.equal(isAllowedErpUrl(base, "blob:http://localhost:8080/x"), true);
    assert.equal(isAllowedErpUrl(base, "data:text/html,hi"), true);
  });

  it("blocks external sites", () => {
    assert.equal(isAllowedErpUrl(base, "https://evil.example/"), false);
    assert.equal(isAllowedErpUrl(base, "http://localhost:9090/desk"), false);
  });
});

describe("erpUrl", () => {
  it("joins base and route", () => {
    assert.equal(erpUrl("http://localhost:8080/", "/desk"), "http://localhost:8080/desk");
    assert.equal(erpUrl("http://localhost:8080", "login"), "http://localhost:8080/login");
  });
});
