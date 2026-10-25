/**
 * Review 10-19 R13-1 (5zorro 2026-10-25): the calculator never rounds quietly. It rounds by the
 * clerk's convention (Round = mathematical, add half and drop the rest; Round up; Round down) to the
 * site's places, only the result that goes into the box, and says what was dropped:
 * "Rounds to 5.03 — remainder −5/1000".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_SITE_ROUNDING,
  ROUNDING_BANKERS,
  ROUNDING_COMMERCIAL,
  ROUNDING_LEGACY,
  calcFieldPrecision,
  conventionNote,
  remainderNote,
  roundByConvention,
  roundLikeFrappe,
  roundingRemainder,
  siteRoundingFrom,
} from "../src/calc/site-rounding.js";
import { createFieldCalcState, reduceFieldCalc, commitFieldCalc, resumeFieldCalc } from "../src/calc/field-calc.js";
import { makeCalcHistoryEntry } from "../src/calc/session-history.js";
import { moneyOrSum } from "../src/money.js";

const CENTS = { precision: 2, method: ROUNDING_BANKERS };

/** Type `prior` into the box, then `keys` with the calculator on it; Enter. */
function calc(prior, keys, kind, rounding) {
  let st = createFieldCalcState(prior, undefined, { kind, rounding });
  let value = prior;
  for (const k of keys) {
    const r = reduceFieldCalc(st, { key: k, fieldValue: value });
    st = r.state;
    if (r.action === "none") value += k; // the browser types it
    else value = r.preview ?? value;
  }
  return commitFieldCalc(st);
}

describe("roundLikeFrappe — Frappe's _round, all three methods", () => {
  it("an exact half cent: legacy and commercial go up, Banker's goes to the even cent", () => {
    assert.equal(roundLikeFrappe(5.025, 2, ROUNDING_LEGACY), 5.03);
    assert.equal(roundLikeFrappe(5.025, 2, ROUNDING_COMMERCIAL), 5.03);
    assert.equal(roundLikeFrappe(5.025, 2, ROUNDING_BANKERS), 5.02);
    assert.equal(roundLikeFrappe(5.035, 2, ROUNDING_BANKERS), 5.04);
    assert.equal(roundLikeFrappe(-5.025, 2, ROUNDING_COMMERCIAL), -5.03);
  });

  it("not a half: every method agrees", () => {
    for (const m of [ROUNDING_LEGACY, ROUNDING_BANKERS, ROUNDING_COMMERCIAL]) {
      assert.equal(roundLikeFrappe(183.2805, 2, m), 183.28);
      assert.equal(roundLikeFrappe(10 / 3, 3, m), 3.333);
    }
  });
});

describe("siteRoundingFrom", () => {
  it("keeps a good answer and falls back on anything odd", () => {
    assert.deepEqual(siteRoundingFrom({ method: ROUNDING_BANKERS, currency: 2, float: 3 }), { method: ROUNDING_BANKERS, currency: 2, float: 3 });
    assert.deepEqual(siteRoundingFrom({ method: "Made up", currency: "x", float: 12 }), { ...DEFAULT_SITE_ROUNDING });
    assert.deepEqual(siteRoundingFrom(null), { ...DEFAULT_SITE_ROUNDING });
  });

  it("quantities keep the float places, everything else money places", () => {
    const site = { method: ROUNDING_BANKERS, currency: 2, float: 3 };
    assert.equal(calcFieldPrecision("qty", site), 3);
    for (const k of ["rate", "amount", "amountDue"]) assert.equal(calcFieldPrecision(k, site), 2);
  });
});

describe("roundByConvention — round / round up / round down", () => {
  it("up and down step at the last place, away from and toward zero", () => {
    assert.equal(roundByConvention(5.021, { ...CENTS, convention: "up" }), 5.03);
    assert.equal(roundByConvention(5.029, { ...CENTS, convention: "down" }), 5.02);
    assert.equal(roundByConvention(-5.021, { ...CENTS, convention: "up" }), -5.03);
    assert.equal(roundByConvention(-5.029, { ...CENTS, convention: "down" }), -5.02);
  });

  it("float noise is not 'past' the place: 0.29 stays 0.29 rounded up", () => {
    assert.equal(roundByConvention(0.29, { ...CENTS, convention: "up" }), 0.29);
    assert.equal(roundByConvention(1.1 * 3, { ...CENTS, convention: "down" }), 3.3);
  });

  it("round is mathematical rounding, whatever the site's method (5zorro: a tape has no set to balance)", () => {
    assert.equal(roundByConvention(5.025, { ...CENTS, convention: "round" }), 5.03);
    assert.equal(roundByConvention(5.035, { ...CENTS, convention: "round" }), 5.04);
    assert.equal(roundByConvention(1.005, { ...CENTS, convention: "round" }), 1.01); // a half as typed
    assert.equal(roundByConvention(-5.025, { ...CENTS, convention: "round" }), -5.03);
    assert.equal(roundByConvention(5.024, { ...CENTS, convention: "round" }), 5.02);
  });
});

