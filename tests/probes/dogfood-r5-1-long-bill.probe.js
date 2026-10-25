/**
 * @dogfood R5-1
 * Plan 10-19 dogfood row R5-1: a 25-line Bill, repainted 30 times (each repaint rebuilds every
 * line's link pickers), then the line table scrolled with an item dropdown open. Questions: do the
 * page-wide listeners stay flat across the repaints (before R5-1 each picker added three and never
 * removed them — 75 per repaint here), and does the open dropdown follow its cell when the page
 * scrolls? "Smooth all day" is 5zorro's to feel. Saves nothing; makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, inDoc, openNewDoc, report, closeSourcePickers, repaintDoc } from "./probe-helpers.js";

const LINES = 25;
const SNAP = `(async () => { const s = await window.erpDoc.getSnapshot(); return { doc: s.doc }; })()`;

/** Page-wide listeners on window and document in the Doc page, by type (Chrome DevTools protocol). */
const listeners = (app) =>
  app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL()));
    const dbg = wc.debugger;
    if (!dbg.isAttached()) dbg.attach("1.3");
    const out = {};
    for (const expr of ["window", "document"]) {
      const { result } = await dbg.sendCommand("Runtime.evaluate", { expression: expr });
      const { listeners: ls } = await dbg.sendCommand("DOMDebugger.getEventListeners", { objectId: result.objectId });
      for (const l of ls) out[`${expr}:${l.type}`] = (out[`${expr}:${l.type}`] || 0) + 1;
    }
    return out;
  });
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

test("R5-1: a long Bill's repaints add no page-wide listeners, and an open dropdown follows its cell", async () => {
  test.setTimeout(400_000);
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(2000);
    await inDoc(
      app,
      `(async () => { const d = window.erpDoc; await d.setHeader("supplier", "ALPINE SUPPLY CO");
        const codes = ["SAMPLE-SKU-01", "SAMPLE-SKU-02", "SAMPLE-SKU-03", "SAMPLE-SKU-04"];
        for (let k = 0; k < ${LINES}; k++) {
          const s = await d.getSnapshot(); if ((s.doc.items || []).length <= k) await d.addItem();
          await d.setItem(k, "item_code", codes[k % 4]); await d.setItem(k, "qty", k + 1); await d.setItem(k, "rate", 10);
        }
        return true; })()`,
      300_000,
    );
    const repaint = async () => {
      const snap = await repaintDoc(app);
      await sleep(150);
      return snap;
    };
    await closeSourcePickers(app);
    const snap = await repaint();
    expect(snap.doc.items.length).toBeGreaterThanOrEqual(LINES);
    const before = await listeners(app);
    for (let k = 0; k < 30; k++) await repaint();
    const after = await listeners(app);
    report("listeners", { before: total(before), after: total(after), beforeByType: before, afterByType: after });
    expect(total(after) - total(before)).toBeLessThanOrEqual(3);

    // An item dropdown open on line 20, then the page scrolled: the dropdown moves with its cell.
    const cell = `document.querySelector('input[data-row="19"][data-field="item_code"]')`;
    await inDoc(app, `(() => { const c = ${cell}; c.scrollIntoView({ block: "center" }); c.focus(); c.select(); return true; })()`);
    await keys(app, "SAMPLE");
    await expect.poll(() => inDoc(app, `[...document.querySelectorAll(".link-dd")].filter((d) => !d.hidden).length`), { timeout: 10_000 }).toBe(1);
    const gap = () =>
      inDoc(app, `(() => { const c = ${cell}.getBoundingClientRect(); const d = [...document.querySelectorAll(".link-dd")].find((x) => !x.hidden); if (!d) return null; const r = d.getBoundingClientRect(); return { cellBottom: Math.round(c.bottom), cellTop: Math.round(c.top), ddTop: Math.round(r.top), ddBottom: Math.round(r.bottom) }; })()`);
    const g1 = await gap();
    await inDoc(app, `(() => { const s = document.scrollingElement; s.scrollBy(0, 120); [...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== "visible").forEach((e) => e.scrollBy(0, 120)); return true; })()`);
    await sleep(300);
    const g2 = await gap();
    report("dropdown", { before: g1, afterScroll: g2 });
    expect(g2).not.toBeNull();
    expect(g2.cellTop).not.toBe(g1.cellTop); // the cell did move
    // Below the cell (or above it, flipped near the bottom) — either way touching the cell again.
    const follows = (g) => Math.abs(g.ddTop - g.cellBottom) <= 6 || Math.abs(g.ddBottom - g.cellTop) <= 6;
    expect(follows(g1)).toBe(true);
    expect(follows(g2)).toBe(true);
  } finally {
    await app.close().catch(() => {});
  }
});
