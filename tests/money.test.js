import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  roundToNickel,
  parseMoney,
  formatGroupedNumber,
  formatUsdAmount,
  splitUsdDisplay,
  formatUsdAmountHtml,
  formatSignedUsdHtml,
  moneyTextHtml,
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

  it("formatSignedUsdHtml underlines cents on deltas", () => {
    const html = formatSignedUsdHtml("+$10.00");
    assert.match(html, /\+.*money-cents.*00/);
  });
});

// Pay Outstanding's rationale and audit sentences carry amounts inline (5zorro 2026-09-12: match the
// Bill Doc skin's $ format everywhere on the page).
describe("moneyTextHtml (amounts inside a sentence)", () => {
  it("underlines the cents of every amount in the text", () => {
    const html = moneyTextHtml("51 bills batched: $2,500.00 fee saved vs $0.37 float cost = $2,499.63 net");
    assert.equal(
      html,
      '51 bills batched: $2,500.<span class="money-cents">00</span> fee saved vs ' +
        '$0.<span class="money-cents">37</span> float cost = $2,499.<span class="money-cents">63</span> net',
    );
  });

  it("matches formatUsdAmountHtml for a bare amount, including a negative one", () => {
    assert.equal(moneyTextHtml(formatUsdAmount(1234.5)), formatUsdAmountHtml(1234.5));
    assert.equal(moneyTextHtml("-$5.00"), '-$5.<span class="money-cents">00</span>');
  });

  it("leaves numbers that are not dollar amounts alone", () => {
    const text = "$300.00 × 9% APR × 3/365, paid 2026-10-26";
    assert.equal(moneyTextHtml(text), '$300.<span class="money-cents">00</span> × 9% APR × 3/365, paid 2026-10-26');
    assert.equal(moneyTextHtml("$1.234 is not cents"), "$1.234 is not cents");
  });

  it("escapes everything else, so it is safe for innerHTML", () => {
    assert.equal(
      moneyTextHtml('<img src=x onerror="a()"> $5.00'),
      '&lt;img src=x onerror=&quot;a()&quot;&gt; $5.<span class="money-cents">00</span>',
    );
  });

  it("returns empty for nothing", () => {
    assert.equal(moneyTextHtml(null), "");
    assert.equal(moneyTextHtml(undefined), "");
    assert.equal(moneyTextHtml(""), "");
  });
});
