/**
 * Print as image flattens the paper before it goes to the printer. It is on by default for every
 * printer print. Since printing moved to electron/ipc/print.js (2026-10-31), its worker page was
 * loaded from `__dirname`, which that module never defined: the flattening threw, the trail said
 * `print-raster-fail`, and the PDF went to the printer as it was (on Windows without SumatraPDF the
 * print failed outright). Found during the health / incidents move.
 *
 * Prints one submitted Bill to this machine's CUPS printer "PDF" (it writes to ~/PDF/), as image,
 * through the Doc page's own call; then the run's trail must show no `print-raster-fail`. The
 * file it writes is deleted after. Skips when no printer "PDF" exists (`lpstat -p PDF`).
 *
 * Acts as the AP clerk. Makes no records.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { inDoc, inErp, openNewDoc, report, docQuiet, sleep } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const PRINTER = "PDF";
const OUT_DIR = path.join(os.homedir(), "PDF");

const hasPrinter = () => {
  try {
    execFileSync("lpstat", ["-p", PRINTER], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const pdfsNow = () => {
  try {
    return new Set(fs.readdirSync(OUT_DIR));
  } catch {
    return new Set();
  }
};

test("Print as image flattens the paper instead of printing the PDF as it is", async () => {
  test.skip(!hasPrinter(), `no CUPS printer "${PRINTER}" on this machine`);
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  const before = pdfsNow();
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    const bill = await inErp(app, `frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { docstatus: 1 }, fields: ["name"], order_by: "creation desc", limit_page_length: 1 }).then((r) => (r[0] && r[0].name) || "")`);
    expect(bill, "the sandbox needs one submitted Bill").toBeTruthy();
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await docQuiet(app);

    const res = await inDoc(
      app,
      `window.erpDoc.printRun({ items: [{ doctype: "Purchase Invoice", name: ${JSON.stringify(bill)} }], dest: "printer", deviceName: ${JSON.stringify(PRINTER)}, printAsImage: true })`,
      120_000,
    );
    const userData = await app.evaluate(({ app: a }) => a.getPath("userData"));
    const trail = fs
      .readFileSync(path.join(userData, "nav-debug.log"), "utf8")
      .split("\n")
      .filter((l) => /"event":"print-/.test(l))
      .map((l) => {
        const e = JSON.parse(l);
        return `${e.event}: ${e.detail}`;
      });
    report("printed", { bill, res, trail });
    expect(trail.filter((l) => l.startsWith("print-raster-fail"))).toEqual([]);
    expect(res && res.ok).toBe(true);
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
    // CUPS writes the file a moment after the job is queued.
    for (let i = 0; i < 20; i += 1) {
      const made = [...pdfsNow()].filter((f) => !before.has(f));
      if (made.length) {
        for (const f of made) fs.rmSync(path.join(OUT_DIR, f), { force: true });
        report("cleanup", made);
        break;
      }
      await sleep(500);
    }
  }
});
