/**
 * Review 10-19 R13-1 (5zorro 2026-10-25), as the AP clerk on a new Bill's Amount Due:
 * 1. `10.05*0.5` Enter goes in as 5.02 (this site's Banker's Rounding, read from ERPNext), and the
 *    tape stays up with a yellow "Rounds to 5.02 — remainder 5/1000" for ~5 s, then fades.
 * 2. Round up, picked on the tape mid-calculation, makes the same sum 5.03 ("remainder −5/1000");
 *    the ⓘ says the rule in words.
 * 3. `+`, then ↩ on that calculation in the tape's history, carries on from 5.025 (not 5.03):
 *    + 5.025 Enter goes in as 10.05 with no remainder (from 5.03 it would be 10.06).
 * Makes no records (the Bill is never saved). Puts back the remembered convention (page storage,
 * which run-probe's prefs backup does not cover).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, inDoc, inErp, focusTestId, openNewDoc, report } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const tape = (app) =>
  inDoc(app, `(() => {
    const o = document.getElementById("calc-overlay"); const rem = o && o.querySelector('[data-testid="doc-calc-remainder"]');
    return { shown: !!(o && !o.hidden), fading: !!(o && o.classList.contains("calc-fading")),
      remainder: rem && !rem.hidden ? rem.textContent : "", value: document.querySelector('[data-testid="bill-amount-due"]').value.trim() };
  })()`);
const click = (app, testid) =>
  inDoc(app, `(() => { const b = document.querySelector('[data-testid=${JSON.stringify(testid)}]'); if (!b) return false; b.click(); return true; })()`);
const freshBox = async (app) => {
  await focusTestId(app, "bill-amount-due");
  await inDoc(app, `(() => { const i = document.querySelector('[data-testid="bill-amount-due"]'); i.select(); return true; })()`);
  await keys(app, "\b");
};

test("R13-1: never quietly rounded — remainder row, convention, resume", async () => {
  test.setTimeout(4 * 60_000);
  const app = await launchShell();
  let clerk = null;
  let priorConvention = null;
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }); // leaving: Discard
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(2500);
    priorConvention = await inDoc(app, `(() => { try { return localStorage.getItem("calc-rounding-convention"); } catch { return null; } })()`);
    await inDoc(app, `(() => { try { localStorage.removeItem("calc-rounding-convention"); } catch {} return true; })()`);
    // The page read the convention at load: open the tape once and pick Round to be sure.

    // 1. Round (the site's method) and the lingering yellow row.
    await freshBox(app);
    await keys(app, "10.05*");
    await sleep(300);
    await click(app, "doc-calc-convention-round");
    await keys(app, "0.5\n");
    await sleep(400);
    const at0 = await tape(app);
    await sleep(2500);
    const at3 = await tape(app);
    await sleep(4000);
    const at7 = await tape(app);
    report("round", { at0, at3, at7 });
    expect(at0.value).toMatch(/^\$?5\.02$/);
    expect(at0.remainder).toBe("Rounds to 5.02 — remainder 5/1000");
    expect(at3.shown && !at3.fading).toBe(true);
    expect(at7.shown).toBe(false);

    // 2. Round up, picked mid-calculation; the ⓘ.
    await freshBox(app);
    await keys(app, "10.05*");
    await sleep(300);
    await click(app, "doc-calc-convention-up");
    await click(app, "doc-calc-convention-info");
    const note = await inDoc(app, `document.querySelector('[data-testid="doc-calc-convention-note"]').textContent`);
    await keys(app, "0.5\n");
    await sleep(400);
    const up = await tape(app);
    report("up", { up, note });
    expect(note).toMatch(/^Round up: anything past the cent goes up/);
    expect(up.value).toMatch(/^\$?5\.03$/);
    expect(up.remainder).toBe("Rounds to 5.03 — remainder −5/1000");
    await click(app, "doc-calc-convention-info"); // close the ⓘ again

    // 3. ↩ resume from 5.025, not the 5.03 in the box.
    await sleep(6500);
    await focusTestId(app, "bill-amount-due");
    await keys(app, "+");
    await sleep(300);
    await inDoc(app, `(() => { document.getElementById("calc-overlay").dispatchEvent(new MouseEvent("mouseenter")); return true; })()`);
    await expect.poll(() => inDoc(app, `document.querySelectorAll('[data-testid="doc-calc-resume"]').length`), { timeout: 10_000 }).toBeGreaterThan(0);
    const resumed = await inDoc(app, `(() => { const all = [...document.querySelectorAll('[data-testid="doc-calc-resume"]')]; const b = all[all.length - 1]; const t = b.title; b.click(); return t; })()`);
    await keys(app, "5.025\n");
    await sleep(400);
    const res = await tape(app);
    report("resume", { resumed, res });
    expect(resumed).toMatch(/from 5\.025 /);
    expect(res.value).toMatch(/^\$?10\.05$/);
    expect(res.remainder).toBe("");
  } finally {
    await inDoc(app, `(() => { try { const v = ${JSON.stringify(priorConvention)}; if (v == null) localStorage.removeItem("calc-rounding-convention"); else localStorage.setItem("calc-rounding-convention", v); } catch {} return true; })()`).catch(() => {});
    if (clerk) await clerk.retire();
    await app.close().catch(() => {});
  }
});
