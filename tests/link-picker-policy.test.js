import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  initialLinkHighlightIndex,
  nextLinkHighlightIndex,
  resolveLinkPickIndex,
  linkPickerKeyAction,
} from "../src/link-picker-policy.js";

describe("initialLinkHighlightIndex", () => {
  it("highlights first when any options", () => {
    assert.equal(initialLinkHighlightIndex(0), -1);
    assert.equal(initialLinkHighlightIndex(1), 0);
    assert.equal(initialLinkHighlightIndex(5), 0);
  });
});

describe("nextLinkHighlightIndex", () => {
  it("moves within bounds", () => {
    assert.equal(nextLinkHighlightIndex(-1, 3, "down"), 0);
    assert.equal(nextLinkHighlightIndex(0, 3, "down"), 1);
    assert.equal(nextLinkHighlightIndex(2, 3, "down"), 2);
    assert.equal(nextLinkHighlightIndex(2, 3, "up"), 1);
    assert.equal(nextLinkHighlightIndex(0, 3, "up"), 0);
  });
});

describe("resolveLinkPickIndex", () => {
  it("uses highlight or falls back to first", () => {
    assert.equal(resolveLinkPickIndex(2, 4), 2);
    assert.equal(resolveLinkPickIndex(-1, 4), 0);
    assert.equal(resolveLinkPickIndex(0, 0), -1);
  });
});

describe("linkPickerKeyAction", () => {
  it("Tab/Enter pick when open with options", () => {
    assert.equal(linkPickerKeyAction("Tab", { dropdownOpen: true, optionCount: 2 }), "pick");
    assert.equal(linkPickerKeyAction("Enter", { dropdownOpen: true, optionCount: 1 }), "pick");
    assert.equal(linkPickerKeyAction("Tab", { dropdownOpen: false, optionCount: 2 }), "none");
    assert.equal(linkPickerKeyAction("Escape", { dropdownOpen: true, optionCount: 2 }), "close");
    assert.equal(linkPickerKeyAction("ArrowDown", { dropdownOpen: false, optionCount: 0 }), "search");
    assert.equal(linkPickerKeyAction("ArrowDown", { dropdownOpen: true, optionCount: 3 }), "move_down");
  });
});
