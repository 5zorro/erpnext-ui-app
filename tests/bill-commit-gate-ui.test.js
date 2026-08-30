import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const electronDir = fileURLToPath(new URL("../electron/", import.meta.url));
const docFormHtml = readFileSync(join(electronDir, "doc-form.html"), "utf8");
const billFormPage = readFileSync(
  join(fileURLToPath(new URL("../src/bill-form-page.js", import.meta.url))),
  "utf8",
);
const docSkinCss = readFileSync(join(electronDir, "doc-skin.css"), "utf8");

describe("Bill commit-gate modal contract", () => {
  it("blocks the Bill visually and exposes modal semantics", () => {
    assert.match(docSkinCss, /\.commit-gate\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
    assert.match(docFormHtml, /class="commit-gate-dialog" role="dialog" aria-modal="true"/);
    assert.match(docFormHtml, /data-testid="bill-commit-gate"/);
  });

  it("shows save readiness before the action choices", () => {
    const readiness = docFormHtml.indexOf('id="commit-gate-validation"');
    const choices = docFormHtml.indexOf('data-gate="discard"');
    assert.ok(readiness >= 0, "save-readiness panel exists");
    assert.ok(choices > readiness, "save-readiness panel appears before choices");
    assert.match(docFormHtml, /id="commit-gate-blockers"/);
    assert.match(billFormPage, /Save is blocked by:/);
    assert.match(billFormPage, /Doc Bill \+ live ERP meta preflight passed/);
    assert.match(billFormPage, /listMandatory/);
    assert.match(billFormPage, /mergeSaveBlockers/);
    assert.match(billFormPage, /commitGateErpFailureView/);
  });

  it("supports Escape, backdrop click, and traps Tab inside the modal choices", () => {
    const gateUi = readFileSync(
      join(fileURLToPath(new URL("../src/doc-commit-gate-ui.js", import.meta.url))),
      "utf8",
    );
    assert.match(gateUi, /ev\.key === "Escape"/);
    assert.match(gateUi, /commitGateBackdrop/);
    assert.match(billFormPage, /cancelCommitGateFromOutside/);
    assert.match(billFormPage, /wireCommitGateChrome/);
    assert.match(gateUi, /trapTab/);
    assert.match(gateUi, /\[data-gate\]:not\(:disabled\)/);
  });
});
