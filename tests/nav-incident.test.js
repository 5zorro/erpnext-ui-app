import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NAV_INCIDENT_NOTE_MAX,
  sanitizeNavIncidentNote,
  slimDocIdentity,
  slimHistoryForIncident,
  slimNavIncidentContext,
  buildNavIncident,
  formatNavIncidentContextLines,
  formatNavIncidentLines,
  formatNavIncidentsDigest,
  appendNavIncident,
  serializeNavIncidentLine,
} from "../src/nav-incident.js";

describe("sanitizeNavIncidentNote", () => {
  it("trims and strips control characters", () => {
    assert.equal(sanitizeNavIncidentNote("  peek stuck\u0000\nthen Esc  "), "peek stuck\nthen Esc");
  });

  it("caps length", () => {
    const long = "x".repeat(NAV_INCIDENT_NOTE_MAX + 50);
    assert.equal(sanitizeNavIncidentNote(long).length, NAV_INCIDENT_NOTE_MAX);
  });

  it("treats blank as empty", () => {
    assert.equal(sanitizeNavIncidentNote("   \n  "), "");
  });
});

describe("slim helpers", () => {
  it("keeps only history labels/routes", () => {
    const slim = slimHistoryForIncident([
      { route: "/app/tax-category/X", label: "Tax Category", kind: "setup", detail: "setup", extra: "drop-me" },
    ]);
    assert.deepEqual(slim, [
      { route: "/app/tax-category/X", label: "Tax Category", kind: "setup", detail: "setup" },
    ]);
  });

  it("keeps doc identity only", () => {
    const slim = slimDocIdentity({
      doctype: "Purchase Invoice",
      name: "new-purchase-invoice-abc",
      docstatus: 0,
      grand_total: 99,
      items: [{ item_code: "SECRET" }],
    });
    assert.deepEqual(slim, {
      doctype: "Purchase Invoice",
      name: "new-purchase-invoice-abc",
      docstatus: 0,
    });
  });
});

describe("buildNavIncident", () => {
  it("rejects empty notes", () => {
    assert.equal(buildNavIncident({ surfaceMode: "bill" }, "   "), null);
  });

  it("freezes a slim snapshot with the note", () => {
    const inc = buildNavIncident(
      {
        surfaceMode: "erp",
        currentRoute: "/app/tax-category/RETAIL",
        erpPath: "/app/tax-category/RETAIL",
        parked: { mode: "bill", skinId: null, route: "/app/purchase-invoice/new" },
        doc: { doctype: "Purchase Invoice", name: "new-x", docstatus: 0, supplier: "Acme" },
        history: [{ route: "/app/purchase-invoice/new", label: "New Bill", kind: "doc" }],
        navTrail: [{ at: "2026-08-19T22:00:00.000Z", event: "soft-peek", surfaceMode: "bill", currentRoute: "/app/purchase-invoice/new", detail: "/app/tax-category/RETAIL" }],
        userEdited: true,
        guestWindowCount: 2,
      },
      "Vanilla peek worked in the browser; Doc did not come back.",
      "2026-08-19T22:01:00.000Z",
    );
    assert.equal(inc.kind, "nav-incident");
    assert.match(inc.note, /Vanilla peek/);
    assert.equal(inc.context.surfaceMode, "erp");
    assert.equal(inc.context.parked.mode, "bill");
    assert.equal(inc.context.doc.supplier, undefined);
    assert.equal(inc.context.guestWindowCount, 2);
    const lines = formatNavIncidentLines(inc);
    assert.match(lines.join("\n"), /Note: Vanilla peek/);
    assert.match(lines.join("\n"), /surface: erp/);
    const json = serializeNavIncidentLine(inc);
    assert.equal(JSON.parse(json).note, inc.note);
  });
});

describe("incident ring + digest", () => {
  it("caps the session ring", () => {
    let ring = [];
    for (let i = 0; i < 5; i++) {
      ring = appendNavIncident(ring, buildNavIncident({ surfaceMode: "home" }, `n${i}`), {
        maxEntries: 3,
      });
    }
    assert.equal(ring.length, 3);
    assert.equal(ring[0].note, "n2");
  });

  it("empty digest placeholder", () => {
    assert.match(formatNavIncidentsDigest([]).join("\n"), /none this session/);
  });

  it("context preview is one screen of facts", () => {
    const lines = formatNavIncidentContextLines({
      surfaceMode: "bill",
      currentRoute: "/app/purchase-invoice/new",
    });
    assert.ok(lines.some((l) => l.startsWith("surface:")));
    assert.ok(lines.some((l) => l.startsWith("peeks:")));
    assert.equal(slimNavIncidentContext({}).history.length, 0);
    assert.equal(slimNavIncidentContext({}).peekParent, "");
    assert.deepEqual(
      slimNavIncidentContext({
        peekParent: "/app/purchase-invoice/new",
        peekChildren: ["/app/tax-category/X", "/app/supplier/Acme"],
      }).peekChildren,
      ["/app/tax-category/X", "/app/supplier/Acme"],
    );
  });
});
