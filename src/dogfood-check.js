/**
 * `npm run dogfood:check` (plan 10-19 § Dogfood check and setup): which probe checks which row of
 * the plan's *Dogfood residuals* table, and the table the run prints. Pure; the script runs the
 * probes.
 *
 * A row's id is its first cell without a trailing bracket — `R9 (batch method change)` is `R9`,
 * `R6b-1 / R6b-2` stays as it is. A probe names the rows it checks in its header:
 * `@dogfood R9` or `@dogfood R6b-1 / R6b-2; R6b-4` (rows split by `;`).
 */

/** @param {string} cell */
export function rowId(cell) {
  return String(cell || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * The rows of the plan's `## Dogfood residuals` table.
 * @param {string} planMd
 * @returns {Array<{ id: string, tryIt: string, expect: string }>}
 */
export function residualRows(planMd) {
  const lines = String(planMd || "").split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s+Dogfood residuals\s*$/.test(l));
  if (at < 0) return [];
  const out = [];
  let inTable = false;
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,3}\s/.test(l)) break;
    if (!l.startsWith("|")) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    const cells = l.split("|").slice(1, -1).map((c) => c.trim());
    if (cells[0] === "Fix" || /^-+$/.test(cells[0])) continue;
    out.push({ id: rowId(cells[0]), tryIt: cells[1] || "", expect: cells[2] || "" });
  }
  return out;
}

/**
 * The rows a probe's source names with `@dogfood`.
 * @param {string} source
 * @returns {string[]}
 */
export function dogfoodTags(source) {
  const out = [];
  for (const m of String(source || "").matchAll(/@dogfood\s+([^\n*]+)/g)) {
    for (const id of m[1].split(";")) if (id.trim()) out.push(id.trim());
  }
  return out;
}

/**
 * The check's table: each row with its probes and what they said. A row no probe names is the
 * person's to judge ("yours"); a tag naming no row is reported, so a renamed row is not lost.
 * @param {Array<{ id: string }>} rows
 * @param {Record<string, string[]>} tagsByProbe probe name → row ids
 * @param {Record<string, "pass"|"fail"|"not run">} results probe name → outcome
 * @returns {{ lines: string[], counts: { pass: number, fail: number, yours: number, notRun: number }, orphanTags: string[] }}
 */
export function checkTable(rows, tagsByProbe, results) {
  const counts = { pass: 0, fail: 0, yours: 0, notRun: 0 };
  const ids = new Set(rows.map((r) => r.id));
  const lines = ["| Row | Probe | Result |", "|-----|-------|--------|"];
  for (const r of rows) {
    const probes = Object.keys(tagsByProbe).filter((p) => tagsByProbe[p].includes(r.id));
    let result;
    if (!probes.length) {
      result = "yours";
      counts.yours++;
    } else if (probes.some((p) => results[p] === "fail")) {
      result = `**FAIL** (${probes.filter((p) => results[p] === "fail").join(", ")})`;
      counts.fail++;
    } else if (probes.every((p) => results[p] === "pass")) {
      result = "pass";
      counts.pass++;
    } else {
      result = "not run";
      counts.notRun++;
    }
    lines.push(`| ${r.id} | ${probes.join(", ") || "—"} | ${result} |`);
  }
  const orphanTags = [...new Set(Object.values(tagsByProbe).flat())].filter((t) => !ids.has(t));
  return { lines, counts, orphanTags };
}
