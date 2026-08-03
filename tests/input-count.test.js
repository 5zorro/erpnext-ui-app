import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeInteractables } from "../src/interactable-scrape.js";
import {
  summarizeInputCounts,
  tabCycleCount,
  advertisingBarSegments,
  evaluateSimplifiedMvpCeiling,
  completenessGate,
} from "../src/input-count.js";
import {
  BILL_DOC_CURATED,
  BILL_DOC_INVENTORY_META,
} from "../src/inventories/bill-doc-inventory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const billHtml = readFileSync(join(root, "electron/bill.html"), "utf8");
const vanillaHtml = readFileSync(
  join(root, "tests/fixtures/bill-vanilla-form.fixture.html"),
  "utf8",
);

describe("input-count summarize", () => {
  it("adds mode-switch effort", () => {
    const s = summarizeInputCounts([
      { kind: "text", modeSwitch: "none" },
      { kind: "money", modeSwitch: "tenkey" },
      { kind: "date", modeSwitch: "date" },
    ]);
    assert.equal(s.interactableCount, 3);
    assert.equal(s.modeSwitchCount, 2);
    assert.equal(s.effort, 5);
    assert.equal(s.byModeSwitch.tenkey, 1);
    assert.equal(s.byModeSwitch.date, 1);
  });

  it("builds stacked-bar advertising segments (blank / sourced / save path)", () => {
    const blank = [
      { kind: "text", modeSwitch: "none" },
      { kind: "text", modeSwitch: "none" },
      { kind: "money", modeSwitch: "tenkey" },
      { kind: "date", modeSwitch: "date" },
    ];
    const sourced = [
      { kind: "text", modeSwitch: "none" },
      { kind: "money", modeSwitch: "tenkey" },
    ];
    const savePath = [
      { kind: "money", modeSwitch: "tenkey" },
      { kind: "button", modeSwitch: "none" },
    ];
    assert.equal(tabCycleCount(blank), 4);
    const bar = advertisingBarSegments({
      blankItems: blank,
      sourcedItems: sourced,
      savePathItems: savePath,
    });
    assert.deepEqual(bar, {
      blankTabCycle: 4,
      sourcedTabCycle: 2,
      requiredModeSwitches: 1,
      minimalSaveFromSourced: 3,
    });
    // Early S0: omit save path → sourced inventory is the proxy.
    const proxy = advertisingBarSegments({ blankItems: blank, sourcedItems: sourced });
    assert.equal(proxy.minimalSaveFromSourced, sourced.length + 1);
  });
});

describe("Bill anchor N_d / N_v (plan S0)", () => {
  it("reports Doc curated + Vanilla fixture counts and Doc thinner than Vanilla", () => {
    const docScrape = scrapeInteractables(billHtml);
    const docWarm = summarizeInputCounts(BILL_DOC_CURATED);
    const vanilla = summarizeInputCounts(scrapeInteractables(vanillaHtml).items);

    const N_d = docWarm.interactableCount;
    const N_v = vanilla.interactableCount;

    assert.equal(BILL_DOC_INVENTORY_META.anchor, "purchase-invoice");
    assert.ok(N_d > docScrape.count, "curated includes synthetic line template");
    assert.ok(N_v > N_d, `advertising: N_v (${N_v}) > N_d (${N_d})`);

    const ceiling = evaluateSimplifiedMvpCeiling({
      N_d,
      N_v,
      docEffort: docWarm.effort,
      vanillaEffort: vanilla.effort,
    });
    assert.equal(ceiling.ok, true, ceiling.reasons.join("; "));
    assert.ok(ceiling.targets.thinMax >= N_d);
    assert.ok(ceiling.targets.expandedMin <= N_v);

    // Stable snapshot for marketing / mockup discussions (update when inventory intentional).
    assert.ok(N_d >= 30 && N_d <= 45, `unexpected N_d=${N_d}`);
    assert.ok(N_v >= 50 && N_v <= 80, `unexpected N_v=${N_v}`);
  });

  it("completenessGate fails on unknowns", () => {
    assert.equal(completenessGate([]).ok, true);
    assert.deepEqual(completenessGate(["x"]).missing, ["x"]);
  });
});
