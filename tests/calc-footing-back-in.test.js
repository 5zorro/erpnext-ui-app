import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcFootingLines,
  calcFootingText,
  alignDecimalFooting,
  evaluateChord,
  createCalcSession,
  seedExcelWithValue,
  feedCalcKey,
  formatCalcDisplay,
  decimalsForCalcField,
  DIALECT_EXCEL,
} from "../src/calc/calc-engine.js";
import { rateFromBackedInAmount } from "../src/calc/back-in-amount.js";
import { reduceFieldCalc, createFieldCalcState } from "../src/calc/field-calc.js";

describe("calcFootingLines (vertical tape)", () => {
  it("formats 10+4110+300 as stacked rows", () => {
    const r = evaluateChord("10+4110+300=", DIALECT_EXCEL);
    assert.equal(r.ok, true);
    // After =, entry cleared; parts include final operand
    const lines = calcFootingLines(r.session);
    assert.deepEqual(lines, ["10+", "4110+", "300"]);
    assert.equal(calcFootingText(r.session), "  10+\n4110+\n 300");
  });

  it("field reducer expression is newline footing while typing", () => {
    let st = createFieldCalcState("1");
    let out = reduceFieldCalc(st, { key: "+", fieldValue: "1" });
    st = out.state;
    assert.equal(out.expression, "1+");
    out = reduceFieldCalc(st, { key: "2", fieldValue: "" });
    st = out.state;
    out = reduceFieldCalc(st, { key: "+", fieldValue: "" });
    st = out.state;
    out = reduceFieldCalc(st, { key: "3", fieldValue: "" });
    assert.equal(out.expression, "1+\n2+\n3");
  });

  it("money field pads to 2 decimals and aligns on the point", () => {
    let st = createFieldCalcState("104", undefined, { kind: "amount" });
    let out = reduceFieldCalc(st, { key: "+", fieldValue: "104" });
    st = out.state;
    assert.equal(out.expression, "104.00+");
    for (const ch of "206.5") {
      out = reduceFieldCalc(st, { key: ch, fieldValue: "" });
      st = out.state;
    }
    assert.equal(out.expression, "104.00+\n206.50");
    assert.equal(alignDecimalFooting(["104.00+", "206.50"]), "104.00+\n206.50");
  });
});

describe("formatCalcDisplay / decimalsForCalcField", () => {
  it("amount/rate use 2 places on-page", () => {
    assert.equal(decimalsForCalcField("amount"), 2);
    assert.equal(decimalsForCalcField("rate"), 2);
    assert.equal(formatCalcDisplay(206.5, 2), "206.50");
    assert.equal(formatCalcDisplay(104, 2), "104.00");
  });

  it("off-page (null decimals) keeps natural precision", () => {
    assert.equal(formatCalcDisplay(206.5, null), "206.5");
    let s = createCalcSession(DIALECT_EXCEL);
    s = seedExcelWithValue(s, 104, "+");
    let out = feedCalcKey(s, "2");
    s = out.session;
    out = feedCalcKey(s, "0");
    s = out.session;
    out = feedCalcKey(s, "6");
    s = out.session;
    out = feedCalcKey(s, ".");
    s = out.session;
    out = feedCalcKey(s, "5");
    s = out.session;
    assert.deepEqual(calcFootingLines(s), ["104+", "206.5"]);
  });
});

describe("rateFromBackedInAmount", () => {
  it("150 amount / 150 qty → rate 1", () => {
    const r = rateFromBackedInAmount(150, 150);
    assert.equal(r.ok, true);
    assert.equal(r.rate, 1);
    assert.equal(r.rateText, "1");
  });

  it("rejects qty 0", () => {
    const r = rateFromBackedInAmount(150, 0);
    assert.equal(r.ok, false);
  });
});
