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
  reporter: [["list"]],
  projects: [
    {
      name: "electron-shell",
      testMatch: /.*\.spec\.js/,
    },
  ],
});
