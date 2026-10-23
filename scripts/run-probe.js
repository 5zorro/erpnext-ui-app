#!/usr/bin/env node
/**
 * `npm run probe -- <name> [<name>…] [--with-app-open]` — run probes from `tests/probes/`
 * (README there) without disturbing 5zorro's app:
 * 1. refuses while his app is open: a restore would roll back what it saves meanwhile (local notes,
 *    trap 6) — `--with-app-open` to run anyway;
 * 2. backs up `~/.config/erpnext-ui-app/*.json` fresh, right before the run;
 * 3. runs headless with WAYLAND_DISPLAY and DISPLAY cleared (e2e/GOTCHAS.md #12: a window on his
 *    desktop steals his keyboard);
 * 4. restores the backup and removes any prefs file the run created — pass or fail.
 * Environment passes through, so `ERP_CHAOS_LAG_MS=1200 ERP_CHAOS_LAG_PCT=100 npm run probe -- x` works.
 */
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBES = path.join(ROOT, "tests", "probes");
const PREFS = path.join(os.homedir(), ".config", "erpnext-ui-app");

const args = process.argv.slice(2);
const withAppOpen = args.includes("--with-app-open");
const names = args.filter((a) => !a.startsWith("--"));
if (!names.length) {
  const have = fs.readdirSync(PROBES).filter((f) => f.endsWith(".probe.js")).map((f) => f.replace(/\.probe\.js$/, ""));
  console.log(`usage: npm run probe -- <name> [--with-app-open]\nprobes: ${have.join(", ") || "(none)"}`);
  process.exit(2);
}
const files = names.map((n) => path.join("tests", "probes", n.endsWith(".probe.js") ? n : `${n}.probe.js`));
for (const f of files) {
  if (!fs.existsSync(path.join(ROOT, f))) {
    console.error(`no such probe: ${f}`);
    process.exit(2);
  }
}

function appIsOpen() {
  try {
    return execSync("ps -eo args", { encoding: "utf8" })
      .split("\n")
      .some((l) => /electron/i.test(l) && l.includes(ROOT) && !l.includes("run-probe"));
  } catch {
    return false;
  }
}
if (appIsOpen() && !withAppOpen) {
  console.error("The app is open. A probe restores the prefs after it runs, which would undo what the app saves meanwhile.\nClose it, or pass --with-app-open (then say so to 5zorro).");
  process.exit(3);
}

const jsonIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : []);
const before = jsonIn(PREFS);
const backup = fs.mkdtempSync(path.join(os.tmpdir(), "erpnext-ui-probe-prefs-"));
for (const f of before) fs.copyFileSync(path.join(PREFS, f), path.join(backup, f));
console.log(`prefs backed up: ${before.length} file(s) → ${backup}`);

let status = 1;
try {
  const env = { ...process.env, WAYLAND_DISPLAY: "", DISPLAY: "" };
  const run = spawnSync(
    "xvfb-run",
    ["-a", "npx", "playwright", "test", "-c", path.join("tests", "probes", "playwright.config.js"), ...files],
    { cwd: ROOT, env, stdio: "inherit" },
  );
  status = run.status ?? 1;
} finally {
  for (const f of before) fs.copyFileSync(path.join(backup, f), path.join(PREFS, f));
  const created = jsonIn(PREFS).filter((f) => !before.includes(f));
  for (const f of created) fs.rmSync(path.join(PREFS, f));
  fs.rmSync(backup, { recursive: true, force: true });
  console.log(`prefs restored: ${before.length} file(s)${created.length ? `; removed new: ${created.join(", ")}` : ""}`);
}
process.exit(status);
