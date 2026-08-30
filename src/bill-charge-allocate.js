/**
 * Allocate a Bill Taxes/Charges amount into item costs (OI-140).
 * Grand total stays flat: item amounts rise by the charge; a Deduct tax offsets the Add charge.
 *
 * Modes: by basket amount (price), by qty, or custom $/line (or % of charge).
 * Rounding remainder → largest basis line; ties → lowest rowIndex (first unique id).
 * If nothing eligible, remainder stays unallocated (cents unadjusted).
 */

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
 * Split `chargeAmount` across weights; remainder cents → largest weight (tie → lowest index).
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
  /** @type {number[]} */
  const raw = w.map((wi) => (wi / sumW) * total);
  const floors = raw.map((x) => Math.floor(x * 100) / 100);
  let assigned = money2(floors.reduce((a, b) => a + b, 0));
  let rem = money2(total - assigned);
  if (rem > 0) {
    let best = -1;
    let bestW = -1;
    for (let i = 0; i < w.length; i++) {
      if (w[i] <= 0) continue;
      if (w[i] > bestW || (w[i] === bestW && (best < 0 || i < best))) {
        bestW = w[i];
        best = i;
      }
    }
    if (best >= 0) {
      floors[best] = money2(floors[best] + rem);
      rem = 0;
    }
  }
  return { shares: floors.map(money2), remainder: money2(rem) };
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

  /** @type {ChargeAllocShare[]} */
  const itemUpdates = [];
  for (let i = 0; i < items.length; i++) {
    const add = money2(shares[i] || 0);
    if (!(add > 0)) continue;
    const it = items[i];
    const qty = Number(it.qty);
    const prevAmt = money2(lineAmount(it));
    const nextAmount = money2(prevAmt + add);
    let nextRate = Number(it.rate);
    if (Number.isFinite(qty) && qty !== 0) {
      nextRate = money2(nextAmount / qty);
    } else {
      nextRate = money2((Number.isFinite(nextRate) ? nextRate : 0) + add);
    }
    itemUpdates.push({
      rowIndex: it.rowIndex,
      addAmount: add,
      nextRate,
      nextAmount,
    });
  }

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
