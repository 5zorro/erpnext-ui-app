/**
 * The site's rounding (R13-1), asked of main.js once it has read it; the stock default until then.
 * Written once for every Doc form page (plan 2026-10-25, R6a-1 step 1): the Bill and doc-form pages
 * both make one and hand `ask` to the calculator tape, `money` to the taxes Add box.
 *
 * It asks until the site has really answered (a read during a reload gets the default, `known`
 * false) — at most every 10 s: the tape asks on every key, and ERPNext may be down for a while.
 */

import { DEFAULT_SITE_ROUNDING } from "./site-rounding.js";

/** Asks at most this often while the site has not answered. */
export const SITE_ROUNDING_ASK_MS = 10_000;

/**
 * @param {{
 *   api: () => { getSiteRounding?: () => Promise<any> } | null | undefined,
 *   convention: () => string,
 *   now?: () => number,
 * }} deps `api`: the page's api once it has one. `convention`: the tape's rounding convention.
 */
export function createSiteRoundingAsk(deps) {
  const now = deps.now || Date.now;
  let site = null;
  let asking = false;
  let askedAt = -Infinity;

  function load() {
    const api = deps.api();
    if (site || asking || !api || !api.getSiteRounding) return;
    if (now() - askedAt < SITE_ROUNDING_ASK_MS) return;
    askedAt = now();
    asking = true;
    api
      .getSiteRounding()
      .then((r) => {
        if (r && r.known) site = r;
      })
      .catch(() => {})
      .finally(() => {
        asking = false;
      });
  }

  return {
    /** The site's rounding if it has answered, else null; asks again when due. */
    ask() {
      load();
      return site;
    },
    /** The taxes Add box keeps money places, rounded by the tape's convention (the site's way by default). */
    money() {
      const s = site || DEFAULT_SITE_ROUNDING;
      return { precision: s.currency, method: s.method, convention: deps.convention() };
    },
  };
}
