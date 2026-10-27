#!/usr/bin/env node
/**
 * `npm run probe -- <name> [<name>…]` — run probes from `tests/probes/` (README there) without
 * disturbing 5zorro's app, open or not:
 * 1. each run has its own profile folder (plan 2026-10-26: the probe config's global setup,
 *    scripts/test-profile.js), so the app's prefs, login and Drafts shelf are never touched and
 *    nothing needs restoring (`--with-app-open`, from before, is accepted and ignored);
 * 2. runs headless with WAYLAND_DISPLAY and DISPLAY cleared (e2e/GOTCHAS.md #12: a window on his
 *    desktop steals his keyboard);
 * 3. if the run used a restricted probe user (tests/probes/probe-user.js), retires it — disabled,
 *    its sessions ended — however the run ended. A user a killed `run-probe` left enabled is
 *    retired at the start of the next run.
 * Environment passes through, so `ERP_CHAOS_LAG_MS=1200 ERP_CHAOS_LAG_PCT=100 npm run probe -- x` works.
 * `--grep=<pattern>` runs only the tests whose title matches (Playwright's `--grep`), e.g.
 * `npm run probe -- df03-item-table --grep=T-2`.
 *
 * Probes in `tests/probes/leaves-records/` leave records in ERPNext they cannot delete (a submitted
 * document, once cancelled, stays — its ledger entries link to it). They run only with
 * `--leaves-records` (5zorro 2026-10-22: fine on this sandbox; on company data, think twice), and
 * each one checks it is on the sandbox before writing (`assertSandboxSite`).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROBE_USER_LOCK, readProbeUserLock, retireLockedProbeUsers } from "../tests/probes/probe-user-retire.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBES = path.join(ROOT, "tests", "probes");

// A restricted probe user an earlier, killed run left enabled (plan 10-19 § A restricted probe user)
// — first, so a bare `npm run probe` cleans it up too.
const leftover = retireLockedProbeUsers();
if (leftover.length) console.log(`probe user left enabled by an earlier run — retired:\n  ${leftover.join("\n  ")}`);
if (readProbeUserLock()?.retired) fs.rmSync(PROBE_USER_LOCK, { force: true });
// Runs before 2026-10-26 backed the prefs up and left this mark if killed: say where it is, once.
const RUN_MARK = path.join(ROOT, "test-logs", "probe-run.json");
try {
  const mark = JSON.parse(fs.readFileSync(RUN_MARK, "utf8"));
  console.log(`A probe run (${mark.startedAt}) was killed before it restored the prefs and login cookies.\n  Its backup: ${mark.backup}${fs.existsSync(mark.backup) ? "" : " (gone)"} — copy it back into ~/.config/erpnext-ui-app only if the app has not been used since.`);
  fs.rmSync(RUN_MARK, { force: true });
} catch {
  /* none */
}

const args = process.argv.slice(2);
const leavesRecords = args.includes("--leaves-records");
const grep = args.filter((a) => a.startsWith("--grep=")).flatMap((a) => ["--grep", a.slice("--grep=".length)]);
const names = args.filter((a) => !a.startsWith("--"));
const LEAVES = path.join(PROBES, "leaves-records");
const probesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".probe.js")).map((f) => f.replace(/\.probe\.js$/, "")) : []);
if (!names.length) {
  console.log(
    `usage: npm run probe -- <name> [--leaves-records] [--grep=<test title>]\nprobes: ${probesIn(PROBES).join(", ") || "(none)"}\n` +
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

function retireAfter() {
  // This run signed in as a probe user: retire it (a no-op when the probe already did).
  if (!readProbeUserLock()) return;
  const lines = retireLockedProbeUsers();
  if (lines.length) console.log(`probe user retired after the run:\n  ${lines.join("\n  ")}`);
  if (readProbeUserLock()?.retired) fs.rmSync(PROBE_USER_LOCK, { force: true });
}

// Ctrl+C reaches the probe too (same terminal) and ends it; this process stays up to retire the user.
process.on("SIGINT", () => console.log("\nCtrl+C — retiring any probe user after the probe stops…"));
// A SIGTERM (`timeout`, a killed parent) reaches only this process: retire now, then go.
process.on("SIGTERM", () => {
  retireAfter();
  process.exit(143);
});

let status = 1;
try {
  const env = { ...process.env, WAYLAND_DISPLAY: "", DISPLAY: "" };
  const run = spawnSync(
    "xvfb-run",
    ["-a", "npx", "playwright", "test", "-c", path.join("tests", "probes", "playwright.config.js"), ...grep, ...files],
    { cwd: ROOT, env, stdio: "inherit" },
  );
  if (run.error) console.error(`could not run the probe: ${run.error.message}`);
  status = run.status ?? 1;
} finally {
  retireAfter();
}
process.exit(status);
