#!/usr/bin/env node
/**
 * `npm run dogfood:setup -- <row> …` — make a dogfood row's records on the sandbox and leave them
 * for 5zorro (tests/probes/README.md § Dogfood residuals); `-- --clear <row> …` removes them again;
 * `-- --list` says which rows have a scene and what each makes. The scenes are
 * `tests/probes/dogfood-scenes.js`; this runs them through `run-probe.js` (the app must be closed —
 * open it after) as the probe `leaves-records/dogfood-setup`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rows = args.filter((a) => !a.startsWith("--"));

if (args.includes("--list") || !rows.length) {
  const { SCENES } = await import("../tests/probes/dogfood-scenes.js");
  console.log("usage: npm run dogfood:setup -- <row> …   (or -- --clear <row> …)\n\nRows with a scene:");
  for (const [name, s] of Object.entries(SCENES)) console.log(`\n  ${s.rows.join(", ")} — ${s.title} [${name}]\n    makes: ${s.leaves}\n    then:  ${s.look}`);
  process.exit(rows.length || args.includes("--list") ? 0 : 2);
}

const run = spawnSync(process.execPath, [path.join(ROOT, "scripts", "run-probe.js"), "dogfood-setup", "--leaves-records"], {
  cwd: ROOT,
  env: { ...process.env, DOGFOOD_ROWS: rows.join(";"), DOGFOOD_CLEAR: args.includes("--clear") ? "1" : "" },
  stdio: "inherit",
});
process.exit(run.status ?? 1);
