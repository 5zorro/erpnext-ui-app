/**
 * Deterministic sample-data corpus plan (OI-055 / plan S−1).
 * Pure: no ERP I/O. The ops runner applies this JSON via sandbox-only bench seed.
 *
 * Link graph is designed so clerks can dogfood:
 *   - create from nothing (no source)
 *   - create from source (Q→SO→SI, PO→PR→PI, PO→PI)
 *   - leftover open sources in pickers
 *
 * Tax mix (OI-115): ~7/8 customers taxable (sales tax on submitted SI);
 * most AP nontaxable (no purchase ST); ~2/8 suppliers have tax withholding (TDS)
 * applied on their submitted PIs → Tax Withholding Details report.
 */

/** Bump when corpus shape or bill_no series changes — `--reset` deletes prior tag. */
export const SAMPLE_TAG = "ui-app-sample-v4";

/** Tax Withholding Category name created by seed_corpus (SSoT for plan + applicator). */
export const SAMPLE_TDS_CATEGORY = "SAMPLE-TDS";

export const DEFAULT_COUNTS = Object.freeze({
  quotation: 25,
  sales_order: 25,
  sales_invoice: 25,
  purchase_order: 25,
  purchase_receipt: 25,
  purchase_invoice: 25,
});

/** Extra unsaved (docstatus 0) docs per kind — Find/Drafts dogfood; not 25. */
export const DEFAULT_DRAFTS_PER_KIND = 5;

export const DEFAULT_PARTY_COUNTS = Object.freeze({
  suppliers: 8,
  customers: 8,
  items: 12,
});

/** @param {number} n */
/**
 * Modes of Payment the fixtures need. ERPNext ships `Bank Draft / Cash / Check / Credit Card /
 * Wire Transfer` — none of which name the *rail*, which is what the cost model turns on
 * (payment-batch-prefs.js keys its fee table by exactly these names).
 */
export const SAMPLE_MODES_OF_PAYMENT = Object.freeze([
  { name: "USPS_Check", type: "Bank" },
  { name: "ACH", type: "Bank" },
  { name: "DOM_WIRE", type: "Bank" },
  // No term uses INT_WIRE — it exists so the $50 entry in the fee table has a real Mode of Payment
  // behind it, and so a clerk can pick it on a Payment Entry without setup.
  { name: "INT_WIRE", type: "Bank" },
]);

/**
 * The Payment Terms fixtures, each wrapped by a single-row Payment Terms Template of the same name
 * (a Supplier can only link a Template, never a bare Term).
 *
 * `dueDateBasedOn` uses ERPNext's own Select values verbatim. "Net 10th" — due on the 10th of the
 * month following the invoice — is `Day(s) after the end of the invoice month` with `creditDays: 10`,
 * NOT a day-of-month field: ERPNext has no such field, and end-of-month + 10 days is the 10th.
 *
 * Grace values are deliberately spread across the sign: a strict vendor that needs the cheque to
 * land early (-3), an ordinary electronic tolerance (+2/+5), a long-standing postal tolerance (+16),
 * and one explicit "no grace at all" (+0, which parses as 0 rather than as absent).
 *
 * 🔄 **`creditDays` is contract + grace** (5zorro 2026-09-09). "Net 30 with a +16 tolerance" is a
 * Payment Term of **46** days, so ERPNext computes the real due date and the shell simply reads it.
 * The shell must never shift a due date itself — that was the reversed design, and it double-counts.
 * The name keeps the breakdown (`NET_30_DAYS (POSTAL) +16` says where 46 came from, which
 * `NET_46_DAYS` could not), but it is documentation: nothing parses it to reach a payment date.
 */
