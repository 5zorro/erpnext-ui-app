#!/usr/bin/env node
/**
 * `npm run test:times [-- probe|e2e] [--top=N] [<text in the test's name>]` — where spec and probe
 * time goes, slowest first, from the run logs in `test-logs/runs/` (src/test-times.js; plan
 * 2026-10-26 step 2). Each test's median splits into work, its own waits and chaos lag.
 */
import fs from "node:fs";
import path from "node:path";
import { parseRunLogTimes, summarizeTimes, timesReportText } from "../src/test-times.js";
import { RUNS_DIR } from "./test-run-record.js";

const args = process.argv.slice(2);
const kinds = args.filter((a) => a === "probe" || a === "e2e");
const top = Number((args.find((a) => a.startsWith("--top=")) || "--top=20").slice(6)) || 20;
const filter = args.filter((a) => !a.startsWith("--") && a !== "probe" && a !== "e2e").join(" ");
const want = kinds.length ? kinds : ["probe", "e2e"];

const logs = fs.existsSync(RUNS_DIR)
  ? fs.readdirSync(RUNS_DIR).filter((f) => want.some((k) => f.endsWith(`.${k}.log`))).sort()
  : [];
const runs = logs.map((f) => parseRunLogTimes(fs.readFileSync(path.join(RUNS_DIR, f), "utf8")).filter((t) => !filter || t.name.includes(filter)));
console.log(timesReportText(summarizeTimes(runs), { top }));
