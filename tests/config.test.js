import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveErpBase, DEFAULT_ERP_BASE } from "../src/config.js";

describe("resolveErpBase", () => {
  it("defaults to localhost:8080", () => {
    assert.equal(resolveErpBase({}), DEFAULT_ERP_BASE);
  });

  it("uses ERP_URL and strips trailing slash", () => {
    assert.equal(resolveErpBase({ ERP_URL: "http://127.0.0.1:8080/" }), "http://127.0.0.1:8080");
  });
});
