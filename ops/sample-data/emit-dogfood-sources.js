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
import { DOGFOOD_AP_SOURCES, listDogfoodSourceIndex } from "../../src/sample-data/dogfood-ap-sources.js";
import { renderDogfoodSourceHtml } from "../../src/sample-data/render-dogfood-html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "dogfood-sources", "generated");
const wantPdf = process.argv.includes("--pdf");

fs.mkdirSync(outDir, { recursive: true });

/** @type {{ id: string, html: string, pdf?: string }[]} */
const written = [];

for (const doc of DOGFOOD_AP_SOURCES) {
  const html = renderDogfoodSourceHtml(doc);
  const base = `${doc.id}_${doc.kind}`;
  const htmlName = `${base}.html`;
  const htmlPath = path.join(outDir, htmlName);
  fs.writeFileSync(htmlPath, html, "utf8");
  written.push({ id: doc.id, html: htmlName });
  console.log("wrote", htmlName);
}

const indexRows = listDogfoodSourceIndex()
  .map((r) => {
    const html = written.find((w) => w.id === r.id)?.html;
    return `| ${r.id} | ${r.kind} | ${r.oi103 ?? "—"} | ${r.scenario.replace(/\|/g, "/")} | [${html}](./${html}) |`;
  })
  .join("\n");

const indexMd = `# AP dogfood source pack (generated)

Synthetic vendor paper for human data-entry dogfood. **Not** posted to ERP by this script.

Open an HTML file → browser **Print → Save as PDF** (or re-run with \`--pdf\`).

| ID | Kind | OI-103 | Scenario | File |
|----|------|--------|----------|------|
${indexRows}

Regenerate:

\`\`\`bash
npm run dogfood:ap-sources
npm run dogfood:ap-sources -- --pdf
\`\`\`
`;

fs.writeFileSync(path.join(outDir, "README.md"), indexMd, "utf8");
console.log("wrote README.md");

if (wantPdf) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    for (const doc of DOGFOOD_AP_SOURCES) {
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

console.log(`\nDone — ${DOGFOOD_AP_SOURCES.length} sources in ${outDir}`);