describe("roundingRemainder / remainderNote", () => {
  it("counts what was dropped one place finer than the box", () => {
    const r = roundingRemainder(5.024, CENTS);
    assert.equal(r.rounded, 5.02);
    assert.equal(r.units, 4);
    assert.equal(r.scale, 1000);
    assert.equal(remainderNote(r, 2), "Rounds to 5.02 — remainder 4/1000");
    assert.equal(remainderNote(roundingRemainder(5.025, CENTS), 2), "Rounds to 5.03 — remainder −5/1000");
  });

  it("rounding up is a negative remainder; quantities count ten-thousandths", () => {
    const up = roundingRemainder(5.021, { ...CENTS, convention: "up" });
    assert.equal(remainderNote(up, 2), "Rounds to 5.03 — remainder −9/1000");
    const qty = roundingRemainder(10 / 3, { precision: 3, method: ROUNDING_BANKERS });
    assert.equal(remainderNote(qty, 3), "Rounds to 3.333 — remainder 3/10000");
  });

  it("less than one finer unit says 'under', never rounds itself up to 1", () => {
    const r = roundingRemainder(183.2805, CENTS);
    assert.equal(remainderNote(r, 2), "Rounds to 183.28 — remainder under 1/1000");
  });

  it("nothing dropped (float noise included) is no remainder", () => {
    assert.equal(roundingRemainder(0.1 + 0.2, CENTS), null);
    assert.equal(roundingRemainder(12.5, CENTS), null);
  });
});

describe("conventionNote — the ⓘ, in plain words at the box's places", () => {
  it("Round reads 'add half, then drop', with examples the code produced, on a Banker's site too", () => {
    const t = conventionNote({ ...CENTS, convention: "round" });
    assert.equal(t, "Round: add half a cent, then drop everything past the cent. 5.024 → 5.02, 5.025 → 5.03.");
  });

  it("up / down; quantities speak of thousandths", () => {
    assert.match(conventionNote({ precision: 2, method: ROUNDING_COMMERCIAL }), /add half a cent, then drop everything past the cent/);
    assert.match(conventionNote({ ...CENTS, convention: "up" }), /5\.021 → 5\.03/);
    assert.match(conventionNote({ ...CENTS, convention: "down" }), /5\.029 → 5\.02/);
    assert.match(conventionNote({ precision: 3, method: ROUNDING_BANKERS, convention: "down" }), /thousandth/);
  });
});

describe("the calculator: only the result that goes in is rounded", () => {
  it("10.05 × 0.5 goes in as 5.03 and says so", () => {
    const r = calc("10.05", "*0.5", "rate", CENTS);
    assert.equal(r.commitValue, "5.03");
    assert.equal(r.remainder, "Rounds to 5.03 — remainder −5/1000");
  });

  it("a ten-step chain is not rounded step by step (5zorro: only the last one)", () => {
    const r = calc("100", "/3*3/7*7/9*9+0.004-0.004*2/2", "rate", CENTS);
    assert.equal(r.commitValue, "100");
    assert.equal(r.remainder, undefined);
    assert.equal(calc("1", "/3*3", "rate", CENTS).remainder, undefined); // rounded per step: 0.99
  });

  it("the convention decides the result", () => {
    const r = calc("10", "/3", "rate", { ...CENTS, convention: "up" });
    assert.equal(r.commitValue, "3.34");
    assert.equal(r.remainder, "Rounds to 3.34 — remainder −7/1000");
  });

  it("a number typed with more places stays whole on the tape (it showed 1.08)", () => {
    const r = calc("169", "*1.0845", "amount", CENTS);
    assert.match(r.expression, /1\.0845/);
    assert.equal(r.commitValue, "183.28");
  });

  it("without the site's rounding nothing changes: the result goes in unrounded", () => {
    const r = calc("10.05", "*0.5", "rate", null);
    assert.equal(r.commitValue, "5.025");
    assert.equal(r.remainder, undefined);
  });
});

describe("the taxes Add box (a sum the tape never saw)", () => {
  it("rounds the site's way and says what it dropped", () => {
    assert.deepEqual(moneyOrSum("5.025", CENTS), { amount: 5.03, remainder: "Rounds to 5.03 — remainder −5/1000" });
    assert.deepEqual(moneyOrSum("12.50", CENTS), { amount: 12.5, remainder: "" });
    assert.equal(moneyOrSum("169.00*1.0845", CENTS).amount, 183.28);
    assert.deepEqual(moneyOrSum("5*", CENTS), { amount: null, remainder: "" });
  });
});

