import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FIELD_LOADING_SHOW_AFTER_MS,
  FIELD_LOADING_MIN_VISIBLE_MS,
  SETTLE_DEPENDENT_FIELDS,
  fieldsSettlingFor,
  writeSettlesOtherFields,
  remainingHoldMs,
} from "../src/field-loading.js";

describe("fieldsSettlingFor", () => {
  it("marks the fields ERPNext repopulates off the vendor", () => {
    const fields = fieldsSettlingFor("supplier");
    for (const key of ["billingAddress", "shipFrom", "shipTo", "terms", "duedate"]) {
      assert.ok(fields.includes(key), `${key} should be marked while the vendor settles`);
    }
  });

  it("never marks the field being written", () => {
    // The clerk just typed it; it already shows the right answer. Marking it would say the
    // one field we are certain about is the uncertain one.
    for (const [written, dependents] of Object.entries(SETTLE_DEPENDENT_FIELDS)) {
      assert.ok(!dependents.includes(written), `${written} must not depend on itself`);
    }
    assert.ok(!fieldsSettlingFor("supplier").includes("vendor"));
  });

  it("says nothing for a write that settles nothing else", () => {
    assert.deepEqual(fieldsSettlingFor("remarks"), []);
    assert.deepEqual(fieldsSettlingFor(""), []);
    assert.deepEqual(fieldsSettlingFor(null), []);
    assert.equal(writeSettlesOtherFields("remarks"), false);
    assert.equal(writeSettlesOtherFields("supplier"), true);
  });

  it("hands back a copy — the renderer may mutate what it gets", () => {
    const a = fieldsSettlingFor("supplier");
    a.push("nonsense");
    assert.ok(!fieldsSettlingFor("supplier").includes("nonsense"));
  });

  it("does not treat an unknown field as a wildcard", () => {
    assert.deepEqual(fieldsSettlingFor("no_such_field"), []);
    assert.deepEqual(fieldsSettlingFor("constructor"), []);
    assert.deepEqual(fieldsSettlingFor("__proto__"), []);
  });
});

describe("timing", () => {
  it("waits a beat before admitting it is waiting", () => {
    // A fast reply should never flash an indicator.
    assert.ok(FIELD_LOADING_SHOW_AFTER_MS >= 150, "too eager: every fast reply would flash");
    assert.ok(FIELD_LOADING_SHOW_AFTER_MS <= 400, "too slow: the gap it explains is ~1s");
  });

  it("holds the indicator long enough to be read once it is up", () => {
    assert.ok(FIELD_LOADING_MIN_VISIBLE_MS >= 250);
  });

  it("clears immediately when the indicator never went up", () => {
    assert.equal(remainingHoldMs(0, 10_000), 0);
    assert.equal(remainingHoldMs(null, 10_000), 0);
    assert.equal(remainingHoldMs(undefined, 10_000), 0);
  });

  it("holds the balance when the reply lands mid-display", () => {
    const shownAt = 1_000;
    assert.equal(remainingHoldMs(shownAt, shownAt + 100, { minVisibleMs: 320 }), 220);
  });

  it("clears at once when it has already been visible long enough", () => {
    const shownAt = 1_000;
    assert.equal(remainingHoldMs(shownAt, shownAt + 320, { minVisibleMs: 320 }), 0);
    assert.equal(remainingHoldMs(shownAt, shownAt + 5_000, { minVisibleMs: 320 }), 0);
  });

  it("never returns a negative wait, even with a clock that went backwards", () => {
    assert.equal(remainingHoldMs(5_000, 1_000, { minVisibleMs: 320 }), 320);
    assert.ok(remainingHoldMs(1_000, Number.NaN) === 0);
  });
});

const docSkinCss = readFileSync(
  fileURLToPath(new URL("../electron/doc-skin.css", import.meta.url)),
  "utf8",
);
const billFormPage = readFileSync(
  fileURLToPath(new URL("../src/bill-form-page.js", import.meta.url)),
  "utf8",
);

describe("the indicator is actually visible", () => {
  it("styles the loading class beyond italic text", () => {
    // The pending state existed before this (source-field-loading) but was styled only as
    // italic muted text on read-only fields — invisible enough that a slow settle read as a
    // bug instead of as waiting.
    assert.match(docSkinCss, /@keyframes field-loading-sweep/);
    assert.match(docSkinCss, /\.field input\.field-loading/);
  });

  it("gives the existing linked-source pending state the same treatment", () => {
    const block = docSkinCss.slice(
      docSkinCss.indexOf("@keyframes field-loading-sweep") - 1200,
      docSkinCss.indexOf("@keyframes field-loading-sweep"),
    );
    assert.match(block, /\.field input\.source-field-loading/);
  });

  it("still reads as pending when motion is reduced", () => {
    const rm = docSkinCss.slice(docSkinCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    assert.match(rm, /animation:\s*none/);
    assert.match(rm, /background-color:/, "needs a static cue, not just no animation");
  });

  it("wraps the vendor write rather than the whole form", () => {
    assert.match(billFormPage, /withFieldSettleLoading\(field, api\.setHeader\(field, value\)\)/);
    assert.match(billFormPage, /const timer = setTimeout\(show, FIELD_LOADING_SHOW_AFTER_MS\)/);
    // The clear has to survive a rejected write, or a failed vendor pick leaves the form
    // sweeping forever.
    const fn = billFormPage.slice(billFormPage.indexOf("async function withFieldSettleLoading"));
    assert.match(fn.slice(0, fn.indexOf("\n  }\n")), /finally \{/);
  });
});
