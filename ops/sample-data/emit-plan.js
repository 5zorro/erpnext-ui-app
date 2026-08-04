#!/usr/bin/env node
/**
 * Emit the deterministic corpus plan as JSON (stdout).
 * Usage: node ops/sample-data/emit-plan.js > /tmp/corpus-plan.json
 */
import { buildCorpusPlan, dateForOffset } from "../../src/sample-data/corpus-plan.js";

const asOf = process.env.SAMPLE_AS_OF || new Date().toISOString().slice(0, 10);
const plan = buildCorpusPlan();
const enriched = {
  ...plan,
  asOf,
  docs: plan.docs.map((d) => ({
    ...d,
    postingDate: dateForOffset(asOf, d.dayOffset),
  })),
};

process.stdout.write(`${JSON.stringify(enriched, null, 2)}\n`);
