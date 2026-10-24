import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rowId, residualRows, dogfoodTags, checkTable } from "../src/dogfood-check.js";

const plan = `# Plan
## Dogfood residuals

Intro.

| Fix | What to try | Expect |
|-----|-------------|--------|
| R9 (batch method change) | Method… | Chips move |
| R6b-1 / R6b-2 | A Bill | Saves |
| Warm lists 1 (HANDOFF § Warm pick lists) | Open | Lists |
| D1 | Dropdown | Closed |

### Dogfood check and setup

| Not | a | row |
`;

describe("dogfood check (plan 10-19 § Dogfood check and setup)", () => {
  it("a row's id is its first cell without the bracket", () => {
    assert.equal(rowId("R9 (batch method change)"), "R9");
    assert.equal(rowId("R6b-1 / R6b-2"), "R6b-1 / R6b-2");
  });
  it("reads only the residuals table", () => {
    assert.deepEqual(residualRows(plan).map((r) => r.id), ["R9", "R6b-1 / R6b-2", "Warm lists 1", "D1"]);
    assert.equal(residualRows("no table").length, 0);
  });
  it("a probe names its rows with @dogfood, split by ;", () => {
    assert.deepEqual(dogfoodTags("/**\n * @dogfood R6b-1 / R6b-2; R6b-4\n * text */"), ["R6b-1 / R6b-2", "R6b-4"]);
    assert.deepEqual(dogfoodTags("/** no tag */"), []);
  });
  it("the table: pass, FAIL with the probe, yours, and a tag that names no row", () => {
    const t = checkTable(residualRows(plan), { a: ["R9"], b: ["R6b-1 / R6b-2"], c: ["Warm lists 1", "Gone"] }, { a: "pass", b: "fail" });
    assert.deepEqual(t.lines.slice(2), [
      "| R9 | a | pass |",
      "| R6b-1 / R6b-2 | b | **FAIL** (b) |",
      "| Warm lists 1 | c | not run |",
      "| D1 | — | yours |",
    ]);
    assert.deepEqual(t.counts, { pass: 1, fail: 1, yours: 1, notRun: 1 });
    assert.deepEqual(t.orphanTags, ["Gone"]);
  });
});
