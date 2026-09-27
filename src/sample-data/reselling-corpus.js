/**
 * Reselling corpus — a year of buy-it-then-sell-it activity across 25 vendors and 25 customers
 * (5zorro 2026-09-26: *"~25 customers and ~25 vendors who have a variable amount of activity with
 * substantially all of them being reselling type transactions … have each one have at least 1
 * transaction per month for 1 year"*).
 *
 * Pure: no ERP I/O, no `asOf`. Every date is a `dayOffset` counting back from the corpus asOf, the
 * same convention `corpus-plan.js` uses, and `emit-plan.js` resolves them.
 *
 * Deliberately a **separate population** from the 8-vendor rotation in `corpus-plan.js`. That
 * rotation is wired into the tax mix, the batching fixtures and the Find dogfood; growing it to 25
 * would have moved all of that. These parties are new and carry their own flow.
 *
 * ## What "reselling" means here
 *
 * Buy a SKU, sell the same SKU. No manufacturing, no kits. The trace from purchase to sale is **not**
 * a document link — ERPNext has none for resale — it is the cost layer the sale consumes. That is why
 * each SKU's cost **changes every month**: with twelve distinct rates in the queue you can look at a
 * shipment and tell which month's purchase it drew on (OI-177).
 *
 * ## The two ageing rules
 *
 * - money in: an invoice **older than 25 days is paid in full**
 * - money out: a bill **older than 60 days is paid in full**
 *
 * So anything still outstanding in AR is under 25 days old and anything outstanding in AP is under
 * 60 — collect faster than you pay. Payments are **grouped per party per month**, because one cheque
 * settling several bills is both what really happens and what the Pay Outstanding board is for.
 */

export const RESELLING_MONTHS = 12;
/** Calendar days per synthetic month. 30 keeps month↔dayOffset arithmetic exact and reversible. */
export const RESELLING_MONTH_DAYS = 30;
export const RESELLING_WINDOW_DAYS = RESELLING_MONTHS * RESELLING_MONTH_DAYS;

/** An invoice older than this is paid in full. */
export const AR_SETTLE_DAYS = 25;
/** A bill older than this is paid in full. */
export const AP_SETTLE_DAYS = 60;

export const RESELLING_VENDOR_COUNT = 25;
export const RESELLING_CUSTOMER_COUNT = 25;

/**
 * "Variable amount of activity" with a floor of one cycle a month for everybody. `cyclesPerMonth`
 * is the whole story: nobody is dormant, because the ask was explicitly that every party trades
 * every month.
 */
export const ACTIVITY_TIERS = Object.freeze([
  { label: "heavy", vendors: 3, cyclesPerMonth: 3 },
  { label: "steady", vendors: 7, cyclesPerMonth: 2 },
  { label: "light", vendors: 15, cyclesPerMonth: 1 },
]);

/**
 * The resale catalogue. `costStep` is the change **per month** — two items fall rather than rise,
 * so nothing downstream may assume cost only goes up.
 *
 * 🔴 `resaleMultiplier` is sample data, **not** a pricing rule. Markup belongs to the CRM and the
 * salesman (OI-179); nothing in the shell reads it. It is here so every sale clears its cost and the
 * corpus carries no accidental below-cost noise.
 */
export const RESELLING_ITEMS = Object.freeze([
  { key: "RS-ITM-01", suffix: "01", baseCost: 20.0, costStep: 0.75, resaleMultiplier: 1.35 },
  { key: "RS-ITM-02", suffix: "02", baseCost: 45.0, costStep: 1.5, resaleMultiplier: 1.3 },
  { key: "RS-ITM-03", suffix: "03", baseCost: 12.5, costStep: -0.25, resaleMultiplier: 1.5 },
  { key: "RS-ITM-04", suffix: "04", baseCost: 80.0, costStep: 2.0, resaleMultiplier: 1.25 },
  { key: "RS-ITM-05", suffix: "05", baseCost: 33.0, costStep: 0.4, resaleMultiplier: 1.4 },
  { key: "RS-ITM-06", suffix: "06", baseCost: 150.0, costStep: -3.0, resaleMultiplier: 1.2 },
  { key: "RS-ITM-07", suffix: "07", baseCost: 7.25, costStep: 0.15, resaleMultiplier: 1.6 },
  { key: "RS-ITM-08", suffix: "08", baseCost: 62.0, costStep: 1.25, resaleMultiplier: 1.3 },
]);

