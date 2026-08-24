import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendNavDebug, formatNavDebugLines } from "../src/nav-debug.js";

describe("appendNavDebug", () => {
  it("caps length and keeps newest", () => {
    let log = [];
    for (let i = 0; i < 5; i++) {
      log = appendNavDebug(log, { at: `2026-08-14T00:00:0${i}Z`, event: `e${i}` }, { maxEntries: 3 });
    }
    assert.equal(log.length, 3);
    assert.equal(log[0].event, "e2");
    assert.equal(log[2].event, "e4");
  });
});

describe("formatNavDebugLines", () => {
  it("includes empty placeholder", () => {
    const lines = formatNavDebugLines([]);
    assert.match(lines.join("\n"), /no clicks yet/);
  });

  it("formats a click line", () => {
    const lines = formatNavDebugLines([
      {
        at: "2026-08-14T22:15:03.000Z",
        event: "hist-click",
        surfaceMode: "bill",
        currentRoute: "/app/purchase-invoice/new",
        detail: "→ /app/tax-category/X",
      },
    ]);
    assert.match(lines.join("\n"), /hist-click/);
    assert.match(lines.join("\n"), /tax-category/);
  });
});
