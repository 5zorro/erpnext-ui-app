import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const billHtml = readFileSync(
  fileURLToPath(new URL("../electron/bill.html", import.meta.url)),
  "utf8",
);

describe("Bill commit-gate modal contract", () => {
  it("blocks the Bill visually and exposes modal semantics", () => {
    assert.match(billHtml, /\.commit-gate\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
    assert.match(billHtml, /class="commit-gate-dialog" role="dialog" aria-modal="true"/);
  });

  it("shows save readiness before the action choices", () => {
    const readiness = billHtml.indexOf('id="commit-gate-validation"');
    const choices = billHtml.indexOf('data-gate="discard"');
    assert.ok(readiness >= 0, "save-readiness panel exists");
    assert.ok(choices > readiness, "save-readiness panel appears before choices");
    assert.match(billHtml, /id="commit-gate-blockers"/);
    assert.match(billHtml, /Save is blocked by:/);
    assert.match(billHtml, /Doc Bill \+ live ERP meta preflight passed/);
    assert.match(billHtml, /listMandatory/);
    assert.match(billHtml, /mergeSaveBlockers/);
    assert.match(billHtml, /commitGateErpFailureView/);
  });

  it("supports Escape, backdrop click, and traps Tab inside the modal choices", () => {
    assert.match(billHtml, /ev\.key === "Escape"/);
    assert.match(billHtml, /commit-gate-backdrop/);
    assert.match(billHtml, /cancelCommitGateFromOutside/);
    assert.match(billHtml, /focusBillSurface/);
    assert.match(billHtml, /ev\.key !== "Tab"/);
    assert.match(billHtml, /\[data-gate\]:not\(:disabled\)/);
  });
});
