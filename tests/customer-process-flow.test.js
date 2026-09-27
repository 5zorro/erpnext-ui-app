import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CUSTOMER_FLOW_LANES, CUSTOMER_FLOW_BRIDGES, customerFlowTileIds } from "../src/customer-process-flow.js";
import { HOME_GROUPS } from "../src/home-tiles.js";

describe("CUSTOMER_FLOW_LANES (Home Customers swimlane)", () => {
  it("every tile in the flow is a Customers tile, and every Customers tile is in the flow", () => {
    const group = HOME_GROUPS.left.find((g) => g.id === "customers");
    const ids = group.tiles.map((t) => t.id);
    assert.deepEqual([...customerFlowTileIds()].sort(), [...ids].sort());
  });

  it("mirrors Vendors: Estimate → Sales Order → Invoice stacked over Payment (fans out)", () => {
    const daily = CUSTOMER_FLOW_LANES.find((l) => l.id === "daily");
    assert.equal(daily.sequential, true);
    const [estimate, order, tail] = daily.steps;
    assert.deepEqual(estimate.tileIds, ["estimate-new"]);
    assert.match(estimate.caption, /optional/);
    assert.deepEqual(order.tileIds, ["so-new"]);
    assert.deepEqual(tail.tileIds, ["invoice-new", "receive-pay"]);
    assert.equal(tail.join, "then");
    assert.deepEqual(tail.badges, ["3", "4"]);
  });

  it("Customer Center sits in its own As-needed lane, not in the daily chain", () => {
    const daily = CUSTOMER_FLOW_LANES.find((l) => l.id === "daily");
    const weekly = CUSTOMER_FLOW_LANES.find((l) => l.id === "weekly");
    assert.ok(!daily.steps.some((st) => st.tileIds.includes("customers")));
    assert.deepEqual(weekly.steps.map((st) => st.tileIds), [["customers"]]);
    assert.equal(CUSTOMER_FLOW_BRIDGES.length, 0);
  });
});
