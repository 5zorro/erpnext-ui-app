#!/usr/bin/env node
/**
 * Render docs/images/input-count-chart.svg — the README's "Measured Performance Gains"
 * grouped bar chart.
 *
 * Counts are recomputed here from the *same* sources `npm run report:input-count` uses
 * (curated Doc inventories, Vanilla fixtures, Simplified seed profiles), never typed in.
 * That is deliberate: the first version of this chart was drawn by a throwaway script that
 * was not kept, so the next time a toolbar button landed the published numbers silently
 * went stale with no way to redraw them. Re-run this whenever the report moves.
 *
 * Usage: npm run chart:input-count
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeInteractables } from "../../src/interactable-scrape.js";
import { summarizeInputCounts, simplifiedInteractables } from "../../src/input-count.js";
import { SEED_PROFILES } from "../../src/simplified-seed-profiles.js";
import { BILL_DOC_CURATED } from "../../src/inventories/bill-doc-inventory.js";
import { PO_DOC_CURATED, RECEIPT_DOC_CURATED } from "../../src/inventories/doc-form-inventory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** @type {readonly { doctype: string, label: string, sub: string, curated: readonly object[], fixture: string }[]} */
const ANCHORS = [
  {
    doctype: "Purchase Invoice",
    label: "Bill",
    sub: "(Purchase Invoice)",
    curated: BILL_DOC_CURATED,
    fixture: "tests/fixtures/bill-vanilla-form.fixture.html",
  },
  {
    doctype: "Purchase Order",
    label: "Purchase Order",
    sub: "",
    curated: PO_DOC_CURATED,
    fixture: "tests/fixtures/po-vanilla-form.fixture.html",
  },
  {
    doctype: "Purchase Receipt",
    label: "Item Receipt",
    sub: "(Purchase Receipt)",
    curated: RECEIPT_DOC_CURATED,
    fixture: "tests/fixtures/receipt-vanilla-form.fixture.html",
  },
];

const groups = ANCHORS.map((a) => {
  const vanilla = scrapeInteractables(read(a.fixture)).items;
  return {
    label: a.label,
    sub: a.sub,
    values: [
      summarizeInputCounts(vanilla).interactableCount,
      summarizeInputCounts(simplifiedInteractables(vanilla, SEED_PROFILES[a.doctype] || null))
        .interactableCount,
      summarizeInputCounts(a.curated).interactableCount,
    ],
  };
});

// Validated categorical palette, light mode (dataviz skill): blue / orange / aqua.
const SERIES = [
  { name: "Vanilla ERPNext", color: "#2a78d6" },
  { name: "Default-Simplified skin", color: "#eb6834" },
  { name: "Doc skin", color: "#1baf7a" },
];
const INK = "#0b0b0b";
const INK2 = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

const W = 760;
const H = 480;
const BASELINE = 380;
const TOP = 108;
const Y_MAX = 70;
const STEP = 10;
const BAR_W = 24;
const BAR_GAP = 2;
const PLOT_L = 56;
const PLOT_R = 728;

const yOf = (v) => BASELINE - (v / Y_MAX) * (BASELINE - TOP);
const t = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""} font-size="${
    o.size || 12
  }"${o.weight ? ` font-weight="${o.weight}"` : ""} fill="${
    o.fill || INK
  }" font-family="${FONT}">${s}</text>`;

const parts = [];
const alt = `Grouped bar chart: interactable UI element counts per transaction type, comparing Vanilla ERPNext, Simplified skin, and Doc skin. ${groups
  .map((g) => `${g.label}: ${g.values.join(", ")}.`)
  .join(" ")}`;
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${alt}">`,
);
parts.push(
  `  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="#fcfcfb" stroke="rgba(11,11,11,0.10)"/>`,
);
parts.push(
  "  " + t(24, 34, "Interactable fields &amp; controls per transaction", { size: 14, weight: 600 }),
);
parts.push(
  "  " +
    t(24, 54, "Lower is better — one representative one-line transaction per doctype", {
      size: 12,
      fill: MUTED,
    }),
);