/**
 * The negative-inventory cases, on their own SKUs.
 *
 * 🔴 Dedicated SKUs on purpose. A backdated receipt reposts **every later movement for that item and
 * warehouse**, so putting these on a shared SKU would both cascade reposts through a year of
 * unrelated history (slow) and bury the case you were trying to look at (illegible).
 *
 * `flavour` decides which of the two behaviours you get, and it is the receipt's **posting date**
 * that decides it, not the order of typing (proven on the sandbox 2026-09-26):
 *   - `forward`  — receipt dated *after* the shipment. No repost, ever. The shipment keeps its
 *                  guessed cost permanently and the difference lands on the receipt.
 *   - `backdated` — receipt dated *before* the shipment, entered after it. Raises a
 *                  `Repost Item Valuation` and the shipment's cost is genuinely rewritten.
 *
 * Both need the Delivery Note **inserted first**, which is what `applyLast` on the receipt is for.
 */
export const NEGATIVE_ITEMS = Object.freeze([
  { key: "RS-NEG-F1", suffix: "NEG-F1", flavour: "forward", monthIndex: 2, cost: 40.0, masterRate: 46.0 },
  { key: "RS-NEG-F2", suffix: "NEG-F2", flavour: "forward", monthIndex: 7, cost: 90.0, masterRate: 82.0 },
  { key: "RS-NEG-B1", suffix: "NEG-B1", flavour: "backdated", monthIndex: 4, cost: 55.0, masterRate: 61.0 },
  { key: "RS-NEG-B2", suffix: "NEG-B2", flavour: "backdated", monthIndex: 9, cost: 18.0, masterRate: 15.5 },
]);

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** @param {number} n */
function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Oldest month is 0, newest is `RESELLING_MONTHS - 1`. Returns the dayOffset of that month's
 * first day (its largest offset, since a larger offset is an older date).
 * @param {number} monthIndex
 */
export function monthBaseOffset(monthIndex) {
  return (RESELLING_MONTHS - 1 - monthIndex) * RESELLING_MONTH_DAYS;
}

/**
 * What the SKU costs in a given month. Distinct in every month for every item, which is the whole
 * point — a rate in the FIFO queue names the month it was bought in.
 * @param {{ baseCost: number, costStep: number }} item
 * @param {number} monthIndex
 */
export function costForMonth(item, monthIndex) {
  return round2(item.baseCost + item.costStep * monthIndex);
}

/** @param {{ baseCost: number, costStep: number, resaleMultiplier: number }} item @param {number} monthIndex */
export function priceForMonth(item, monthIndex) {
  return round2(costForMonth(item, monthIndex) * item.resaleMultiplier);
}

/** Vendor key → its activity tier, assigned so the heavy ones are not all adjacent in the list. */
export function resellingVendors() {
  const tiers = [];
  for (const tier of ACTIVITY_TIERS) {
    for (let i = 0; i < tier.vendors; i++) tiers.push(tier);
  }
  // Interleave so vendor 01 is not automatically the busiest — a picker ranked by activity should
  // have to actually read the data rather than the numbering.
  const order = [];
  for (let i = 0; i < tiers.length; i++) {
    order.push(tiers[(i * 7) % tiers.length]);
  }
  return order.slice(0, RESELLING_VENDOR_COUNT).map((tier, i) => ({
    key: `RSV-${pad2(i + 1)}`,
    name: `SAMPLE Reseller Vendor ${pad2(i + 1)}`,
    taxWithholding: false,
    activityTier: tier.label,
    cyclesPerMonth: tier.cyclesPerMonth,
  }));
}

