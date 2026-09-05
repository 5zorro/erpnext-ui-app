#!/usr/bin/env node
/**
 * Emit the deterministic corpus plan as JSON (stdout).
 * Usage: node ops/sample-data/emit-plan.js > /tmp/corpus-plan.json
 */
import { buildCorpusPlan, postingDateForDoc, dateForOffset } from "../../src/sample-data/corpus-plan.js";

const asOf = process.env.SAMPLE_AS_OF || new Date().toISOString().slice(0, 10);
const plan = buildCorpusPlan();
const enriched = {
  ...plan,
  asOf,
  docs: plan.docs.map((d) => ({
    ...d,
    postingDate: postingDateForDoc(asOf, d),
    // OI-161 Packet G: resolve each payment_schedule row's relative dayOffset to a concrete date,
    // same convention as the doc-level postingDate above.
    ...(Array.isArray(d.paymentSchedule)
      ? {
          paymentSchedule: d.paymentSchedule.map((row) => ({
            dueDate: dateForOffset(asOf, row.dayOffset),
            amount: row.amount,
          })),
        }
      : {}),
  })),
};

process.stdout.write(`${JSON.stringify(enriched, null, 2)}\n`);
