#!/usr/bin/env node
/**
 * Emit AP dogfood source HTML (+ optional PDF via Playwright).
 *
 *   node ops/sample-data/emit-dogfood-sources.js
 *   node ops/sample-data/emit-dogfood-sources.js --pdf
 *
 * Output: ops/sample-data/dogfood-sources/generated/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOGFOOD_SOURCES, listDogfoodSourceIndex } from "../../src/sample-data/dogfood-ap-sources.js";
import { renderDogfoodSourceHtml } from "../../src/sample-data/render-dogfood-html.js";
import { buildMessyImportPaste, MESSY_VENDOR_11COL } from "../../src/sample-data/dogfood-import-paste.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "dogfood-sources", "generated");
const wantPdf = process.argv.includes("--pdf");

fs.mkdirSync(outDir, { recursive: true });

/** @type {{ id: string, html: string, pdf?: string }[]} */
const written = [];

for (const doc of DOGFOOD_SOURCES) {
  const html = renderDogfoodSourceHtml(doc);
  const base = `${doc.id}_${doc.kind}`;
  const htmlName = `${base}.html`;
  const htmlPath = path.join(outDir, htmlName);
  fs.writeFileSync(htmlPath, html, "utf8");
  written.push({ id: doc.id, html: htmlName });
  console.log("wrote", htmlName);

  if (doc.id === "DF-13") {
    const paste = buildMessyImportPaste(doc);
    const tsvName = `${base}_import_paste.tsv`;
    const csvName = `${base}_import_paste.csv`;
    fs.writeFileSync(path.join(outDir, tsvName), paste.tsv, "utf8");
    fs.writeFileSync(path.join(outDir, csvName), paste.csv, "utf8");
    const mapLines = Object.entries(paste.suggestedMap)
      .map(
        ([col, target]) =>
          `- Column ${Number(col) + 1} (${MESSY_VENDOR_11COL.headerRow[Number(col)] || "?"}) → **${target}**`,
      )
      .join("\n");
    const readme = `# DF-13 Import lines dogfood paste

Ignore first **${paste.ignoreLeadingRows}** rows, then map:

${mapLines}

All other columns stay **(ignore column)**.

Files: \`${tsvName}\`, \`${csvName}\`
`;
    fs.writeFileSync(path.join(outDir, `${base}_import_README.md`), readme, "utf8");
    console.log("wrote", tsvName, csvName);
  }
}

const index = listDogfoodSourceIndex();
const esc = (v) => String(v ?? "").replace(/\|/g, "/");
const rowsFor = (flow) =>
  index
    .filter((r) => r.flow === flow)
    .map((r) => {
      const html = written.find((w) => w.id === r.id)?.html;
      const doc = DOGFOOD_SOURCES.find((d) => d.id === r.id) || {};
      const checks = (doc.checks || []).length;
      const gaps = (doc.knownGaps || []).length;
      const extra = [checks ? `${checks} to check` : "", gaps ? `⚠ ${gaps} known gap${gaps === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "—";
      return `| ${r.id} | ${esc(r.target)} | ${esc(r.oi) || "—"} | ${esc(r.scenario)} | ${esc(r.expect) || "—"} | ${extra} | [pdf](./${html?.replace(/\.html$/, ".pdf")}) · [html](./${html}) |`;
    })
    .join("\n");

const header =
  "| ID | Typed into | Museum | Edge case | Watch for | Then | Files |\n|----|----|----|----|----|----|----|";

// 🔴 Named, not hidden. "Watch for" is what turns a scenario into something a dogfood run can
// pass or fail; a row without one only says what paper to type, not what it proves. The count is
// printed so the gap stays visible instead of reading as a tidy row of dashes.
const missingExpect = index.filter((r) => !r.expect).map((r) => r.id);
const gapNote = missingExpect.length
  ? `\n> **${missingExpect.length} of ${index.length} scenarios do not yet say what to watch for** — ` +
    `${missingExpect.join(", ")}. Fill \`expect\` in as each one is dogfooded; a scenario with no ` +
    `pass/fail condition is a suggestion, not a test.\n`
  : "";

const indexMd = `# Dogfood source pack (generated — do not edit by hand)

Synthetic paper for **human data-entry dogfood**: the unit tests prove the pure logic, these prove
the *surface*. Nothing here is posted to ERP by this script.

🔴 **The catalogue is the list of edge cases we claim to handle.** Adding a scenario to
\`src/sample-data/dogfood-ap-sources.js\` is how an edge case gets formalized rather than remembered;
this file is regenerated from it, so the two cannot drift.

Each PDF's dark banner carries the same four facts as the table: which side of the business, the
ERPNext doctype it is typed into, the edge case, and what to watch for. A red **Known gap** block
on the banner says what the Doc skin cannot do yet (do that part in Vanilla), and a **Then check**
box at the foot lists the ticks to do right after entering it — the click-through checks (Find
pages, the hatch toggle, Home) sit on the paper where you are already on that screen.

${gapNote}
## AP — money out (${index.filter((r) => r.flow === "ap").length})

${header}
${rowsFor("ap")}

## AR — money in (${index.filter((r) => r.flow === "ar").length})

${header}
${rowsFor("ar")}

## Regenerate

\`\`\`bash
npm run dogfood:ap-sources           # HTML only
npm run dogfood:ap-sources -- --pdf  # HTML + PDF
\`\`\`

Without \`--pdf\`, open an HTML file and use the browser's **Print → Save as PDF**.
`;

fs.writeFileSync(path.join(outDir, "README.md"), indexMd, "utf8");
console.log("wrote README.md");

if (wantPdf) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    for (const doc of DOGFOOD_SOURCES) {
      const base = `${doc.id}_${doc.kind}`;
      const htmlPath = path.join(outDir, `${base}.html`);
      const pdfPath = path.join(outDir, `${base}.pdf`);
      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
      await page.pdf({
        path: pdfPath,
        format: "Letter",
        printBackground: true,
        margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
      });
      await page.close();
      console.log("wrote", `${base}.pdf`);
    }
  } finally {
    await browser.close();
  }
}

console.log(`\nDone — ${DOGFOOD_SOURCES.length} sources in ${outDir}`);
