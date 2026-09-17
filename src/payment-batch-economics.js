/**
 * The OI-161 math: suggest which outstanding Bills to combine into one payment, and when to pay
 * them, by comparing per-payment fees saved against the float cost of paying early. Pure — no ERP
 * writes, no fetch. Suggestion only; the caller decides whether to act (HANDOFF "auditable how").
 *
 * Business rule (locked intent, from OI-161): minimize all-in payment cost (fees + lost float), not
 * due-date slavishness. Never batch past the earliest due date in a group — paying late to save
 * postage is never on the table. A discount window always wins its own comparison first, ahead of
 * any batching decision.
 */

import { effectivePayByDate } from "./bank-business-days.js";
import { formatUsdAmount } from "./money.js";

/** @param {string} isoDate "YYYY-MM-DD" */
function parseIso(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate).trim());
  if (!m) throw new Error(`Invalid ISO date: ${isoDate}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Whole calendar days from `fromIso` to `toIso` (positive when `toIso` is later). */
function daysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 86400000);
}

/** @param {number} x */
function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * Dollars as the Doc skins show them — `$1,225.00`, via `money.js` — so a rationale sentence and
 * the amount beside it never disagree about grouping (5zorro 2026-09-12).
 * @param {number} x
 */
function usd(x) {
  return formatUsdAmount(round2(x));
}

/** @param {number} amount @param {number} apr @param {number} days cost of paying `days` before the due date */
function floatCost(amount, apr, days) {
  if (days <= 0) return 0;
  return amount * (apr / 365) * days;
}

/**
 * @typedef {import("./outstanding-bills.js").OutstandingBillRow} OutstandingBillRow
 * @typedef {{
 *   id: string,               // unique per group — `payOn` is NOT unique; see assignGroupIds
 *   supplier: string,
 *   bills: string[],          // installmentKeys (outstanding-bills.js) — not always == invoice name
 *   payOn: string,
 *   totalAmount: number,
 *   feesSaved: number,
 *   floatCost: number,
 *   netBenefit: number,
 *   rationale: string,
 *   reason: "batch" | "discount-capture" | "pay-alone",
 *   method?: string,          // Mode of Payment this group is paid by — present only when the
 *                             //   caller supplied `feeForMethod`; absent for a NULL-method bill
 *   perPaymentFee?: number,   // the fee this group was actually priced at. Recorded rather than
 *                             //   recomputed so the audit trail (B5) can show the input, not just
 *                             //   the arithmetic — a $0.40 ACH saving and a $25 wire saving are
 *                             //   indistinguishable once collapsed into `feesSaved`
 * }} PaymentBatchGroup
 */

/**
 * @param {{
 *   bills: OutstandingBillRow[],
 *   perPaymentFee: number,
 *   apr: number,
 *   feeForMethod?: (method: string) => number,
 *   runBreaks?: string[],
 * }} args `runBreaks` (C8) are dates no batch may cross — `checkRunSplits` from
 *   `check-run-schedule.js`. A bill payable on or after a boundary is never combined with one
 *   payable before it; within each stretch the grouping is still the exact cheapest one. Omitted or
 *   empty, nothing changes. `feeForMethod` opts into per-method pricing (Packet B2b) — pass
 *   `paymentMethodFeeResolver(prefs)` from `payment-batch-prefs.js`. Omit it and behaviour is
 *   byte-identical to before: one partition, one flat `perPaymentFee`. There is no `groupWindowDays`
 *   any more (retired 2026-09-12 — see `cheapestPartition`); an old caller passing it changes nothing.
 * @returns {{ groups: PaymentBatchGroup[] }}
 */
export function paymentBatchEconomics(args) {
  const { bills, perPaymentFee, apr, feeForMethod } = args || {};
  const byMethodPricing = typeof feeForMethod === "function";
  const runBreaks = normalizeRunBreaks(args && args.runBreaks);
  const list = Array.isArray(bills) ? bills : [];

  /** @type {PaymentBatchGroup[]} */
  const groups = [];
  const candidates = [];

  // Pass 1: discount capture always wins its own comparison first, independent of any group the
  // bill could otherwise join (OI-161: "do not let batching logic bury it").
  for (const bill of list) {
    const effectiveDueDate = effectivePayByDate(bill.dueDate);
    const captured = tryDiscountCapture(bill, effectiveDueDate, apr);
    if (captured) {
      // A discount capture never reaches the method partitioning below (it is decided first, by
      // design), so it has to be tagged here or it reports itself as having no method at all.
      // Found 2026-09-11 rendering C3's chip: every discount-capture node claimed "No method"
      // while its own bill plainly carried `ACH`. The group is still one payment for one bill, so
      // the method is simply that bill's.
      groups.push(
        byMethodPricing
          ? tagMethod(captured, methodKeyOf(bill), resolveMethodFee(feeForMethod, methodKeyOf(bill), perPaymentFee))
          : captured,
      );
      continue;
    }
    candidates.push({ ...bill, effectiveDueDate });
  }

  // Pass 2: partition by METHOD, then by supplier, then find the cheapest grouping of each
  // partition exactly (`cheapestPartition`) — every bill in the payment that costs least for it.
  //
  // 🔴 Method partitioning is a hard constraint, not an optimisation (Packet B2b): a **Payment
  // Entry carries one header `mode_of_payment`**, so bills paid different ways physically cannot
  // merge into one payment however good the arithmetic looks. Clustering by supplier alone would
  // propose an impossible batch the moment a vendor's bills carry different terms — which Packet A
  // makes normal rather than exotic. Partitioning first also means each partition is priced at its
  // own fee, which matters enormously: ACH is $0.40 and an international wire is $50.
  const byMethod = new Map();
  for (const bill of candidates) {
    const key = byMethodPricing ? methodKeyOf(bill) : "";
    if (!byMethod.has(key)) byMethod.set(key, []);
    byMethod.get(key).push(bill);
  }

  for (const [method, methodBills] of byMethod) {
    const fee = byMethodPricing ? resolveMethodFee(feeForMethod, method, perPaymentFee) : perPaymentFee;

    const bySupplier = new Map();
    for (const bill of methodBills) {
      if (!bySupplier.has(bill.supplier)) bySupplier.set(bill.supplier, []);
      bySupplier.get(bill.supplier).push(bill);
    }

    for (const supplierBills of bySupplier.values()) {
      const stretches = splitAtRunBreaks(supplierBills, runBreaks);
      stretches.forEach((stretch, s) => {
        const context = {
          earlierBoundary: s > 0 ? stretch.boundary : "",
          laterBoundary: s < stretches.length - 1 ? stretches[s + 1].boundary : "",
        };
        for (const g of cheapestPartition(stretch.bills, fee, apr, context)) {
          groups.push(byMethodPricing ? tagMethod(g, method, fee) : g);
        }
      });
    }
  }

  return { groups: assignGroupIds(groups) };
}

/**
 * The partition key for a bill: its `Mode of Payment`, or `""` when the bill does not state one.
 *
 * NULL-method bills legitimately share a partition — that is every row in the sandbox today, and
 * they are all priced at the caller's fallback fee. They must not be silently folded in with a
 * named method: "unknown" and "ACH" are different claims, and merging them would batch a cheque
 * with an ACH push.
 *
 * @param {OutstandingBillRow} bill
 * @returns {string}
 */
function methodKeyOf(bill) {
  const m = bill && bill.modeOfPayment;
  return m == null ? "" : String(m).trim();
}

/**
 * The fee for one method partition, falling back to the flat `perPaymentFee` when the resolver
 * declines. Never falls back to `0` — a free payment would make the engine invent fee savings.
 *
 * @param {(method: string) => number} feeForMethod
 * @param {string} method
 * @param {number} fallback
 * @returns {number}
 */
function resolveMethodFee(feeForMethod, method, fallback) {
  let fee;
  try {
    fee = feeForMethod(method);
  } catch {
    fee = undefined;
  }
  if (Number.isFinite(fee) && Number(fee) >= 0) return Number(fee);
  return Number.isFinite(fallback) && Number(fallback) >= 0 ? Number(fallback) : 0;
}

/**
 * Record what this group was priced as, for the audit trail (B5).
 * @param {PaymentBatchGroup} g @param {string} method @param {number} fee
 * @returns {PaymentBatchGroup}
 */
function tagMethod(g, method, fee) {
  const out = { ...g, perPaymentFee: fee };
  if (method) out.method = method;
  return out;
}

/**
 * A stable, unique id per group. The view needs one to tell two proposed payments apart — it used
 * `payOn`, which is not unique (one vendor's cheque and ACH payments can share a date, and so can a
 * discount capture and a batch), so hovering one same-day check lit
 * every other check on that date and their ribbons with it.
 *
 * Every bill lands in exactly one group (a discount capture removes its bill from `candidates`), so
 * the first member's `installmentKey` is already globally unique; pairing it with `payOn` just keeps
 * the id readable in the DOM. Deterministic — the same inputs give the same ids, so a re-render
 * from a prefs change does not silently move a pinned focus onto a different payment.
 *
 * @param {PaymentBatchGroup[]} groups
 * @returns {PaymentBatchGroup[]}
 */
function assignGroupIds(groups) {
  return groups.map((g, i) => ({ ...g, id: `${g.payOn}#${(g.bills && g.bills[0]) || `g${i}`}` }));
}

