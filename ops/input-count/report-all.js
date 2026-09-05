#!/usr/bin/env node
/**
 * Run Bill + PO + Item Receipt input-count dogfood reports.
 * Usage: node ops/input-count/report-all.js
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

/** @type {readonly { script: string, label: string }[]} */
const REPORTS = [
  { script: "report-bill.js", label: "Bill (Purchase Invoice)" },
  { script: "report-doc-form.js po", label: "Purchase Order" },
  { script: "report-doc-form.js receipt", label: "Item Receipt" },
];

let failed = false;

for (const r of REPORTS) {
  console.log("\n" + "=".repeat(72));
  console.log(r.label);
  console.log("=".repeat(72));
  const [script, ...args] = r.script.split(" ");
  const res = spawnSync(node, [join(here, script), ...args], {
    stdio: "inherit",
    encoding: "utf8",
  });
  if (res.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
