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
  redactFocusDetail,
  slimFocusTrail,
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

describe("redactFocusDetail (plan 2026-10-21 trail, no field values in an incident)", () => {
  it("keeps a pick line's shape, rule and source, drops its text", () => {
    const line = 'Item typed="SAMPLE-SKU-0" list="W" rule=held picked="SAMPLE-SKU-01" src=copy';
    assert.equal(redactFocusDetail("link-pick-key", line), "Item typed=(12 chars) list=(1 chars) rule=held picked=(13 chars) src=copy");
    assert.equal(redactFocusDetail("link-held", 'Item typed="a" list=none rule=held src=live'), "Item typed=(1 chars) list=none rule=held src=live");
    assert.equal(redactFocusDetail("vendor-missing", "vendor:ZZ GONE"), "vendor:(7 chars)");
    assert.equal(redactFocusDetail("paint-start", 'onSnapshot "x"'), 'onSnapshot "x"');
  });
  it("slimFocusTrail applies it", () => {
    const [row] = slimFocusTrail([{ event: "link-pick", detail: 'Supplier typed="ACME" list="AC" rule=chosen picked="ACME" src=copy' }]);
    assert.doesNotMatch(row.detail, /ACME/);
  });
});