/**
 * @param {OutstandingBillRow} bill
 * @param {string} effectiveDueDate
 * @param {number} apr
 * @returns {PaymentBatchGroup|null}
 */
function tryDiscountCapture(bill, effectiveDueDate, apr) {
  if (!bill.discountDate || !(bill.discountAmount > 0)) return null;
  const discountPayOn = effectivePayByDate(bill.discountDate);
  const daysEarly = daysBetween(discountPayOn, effectiveDueDate);
  if (daysEarly < 0) return null; // malformed data — discount date after due date; ignore
  const cost = round2(floatCost(bill.outstanding, apr, daysEarly));
  if (!(bill.discountAmount > cost)) return null;
  const net = round2(bill.discountAmount - cost);
  return {
    supplier: bill.supplier,
    bills: [bill.installmentKey],
    payOn: discountPayOn,
    totalAmount: round2(bill.outstanding),
    feesSaved: 0,
    floatCost: cost,
    netBenefit: net,
    rationale: `Discount capture: pay by ${discountPayOn} to save ${usd(bill.discountAmount)} (float cost ${usd(cost)}) = ${usd(net)} net`,
    reason: "discount-capture",
  };
}

/**
 * Valid, de-duplicated, sorted check-run boundaries. Anything that is not a "YYYY-MM-DD" string is
 * dropped, so a caller passing junk gets the unbounded grouping rather than a surprising split.
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeRunBreaks(raw) {
  if (!Array.isArray(raw)) return [];
  const valid = raw.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
  return [...new Set(valid)].sort();
}

/**
 * One supplier's bills cut into the stretches between check-run boundaries (C8), each tagged with
 * the boundary it starts at. Only non-empty stretches are returned, in date order. A bill belongs
 * to the stretch its own pay-by date falls in, so bills payable on one date always stay together.
 *
 * @template {{ effectiveDueDate: string }} T
 * @param {T[]} bills
 * @param {string[]} breaks sorted
 * @returns {Array<{ bills: T[], boundary: string }>}
 */
