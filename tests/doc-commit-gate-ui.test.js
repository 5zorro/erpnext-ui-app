import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  setCommitGateBusy,
  commitGateTitleText,
} from "../src/doc-commit-gate-ui.js";

describe("doc-commit-gate-ui", () => {
  it("formats gate title with trigger label", () => {
    assert.match(commitGateTitleText("Find Bill…"), /Unsaved changes — before Find Bill/);
  });

  it("disables save when blockers present", () => {
    const save = { disabled: false, title: "", getAttribute: () => "save" };
    const discard = { disabled: false, title: "", getAttribute: () => "discard" };
    const els = {
      commitGate: {
        querySelectorAll(sel) {
          if (sel === "[data-gate]") return [save, discard];
          return [];
        },
      },
    };
    setCommitGateBusy(els, {
      busy: false,
      toolbarAction: "find",
      isNewDoc: false,
      docTitle: "Bill",
      getSaveBlockers: () => ["Vendor (Supplier) is required."],
    });
    assert.equal(save.disabled, true);
    assert.equal(discard.disabled, false);
  });
});

describe("doc-skin source modal css", () => {
  it("includes shared source modal chrome", () => {
    const css = readFileSync(
      join(fileURLToPath(new URL("../electron/doc-skin.css", import.meta.url))),
      "utf8",
    );
    assert.match(css, /\.src-back\s*\{/);
    assert.match(css, /\.src-check\s*\{/);
  });
});
