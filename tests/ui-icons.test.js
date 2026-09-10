import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenHomeTiles, HOME_GROUPS } from "../src/home-tiles.js";
import {
  uiIconHtml,
  uiIconSvg,
  copyTableIconHtml,
  copyTotalIconHtml,
  homeTileIconHtml,
  HOME_TILE_ICON,
  missingHomeTileIcons,
  HOME_GROUP_ICON,
  groupIconSvg,
  homeGroupIconHtml,
  missingHomeGroupIcons,
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

describe("home group header glyphs (vanilla Desk module icon reuse)", () => {
  it("every Home group id has a header glyph mapping", () => {
    const ids = [...HOME_GROUPS.left, ...HOME_GROUPS.right].map((g) => g.id);
    assert.equal(missingHomeGroupIcons(ids).length, 0);
    assert.equal(Object.keys(HOME_GROUP_ICON).length, ids.length);
  });

  it("groupIconSvg renders a solid 54x54 glyph, no stroke", () => {
    const svg = groupIconSvg("buying");
    assert.match(svg, /viewBox="0 0 54 54"/);
    assert.match(svg, /fill="currentColor"/);
    assert.doesNotMatch(svg, /stroke=/);
  });

  it("unknown group glyph name renders nothing (no idle fallback)", () => {
    assert.equal(groupIconSvg("not-a-real-group"), "");
    assert.equal(homeGroupIconHtml("not-a-real-group"), "");
  });

  it("homeGroupIconHtml wraps the glyph for a real Home group id", () => {
    assert.match(homeGroupIconHtml("vendors"), /ui-ico--group/);
    assert.match(homeGroupIconHtml("banking"), /viewBox="0 0 54 54"/);
  });
});
