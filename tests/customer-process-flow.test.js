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

  it("Estimate sits above Sales Order and leads into it (skippable), then Invoice, then Payment", () => {
    const daily = CUSTOMER_FLOW_LANES.find((l) => l.id === "daily");
    assert.equal(daily.sequential, true);
    const [first, second, third] = daily.steps;
    assert.deepEqual(first.tileIds, ["estimate-new", "so-new"]);
    assert.equal(first.join, "then");
    assert.deepEqual(first.badges, ["1", "2"]);
    assert.match(first.caption, /optional/);
    assert.deepEqual(second.tileIds, ["invoice-new"]);
    assert.deepEqual(third.tileIds, ["receive-pay"]);
  });

  it("one lane: Customer Center follows a divider, and there is nothing to bridge", () => {
    assert.equal(CUSTOMER_FLOW_LANES.length, 1);
    const last = CUSTOMER_FLOW_LANES[0].steps.at(-1);
    assert.deepEqual(last.tileIds, ["customers"]);
    assert.equal(last.detached, true);
    assert.equal(CUSTOMER_FLOW_BRIDGES.length, 0);
  });
});
