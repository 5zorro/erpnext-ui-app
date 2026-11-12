/**
 * Every door of the DB light's Diagnose dropdown, the Navigation / Focus issue dialogs, IT recovery
 * settings and Feedback, driven once, its answer printed in one normalized line each (`DOOR …`).
 * Written for plan 2026-10-25 R2-5's health / incidents move: run before and after, the DOOR lines
 * must match. Nothing here writes to ERPNext. The two incident notes go to this run's own profile
 * folder; the clipboard and the message boxes are stood in for in the main process (the clerk's
 * clipboard and browser are never touched, no box waits for a click). The run's profile copies the clerk's
 * prefs, IT recovery settings included: where Autofix is set up, the Autofix door reaches its
 * "Start ERPNext?" box, which the stand-in always cancels — a probe never runs IT's script. (So the
 * Autofix line differs between a machine with Autofix set up and one without; compare runs on one
 * machine.)
 *
 * Acts as the AP clerk.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inErp, report, sleep } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const inChrome = (app, js) => e2eCall(app, "execInView", "chrome", js);
const door = (name, value) => report(`DOOR ${name}`, value);

/** The page of a BrowserWindow loaded from `file`, once it exists. */
async function windowFor(app, file, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const p = app.windows().find((w) => !w.isClosed() && w.url().endsWith(`/${file}`));
    if (p) {
      await p.waitForLoadState("domcontentloaded");
      return p;
    }
    await sleep(100);
  }
  return null;
}
const isOpen = (app, file) => app.windows().some((w) => !w.isClosed() && w.url().endsWith(`/${file}`));
async function gone(app, file) {
  for (let i = 0; i < 50 && isOpen(app, file); i += 1) await sleep(100);
  return !isOpen(app, file);
}

/** Message boxes answer `response`; the clipboard records instead of writing. */
const standIns = (app, response) =>
  app.evaluate(({ dialog, clipboard, shell }, r) => {
    globalThis.__boxes = globalThis.__boxes || [];
    dialog.showMessageBox = async (...args) => {
      const o = args.find((a) => a && typeof a === "object" && "buttons" in a) || {};
      globalThis.__boxes.push({ title: o.title || "", buttons: o.buttons || [] });
      // Never "Run script": the profile may hold the clerk's real Autofix setup.
      if (/Start ERPNext/i.test(o.title || "") || (o.buttons || []).includes("Run script")) return { response: o.cancelId ?? 1 };
      return { response: r };
    };
    if (!globalThis.__clipWrapped) {
      clipboard.writeText = (t) => { globalThis.__clip = String(t); };
      // Notify IT (where set up) and Feedback's "Open in browser" would open the clerk's browser.
      shell.openExternal = async (u) => { globalThis.__opened = String(u); };
      globalThis.__clipWrapped = true;
    }
  }, response);
const lastBox = (app) => app.evaluate(() => (globalThis.__boxes || []).slice(-1)[0] || null);

/** Snapshot facts that do not change run to run. */
const snapFacts = (s) => ({
  keys: Object.keys(s || {}).sort(),
  healthStatus: s && s.healthStatus,
  hostClass: s && s.hostClass,
  version: s && s.version,
  updateStub: s && s.updateStub,
  remediation: s && s.remediation,
  head: ((s && s.lines) || []).slice(0, 3).map((l) => String(l).replace(/\d+/g, "N")),
  sections: ((s && s.lines) || []).filter((l) => /^[A-Z][^:]*:?$|incident/i.test(String(l))).map((l) => String(l).replace(/\d+/g, "N")),
  copyIsLines: !!s && s.copyText === undefined ? false : typeof (s && s.copyText) === "string",
});

