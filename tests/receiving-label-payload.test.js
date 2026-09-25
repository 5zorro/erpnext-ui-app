import test from "node:test";
import assert from "node:assert/strict";

import {
  LABEL_CHARSET,
  REJECTED,
  buildLabelPayload,
  labelCheckCharacter,
  parseLabelPayload,
} from "../src/receiving/label-payload.js";

const PREFIX = "W";
const opts = { prefix: PREFIX };

test("charset is 43 distinct characters, so the check works modulo a prime", () => {
  assert.equal(LABEL_CHARSET.length, 43);
  assert.equal(new Set(LABEL_CHARSET).size, 43);
});

test("the characters real item numbers use are all carried: capitals, digits, dash, underscore", () => {
  // R5, answered 2026-09-24. Underscore is the one Code 39's set lacked.
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_") assert.ok(LABEL_CHARSET.includes(ch), ch);
});

test("no check character is a space, which would print as nothing and be trimmed", () => {
  assert.equal(LABEL_CHARSET.includes(" "), false);
});

test("builds prefix + item number + check character", () => {
  const payload = buildLabelPayload("10042", opts);
  assert.ok(payload.startsWith("W10042"));
  assert.equal(payload.length, "W10042".length + 1);
  assert.equal(payload.slice(-1), labelCheckCharacter("W10042"));
});

test("round-trips every shape of item number we expect to meet", () => {
  for (const itemNumber of ["10042", "AC-DELCO-PF46", "FL820S", "0", "AB_12-C", "X/Y+Z", "_"]) {
    const parsed = parseLabelPayload(buildLabelPayload(itemNumber, opts), opts);
    assert.deepEqual(parsed, { ok: true, itemNumber }, itemNumber);
  }
});

test("the item number is never rewritten on the way through", () => {
  // The business identifier lives in the legacy system, on POs and in people's heads; the payload
  // wraps it and hands it back unchanged.
  const itemNumber = "AC-DELCO-PF46";
  assert.equal(parseLabelPayload(buildLabelPayload(itemNumber, opts), opts).itemNumber, itemNumber);
});

test("a vendor's own label is rejected as not ours, not as a bad read", () => {
  // The distinction is what the receiver is told: scan the sheet, versus try that scan again.
  assert.deepEqual(parseLabelPayload("5012345678900", opts), { ok: false, reason: REJECTED.NOT_OURS });
  assert.deepEqual(parseLabelPayload("", opts), { ok: false, reason: REJECTED.EMPTY });
});

test("a single mistyped character fails the check", () => {
  const payload = buildLabelPayload("10042", opts);
  const wrong = payload.slice(0, 3) + (payload[3] === "0" ? "8" : "0") + payload.slice(4);
  assert.deepEqual(parseLabelPayload(wrong, opts), { ok: false, reason: REJECTED.CHECK_FAILED });
});

test("every single-character substitution in the body is caught", () => {
  // Every one of these is caught, which is the keying-error benefit §4A.2 is buying.
  const itemNumber = "AB_12-C";
  const payload = buildLabelPayload(itemNumber, opts);
  let checked = 0;
  for (let i = PREFIX.length; i < payload.length - 1; i += 1) {
    for (const ch of LABEL_CHARSET) {
      if (ch === payload[i]) continue;
      const mutated = payload.slice(0, i) + ch + payload.slice(i + 1);
      assert.equal(parseLabelPayload(mutated, opts).ok, false, mutated);
      checked += 1;
    }
  }
  assert.ok(checked > 200, "expected a broad sweep of substitutions");
});

test("swapping any two different characters of the item number is caught", () => {
  // The weighting is what buys this: a plain sum is order-blind and would pass every swap.
  const payload = buildLabelPayload("AB_12-C9", opts);
  let checked = 0;
  for (let i = PREFIX.length; i < payload.length - 1; i += 1) {
    for (let j = i + 1; j < payload.length - 1; j += 1) {
      if (payload[i] === payload[j]) continue;
      const chars = [...payload];
      [chars[i], chars[j]] = [chars[j], chars[i]];
      const swapped = chars.join("");
      assert.equal(parseLabelPayload(swapped, opts).ok, false, swapped);
      checked += 1;
    }
  }
  assert.ok(checked >= 20);
});

test("swapping the last character with the check character is caught too", () => {
  // Undetected only if the last character's weight were 42, i.e. a 42-character body.
  for (const itemNumber of ["10042", "AB_12-C9", "FL820S", "X-1", "Q_"]) {
    const payload = buildLabelPayload(itemNumber, opts);
    const [a, b] = [payload.at(-2), payload.at(-1)];
    if (a === b) continue;
    const swapped = payload.slice(0, -2) + b + a;
    assert.equal(parseLabelPayload(swapped, opts).ok, false, swapped);
  }
});

test("the check is the weighted sum the module documents, pinned so it cannot drift", () => {
  // W=32, 1=1, 0=0, 0=0, 4=4, 2=2 → 32·1 + 1·2 + 0·3 + 0·4 + 4·5 + 2·6 = 66 → 66 mod 43 = 23 → N.
  assert.equal(labelCheckCharacter("W10042"), "N");
  assert.equal(buildLabelPayload("10042", opts), "W10042N");
});

test("characters no label can carry are refused at build time", () => {
  assert.throws(() => buildLabelPayload("café", opts), /no label can carry/);
  assert.throws(() => buildLabelPayload("lowercase", opts), /no label can carry/);
  assert.throws(() => buildLabelPayload("A B", opts), /no label can carry/);
  assert.throws(() => buildLabelPayload("", opts), /nothing to encode/);
});

test("a prefix must be supplied — there is no default to ship by accident", () => {
  // The final format is gated on the label-width measurement (plan P1e), so no placeholder.
  assert.throws(() => buildLabelPayload("10042"), /company prefix is required/);
  assert.throws(() => parseLabelPayload("W10042N"), /company prefix is required/);
});

test("too short to carry a body and a check character", () => {
  assert.deepEqual(parseLabelPayload("W1", opts), { ok: false, reason: REJECTED.TOO_SHORT });
});

test("a multi-character prefix works the same way", () => {
  const wide = { prefix: "WH-" };
  assert.deepEqual(parseLabelPayload(buildLabelPayload("10042", wide), wide), {
    ok: true,
    itemNumber: "10042",
  });
  // Another site's prefix reads as somebody else's label, which is the point of having one.
  assert.deepEqual(parseLabelPayload(buildLabelPayload("10042", wide), { prefix: "Z" }), {
    ok: false,
    reason: REJECTED.NOT_OURS,
  });
});
