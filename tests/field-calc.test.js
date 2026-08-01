import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFieldCalcState,
  reduceFieldCalc,
  resetFieldCalc,
  isCalcEligibleField,
  mapFieldCalcKey,
} from "../src/calc/field-calc.js";

describe("isCalcEligibleField", () => {
  it("allows Amount Due, qty, rate, and amount back-in", () => {
    assert.equal(isCalcEligibleField("amountDue"), true);
    assert.equal(isCalcEligibleField("qty"), true);
    assert.equal(isCalcEligibleField("rate"), true);
    assert.equal(isCalcEligibleField("amount"), true);
    assert.equal(isCalcEligibleField("supplier"), false);
  });
});

describe("mapFieldCalcKey", () => {
  it("maps Enter to equals and numpad ops", () => {
    assert.equal(mapFieldCalcKey("Enter"), "=");
    assert.equal(mapFieldCalcKey("Add"), "+");
    assert.equal(mapFieldCalcKey("a"), null);
  });
});

describe("reduceFieldCalc Excel JIT", () => {
  it("starts on operator after a number; commits on =", () => {
    let st = createFieldCalcState("12.5");
    let r = reduceFieldCalc(st, { key: "*", fieldValue: "12.5" });
    assert.equal(r.action, "prevent");
    assert.equal(r.state.mode, "active");
    assert.match(r.expression, /12\.5/);
    st = r.state;

    r = reduceFieldCalc(st, { key: "1", fieldValue: "12.5*" });
    st = r.state;
    r = reduceFieldCalc(st, { key: ".", fieldValue: "" });
    st = r.state;
    r = reduceFieldCalc(st, { key: "1", fieldValue: "" });
    st = r.state;
    r = reduceFieldCalc(st, { key: "=", fieldValue: "" });
    assert.equal(r.action, "commit");
    assert.equal(r.commitValue, "13.75");
    assert.equal(r.state.mode, "idle");
  });

  it("100+25= via field start commits 125", () => {
    let st = createFieldCalcState("");
    // User typed 100 into the field first (idle ignores digits)
    let r = reduceFieldCalc(st, { key: "+", fieldValue: "100" });
    st = r.state;
    for (const ch of "25") {
      r = reduceFieldCalc(st, { key: ch, fieldValue: "" });
      st = r.state;
    }
    r = reduceFieldCalc(st, { key: "Enter", fieldValue: "" });
    assert.equal(r.action, "commit");
    assert.equal(r.commitValue, "125");
  });

  it("Tab mid-calc commits (same as Enter/=)", () => {
    let st = createFieldCalcState("10");
    let r = reduceFieldCalc(st, { key: "+", fieldValue: "10" });
    st = r.state;
    for (const ch of "4110") {
      r = reduceFieldCalc(st, { key: ch, fieldValue: "" });
      st = r.state;
    }
    r = reduceFieldCalc(st, { key: "+", fieldValue: "" });
    st = r.state;
    for (const ch of "300") {
      r = reduceFieldCalc(st, { key: ch, fieldValue: "" });
      st = r.state;
    }
    r = reduceFieldCalc(st, { key: "Tab", fieldValue: "" });
    assert.equal(r.action, "commit");
    assert.equal(r.commitValue, "4420");
    assert.equal(r.allowDefault, true);
  });

  it("Esc restores priorValue and cancels", () => {
    let st = createFieldCalcState("40");
    let r = reduceFieldCalc(st, { key: "+", fieldValue: "40" });
    st = r.state;
    r = reduceFieldCalc(st, { key: "5", fieldValue: "" });
    st = r.state;
    r = reduceFieldCalc(st, { key: "Escape", fieldValue: "" });
    assert.equal(r.action, "cancel");
    assert.equal(r.commitValue, "40");
    assert.equal(r.state.mode, "idle");
  });

  it("does not start calc on non-numeric field text", () => {
    const st = createFieldCalcState("hello");
    const r = reduceFieldCalc(st, { key: "+", fieldValue: "hello" });
    assert.equal(r.action, "none");
    assert.equal(r.state.mode, "idle");
  });

  it("empty field + op starts from 0", () => {
    let st = createFieldCalcState("");
    let r = reduceFieldCalc(st, { key: "+", fieldValue: "" });
    assert.equal(r.action, "prevent");
    st = r.state;
    r = reduceFieldCalc(st, { key: "5", fieldValue: "" });
    st = r.state;
    r = reduceFieldCalc(st, { key: "=", fieldValue: "" });
    assert.equal(r.action, "commit");
    assert.equal(r.commitValue, "5");
  });

  it("resetFieldCalc clears active session", () => {
    let st = createFieldCalcState("1");
    let r = reduceFieldCalc(st, { key: "+", fieldValue: "1" });
    st = resetFieldCalc(r.state, "1");
    assert.equal(st.mode, "idle");
    assert.equal(st.session, null);
  });
});
