import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../electron/${rel}`, import.meta.url), "utf8");
const docWashCss = read("doc-wash.css");
const homeHtml = read("home.html");

/**
 * 5zorro 2026-09-16: a dashboard spends the screen it is given; a document keeps a narrow
 * column on purpose. Home read as a document and scrolled in a maximized 1080p window while
 * ~600px of width sat unused beside it. The caps live in one place so a new target size is a
 * value change, not a hunt through every surface.
 */
describe("surface width tokens", () => {
  it("doc-wash.css defines both caps, dashboard wider than document", () => {
    const dashboard = /--surface-dashboard-max:\s*(\d+)px/.exec(docWashCss);
    const document_ = /--surface-document-max:\s*(\d+)px/.exec(docWashCss);
    assert.ok(dashboard, "missing --surface-dashboard-max");
    assert.ok(document_, "missing --surface-document-max");
    assert.ok(Number(dashboard[1]) > Number(document_[1]));
  });

  it("Home's tile grid and dev strip both use the dashboard cap", () => {
    const uses = homeHtml.match(/max-width:\s*var\(--surface-dashboard-max/g) || [];
    assert.equal(uses.length, 2, "both .wrap and .dev-strip must follow the same cap");
  });

  it("Home fits a maximized 1080p window — the cap may not shrink back", () => {
    // Content measured 920px tall at this cap; the view is ~954px once the toolbar (46px),
    // a title bar and a taskbar are taken off 1080. At the old 1120px cap it was 1020px.
    const px = Number(/--surface-dashboard-max:\s*(\d+)px/.exec(docWashCss)[1]);
    assert.ok(px >= 1500, `dashboard cap ${px}px is too narrow to keep Home on one screen`);
  });
});