export function resellingCustomers() {
  return Array.from({ length: RESELLING_CUSTOMER_COUNT }, (_, i) => ({
    key: `RSC-${pad2(i + 1)}`,
    name: `SAMPLE Reseller Customer ${pad2(i + 1)}`,
    // Exempt: this population exists to trace inventory cost and ageing, and a pass-through tax
    // would make every total a number you have to back out first. The rotation covers sales tax.
    taxable: false,
  }));
}

export function resellingItems() {
  return [
    ...RESELLING_ITEMS.map((it) => ({
      key: it.key,
      code: `SAMPLE-RS-${it.suffix}`,
      name: `SAMPLE Resale Item ${it.suffix}`,
      // Month 0's cost is only the master fallback; the real rates ride on the purchase orders.
      rate: costForMonth(it, 0),
      openingQty: 0,
      // Every resale SKU tolerates negative stock, per item rather than by flipping the site
      // setting. Two reasons: the site setting is 5zorro's to choose (it is the real answer for
      // "all items default to allow negative"), and a corpus this size should not fail a seed over
      // one date that landed out of order.
      allowNegativeStock: true,
      monthlyCost: Array.from({ length: RESELLING_MONTHS }, (_, m) => costForMonth(it, m)),
    })),
    ...NEGATIVE_ITEMS.map((it) => ({
      key: it.key,
      code: `SAMPLE-RS-${it.suffix}`,
      name: `SAMPLE Resale Item ${it.suffix} (${it.flavour} negative)`,
      // 🔴 This is the rate the shipment will be costed at while nothing is on hand — it is
      // deliberately *wrong* (above cost for F1/B1, below for F2/B2) so the correction is visible
      // and has a sign. `get_fallback_rate` reaches `Item.valuation_rate` first.
      rate: it.masterRate,
      openingQty: 0,
      allowNegativeStock: true,
      negativeFlavour: it.flavour,
    })),
  ];
}

/**
 * Build the whole reselling population and its documents.
 *
 * 🔴 Documents come back **sorted oldest-first within each kind**. That is load-bearing, not tidy:
 * the seeder inserts a kind in plan order, and inserting a stock movement dated earlier than one
 * already on file makes ERPNext queue a `Repost Item Valuation`. Emit these out of order and a
 * year of history reposts itself thousands of times.
 *
 * @param {{ months?: number }} [opts]
 */
