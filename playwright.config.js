import { defineConfig } from "@playwright/test";

/**
 * Shell smoke only (Playwright Electron). Not the merge gate — see HANDOFF Test strategy.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  // A throwaway profile folder per run, so specs run while the app is open (plan 2026-10-26).
  globalSetup: "./scripts/playwright-test-profile.js",
  // Every run is logged for `npm run test:flaky` (scripts/playwright-run-log.js); a --reporter flag drops that.
  reporter: [["list"], ["./scripts/playwright-run-log.js", { kind: "e2e" }]],
  projects: [
    {
      name: "electron-shell",
      testMatch: /.*\.spec\.js/,
    },
  ],
});