export const SAMPLE_PAYMENT_TERMS = Object.freeze([
  {
    key: "PT-NET30-POST-STRICT",
    name: "NET_30_DAYS (POSTAL) -3",
    creditDays: 27, // contract 30, tolerance -3
    dueDateBasedOn: "Day(s) after invoice date",
    modeOfPayment: "USPS_Check",
    description: "Net 30 from invoice date. Cheque by post; vendor wants it in hand before due.",
  },
  {
    key: "PT-NET30-POST-LOOSE",
    name: "NET_30_DAYS (POSTAL) +16",
    creditDays: 46, // contract 30, tolerance +16
    dueDateBasedOn: "Day(s) after invoice date",
    modeOfPayment: "USPS_Check",
    description: "Net 30 from invoice date. Cheque by post.",
  },
  {
    key: "PT-NET30-ACH",
    name: "NET_30_DAYS (ACH) +2",
    creditDays: 32, // contract 30, tolerance +2
    dueDateBasedOn: "Day(s) after invoice date",
    modeOfPayment: "ACH",
    description: "Net 30 from invoice date, paid by ACH.",
  },
  {
    key: "PT-2-10-NET30-ACH",
    name: "2%_10_NET_30 (ACH) +2",
    creditDays: 32, // contract 30, tolerance +2
    dueDateBasedOn: "Day(s) after invoice date",
    modeOfPayment: "ACH",
    discountType: "Percentage",
    discount: 2,
    discountValidity: 10,
    discountValidityBasedOn: "Day(s) after invoice date",
    description: "2% if paid within 10 days, otherwise net 30. ACH.",
  },
  {
    key: "PT-2-10-NET30-POST",
    name: "2%_10_NET_30 (POSTAL) -3",
    creditDays: 27, // contract 30, tolerance -3
    dueDateBasedOn: "Day(s) after invoice date",
    modeOfPayment: "USPS_Check",
    discountType: "Percentage",
    discount: 2,
    discountValidity: 10,
    discountValidityBasedOn: "Day(s) after invoice date",
    description: "2% if paid within 10 days, otherwise net 30. Cheque by post.",
  },
  {
    key: "PT-NET10TH-ACH",
    name: "NET_10TH (ACH) +5",
    creditDays: 15, // contract month-end+10, tolerance +5
    dueDateBasedOn: "Day(s) after the end of the invoice month",
    modeOfPayment: "ACH",
    description: "Due the 10th of the month following the invoice. ACH.",
  },
  {
    key: "PT-NET15-WIRE",
    name: "NET_15_DAYS (DOM_WIRE) +0",
    creditDays: 15, // contract 15, tolerance +0
    dueDateBasedOn: "Day(s) after invoice date",
    modeOfPayment: "DOM_WIRE",
    description: "Net 15, domestic wire. No grace — this vendor charges on day 16.",
  },
]);

export function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * @param {object} [opts]
 * @param {number} [opts.windowDays]
 * @param {typeof DEFAULT_COUNTS} [opts.counts]
 * @param {number} [opts.draftsPerKind] draft (unsubmitted) extras per kind
 * @param {typeof DEFAULT_PARTY_COUNTS} [opts.parties]
 * @param {string} [opts.tag]
 */
