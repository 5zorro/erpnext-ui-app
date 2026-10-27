/**
 * Playwright global setup for specs and probes (both configs): one profile folder per run
 * (scripts/test-profile.js), passed to every launch as `ERP_USER_DATA_DIR`. One per run, not per
 * test: some probes restart the app and check what it kept. Returns the teardown.
 */
import { makeTestProfile, closeTestProfile } from "./test-profile.js";

/** @param {import('@playwright/test').FullConfig} config */
export default async function setUpTestProfile(config) {
  // Already given one (a caller that wants to read the folder afterwards): use it, leave it.
  if (process.env.ERP_USER_DATA_DIR) return undefined;
  const kind = /[\\/]probes[\\/]/.test(config.configFile || "") ? "probe" : "e2e";
  const dir = makeTestProfile();
  process.env.ERP_USER_DATA_DIR = dir;
  return async () => closeTestProfile(dir, kind);
}
