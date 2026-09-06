/**
 * Shared printer for input-count dogfood reports (Doc curated vs Vanilla fixture).
 */

import { readFileSync } from "node:fs";
import { scrapeInteractables } from "../../src/interactable-scrape.js";
import {
  summarizeInputCounts,
  advertisingBarSegments,
  simplifiedInteractables,
} from "../../src/input-count.js";
import { SEED_PROFILES } from "../../src/simplified-seed-profiles.js";

/**
 * @typedef {{
 *   title: string,
 *   meta: { anchor: string, doctype: string, lens?: string, surface?: string, profileId?: string },
 *   docCurated: readonly { id: string, kind?: string, modeSwitch?: string, synthetic?: boolean }[],
 *   docHtmlPath?: string,
 *   docHtml?: string,
 *   vanillaFixturePath: string,
 * }} ReportConfig
 */

/**
 * @param {ReportConfig} cfg
 */
export function printInputCountReport(cfg) {
  const billHtml =
    cfg.docHtml ??
    readFileSync(cfg.docHtmlPath, "utf8");
  const vanillaHtml = readFileSync(cfg.vanillaFixturePath, "utf8");

  const docStatic = scrapeInteractables(billHtml);
  const docStaticSum = summarizeInputCounts(docStatic.items);
  const docWarm = summarizeInputCounts(cfg.docCurated);
  const van = scrapeInteractables(vanillaHtml);
  const vanSum = summarizeInputCounts(van.items);

  const seed = SEED_PROFILES[cfg.meta.doctype] || null;
  const simplifiedItems = simplifiedInteractables(van.items, seed);
  const simplifiedSum = summarizeInputCounts(simplifiedItems);

  const docBar = advertisingBarSegments({
    blankItems: cfg.docCurated,
    sourcedItems: cfg.docCurated,
  });
  const vanBar = advertisingBarSegments({
    blankItems: van.items,
    sourcedItems: van.items,
  });
  const simplifiedBar = seed
    ? advertisingBarSegments({ blankItems: simplifiedItems, sourcedItems: simplifiedItems })
    : null;

  /** @param {string} label @param {string|number|boolean} v */
  function line(label, v) {
    console.log(`${label.padEnd(28)} ${v}`);
  }

  console.log(cfg.title);
  console.log(`Anchor: ${cfg.meta.doctype} (${cfg.meta.anchor})`);
  if (cfg.meta.profileId) console.log(`Profile: ${cfg.meta.profileId}`);
  if (cfg.meta.surface) console.log(`Surface: ${cfg.meta.surface}`);
  console.log("Lenses: Vanilla fixture · Simplified (Vanilla − seed) · Doc curated (warm) · Doc static scrape");
  console.log("Competitors: omitted (legal risk). See docs/input-count-gotchas.md\n");

  console.log("--- Totals ---");
  line("Doc curated N_d", docWarm.interactableCount);
  line("Doc curated effort", docWarm.effort);
  line("Doc static scrape", docStaticSum.interactableCount);
  line("Simplified N_s", seed ? simplifiedSum.interactableCount : "n/a (no seed)");
  line("Simplified effort", seed ? simplifiedSum.effort : "n/a (no seed)");
  line("Vanilla fixture N_v", vanSum.interactableCount);
  line("Vanilla fixture effort", vanSum.effort);
  line("N_v > N_d?", vanSum.interactableCount > docWarm.interactableCount ? "yes" : "NO");
  line("N_v > N_s?", seed ? (vanSum.interactableCount > simplifiedSum.interactableCount ? "yes" : "NO") : "n/a");
  console.log("");

  console.log("--- Advertising bar proxy (blank ≈ sourced until sourced fixtures) ---");
  console.log("Doc curated:", docBar);
  if (simplifiedBar) console.log("Simplified: ", simplifiedBar);
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
  cfg.docCurated.forEach((i, n) => {
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
  console.log(
    "Dogfood: walk both lists in the app; mark mismatches in docs/input-count-gotchas.md.",
  );

  return {
    N_d: docWarm.interactableCount,
    N_v: vanSum.interactableCount,
    N_s: seed ? simplifiedSum.interactableCount : null,
    docEffort: docWarm.effort,
    vanillaEffort: vanSum.effort,
    simplifiedEffort: seed ? simplifiedSum.effort : null,
    docStaticCount: docStaticSum.interactableCount,
  };
}