function splitAtRunBreaks(bills, breaks) {
  if (!breaks.length) return [{ bills, boundary: "" }];
  /** @type {Map<number, T[]>} */
  const byStretch = new Map();
  for (const bill of bills) {
    let k = 0;
    while (k < breaks.length && breaks[k] <= bill.effectiveDueDate) k++;
    if (!byStretch.has(k)) byStretch.set(k, []);
    byStretch.get(k).push(bill);
  }
  return [...byStretch.keys()]
    .sort((a, b) => a - b)
    .map((k) => ({ bills: byStretch.get(k), boundary: k > 0 ? breaks[k - 1] : "" }));
}

/** Two costs this close are the same cost — floating-point noise must not decide a grouping. */
const EPSILON = 1e-9;

/**
 * The cheapest way to pay one supplier's bills within one method partition — the exact answer to
 * OI-161's rule (minimize fees + float) over every possible grouping, not a heuristic.
 *
 * 🔴 Replaces a greedy window-then-all-or-nothing pass (2026-09-12). That pass clustered bills lying
 * within `groupWindowDays` of each cluster's earliest one, then batched the whole cluster or none of
 * it, and it failed in both directions. 5zorro caught the first: a bill whose own float exceeded the
 * one fee it saved rode along inside a batch that won overall — *"a bill that loses money inside a
 * batch, should make a new batch"*. The mirror case was as real: a cluster that lost overall scattered
 * every bill to pay alone, even when part of it would have batched profitably. The window existed
 * only to keep clusters small enough to win, so it went too; so did the separate same-day merge
 * (bills already payable on one date cost no float to combine, so this finds that on its own).
 *
 * Why the exact answer is cheap — two facts about the problem:
 *
 * 1. **Groups never interleave.** Whatever payment dates are chosen, each bill is cheapest on the
 *    latest one not after its own payable date (least float, and never late). So a group is always a
 *    run of consecutive bills in date order, paid on its first member's date, and only splits of
 *    the sorted list need weighing.
 * 2. **The cheapest split builds up one bill at a time** (dynamic programming). `best[j]` is the
 *    cheapest way to pay the first `j` bills. Bill `j`'s only question is which earlier bill `i`
 *    starts the payment it is the last member of: `best[i] + fee + float of i..j on i's date`. Each
 *    answer reuses stored earlier ones, so every split is weighed without listing them — O(n²), about
 *    8,100 steps for SUP-DAILY's 90 installments.
 *
 * What that guarantees, and the tests hold it to: **no batch member loses money.** If one's float
 * exceeded the fee, starting a new payment at it would be cheaper, so the answer already has. The
 * result is also checked against brute force over every possible grouping.
 *
 * Exact ties lean to fewer payments: at equal cost one payment is less clerical work, which is real
 * even though the model does not price it.
 *
 * @param {Array<OutstandingBillRow & { effectiveDueDate: string }>} bills one supplier, one method,
 *   one stretch between check-run boundaries
 * @param {number} fee
 * @param {number} apr
 * @param {{ earlierBoundary?: string, laterBoundary?: string }} [context] the check-run boundaries
 *   either side of this stretch, when the caller split at any — only the pay-alone wording uses them
 * @returns {PaymentBatchGroup[]} in date order
 */
