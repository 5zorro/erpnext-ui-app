/**
 * Allocate a Bill Taxes/Charges amount into item costs (OI-140).
 * Grand total stays flat: item amounts rise by the charge; a Deduct tax offsets the Add charge.
 *
 * Modes: by basket amount (price), by qty, or custom $/line (or % of charge).
 * Leftover cents: one at a time to the lines nearest the next cent (largest remainder; ties → first).
 * If nothing eligible, remainder stays unallocated (cents unadjusted).
 *
 * The lines must take *exactly* the charge (5zorro 2026-10-11, DF-02: 14.28 allocated, the lines
 * rose 14.27). A line's cost moves only in whole cents per unit, so its amount moves in steps of
 * about qty cents: after rounding each new unit cost, `exactRates` nudges unit costs a cent up or
 * down until the lines' total rise equals the charge (3 × −1¢ and 4 × +1¢ = +1¢). When no nudge can
 * reach it (every qty even and an odd cent left), the offset takes what the lines really rose and
 * the rest is reported as the remainder — the bill still balances.
 */

/**
 * A line's amount as ERPNext stores it: qty × rate to cents, Banker's Rounding (this site's
 * System Settings rounding_method; half-cents only arise with fractional quantities).
 * @param {number} qty
 * @param {number} rate
 * @returns {number} cents
 */
