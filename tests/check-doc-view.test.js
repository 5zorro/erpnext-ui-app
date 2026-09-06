import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildCheckDocViewModel } from "../src/check-doc-view.js";

const bills = [
  { installmentKey: "PINV-001", invoice: "PINV-001", dueDate: "2026-09-10", outstanding: 400 },
  { installmentKey: "PINV-002#1", invoice: "PINV-002", dueDate: "2026-09-12", outstanding: 150 },
];

const group = {
  supplier: "Acme Supply",
  bills: ["PINV-001", "PINV-002#1"],
  payOn: "2026-09-09",
  totalAmount: 550,
  feesSaved: 0.83,
  floatCost: 0.14,
  netBenefit: 0.69,
  rationale: "Batched to save one postage/check fee.",
  reason: "batch",
};

describe("buildCheckDocViewModel", () => {
  it("passes through the group's header fields", () => {
    const vm = buildCheckDocViewModel(group, bills);
    assert.equal(vm.payTo, "Acme Supply");
    assert.equal(vm.amount, 550);
    assert.equal(vm.payOn, "2026-09-09");
    assert.equal(vm.memo, "Batched to save one postage/check fee.");
  });

  it("maps stub rows in group.bills order, not bills-array order", () => {
    const reordered = [bills[1], bills[0]];
    const vm = buildCheckDocViewModel(group, reordered);
    assert.deepEqual(
      vm.stubRows.map((r) => r.invoice),
      ["PINV-001", "PINV-002"],
    );
  });

  it("stub row amounts come from the matching bill, not a recomputed split", () => {
    const vm = buildCheckDocViewModel(group, bills);
    assert.deepEqual(
      vm.stubRows.map((r) => r.amount),
      [400, 150],
    );
    // Header amount is the group's own total, never re-derived from the stub rows --
    // a single source of truth even if rounding ever drifted between the two.
    assert.equal(vm.amount, group.totalAmount);
  });

  it("a pay-alone group (single bill) still produces one stub row", () => {
    const single = { ...group, bills: ["PINV-001"], totalAmount: 400, reason: "pay-alone" };
    const vm = buildCheckDocViewModel(single, bills);
    assert.equal(vm.stubRows.length, 1);
    assert.equal(vm.stubRows[0].invoice, "PINV-001");
  });

  it("an installmentKey missing from the bills list falls back instead of throwing", () => {
    const vm = buildCheckDocViewModel({ ...group, bills: ["GHOST-1"] }, bills);
    assert.deepEqual(vm.stubRows, [{ invoice: "GHOST-1", dueDate: "", amount: 0 }]);
  });

  it("empty group.bills yields an empty stub list, not an error", () => {
    const vm = buildCheckDocViewModel({ ...group, bills: [] }, bills);
    assert.deepEqual(vm.stubRows, []);
  });

  it("junk input never throws", () => {
    assert.doesNotThrow(() => buildCheckDocViewModel(null, null));
    assert.doesNotThrow(() => buildCheckDocViewModel(undefined, undefined));
    assert.doesNotThrow(() => buildCheckDocViewModel({}, []));
  });

  it("null/undefined group falls back to empty strings and zero amount", () => {
    const vm = buildCheckDocViewModel(null, bills);
    assert.deepEqual(vm, { payTo: "", amount: 0, payOn: "", memo: "", stubRows: [] });
  });

  it("does not mutate its inputs", () => {
    const groupCopy = JSON.parse(JSON.stringify(group));
    const billsCopy = JSON.parse(JSON.stringify(bills));
    buildCheckDocViewModel(group, bills);
    assert.deepEqual(group, groupCopy);
    assert.deepEqual(bills, billsCopy);
  });
});
