/**
 * Dev-only synthetic ERP IPC lag — stress parallel vendor pick / listSources races.
 * Enable: ERP_CHAOS_LAG_MS=200 ERP_CHAOS_LAG_PCT=50 npm start
 */

/** @typedef {"bridge"|"erpEval"|"listSources"|"billEnrich"|"default"} ChaosChannel */

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readChaosLagConfig(env = process.env) {
  const ms = Number.parseInt(env.ERP_CHAOS_LAG_MS || "0", 10);
  const pct = Number.parseInt(env.ERP_CHAOS_LAG_PCT || "0", 10);
  return {
    ms: Number.isFinite(ms) && ms > 0 ? ms : 0,
    pct: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0,
  };
}

/**
 * @param {ChaosChannel} channel
 * @param {number} pct 0–100
 * @param {() => number} [random]
 */
export function shouldChaosLag(channel, pct, random = Math.random) {
  if (!pct) return false;
  if (channel === "bridge") return random() * 100 < pct;
  if (channel === "listSources") return random() * 100 < pct;
  if (channel === "erpEval") return random() * 100 < pct * 0.6;
  return random() * 100 < pct * 0.3;
}

/**
 * @param {number} ms
 */
export async function chaosSleep(ms) {
  if (!(ms > 0)) return;
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {ChaosChannel} channel
 * @param {NodeJS.ProcessEnv} [env]
 * @param {() => number} [random] - whether-to-lag selector
 * @param {() => number} [durationRandom] - duration within [0, 2×ms]
 * @returns {Promise<number>} actual ms slept (0 if not lagged)
 */
export async function maybeChaosLag(
  channel,
  env = process.env,
  random = Math.random,
  durationRandom = Math.random,
) {
  if (channel === "billEnrich") return 0;
  const { ms, pct } = readChaosLagConfig(env);
  if (!ms || !shouldChaosLag(channel, pct, random)) return 0;
  const actual = Math.floor(durationRandom() * 2 * ms);
  await chaosSleep(actual);
  return actual;
}

/**
 * Chaos lag as clock time (plan 2026-10-26 step 2): delays on parallel calls overlap, so their sum
 * can exceed the run (236 s of delays in an 87 s probe). Each delay is added as the interval it
 * covered, and only the part no earlier delay covered counts. Intervals older than `keepMs` before
 * this one's start are dropped (no later delay can reach back that far: one lasts at most 2× ms).
 * @param {{ intervals: [number, number][], total: number }} clock merged, sorted intervals so far
 * @param {number} start
 * @param {number} end
 * @param {number} [keepMs]
 * @returns {{ intervals: [number, number][], total: number }}
 */
export function addLagInterval(clock, start, end, keepMs = 10 * 60_000) {
  if (!(end > start)) return clock;
  let covered = 0;
  let s = start;
  let e = end;
  const kept = [];
  for (const [a, b] of clock.intervals) {
    if (b < start - keepMs) continue;
    if (b < s || a > e) {
      kept.push([a, b]);
      continue;
    }
    covered += Math.min(b, end) - Math.max(a, start);
    s = Math.min(s, a);
    e = Math.max(e, b);
  }
  kept.push([s, e]);
  kept.sort((x, y) => x[0] - y[0]);
  return { intervals: kept, total: clock.total + (end - start) - covered };
}
