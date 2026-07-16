import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { roundToNickel } from "../src/money.js";

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
