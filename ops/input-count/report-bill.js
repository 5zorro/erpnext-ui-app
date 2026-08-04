#!/usr/bin/env node
/**
 * Print Bill input-count dogfood report (Doc curated + static scrape vs Vanilla fixture).
 * Usage: node ops/input-count/report-bill.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeInteractables } from "../../src/interactable-scrape.js";
import {
  summarizeInputCounts,
  advertisingBarSegments,
} from "../../src/input-count.js";
import {
  BILL_DOC_CURATED,
  BILL_DOC_INVENTORY_META,
} from "../../src/inventories/bill-doc-inventory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const billHtml = readFileSync(join(root, "electron/bill.html"), "utf8");
const vanillaHtml = readFileSync(
  join(root, "tests/fixtures/bill-vanilla-form.fixture.html"),
  "utf8",
);

const docStatic = scrapeInteractables(billHtml);
const docStaticSum = summarizeInputCounts(docStatic.items);
const docWarm = summarizeInputCounts(BILL_DOC_CURATED);
const van = scrapeInteractables(vanillaHtml);
const vanSum = summarizeInputCounts(van.items);

const docBar = advertisingBarSegments({
  blankItems: BILL_DOC_CURATED,
  sourcedItems: BILL_DOC_CURATED,
});
const vanBar = advertisingBarSegments({
  blankItems: van.items,
  sourcedItems: van.items,
});

function line(label, v) {
  console.log(`${label.padEnd(28)} ${v}`);
}

console.log("Bill input-count dogfood report");
console.log(`Anchor: ${BILL_DOC_INVENTORY_META.doctype} (${BILL_DOC_INVENTORY_META.anchor})`);
console.log("Lenses: Vanilla fixture · Doc curated (warm) · Doc static scrape");
console.log("Competitors: omitted (legal risk). See docs/input-count-gotchas.md\n");

console.log("--- Totals ---");
line("Doc curated N_d", docWarm.interactableCount);
line("Doc curated effort", docWarm.effort);
line("Doc static scrape", docStaticSum.interactableCount);
line("Vanilla fixture N_v", vanSum.interactableCount);
line("Vanilla fixture effort", vanSum.effort);
line("N_v > N_d?", vanSum.interactableCount > docWarm.interactableCount ? "yes" : "NO");
console.log("");

console.log("--- Advertising bar proxy (blank ≈ sourced until sourced fixtures) ---");
console.log("Doc curated:", docBar);
console.log("Vanilla:    ", vanBar);
console.log("");

console.log("--- Doc curated by kind / mode ---");
console.log(docWarm.byKind);
console.log(docWarm.byModeSwitch);
console.log("");

console.log("--- Vanilla fixture by kind / mode ---");
console.log(vanSum.byKind);
console.log(vanSum.byModeSwitch);
console.log("");

console.log("--- Doc curated inventory ---");
BILL_DOC_CURATED.forEach((i, n) => {
  const syn = i.synthetic ? " [synthetic]" : "";
  console.log(
    `${String(n + 1).padStart(2)}  ${(i.modeSwitch || "none").padEnd(6)}  ${(i.kind || "").padEnd(10)}  ${i.id}${syn}`,
  );
});
console.log("");

console.log("--- Vanilla fixture inventory ---");
van.items.forEach((i, n) => {
  console.log(
    `${String(n + 1).padStart(2)}  ${(i.modeSwitch || "none").padEnd(6)}  ${(i.kind || "").padEnd(10)}  ${i.id}${i.field ? `  (${i.field})` : ""}`,
  );
});
console.log("");
console.log("Dogfood: walk both lists in the app; mark mismatches in docs/input-count-gotchas.md.");
