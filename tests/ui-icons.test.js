import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenHomeTiles } from "../src/home-tiles.js";
import {
  uiIconHtml,
  uiIconSvg,
  copyTableIconHtml,
  copyTotalIconHtml,
  homeTileIconHtml,
  HOME_TILE_ICON,
  missingHomeTileIcons,
} from "../src/ui-icons.js";

describe("ui-icons", () => {
  it("renders SVG without emoji codepoints", () => {
    const html = uiIconHtml("copy");
    assert.match(html, /<svg[\s\S]*<\/svg>/);
    assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}]/u);
  });

  it("copy helpers wrap icons", () => {
    assert.match(copyTotalIconHtml(), /ui-ico/);
    assert.match(copyTableIconHtml(), /ui-ico--calc/);
  });

  it("every home tile id has an icon mapping", () => {
    const ids = flattenHomeTiles().map((t) => t.id);
    assert.equal(missingHomeTileIcons(ids).length, 0);
    assert.equal(Object.keys(HOME_TILE_ICON).length, ids.length);
  });

  it("homeTileIconHtml returns larger default size", () => {
    assert.match(homeTileIconHtml("bill-new"), /width="20"/);
  });

  it("unknown icon falls back to idle dot", () => {
    assert.match(uiIconSvg("not-a-real-icon"), /circle/);
  });
});
