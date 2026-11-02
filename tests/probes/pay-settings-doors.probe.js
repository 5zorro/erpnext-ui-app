/**
 * Pay Outstanding's settings, every door (plan 10-25 R2-5, when they moved to
 * `electron/ipc/payment-settings.js`): the payment batch prefs read, saved unchanged, refused
 * (the four reasons), saved changed and read back; the delay calendar read with no file, set, read
 * back and exported to a chosen path; then the app restarted and both read again, which proves the
 * start-up load. Prints one `PROBE` line per door, so a run on the code before a change and one after
 * can be diffed line for line. Acts as the AP clerk. Only the run's own profile folder is written;
 * makes no sandbox records. The import door (`importDelayCalendar`) opens a file dialog and is not
 * driven.
 */
import { test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inBoard, openBoard, openNewDoc, report, settle } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const api = (app, call) =>
  inBoard(app, `(async () => { try { return await window.erpPayOutstanding.${call}; } catch (e) { return { threw: String(e && e.message || e) }; } })()`);
/** The calendar's stored path and the export path differ per run. */
const scrub = (o) => JSON.parse(JSON.stringify(o).replace(/"path":"[^"]*"/g, '"path":"<path>"'));

/** Launch, log in as the AP clerk, open the board. */
async function boardAsClerk() {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new"); // the ERPNext page is logged in and ready
    const clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openBoard(app, { cards: false });
    await settle();
    return { app, clerk };
  } catch (e) {
    // The caller's finally holds the app from before; close this one (a clerk enabled here is
    // retired by run-probe from the lock).
    await app.close().catch(() => {});
    throw e;
  }
}

test("payment settings: batch prefs and delay calendar, every door, and after a restart", async () => {
  test.setTimeout(300_000);
  const out = path.join(os.tmpdir(), `pay-settings-doors-${process.pid}.csv`);
  let { app, clerk } = await boardAsClerk();
  try {
    const p0 = await api(app, "getPrefs()");
    report("prefs-0", p0);
    report("set-same", await api(app, `setPrefs(${JSON.stringify(p0)})`));
    report("set-bad", await api(app, `setPrefs({ apr: -3, postage: "x", runIntervalDays: -1 })`));
    report("set-changed", await api(app, `setPrefs(${JSON.stringify({ ...p0, postage: 0.99, runIntervalDays: 7, nextRunDate: "2026-12-04" })})`));
    report("prefs-1", await api(app, "getPrefs()"));
    report("cal-0", await api(app, "getDelayCalendar()"));
    report("cal-set", scrub(await api(app, `setDelayCalendar("date,note\\n2026-12-31,ZZ probe\\n")`)));
    report("cal-1", await api(app, "getDelayCalendar()"));
    await e2eCall(app, "setNextSavePath", out);
    report("cal-export", scrub(await api(app, `exportDelayCalendar("a,b\\n1,2\\n")`)));
    report("cal-export-file", fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null);

    await clerk.back();
    await app.close();
    ({ app, clerk } = await boardAsClerk());
    report("after-restart-prefs", await api(app, "getPrefs()"));
    report("after-restart-cal", await api(app, "getDelayCalendar()"));
  } finally {
    await clerk.retire().catch((e) => report("retire-failed", String(e)));
    await app.close().catch(() => {});
    fs.rmSync(out, { force: true });
  }
});