// Legend on its own row, centred — a legend sharing the title's band collided with it.
const legendGap = 190;
const legendStart = (W - (SERIES.length - 1) * legendGap) / 2 - 95;
parts.push(
  "  " +
    SERIES.map((s, i) => {
      const x = legendStart + i * legendGap;
      return `<rect x="${x}" y="72" width="12" height="12" rx="3" fill="${s.color}"/>${t(
        x + 18,
        82,
        s.name,
        { fill: INK2 },
      )}`;
    }).join(""),
);

const ticks = [];
for (let v = 0; v <= Y_MAX; v += STEP) ticks.push(v);
parts.push(
  "  " +
    ticks
      .map(
        (v) =>
          `<line x1="${PLOT_L}" y1="${yOf(v).toFixed(1)}" x2="${PLOT_R}" y2="${yOf(v).toFixed(
            1,
          )}" stroke="${GRID}" stroke-width="1"/>`,
      )
      .join(""),
);
parts.push(
  `  <line x1="${PLOT_L}" y1="${BASELINE}" x2="${PLOT_R}" y2="${BASELINE}" stroke="${AXIS}" stroke-width="1"/>`,
);
parts.push(
  "  " +
    ticks
      .map((v) => t(46, (yOf(v) + 4).toFixed(1), String(v), { anchor: "end", size: 11, fill: MUTED }))
      .join(""),
);
parts.push("  " + t(20, 94, "Interactables", { size: 11, fill: MUTED }));

const clusterW = SERIES.length * BAR_W + (SERIES.length - 1) * BAR_GAP;
const band = (PLOT_R - PLOT_L) / groups.length;
const centres = groups.map((_, i) => PLOT_L + band * (i + 0.5));

const bars = [];
const labels = [];
groups.forEach((g, gi) => {
  const x0 = centres[gi] - clusterW / 2;
  g.values.forEach((v, si) => {
    const x = x0 + si * (BAR_W + BAR_GAP);
    const y = yOf(v);
    const h = BASELINE - y;
    // Rounded cap, square foot: the rounded rect plus a 4px square patch at the baseline.
    bars.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${BAR_W}" height="${h.toFixed(
        1,
      )}" rx="4" ry="4" fill="${SERIES[si].color}"/><rect x="${x.toFixed(1)}" y="${
        BASELINE - 4
      }" width="${BAR_W}" height="4" fill="${SERIES[si].color}"/>`,
    );
    labels.push(
      t((x + BAR_W / 2).toFixed(1), (y - 8).toFixed(1), String(v), {
        anchor: "middle",
        size: 13,
        weight: 600,
      }),
    );
  });
});
parts.push("  " + bars.join(""));
// Direct value labels are the accessibility relief for the aqua series' sub-3:1 contrast.
parts.push("  " + labels.join(""));

parts.push(
  "  " +
    groups
      .map((g, gi) => {
        const cx = centres[gi].toFixed(1);
        const main = t(cx, 404, g.label, { anchor: "middle", size: 13, weight: 600 });
        return g.sub ? main + t(cx, 420, g.sub, { anchor: "middle", size: 11, fill: INK2 }) : main;
      })
      .join(""),
);
parts.push(
  "  " +
    t(
      PLOT_R,
      464,
      "npm run report:input-count · fixture-based, PO/IR not yet dogfooded — docs/input-count-gotchas.md",
      { anchor: "end", size: 10, fill: MUTED },
    ),
);
parts.push("</svg>");

const out = join(root, "docs/images/input-count-chart.svg");
writeFileSync(out, parts.join("\n") + "\n", "utf8");
console.log("wrote docs/images/input-count-chart.svg");
groups.forEach((g) => console.log(`  ${g.label.padEnd(16)} ${g.values.join(" / ")}  (N_v / N_s / N_d)`));
