import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isDocCapsOn,
  toggleDocCaps,
  docCapsButtonLabel,
  shouldForceCapsOnElement,
  applyDocCapsValue,
} from "../src/doc-caps.js";

describe("doc-caps (OI-111)", () => {
  it("defaults ON when unset", () => {
    assert.equal(isDocCapsOn(undefined), true);
    assert.equal(isDocCapsOn(null), true);
    assert.equal(isDocCapsOn(true), true);
    assert.equal(isDocCapsOn(false), false);
  });

  it("toggles and labels", () => {
    assert.equal(toggleDocCaps(true), false);
    assert.equal(toggleDocCaps(false), true);
    assert.equal(toggleDocCaps(undefined), false);
    assert.match(docCapsButtonLabel(true), /CAPS: ON/);
    assert.match(docCapsButtonLabel(false), /caps: off/i);
  });

  it("uppercases text values only when on", () => {
    assert.equal(applyDocCapsValue("ab-12", true), "AB-12");
    assert.equal(applyDocCapsValue("ab-12", false), "ab-12");
  });

  it("skips number/date/readonly controls", () => {
    assert.equal(
      shouldForceCapsOnElement(true, { tagName: "INPUT", type: "number" }),
      false,
    );
    assert.equal(
      shouldForceCapsOnElement(true, { tagName: "INPUT", type: "text", readOnly: true }),
      false,
    );
    assert.equal(
      shouldForceCapsOnElement(true, { tagName: "INPUT", type: "text" }),
      true,
    );
    assert.equal(
      shouldForceCapsOnElement(true, { tagName: "TEXTAREA", type: "textarea" }),
      true,
    );
    assert.equal(
      shouldForceCapsOnElement(false, { tagName: "INPUT", type: "text" }),
      false,
    );
  });
});
