import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const main = read("../electron/main.js");
const page = read("../electron/find-doc.html");
const preload = read("../electron/find-doc-preload.cjs");

const bodyOf = (name) => {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} not found in main.js`);
  const next = main.indexOf("\nfunction ", start + 1);
  return main.slice(start, next > 0 ? next : main.length);
};

/**
 * Wiring guard for the Find pages (implementation-plan-2026-09-26). The decisions are pure and
 * tested in nav-destination / find-skin-registry; these pin the few main.js lines that carry
 * them out, because a missing one fails silently (G9: the surface just vanishes from Recent).
 */
describe("Find page wiring", () => {
  it("showFindDoc claims the list's own address and remembers the list lens, not the form's", () => {
    const body = bodyOf("showFindDoc");
    assert.match(body, /noteShellDocSurfaceRoute\(docSkinTargetRoute\(\{ kind: "find-doc"/);
    assert.match(body, /rememberLens\(lensPrefs, lensPrefKey\(skin\.doctypeKey, ""\), "doc"\)/);
    assert.match(body, /enterShellSurface\("find-doc"\);/);
  });

  it("pages are placed and lens-classified from the shell-surfaces table, not by hand", () => {
    assert.match(bodyOf("isShellDocSurface"), /surfaceIsDocLens\(surfaceMode\)/);
    assert.match(bodyOf("place"), /surfacePlacement\(surfaceMode\)/);
    assert.match(bodyOf("place"), /findDoc/);
  });

  it("every door asks the one destination answer (stage F2)", () => {
    assert.match(bodyOf("openShellDocSurface"), /openTargetFor\(route\)/);
    assert.match(bodyOf("openHistoryRoute"), /openTargetFor\(path\)\.surface !== "erp"/);
    assert.match(bodyOf("openRoutePreferred"), /openResolvedTarget\(t, opts\)/);
    assert.match(bodyOf("openDocSkinContinue"), /openTargetFor\(ctx\.route, \{ lens: "doc" \}\)/);
    assert.match(bodyOf("maybeHijackErpToDoc"), /openTargetFor\(url\)/);
    assert.match(bodyOf("openPaymentEntryTile"), /openResolvedTarget\(t\)/);
    assert.match(bodyOf("openEntry"), /openRoutePreferred\(/);
    // No door re-derives "has a Doc skin" from the doc-form registry on its own.
    for (const door of ["openRoutePreferred", "openDocSkinContinue", "maybeHijackErpToDoc", "openEntry"]) {
      assert.doesNotMatch(bodyOf(door), /shouldOpenDocLens|resolveEntryOpen/, door);
    }
  });

  it("both Find buttons share one implementation, which tries the Find page first", () => {
    const handler = (channel) => {
      const start = main.indexOf(`ipcMain.handle("${channel}"`);
      assert.ok(start > 0, channel);
      return main.slice(start, main.indexOf("\n});", start));
    };
    assert.match(handler("bill-find"), /openDocFind\("purchase-invoice"/);
    assert.match(handler("doc-find"), /openDocFind\(\s*profile\.doctypeKey/);
    assert.match(bodyOf("openDocFind"), /openFindPageIfPreferred\(doctypeKey, prefill\)/);
    // Filters travel in the address; nothing types them into ERPNext's page any more.
    assert.match(bodyOf("openDocFind"), /showErp\(`\/app\/\$\{doctypeKey\}`, \{ forceLoad: true, skipDirtyGate: true, search \}\)/);
    assert.doesNotMatch(main, /setListStandardFilterValues/);
  });

  it("the Vanilla tab keys the lens by list vs form", () => {
    const start = main.indexOf('ipcMain.on("open-vanilla-skin"');
    const body = main.slice(start, main.indexOf("\n});", start));
    assert.match(body, /lensPrefKey\(info\.doctype, info\.record\)/);
  });

  it("a hidden ERP page cannot rewrite the route behind a page that owns its address", () => {
    assert.match(bodyOf("trackNav"), /opts\.fromBrowser && surfaceOwnsRoute\(surfaceMode\)/);
  });

  it("the legacy bill view is gone", () => {
    assert.doesNotMatch(main, /\bbill = new WebContentsView/);
    assert.doesNotMatch(main, /bill-preload\.cjs/);
  });

  it("the page leaves only through main's doors", () => {
    for (const channel of ["open-preferred", "find-doc-open-vanilla", "open-payment-entry"]) {
      assert.ok(preload.includes(`"${channel}"`), `preload sends ${channel}`);
      assert.ok(main.includes(`ipcMain.on("${channel}"`), `main handles ${channel}`);
    }
    assert.match(page, /from "\.\.\/src\/find-skin-registry\.js"/);
  });
});
