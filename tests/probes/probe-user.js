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
 * its sessions (probe-user-retire.js). If the probe dies first, `run-probe` retires it — and
 * failing that, the next `run-probe` does. The cookies are the run's own (its profile folder).
 */
import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { e2eCall, e2eGet } from "../../e2e/helpers.js";
import { inErp, assertSandboxSite, report } from "./probe-helpers.js";
import { lockProbeUser, retireLockedProbeUsers } from "./probe-user-retire.js";

/**
 * The two clerks most probes should act as (5zorro 2026-10-25: most real users have limited
 * roles). ERPNext's own roles, so the sandbox needs no custom role:
 * - **AP clerk** edits most things and also receives goods: bills, payments, POs, receipts, new
 *   vendors and items, sales orders.
 * - **AR clerk** edits sales orders, POs, sales invoices and payments received, and reads payables.
 *   It cannot make a vendor (no Purchase Master Manager) or an item (no Item Manager), nor stock
 *   entries (no Stock User). ERPNext's roles are coarse here: Purchase User writes Item Receipts,
 *   and Accounts User writes Purchase Invoices as well as Sales Invoices, so this clerk can edit
 *   both — narrower would take a custom role.
 * Pass one as `loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name })`.
 */
export const AP_CLERK = Object.freeze({
  name: "ap-clerk",
  roles: Object.freeze(["Accounts User", "Purchase User", "Purchase Master Manager", "Stock User", "Item Manager", "Sales User"]),
});
export const AR_CLERK = Object.freeze({
  name: "ar-clerk",
  roles: Object.freeze(["Accounts User", "Sales User", "Purchase User"]),
});

/**
 * One user per role set: `zz-probe-purchase-user@example.com`, or per named clerk
 * (`zz-probe-ap-clerk@example.com`). A name always means the same roles: they are set again on
 * every login.
 * @param {readonly string[]} roles
 * @param {string} [as]
 */
export const probeUserFor = (roles, as) =>
  as
    ? `zz-probe-${String(as).toLowerCase().replace(/[^a-z0-9]+/g, "-")}@example.com`
    : `zz-probe-${roles.map((r) => String(r).toLowerCase().replace(/[^a-z0-9]+/g, "-")).sort().join("-and-")}@example.com`;

const loggedUser = (app) => inErp(app, `(async () => { try { return await frappe.xcall("frappe.auth.get_logged_user"); } catch (e) { return "ERR " + (e && e.message); } })()`, 15_000);

/**
 * Reload the ERPNext page and wait until it answers as `user`. The shell's own way first; when that
 * is held — an unsaved Doc page opens its Save / Discard gate, so the page keeps the old login's
 * CSRF token and every call fails — the ERPNext page itself is reloaded.
 */
async function reloadAs(app, user) {
  await e2eCall(app, "openErp", "/app");
  const took = await expect
    .poll(async () => loggedUser(app).catch(() => ""), { timeout: 10_000 })
    .toBe(user)
    .then(() => true, () => false);
  if (took) return;
  const base = await e2eGet(app, "erpBase");
  const reloaded = await app.evaluate(({ webContents }, url) => {
    const wc = webContents.getAllWebContents().filter((w) => w.getURL().startsWith(url));
    wc.forEach((w) => w.reload());
    return wc.length;
  }, base);
  report("probe-user-reload", { user, reloaded, why: "the shell's reload was held (unsaved Doc page?)" });
  await expect.poll(async () => loggedUser(app).catch(() => ""), { timeout: 40_000 }).toBe(user);
}

/**
 * @param {import('@playwright/test').ElectronApplication} app signed in as Administrator
 * @param {readonly string[]} roles exactly the roles the user gets
 * @param {{ as?: string }} [opts] a clerk's name (AP_CLERK.name) instead of one made from the roles
 * @returns {Promise<{ user: string, back: () => Promise<void>, retire: () => Promise<string[]> }>}
 */
export async function loginAsProbeUser(app, roles, opts = {}) {
  await assertSandboxSite(app);
  const admin = await loggedUser(app);
  const base = await e2eGet(app, "erpBase");
  const user = probeUserFor(roles, opts.as);
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