export function buildCorpusPlan(opts = {}) {
  const windowDays = Number.isFinite(opts.windowDays) ? opts.windowDays : 60;
  const counts = { ...DEFAULT_COUNTS, ...(opts.counts || {}) };
  const draftsPerKind = Number.isFinite(opts.draftsPerKind)
    ? Math.max(0, opts.draftsPerKind)
    : DEFAULT_DRAFTS_PER_KIND;
  const partyCounts = { ...DEFAULT_PARTY_COUNTS, ...(opts.parties || {}) };
  const tag = opts.tag || SAMPLE_TAG;

  // OI-115: first 7 taxable (~87.5%), last exempt.
  const customers = Array.from({ length: partyCounts.customers }, (_, i) => ({
    key: `CUS-${pad2(i)}`,
    name: `SAMPLE Customer ${pad2(i + 1)}`,
    taxable: i < partyCounts.customers - 1,
  }));
  // ~2/8 vendors with TDS withholding; AP sales-tax off for all.
  const suppliers = Array.from({ length: partyCounts.suppliers }, (_, i) => ({
    key: `SUP-${pad2(i)}`,
    name: `SAMPLE Vendor ${pad2(i + 1)}`,
    taxWithholding: i < 2,
    // OI-087: your account # at the vendor (Customer Number At Supplier).
    accountNumber: i === 0 ? "CUST-44192" : i === 1 ? "ACCT-998877" : null,
    // A5: round-robin the term catalogue so every term appears on real bills and the dashboard
    // has a mix of methods and graces to reason about, rather than one term repeated eight times.
    paymentTermsKey: SAMPLE_PAYMENT_TERMS[i % SAMPLE_PAYMENT_TERMS.length].key,
  }));
  // OI-131: picker rank fixtures — not used in the 60-day rotation.
  suppliers.push(
    { key: "SUP-IDLE", name: "SAMPLE Vendor Idle", taxWithholding: false, activity: "idle" },
    { key: "SUP-NEVER", name: "SAMPLE Vendor Never", taxWithholding: false, activity: "never" },
  );
  // OI-161 / Packet G: dedicated vendors for the daily-payment-schedule batching fixture —
  // small and large dollar scale, so Packet 2's economics can be dogfooded at both.
  suppliers.push(
    // Deliberate method split across the batching fixtures: the cheque vendor should batch, the
    // ACH vendor should mostly NOT (at $0.40 a push the float almost always wins), and the wire
    // vendor should batch aggressively at $25. That contrast is the point of the fixture now.
    {
      key: "SUP-DAILY",
      name: "SAMPLE Vendor Daily Payrun",
      taxWithholding: false,
      paymentTermsKey: "PT-NET30-POST-LOOSE",
    },
    {
      key: "SUP-DAILY-LG",
      name: "SAMPLE Vendor Daily Payrun Large",
      taxWithholding: false,
      paymentTermsKey: "PT-NET15-WIRE",
    },
    {
      key: "SUP-OVERLAP",
      name: "SAMPLE Vendor Overlapping Schedules",
      taxWithholding: false,
      paymentTermsKey: "PT-NET30-ACH",
    },
  );
  const items = Array.from({ length: partyCounts.items }, (_, i) => ({
    key: `ITM-${pad2(i)}`,
    code: `SAMPLE-SKU-${pad2(i + 1)}`,
    name: `SAMPLE Item ${pad2(i + 1)}`,
    rate: 10 + (i % 7) * 5.5,
  }));
  const projects = [
    { key: "PRJ-00", name: "SAMPLE Project Alpha", customerKey: "CUS-00" },
    { key: "PRJ-01", name: "SAMPLE Project Beta", customerKey: "CUS-01" },
    { key: "PRJ-02", name: "SAMPLE Project Overhead", customerKey: null },
    { key: "PRJ-03", name: "SAMPLE Project Gamma", customerKey: "CUS-02" },
  ];

  const customerByKey = Object.fromEntries(customers.map((c) => [c.key, c]));
  const supplierByKey = Object.fromEntries(suppliers.map((s) => [s.key, s]));

  /** @type {object[]} */
  const docs = [];

  for (let i = 0; i < counts.quotation; i++) {
    docs.push(
      baseDoc("quotation", i, windowDays, 0, {
        partyKey: customers[i % customers.length].key,
        items: lineItems(items, i, 1 + (i % 3)),
        source: null,
      }),
    );
  }

  for (let i = 0; i < counts.sales_order; i++) {
    // 0..14 from quotation; 15..24 from nothing (leaves Q 15..24 unconverted)
    const fromQuote = i < 15;
    docs.push(
      baseDoc("sales_order", i, windowDays, 1, {
        partyKey: customers[i % customers.length].key,
        items: lineItems(items, i, 1 + (i % 3)),
        source: fromQuote ? { kind: "quotation", index: i } : null,
      }),
    );
  }

  for (let i = 0; i < counts.sales_invoice; i++) {
    // 0..11 from SO; 12..24 from nothing (leaves SO 12..24 uninvoiced)
    const fromSo = i < 12;
    const partyKey = customers[i % customers.length].key;
    docs.push(
      baseDoc("sales_invoice", i, windowDays, 2, {
        partyKey,
        items: lineItems(items, i, 1 + (i % 3)),
        source: fromSo ? { kind: "sales_order", index: i } : null,
        updateStock: false,
        salesTax: !!customerByKey[partyKey]?.taxable,
      }),
    );
  }

  for (let i = 0; i < counts.purchase_order; i++) {
    const soLink = i % 4 === 0 ? { kind: "sales_order", index: i % 15 } : null;
    docs.push(
      baseDoc("purchase_order", i, windowDays, 0, {
        partyKey: suppliers[i % partyCounts.suppliers].key,
        items: lineItems(items, i, 1 + (i % 3), { salesOrderRef: soLink }),
        source: null,
        salesOrderLink: soLink,
      }),
    );
  }

  for (let i = 0; i < counts.purchase_receipt; i++) {
    const fromPo = i < 12;
    docs.push(
      baseDoc("purchase_receipt", i, windowDays, 1, {
        partyKey: suppliers[i % partyCounts.suppliers].key,
        items: lineItems(items, i, 1 + (i % 3)),
        source: fromPo ? { kind: "purchase_order", index: i } : null,
      }),
    );
  }

  for (let i = 0; i < counts.purchase_invoice; i++) {
    let source = null;
    let chainIndex = i;
    if (i < 8) {
      source = { kind: "purchase_receipt", index: i };
      chainIndex = i;
    } else if (i < 16) {
      const poIndex = 12 + (i - 8);
      source = { kind: "purchase_order", index: poIndex };
      chainIndex = poIndex;
    }
    const partyKey = suppliers[i % partyCounts.suppliers].key;
    const vendorSlot = (suppliers.findIndex((s) => s.key === partyKey) % partyCounts.suppliers) + 1;
    docs.push(
      baseDoc(
        "purchase_invoice",
        i,
        windowDays,
        2,
        {
          partyKey,
          items: lineItems(items, i, 1 + (i % 3)),
          source,
          // Vendor-scoped refs — avoids OI-054 false positives when re-typing a generic SMP-BILL-NN.
          billNo: `SMP-V${pad2(vendorSlot)}-INV-${pad2(i + 1)}`,
          updateStock: false,
          taxWithholding: !!supplierByKey[partyKey]?.taxWithholding,
        },
        chainIndex,
      ),
    );
  }

  // OI-131: one submitted PO in prior calendar year (idle vs trailing FY). postingDate set in emit-plan.
  docs.push({
    ...baseDoc("purchase_order", 800, windowDays, 0, {
      partyKey: "SUP-IDLE",
      items: lineItems(items, 80, 1),
      source: null,
    }),
    key: "PO-IDLE",
    dayOffset: windowDays + 400,
    outsideWindow: true,
    activity: "idle",
  });

  // Drafts: create-from-nothing only (no link-graph dependency); distinct parties.
  // No salesTax / taxWithholding on drafts (Find/Drafts dogfood stays simple).
  appendDraftDocs(docs, {
    draftsPerKind,
    windowDays,
    suppliers,
    customers,
    items,
  });

  appendApDogfoodFixtures(docs, { windowDays, suppliers, items, supplierByKey });
  appendPaymentBatchFixture(docs, { windowDays, items });

  return {
    tag,
    windowDays,
    counts,
    draftsPerKind,
    modesOfPayment: SAMPLE_MODES_OF_PAYMENT,
    paymentTerms: SAMPLE_PAYMENT_TERMS,
    parties: { suppliers, customers, items, projects },
    tax: {
      tdsCategory: SAMPLE_TDS_CATEGORY,
      taxableCustomers: customers.filter((c) => c.taxable).length,
      withholdingSuppliers: suppliers.filter((s) => s.taxWithholding).length,
    },
    docs,
    apFixtures: summarizeApFixtures(docs),
    summary: summarizePlan(docs),
  };
}

