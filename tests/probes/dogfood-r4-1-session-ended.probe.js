/**
 * @dogfood R4-1
 * Plan 10-19 dogfood row R4-1: ERPNext's session ends while the app is idle (here: the login cookie
 * is taken out of the app's session — the same as Frappe dropping an expired session), then the
 * window takes focus again. Questions: does the toolbar offer *Log in*, with the health dot still
 * "ok" (the database is fine; the login is what lapsed)? The cookie is put back after, and the
 * button goes away. Makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { sleep, openNewDoc, report } from "./probe-helpers.js";

const chrome = (app, js) => e2eCall(app, "execInView", "chrome", js);
const toolbar = (app) => chrome(app, `({ login: !document.getElementById("btn-login").hidden, health: document.getElementById("health").textContent.replace(/\\s+/g, " ").trim(), cls: document.getElementById("health").className })`);
const focusWindow = (app) => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed()); w.emit("blur"); w.emit("focus"); return true; });

test("R4-1: a lapsed login shows Log in on focus, with the health dot still ok", async () => {
  const app = await launchShell();
  let sid = null;
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(3000);
    const before = await toolbar(app);
    report("before", before);
    expect(before.login).toBe(false);

    sid = await app.evaluate(async ({ session }) => {
      const c = (await session.defaultSession.cookies.get({ name: "sid" }))[0];
      if (!c) return null;
      await session.defaultSession.cookies.remove(`http://${c.domain.replace(/^\./, "")}${c.path || "/"}`, "sid");
      return c;
    });
    report("cookie", { had: !!sid, domain: sid && sid.domain });
    expect(sid).toBeTruthy();
    await focusWindow(app);
    await expect.poll(async () => (await toolbar(app)).login, { timeout: 20_000 }).toBe(true);
    const lapsed = await toolbar(app);
    report("lapsed", lapsed);
    expect(lapsed.health).toMatch(/DB/);
    expect(lapsed.cls).not.toMatch(/bad|down|err/);
  } finally {
    if (sid) {
      await app.evaluate(async ({ session }, c) => {
        await session.defaultSession.cookies.set({ url: `http://${c.domain.replace(/^\./, "")}${c.path || "/"}`, name: "sid", value: c.value, path: c.path, httpOnly: c.httpOnly, expirationDate: c.expirationDate, sameSite: c.sameSite });
      }, sid);
      await focusWindow(app);
      await sleep(3000);
      report("restored", await toolbar(app));
    }
    await app.close().catch(() => {});
  }
});