export function buildResellingCorpus(opts = {}) {
  const months = Number.isFinite(opts.months) ? opts.months : RESELLING_MONTHS;
  const vendors = resellingVendors();
  const customers = resellingCustomers();
  const items = resellingItems();
  const docs = [];
  /** @type {{ party: string, kind: "ap"|"ar", docKey: string, settleOffset: number, monthIndex: number }[]} */
  const settlements = [];

  let cycleNo = 0;
  let customerCursor = 0;

  for (let monthIndex = 0; monthIndex < months; monthIndex++) {
    const monthBase = monthBaseOffset(monthIndex);
    vendors.forEach((vendor, vendorIdx) => {
      for (let n = 0; n < vendor.cyclesPerMonth; n++) {
        cycleNo += 1;
        // Spread the month's cycles over its 30 days without ever leaving the month.
        const slot = (vendorIdx * 3 + n * 11) % 22;
        const item = RESELLING_ITEMS[(vendorIdx + n + monthIndex) % RESELLING_ITEMS.length];
        // Round-robin customers independently of vendors, so every customer also trades every
        // month rather than inheriting one vendor's cadence.
        const customer = customers[customerCursor % customers.length];
        customerCursor += 1;

        const cost = costForMonth(item, monthIndex);
        const price = priceForMonth(item, monthIndex);
        const buyQty = 8 + (cycleNo % 5) * 2; // 8..16
        const sellQty = buyQty - (2 + (cycleNo % 3)); // always fewer, so stock accumulates
        // An order on most cycles, a bare receipt on the rest — resale does both, and it keeps the
        // create-from-source / create-from-nothing mix honest.
        const withOrder = cycleNo % 5 !== 0;
        const id = pad2(monthIndex + 1) + "-" + String(cycleNo).padStart(4, "0");

        const poOffset = monthBase + slot + 7;
        const prOffset = monthBase + slot + 5;
        const piOffset = monthBase + slot + 4;
        const dnOffset = monthBase + slot + 1;
        const siOffset = monthBase + slot + 1;

        const buyLine = [{ itemKey: item.key, qty: buyQty, rate: cost, salesOrderRef: null }];
        const sellLine = [{ itemKey: item.key, qty: sellQty, rate: price, salesOrderRef: null }];
        const scenario = `reselling-${vendor.activityTier}`;

        if (withOrder) {
          docs.push({
            kind: "purchase_order",
            key: `RS-PO-${id}`,
            index: 1000 + cycleNo,
            dayOffset: poOffset,
            partyKey: vendor.key,
            items: buyLine.map((l) => ({ ...l })),
            source: null,
            dogfoodScenario: scenario,
            resellingMonth: monthIndex,
          });
        }
        docs.push({
          kind: "purchase_receipt",
          key: `RS-PR-${id}`,
          index: 1000 + cycleNo,
          dayOffset: prOffset,
          partyKey: vendor.key,
          items: buyLine.map((l) => ({ ...l })),
          source: withOrder ? { kind: "purchase_order", key: `RS-PO-${id}` } : null,
          dogfoodScenario: scenario,
          resellingMonth: monthIndex,
        });
        docs.push({
          kind: "purchase_invoice",
          key: `RS-PI-${id}`,
          index: 1000 + cycleNo,
          dayOffset: piOffset,
          partyKey: vendor.key,
          items: buyLine.map((l) => ({ ...l })),
          source: { kind: "purchase_receipt", key: `RS-PR-${id}` },
          billNo: `RS-${vendor.key}-${id}`,
          updateStock: false,
          taxWithholding: false,
          dogfoodScenario: scenario,
          resellingMonth: monthIndex,
        });
        docs.push({
          kind: "delivery_note",
          key: `RS-DN-${id}`,
          index: 1000 + cycleNo,
          dayOffset: dnOffset,
          partyKey: customer.key,
          items: sellLine.map((l) => ({ ...l })),
          source: null,
          dogfoodScenario: scenario,
          resellingMonth: monthIndex,
        });
        docs.push({
          kind: "sales_invoice",
          key: `RS-SI-${id}`,
          index: 1000 + cycleNo,
          dayOffset: siOffset,
          partyKey: customer.key,
          items: sellLine.map((l) => ({ ...l })),
          source: { kind: "delivery_note", key: `RS-DN-${id}` },
          updateStock: false,
          salesTax: false,
          dogfoodScenario: scenario,
          resellingMonth: monthIndex,
        });

        if (piOffset > AP_SETTLE_DAYS) {
          settlements.push({
            party: vendor.key,
            kind: "ap",
            docKey: `RS-PI-${id}`,
            settleOffset: piOffset - AP_SETTLE_DAYS,
            monthIndex,
          });
        }
        if (siOffset > AR_SETTLE_DAYS) {
          settlements.push({
            party: customer.key,
            kind: "ar",
            docKey: `RS-SI-${id}`,
            settleOffset: siOffset - AR_SETTLE_DAYS,
            monthIndex,
          });
        }
      }
    });
  }

  // The ageing rules are corpus-wide: "older than 25 days is paid in full" has no exception for
  // the negative-inventory cases, so they hand their invoices to the same settlement pass.
  appendNegativeInventoryCycles(docs, { customers, vendors, settlements, months });
  docs.push(...buildSettlementPayments(settlements));
  // Tells the seeder to apply these in one date-ordered pass rather than kind by kind.
  for (const d of docs) d.chronoGroup = "reselling";

  return {
    months,
    windowDays: months * RESELLING_MONTH_DAYS,
    settleDays: { ar: AR_SETTLE_DAYS, ap: AP_SETTLE_DAYS },
    vendors,
    customers,
    items,
    docs: chronologicalOrder(docs),
    summary: summarizeReselling(docs, vendors, customers, months),
  };
}

