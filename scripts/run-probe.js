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
 *
 * Probes in `tests/probes/leaves-records/` leave records in ERPNext they cannot delete (a submitted
 * document, once cancelled, stays — its ledger entries link to it). They run only with
 * `--leaves-records` (5zorro 2026-10-22: fine on this sandbox; on company data, think twice), and
 * each one checks it is on the sandbox before writing (`assertSandboxSite`).
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
const leavesRecords = args.includes("--leaves-records");
const names = args.filter((a) => !a.startsWith("--"));
const LEAVES = path.join(PROBES, "leaves-records");
const probesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".probe.js")).map((f) => f.replace(/\.probe\.js$/, "")) : []);
if (!names.length) {
  console.log(
    `usage: npm run probe -- <name> [--with-app-open] [--leaves-records]\nprobes: ${probesIn(PROBES).join(", ") || "(none)"}\n` +
      `leave records in ERPNext (need --leaves-records): ${probesIn(LEAVES).join(", ") || "(none)"}`,
  );
  process.exit(2);
}
const files = [];
for (const n of names) {
  const base = n.replace(/^leaves-records\//, "").replace(/\.probe\.js$/, "");
  const plain = path.join("tests", "probes", `${base}.probe.js`);
  const leaving = path.join("tests", "probes", "leaves-records", `${base}.probe.js`);
  if (fs.existsSync(path.join(ROOT, plain))) {
    files.push(plain);
  } else if (fs.existsSync(path.join(ROOT, leaving))) {
    if (!leavesRecords) {
      console.error(`${base} leaves records in ERPNext it cannot delete (its header says which). Pass --leaves-records to run it — on the sandbox only.`);
      process.exit(4);
    }
    files.push(leaving);
  } else {
    console.error(`no such probe: ${base}`);
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

// Ctrl+C reaches the probe too (same terminal) and ends it; this process stays up to restore.
process.on("SIGINT", () => console.log("\nCtrl+C — restoring the prefs after the probe stops…"));

let status = 1;
try {
  const env = { ...process.env, WAYLAND_DISPLAY: "", DISPLAY: "" };
  const run = spawnSync(
    "xvfb-run",
    ["-a", "npx", "playwright", "test", "-c", path.join("tests", "probes", "playwright.config.js"), ...files],
    { cwd: ROOT, env, stdio: "inherit" },
  );
  if (run.error) console.error(`could not run the probe: ${run.error.message}`);
  status = run.status ?? 1;
} finally {
  for (const f of before) fs.copyFileSync(path.join(backup, f), path.join(PREFS, f));
  const created = jsonIn(PREFS).filter((f) => !before.includes(f));
  for (const f of created) fs.rmSync(path.join(PREFS, f));
  fs.rmSync(backup, { recursive: true, force: true });
  console.log(`prefs restored: ${before.length} file(s)${created.length ? `; removed new: ${created.join(", ")}` : ""}`);
}
process.exit(status);
