import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SHELL_SURFACES,
  shellSurface,
  surfaceIsDocLens,
  surfaceOwnsRoute,
  surfacePlacement,
} from "../src/shell-surfaces.js";

describe("SHELL_SURFACES", () => {
  it("every page has its own view", () => {
    const views = Object.values(SHELL_SURFACES).map((s) => s.view);
    assert.equal(new Set(views).size, views.length);
  });

  it("the Doc lens is the form and the three shell pages — not Home, not Vanilla (G10)", () => {
    assert.deepEqual(
      Object.keys(SHELL_SURFACES).filter(surfaceIsDocLens).sort(),
      ["doc", "find-doc", "pay-outstanding", "payment-doc"],
    );
  });

  it("only local-file pages own their address; the Doc form's hidden ERP form is its document", () => {
    assert.deepEqual(
      Object.keys(SHELL_SURFACES).filter(surfaceOwnsRoute).sort(),
      ["find-doc", "pay-outstanding", "payment-doc"],
    );
    assert.equal(surfaceOwnsRoute("doc"), false);
  });

  it("placement shows exactly one view", () => {
    const p = surfacePlacement("find-doc");
    assert.equal(p.filter((x) => x.shown).length, 1);
    assert.equal(p.find((x) => x.shown).view, "findDoc");
    assert.equal(surfacePlacement("nope").filter((x) => x.shown).length, 0);
  });

  it("unknown modes answer no", () => {
    assert.equal(shellSurface("bill"), null);
    assert.equal(surfaceIsDocLens("bill"), false);
  });
});
