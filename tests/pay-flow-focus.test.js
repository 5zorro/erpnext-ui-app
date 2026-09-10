import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveFlowFocus, noFlowFocus, togglePinnedFocus } from "../src/pay-flow-focus.js";

/** 3 invoices x 3 installments, batched one per invoice — the crossing case focus exists for. */
const INDEX = {
  invoices: [
    { id: "PI-A", keys: ["A#0", "A#1", "A#2"] },
    { id: "PI-B", keys: ["B#0", "B#1", "B#2"] },
    { id: "PI-C", keys: ["C#0", "C#1", "C#2"] },
  ],
  groups: [
    { id: "g0", keys: ["A#0", "B#0", "C#0"] },
    { id: "g1", keys: ["A#1", "B#1", "C#1"] },
    { id: "g2", keys: ["A#2", "B#2", "C#2"] },
  ],
};
const sorted = (a) => [...a].sort();

describe("resolveFlowFocus", () => {
  it("a suggested payment lights its own rows and every invoice feeding it", () => {
    const f = resolveFlowFocus({ kind: "group", id: "g1" }, INDEX);
    assert.deepEqual(sorted(f.keys), ["A#1", "B#1", "C#1"]);
    assert.deepEqual(sorted(f.invoiceIds), ["PI-A", "PI-B", "PI-C"]);
    assert.deepEqual(f.groupIds, ["g1"]);
    assert.equal(f.active, true);
  });

  it("an invoice lights its installments and every payment that will settle them", () => {
    const f = resolveFlowFocus({ kind: "invoice", id: "PI-B" }, INDEX);
    assert.deepEqual(sorted(f.keys), ["B#0", "B#1", "B#2"]);
    assert.deepEqual(f.invoiceIds, ["PI-B"]);
    assert.deepEqual(sorted(f.groupIds), ["g0", "g1", "g2"]);
  });

  it("a single schedule row lights the whole chain — its invoice and its payment", () => {
    // The question the crossings make hard to answer: where did this installment come from,
    // and what is going to pay it.
    const f = resolveFlowFocus({ kind: "row", id: "B#2" }, INDEX);
    assert.deepEqual(f.keys, ["B#2"]);
    assert.deepEqual(f.invoiceIds, ["PI-B"]);
    assert.deepEqual(f.groupIds, ["g2"]);
  });

  it("no target means no focus — nothing is dimmed", () => {
    for (const t of [null, undefined, {}, { kind: "group" }, { id: "g1" }]) {
      assert.equal(resolveFlowFocus(t, INDEX).active, false);
    }
    assert.equal(noFlowFocus().active, false);
  });

  it("an unknown kind is inert rather than a partial focus", () => {
    assert.equal(resolveFlowFocus({ kind: "vendor", id: "PI-A" }, INDEX).active, false);
  });

  it("an id that is not in the index does not produce an empty-but-active focus", () => {
    // Active with no keys would dim the whole card and light nothing.
    assert.equal(resolveFlowFocus({ kind: "group", id: "ghost" }, INDEX).active, false);
    assert.equal(resolveFlowFocus({ kind: "invoice", id: "ghost" }, INDEX).active, false);
  });

  it("an aggregate with no members is inert too", () => {
    const f = resolveFlowFocus({ kind: "group", id: "empty" }, { groups: [{ id: "empty", keys: [] }] });
    assert.equal(f.active, false);
  });

  it("a row not present in any aggregate still lights itself", () => {
    const f = resolveFlowFocus({ kind: "row", id: "orphan" }, INDEX);
    assert.equal(f.active, true);
    assert.deepEqual(f.keys, ["orphan"]);
    assert.deepEqual(f.invoiceIds, []);
    assert.deepEqual(f.groupIds, []);
  });

  it("a missing or junk index never throws", () => {
    assert.doesNotThrow(() => resolveFlowFocus({ kind: "row", id: "x" }, undefined));
    assert.doesNotThrow(() => resolveFlowFocus({ kind: "row", id: "x" }, { invoices: "nope", groups: 5 }));
    assert.equal(resolveFlowFocus({ kind: "row", id: "x" }, {}).active, true);
  });

  it("deduplicates keys and does not mutate the index", () => {
    const idx = { groups: [{ id: "g", keys: ["k", "k", "j"] }] };
    const copy = JSON.parse(JSON.stringify(idx));
    const f = resolveFlowFocus({ kind: "group", id: "g" }, idx);
    assert.deepEqual(sorted(f.keys), ["j", "k"]);
    assert.deepEqual(idx, copy);
  });

  it("the no-focus value is frozen, so a caller cannot corrupt the shared default", () => {
    assert.throws(() => {
      noFlowFocus().keys.push("x");
    });
  });
});

describe("togglePinnedFocus", () => {
  it("clicking an unfocused thing pins it", () => {
    assert.deepEqual(togglePinnedFocus(null, { kind: "group", id: "g1" }), { kind: "group", id: "g1" });
  });

  it("clicking the pinned thing again releases it", () => {
    assert.equal(togglePinnedFocus({ kind: "group", id: "g1" }, { kind: "group", id: "g1" }), null);
  });

  it("clicking a different thing moves the pin", () => {
    assert.deepEqual(
      togglePinnedFocus({ kind: "group", id: "g1" }, { kind: "group", id: "g2" }),
      { kind: "group", id: "g2" },
    );
  });

  it("same id, different kind is a different thing", () => {
    assert.deepEqual(
      togglePinnedFocus({ kind: "row", id: "x" }, { kind: "invoice", id: "x" }),
      { kind: "invoice", id: "x" },
    );
  });

  it("a junk click leaves the pin alone rather than clearing it", () => {
    const pinned = { kind: "group", id: "g1" };
    assert.equal(togglePinnedFocus(pinned, null), pinned);
    assert.equal(togglePinnedFocus(pinned, { kind: "group" }), pinned);
  });
});