export function lineAmountCents(qty, rate) {
  const x = Number(qty) * Number(rate) * 100;
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(x * 1e6) / 1e6; // float noise off before deciding a half
  const f = Math.floor(r);
  const diff = r - f;
  if (Math.abs(diff - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(r);
}

/**
 * New unit costs (whole cents) whose line totals rise by exactly `targetCents` overall, as close to
 * each line's own share as can be. Only lines with a share move (custom mode leaves others alone).
 * @param {{ qty: number, rateCents: number, prevCents: number, shareCents: number }[]} lines
 * @param {number} targetCents
 * @returns {{ rateCents: number[], riseCents: number[], missCents: number }}
 */
export function exactRates(lines, targetCents) {
  const base = lines.map((l) => {
    if (!(l.shareCents > 0) || !(Number(l.qty) !== 0)) return l.rateCents;
    return Math.round((l.prevCents + l.shareCents) / Number(l.qty));
  });
  const riseAt = (i, rc) => lineAmountCents(lines[i].qty, rc / 100) - lines[i].prevCents;
  const rise0 = base.map((rc, i) => (lines[i].shareCents > 0 ? riseAt(i, rc) : 0));
  const need = targetCents - rise0.reduce((a, b) => a + b, 0);
  if (need === 0) return { rateCents: base, riseCents: rise0, missCents: 0 };
  // Smallest set of cent nudges that closes the gap (dynamic programme over the running offset).
  const STEPS = 6;
  const span = Math.abs(need) + 400;
  /** @type {Map<number, { cost: number, ks: number[] }>} */
  let best = new Map([[0, { cost: 0, ks: [] }]]);
  for (let i = 0; i < lines.length; i++) {
    const movable = lines[i].shareCents > 0 && Number(lines[i].qty) !== 0;
    /** @type {Map<number, { cost: number, ks: number[] }>} */
    const next = new Map();
    for (const [off, st] of best) {
      for (let k = movable ? -STEPS : 0; k <= (movable ? STEPS : 0); k++) {
        const rise = movable ? riseAt(i, base[i] + k) : 0;
        if (movable && rise < 0) continue; // never take cost off a line
        const o = off + (rise - rise0[i]);
        if (Math.abs(o) > span) continue;
        const cost = st.cost + Math.abs(k);
        const cur = next.get(o);
        if (!cur || cost < cur.cost) next.set(o, { cost, ks: [...st.ks, k] });
      }
    }
    best = next;
  }
  let pick = best.get(need);
  let miss = 0;
  if (!pick) {
    // Closest reachable that does not put more into cost than the charge (rise ≤ charge).
    let bestOff = null;
    for (const off of best.keys()) {
      if (off <= need && (bestOff == null || off > bestOff)) bestOff = off;
    }
    if (bestOff == null) bestOff = Math.min(...best.keys());
    pick = best.get(bestOff);
    miss = need - bestOff;
  }
  const ks = pick ? pick.ks : lines.map(() => 0);
  const rateCents = base.map((rc, i) => rc + (ks[i] || 0));
  const riseCents = rateCents.map((rc, i) => (lines[i].shareCents > 0 ? riseAt(i, rc) : 0));
  return { rateCents, riseCents, missCents: miss };
}

/**
 * @typedef {{
 *   rowIndex: number,
 *   qty?: number|string|null,
 *   rate?: number|string|null,
 *   amount?: number|string|null,
 *   name?: string|null,
 *   item_code?: string|null,
 * }} ChargeAllocItem
 */

/**
 * @typedef {{
 *   rowIndex: number,
 *   addAmount: number,
 *   nextRate: number,
 *   nextAmount: number,
 * }} ChargeAllocShare
 */

/**
 * @param {unknown} n
 * @returns {number}
 */
export function money2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * @param {ChargeAllocItem|null|undefined} item
 * @returns {number}
 */
export function lineAmount(item) {
  if (!item) return 0;
  const amt = Number(item.amount);
  if (Number.isFinite(amt) && amt !== 0) return amt;
  const qty = Number(item.qty);
  const rate = Number(item.rate);
  if (Number.isFinite(qty) && Number.isFinite(rate)) return qty * rate;
  return 0;
}

/**
 * @param {ChargeAllocItem[]} items
 * @param {"amount"|"qty"} mode
 * @returns {number[]}
 */
export function allocationBasisWeights(items, mode) {
  const list = Array.isArray(items) ? items : [];
  return list.map((it) => {
    if (mode === "qty") {
      const q = Number(it && it.qty);
      return Number.isFinite(q) && q > 0 ? q : 0;
    }
    const a = lineAmount(it);
    return a > 0 ? a : 0;
  });
}

/**
 * Split `chargeAmount` across weights, to the cent, as evenly as the cents allow (5zorro 2026-10-11):
 * every line starts rounded down, then the leftover cents go one at a time to the lines whose share
 * was closest to the next cent (the largest-remainder method; ties → the earlier line). 67¢ over ten
 * equal lines is seven 7¢ and three 6¢ — not 13¢ on the first line, as the old rule gave; 3.33 over
 * ten is three 34¢ and seven 33¢.
 * @param {number} chargeAmount
 * @param {number[]} weights
 * @returns {{ shares: number[], remainder: number }}
 */
export function splitByWeights(chargeAmount, weights) {
  const total = money2(chargeAmount);
  const w = (Array.isArray(weights) ? weights : []).map((x) => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const sumW = w.reduce((a, b) => a + b, 0);
  if (!(total > 0) || !(sumW > 0)) {
    return { shares: w.map(() => 0), remainder: total > 0 ? total : 0 };
  }
  const totalCents = Math.round(total * 100);
  const rawCents = w.map((wi) => (wi / sumW) * totalCents);
  // Float noise off before flooring (0.29 × 100 is 28.999…).
  const cents = rawCents.map((x) => Math.floor(x + 1e-9));
  let left = totalCents - cents.reduce((a, b) => a + b, 0);
  const order = rawCents
    .map((x, i) => ({ i, frac: w[i] > 0 ? x - Math.floor(x + 1e-9) : -1 }))
    .filter((o) => o.frac >= 0)
    .sort((a, b) => (Math.abs(b.frac - a.frac) > 1e-9 ? b.frac - a.frac : a.i - b.i));
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length) {
    cents[order[k].i] += 1;
    left -= 1;
  }
  return { shares: cents.map((c) => c / 100), remainder: 0 };
}

/**
 * Custom $/line or % of charge. Percents must sum sensibly; leftover → largest dollar share / first id.
 * @param {number} chargeAmount
 * @param {ChargeAllocItem[]} items
 * @param {Array<{ rowIndex: number, dollars?: number|null, percent?: number|null }>} custom
 * @returns {{ shares: number[], remainder: number, byRow: Map<number, number> }}
 */
export function splitCustom(chargeAmount, items, custom) {
  const total = money2(chargeAmount);
  const list = Array.isArray(items) ? items : [];
  const byRow = new Map();
  for (const c of Array.isArray(custom) ? custom : []) {
    const ri = Number(c.rowIndex);
    if (!Number.isInteger(ri) || ri < 0) continue;
    let add = 0;
    if (c.dollars != null && c.dollars !== "" && Number.isFinite(Number(c.dollars))) {
      add = money2(c.dollars);
    } else if (c.percent != null && c.percent !== "" && Number.isFinite(Number(c.percent))) {
      add = money2((Number(c.percent) / 100) * total);
    }
    if (add > 0) byRow.set(ri, money2((byRow.get(ri) || 0) + add));
  }
  const shares = list.map((it) => money2(byRow.get(it.rowIndex) || 0));
  let assigned = money2(shares.reduce((a, b) => a + b, 0));
  let rem = money2(total - assigned);
  if (rem > 0 && list.length) {
    let best = -1;
    let bestAmt = -1;
    for (let i = 0; i < list.length; i++) {
      const a = shares[i];
      if (a > bestAmt || (a === bestAmt && (best < 0 || i < best))) {
        bestAmt = a;
        best = i;
      }
    }
    // Prefer a line that already has a share; else first item.
    if (bestAmt <= 0) best = 0;
    if (best >= 0) {
      shares[best] = money2(shares[best] + rem);
      byRow.set(list[best].rowIndex, shares[best]);
      rem = 0;
    }
  } else if (rem < 0) {
    // Over-allocated — leave as-is; caller should validate.
  }
  return { shares, remainder: money2(Math.max(0, rem)), byRow };
}

/**
 * Build item rate/amount updates + offset Deduct tax so grand total is unchanged.
 *
 * @param {{
 *   items: ChargeAllocItem[],
 *   chargeAmount: number,
 *   mode: "amount"|"qty"|"custom",
 *   custom?: Array<{ rowIndex: number, dollars?: number|null, percent?: number|null }>,
 *   chargeAccount?: string,
 *   chargeDescription?: string,
 * }} opts
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   itemUpdates: ChargeAllocShare[],
 *   offsetTax: { account_head: string, description: string, tax_amount: number, add_deduct_tax: "Deduct" }|null,
 *   allocatedTotal: number,
 *   remainder: number,
 * }}
 */
export function planChargeToStockAllocation(opts) {
  const items = Array.isArray(opts.items) ? opts.items : [];
  const charge = money2(opts.chargeAmount);
  if (!(charge > 0)) {
    return {
      ok: false,
      reason: "Charge amount must be positive.",
      itemUpdates: [],
      offsetTax: null,
      allocatedTotal: 0,
      remainder: 0,
    };
  }
  if (!items.length) {
    return {
      ok: false,
      reason: "No item lines to allocate into.",
      itemUpdates: [],
      offsetTax: null,
      allocatedTotal: 0,
      remainder: charge,
    };
  }

  let shares;
  let remainder;
  if (opts.mode === "custom") {
    const split = splitCustom(charge, items, opts.custom || []);
    shares = split.shares;
    remainder = split.remainder;
  } else {
    const mode = opts.mode === "qty" ? "qty" : "amount";
    const weights = allocationBasisWeights(items, mode);
    if (!weights.some((w) => w > 0)) {
      return {
        ok: false,
        reason: mode === "qty" ? "No positive qty on items." : "No positive amounts on items.",
        itemUpdates: [],
        offsetTax: null,
        allocatedTotal: 0,
        remainder: charge,
      };
    }
    const split = splitByWeights(charge, weights);
    shares = split.shares;
    remainder = split.remainder;
  }

  // What each line can actually take: whole-cent unit costs, nudged so the total is exact.
  const lines = items.map((it, i) => {
    const qty = Number(it.qty);
    const rate = Number(it.rate);
    const prevCents = Math.round(money2(lineAmount(it)) * 100);
    return {
      qty: Number.isFinite(qty) ? qty : 0,
      rateCents: Math.round((Number.isFinite(rate) ? rate : 0) * 100),
      prevCents,
      shareCents: Math.round(money2(shares[i] || 0) * 100),
    };
  });
  const sharedCents = lines.reduce((a, l) => a + Math.max(0, l.shareCents), 0);
  const exact = exactRates(lines, sharedCents);

  /** @type {ChargeAllocShare[]} */
  const itemUpdates = [];
  for (let i = 0; i < items.length; i++) {
    if (!(lines[i].shareCents > 0)) continue;
    const it = items[i];
    const qty = lines[i].qty;
    let nextRate;
    let add;
    if (qty !== 0) {
      nextRate = exact.rateCents[i] / 100;
      add = exact.riseCents[i] / 100;
    } else {
      // No qty to spread over: the rate carries the whole share.
      add = lines[i].shareCents / 100;
      nextRate = money2((Number.isFinite(Number(it.rate)) ? Number(it.rate) : 0) + add);
    }
    if (!(add > 0)) continue;
    itemUpdates.push({
      rowIndex: it.rowIndex,
      addAmount: money2(add),
      nextRate,
      nextAmount: money2(lines[i].prevCents / 100 + add),
    });
  }
  // A cent no unit-cost nudge could place stays with the charge (reported, never hidden).
  remainder = money2(remainder + exact.missCents / 100);

  const allocatedTotal = money2(itemUpdates.reduce((s, u) => s + u.addAmount, 0));
  if (!(allocatedTotal > 0)) {
    return {
      ok: false,
      reason: "Nothing allocated — check mode / custom amounts.",
      itemUpdates: [],
      offsetTax: null,
      allocatedTotal: 0,
      remainder: charge,
    };
  }

  const acct = String(opts.chargeAccount || "").trim();
  const descBase = String(opts.chargeDescription || "").trim() || "freight";
  const offsetTax = acct
    ? {
        account_head: acct,
        description: `Offset · ${descBase} → stock cost`,
        tax_amount: allocatedTotal,
        add_deduct_tax: /** @type {"Deduct"} */ ("Deduct"),
      }
    : null;

  if (!offsetTax) {
    return {
      ok: false,
      reason: "Charge account required for offset Deduct row.",
      itemUpdates,
      offsetTax: null,
      allocatedTotal,
      remainder,
    };
  }

  return {
    ok: true,
    itemUpdates,
    offsetTax,
    allocatedTotal,
    remainder,
  };
}

/**
 * Eligible Add charges (positive amount) for “allocate to stock” button.
 * @param {object|null|undefined} taxRow
 */
export function isAllocatableChargeRow(taxRow) {
  if (!taxRow || typeof taxRow !== "object") return false;
  const add = String(taxRow.add_deduct_tax || "Add");
  if (add !== "Add") return false;
  const amt = Number(taxRow.tax_amount);
  return Number.isFinite(amt) && amt > 0;
}

/**
 * Tax × delete must not run while the allocate-to-stock modal is open
 * (Enter used to hit the row delete behind an unfocused dialog).
 * @param {boolean} allocateModalOpen
 */
export function taxRowDeleteAllowed(allocateModalOpen) {
  return !allocateModalOpen;
}
