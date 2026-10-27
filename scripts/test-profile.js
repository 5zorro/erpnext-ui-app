/**
 * A test run's own profile folder (plan 2026-10-26 step 1). The app keeps its prefs, ERPNext login
 * cookies, Drafts shelf, Local Storage and debug logs in one folder (Electron's `userData`,
 * `~/.config/erpnext-ui-app/`). A spec or probe run that used the clerk's folder had to back it up
 * and restore it, and so could not run while the app was open. Each run now gets a throwaway copy:
 * main.js moves `userData` to `ERP_USER_DATA_DIR` when `E2E=1`.
 *
 * Seeded with the prefs and the login, so a run starts logged in and sees the prefs it saw before.
 * Not copied: the logs (a run starts its own trail), the Local Storage (column widths and the
 * calculator's rounding start at their defaults), and anything else — `db-ro.env` is a database
 * password the app does not read. After the run the trail is kept in
 * `test-logs/profile-logs/<kind>/` for reading a failure, and the folder is deleted. Not under
 * `test-results/`: Playwright empties that at the start of every spec run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REAL_PROFILE = path.join(os.homedir(), ".config", "erpnext-ui-app");
const PREFIX = "erpnext-ui-test-profile-";
const LOGS = ["nav-debug.log", "nav-incidents.log", "focus-debug.log", "focus-incidents.log"];

/** The files a run's folder starts with: the prefs, the delay calendar and the login cookies. */
export const seedsProfile = (name) => /\.json$/.test(name) || name === "delay-calendar.csv" || name === "Cookies" || name === "Cookies-journal";

/**
 * @param {{ from?: string, tmp?: string }} [opts]
 * @returns {string} the new folder
 */
export function makeTestProfile({ from = REAL_PROFILE, tmp = os.tmpdir(), now = Date.now() } = {}) {
  // A killed run never deleted its folder (with a login cookie in it): sweep those a day old. Not
  // younger ones — a spec run and a probe run may be going at the same time.
  for (const old of fs.readdirSync(tmp).filter((n) => n.startsWith(PREFIX))) {
    const p = path.join(tmp, old);
    if (now - fs.statSync(p).mtimeMs > 24 * 3600_000) fs.rmSync(p, { recursive: true, force: true });
  }
  const dir = fs.mkdtempSync(path.join(tmp, PREFIX));
  const names = fs.existsSync(from) ? fs.readdirSync(from) : [];
  for (const name of names.filter(seedsProfile)) {
    const src = path.join(from, name);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(dir, name));
  }
  return dir;
}

/**
 * Keep the run's debug trail, then delete the folder (cookies and all).
 * @param {string} dir
 * @param {string} kind "e2e" | "probe"
 * @param {{ logs?: string }} [opts]
 */
export function closeTestProfile(dir, kind, { logs = path.join(ROOT, "test-logs") } = {}) {
  const keep = path.join(logs, "profile-logs", kind);
  fs.rmSync(keep, { recursive: true, force: true });
  fs.mkdirSync(keep, { recursive: true });
  for (const name of LOGS) {
    const src = path.join(dir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(keep, name));
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/** The run's own folder, for a probe that empties or reads it; refuses outside a run, so the clerk's is never emptied. */
export function runProfileDir() {
  const dir = process.env.ERP_USER_DATA_DIR;
  if (!dir) throw new Error("run through `npm run probe` or Playwright's config (each run gets its own profile folder)");
  return dir;
}
