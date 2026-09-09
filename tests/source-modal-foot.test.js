import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sourceModalUi = readFileSync(
  fileURLToPath(new URL("../src/source-modal-ui.js", import.meta.url)),
  "utf8",
);
const docSkinCss = readFileSync(
  fileURLToPath(new URL("../electron/doc-skin.css", import.meta.url)),
  "utf8",
);

describe("source modal button row — click-only controls (OI-166)", () => {
  it("every control in .src-foot is out of the tab order", () => {
    // The modal captures Tab for group navigation, so a focusable control in the button row
    // would be visible and permanently unreachable by keyboard. Pick, Cancel and the credit
    // switch are all click-only on purpose — this was true by accident before the switch
    // existed, and is stated here so a later "accessibility fix" does not quietly undo it.
    const start = sourceModalUi.indexOf('<div class="src-foot">');
    assert.ok(start > 0, "src-foot markup should be found in source-modal-ui.js");
    const foot = sourceModalUi.slice(start, sourceModalUi.indexOf("</div>`", start));
    const buttons = foot.match(/<button\b[^>]*>/g) || [];
    assert.ok(buttons.length >= 2, "expected at least the pick and cancel buttons");
    for (const btn of buttons) {
      assert.match(btn, /tabindex="-1"/, `foot control must not be tabbable: ${btn}`);
    }
  });

  it("the credit switch is a real switch for screen readers, not a styled div", () => {
    assert.match(sourceModalUi, /class="credit-memo-switch src-credit-switch"/);
    assert.match(sourceModalUi, /role="switch"/);
    assert.match(sourceModalUi, /aria-checked=/);
  });

  it("Tab stays owned by group navigation, not by the foot", () => {
    assert.match(sourceModalUi, /act === "tab"/);
    assert.match(sourceModalUi, /nextSelectableGroupIndex/);
  });

  it("the switch reports the flip and lets the host answer with the new corpus", () => {
    // The modal must not decide what a "credit" list contains, and must not paint itself
    // switched before the host confirms — a failed fetch would leave the switch lying.
    assert.match(sourceModalUi, /creditToggle\.onChange\(next\)/);
    assert.match(sourceModalUi, /setCreditMode\(credit, nextGroups\)/);
  });

  it("switching corpus clears the selection", () => {
    // A checked PO key surviving into credit mode could be committed as a credit source.
    const fn = sourceModalUi.slice(
      sourceModalUi.indexOf("function setCreditMode(credit, nextGroups)"),
      sourceModalUi.indexOf("function paintLoadError()"),
    );
    assert.ok(fn, "setCreditMode should be defined above paintLoadError");
    assert.match(fn, /selectedKeys = \[\];/);
  });

  it("the switch styles exist and keep the actions where they were", () => {
    // margin-left:auto pushes the toggle right so Pull/Cancel stay put for muscle memory.
    assert.match(docSkinCss, /\.src-credit-toggle\s*\{[^}]*margin-left:\s*auto;/s);
    assert.match(docSkinCss, /\.src-foot \.src-credit-switch\s*\{/);
    assert.match(docSkinCss, /\.src-foot \.src-credit-switch\.is-on \.switch-thumb\s*\{/);
  });
});
