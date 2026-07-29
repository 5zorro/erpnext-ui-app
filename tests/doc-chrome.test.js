import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOC_TOOLBAR_GROUPS,
  DOC_TOOLBAR_BUTTON_GROUP,
  REFRESH_BUTTON_TITLE,
  toolbarGroupForButton,
  docLifecyclePill,
  focusFinalizeControl,
  racePromise,
  findListFocusField,
  findListFocusLabel,
} from "../src/doc-chrome.js";

describe("doc-chrome toolbar groups", () => {
  it("defines File + Navigate groups", () => {
    assert.deepEqual(
      DOC_TOOLBAR_GROUPS.map((g) => g.id),
      ["fileRetention", "navigate"],
    );
  });

  it("maps shipped Bill buttons into groups", () => {
    assert.equal(toolbarGroupForButton("btn-save"), "fileRetention");
    assert.equal(toolbarGroupForButton("btn-submit"), "fileRetention");
    assert.equal(toolbarGroupForButton("btn-revert"), "fileRetention");
    assert.equal(toolbarGroupForButton("btn-print"), "fileRetention");
    assert.equal(toolbarGroupForButton("btn-find"), "navigate");
    assert.equal(toolbarGroupForButton("btn-new"), "navigate");
    assert.equal(toolbarGroupForButton("btn-select-po"), "navigate");
    assert.equal(toolbarGroupForButton("btn-refresh"), "navigate");
    assert.equal(toolbarGroupForButton("btn-vanilla"), "navigate");
    assert.equal(DOC_TOOLBAR_BUTTON_GROUP["btn-delete"], "fileRetention");
    assert.equal(DOC_TOOLBAR_BUTTON_GROUP["btn-copy"], "navigate");
  });

  it("explains Refresh vs Revert in the title", () => {
    assert.match(REFRESH_BUTTON_TITLE, /Re-read/i);
    assert.match(REFRESH_BUTTON_TITLE, /Revert/i);
    assert.match(REFRESH_BUTTON_TITLE, /not force ERP tax recalc/i);
  });
});

describe("docLifecyclePill", () => {
  it("covers draft / dirty / submitted states", () => {
    assert.equal(docLifecyclePill({ isDraft: true, userEdited: false }).tone, "draft");
    assert.equal(docLifecyclePill({ isDraft: true, userEdited: true }).tone, "draft-dirty");
    assert.equal(docLifecyclePill({ isDraft: false, userEdited: false }).tone, "posted");
    assert.equal(docLifecyclePill({ isDraft: false, userEdited: true }).tone, "posted-dirty");
    assert.match(docLifecyclePill({ isDraft: true, userEdited: true }).text, /unsaved/i);
    assert.match(docLifecyclePill({ isDraft: false, userEdited: false }).text, /Submitted/i);
  });

  it("blank new doc copy when nothing saved yet", () => {
    const pill = docLifecyclePill({ isDraft: true, userEdited: false, isNewBlank: true });
    assert.match(pill.text, /Blank draft/i);
    assert.match(pill.text, /nothing to save/i);
  });
});

describe("focusFinalizeControl", () => {
  it("returns false without an element", () => {
    assert.equal(focusFinalizeControl(null), false);
  });

  it("focuses a stub submit control without activating (.click)", () => {
    let focused = false;
    let clicked = false;
    const stub = {
      focus() {
        focused = true;
      },
      click() {
        clicked = true;
      },
      scrollIntoView() {},
    };
    assert.equal(focusFinalizeControl(stub), true);
    assert.equal(focused, true);
    assert.equal(clicked, false);
  });
});

describe("racePromise / findListFocusField", () => {
  it("racePromise resolves true when promise wins", async () => {
    assert.equal(await racePromise(Promise.resolve(1), 50), true);
  });

  it("racePromise resolves false on timeout", async () => {
    assert.equal(
      await racePromise(new Promise(() => {}), 20),
      false,
    );
  });

  it("Find Bill focuses Supplier Invoice No.; PO/IR focus ID", () => {
    assert.equal(findListFocusField("purchase-invoice"), "bill_no");
    assert.equal(findListFocusLabel("purchase-invoice"), "Supplier Invoice No.");
    assert.equal(findListFocusField("purchase-order"), "name");
    assert.equal(findListFocusLabel("purchase-order"), "ID");
    assert.equal(findListFocusField("purchase-receipt"), "name");
    assert.equal(findListFocusLabel("purchase-receipt"), "ID");
    assert.equal(findListFocusField("other"), null);
  });
});