/** Extra submitted sandbox rows beyond DEFAULT_COUNTS (T0 AP fixtures + OI-161 Packet G). */
export const AP_FIXTURE_EXTRA_COUNTS = Object.freeze({
  purchase_order: 3,
  purchase_receipt: 2,
  // PI-DAILY + PI-DAILY-LG (Packet G) + PI-OVERLAP-A/B/C (overlapping schedules, 2026-09-08).
  purchase_invoice: 5,
});

/** OI-161: the payment-schedule fixtures — Packet G's two scales plus the overlapping trio. */
export const PAYMENT_BATCH_FIXTURE_KEYS = Object.freeze([
  "PI-DAILY",
  "PI-DAILY-LG",
  "PI-OVERLAP-A",
  "PI-OVERLAP-B",
  "PI-OVERLAP-C",
]);

/** Keys for T0 dogfood — ERP sandbox rows clerks pull in source modal / Find. */
export const AP_DOGFOOD_FIXTURE_KEYS = Object.freeze([
  "PO-MN",
  "PR-MN",
  "PO-PP",
  "PR-PP",
  "PO-LB",
]);

/**
 * OI-103 / OI-149 / OI-153 / OI-102 / OI-154 sandbox fixtures (indices ≥900).
 * @param {object[]} docs
 * @param {{ windowDays: number, suppliers: object[], items: object[], supplierByKey: object }} ctx
 */