function cheapestPartition(bills, fee, apr, context = {}) {
  const sorted = bills.slice().sort((a, b) => a.effectiveDueDate.localeCompare(b.effectiveDueDate));
  const n = sorted.length;
  if (!n) return [];
  const usableApr = Number.isFinite(apr) && apr >= 0;
  const day = sorted.map((b) => Math.round(parseIso(b.effectiveDueDate).getTime() / 86400000));
  const amount = sorted.map((b) => (Number.isFinite(b.outstanding) ? b.outstanding : 0));
  // Float of paying bill k on bill i's date. Without a usable APR the cost of paying early is
  // unknown, so it is treated as prohibitive — the model may then combine same-day bills only.
  const floatOf = (k, i) => {
    const days = day[k] - day[i];
    if (days <= 0) return 0;
    return usableApr ? floatCost(amount[k], apr, days) : Infinity;
  };

  const best = new Array(n + 1).fill(Infinity);
  const startOf = new Array(n + 1).fill(0);
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    let float = 0;
    for (let j = i; j < n; j++) {
      float += floatOf(j, i);
      if (float === Infinity) break;
      const cost = best[i] + fee + float;
      // Strictly cheaper only: anchors are tried earliest first, so a tie keeps the longer payment.
      if (cost < best[j + 1] - EPSILON) {
        best[j + 1] = cost;
        startOf[j + 1] = i;
      }
    }
  }

  /** @type {Array<[number, number]>} [first, end) index ranges into `sorted`, date order */
  const runs = [];
  for (let end = n; end > 0; end = startOf[end]) runs.push([startOf[end], end]);
  runs.reverse();

  return runs.map(([first, end], r) => {
    const members = sorted.slice(first, end);
    const payOn = members[0].effectiveDueDate;
    const supplier = members[0].supplier;
    const totalAmount = round2(members.reduce((s, b) => s + b.outstanding, 0));

    if (members.length === 1) {
      const previous = r > 0 ? sorted[runs[r - 1][0]] : null;
      return {
        supplier,
        bills: [members[0].installmentKey],
        payOn,
        totalAmount,
        feesSaved: 0,
        floatCost: 0,
        netBenefit: 0,
        rationale: payAloneRationale(members[0], previous, n, fee, apr, context),
        reason: "pay-alone",
      };
    }

    let rawFloat = 0;
    for (let k = first; k < end; k++) rawFloat += floatOf(k, first);
    const feesSaved = round2((members.length - 1) * fee);
    const cost = round2(rawFloat);
    const netBenefit = round2(feesSaved - cost);
    return {
      supplier,
      bills: members.map((b) => b.installmentKey),
      payOn,
      totalAmount,
      feesSaved,
      floatCost: cost,
      netBenefit,
      rationale:
        rawFloat === 0
          ? `${members.length} bills already payable on ${payOn}: one payment saves ${usd(feesSaved)} in fees at no float cost`
          : `${members.length} bills batched: ${usd(feesSaved)} fee saved vs ${usd(cost)} float cost = ${usd(netBenefit)} net`,
      reason: "batch",
    };
  });
}

