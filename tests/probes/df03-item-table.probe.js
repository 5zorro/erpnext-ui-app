/**
 * DF-03's three items-table faults (plan 2026-10-25 step 0b), each on the Bill and the PO, as the
 * **AP clerk**. Each test failed on the code before its fix.
 * - T-3: 5zorro's DF-03 note was the wait before a new line appears (museum OI-187). A Tab pressed
 *   during that wait was not checked. Under a slow server (the test sets 1200 ms on every call),
 *   two quick Tabs past the last line's last box. Question: does the clerk end on the new line's
 *   Item? Before the fix the second Tab left the table (PO: Terms; Bill: the taxes, no line added).
 * - T-2: lines with qty 5, 1, 3, sorted by Qty, so the screen shows ERPNext's lines 2, 3, 1.
 *   Question: do ↓ / ↑ / Tab past a line's last box follow the screen? Before the fix they stepped
 *   through ERPNext's order: ↓ from the middle line on screen went nowhere, and Tab past it added
 *   a line.
 * Makes no records (nothing is saved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report, repaintDoc, closeSourcePickers } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const VENDOR = "ALPINE SUPPLY CO";
const ITEM = "ZZ-DF-SERVICE";
const SKINS = [
  // The last box Tab walks to on each page (probe item-table-keys printed the walk).
  { skin: "bill", route: "/app/purchase-invoice/new", lastBox: "project" },
  { skin: "po", route: "/app/purchase-order/new", lastBox: "schedule_date" },
];

/** One named key into the Doc page (Electron's key names: Escape, Up, Down, Right, Tab). */
const press = (app, keyCode, modifiers = []) =>
  app.evaluate(({ webContents }, { keyCode, modifiers }) => {
    const wc = webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL()));
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  }, { keyCode, modifiers });

/** Where focus is (`row:field`) and how many lines the doc has. */
const where = (app) =>
  inDoc(
    app,
    `(async () => {
      const a = document.activeElement;
      const s = await window.erpDoc.getSnapshot();
      return {
        at: a && a.dataset && a.dataset.row != null ? a.dataset.row + ":" + a.dataset.field : (a && a.dataset && a.dataset.field) || (a && a.id) || (a && a.tagName),
        lines: ((s && s.doc && s.doc.items) || []).length,
      };
    })()`,
    30_000,
  );

/** Focus a cell in nav mode, as Tab / an arrow would land on it. */
const focusNav = (app, row, field) =>
  inDoc(app, `(() => { const i = document.querySelector('input[data-row="${row}"][data-field="${field}"]'); if (!i) return false; i.dataset.navFocus = "1"; i.focus(); i.select(); return true; })()`);

/**
 * A new doc as the AP clerk with the vendor set and lines carrying `ITEM` and the given qtys.
 * @returns {Promise<{ app: any, clerk: any }>}
 */
async function openWithLines(skin, route, qtys) {
  const app = await launchShell();
  await waitForE2eApi(app);
  await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 60_000 }).toBe(true);
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  const clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
  await openNewDoc(app, skin, route);
  await sleep(2500);
  await inDoc(app, `(async () => { const r = await window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)}); return r && r.ok; })()`, 60_000);
  await sleep(3000);
  await closeSourcePickers(app);
  const made = await inDoc(
    app,
    `(async () => {
      const qtys = ${JSON.stringify(qtys)};
      let s = await window.erpDoc.getSnapshot();
      while (((s.doc.items) || []).length < qtys.length) { await window.erpDoc.addItem(); s = await window.erpDoc.getSnapshot(); }
      for (const [i, q] of qtys.entries()) {
        const r = await window.erpDoc.setItem(i, "item_code", ${JSON.stringify(ITEM)});
        if (!r || !r.ok) return "item " + i + ": " + ((r && r.reason) || "failed");
        await window.erpDoc.setItem(i, "qty", String(q));
      }
      return "ok";
    })()`,
    180_000,
  );
  expect(made).toBe("ok");
  await repaintDoc(app);
  await sleep(1500);
  await closeSourcePickers(app);
  await sleep(500);
  return { app, clerk };
}

for (const { skin, route, lastBox } of SKINS) {
  test(`T-3 (${skin}): two quick Tabs past the last box under a slow server add one line`, async () => {
    test.setTimeout(8 * 60_000);
    process.env.ERP_CHAOS_LAG_MS = "1200";
    process.env.ERP_CHAOS_LAG_PCT = "100";
    let app = null;
    let clerk = null;
    try {
      ({ app, clerk } = await openWithLines(skin, route, [1, 2]));
      expect(await focusNav(app, 1, lastBox)).toBe(true);
      await press(app, "Tab");
      await press(app, "Tab");
      await sleep(15_000);
      const w = await where(app);
      report(`t3-${skin}`, w);
      expect(w.lines).toBe(3);
      expect(w.at).toBe("2:item_code");
    } finally {
      delete process.env.ERP_CHAOS_LAG_MS;
      delete process.env.ERP_CHAOS_LAG_PCT;
      if (clerk) await clerk.retire();
      if (app) await app.close().catch(() => {});
    }
  });
}

/** Line indexes in painted order. */
const screenRows = (app) =>
  inDoc(app, `(() => [...new Set([...document.querySelectorAll("input[data-row]")].map((i) => Number(i.dataset.row)))])()`);

for (const { skin, route, lastBox } of SKINS) {
  test(`T-2 (${skin}): in a table sorted by Qty, moves follow the screen`, async () => {
    test.setTimeout(6 * 60_000);
    let app = null;
    let clerk = null;
    const path = [];
    const step = async (label) => {
      await sleep(900);
      const w = await where(app);
      path.push(`${label} → ${w.at} (${w.lines} lines)`);
      return w;
    };
    try {
      ({ app, clerk } = await openWithLines(skin, route, [5, 1, 3]));
      await inDoc(app, `(() => { document.querySelector('th[data-sort="qty"]').click(); return true; })()`);
      await sleep(1500);
      const rows = await screenRows(app);
      report(`t2-${skin}-screen`, rows);
      expect(rows).toEqual([1, 2, 0]);

      await focusNav(app, 2, "qty");
      await press(app, "Down");
      expect((await step("Down from the middle line")).at).toBe("0:qty");
      await press(app, "Up");
      expect((await step("Up from the bottom line")).at).toBe("2:qty");

      await focusNav(app, 2, lastBox);
      await press(app, "Tab");
      const w = await step("Tab past the middle line's last box");
      expect(w.at).toBe("0:item_code");
      expect(w.lines).toBe(3);
    } finally {
      if (path.length) report(`t2-${skin}`, path);
      if (clerk) await clerk.retire();
      if (app) await app.close().catch(() => {});
    }
  });
}
