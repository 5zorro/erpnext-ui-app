/**
 * Plan 2026-10-26 step 1: a spec or probe run gets its own profile folder
 * (`scripts/test-profile.js`), seeded with the prefs and the login, so it never touches the clerk's
 * and can run while the app is open.
 *
 * @covers scripts/test-profile.js scripts/playwright-test-profile.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTestProfile, closeTestProfile, runProfileDir, seedsProfile } from "../scripts/test-profile.js";

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");

function realProfile() {
  const from = fs.mkdtempSync(path.join(os.tmpdir(), "tp-real-"));
  for (const f of ["lens-prefs.json", "nav-state.json", "delay-calendar.csv", "Cookies", "Cookies-journal", "nav-debug.log", "db-ro.env", "Preferences"]) {
    fs.writeFileSync(path.join(from, f), f);
  }
  fs.mkdirSync(path.join(from, "Local Storage"));
  fs.writeFileSync(path.join(from, "Local Storage", "leveldb"), "widths");
  return from;
}

describe("a test run's own profile folder", () => {
  it("starts with the prefs, the delay calendar and the login; not the logs, Local Storage or db-ro.env", () => {
    const from = realProfile();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tp-tmp-"));
    const dir = makeTestProfile({ from, tmp });
    assert.deepEqual(fs.readdirSync(dir).sort(), ["Cookies", "Cookies-journal", "delay-calendar.csv", "lens-prefs.json", "nav-state.json"]);
    assert.equal(seedsProfile("nav-debug.log"), false);
    fs.rmSync(from, { recursive: true });
    fs.rmSync(tmp, { recursive: true });
  });

  it("after the run, keeps the debug trail for reading a failure and deletes the folder, cookies and all", () => {
    const from = realProfile();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tp-tmp-"));
    const results = fs.mkdtempSync(path.join(os.tmpdir(), "tp-results-"));
    const dir = makeTestProfile({ from, tmp });
    fs.writeFileSync(path.join(dir, "nav-debug.log"), "the run's trail");
    closeTestProfile(dir, "probe", { results });
    assert.equal(fs.existsSync(dir), false);
    assert.equal(fs.readFileSync(path.join(results, "probe-profile-logs", "nav-debug.log"), "utf8"), "the run's trail");
    for (const d of [from, tmp, results]) fs.rmSync(d, { recursive: true });
  });

  it("sweeps a killed run's folder a day old, and leaves a younger one (a run going at the same time)", () => {
    const from = realProfile();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tp-tmp-"));
    const old = makeTestProfile({ from, tmp });
    const young = makeTestProfile({ from, tmp });
    const day = Date.now() + 25 * 3600_000;
    fs.utimesSync(young, new Date(day), new Date(day));
    makeTestProfile({ from, tmp, now: day + 1000 });
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(young), true);
    fs.rmSync(from, { recursive: true });
    fs.rmSync(tmp, { recursive: true });
  });

  it("a probe that empties the folder refuses outside a run, so the clerk's is never emptied", () => {
    const saved = process.env.ERP_USER_DATA_DIR;
    delete process.env.ERP_USER_DATA_DIR;
    try {
      assert.throws(() => runProfileDir(), /its own profile folder/);
    } finally {
      if (saved !== undefined) process.env.ERP_USER_DATA_DIR = saved;
    }
  });

  it("both Playwright configs use it, and only a test run (E2E=1) can move the app's folder", () => {
    for (const cfg of ["../playwright.config.js", "../tests/probes/playwright.config.js"]) {
      assert.match(read(cfg), /globalSetup: "[./]*scripts\/playwright-test-profile\.js"/);
    }
    assert.match(read("../electron/main.js"), /if \(process\.env\.E2E === "1" && process\.env\.ERP_USER_DATA_DIR\) app\.setPath\("userData"/);
    assert.doesNotMatch(read("../scripts/run-probe.js"), /appIsOpen|restorePrefs/);
  });
});
