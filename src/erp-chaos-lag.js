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
