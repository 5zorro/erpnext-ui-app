import test from "node:test";
import assert from "node:assert/strict";

import { assessPhone, guessPlatform } from "../src/receiving/phone-check.js";

const READY = {
  secure: true,
  camera: true,
  cameraAllowed: true,
  barcodeFormats: ["qr_code", "code_128"],
  installed: true,
  offlineReady: true,
  deviceName: "Dock 1",
  platform: "android",
};

const byId = (result, id) => result.checks.find((c) => c.id === id);

test("platform guesses pick the right install instructions", () => {
  assert.equal(guessPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148"), "ios");
  assert.equal(guessPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Mobile/15E148 Safari/604.1"), "ios");
  assert.equal(guessPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 8) Chrome/140.0 Mobile"), "android");
  assert.equal(guessPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0"), "other");
  assert.equal(guessPlatform(), "other");
});

test("a fully set-up phone is ready", () => {
  const result = assessPhone(READY);
  assert.equal(result.ready, true);
  assert.equal(byId(result, "reader").label, "Built-in barcode reader");
});

test("each missing piece fails on its own, with its own fix", () => {
  const cases = {
    secure: { secure: false },
    camera: { cameraAllowed: false },
    installed: { installed: false },
    offline: { offlineReady: false },
    name: { deviceName: null },
  };
  for (const [id, change] of Object.entries(cases)) {
    const result = assessPhone({ ...READY, ...change });
    assert.equal(result.ready, false, id);
    assert.deepEqual(result.checks.filter((c) => !c.ok).map((c) => c.id), [id]);
    assert.ok(byId(result, id).fix.length > 20, `${id} explains the fix`);
  }
});

test("a camera not yet tried does not count against the phone", () => {
  assert.equal(byId(assessPhone({ ...READY, cameraAllowed: null }), "camera").ok, true);
});

test("no camera at all and a refused camera get different advice", () => {
  const missing = byId(assessPhone({ ...READY, camera: false }), "camera").fix;
  const refused = byId(assessPhone({ ...READY, cameraAllowed: false }), "camera").fix;
  assert.notEqual(missing, refused);
  assert.match(refused, /refused/);
});

test("iPhone and Android are told different ways to add the icon", () => {
  const ios = byId(assessPhone({ ...READY, installed: false, platform: "ios" }), "installed").fix;
  const android = byId(assessPhone({ ...READY, installed: false, platform: "android" }), "installed").fix;
  assert.match(ios, /Share/);
  assert.match(android, /Install app/);
});

test("no built-in barcode reader is reported, never blocking — the app brings its own", () => {
  for (const formats of [null, [], ["qr_code"]]) {
    const result = assessPhone({ ...READY, barcodeFormats: formats });
    assert.equal(result.ready, true);
    assert.match(byId(result, "reader").label, /app’s own/);
  }
});

test("no facts at all is not ready, and does not throw", () => {
  assert.equal(assessPhone(undefined).ready, false);
});