test("health / incidents: every door answers as before", async () => {
  test.setTimeout(240_000);
  let app = null;
  let clerk = null;
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await standIns(app, 3);

    // Diagnose dropdown, from the DB light.
    await inChrome(app, `(() => { window.erpUi.openDiagnose(); return true; })()`);
    let diag = await windowFor(app, "diagnose-dropdown.html");
    door("diagnose-open", { open: !!diag });
    await expect.poll(async () => (await diag.evaluate(() => window.erpDiagnose.refresh())).healthStatus, { timeout: 20_000 }).toBe("ok");
    door("get-diagnose", snapFacts(await diag.evaluate(() => window.erpDiagnose.refresh())));
    await diag.evaluate(() => window.erpDiagnose.copy());
    const clip = await app.evaluate(() => globalThis.__clip || "");
    door("copy-diagnose", { copied: clip.length > 0, firstLine: clip.split("\n")[0].replace(/\d+/g, "N") });
    door("health-remediation-notify", await diag.evaluate(() => window.erpDiagnose.notifyIt()));
    door("health-remediation-autofix", await diag.evaluate(() => window.erpDiagnose.runAutofix()));
    door("health-remediation-setup cancel", { res: await diag.evaluate(() => window.erpDiagnose.setupRemediation()), box: await lastBox(app) });
    await standIns(app, 2);
    door("health-remediation-setup clear", { res: await diag.evaluate(() => window.erpDiagnose.setupRemediation()), box: await lastBox(app) });
    door("get-diagnose after clear", snapFacts(await diag.evaluate(() => window.erpDiagnose.refresh())).remediation);
    await diag.evaluate(() => window.erpDiagnose.close());
    door("diagnose-dropdown-close", { closed: await gone(app, "diagnose-dropdown.html") });

    // The same dropdown opened again, then closed from the chrome (the DB light's second click).
    await inChrome(app, `(() => { window.erpUi.openDiagnose(); return true; })()`);
    diag = await windowFor(app, "diagnose-dropdown.html");
    await inChrome(app, `(() => { window.erpUi.closeDiagnose(); return true; })()`);
    door("diagnose closed from the chrome", { opened: !!diag, closed: await gone(app, "diagnose-dropdown.html") });

    // Navigation issue: opens, says what it will save, refuses an empty note, saves one, closes.
    for (const [kind, file, api] of [
      ["nav", "nav-incident-dialog.html", "erpNavIncident"],
      ["focus", "focus-incident-dialog.html", "erpFocusIncident"],
    ]) {
      await inChrome(app, `(() => { window.erpUi.${kind === "nav" ? "openNavIncident" : "openFocusIncident"}(); return true; })()`);
      const dlg = await windowFor(app, file);
      await expect.poll(() => dlg.evaluate(() => document.body.innerText.length), { timeout: 10_000 }).toBeGreaterThan(20);
      door(`${kind}-incident-open`, { open: !!dlg, title: await dlg.title() });
      door(`${kind}-incident-submit empty`, await dlg.evaluate((a) => window[a].submit(""), api));
      const saved = await dlg.evaluate((a) => window[a].submit("probe: health-incident-doors"), api);
      door(`${kind}-incident-submit`, { ok: saved.ok, file: saved.path ? path.basename(saved.path) : "", at: !!saved.at });
      await dlg.evaluate((a) => window[a].close(), api);
      door(`${kind}-incident-close`, { closed: await gone(app, file) });
    }

    // Opening one dialog while the dropdown is open closes the dropdown.
    await inChrome(app, `(() => { window.erpUi.openDiagnose(); return true; })()`);
    diag = await windowFor(app, "diagnose-dropdown.html");
    await diag.evaluate(() => window.erpDiagnose.openNavIncident());
    const nav = await windowFor(app, "nav-incident-dialog.html");
    door("nav-incident from the dropdown", { dialog: !!nav, dropdownClosed: await gone(app, "diagnose-dropdown.html") });
    await nav.evaluate(() => window.erpNavIncident.close());
    await gone(app, "nav-incident-dialog.html");

    // The two incidents now show in Diagnose.
    await inChrome(app, `(() => { window.erpUi.openDiagnose(); return true; })()`);
    diag = await windowFor(app, "diagnose-dropdown.html");
    const after = await diag.evaluate(() => window.erpDiagnose.refresh());
    // The route each trail line names is where ERPNext happened to be (right after a sign-in it can
    // still be on /app, on its way to /desk): not what this door is about, so it is left out.
    door("get-diagnose incidents", (after.lines || []).filter((l) => /probe: health-incident-doors|incident/i.test(String(l))).map((l) => String(l).replace(/ @ \S+/, " @ <route>").replace(/\| \/\S*$/, "| <route>").replace(/\d+/g, "N")));
    await diag.evaluate(() => window.erpDiagnose.close());
    await gone(app, "diagnose-dropdown.html");

    // Feedback: the box offers open / copy / cancel; cancelled.
    const fb = await inChrome(app, `window.erpUi.openFeedback()`);
    door("open-feedback cancel", { action: fb && fb.action, ok: fb && fb.ok, host: fb && fb.url ? new URL(fb.url).host : "", box: await lastBox(app) });
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
  }
});
