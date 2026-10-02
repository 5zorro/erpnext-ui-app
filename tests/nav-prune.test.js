import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  existenceQueryPath,
  missingFromResponse,
  navRecordOf,
  pruneVanished,
  recordsToVerify,
  vanishedKey,
} from "../src/nav-prune.js";

const BASE = "http://localhost:8080";

describe("navRecordOf", () => {
  it("reads shelved / submitted rows by doctypeKey + name", () => {
    assert.deepEqual(navRecordOf({ doctypeKey: "purchase-invoice", name: "ACC-PINV-2026-00145" }), {
      doctypeKey: "purchase-invoice",
      name: "ACC-PINV-2026-00145",
    });
  });
  it("reads Recent rows by route", () => {
    assert.deepEqual(navRecordOf({ route: "/app/purchase-order/PUR-ORD-2026-00404" }, BASE), {
      doctypeKey: "purchase-order",
      name: "PUR-ORD-2026-00404",
    });
  });
  it("skips lists and unsaved drafts — there is nothing to look up", () => {
    assert.equal(navRecordOf({ route: "/app/purchase-invoice" }, BASE), null);
    assert.equal(navRecordOf({ route: "/app/purchase-invoice/new-purchase-invoice-x" }, BASE), null);
    assert.equal(navRecordOf({ doctypeKey: "purchase-invoice", name: "new-purchase-invoice-1" }), null);
    assert.equal(navRecordOf(null), null);
  });
});

describe("recordsToVerify", () => {
  it("groups by doctype across all three lists, without repeats", () => {
    const m = recordsToVerify(
      [
        [{ doctypeKey: "purchase-invoice", name: "A" }],
        [{ doctypeKey: "purchase-invoice", name: "A" }, { doctypeKey: "payment-entry", name: "P" }],
        [{ route: "/app/purchase-invoice/B" }, { route: "/desk" }],
      ],
      BASE,
    );
    assert.deepEqual([...m.entries()], [
      ["purchase-invoice", ["A", "B"]],
      ["payment-entry", ["P"]],
    ]);
  });
});

describe("existenceQueryPath", () => {
  it("asks the resource API for just those names", () => {
    const p = existenceQueryPath("purchase-invoice", ["A", "B"]);
    assert.ok(p.startsWith("/api/resource/Purchase%20Invoice?"));
    const q = new URLSearchParams(p.split("?")[1]);
    assert.deepEqual(JSON.parse(q.get("filters")), [["name", "in", ["A", "B"]]]);
    assert.deepEqual(JSON.parse(q.get("fields")), ["name"]);
    assert.equal(q.get("limit_page_length"), "0");
  });
});

describe("missingFromResponse", () => {
  it("names what ERP did not return", () => {
    assert.deepEqual(missingFromResponse(["A", "B", "C"], 200, { data: [{ name: "B" }] }), ["A", "C"]);
    assert.deepEqual(missingFromResponse(["A"], 200, { data: [] }), ["A"]);
  });
  it("an unclear answer drops nothing", () => {
    assert.equal(missingFromResponse(["A"], 403, { exc_type: "PermissionError" }), null);
    assert.equal(missingFromResponse(["A"], null, null), null);
    assert.equal(missingFromResponse(["A"], 200, { message: "odd" }), null);
  });
});

describe("pruneVanished", () => {
  it("drops only the vanished rows and keeps lists and new drafts", () => {
    const list = [
      { route: "/app/purchase-invoice/GONE" },
      { route: "/app/purchase-invoice" },
      { route: "/app/purchase-invoice/HERE" },
      { doctypeKey: "purchase-invoice", name: "GONE" },
    ];
    const { kept, dropped } = pruneVanished(list, new Set([vanishedKey("purchase-invoice", "GONE")]), BASE);
    assert.deepEqual(kept, [list[1], list[2]]);
    assert.deepEqual(dropped, [list[0], list[3]]);
  });
});
