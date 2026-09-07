import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { paintCheckDoc, closeCheckDoc, mountCheckDocWrite } from "../src/check-doc-mount.js";

describe("check-doc-mount — null/junk safety (bare Node, no DOM)", () => {
  it("paintCheckDoc no-ops instead of throwing when root is missing", () => {
    assert.doesNotThrow(() => paintCheckDoc(null, {}, []));
    assert.doesNotThrow(() => paintCheckDoc(undefined, {}, []));
  });

  it("closeCheckDoc no-ops instead of throwing when root is missing", () => {
    assert.doesNotThrow(() => closeCheckDoc(null));
    assert.doesNotThrow(() => closeCheckDoc(undefined));
  });

  it("mountCheckDocWrite no-ops instead of throwing when root is missing", () => {
    assert.doesNotThrow(() => mountCheckDocWrite(null, {}));
    assert.doesNotThrow(() => mountCheckDocWrite(undefined, {}));
    assert.doesNotThrow(() => mountCheckDocWrite(null));
  });
});
