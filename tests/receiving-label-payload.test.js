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

test("charset is the 43 characters mod-43 is defined over", () => {
  assert.equal(LABEL_CHARSET.length, 43);
  assert.equal(new Set(LABEL_CHARSET).size, 43);
});

test("builds prefix + item number + check character", () => {
  const payload = buildLabelPayload("10042", opts);
  assert.ok(payload.startsWith("W10042"));
  assert.equal(payload.length, "W10042".length + 1);
  assert.equal(payload.slice(-1), labelCheckCharacter("W10042"));
});

test("round-trips every shape of item number we expect to meet", () => {
  for (const itemNumber of ["10042", "AC-DELCO-PF46", "FL820S", "0", "A B", "X/Y+Z"]) {
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
  // Mod-43 catches all of these, which is the keying-error benefit §4A.2 is buying.
  const itemNumber = "10042";
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

test("a transposition is caught only when the swapped characters differ", () => {
  // Honest limit of a plain mod-43 sum: it is order-independent, so swapping two characters is
  // invisible to it. Code 128's own check character covers scan misreads; this one covers typing.
  const payload = buildLabelPayload("10042", opts);
  const swapped = payload.slice(0, 1) + payload[2] + payload[1] + payload.slice(3);
  assert.equal(parseLabelPayload(swapped, opts).ok, true);
});

test("characters no label can carry are refused at build time", () => {
  assert.throws(() => buildLabelPayload("café", opts), /no label can carry/);
  assert.throws(() => buildLabelPayload("lowercase", opts), /no label can carry/);
  assert.throws(() => buildLabelPayload("", opts), /nothing to encode/);
});

test("a prefix must be supplied — there is no default to ship by accident", () => {
  // The final format is gated on the label-width measurement (plan P1e), so no placeholder.
  assert.throws(() => buildLabelPayload("10042"), /company prefix is required/);
  assert.throws(() => parseLabelPayload("W100428"), /company prefix is required/);
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