function appendApDogfoodFixtures(docs, ctx) {
  const { windowDays, items } = ctx;
  const mnLines = lineItems(items, 90, 2);
  mnLines[0].qty = 10;
  mnLines[1].qty = 10;

  // OI-149 + OI-102: same vendor PO + partial IR, neither billed — source modal PO+PR dogfood.
  docs.push({
    ...baseDoc("purchase_order", 900, windowDays, 0, {
      partyKey: "SUP-00",
      items: mnLines,
      source: null,
      logbookPoNo: "JE-88421",
      dogfoodScenario: "oi149-po-pr",
    }),
    key: "PO-MN",
    dayOffset: 18,
  });
  docs.push({
    ...baseDoc("purchase_receipt", 900, windowDays, 1, {
      partyKey: "SUP-00",
      items: mnLines,
      source: { kind: "purchase_order", key: "PO-MN" },
      partialReceive: [{ lineIndex: 1, qty: 4 }],
      dogfoodScenario: "oi149-po-pr",
    }),
    key: "PR-MN",
    dayOffset: 12,
  });

  // OI-153: vendor prepayment — PO, advance PE (seed), then IR; Bill left open for clerk.
  const ppLines = lineItems(items, 91, 2);
  ppLines[0].qty = 6;
  ppLines[1].qty = 3;
  docs.push({
    ...baseDoc("purchase_order", 901, windowDays, 0, {
      partyKey: "SUP-01",
      items: ppLines,
      source: null,
      logbookPoNo: "PP-2200",
      advancePayment: { amount: 120, manual: true },
      dogfoodScenario: "oi153-prepay",
    }),
    key: "PO-PP",
    dayOffset: 22,
  });
  docs.push({
    ...baseDoc("purchase_receipt", 901, windowDays, 1, {
      partyKey: "SUP-01",
      items: ppLines,
      source: { kind: "purchase_order", key: "PO-PP" },
      dogfoodScenario: "oi153-prepay",
    }),
    key: "PR-PP",
    dayOffset: 10,
  });

  // OI-154 / OI-121: Find PO by logbook title, not ERP name.
  docs.push({
    ...baseDoc("purchase_order", 902, windowDays, 0, {
      partyKey: "SUP-02",
      items: lineItems(items, 92, 1),
      source: null,
      logbookPoNo: "TO-5599",
      dogfoodScenario: "oi154-logbook-po",
    }),
    key: "PO-LB",
    dayOffset: 25,
  });
}

/**
 * OI-161 Packet G (sample-data gate): "a vendor with a bill with 1 payment due every day for
 * 3 months" — one Purchase Invoice per dollar scale, each carrying 90 explicit `payment_schedule`
 * rows (one per calendar day) instead of the flat 30-day due date every other seeded Bill gets.
 * Two scales (small $50/day, large $2,500/day) so Packet 2's economics helper is dogfoodable at
 * both — small should batch under default prefs, large should not (float cost swamps a flat fee).
 *
 * `dayOffset` on each schedule row is relative (days before/after the corpus's `asOf`, resolved by
 * `emit-plan.js` the same way doc-level `dayOffset` is) — this function stays asOf-agnostic and pure.
 *
 * @param {object[]} docs
 * @param {{ windowDays: number, items: object[] }} ctx
 */
