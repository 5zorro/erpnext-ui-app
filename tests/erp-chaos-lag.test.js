import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readChaosLagConfig,
  shouldChaosLag,
  maybeChaosLag,
  chaosSleep,
  addLagInterval,
} from "../src/erp-chaos-lag.js";

describe("erp-chaos-lag", () => {
  it("reads lag ms and pct from env", () => {
    assert.deepEqual(readChaosLagConfig({ ERP_CHAOS_LAG_MS: "200", ERP_CHAOS_LAG_PCT: "150" }), {
      ms: 200,
      pct: 100,
    });
    assert.deepEqual(readChaosLagConfig({}), { ms: 0, pct: 0 });
  });

  it("shouldChaosLag respects channel weights with fixed random", () => {
    assert.equal(shouldChaosLag("bridge", 50, () => 0.4), true);
    assert.equal(shouldChaosLag("bridge", 50, () => 0.6), false);
    assert.equal(shouldChaosLag("listSources", 50, () => 0.49), true);
    assert.equal(shouldChaosLag("erpEval", 50, () => 0.55), false);
  });

  it("maybeChaosLag sleeps variable duration and returns actual ms", async () => {
    // durationRandom=0.9 → floor(0.9 * 2 * 30) = 54ms
    const t0 = Date.now();
    const actual = await maybeChaosLag(
      "bridge",
      { ERP_CHAOS_LAG_MS: "30", ERP_CHAOS_LAG_PCT: "100" },
      () => 0,   // select-random: triggers lag
      () => 0.9, // duration-random: 90% of 2×ms
    );
    assert.equal(actual, 54);
    assert.ok(Date.now() - t0 >= 50);
  });

  it("maybeChaosLag returns 0 when not selected", async () => {
    // pct=50: 0.99*100=99 >= 50 → skip
    const actual = await maybeChaosLag(
      "bridge",
      { ERP_CHAOS_LAG_MS: "30", ERP_CHAOS_LAG_PCT: "50" },
      () => 0.99,
    );
    assert.equal(actual, 0);
  });

  it("maybeChaosLag skips billEnrich channel", async () => {
    const t0 = Date.now();
    const actual = await maybeChaosLag("billEnrich", { ERP_CHAOS_LAG_MS: "500", ERP_CHAOS_LAG_PCT: "100" }, () => 0, () => 0.9);
    assert.equal(actual, 0);
    assert.ok(Date.now() - t0 < 20);
  });

  it("chaosSleep no-ops for zero", async () => {
    const t0 = Date.now();
    await chaosSleep(0);
    assert.ok(Date.now() - t0 < 20);
  });
});

// Plan 2026-10-26 step 2: chaos lag as clock time, for `npm run test:times`.
describe("addLagInterval: chaos lag as clock time", () => {
  const run = (pairs) => pairs.reduce((c, [s, e]) => addLagInterval(c, s, e), { intervals: [], total: 0 });

  it("delays on parallel calls count once (the 236 s of delays in an 87 s probe)", () => {
    assert.equal(run([[0, 1000], [200, 1200], [500, 900]]).total, 1200);
  });

  it("delays one after another add up; a gap between them is not lag", () => {
    assert.equal(run([[0, 1000], [3000, 4000]]).total, 2000);
    assert.equal(run([[0, 3000], [4000, 6000], [2000, 5000]]).total, 6000);
  });
});
