import { defineConfig } from "@playwright/test";

/**
 * Probes: one-question runs against the real app and the live sandbox (README.md here).
 * Run through `npm run probe -- <name>`. Each run gets its own profile folder (plan 2026-10-26).
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.probe\.js/,
  outputDir: "../../test-results/probes",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  globalSetup: "../../scripts/playwright-test-profile.js",
  // Every run is logged for `npm run test:flaky` (scripts/playwright-run-log.js).
  reporter: [["line"], ["../../scripts/playwright-run-log.js", { kind: "probe" }]],
});
