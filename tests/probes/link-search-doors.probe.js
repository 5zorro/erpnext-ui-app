/**
 * Every door of link search and its warm copies, driven once, its answer printed in one normalized
 * line each (`DOOR …`). Written for plan 2026-10-25 R2-5's link search move: run before and after,
 * the DOOR lines must match. Nothing here writes to ERPNext.
 *
 * The doors: the copies loading after a Bill opens; a search the copy answers, one it misses (live),
 * one with filters (live, vendors re-ranked by PO activity), an Account search (live, each row's
 * company added), a list that is never copied; "does this record still exist?" both ways; Refresh
 * of a copied list and of one that is not; the PO page's own search door; and the copies dropped
 * when the user changes (the clerk signs out, the admin is back).
 *
 * Acts as the AP clerk.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inDoc, inErp, openNewDoc, report, docQuiet, warmCopies, sleep } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const door = (name, value) => report(`DOOR ${name}`, value);
const N = (s) => String(s).replace(/\d+/g, "N");

/** One search through the Doc page's own call, reduced to what does not change run to run. */
async function search(app, doctype, txt, filters) {
  const r = await inDoc(app, `window.erpDoc.searchLink(${JSON.stringify(doctype)}, ${JSON.stringify(txt)}, ${JSON.stringify(filters || null)})`, 30_000);
  if (!r || typeof r !== "object") return { raw: N(r) };
  return {
    ok: r.ok,
    source: r.source || "",
    reason: r.reason || "",
    asOf: r.asOf ? "set" : "",
    n: (r.results || []).length,
    first: (r.results || []).slice(0, 6).map((o) => ({ value: o.value, keys: Object.keys(o).sort() })),
  };
}

/** The run's `link-list` / `link-missing` trail lines, digits normalized. */
function trail(userData) {
  try {
    return fs
      .readFileSync(path.join(userData, "nav-debug.log"), "utf8")
      .split("\n")
      .filter((l) => /"event":"link-(list|missing)"/.test(l))
      .map((l) => {
        const e = JSON.parse(l);
        return `${e.event}: ${e.detail}`;
      });
  } catch {
    return [];
  }
}

/** The lists main.js copies (src/link-list-cache.js WARM_LINK_DOCTYPES). */
const WARM = ["Supplier", "Customer", "Item", "Payment Terms Template", "Mode of Payment", "Project", "Sales Taxes and Charges Template", "Purchase Taxes and Charges Template"];
/** A list's settled load outcome in the trail, or "" while it has none. */
function outcome(lines, dt) {
  const mine = lines.filter((l) => l.includes(` dt=${dt} `) || l.endsWith(` dt=${dt}`));
  if (mine.some((l) => /^link-list: loaded /.test(l))) return "loaded";
  if (mine.some((l) => /^link-list: too-many /.test(l))) return "too-many";
  const failed = mine.find((l) => /^link-list: load-failed .* via=\S+-retry/.test(l));
  return failed ? `failed: ${failed.replace(/^.* reason=/, "")}` : "";
}

test("link search: every door answers as before", async () => {
  test.setTimeout(240_000);
  let app = null;
  let clerk = null;
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    const userData = await app.evaluate(({ app: a }) => a.getPath("userData"));

    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await docQuiet(app);
    await warmCopies(app, ["Supplier", "Customer", "Item", "Mode of Payment"]);
    // Every copied list has its outcome: loaded, too many to copy, or failed on its one retry (a
    // first try can be cut off by the page reloading as the Doc page opens).
    await expect.poll(() => WARM.every((dt) => outcome(trail(userData), dt)), { timeout: 30_000, intervals: [200] }).toBe(true);
    door("copies loaded", (await e2eCall(app, "linkListsLoaded")).sort());
    door("copy outcomes", Object.fromEntries(WARM.map((dt) => [dt, outcome(trail(userData), dt)])));

    door("search Supplier ''", await search(app, "Supplier", ""));
    door("search Supplier 'A'", await search(app, "Supplier", "A"));
    door("search Item ''", await search(app, "Item", ""));
    door("search Mode of Payment ''", await search(app, "Mode of Payment", ""));
    door("search Supplier miss", await search(app, "Supplier", "qqzz no such vendor"));
    door("search Supplier filtered", await search(app, "Supplier", "", { disabled: 0 }));
    door("search Account ''", await search(app, "Account", ""));
    door("search Company '' (never copied)", await search(app, "Company", ""));
    door("search no doctype", await search(app, "", "A"));

    const someVendor = await inErp(app, `frappe.xcall("frappe.client.get_list", { doctype: "Supplier", fields: ["name"], order_by: "name asc", limit_page_length: 1 }).then((r) => (r[0] && r[0].name) || "")`, 15_000);
    door("exists a vendor", await inDoc(app, `window.erpDoc.linkExists("Supplier", ${JSON.stringify(someVendor)})`, 15_000));
    door("exists no such vendor", await inDoc(app, `window.erpDoc.linkExists("Supplier", "ZZ NO SUCH VENDOR 0")`, 15_000));
    door("exists no doctype", await inDoc(app, `window.erpDoc.linkExists("", "x")`, 15_000));
    const refreshed = await inDoc(app, `window.erpDoc.refreshLinkList("Supplier")`, 40_000);
    door("refresh Supplier", { ok: refreshed && refreshed.ok, asOf: !!(refreshed && refreshed.asOf), reason: (refreshed && refreshed.reason) || "" });
    door("refresh Account", await inDoc(app, `window.erpDoc.refreshLinkList("Account")`, 15_000));

    // The PO page asks through its own door (doc-search-link: no filters).
    await openNewDoc(app, "po", "/app/purchase-order/new");
    await docQuiet(app);
    door("PO search Supplier 'A'", await search(app, "Supplier", "A"));
    door("PO search Supplier filtered", await search(app, "Supplier", "A", { disabled: 0 }));

    // The admin back: another user's copies are dropped.
    await clerk.back();
    for (let i = 0; i < 100 && !trail(userData).some((l) => /^link-list: dropped/.test(l)); i += 1) await sleep(200);
    door("dropped on user change", { dropped: trail(userData).some((l) => /^link-list: dropped/.test(l)) });
    door("trail: missing and refresh", trail(userData).filter((l) => /^link-missing|refresh dt=|miss dt=/.test(l)));
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
  }
});
