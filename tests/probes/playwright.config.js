import { defineConfig } from "@playwright/test";

/**
 * Probes: one-question runs against the real app and the live sandbox (README.md here).
 * Run through `npm run probe -- <name>`, which backs up and restores the prefs around the run.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.probe\.js/,
  outputDir: "../../test-results/probes",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  reporter: [["line"]],
});
