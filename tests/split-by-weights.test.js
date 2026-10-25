import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitUnitsByWeights } from "../src/split-by-weights.js";

describe("splitUnitsByWeights — one rule for cents and quantities", () => {
  it("leftover units go to the shares nearest their next unit, ties to the earlier", () => {
    assert.deepEqual(splitUnitsByWeights(67, Array(10).fill(1)), [7, 7, 7, 7, 7, 7, 7, 6, 6, 6]);
    // 5zorro's 0.666 × 10 + 0.007, in thousandths.
    assert.deepEqual(splitUnitsByWeights(6667, Array(10).fill(1)), [667, 667, 667, 667, 667, 667, 667, 666, 666, 666]);
  });
  it("weighted: by need", () => {
    assert.deepEqual(splitUnitsByWeights(8, [6, 2]), [6, 2]);
    assert.deepEqual(splitUnitsByWeights(5, [6, 2]), [4, 1]); // 3.75 → 4, 1.25 → 1
    assert.deepEqual(splitUnitsByWeights(5000, [6, 2]), [3750, 1250]);
  });
  it("largest remainder wins over order", () => {
    assert.deepEqual(splitUnitsByWeights(10, [1, 2]), [3, 7]); // 3.33 / 6.67 → the 0.67 gets the unit
  });
  it("zero, negative or missing weights get nothing; nothing to split gives zeros", () => {
    assert.deepEqual(splitUnitsByWeights(5, [0, 1, -3, "x"]), [0, 5, 0, 0]);
    assert.deepEqual(splitUnitsByWeights(5, [0, 0]), [0, 0]);
    assert.deepEqual(splitUnitsByWeights(0, [1, 1]), [0, 0]);
  });
  it("always sums to the total", () => {
    for (const [t, w] of [[1001, [3, 3, 3]], [29, [0.1, 0.2, 0.7]], [100, [1, 1, 1, 1, 1, 1, 1]]]) {
      assert.equal(splitUnitsByWeights(t, w).reduce((a, b) => a + b, 0), t);
    }
  });
});