/**
 * One payment per party per month, settling every invoice of theirs that has come of age.
 *
 * Dated at the **latest** settle date in the group (the smallest dayOffset), so the newest invoice
 * in it is paid at exactly the ageing limit and the older ones a little after — which satisfies
 * "older than N days is paid in full" and is what a monthly cheque run actually looks like. No
 * allocation amounts: each reference settles whatever that invoice really owes.
 *
 * @param {{ party: string, kind: "ap"|"ar", docKey: string, settleOffset: number, monthIndex: number }[]} settlements
 */
function buildSettlementPayments(settlements) {
  /** @type {Map<string, typeof settlements>} */
  const groups = new Map();
  for (const s of settlements) {
    const bucket = `${s.kind}|${s.party}|${s.monthIndex}`;
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(s);
  }
  const out = [];
  let n = 0;
  for (const [bucket, rows] of groups) {
    n += 1;
    const [kind, party, monthIndex] = bucket.split("|");
    const dayOffset = Math.min(...rows.map((r) => r.settleOffset));
    out.push({
      kind: "payment_entry",
      key: `RS-PE-${kind.toUpperCase()}-${party}-${pad2(Number(monthIndex) + 1)}`,
      index: 1000 + n,
      dayOffset,
      direction: kind === "ap" ? "Pay" : "Receive",
      partyKey: party,
      modeOfPayment: kind === "ap" ? "USPS_Check" : "ACH",
      allocations: rows.map((r) => ({ key: r.docKey })),
      source: null,
      dogfoodScenario: "reselling-settlement",
      resellingMonth: Number(monthIndex),
    });
  }
  return out;
}

/**
 * The four negative-inventory cases. Each is a shipment with nothing on hand, then a receipt —
 * `forward` dates the receipt after the shipment (no repost; the guess sticks), `backdated` dates it
 * before (repost; the shipment's cost is rewritten). Both put the Delivery Note in first.
 *
 * @param {object[]} docs
 * @param {{ customers: object[], vendors: object[], settlements: object[], months?: number }} ctx
 */
function appendNegativeInventoryCycles(docs, ctx) {
  const { customers, vendors, settlements } = ctx;
  NEGATIVE_ITEMS.forEach((item, i) => {
    // A shortened run (`resellingMonths`) simply has fewer of these rather than dragging them
    // outside its own window.
    if (item.monthIndex >= (ctx.months ?? RESELLING_MONTHS)) return;
    const monthBase = monthBaseOffset(item.monthIndex);
    const vendor = vendors[(i * 6) % vendors.length];
    const customer = customers[(i * 9) % customers.length];
    const shipOffset = monthBase + 15;
    // forward: receipt 12 days later (smaller offset). backdated: 9 days earlier (larger offset).
    const receiptOffset = item.flavour === "forward" ? shipOffset - 12 : shipOffset + 9;
    const sellQty = 6;
    const buyQty = 10;
    const price = round2(item.cost * 1.4);
    const id = item.suffix;
    const scenario = `oi178-negative-${item.flavour}`;

    docs.push({
      kind: "delivery_note",
      key: `RS-NEG-DN-${id}`,
      index: 2000 + i,
      dayOffset: shipOffset,
      partyKey: customer.key,
      items: [{ itemKey: item.key, qty: sellQty, rate: price, salesOrderRef: null }],
      source: null,
      dogfoodScenario: scenario,
      negativeFlavour: item.flavour,
      resellingMonth: item.monthIndex,
    });
    docs.push({
      kind: "sales_invoice",
      key: `RS-NEG-SI-${id}`,
      index: 2000 + i,
      dayOffset: shipOffset,
      partyKey: customer.key,
      items: [{ itemKey: item.key, qty: sellQty, rate: price, salesOrderRef: null }],
      source: { kind: "delivery_note", key: `RS-NEG-DN-${id}` },
      updateStock: false,
      salesTax: false,
      dogfoodScenario: scenario,
      negativeFlavour: item.flavour,
      resellingMonth: item.monthIndex,
    });
    if (shipOffset > AR_SETTLE_DAYS) {
      settlements.push({
        party: customer.key,
        kind: "ar",
        docKey: `RS-NEG-SI-${id}`,
        settleOffset: shipOffset - AR_SETTLE_DAYS,
        monthIndex: item.monthIndex,
      });
    }
    docs.push({
      kind: "purchase_receipt",
      key: `RS-NEG-PR-${id}`,
      index: 2000 + i,
      dayOffset: receiptOffset,
      partyKey: vendor.key,
      items: [{ itemKey: item.key, qty: buyQty, rate: item.cost, salesOrderRef: null }],
      source: null,
      resellingMonth: item.monthIndex,
      // 🔴 Must be inserted AFTER the Delivery Note, whatever its date, or neither case happens:
      // insert it first and it is simply an in-order receipt with stock already on hand.
      applyLast: true,
      dogfoodScenario: scenario,
      negativeFlavour: item.flavour,
    });
  });
}

