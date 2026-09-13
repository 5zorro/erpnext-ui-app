import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VENDOR_FLOW_LANES,
  VENDOR_FLOW_BRIDGES,
  vendorFlowTileIds,
  vendorFlowStepIds,
} from "../src/vendor-process-flow.js";
import { HOME_GROUPS, flattenHomeTiles } from "../src/home-tiles.js";

describe("VENDOR_FLOW_LANES", () => {
  it("has a sequential Daily lane and a parallel Weekly/monthly lane", () => {
    const daily = VENDOR_FLOW_LANES.find((l) => l.id === "daily");
    const weekly = VENDOR_FLOW_LANES.find((l) => l.id === "weekly");
    assert.ok(daily);
    assert.ok(weekly);
    assert.equal(daily.sequential, true);
    assert.equal(weekly.sequential, false);
  });

  it("every referenced tile id exists in the Vendors home group (SSoT: home-tiles.js)", () => {
    const vendorsGroup = HOME_GROUPS.left.find((g) => g.id === "vendors");
    assert.ok(vendorsGroup, "expected a vendors group in HOME_GROUPS.left");
    const vendorIds = new Set(vendorsGroup.tiles.map((t) => t.id));
    for (const id of vendorFlowTileIds()) {
      assert.ok(vendorIds.has(id), `flow references unknown vendors tile id: ${id}`);
    }
  });

  it("every vendors tile with a stated home group appears somewhere in the flow", () => {
    // Vendor Center research is included; every id in the flow round-trips through flattenHomeTiles too.
    const allIds = new Set(flattenHomeTiles().map((t) => t.id));
    for (const id of vendorFlowTileIds()) assert.ok(allIds.has(id), id);
  });

  it("every lane has a short rail label no longer than its full label", () => {
    for (const lane of VENDOR_FLOW_LANES) {
      assert.ok(lane.shortLabel && lane.shortLabel.trim(), lane.id);
      assert.ok(lane.shortLabel.length <= lane.label.length, `${lane.id}: shortLabel longer than label`);
    }
  });

  it("steps are unique per lane and non-empty", () => {
    for (const lane of VENDOR_FLOW_LANES) {
      const steps = lane.steps.map((s) => s.step);
      assert.equal(new Set(steps).size, steps.length, `duplicate step in lane ${lane.id}`);
      for (const step of lane.steps) assert.ok(step.tileIds.length > 0, `${lane.id}/${step.step}`);
    }
  });

  it("step 1 (Request) holds the two parallel sources (Purchase Orders + Material Request)", () => {
    const daily = VENDOR_FLOW_LANES.find((l) => l.id === "daily");
    const step1 = daily.steps.find((s) => s.step === "1");
    assert.deepEqual(step1.tileIds, ["po-new", "mr-new"]);
  });
});

describe("VENDOR_FLOW_BRIDGES", () => {
  it("every bridge points at a step that actually exists", () => {
    const stepIds = vendorFlowStepIds();
    for (const b of VENDOR_FLOW_BRIDGES) {
      assert.ok(stepIds.has(b.fromStep), `bridge references unknown step: ${b.fromStep}`);
      assert.ok(typeof b.label === "string" && b.label.trim(), "bridge needs a label");
    }
  });

  it("both weekly tasks (Pay Bills, Vendor Center) get their own bridge from the same daily step", () => {
    assert.equal(VENDOR_FLOW_BRIDGES.length, 2);
    assert.ok(VENDOR_FLOW_BRIDGES.every((b) => b.fromStep === "3"));
  });
});
