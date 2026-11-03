import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRepeatPressGuard, repeatPressToast } from "../src/bill-repeat-press.js";

/** A call that ends when the test says so. */
function slowCall(log) {
  let finish;
  const done = new Promise((r) => (finish = r));
  return { fn: async () => { log.push("start"); await done; log.push("end"); return "ok"; }, finish: () => finish() };
}

describe("a second press while the first is working (review S1)", () => {
  it("runs once, holds the repeat back and says so", async () => {
    const log = [];
    const offers = [];
    let idle = 0;
    const g = createRepeatPressGuard({ onRepeat: (again) => offers.push(again), onIdle: () => (idle += 1) });
    const call = slowCall(log);
    const first = g.press(call.fn);
    assert.equal(g.busy(), true);
    assert.equal(await g.press(call.fn), undefined);
    assert.deepEqual(log, ["start"]);
    assert.equal(offers.length, 1);
    call.finish();
    assert.equal(await first, "ok");
    assert.equal(g.busy(), false);
    assert.equal(idle, 1);
  });

  it("the override runs it again at once, and idle waits for both", async () => {
    const log = [];
    let again = null;
    let idle = 0;
    const g = createRepeatPressGuard({ onRepeat: (a) => (again = a), onIdle: () => (idle += 1) });
    const call = slowCall(log);
    const first = g.press(call.fn);
    g.press(call.fn);
    const second = again();
    assert.deepEqual(log, ["start", "start"]);
    call.finish();
    await Promise.all([first, second]);
    assert.deepEqual(log, ["start", "start", "end", "end"]);
    assert.equal(idle, 1);
  });

  it("a press after the first ended runs normally", async () => {
    const g = createRepeatPressGuard({ onRepeat: () => assert.fail("not a repeat") });
    assert.equal(await g.press(async () => 1), 1);
    assert.equal(await g.press(async () => 2), 2);
  });

  it("a failed run frees the guard", async () => {
    const g = createRepeatPressGuard({ onRepeat: () => assert.fail("not a repeat") });
    await assert.rejects(g.press(async () => { throw new Error("refused"); }));
    assert.equal(g.busy(), false);
  });

  it("names the action held back", () => {
    assert.equal(repeatPressToast("Apply to items"), 'Still working on "Apply to items" — your second press was held back. Click here to run it again anyway.');
  });
});
