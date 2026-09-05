import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyHeaderSortClick,
  compareBySortSpecs,
  normalizeSortSpecs,
  sortHeaderArrow,
  sortHeaderState,
} from "../src/item-sort-specs.js";

describe("item-sort-specs", () => {
  it("plain click replaces stack; second click on same toggles asc", () => {
    let specs = applyHeaderSortClick([], "amount");
    assert.deepEqual(specs, [{ key: "amount", asc: true }]);
    specs = applyHeaderSortClick(specs, "amount");
    assert.deepEqual(specs, [{ key: "amount", asc: false }]);
    specs = applyHeaderSortClick(specs, "qty");
    assert.deepEqual(specs, [{ key: "qty", asc: true }]);
  });

  it("Ctrl+click adds secondary then tertiary; toggle on re-click", () => {
    let specs = applyHeaderSortClick([], "amount");
    specs = applyHeaderSortClick(specs, "customer", { ctrlKey: true });
    specs = applyHeaderSortClick(specs, "item_code", { ctrlKey: true });
    assert.deepEqual(specs, [
      { key: "amount", asc: true },
      { key: "customer", asc: true },
      { key: "item_code", asc: true },
    ]);
    specs = applyHeaderSortClick(specs, "customer", { ctrlKey: true });
    assert.equal(specs[1].asc, false);
  });

  it("tie-break uses unique id after equal primary keys", () => {
    const rows = [
      { amount: 2, lineNo: 3 },
      { amount: 2, lineNo: 1 },
      { amount: 2, lineNo: 2 },
    ];
    rows.sort((a, b) =>
      compareBySortSpecs(
        a,
        b,
        [{ key: "amount", asc: true }],
        (r, k) => r[k],
        (r) => r.lineNo,
      ),
    );
    assert.deepEqual(
      rows.map((r) => r.lineNo),
      [1, 2, 3],
    );
  });

  it("sortHeaderArrow shows rank when multi-sort", () => {
    const specs = normalizeSortSpecs([
      { key: "amount", asc: false },
      { key: "qty", asc: true },
    ]);
    assert.equal(sortHeaderArrow(specs, "amount"), " ▼1");
    assert.equal(sortHeaderArrow(specs, "qty"), " ▲2");
    assert.equal(sortHeaderState(specs, "lineNo").active, false);
  });
});
