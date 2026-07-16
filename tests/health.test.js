import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPingUrl,
  classifyHealthStatus,
  pingHealth,
} from "../src/health.js";

describe("buildPingUrl", () => {
  it("joins base and path without double slashes", () => {
    assert.equal(
      buildPingUrl("http://localhost:8080", "/api/method/ping"),
      "http://localhost:8080/api/method/ping",
    );
    assert.equal(
      buildPingUrl("http://localhost:8080/", "/api/method/ping"),
      "http://localhost:8080/api/method/ping",
    );
  });

  it("rejects empty base", () => {
    assert.throws(() => buildPingUrl(""), TypeError);
  });
});

describe("classifyHealthStatus", () => {
  it("maps 2xx to ok and others to bad", () => {
    assert.equal(classifyHealthStatus(200), "ok");
    assert.equal(classifyHealthStatus(204), "ok");
    assert.equal(classifyHealthStatus(500), "bad");
    assert.equal(classifyHealthStatus(404), "bad");
  });

  it("maps network errors to bad and null to unknown", () => {
    assert.equal(classifyHealthStatus(null, { networkError: true }), "bad");
    assert.equal(classifyHealthStatus(null), "unknown");
  });
});

describe("pingHealth", () => {
  it("returns ok when fetch resolves 200", async () => {
    const fakeFetch = async () => ({ status: 200 });
    const r = await pingHealth({
      erpBase: "http://localhost:8080",
      fetchImpl: fakeFetch,
    });
    assert.equal(r.status, "ok");
    assert.equal(r.code, 200);
    assert.match(r.url, /\/api\/method\/ping$/);
  });

  it("returns bad on fetch failure", async () => {
    const fakeFetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const r = await pingHealth({
      erpBase: "http://localhost:8080",
      fetchImpl: fakeFetch,
    });
    assert.equal(r.status, "bad");
    assert.equal(r.code, null);
  });
});