/**
 * Why a bill pays alone, stated as the one move a clerk would think of: joining the payment just
 * before it. Optimality guarantees that move costs at least the fee it saves, so the sentence is
 * always true. The first bill has no earlier payment to join; later bills only ever join earlier
 * dates, never the reverse, so "no later bill is worth paying early to join it" is the whole reason.
 *
 * @param {OutstandingBillRow & { effectiveDueDate: string }} bill
 * @param {(OutstandingBillRow & { effectiveDueDate: string })|null} previous first bill of the payment before
 * @param {number} partitionSize bills that could share a payment with this one
 * @param {number} fee
 * @param {number} apr
 * @param {{ earlierBoundary?: string, laterBoundary?: string }} [context] check-run boundaries (C8)
 */
function payAloneRationale(bill, previous, partitionSize, fee, apr, context = {}) {
  if (!previous) {
    // A check-run boundary is the reason when there is one: the economics were never consulted
    // across it, so a fee-vs-float sentence here would describe a comparison that did not happen.
    if (context.earlierBoundary) {
      return `Not combined with earlier ${bill.supplier} bills: those go out before the ${context.earlierBoundary} check run, and this one does not`;
    }
    if (partitionSize > 1) return `Paid alone: no later ${bill.supplier} bill is worth paying early to join it`;
    if (context.laterBoundary) {
      return `Paid alone: the next ${bill.supplier} bill belongs to the ${context.laterBoundary} check run or later, and payments are never combined across a run`;
    }
    return `Paid alone: no other ${bill.supplier} bills that can share its payment`;
  }
  const days = daysBetween(previous.effectiveDueDate, bill.effectiveDueDate);
  if (!(Number.isFinite(apr) && apr >= 0)) {
    return `Not batched: no usable APR, so it is never paid early to join the ${previous.effectiveDueDate} payment`;
  }
  const join = round2(floatCost(bill.outstanding, apr, days));
  return `Not batched: joining the ${previous.effectiveDueDate} payment means paying ${days} day${days === 1 ? "" : "s"} early — ${usd(join)} float cost, ${join > round2(fee) ? "more than" : "no less than"} the ${usd(fee)} fee it would save`;
}

/**
 * @typedef {{
 *   kind: "sets-date"|"same-day"|"joined-early"|"pay-alone"|"discount-capture",
 *   installmentKey: string,
 *   payOn: string,             // the group's date — where this bill is actually paid
 *   ownPayOn: string,          // where the bank calendar alone would have put it ("" if unknowable)
 *   daysEarly: number,         // payOn -> ownPayOn, 0 when the group did not move it
 *   amount: number,
 *   apr: number|null,
 *   fee: number|null,          // the one payment this bill's joining avoids
 *   feeSaved: number,          // credited to this bill: `fee` for every batch member but the anchor
 *   floatCost: number|null,    // this bill's own float, null when no usable APR was supplied
 *   net: number|null,
 *   groupSize: number,
 *   groupFeesSaved: number,
 *   groupFloatCost: number,
 *   groupNet: number,
 *   method: string,
 *   rationale: string,
 * }} GroupMembership
 */

