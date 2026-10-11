import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { peekReturnTarget, peekReturnPlan } from "../src/peek-return-focus.js";

const cell = (row, field) => ({ dataset: { row: String(row), field } });

describe("peekReturnTarget", () => {
  it("remembers a line cell", () => {
    assert.deepEqual(peekReturnTarget(cell(2, "item_code"), "Item"), { doctype: "Item", row: 2, field: "item_code" });
  });
  it("remembers a header field (no row) — DF-03 create Customer", () => {
    assert.deepEqual(peekReturnTarget({ dataset: { field: "customer" } }, "Customer"), { doctype: "Customer", row: null, field: "customer" });
  });
  it("ignores a box with no field, a bad row, and missing input", () => {
    assert.equal(peekReturnTarget({ dataset: {} }, "Customer"), null);
    assert.equal(peekReturnTarget({ dataset: { row: "-1", field: "item_code" } }, "Item"), null);
    assert.equal(peekReturnTarget(null, "Item"), null);
  });
});

describe("peekReturnPlan (DF-02: Esc back from create Item)", () => {
  const t = peekReturnTarget(cell(1, "item_code"), "Item");
  it("saved Item → fill the cell with its code, decoded", () => {
    assert.deepEqual(peekReturnPlan(t, "/app/item/SAMPLE-SKU-04"), { row: 1, field: "item_code", fill: "SAMPLE-SKU-04" });
    assert.equal(peekReturnPlan(t, "/desk/item/WIDGET%20A").fill, "WIDGET A");
  });
  it("abandoned (still a new draft) → focus only", () => {
    assert.deepEqual(peekReturnPlan(t, "/app/item/new-item-gtoqnlysca"), { row: 1, field: "item_code", fill: "" });
    assert.equal(peekReturnPlan(t, "/app/item/new").fill, "");
  });
  it("ended on another doctype → focus only", () => {
    assert.equal(peekReturnPlan(t, "/app/item-group/Products").fill, "");
    assert.equal(peekReturnPlan(t, "").fill, "");
  });
  it("nothing remembered → nothing to do", () => {
    assert.equal(peekReturnPlan(null, "/app/item/X"), null);
  });
});

describe("peekReturnPlan (DF-03: Esc back from create Customer)", () => {
  const t = peekReturnTarget({ dataset: { field: "customer" } }, "Customer");
  it("saved Customer → fill the header field", () => {
    assert.deepEqual(peekReturnPlan(t, "/app/customer/Acme%20Corp"), { row: null, field: "customer", fill: "Acme Corp" });
  });
  it("abandoned → focus only", () => {
    assert.equal(peekReturnPlan(t, "/app/customer/new-customer-abcdefghij").fill, "");
  });
});
