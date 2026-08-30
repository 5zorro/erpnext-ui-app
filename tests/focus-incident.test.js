import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FOCUS_INCIDENT_NOTE_MAX,
  sanitizeFocusIncidentNote,
  buildFocusIncident,
  formatFocusIncidentContextLines,
  formatFocusIncidentLines,
  formatFocusIncidentsDigest,
  appendFocusIncident,
  serializeFocusIncidentLine,
} from "../src/focus-incident.js";

describe("sanitizeFocusIncidentNote", () => {
  it("trims and caps like nav incident", () => {
    assert.equal(sanitizeFocusIncidentNote("  Tab stuck\u0000  "), "Tab stuck");
    const long = "x".repeat(FOCUS_INCIDENT_NOTE_MAX + 10);
    assert.equal(sanitizeFocusIncidentNote(long).length, FOCUS_INCIDENT_NOTE_MAX);
  });
});

describe("buildFocusIncident", () => {
  it("includes focus trail in context", () => {
    const inc = buildFocusIncident(
      {
        surfaceMode: "bill",
        currentRoute: "/app/purchase-invoice/new",
        focusTrail: [
          {
            at: "2026-08-14T22:15:03.000Z",
            event: "link-pick",
            surfaceMode: "bill",
            surface: "bill",
            detail: "Supplier",
            active: { summary: "INPUT field=supplier" },
          },
        ],
      },
      "Tab dead after cancel",
      "2026-08-14T22:16:00.000Z",
    );
    assert.ok(inc);
    assert.equal(inc.kind, "focus-incident");
    const lines = formatFocusIncidentContextLines(inc.context);
    assert.match(lines.join("\n"), /Focus trail/);
    assert.match(lines.join("\n"), /link-pick/);
  });

  it("rejects empty note", () => {
    assert.equal(buildFocusIncident({}, "   "), null);
  });
});

describe("formatFocusIncidentLines", () => {
  it("serializes JSONL", () => {
    const inc = buildFocusIncident({ surfaceMode: "bill" }, "note", "2026-08-14T22:16:00.000Z");
    assert.ok(inc);
    const line = serializeFocusIncidentLine(inc);
    assert.match(line, /"focus-incident"/);
    const parsed = JSON.parse(line.trim());
    assert.equal(parsed.note, "note");
  });
});

describe("appendFocusIncident", () => {
  it("rings incidents", () => {
    const a = buildFocusIncident({}, "a", "2026-08-14T22:16:00.000Z");
    const b = buildFocusIncident({}, "b", "2026-08-14T22:17:00.000Z");
    assert.ok(a && b);
    let ring = appendFocusIncident([], a, { maxEntries: 1 });
    ring = appendFocusIncident(ring, b, { maxEntries: 1 });
    assert.equal(ring.length, 1);
    assert.equal(ring[0].note, "b");
  });
});

describe("formatFocusIncidentsDigest", () => {
  it("shows placeholder when empty", () => {
    const lines = formatFocusIncidentsDigest([]);
    assert.match(lines.join("\n"), /none this session/);
  });

  it("formats logged incident", () => {
    const inc = buildFocusIncident({ surfaceMode: "bill" }, "Tab stuck", "2026-08-14T22:16:00.000Z");
    assert.ok(inc);
    const lines = formatFocusIncidentsDigest([inc]);
    assert.match(lines.join("\n"), /Tab stuck/);
    assert.match(formatFocusIncidentLines(inc).join("\n"), /Focus incident/);
  });
});
