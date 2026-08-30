import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendFocusDebug,
  formatFocusDebugLines,
  summarizeActiveElement,
} from "../src/focus-debug.js";

describe("summarizeActiveElement", () => {
  it("summarizes data-field", () => {
    const el = {
      tagName: "INPUT",
      nodeName: "INPUT",
      getAttribute: (k) => (k === "data-field" ? "invoice_date" : ""),
      isConnected: true,
      readOnly: false,
      tabIndex: 0,
    };
    const s = summarizeActiveElement(/** @type {Element} */ (el));
    assert.match(s.summary || "", /invoice_date/);
  });

  it("marks BODY", () => {
    const s = summarizeActiveElement({ tagName: "BODY", nodeName: "BODY" });
    assert.equal(s.summary, "BODY");
  });
});

describe("appendFocusDebug", () => {
  it("caps length and keeps newest", () => {
    let log = [];
    for (let i = 0; i < 5; i++) {
      log = appendFocusDebug(log, { at: `2026-08-14T00:00:0${i}Z`, event: `e${i}` }, { maxEntries: 3 });
    }
    assert.equal(log.length, 3);
    assert.equal(log[0].event, "e2");
    assert.equal(log[2].event, "e4");
  });
});

describe("formatFocusDebugLines", () => {
  it("includes empty placeholder", () => {
    const lines = formatFocusDebugLines([]);
    assert.match(lines.join("\n"), /no focus events yet/);
  });

  it("formats active summary", () => {
    const lines = formatFocusDebugLines([
      {
        at: "2026-08-14T22:15:03.000Z",
        event: "source-modal-close",
        surfaceMode: "bill",
        surface: "bill",
        detail: "cancel",
        active: { summary: "INPUT field=invoice_date" },
      },
    ]);
    assert.match(lines.join("\n"), /source-modal-close/);
    assert.match(lines.join("\n"), /invoice_date/);
  });
});
