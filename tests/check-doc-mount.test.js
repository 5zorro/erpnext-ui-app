import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  paintCheckDoc,
  closeCheckDoc,
  mountCheckDocWrite,
  setCheckDocBatchSource,
} from "../src/check-doc-mount.js";

describe("check-doc-mount — null/junk safety (bare Node, no DOM)", () => {
  it("paintCheckDoc no-ops instead of throwing when root is missing", () => {
    assert.doesNotThrow(() => paintCheckDoc(null, {}));
    assert.doesNotThrow(() => paintCheckDoc(undefined, {}));
    assert.doesNotThrow(() => paintCheckDoc(null, {}, { readOnly: true }));
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

  it("setCheckDocBatchSource never throws on junk input", () => {
    assert.doesNotThrow(() => setCheckDocBatchSource(null, null));
    assert.doesNotThrow(() => setCheckDocBatchSource(undefined, undefined));
    assert.doesNotThrow(() => setCheckDocBatchSource({}, "junk"));
  });
});
