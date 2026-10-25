/**
 * Refuse sample-data writes outside an allowlisted sandbox (OI-055) — the rule, stated once and
 * unit-tested here. The guards that actually run are two mirrors of it: `ops/sample-data/run-seed.sh`
 * (preflight) and `seed_corpus.py` `_assert_sandbox` (re-checked inside every write, the one that
 * matters). Change all three together (architecture review 2026-10-19, R14-2).
 *
 * The site half is weak on purpose: `frontend` is frappe_docker's default name for *every* site,
 * so the check really rests on the company name containing "sandbox". That is enough only while
 * the runner can reach nothing but this machine's own container (`docker exec`) — R14-3.
 */

/** Sites we will seed without an override. */
export const DEFAULT_ALLOWED_SITES = Object.freeze(["frontend"]);

/**
 * @param {object} opts
 * @param {string} [opts.site]
 * @param {string} [opts.company]
 * @param {string[]} [opts.allowedSites]
 * @param {boolean} [opts.force] — only for explicit SAMPLE_DATA_FORCE=1 emergencies
 */
export function assertSandboxTarget(opts = {}) {
  const site = String(opts.site || "").trim();
  const company = String(opts.company || "").trim();
  const allowedSites = opts.allowedSites || DEFAULT_ALLOWED_SITES;
  const force = Boolean(opts.force);

  if (force) {
    return { ok: true, reason: "force" };
  }

  const siteOk =
    allowedSites.includes(site) || /sandbox/i.test(site);
  const companyOk = /sandbox/i.test(company);

  if (siteOk && companyOk) {
    return { ok: true, reason: "site+company" };
  }

  const parts = [];
  if (!siteOk) parts.push(`site "${site}" not in allowlist ${JSON.stringify(allowedSites)}`);
  if (!companyOk) parts.push(`company "${company}" does not look like a sandbox`);
  return {
    ok: false,
    reason: parts.join("; "),
  };
}

/**
 * Require an explicit confirm env for live mutation.
 * @param {NodeJS.ProcessEnv | Record<string, string|undefined>} [env]
 */
export function assertSeedConfirmed(env = process.env) {
  const v = String(env.CONFIRM_SAMPLE_SEED || "").trim();
  if (v === "1" || /^true$/i.test(v) || /^yes$/i.test(v)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "Set CONFIRM_SAMPLE_SEED=1 to write sample docs to the ERP site",
  };
}
