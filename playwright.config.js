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
  // Every run is logged for `npm run test:flaky` (scripts/playwright-run-log.js); a --reporter flag drops that.
  reporter: [["list"], ["./scripts/playwright-run-log.js", { kind: "e2e" }]],
  projects: [
    {
      name: "electron-shell",
      testMatch: /.*\.spec\.js/,
    },
  ],
});
