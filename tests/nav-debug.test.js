import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendNavDebug, formatNavDebugLines, NAV_DEBUG_NOISE_EVENTS } from "../src/nav-debug.js";

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

describe("appendNavDebug noise quota — chaos-lag must not evict nav decisions", () => {
  // The nav incident filed 2026-09-08T03:38 arrived with a 20-entry trail that was 20/20
  // chaos-lag; the showErp / nav-intent / trackNav-stale sequence that explained the bug had
  // already been pushed out of the ring by lag telemetry.
  it("names chaos-lag as noise", () => {
    assert.ok(NAV_DEBUG_NOISE_EVENTS.has("chaos-lag"));
  });

  it("a flood of chaos-lag keeps every decision entry", () => {
    let log = appendNavDebug([], { at: "2026-09-08T03:38:28.125Z", event: "showErp" });
    log = appendNavDebug(log, { at: "2026-09-08T03:38:28.126Z", event: "nav-intent" });
    for (let i = 0; i < 200; i++) {
      log = appendNavDebug(log, {
        at: `2026-09-08T03:38:29.${String(i).padStart(3, "0")}Z`,
        event: "chaos-lag",
        detail: `channel=erpEval ms=${i}`,
      });
    }
    const events = log.map((e) => e.event);
    assert.ok(events.includes("showErp"), "showErp survived the flood");
    assert.ok(events.includes("nav-intent"), "nav-intent survived the flood");
    assert.equal(events.filter((e) => e === "chaos-lag").length, 8, "noise capped at maxEntries/5");
  });

  it("drops the oldest noise first and keeps chronological order", () => {
    let log = [];
    log = appendNavDebug(log, { at: "2026-09-08T00:00:00Z", event: "chaos-lag" }, { maxNoise: 2 });
    log = appendNavDebug(log, { at: "2026-09-08T00:00:01Z", event: "showErp" }, { maxNoise: 2 });
    log = appendNavDebug(log, { at: "2026-09-08T00:00:02Z", event: "chaos-lag" }, { maxNoise: 2 });
    log = appendNavDebug(log, { at: "2026-09-08T00:00:03Z", event: "chaos-lag" }, { maxNoise: 2 });
    assert.deepEqual(
      log.map((e) => e.at),
      ["2026-09-08T00:00:01Z", "2026-09-08T00:00:02Z", "2026-09-08T00:00:03Z"],
    );
  });

  it("noise alone still works and stays capped", () => {
    let log = [];
    for (let i = 0; i < 50; i++) {
      log = appendNavDebug(log, { at: `2026-09-08T00:00:${String(i).padStart(2, "0")}Z`, event: "chaos-lag" });
    }
    assert.equal(log.length, 8);
  });

  it("non-noise events are still capped by maxEntries", () => {
    let log = [];
    for (let i = 0; i < 60; i++) {
      log = appendNavDebug(log, { at: `2026-09-08T00:01:${String(i).padStart(2, "0")}Z`, event: `nav-${i}` });
    }
    assert.equal(log.length, 40);
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
