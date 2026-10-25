import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPingUrl,
  classifyHealthStatus,
  classifyLoginProbe,
  loginRouteFor,
  pingHealth,
  probeLogin,
  loginCheckOnHealthChange,
  loginCheckAfterRefusal,
  LOGIN_PROBE_PATH,
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

describe("classifyLoginProbe", () => {
  it("403 is logged out — Guest and a stale sid both get it", () => {
    assert.equal(classifyLoginProbe(403, { exc_type: "PermissionError" }), "out");
    assert.equal(classifyLoginProbe(403, { session_expired: 1 }), "out");
    assert.equal(classifyLoginProbe(401, null), "out");
  });
  it("200 with a user is logged in; Guest is not", () => {
    assert.equal(classifyLoginProbe(200, { message: "Administrator" }), "in");
    assert.equal(classifyLoginProbe(200, { message: "Guest" }), "out");
  });
  it("anything else is unknown, so the toolbar does not cry wolf", () => {
    assert.equal(classifyLoginProbe(null, null), "unknown");
    assert.equal(classifyLoginProbe(502, null), "unknown");
    assert.equal(classifyLoginProbe(200, {}), "unknown");
  });
});

describe("probeLogin", () => {
  const res = (status, body) => ({ status, json: async () => body });
  it("reads the user from a live session", async () => {
    const r = await probeLogin({ erpBase: "http://x", fetchImpl: async () => res(200, { message: "a@b.c" }) });
    assert.deepEqual(r, { state: "in", user: "a@b.c", code: 200, expired: false });
  });
  it("flags an expired session", async () => {
    const r = await probeLogin({ erpBase: "http://x", fetchImpl: async () => res(403, { session_expired: 1 }) });
    assert.equal(r.state, "out");
    assert.equal(r.expired, true);
  });
  it("is unknown on a network error or with no session fetch", async () => {
    const r = await probeLogin({ erpBase: "http://x", fetchImpl: async () => { throw new Error("down"); } });
    assert.equal(r.state, "unknown");
    assert.equal((await probeLogin({ erpBase: "http://x" })).state, "unknown");
  });
  it("asks get_logged_user", async () => {
    let asked = "";
    await probeLogin({ erpBase: "http://x/", fetchImpl: async (u) => { asked = u; return res(403, null); } });
    assert.equal(asked, "http://x/api/method/frappe.auth.get_logged_user");
  });
});

describe("loginRouteFor", () => {
  it("returns to the Vanilla page the clerk was on", () => {
    assert.deepEqual(loginRouteFor("/app/purchase-invoice/new"), { path: "/login", search: "redirect-to=%2Fapp%2Fpurchase-invoice%2Fnew" });
  });
  it("falls back to Desk from the login page itself or a blank view", () => {
    assert.equal(loginRouteFor("/login").search, "redirect-to=%2Fdesk");
    assert.equal(loginRouteFor("").search, "redirect-to=%2Fdesk");
  });
});

describe("when the login question is asked (review 10-19 R4-1)", () => {
  it("a health tick asks only when the server's state changed", () => {
    assert.equal(loginCheckOnHealthChange("unknown", "ok"), true, "first answer at launch");
    assert.equal(loginCheckOnHealthChange("down", "ok"), true, "server came back");
    assert.equal(loginCheckOnHealthChange("ok", "down"), true, "server went away");
    assert.equal(loginCheckOnHealthChange("ok", "ok"), false, "the 5 s beat never asks");
  });
  it("a refused signed-in read asks, but the login check's own 403 does not", () => {
    assert.equal(loginCheckAfterRefusal(403, "http://x/api/resource/Purchase%20Invoice"), true);
    assert.equal(loginCheckAfterRefusal(401, "http://x/api/method/y"), true);
    assert.equal(loginCheckAfterRefusal(200, "http://x/api/resource/Item"), false);
    assert.equal(loginCheckAfterRefusal(417, "http://x/api/method/y"), false);
    assert.equal(loginCheckAfterRefusal(403, `http://x${LOGIN_PROBE_PATH}`), false);
  });
});
