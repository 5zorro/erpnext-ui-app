/**
 * Shared Playwright Electron launch for scaffold smokes.
 *
 * GOTCHAS: see e2e/GOTCHAS.md
 * Critical: electronApp.evaluate(fn, arg) — fn's *first* param is always require('electron'),
 * not `arg`. Pass payload as the second parameter.
 */
import { _electron as electron } from "@playwright/test";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const electronBinary = require("electron");

export const ELECTRON_ARGS = [
  ROOT,
  "--no-sandbox",
  "--disable-gpu",
  "--in-process-gpu",
  "--disable-dev-shm-usage",
];

/** @returns {Promise<import('@playwright/test').ElectronApplication>} */
export async function launchShell() {
  return electron.launch({
    executablePath: electronBinary,
    args: ELECTRON_ARGS,
    cwd: ROOT,
    env: {
      ...process.env,
      E2E: "1",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    timeout: 60_000,
  });
}

/** Wait until main published __erpE2e (after createWindow + syncE2eApi). */
export async function waitForE2eApi(app, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await app.evaluate(() => !!globalThis.__erpE2e);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("__erpE2e not ready — E2E=1 / syncE2eApi?");
}

/** @param {import('@playwright/test').ElectronApplication} app */
export async function e2eGet(app, key) {
  return app.evaluate((_electron, k) => globalThis.__erpE2e?.[k], key);
}

/** @param {import('@playwright/test').ElectronApplication} app */
export async function e2eCall(app, method, ...args) {
  return app.evaluate(
    async (_electron, { method: m, args: a }) => {
      const api = globalThis.__erpE2e;
      if (!api || typeof api[m] !== "function") {
        throw new Error(`__erpE2e.${m} missing — is E2E=1 set?`);
      }
      return await api[m](...a);
    },
    { method, args },
  );
}
