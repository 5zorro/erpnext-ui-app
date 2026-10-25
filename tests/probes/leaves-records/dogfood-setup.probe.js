/**
 * Not a check: `npm run dogfood:setup -- <row> …` runs this to make (or, with `--clear`, remove) the
 * dogfood scenes for those rows and leave them for 5zorro (tests/probes/dogfood-scenes.js; plan 10-19
 * § Dogfood check and setup). Rows come in `DOGFOOD_ROWS` (split by `;`).
 *
 * 🔴 LEAVES RECORDS (sandbox only — it checks): what each scene's `leaves` says, on purpose.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, openNewDoc, assertSandboxSite } from "../probe-helpers.js";
import { SCENES, scenesForRow } from "../dogfood-scenes.js";

test("dogfood setup", async () => {
  const rows = String(process.env.DOGFOOD_ROWS || "").split(";").map((r) => r.trim()).filter(Boolean);
  const clear = process.env.DOGFOOD_CLEAR === "1";
  const names = [...new Set(rows.flatMap(scenesForRow))];
  const missing = rows.filter((r) => !scenesForRow(r).length);
  if (missing.length) console.log(`No scene yet for: ${missing.join(", ")} (npm run dogfood:setup -- --list)`);
  expect(names.length).toBeGreaterThan(0);
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new"); // the ERPNext page is logged in and ready
    await sleep(1500);
    await assertSandboxSite(app);
    for (const name of names) {
      const s = SCENES[name];
      const res = clear ? await s.clear(app) : await s.make(app);
      const failed = res && res.error;
      console.log(`\n${clear ? "Cleared" : failed ? "FAILED" : "Ready"}: ${s.rows.join(", ")} — ${s.title}`);
      console.log(failed ? `  ERPNext said: ${res.error}` : `  ${JSON.stringify(res)}`);
      if (!clear && !failed) console.log(`  Then: ${s.look}`);
      expect(failed).toBeFalsy();
    }
  } finally {
    await app.close().catch(() => {});
  }
});
