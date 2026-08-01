import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIALECT_EXCEL,
  DIALECT_STANDALONE,
  applyOp,
  evaluateChord,
  formatCalcResult,
  createCalcSession,
  seedExcelWithValue,
  feedCalcKey,
  calcExpression,
  parseCalcNumber,
} from "../src/calc/calc-engine.js";

describe("applyOp / formatCalcResult", () => {
  it("applies four operators", () => {
    assert.equal(applyOp(10, "+", 5), 15);
    assert.equal(applyOp(10, "-", 5), 5);
    assert.equal(applyOp(10, "*", 1.1), 11);
    assert.equal(applyOp(10, "/", 4), 2.5);
    assert.ok(Number.isNaN(applyOp(1, "/", 0)));
  });

  it("formats without trailing float noise", () => {
    assert.equal(formatCalcResult(11), "11");
    assert.equal(formatCalcResult(12.5), "12.5");
    assert.equal(formatCalcResult(0), "0");
  });
});

describe("Excel dialect chords (infix, left-to-right)", () => {
  it("100+25= → 125", () => {
    const r = evaluateChord("100+25=", DIALECT_EXCEL);
    assert.equal(r.ok, true);
    assert.equal(r.result, 125);
    assert.equal(r.formatted, "125");
  });

  it("10*1.1= → 11", () => {
    const r = evaluateChord("10*1.1=", DIALECT_EXCEL);
    assert.equal(r.ok, true);
    assert.equal(r.result, 11);
  });

  it("10+5*2= is left-to-right 30 (not spreadsheet precedence 20)", () => {
    const r = evaluateChord("10+5*2=", DIALECT_EXCEL);
    assert.equal(r.ok, true);
    assert.equal(r.result, 30);
  });

  it("1-2= → -1", () => {
    const r = evaluateChord("1-2=", DIALECT_EXCEL);
    assert.equal(r.ok, true);
    assert.equal(r.result, -1);
  });

  it("seedExcelWithValue then continue matches field JIT start", () => {
    let s = createCalcSession(DIALECT_EXCEL);
    s = seedExcelWithValue(s, 100, "+");
    assert.equal(calcExpression(s), "100 +");
    let out = feedCalcKey(s, "2");
    s = out.session;
    out = feedCalcKey(s, "5");
    s = out.session;
    out = feedCalcKey(s, "=");
    assert.equal(out.done, true);
    assert.equal(out.result, 125);
  });
});

describe("Standalone dialect chords (leading operator)", () => {
  it("+1-2= → -1 (OI-018 standalone shape)", () => {
    const r = evaluateChord("+1-2=", DIALECT_STANDALONE);
    assert.equal(r.ok, true);
    assert.equal(r.result, -1);
  });

  it("+100+25= → 125", () => {
    const r = evaluateChord("+100+25=", DIALECT_STANDALONE);
    assert.equal(r.ok, true);
    assert.equal(r.result, 125);
  });

  it("+10*1.1= → 11", () => {
    const r = evaluateChord("+10*1.1=", DIALECT_STANDALONE);
    assert.equal(r.ok, true);
    assert.equal(r.result, 11);
  });

  it("trailing op then = uses 0 operand (+1+2-= → 3)", () => {
    const r = evaluateChord("+1+2-=", DIALECT_STANDALONE);
    assert.equal(r.ok, true);
    assert.equal(r.result, 3);
  });
});

describe("parseCalcNumber", () => {
  it("strips commas", () => {
    assert.equal(parseCalcNumber("1,234.5"), 1234.5);
    assert.equal(parseCalcNumber(""), null);
    assert.equal(parseCalcNumber("-"), null);
  });
});
