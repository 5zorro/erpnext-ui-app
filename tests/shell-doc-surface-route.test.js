import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const main = readFileSync(fileURLToPath(new URL("../electron/main.js", import.meta.url)), "utf8");
const chromeHtml = readFileSync(
  fileURLToPath(new URL("../electron/chrome.html", import.meta.url)),
  "utf8",
);

/**
 * Wiring guard for nav incident 2026-09-10 ("Recent did not populate"). The two shell-local
 * Doc surfaces load a local file rather than navigating ERP, so nothing else in the shell can
 * notice where the clerk went — if these calls go missing the surfaces become invisible to
 * Recent, the lens chip and incident snapshots again, and no pure test would catch it.
 */
describe("shell-local Doc surfaces claim an ERP route", () => {
  const bodyOf = (name) => {
    const start = main.indexOf(`function ${name}(`);
    assert.ok(start > 0, `${name} not found in main.js`);
    const next = main.indexOf("\nfunction ", start + 1);
    return main.slice(start, next > 0 ? next : main.length);
  };

  it("showPayOutstanding records /app/payment-entry/new", () => {
    const body = bodyOf("showPayOutstanding");
    assert.match(body, /noteShellDocSurfaceRoute\(\s*docSkinTargetRoute\(\{ kind: "pay-outstanding" \}\)/);
  });

  it("showPaymentDoc records the payment's own route", () => {
    const body = bodyOf("showPaymentDoc");
    assert.match(
      body,
      /noteShellDocSurfaceRoute\(\s*docSkinTargetRoute\(\{ kind: "payment-doc", record \}\)/,
    );
  });

  it("noteShellDocSurfaceRoute both sets currentRoute and pushes a Recent row", () => {
    const body = bodyOf("noteShellDocSurfaceRoute");
    assert.match(body, /currentRoute = route;/);
    assert.match(body, /history = pushHistory\(history, route,/);
  });

  it("the Recent click path can reopen a skin that is not a doc-form profile", () => {
    // Without this, the row Recent now shows would reopen in Vanilla — the same
    // "remembered Doc lens silently downgraded" bug, one door further along.
    assert.match(bodyOf("openHistoryRoute"), /if \(openShellDocSurface\(path\)\) return;/);
    assert.match(main, /if \(openShellDocSurface\(r\)\) return;/);
  });
});

describe("the toolbar renders lens selection rather than re-deriving it", () => {
  it("main sends the emphasis chrome-state computed", () => {
    assert.match(main, /lensActive: lensTabEmphasis\(\{ lens: lensId, docAvailable: lensTabs\.doc \}\)/);
  });

  it("chrome.html applies s.lensActive to all three tabs", () => {
    assert.match(chromeHtml, /const emphasis = s\.lensActive \|\| \{\};/);
    for (const tab of ["lensDoc", "lensVanilla", "lensSimplified"]) {
      const key = tab.replace("lens", "").toLowerCase();
      assert.match(
        chromeHtml,
        new RegExp(`${tab}\\.classList\\.toggle\\("active", !!emphasis\\.${key}\\)`),
        `${tab} does not render the emphasis it was sent`,
      );
    }
  });

  it("and no longer decides selection from the doc-form-only flags", () => {
    // showingBill / showingDocForm are both false on pay-outstanding and payment-doc, which is
    // how the Doc tab went unlit there while Default-skin lit up instead.
    const selection = chromeHtml
      .slice(chromeHtml.indexOf("function applyUiState"), chromeHtml.indexOf("if (peekHint)"))
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(selection, /showingBill|showingDocForm/);
  });
});
