/**
 * Plan 10-25 step 0a: the lines table's keys moved out of both pages into one module
 * (`src/item-table-keys-ui.js`), behaviour unchanged. Question: do the keys still do on each page
 * what they did before the move? As the **AP clerk**, on a new Bill and a new PO with two lines:
 * Escape leaves edit mode (the table says so in `data-cell-mode`), ↓ / ↑ move between lines, →
 * moves along the line, Shift+Tab out of the first line's first box leaves the table backward (Bill:
 * Amount Due or the bill number; PO: its last header box), and Tab past the last line's last box
 * adds a line and lands on its Item. A move-only step: this passed on the code before the move and
 * passes after it, with the same path printed (`PROBE keys-<skin>`).
 * Runs as the restricted probe user (tests/probes/probe-user.js), disabled again after. Makes no
 * records (nothing is saved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report, repaintDoc, closeSourcePickers } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const VENDOR = "ALPINE SUPPLY CO";
const ITEM = "ZZ-DF-SERVICE";

/** One named key into the Doc page (Electron's key names: Escape, Up, Down, Right, Tab). */
const press = (app, keyCode, modifiers = []) =>
  app.evaluate(({ webContents }, { keyCode, modifiers }) => {
    const wc = webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL()));
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  }, { keyCode, modifiers });

/** Where focus is, the table's cell mode, and how many lines the doc has. */
const where = (app) =>
  inDoc(
    app,
    `(async () => {
      const a = document.activeElement;
      const s = await window.erpDoc.getSnapshot();
      const t = document.querySelector('input[data-row][data-field]');
      const table = t ? t.closest('tbody') : null;
      return {
        at: a && a.dataset && a.dataset.row != null ? a.dataset.row + ":" + a.dataset.field : (a && a.dataset && a.dataset.field) || (a && a.id) || (a && a.tagName),
        mode: table ? table.dataset.cellMode || "" : "",
        lines: ((s && s.doc && s.doc.items) || []).length,
      };
    })()`,
    15_000,
  );

for (const [skin, route] of [["bill", "/app/purchase-invoice/new"], ["po", "/app/purchase-order/new"]]) {
  test(`step 0a: the lines table's keys on the ${skin}`, async () => {
    test.setTimeout(5 * 60_000);
    const app = await launchShell();
    let clerk = null;
    const path = [];
    const step = async (label) => {
      await sleep(700);
      const w = await where(app);
      path.push({ label, ...w });
      return w;
    };
    try {
      await waitForE2eApi(app);
      await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
      await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
      clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
      await openNewDoc(app, skin, route);
      await sleep(2500);
      await inDoc(app, `(async () => { const r = await window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)}); return r && r.ok; })()`, 30_000);
      await sleep(3000);
      await closeSourcePickers(app);
      const made = await inDoc(
        app,
        `(async () => {
          let s = await window.erpDoc.getSnapshot();
          while (((s.doc.items) || []).length < 2) { await window.erpDoc.addItem(); s = await window.erpDoc.getSnapshot(); }
          for (const i of [0, 1]) {
            const r = await window.erpDoc.setItem(i, "item_code", ${JSON.stringify(ITEM)});
            if (!r || !r.ok) return "item " + i + ": " + ((r && r.reason) || "failed");
            await window.erpDoc.setItem(i, "qty", "1");
          }
          return "ok";
        })()`,
        60_000,
      );
      expect(made).toBe("ok");
      await repaintDoc(app);
      await sleep(1500);
      await closeSourcePickers(app);
      await sleep(500);

      await inDoc(app, `(() => { const i = document.querySelector('input[data-row="0"][data-field="qty"]'); i.focus(); return true; })()`);
      expect((await step("focus 0:qty")).mode).toBe("edit");
      await press(app, "Escape");
      expect(await step("Escape")).toMatchObject({ at: "0:qty", mode: "nav" });
      await press(app, "Down");
      expect((await step("Down")).at).toBe("1:qty");
      await press(app, "Up");
      expect((await step("Up")).at).toBe("0:qty");
      await press(app, "Right");
      const right = await step("Right");
      expect(right.at).toMatch(/^0:/);
      expect(right.at).not.toBe("0:qty");

      await inDoc(app, `(() => { const i = document.querySelector('input[data-row="0"][data-field="item_code"]'); i.dataset.navFocus = "1"; i.focus(); i.select(); return true; })()`);
      await step("focus 0:item_code (nav)");
      await press(app, "Tab", ["shift"]);
      const back = await step("Shift+Tab");
      expect(back.at).not.toMatch(/^\d+:/);

      await inDoc(app, `(() => { const i = document.querySelector('input[data-row="1"][data-field="item_code"]'); i.dataset.navFocus = "1"; i.focus(); i.select(); return true; })()`);
      await step("focus 1:item_code (nav)");
      let w = null;
      for (let n = 0; n < 12; n++) {
        await press(app, "Tab");
        w = await step(`Tab ${n + 1}`);
        if (w.lines >= 3) break;
      }
      await sleep(2500);
      w = await step("after the add");
      report(`keys-${skin}`, path);
      expect(w.lines).toBe(3);
      expect(w.at).toBe("2:item_code");
    } finally {
      if (path.length) report(`keys-${skin}-path`, path.map((p) => `${p.label} → ${p.at} ${p.mode} ${p.lines}`));
      if (clerk) await clerk.retire();
      await app.close().catch(() => {});
    }
  });
}
