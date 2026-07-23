import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyHostClass,
  hostClassLabel,
  formatDiagnoseLines,
  diagnoseCopyText,
  appendPingLog,
} from "../src/diagnose.js";

describe("classifyHostClass", () => {
  it("maps localhost, lan, and cloud", () => {
    assert.equal(classifyHostClass("http://localhost:8080"), "this-pc");
    assert.equal(classifyHostClass("http://192.168.1.10"), "lan");
    assert.equal(classifyHostClass("http://10.0.0.5:8000"), "lan");
    assert.equal(classifyHostClass("https://books.example.com"), "cloud");
  });
});

describe("formatDiagnoseLines", () => {
  it("builds copyable clerk-facing lines on bad ping", () => {
    const lines = formatDiagnoseLines({
      erpBase: "http://192.168.1.10:8080",
      status: "bad",
      code: null,
      lastOkAt: "14:02",
      internetOk: true,
    });
    const text = diagnoseCopyText(lines);
    assert.match(text, /Server: http:\/\/192\.168\.1\.10:8080/);
    assert.match(text, /Host class: LAN/);
    assert.match(text, /ERP reply: timeout/);
    assert.match(text, /Last good: 14:02/);
    assert.match(text, /Internet check: OK/);
    assert.match(text, /Try:/);
    assert.equal(hostClassLabel("lan"), "LAN / private network");
  });

  it("reports OK with latency", () => {
    const lines = formatDiagnoseLines({
      erpBase: "http://localhost:8080",
      status: "ok",
      latencyMs: 42,
      internetOk: null,
    });
    assert.match(diagnoseCopyText(lines), /ERP reply: OK \(42 ms\)/);
  });
});

describe("appendPingLog", () => {
  it("trims by age and max entries", () => {
    const now = Date.parse("2026-07-21T12:00:00Z");
    let log = appendPingLog([], { at: "2026-07-20T12:00:00Z", status: "ok" }, { nowMs: now });
    log = appendPingLog(log, { at: "2026-07-21T11:00:00Z", status: "bad" }, { nowMs: now });
    assert.equal(log.length, 2);
    log = appendPingLog(log, { at: "2026-06-01T00:00:00Z", status: "ok" }, { nowMs: now });
    assert.equal(log.length, 2);
    log = appendPingLog(
      [
        { at: "2026-07-21T10:00:00Z", status: "ok" },
        { at: "2026-07-21T10:01:00Z", status: "ok" },
        { at: "2026-07-21T10:02:00Z", status: "ok" },
      ],
      { at: "2026-07-21T10:03:00Z", status: "bad" },
      { nowMs: now, maxEntries: 3 },
    );
    assert.equal(log.length, 3);
    assert.equal(log[2].status, "bad");
  });
});
