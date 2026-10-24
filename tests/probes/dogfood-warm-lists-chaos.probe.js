/**
 * @dogfood Warm lists 1
 * Plan 10-19 dogfood row "Warm lists 1" (HANDOFF § Warm pick lists): under 5zorro's chaos mode
 * (`npm run start:chaos`: ERPNext calls 250 ms late, 45 % of the time), a new Bill, a vendor typed,
 * then an item. Questions: do the lists appear with no "Searching…" — from the warm copy (ERPNext's
 * live search is refused while typing, so only the copy can answer) — items in the order ERPNext's
 * own search gives, vendors the same names (vendors are then re-ranked by PO activity, OI-131 — a
 * vendor with no PO sorts by name, so "S" lists ALPINE SUPPLY CO before SUMMIT TRADERS, as a live
 * search in the shell does too)? The *feel* (and the copy's cost at ~20k items, `nav-debug.log` `link-list loaded`)
 * stays 5zorro's. Makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, focusTestId, inDoc, inErp, openNewDoc, erpDown, erpUp, report } from "./probe-helpers.js";

const dropdown = (app) =>
  inDoc(app, `(() => { const d = [...document.querySelectorAll(".link-dd")].find((x) => !x.hidden); return d ? { opts: [...d.querySelectorAll(".link-opt")].map((o) => o.textContent.trim()), searching: /Searching/.test(d.textContent) } : null; })()`);
const live = (app, doctype, txt) =>
  inErp(app, `(async () => (await frappe.xcall("frappe.desk.search.search_link", { doctype: ${JSON.stringify(doctype)}, txt: ${JSON.stringify(txt)}, page_length: 10 })).map((r) => r.value))()`, 15_000);
/** The names the dropdown shows, in its order (vendors read "NAME, …" or "NAME · …", items "item name, group (CODE)"; the longest name that fits). */
const names = (opts, known) =>
  opts
    .map((o) => known.filter((k) => o === k || o.startsWith(`${k},`) || o.startsWith(`${k} ·`) || o.includes(`(${k})`)).sort((a, b) => b.length - a.length)[0])
    .filter(Boolean);

test("Warm lists 1: under chaos, vendor and item lists come from the copy, in ERPNext's order", async () => {
  process.env.ERP_CHAOS_LAG_MS = process.env.ERP_CHAOS_LAG_MS || "250";
  process.env.ERP_CHAOS_LAG_PCT = process.env.ERP_CHAOS_LAG_PCT || "45";
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(5000); // the copies load at start
    const liveVendors = await live(app, "Supplier", "S");
    const liveItems = await live(app, "Item", "SAMPLE");
    report("live", { vendors: liveVendors, items: liveItems });

    await erpDown(app, "search_link");
    await focusTestId(app, "bill-vendor");
    await keys(app, "S");
    await sleep(800);
    const vendors = await dropdown(app);
    report("vendor-list", vendors);
    await keys(app, "\x1b");
    expect(vendors && vendors.searching).toBe(false);
    expect([...names(vendors.opts, liveVendors)].sort()).toEqual([...liveVendors].sort());

    await inDoc(app, `(() => { const c = document.querySelector('input[data-row="0"][data-field="item_code"]'); c.focus(); return true; })()`);
    await keys(app, "SAMPLE");
    await sleep(800);
    const items = await dropdown(app);
    report("item-list", items);
    expect(items && items.searching).toBe(false);
    expect(names(items.opts, liveItems)).toEqual(liveItems.slice(0, names(items.opts, liveItems).length));
    expect(names(items.opts, liveItems).length).toBeGreaterThan(0);
  } finally {
    await erpUp(app).catch(() => {});
    await app.close().catch(() => {});
  }
});
