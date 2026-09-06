/**
 * Input-count metrics for advertising / Simplified MVP ceiling (plan B0.4, OI-022 cousin).
 * Counts interactables + mode-switch effort — never logs key characters (non-keylogger).
 *
 * Marketing copy (stacked bars per doctype): compare **Vanilla / Doc / Simplified** only.
 * Competitor bars are deliberately out of scope (elevated advertising-claim risk).
 *
 * Bar segments (one lens × doctype):
 * - blankTabCycle — Tabs to cycle a blank form
 * - sourcedTabCycle — Tabs to cycle a sourced form (e.g. Bill from simple PO)
 * - requiredModeSwitches — mode pads that cannot be avoided on the efficient path
 * - minimalSaveFromSourced — shortest path to Save from sourced (efficient mode switches OK)
 */

/** @typedef {import("./interactable-scrape.js").Interactable} Interactable */
/** @typedef {import("./interactable-scrape.js").ModeSwitch} ModeSwitch */

/**
 * @typedef {{
 *   interactableCount: number,
 *   modeSwitchCount: number,
 *   effort: number,
 *   byKind: Record<string, number>,
 *   byModeSwitch: Record<string, number>,
 * }} InputCountSummary
 */

/**
 * Stacked-bar segment totals for one product lens (Vanilla | Doc | Simplified).
 * @typedef {{
 *   blankTabCycle: number,
 *   sourcedTabCycle: number,
 *   requiredModeSwitches: number,
 *   minimalSaveFromSourced: number,
 * }} AdvertisingBarSegments
 */

/**
 * @param {Iterable<Pick<Interactable, 'kind'|'modeSwitch'>>} items
 * @returns {InputCountSummary}
 */
export function summarizeInputCounts(items) {
  /** @type {Record<string, number>} */
  const byKind = {};
  /** @type {Record<string, number>} */
  const byModeSwitch = { none: 0, tenkey: 0, date: 0 };
  let interactableCount = 0;
  let modeSwitchCount = 0;
  for (const it of items) {
    interactableCount += 1;
    const kind = it.kind || "other";
    byKind[kind] = (byKind[kind] || 0) + 1;
    const ms = /** @type {ModeSwitch} */ (it.modeSwitch || "none");
    byModeSwitch[ms] = (byModeSwitch[ms] || 0) + 1;
    if (ms !== "none") modeSwitchCount += 1;
  }
  return {
    interactableCount,
    modeSwitchCount,
    // Effort = fields + each mode switch (QWERTY ↔ 10-key / date pad).
    effort: interactableCount + modeSwitchCount,
    byKind,
    byModeSwitch,
  };
}

/**
 * Tab stops to cycle the listed interactables (one Tab per focusable).
 * @param {Iterable<Pick<Interactable, 'kind'|'modeSwitch'>>} items
 */
export function tabCycleCount(items) {
  return summarizeInputCounts(items).interactableCount;
}

/**
 * Build advertising bar segments from blank / sourced / optional Save-path inventories.
 * When `savePathItems` is omitted, sourced inventory is the Save-path proxy (early S0).
 * @param {{
 *   blankItems: Iterable<Pick<Interactable, 'kind'|'modeSwitch'>>,
 *   sourcedItems: Iterable<Pick<Interactable, 'kind'|'modeSwitch'>>,
 *   savePathItems?: Iterable<Pick<Interactable, 'kind'|'modeSwitch'>>,
 * }} p
 * @returns {AdvertisingBarSegments}
 */
export function advertisingBarSegments(p) {
  const blank = summarizeInputCounts(p.blankItems || []);
  const sourced = summarizeInputCounts(p.sourcedItems || []);
  const savePath = p.savePathItems
    ? summarizeInputCounts(p.savePathItems)
    : sourced;
  return {
    blankTabCycle: blank.interactableCount,
    sourcedTabCycle: sourced.interactableCount,
    requiredModeSwitches: savePath.modeSwitchCount,
    minimalSaveFromSourced: savePath.interactableCount + savePath.modeSwitchCount,
  };
}

/**
 * Simplified thin MVP: N_s should land near Doc (N_d), not Vanilla (N_v).
 * @param {{
 *   N_d: number,
 *   N_v: number,
 *   N_s?: number|null,
 *   docEffort?: number,
 *   vanillaEffort?: number,
 *   simplifiedEffort?: number|null,
 *   thinTolerance?: number,
 * }} p
 * @returns {{
 *   ok: boolean,
 *   reasons: string[],
 *   targets: { thinMax: number, expandedMin: number },
 * }}
 */
export function evaluateSimplifiedMvpCeiling(p) {
  const thinTolerance = p.thinTolerance ?? 0.15;
  const N_d = p.N_d;
  const N_v = p.N_v;
  /** @type {string[]} */
  const reasons = [];
  if (!(N_d > 0) || !(N_v > 0)) {
    reasons.push("N_d and N_v must be positive");
  }
  if (N_d >= N_v) {
    reasons.push(`expected Doc thinner than Vanilla (N_d=${N_d} < N_v=${N_v})`);
  }
  const thinMax = Math.ceil(N_d * (1 + thinTolerance));
  const expandedMin = Math.floor(N_v * (1 - thinTolerance));
  if (p.N_s != null && p.N_s > thinMax) {
    reasons.push(
      `Simplified thin N_s=${p.N_s} exceeds Doc band (max ${thinMax} ≈ N_d·${1 + thinTolerance})`,
    );
  }
  if (
    p.docEffort != null &&
    p.vanillaEffort != null &&
    p.docEffort >= p.vanillaEffort
  ) {
    reasons.push(
      `expected Doc effort < Vanilla effort (${p.docEffort} < ${p.vanillaEffort})`,
    );
  }
  return {
    ok: reasons.length === 0,
    reasons,
    targets: { thinMax, expandedMin },
  };
}

/**
 * Simplified lens proxy: Vanilla interactables minus whatever the doctype's seed profile
 * assumes (any placement — L1 pre-fills it, L2/L3 quiet or hide it; either way the clerk
 * no longer interacts with it). Same DOM as Vanilla, not a separate fixture — Simplified
 * is Vanilla + an assumptions bar, not a rebuilt form, so this is what the runtime
 * actually does to the interactable count.
 * @param {Iterable<Pick<Interactable, 'field'>>} items
 * @param {Readonly<Record<string, string>>|null|undefined} seed
 * @returns {Interactable[]}
 */
export function simplifiedInteractables(items, seed) {
  const assumed = seed && typeof seed === "object" ? new Set(Object.keys(seed)) : new Set();
  return [...items].filter((it) => !(it.field && assumed.has(it.field)));
}

/**
 * Compare scrape vs curated completeness.
 * @param {string[]} missingIds
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function completenessGate(missingIds) {
  const missing = [...missingIds].sort();
  return { ok: missing.length === 0, missing };
}
