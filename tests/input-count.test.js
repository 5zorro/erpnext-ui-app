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
  simplifiedInteractables,
} from "../src/input-count.js";
import { SEED_PROFILES } from "../src/simplified-seed-profiles.js";
import {
  BILL_DOC_CURATED,
  BILL_DOC_INVENTORY_META,
} from "../src/inventories/bill-doc-inventory.js";
import {
  PO_DOC_CURATED,
  PO_DOC_INVENTORY_META,
  RECEIPT_DOC_CURATED,
  RECEIPT_DOC_INVENTORY_META,
} from "../src/inventories/doc-form-inventory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docFormHtml = readFileSync(join(root, "electron/doc-form.html"), "utf8");
const chromeHtml = readFileSync(join(root, "electron/doc-chrome.fragment.html"), "utf8");
const billBodyHtml = readFileSync(join(root, "electron/bill-shell.fragment.html"), "utf8");
const billHtml = chromeHtml + "\n" + billBodyHtml;
const vanillaBillHtml = readFileSync(
  join(root, "tests/fixtures/bill-vanilla-form.fixture.html"),
  "utf8",
);
const vanillaPoHtml = readFileSync(
  join(root, "tests/fixtures/po-vanilla-form.fixture.html"),
  "utf8",
);
const vanillaReceiptHtml = readFileSync(
  join(root, "tests/fixtures/receipt-vanilla-form.fixture.html"),
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
    const vanilla = summarizeInputCounts(scrapeInteractables(vanillaBillHtml).items);

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
    assert.ok(N_d >= 30 && N_d <= 60, `unexpected N_d=${N_d}`);
    assert.ok(N_v >= 50 && N_v <= 80, `unexpected N_v=${N_v}`);
  });

  it("completenessGate fails on unknowns", () => {
    assert.equal(completenessGate([]).ok, true);
    assert.deepEqual(completenessGate(["x"]).missing, ["x"]);
  });
});

describe("PO anchor N_d / N_v", () => {
  it("Doc curated thinner than Vanilla PO fixture", () => {
    const docWarm = summarizeInputCounts(PO_DOC_CURATED);
    const vanilla = summarizeInputCounts(scrapeInteractables(vanillaPoHtml).items);
    const N_d = docWarm.interactableCount;
    const N_v = vanilla.interactableCount;

    assert.equal(PO_DOC_INVENTORY_META.anchor, "purchase-order");
    assert.ok(N_v > N_d, `advertising: N_v (${N_v}) > N_d (${N_d})`);
    assert.ok(N_d >= 35 && N_d <= 55, `unexpected PO N_d=${N_d}`);
    assert.ok(N_v >= 55 && N_v <= 85, `unexpected PO N_v=${N_v}`);

    const ceiling = evaluateSimplifiedMvpCeiling({
      N_d,
      N_v,
      docEffort: docWarm.effort,
      vanillaEffort: vanilla.effort,
    });
    assert.equal(ceiling.ok, true, ceiling.reasons.join("; "));
  });
});

describe("Item Receipt anchor N_d / N_v", () => {
  it("Doc curated thinner than Vanilla PR fixture", () => {
    const docWarm = summarizeInputCounts(RECEIPT_DOC_CURATED);
    const vanilla = summarizeInputCounts(scrapeInteractables(vanillaReceiptHtml).items);
    const N_d = docWarm.interactableCount;
    const N_v = vanilla.interactableCount;

    assert.equal(RECEIPT_DOC_INVENTORY_META.anchor, "item-receipt");
    assert.ok(N_v > N_d, `advertising: N_v (${N_v}) > N_d (${N_d})`);
    assert.ok(N_d >= 50 && N_d <= 70, `unexpected IR N_d=${N_d}`);
    assert.ok(N_v >= 65 && N_v <= 95, `unexpected IR N_v=${N_v}`);

    const ceiling = evaluateSimplifiedMvpCeiling({
      N_d,
      N_v,
      docEffort: docWarm.effort,
      vanillaEffort: vanilla.effort,
    });
    assert.equal(ceiling.ok, true, ceiling.reasons.join("; "));
  });

  it("doc-form static scrape stays thinner than Vanilla PR fixture", () => {
    const docStatic = scrapeInteractables(docFormHtml);
    const vanilla = scrapeInteractables(vanillaReceiptHtml);
    assert.ok(vanilla.count > docStatic.count);
  });
});

describe("simplifiedInteractables (Vanilla minus seed) all three anchors", () => {
  it("drops only fields the seed assumes; keeps null-field items", () => {
    const items = [
      { field: "cost_center" },
      { field: "supplier" },
      { field: null },
    ];
    const kept = simplifiedInteractables(items, { cost_center: "L2" });
    assert.deepEqual(kept, [{ field: "supplier" }, { field: null }]);
  });

  it("returns all items unchanged when no seed is given", () => {
    const items = [{ field: "supplier" }];
    assert.deepEqual(simplifiedInteractables(items, null), items);
  });

  it("Bill: Simplified lens is strictly thinner than Vanilla", () => {
    const vanilla = scrapeInteractables(vanillaBillHtml).items;
    const simplified = simplifiedInteractables(vanilla, SEED_PROFILES["Purchase Invoice"]);
    assert.ok(simplified.length < vanilla.length);
  });

  it("PO: Simplified lens drops at least one seeded field present in the fixture", () => {
    const vanilla = scrapeInteractables(vanillaPoHtml).items;
    const simplified = simplifiedInteractables(vanilla, SEED_PROFILES["Purchase Order"]);
    assert.ok(simplified.length < vanilla.length);
  });

  it("Item Receipt: Simplified lens drops at least one seeded field present in the fixture", () => {
    const vanilla = scrapeInteractables(vanillaReceiptHtml).items;
    const simplified = simplifiedInteractables(vanilla, SEED_PROFILES["Purchase Receipt"]);
    assert.ok(simplified.length < vanilla.length);
  });
});
