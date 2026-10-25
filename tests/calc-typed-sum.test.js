import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateTypedSum } from "../src/calc/field-calc.js";
import { moneyOrSum } from "../src/money.js";

const parseMoneyOrSum = (v) => moneyOrSum(v).amount;

// 5zorro 2026-10-11: `169.00*1.0845` typed into the taxes Amount box, then Add did nothing.
describe("evaluateTypedSum", () => {
  it("works out a typed sum with the calculator's own left-to-right math", () => {
    assert.equal(evaluateTypedSum("169.00*1.0845"), 183.2805);
    assert.equal(evaluateTypedSum("100+25*2"), 250, "left to right, like the calculator");
    assert.equal(evaluateTypedSum(" $1,000 / 4 "), 250);
    assert.equal(evaluateTypedSum("-3+2"), -1);
  });
  it("is not a sum: a plain number, words, an unfinished sum", () => {
    for (const t of ["12.5", "", null, "abc", "5*", "2+x", "1++"]) assert.equal(evaluateTypedSum(t), null, String(t));
  });
});

describe("moneyOrSum — the amount (the taxes Add box)", () => {
  it("a sum → cents; a number → itself; neither → null", () => {
    assert.equal(parseMoneyOrSum("169.00*1.0845"), 183.28);
    assert.equal(parseMoneyOrSum("1,234.50"), 1234.5);
    assert.equal(parseMoneyOrSum(""), null);
    assert.equal(parseMoneyOrSum("5*"), null);
  });
});