function appendPaymentBatchFixture(docs, ctx) {
  const { windowDays, items } = ctx;
  const dailyItem = items[0];
  const scheduleLength = 90;
  // Posting 45 days before asOf spreads the 90 daily due dates from ~44 days overdue to ~45 days
  // out — both ageing buckets exercised, not just future-due.
  const postingDayOffset = 45;

  const scales = [
    { partyKey: "SUP-DAILY", rate: 50.0, index: 903, key: "PI-DAILY", scenario: "oi161-daily-payrun-small" },
    { partyKey: "SUP-DAILY-LG", rate: 2500.0, index: 904, key: "PI-DAILY-LG", scenario: "oi161-daily-payrun-large" },
  ];

  for (const scale of scales) {
    // Row i (0-indexed) is due `posting + (i+1)` days → dayOffset = postingDayOffset - (i+1).
    // Ascending array order = ascending due date, so the last row is the latest (header due_date
    // "last row wins" convention, same as bill-payment-schedule.js::headerDueDateFromPaymentSchedule).
    const paymentSchedule = Array.from({ length: scheduleLength }, (_, i) => ({
      dayOffset: postingDayOffset - (i + 1),
      amount: scale.rate,
    }));
    docs.push({
      ...baseDoc("purchase_invoice", scale.index, windowDays, 2, {
        partyKey: scale.partyKey,
        items: [{ itemKey: dailyItem.key, qty: scheduleLength, rate: scale.rate, salesOrderRef: null }],
        source: null,
        billNo: `SMP-${scale.partyKey}-INV-01`,
        updateStock: false,
        taxWithholding: false,
        paymentSchedule,
        dogfoodScenario: scale.scenario,
      }),
      key: scale.key,
      dayOffset: postingDayOffset,
    });
  }

  appendOverlappingScheduleFixture(docs, ctx);
}

/**
 * OI-161 dogfood (5zorro 2026-09-08): *"1 vendor has 3 bills that each have 3 payments scheduled
 * and that the payment schedules overlap/group."*
 *
 * The `SUP-DAILY` pair above is one invoice exploded into many installments — it proves the
 * explode path and the economics at two scales, but every installment in a suggested group comes
 * from the **same** bill, so the remittance stub is always one invoice repeated. This fixture is
 * the case that was missing: three separate invoices whose schedules interleave, so each suggested
 * group draws one installment from each bill and the stub finally shows three different invoice
 * names on one check.
 *
 * Staggered by 2 days and spaced 7 apart, against the default `groupWindowDays: 7`:
 *
 *   bill A   day  0     7     14
 *   bill B   day    2     9      16
 *   bill C   day      4     11     18
 *            \_____/ \_____/ \______/
 *             group1  group2   group3
 *
 * Each group spans 4 days (inside the window) and the gap to the next is 3 days (outside a group
 * once the earliest-due anchor moves), so this should read as three clean cross-bill batches
 * rather than one run-on group -- which is exactly the thing worth looking at on the dashboard.
 *
 * $120 an installment keeps every group in the range where a flat fee beats float, so the
 * suggestion is "batch" and not "pay alone" (the large-scale contrast is already SUP-DAILY-LG's job).
 *
 * @param {object[]} docs
 * @param {{ windowDays: number, items: object[] }} ctx
 */