describe("wiring", () => {
  const main = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  const preload = fs.readFileSync(new URL("../electron/doc-form-preload.cjs", import.meta.url), "utf8");
  const adapter = fs.readFileSync(new URL("../src/bill-doc-api-adapter.js", import.meta.url), "utf8");
  it("main reads the site's rounding from the ERPNext page's boot, the pages can ask for it", () => {
    assert.match(main, /ipcMain\.handle\("calc-site-rounding"/);
    assert.match(main, /frappe\.boot && frappe\.boot\.sysdefaults/);
    assert.match(preload, /getSiteRounding: \(\) => ipcRenderer\.invoke\("calc-site-rounding"\)/);
    assert.match(adapter, /getSiteRounding:/);
  });
  for (const page of ["doc-form-page.js", "bill-form-page.js"]) {
    it(`${page}: the tape and the Add box use the site's rounding and the clerk's convention`, () => {
      const src = fs.readFileSync(new URL(`../src/${page}`, import.meta.url), "utf8");
      assert.match(src, /getSiteRounding: \(\) => \{\s*loadSiteRounding\(\);\s*return siteRounding;/);
      assert.match(src, /if \(r && r\.known\) siteRounding = r;/); // a default answer is asked for again
      assert.match(src, /moneyOrSum\(typed, moneyRounding\(\)\)/);
      assert.match(src, /convention: calcUi\.getConvention\(\)/);
      assert.doesNotMatch(src, /parseMoneyOrSum\(/);
    });
  }
});

describe("↩ resume a past calculation before rounding (5zorro 2026-10-25)", () => {
  it("`=` on a box at rest opens the tape on its number; Enter at rest stays the page's Enter", () => {
    const st = createFieldCalcState("3.33", undefined, { kind: "rate", rounding: CENTS });
    const open = reduceFieldCalc(st, { key: "=", fieldValue: "3.33" });
    assert.equal(open.action, "prevent");
    assert.equal(open.state.mode, "active");
    assert.equal(commitFieldCalc(open.state).commitValue, "3.33");
    assert.equal(reduceFieldCalc(st, { key: "Enter", fieldValue: "3.33" }).action, "none");
  });

  it("the commit carries the unrounded result, and the history keeps it", () => {
    const r = calc("10", "/3", "rate", CENTS);
    assert.equal(r.commitValue, "3.33");
    assert.equal(r.exact, "3.3333333333");
    const entry = makeCalcHistoryEntry({ footing: r.expression, total: r.commitValue, exact: r.exact });
    assert.equal(entry.exact, "3.3333333333");
    assert.equal(makeCalcHistoryEntry({ footing: "x", total: "1", exact: "abc" }).exact, undefined);
  });

  it("↩ after `+` carries on from 3.3333333333, not 3.33; rounding happens once, at the end", () => {
    let st = createFieldCalcState("3.33", undefined, { kind: "rate", rounding: CENTS });
    st = reduceFieldCalc(st, { key: "+", fieldValue: "3.33" }).state;
    const resumed = resumeFieldCalc(st, "3.3333333333");
    assert.equal(resumed.action, "prevent");
    assert.match(resumed.expression, /3\.3333333333/);
    st = resumed.state;
    for (const k of "6.6666666667") st = reduceFieldCalc(st, { key: k, fieldValue: "" }).state;
    const done = commitFieldCalc(st);
    assert.equal(done.commitValue, "10"); // 3.33 + 6.67 would also be 10.00, so check the exact sum
    assert.equal(done.exact, "10");
    assert.equal(done.remainder, undefined);
  });

  it("↩ after `=` replaces the box's number; Enter puts in the resumed result, rounded once", () => {
    let st = createFieldCalcState("3.33", undefined, { kind: "rate", rounding: CENTS });
    st = reduceFieldCalc(st, { key: "=", fieldValue: "3.33" }).state;
    st = resumeFieldCalc(st, "3.3333333333").state;
    for (const k of "*3") st = reduceFieldCalc(st, { key: k, fieldValue: "" }).state;
    const done = commitFieldCalc(st);
    assert.equal(done.commitValue, "10"); // 3.33 × 3 would be 9.99
  });

  it("nothing to resume when no calculation is running", () => {
    const st = createFieldCalcState("3.33", undefined, { kind: "rate", rounding: CENTS });
    assert.equal(resumeFieldCalc(st, "3.3333333333").action, "none");
  });
});