/**
 * Why one bill is paid on its group's date rather than its own — the batching half of the
 * per-payment audit (5zorro 2026-09-12: the row audit walked `8/2 → 8/1 → 7/31` and stopped,
 * while the suggested payment beside it said 7/28, and nothing connected the two).
 *
 * The group's numbers are attributed per bill so a row can speak for itself, and the attribution
 * is exact rather than proportional: a batch of `n` saves `n - 1` payments, so **every member except
 * the anchor is credited one fee**, and each is charged only its own float. The per-bill nets then
 * sum to the group's `netBenefit` (to the cent, give or take rounding) — which is what makes the
 * row audit and the group popup agree instead of being two unrelated explanations.
 *
 * The anchor is `group.bills[0]`: `cheapestPartition` emits members in date order, so it holds the
 * earliest payable date and is the reason the group pays when it does. Its own net is 0 by
 * construction — it moved no day and avoided no payment; the others avoided *its* payment.
 *
 * A member's own net cannot be negative in a group `cheapestPartition` produced — that was the bug
 * 5zorro found in the all-or-nothing engine it replaced. The case is still reported (as `warn`)
 * rather than assumed away, because this function accepts any group it is handed.
 *
 * @param {PaymentBatchGroup|null|undefined} group
 * @param {OutstandingBillRow|null|undefined} bill
 * @param {{ apr?: number, perPaymentFee?: number }} [opts] `apr` must be the one the groups were
 *   priced with. `perPaymentFee` is only a fallback: a group priced per method records its own.
 * @returns {GroupMembership|null} null when `bill` is not a member of `group`
 */
export function explainGroupMembership(group, bill, opts = {}) {
  const g = group || {};
  const keys = Array.isArray(g.bills) ? g.bills : [];
  const index = bill ? keys.indexOf(bill.installmentKey) : -1;
  if (index < 0 || !g.payOn) return null;

  const apr = Number.isFinite(opts.apr) ? Number(opts.apr) : null;
  // Recorded fee first (per-method pricing tags it); else read it back off the batch itself, since
  // `feesSaved` is exactly `(n - 1) * fee` for every batch `cheapestPartition` emits — the
  // fee the engine really used beats any fallback the caller supplies.
  const fee = Number.isFinite(g.perPaymentFee)
    ? Number(g.perPaymentFee)
    : g.reason === "batch" && keys.length > 1 && Number.isFinite(g.feesSaved)
      ? round2(Number(g.feesSaved) / (keys.length - 1))
      : Number.isFinite(opts.perPaymentFee) && Number(opts.perPaymentFee) >= 0
        ? Number(opts.perPaymentFee)
        : null;
  const amount = Number.isFinite(bill.outstanding) ? Number(bill.outstanding) : 0;

  let ownPayOn = "";
  try {
    ownPayOn = effectivePayByDate(g.reason === "discount-capture" ? bill.discountDate : bill.dueDate);
  } catch {
    ownPayOn = "";
  }
  const daysEarly = ownPayOn ? Math.max(0, daysBetween(g.payOn, ownPayOn)) : 0;

  /** @type {GroupMembership["kind"]} */
  let kind;
  if (g.reason === "discount-capture") kind = "discount-capture";
  else if (g.reason !== "batch") kind = "pay-alone";
  else if (index === 0) kind = "sets-date";
  else kind = daysEarly > 0 ? "joined-early" : "same-day";

  const credited = kind === "joined-early" || kind === "same-day";
  const feeSaved = credited && fee != null ? fee : 0;
  const ownFloat = !credited ? 0 : apr == null ? null : round2(floatCost(amount, apr, daysEarly));

  return {
    kind,
    installmentKey: bill.installmentKey,
    payOn: g.payOn,
    ownPayOn,
    daysEarly,
    amount,
    apr,
    fee,
    feeSaved,
    floatCost: ownFloat,
    net: ownFloat == null || (credited && fee == null) ? null : round2(feeSaved - ownFloat),
    groupSize: keys.length,
    groupFeesSaved: Number(g.feesSaved) || 0,
    groupFloatCost: Number(g.floatCost) || 0,
    groupNet: Number(g.netBenefit) || 0,
    method: g.method || "",
    rationale: g.rationale || "",
  };
}