function appendOverlappingScheduleFixture(docs, ctx) {
  const { windowDays, items } = ctx;
  const item = items[0];
  const rate = 120.0;
  const rowsPerBill = 3;
  const postingDayOffset = 20; // ~20 days before asOf, so the run spans overdue → future
  const bills = [
    { key: "PI-OVERLAP-A", index: 905, stagger: 0, billNo: "SMP-SUP-OVERLAP-INV-A" },
    { key: "PI-OVERLAP-B", index: 906, stagger: 2, billNo: "SMP-SUP-OVERLAP-INV-B" },
    { key: "PI-OVERLAP-C", index: 907, stagger: 4, billNo: "SMP-SUP-OVERLAP-INV-C" },
  ];

  for (const bill of bills) {
    // Row i is due `posting + stagger + 7i` days -> dayOffset = postingDayOffset - that.
    // Ascending array order = ascending due date (header due_date is "last row wins").
    const paymentSchedule = Array.from({ length: rowsPerBill }, (_, i) => ({
      // +1 so no installment falls on the posting date itself (SUP-DAILY uses the same offset).
      dayOffset: postingDayOffset - (1 + bill.stagger + i * 7),
      amount: rate,
    }));
    docs.push({
      ...baseDoc("purchase_invoice", bill.index, windowDays, 2, {
        partyKey: "SUP-OVERLAP",
        items: [{ itemKey: item.key, qty: rowsPerBill, rate, salesOrderRef: null }],
        source: null,
        billNo: bill.billNo,
        updateStock: false,
        taxWithholding: false,
        paymentSchedule,
        dogfoodScenario: "oi161-overlapping-schedules",
      }),
      key: bill.key,
      dayOffset: postingDayOffset,
    });
  }
}

/** @param {object[]} docs */
export function summarizeApFixtures(docs) {
  const roles = AP_DOGFOOD_FIXTURE_KEYS.map((key) => {
    const row = docs.find((d) => d.key === key);
    return row
      ? {
          key,
          kind: row.kind,
          dogfoodScenario: row.dogfoodScenario || null,
          logbookPoNo: row.logbookPoNo || null,
        }
      : null;
  }).filter(Boolean);
  return { keys: AP_DOGFOOD_FIXTURE_KEYS, rows: roles };
}

/**
 * @param {object[]} docs
 * @param {{
 *   draftsPerKind: number,
 *   windowDays: number,
 *   suppliers: { key: string }[],
 *   customers: { key: string }[],
 *   items: object[],
 * }} cfg
 */
function appendDraftDocs(docs, cfg) {
  const { draftsPerKind, windowDays, suppliers, customers, items } = cfg;
  const buyingRotate = suppliers.filter((s) => s.activity !== "idle" && s.activity !== "never");
  if (draftsPerKind < 1) return;

  const selling = ["quotation", "sales_order", "sales_invoice"];
  const buying = ["purchase_order", "purchase_receipt", "purchase_invoice"];

  for (const kind of selling) {
    for (let i = 0; i < draftsPerKind; i++) {
      docs.push(
        draftDoc(kind, i, windowDays, {
          partyKey: customers[i % customers.length].key,
          items: lineItems(items, 50 + i, 1 + (i % 2)),
          updateStock: false,
        }),
      );
    }
  }
  for (const kind of buying) {
    for (let i = 0; i < draftsPerKind; i++) {
      const extra = {
        partyKey: buyingRotate[i % buyingRotate.length].key,
        items: lineItems(items, 60 + i, 1 + (i % 2)),
        updateStock: false,
      };
      if (kind === "purchase_invoice") {
        const vendorSlot =
          (buyingRotate.findIndex((s) => s.key === extra.partyKey) % buyingRotate.length) + 1;
        extra.billNo = `SMP-V${pad2(vendorSlot)}-DRAFT-${pad2(i + 1)}`;
      }
      docs.push(draftDoc(kind, i, windowDays, extra));
    }
  }
}

/**
 * Unsubmitted sample row. Keys use `-D-` so they never collide with submitted `PI-00`… keys.
 * @param {string} kind
 * @param {number} draftIndex
 * @param {number} windowDays
 * @param {object} extra
 */
function draftDoc(kind, draftIndex, windowDays, extra) {
  const stage =
    kind === "sales_invoice" || kind === "purchase_invoice"
      ? 2
      : kind === "sales_order" || kind === "purchase_receipt"
        ? 1
        : 0;
  const dayOffset = chainDayOffset(80 + draftIndex, stage, windowDays);
  return {
    kind,
    index: 900 + draftIndex,
    key: `${kindAbbrev(kind)}-D-${pad2(draftIndex)}`,
    dayOffset,
    asDraft: true,
    source: null,
    ...extra,
  };
}

/**
 * @param {string} kind
 * @param {number} index
 * @param {number} windowDays
 * @param {number} stage 0=earliest in chain, higher=later (newer calendar date)
 * @param {object} extra
 * @param {number} [chainIndex] index used for date spacing (defaults to index; use source index when linking across ids)
 */
