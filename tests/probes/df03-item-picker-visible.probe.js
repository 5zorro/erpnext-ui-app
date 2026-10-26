/**
 * DF-03 (5zorro, 2026-10-25): "if i type in a item code … there is a item picker that opens, then is
 * hidden under the taxes and charges table. the whole picker should be visible while im picking
 * from it." As the **AP clerk**, on a new Bill with two lines and a tax line, press ↓ in the last
 * line's empty Item box so the full list opens down over the taxes. Question: is the list what the window shows at each of its corners and
 * its middle, or does something else (the taxes) paint over it? `PROBE picker-<skin>` names what
 * covers each point. Before the fix the first tax line covered the list's bottom: each page section
 * is its own layer (z-index 1, above the card's stamp), so the later taxes section painted over the
 * whole lines section, list and all; `electron/doc-wash.css` now lifts the section with an open list.
 * Makes no records (nothing is saved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, inDoc, inErp, openNewDoc, report, repaintDoc, closeSourcePickers } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const VENDOR = "ALPINE SUPPLY CO";
const ITEM = "ZZ-DF-SERVICE";

// The Bill: the PO's Doc form has no taxes table.
for (const [skin, route] of [["bill", "/app/purchase-invoice/new"]]) {
  test(`the Item pick list on the ${skin} is not covered`, async () => {
    test.setTimeout(5 * 60_000);
    const app = await launchShell();
    let clerk = null;
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
          const r = await window.erpDoc.setItem(0, "item_code", ${JSON.stringify(ITEM)});
          if (!r || !r.ok) return (r && r.reason) || "item failed";
          // A tax line, so the taxes table is on the page under the lines (5zorro's case).
          s = await window.erpDoc.getSnapshot();
          if (!((s.doc.taxes) || []).length) {
            const t = await window.erpDoc.addTax("ZZ DF Expense - USE", 5, "ZZ probe freight");
            if (!t || !t.ok) return "tax: " + ((t && t.reason) || "failed");
          }
          return "ok";
        })()`,
        60_000,
      );
      expect(made).toBe("ok");
      await repaintDoc(app);
      await sleep(1500);
      await closeSourcePickers(app);
      await inDoc(app, `(() => { const i = document.querySelector('input[data-row="1"][data-field="item_code"]'); i.scrollIntoView({ block: "center" }); i.focus(); i.select(); return true; })()`);
      // ↓ in the empty box lists every Item: a full-height list, long enough to reach the taxes.
      await app.evaluate(({ webContents }) => {
        const wc = webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL()));
        wc.sendInputEvent({ type: "keyDown", keyCode: "Down" });
        wc.sendInputEvent({ type: "keyUp", keyCode: "Down" });
      });
      await expect
        .poll(() => inDoc(app, `(() => { const d = [...document.querySelectorAll(".link-dd")].find((x) => !x.hidden); return !!d && d.querySelectorAll(".link-opt").length > 0; })()`), { timeout: 30_000 })
        .toBe(true);
      await sleep(800);
      const seen = await inDoc(
        app,
        `(() => {
          const d = [...document.querySelectorAll(".link-dd")].find((x) => !x.hidden);
          const r = d.getBoundingClientRect();
          const name = (e) => !e ? "nothing" : (e.closest(".link-dd") === d ? "list" : (e.closest("[data-testid]") ? e.closest("[data-testid]").dataset.testid : e.tagName + (e.className ? "." + String(e.className).split(" ")[0] : "")));
          const pts = { topLeft: [r.left + 4, r.top + 4], topRight: [r.right - 4, r.top + 4], middle: [(r.left + r.right) / 2, (r.top + r.bottom) / 2], bottomLeft: [r.left + 4, r.bottom - 4], bottomRight: [r.right - 4, r.bottom - 4] };
          const tb = document.querySelector('[data-testid="doc-taxes-block"], [data-testid="bill-taxes-block"], .bill-section-taxes');
          const tr = tb && !tb.hidden ? tb.getBoundingClientRect() : null;
          const out = { box: [Math.round(r.top), Math.round(r.bottom)], window: window.innerHeight, taxes: tr ? [Math.round(tr.top), Math.round(tr.bottom)] : "hidden" };
          for (const [k, [x, y]] of Object.entries(pts)) out[k] = name(document.elementFromPoint(x, y));
          // What layers each side: every ancestor that is positioned or makes a stacking context.
          const layers = (e) => { const o = []; for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.position !== "static" || cs.zIndex !== "auto" || cs.transform !== "none" || cs.filter !== "none" || cs.opacity !== "1" || cs.overflow !== "visible") o.push((n.id ? "#" + n.id : n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.split(" ")[0] : "")) + " " + cs.position + " z" + cs.zIndex + (cs.overflow !== "visible" ? " ov:" + cs.overflow : "") + (cs.transform !== "none" ? " T" : "") + (cs.opacity !== "1" ? " op" + cs.opacity : "")); } return o; };
          if (out.bottomLeft !== "list") { out.listLayers = layers(d); out.coverLayers = layers(document.elementFromPoint(...pts.bottomLeft)); }
          return out;
        })()`,
      );
      report(`picker-${skin}`, seen);
      expect(Array.isArray(seen.taxes) && seen.taxes[0] < seen.box[1], "the list must reach over the taxes for this to test anything").toBe(true);
      for (const k of ["topLeft", "topRight", "middle", "bottomLeft", "bottomRight"]) expect(seen[k], k).toBe("list");
    } finally {
      await keys(app, "\x1b").catch(() => {});
      if (clerk) await clerk.retire();
      await app.close().catch(() => {});
    }
  });
}
