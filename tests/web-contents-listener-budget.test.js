import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WEB_CONTENTS_LISTENER_BUDGET,
  applyWebContentsListenerBudget,
} from "../src/web-contents-listener-budget.js";

describe("web-contents-listener-budget", () => {
  it("defaults to 20", () => {
    assert.equal(WEB_CONTENTS_LISTENER_BUDGET, 20);
  });

  it("calls setMaxListeners on webContents", () => {
    let seen = 0;
    applyWebContentsListenerBudget({
      setMaxListeners(n) {
        seen = n;
      },
    });
    assert.equal(seen, 20);
  });

  it("ignores missing webContents", () => {
    assert.equal(applyWebContentsListenerBudget(null), 20);
  });
});
