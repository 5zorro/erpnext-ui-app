import test from "node:test";
import assert from "node:assert/strict";

import { DEVICE_NAME_MAX, normaliseDeviceName } from "../src/receiving/device-name.js";

test("a typed name is tidied: trimmed, inner runs of space collapsed", () => {
  assert.deepEqual(normaliseDeviceName("  Dock   1 "), { ok: true, name: "Dock 1" });
  assert.deepEqual(normaliseDeviceName("Sam’s phone"), { ok: true, name: "Sam’s phone" });
});

test("control characters cannot hide in a name", () => {
  assert.deepEqual(normaliseDeviceName("Dock\n1\t\u0007"), { ok: true, name: "Dock 1" });
});

test("blank is refused with a sentence the page can show as-is", () => {
  for (const blank of ["", "   ", null, undefined, "\n\t"]) {
    const result = normaliseDeviceName(blank);
    assert.equal(result.ok, false);
    assert.match(result.reason, /Give this phone a name/);
  }
});

test("names are capped at a length that fits an audit column", () => {
  assert.equal(normaliseDeviceName("x".repeat(DEVICE_NAME_MAX)).ok, true);
  assert.match(normaliseDeviceName("x".repeat(DEVICE_NAME_MAX + 1)).reason, /40 characters/);
});
