/**
 * The main process's source as one text: `electron/main.js`, then each `electron/ipc/<family>.js`
 * it was split into (plan 2026-10-25 R2-5). Wiring tests that find an `ipcMain` handler or a pinned
 * line by reading the source read this, so moving a family out of main.js does not hide it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const electronDir = fileURLToPath(new URL("../electron/", import.meta.url));

export function mainProcessSource() {
  const ipc = readdirSync(`${electronDir}ipc`).filter((f) => f.endsWith(".js")).sort();
  return [readFileSync(`${electronDir}main.js`, "utf8"), ...ipc.map((f) => readFileSync(`${electronDir}ipc/${f}`, "utf8"))].join("\n");
}