/**
 * The membership as one more row of the per-payment derivation table, plus the group's totals as a
 * note beneath it. Step-shaped on purpose (`rule`/`label`/`date`/`deltaDays`/`detail`, same as
 * `payment-date-derivation.js`) so the calendar walk and the batching move read as one list ending
 * on the date the payment is really made.
 *
 * @param {GroupMembership|null} m
 * @param {{ methodLabel?: string }} [opts] display name for `m.method` (e.g. "Check" for USPS_Check)
 * @returns {{ step: { rule: "batched"|"pay-alone"|"discount-capture", label: string, date: string,
 *   deltaDays: number, detail: string, severity?: "warn" }, note: string } | null}
 */
export function describeGroupMembership(m, opts = {}) {
  if (!m) return null;
  const others = m.groupSize - 1;
  const feeName = [opts.methodLabel || m.method, "payment fee"].filter(Boolean).join(" ");
  const note =
    m.kind === "sets-date" || m.kind === "same-day" || m.kind === "joined-early"
      ? `Whole payment: ${m.groupSize} bills, ${usd(m.groupFeesSaved)} fees saved − ${usd(m.groupFloatCost)} float cost = ${usd(m.groupNet)} net.`
      : "";

  if (m.kind === "pay-alone") {
    return { step: { rule: "pay-alone", label: "Paid alone", date: m.payOn, deltaDays: 0, detail: m.rationale }, note };
  }
  if (m.kind === "discount-capture") {
    return {
      step: { rule: "discount-capture", label: "Discount capture", date: m.payOn, deltaDays: 0, detail: m.rationale },
      note,
    };
  }
  if (m.kind === "sets-date") {
    return {
      step: {
        rule: "batched",
        label: "Sets the payment date",
        date: m.payOn,
        deltaDays: 0,
        detail: `${m.payOn} is the earliest payable date of the ${m.groupSize} bills in this payment, so the other ${others} ${others === 1 ? "is" : "are"} paid with it.`,
      },
      note,
    };
  }

  const fee = m.fee == null ? "one payment fee (amount unknown)" : `one ${usd(m.fee)} ${feeName}`;
  if (m.kind === "same-day") {
    return {
      step: {
        rule: "batched",
        label: "Batched",
        date: m.payOn,
        deltaDays: 0,
        detail:
          m.net == null
            ? `Already payable on ${m.payOn}: joining that payment costs no float and saves ${fee}.`
            : `${usd(m.net)} saved by batching with the ${m.payOn} payment — already payable that day, so it saves ${fee} at no float cost.`,
      },
      note,
    };
  }

  // joined-early
  const days = `${m.daysEarly} day${m.daysEarly === 1 ? "" : "s"}`;
  const step = { rule: /** @type {const} */ ("batched"), label: "Batched", date: m.payOn, deltaDays: -m.daysEarly, detail: "" };
  if (m.net == null) {
    step.detail = `Paid ${days} early to join the ${m.payOn} payment, saving ${fee}; float cost unknown (no APR supplied).`;
    return { step, note };
  }
  const arithmetic = `${usd(m.amount)} × ${+(m.apr * 100).toFixed(2)}% APR × ${m.daysEarly}/365`;
  if (m.net >= 0) {
    step.detail = `${usd(m.net)} saved by batching with the ${m.payOn} payment — ${fee} against ${usd(m.floatCost)} float cost for paying ${days} early (${arithmetic}).`;
  } else {
    step.severity = "warn";
    step.detail = `Costs ${usd(-m.net)} more than it saves on its own — ${fee} against ${usd(m.floatCost)} float cost for paying ${days} early (${arithmetic}). Paying it alone would be cheaper, so this is not the cheapest grouping.`;
  }
  return { step, note };
}
