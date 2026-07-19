import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  roundToNickel,
  parseMoney,
  formatGroupedNumber,
  formatUsdAmount,
  splitUsdDisplay,
  formatUsdAmountHtml,
} from "../src/money.js";

describe("roundToNickel", () => {
  it("rounds to nearest 5 cents", () => {
    assert.equal(roundToNickel(1.0), 1.0);
    assert.equal(roundToNickel(1.02), 1.0);
    assert.equal(roundToNickel(1.03), 1.05);
    assert.equal(roundToNickel(1.07), 1.05);
    assert.equal(roundToNickel(1.08), 1.1);
  });

  it("rejects non-finite input", () => {
    assert.throws(() => roundToNickel(NaN), TypeError);
    assert.throws(() => roundToNickel("1.00"), TypeError);
  });
});

describe("parseMoney", () => {
  it("parses $, commas, blanks", () => {
    assert.equal(parseMoney("$1,234.50"), 1234.5);
    assert.equal(parseMoney(""), null);
    assert.equal(parseMoney(12), 12);
  });
});

describe("formatGroupedNumber (Cost #,###.##)", () => {
  it("groups thousands with two decimals", () => {
    assert.equal(formatGroupedNumber(1234.5), "1,234.50");
    assert.equal(formatGroupedNumber(10), "10.00");
    assert.equal(formatGroupedNumber(""), "");
  });
});

describe("formatUsdAmount / splitUsdDisplay (Amount $#,###.__)", () => {
  it("formats USD", () => {
    assert.match(formatUsdAmount(1234.5), /\$1,234\.50/);
  });

  it("splits dollars and cents for underline", () => {
    const p = splitUsdDisplay(1234.5);
    assert.equal(p.empty, false);
    if (!p.empty) {
      assert.equal(p.prefix, "$");
      assert.equal(p.intPart, "1,234");
      assert.equal(p.cents, "50");
    }
  });

  it("builds html with money-cents span", () => {
    const html = formatUsdAmountHtml(12.5);
    assert.match(html, /\$12\.<span class="money-cents">50<\/span>/);
  });
});
