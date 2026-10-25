/**
 * Run part of a probe as a sandbox user with only some roles (plan 10-19 § A restricted probe user):
 * every other probe runs as Administrator, who reads everything, so no path where ERPNext refuses
 * the clerk was ever exercised. Typical shape — set the scene as Administrator, then:
 *
 *   const clerk = await loginAsProbeUser(app, ["Purchase User"]);
 *   try { …drive the pages as the clerk… } finally { await clerk.retire(); }
 *
 * `back()` returns the app to Administrator without a password: the app's own ERPNext cookies
 * are saved before the switch and put back. `retire()` = `back()`, then disable the user and end
 * its sessions (probe-user-retire.js). If the probe dies first, `run-probe` retires it and restores
 * the app's Cookies file — and failing that, the next `run-probe` does.
 */
import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { e2eCall, e2eGet } from "../../e2e/helpers.js";
import { inErp, assertSandboxSite, report } from "./probe-helpers.js";
import { lockProbeUser, retireLockedProbeUsers } from "./probe-user-retire.js";

/** One user per role set: `zz-probe-purchase-user@example.com`. */
export const probeUserFor = (roles) =>
  `zz-probe-${roles.map((r) => String(r).toLowerCase().replace(/[^a-z0-9]+/g, "-")).sort().join("-and-")}@example.com`;

const loggedUser = (app) => inErp(app, `(async () => { try { return await frappe.xcall("frappe.auth.get_logged_user"); } catch (e) { return "ERR " + (e && e.message); } })()`, 15_000);

/** Reload the ERPNext page and wait until it answers as `user`. */
async function reloadAs(app, user) {
  await e2eCall(app, "openErp", "/app");
  await expect.poll(async () => loggedUser(app).catch(() => ""), { timeout: 40_000 }).toBe(user);
}

/**
 * @param {import('@playwright/test').ElectronApplication} app signed in as Administrator
 * @param {string[]} roles exactly the roles the user gets
 * @returns {Promise<{ user: string, back: () => Promise<void>, retire: () => Promise<string[]> }>}
 */
export async function loginAsProbeUser(app, roles) {
  await assertSandboxSite(app);
  const admin = await loggedUser(app);
  const base = await e2eGet(app, "erpBase");
  const user = probeUserFor(roles);
  lockProbeUser(user); // before the user can be enabled: an interrupted run is retired from this
  const pwd = `Zz-${randomBytes(18).toString("base64url")}-9!`; // held here only, never written
  const made = await inErp(
    app,
    `(async () => {
      const user = ${JSON.stringify(user)}, roles = ${JSON.stringify(roles)}.map((role) => ({ role }));
      const had = await frappe.xcall("frappe.client.get_list", { doctype: "User", filters: { name: user }, fields: ["name"], limit_page_length: 1 });
      if (!had.length) {
        await frappe.xcall("frappe.client.insert", { doc: { doctype: "User", email: user, first_name: "ZZ Probe", last_name: ${JSON.stringify(roles.join(" + "))},
          send_welcome_email: 0, user_type: "System User", enabled: 1, new_password: ${JSON.stringify(pwd)}, roles } });
        return "made";
      }
      const d = await frappe.xcall("frappe.client.get", { doctype: "User", name: user });
      Object.assign(d, { enabled: 1, user_type: "System User", new_password: ${JSON.stringify(pwd)}, roles });
      await frappe.xcall("frappe.client.save", { doc: d });
      return "enabled";
    })()`,
    30_000,
  );
  const saved = await app.evaluate(({ session }, url) => session.defaultSession.cookies.get({ url }), base);
  const login = await inErp(
    app,
    `(async () => { const r = await fetch("/api/method/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ usr: ${JSON.stringify(user)}, pwd: ${JSON.stringify(pwd)} }) }); return r.status; })()`,
    20_000,
  );
  report("probe-user", { user, roles, made, login });
  if (login !== 200) throw new Error(`could not log in as ${user} (HTTP ${login})`);
  await reloadAs(app, user);

  let isBack = false;
  async function back() {
    if (isBack) return;
    isBack = true;
    await app.evaluate(
      async ({ session }, [url, cookies]) => {
        const jar = session.defaultSession.cookies;
        for (const c of await jar.get({ url })) await jar.remove(url, c.name);
        for (const c of cookies) {
          const { hostOnly, domain, session: isSession, expirationDate, ...rest } = c;
          await jar.set({ url, ...rest, ...(hostOnly ? {} : { domain }), ...(isSession ? {} : { expirationDate }) });
        }
        await jar.flushStore();
      },
      [base, saved],
    );
    await reloadAs(app, admin);
  }
  return {
    user,
    back,
    async retire() {
      await back().catch((e) => report("probe-user-back-failed", String(e && e.message)));
      const lines = retireLockedProbeUsers();
      report("probe-user-retired", lines);
      return lines;
    },
  };
}
