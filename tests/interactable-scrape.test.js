import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scrapeInteractables,
  curatedMissingIds,
  parseAttrs,
  inferModeSwitch,
  preprocessHtmlForScrape,
} from "../src/interactable-scrape.js";
import { BILL_DOC_CURATED } from "../src/inventories/bill-doc-inventory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const billHtml = readFileSync(join(root, "electron/bill.html"), "utf8");
const vanillaHtml = readFileSync(
  join(root, "tests/fixtures/bill-vanilla-form.fixture.html"),
  "utf8",
);

describe("interactable-scrape helpers", () => {
  it("parseAttrs reads quoted and bare values", () => {
    const a = parseAttrs(`id="x" data-field='supplier' disabled class=btn`);
    assert.equal(a.id, "x");
    assert.equal(a["data-field"], "supplier");
    assert.equal(a.disabled, "");
    assert.equal(a.class, "btn");
  });

  it("inferModeSwitch classifies date vs tenkey vs none", () => {
    assert.equal(
      inferModeSwitch({ "data-testid": "bill-date", inputmode: "numeric" }, "input"),
      "date",
    );
    assert.equal(
      inferModeSwitch({ "data-testid": "bill-amount-due", inputmode: "decimal" }, "input"),
      "tenkey",
    );
    assert.equal(inferModeSwitch({ "data-testid": "bill-vendor" }, "input"), "none");
  });

  it("preprocess drops hidden subtrees and scripts", () => {
    const html = `
      <div><button id="keep">K</button></div>
      <div class="commit-gate" hidden><button id="gate">G</button></div>
      <script>evil()</script>
      <button type="button" id="retry" hidden>R</button>
    `;
    const out = preprocessHtmlForScrape(html);
    assert.match(out, /keep/);
    assert.doesNotMatch(out, /gate/);
    assert.doesNotMatch(out, /evil/);
    assert.doesNotMatch(out, /retry/);
  });
});

describe("scrape Bill Doc electron/bill.html", () => {
  it("finds clerk-path interactables and skips address readonly", () => {
    const { items, count } = scrapeInteractables(billHtml);
    assert.ok(count >= 20, `expected dense toolbar+header, got ${count}`);
    const ids = new Set(items.map((i) => i.id));
    assert.ok(ids.has("bill-save"));
    assert.ok(ids.has("bill-vendor"));
    assert.ok(ids.has("bill-amount-due"));
    assert.ok(ids.has("bill-assumptions"));
    assert.equal(ids.has("bill-address"), false, "readonly address excluded");
    assert.equal(ids.has("bill-gate-save"), false, "hidden commit-gate excluded");
    assert.equal(ids.has("bill-retry"), false, "hidden retry excluded");
  });

  it("curated inventory covers every scraped id (completeness gate)", () => {
    const { items } = scrapeInteractables(billHtml);
    const missing = curatedMissingIds(items, BILL_DOC_CURATED);
    assert.deepEqual(
      missing,
      [],
      `curated Bill Doc inventory missing scrape ids:\n  ${missing.join("\n  ")}`,
    );
  });
});

describe("scrape Vanilla PI fixture", () => {
  it("is denser than Doc static scrape (advertising N_v > N_d static)", () => {
    const doc = scrapeInteractables(billHtml);
    const van = scrapeInteractables(vanillaHtml);
    assert.ok(
      van.count > doc.count,
      `expected Vanilla fixture (${van.count}) > Doc static (${doc.count})`,
    );
  });
});
