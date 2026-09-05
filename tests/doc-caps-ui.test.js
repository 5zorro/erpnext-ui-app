import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { wireDocCapsUi } from "../src/doc-caps-ui.js";

describe("doc-caps-ui", () => {
  it("syncs button label from caps state", () => {
    let capsOn = true;
    const btn = { textContent: "", title: "", addEventListener: () => {} };
    const ui = wireDocCapsUi({
      capsButton: /** @type {HTMLElement} */ (btn),
      getCapsOn: () => capsOn,
      setCapsOn: (v) => {
        capsOn = v;
      },
      root: null,
    });
    assert.match(btn.textContent, /CAPS: ON/);
    capsOn = false;
    ui.syncCapsButton();
    assert.match(btn.textContent, /caps: off/i);
  });
});