function baseDoc(kind, index, windowDays, stage, extra, chainIndex = index) {
  const dayOffset =
    extra && extra.dayOffset != null ? extra.dayOffset : chainDayOffset(chainIndex, stage, windowDays);
  return {
    kind,
    index,
    key: `${kindAbbrev(kind)}-${pad2(index)}`,
    dayOffset,
    ...extra,
  };
}

/**
 * Keep linked chains chronological: larger dayOffset = older date.
 * stage 0 (source) is oldest; stage 2 is newest. Avoids % wrap inversions
 * by reserving the last few days of the window as headroom.
 */
function chainDayOffset(index, stage, windowDays) {
  const headroom = 4;
  const span = Math.max(1, windowDays - headroom);
  const base = (index * 7) % span;
  return base + (2 - stage);
}

function kindAbbrev(kind) {
  switch (kind) {
    case "quotation":
      return "Q";
    case "sales_order":
      return "SO";
    case "sales_invoice":
      return "SI";
    case "purchase_order":
      return "PO";
    case "purchase_receipt":
      return "PR";
    case "purchase_invoice":
      return "PI";
    default:
      return "X";
  }
}

/**
 * @param {object[]} items
 * @param {number} docIndex
 * @param {number} lineCount
 * @param {{ salesOrderRef?: { kind: string, index: number } | null }} [opts]
 */
function lineItems(items, docIndex, lineCount, opts = {}) {
  const lines = [];
  for (let L = 0; L < lineCount; L++) {
    const item = items[(docIndex + L) % items.length];
    lines.push({
      itemKey: item.key,
      qty: 1 + ((docIndex + L) % 4),
      rate: item.rate,
      salesOrderRef: opts.salesOrderRef || null,
    });
  }
  return lines;
}

/** @param {object[]} docs */
export function summarizePlan(docs) {
  const byKind = {};
  const bySource = {};
  let drafts = 0;
  for (const d of docs) {
    byKind[d.kind] = (byKind[d.kind] || 0) + 1;
    const src = d.source ? d.source.kind : "none";
    const bucket = `${d.kind}←${src}`;
    bySource[bucket] = (bySource[bucket] || 0) + 1;
    if (d.asDraft) drafts += 1;
  }
  return { byKind, bySource, drafts };
}

/**
 * Calendar date string (YYYY-MM-DD) for a dayOffset counting back from asOf.
 * dayOffset 0 = asOf; dayOffset 59 = 59 days before asOf.
 * @param {string|Date} asOf
 * @param {number} dayOffset
 */
export function dateForOffset(asOf, dayOffset) {
  const base = asOf instanceof Date ? new Date(asOf) : parseYmd(asOf);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Invalid asOf date: ${asOf}`);
  }
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - dayOffset);
  return formatYmd(d);
}

/**
 * OI-131 idle vendor PO: prior calendar year (needs FY N−1 on site — seed_corpus ensures it).
 * Must fall before current FY start so vendor-activity classifies as idle, but inside an open FY.
 * @param {string|Date} asOf
 * @returns {string}
 */
export function idleVendorPoPostingDate(asOf) {
  const base = asOf instanceof Date ? new Date(asOf) : parseYmd(asOf);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Invalid asOf date: ${asOf}`);
  }
  const y = base.getUTCFullYear() - 1;
  return formatYmd(new Date(Date.UTC(y, 10, 15))); // Nov 15 prior year
}

/**
 * @param {string|Date} asOf
 * @param {{ key?: string, dayOffset?: number, postingDate?: string }} doc
 * @returns {string}
 */
export function postingDateForDoc(asOf, doc) {
  if (doc && doc.postingDate) return String(doc.postingDate);
  if (doc && doc.key === "PO-IDLE") return idleVendorPoPostingDate(asOf);
  return dateForOffset(asOf, doc && doc.dayOffset != null ? doc.dayOffset : 0);
}

/** @param {string} ymd */
function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** @param {Date} d */
function formatYmd(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}