/**
 * Dependency order for documents that fall on the same date. It matches the chronological order
 * inside a cycle (order, receipt, bill, shipment, invoice, payment), so a same-day tie never puts a
 * document before the one it is created from.
 */
export const CHRONO_KIND_RANK = Object.freeze({
  quotation: 0,
  sales_order: 1,
  purchase_order: 2,
  purchase_receipt: 3,
  purchase_invoice: 4,
  delivery_note: 5,
  sales_invoice: 6,
  payment_entry: 7,
});

/**
 * One global oldest-first order across **every** kind.
 *
 * 🔴 Sorting inside each kind is not enough, and this cost a wasted seed run to learn. The seeder
 * applies a whole kind at a time, so every receipt went in before any shipment — and each shipment
 * was then dated earlier than the newest receipt on file, which is exactly what makes ERPNext queue
 * a `Repost Item Valuation`. A two-month run left **59** of them queued. Interleaving receipts and
 * shipments by date leaves only the reposts the negative-inventory fixtures ask for.
 *
 * Ties break on `CHRONO_KIND_RANK`, then on emitted order, so a cycle stays in sequence.
 * `applyLast` rows go to the very end; the seeder applies them in their own pass.
 *
 * @param {object[]} docs
 */
function chronologicalOrder(docs) {
  return docs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      const lastA = a.d.applyLast ? 1 : 0;
      const lastB = b.d.applyLast ? 1 : 0;
      if (lastA !== lastB) return lastA - lastB;
      // Larger dayOffset = older date, and the oldest must be inserted first.
      if (a.d.dayOffset !== b.d.dayOffset) return b.d.dayOffset - a.d.dayOffset;
      const rankA = CHRONO_KIND_RANK[a.d.kind] ?? 99;
      const rankB = CHRONO_KIND_RANK[b.d.kind] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.i - b.i;
    })
    .map((x) => x.d);
}

/** @param {object[]} docs @param {object[]} vendors @param {object[]} customers @param {number} months */
export function summarizeReselling(docs, vendors, customers, months) {
  const byKind = {};
  for (const d of docs) byKind[d.kind] = (byKind[d.kind] || 0) + 1;
  /** @param {object[]} parties @param {(d: object) => boolean} owns */
  const monthlyFloor = (parties, owns) => {
    let worst = Infinity;
    for (const p of parties) {
      for (let m = 0; m < months; m++) {
        const n = docs.filter((d) => d.partyKey === p.key && d.resellingMonth === m && owns(d)).length;
        worst = Math.min(worst, n);
      }
    }
    return worst;
  };
  return {
    byKind,
    total: docs.length,
    vendors: vendors.length,
    customers: customers.length,
    // The ask's hard floor: every party, every month, at least one document.
    minVendorDocsPerMonth: monthlyFloor(vendors, (d) =>
      ["purchase_order", "purchase_receipt", "purchase_invoice"].includes(d.kind),
    ),
    minCustomerDocsPerMonth: monthlyFloor(customers, (d) =>
      ["delivery_note", "sales_invoice"].includes(d.kind),
    ),
  };
}
