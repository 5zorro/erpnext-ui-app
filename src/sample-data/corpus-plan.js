import { buildResellingCorpus } from "./reselling-corpus.js";

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

/**
 * Bump when corpus shape or bill_no series changes — `--reset` deletes docs carrying **this** tag.
 *
 * 🔴 Deliberately **not** bumped for the 2026-09-26 reselling expansion. A bump makes the seeder
 * recreate everything, but it also orphans the previous tag's rows, since `_reset_tagged` only
 * sweeps the current one. The v5 fixtures are still valid members of this corpus, so holding the tag
 * lets a re-run skip them as already-present and create only what is new.
 */
export const SAMPLE_TAG = "ui-app-sample-v5";

/** Tax Withholding Category name created by seed_corpus (SSoT for plan + applicator). */
export const SAMPLE_TDS_CATEGORY = "SAMPLE-TDS";

/**
 * The traced chain ("bowtie"): one customer order walked all the way through both sides of the
 * business, so a link-trail view has something real to draw. Nine documents, one SKU, dates
 * marching forward:
 *
 *   Quotation → Sales Order ─┬→ Purchase Order → Item Receipt → Bill → Payment (Pay)
 *                            └→ Delivery Note → Invoice → Payment (Receive)
 *
 * The hinge is `Purchase Order Item.sales_order` — the only field in stock ERPNext that says
 * *this purchase exists because of that customer order*. Everything else in the corpus links
 * along one side only; this fixture is the sole row that crosses.
 */
export const BOWTIE_QTY = 4;
/** What we pay the vendor, per unit. */
export const BOWTIE_COST = 125.0;
/**
 * What we quote the customer, per unit. The 1.2 is **sample data, not a rule** — markup belongs to
 * the CRM and to the salesman talking to the customer (OI-179 / OI-177), and nothing in the shell
 * reads this number or derives a price from it. It is here only so the chain has a visible margin
 * (4 × 150 − 4 × 125 = 100) for a trail view to total up.
 */
export const BOWTIE_SELL = 150.0;

export const TRACED_CHAIN_KEYS = Object.freeze([
  "BT-Q",
  "BT-SO",
  "BT-PO",
  "BT-PR",
  "BT-PI",
  "BT-PE-PAY",
  "BT-DN",
  "BT-SI",
  "BT-PE-RCV",
]);

/**
 * OI-177 costing fixture — the same three movements against three SKUs that differ only in
 * `valuation_method`, which is the only way to see the methods disagree (the field is per Item,
 * so one SKU can never show two answers).
 *
 * Buy 2 @ 50, buy 1 @ 75, sell 2. All three leave **one unit** on hand; only its value differs.
 */
export const COSTING_LAYER_MOVES = Object.freeze([
  { step: "buy", qty: 2, rate: 50.0 },
  { step: "buy", qty: 1, rate: 75.0 },
  { step: "sell", qty: 2 },
]);

/**
 * Expected outcome per method — the oracle a costing panel is checked against, kept here so the
 * fixture states its own pass condition rather than leaving it to be re-derived.
 *
 * `layers` is what ERPNext writes to `Stock Ledger Entry.stock_queue` (`[[qty, rate], ...]`) after
 * the sale. 🔴 Moving Average writes **nothing** there — it keeps a single running rate
 * (`stock_ledger.py` `get_moving_average_values`), so a layer panel has nothing to itemize for it,
 * and saying so *is* the finding rather than a hole in the panel.
 */
export const COSTING_LAYER_METHODS = Object.freeze([
  { key: "ITM-COST-FIFO", suffix: "FIFO", valuationMethod: "FIFO", onHandValue: 75.0, layers: [[1, 75.0]] },
  { key: "ITM-COST-LIFO", suffix: "LIFO", valuationMethod: "LIFO", onHandValue: 50.0, layers: [[1, 50.0]] },
  {
    key: "ITM-COST-AVG",
    suffix: "AVG",
    valuationMethod: "Moving Average",
    onHandValue: 58.33,
    layers: null,
  },
]);

export const COSTING_FIXTURE_KEYS = Object.freeze(
  COSTING_LAYER_METHODS.flatMap((m) => [
    `PR-COST-${m.suffix}-1`,
    `PR-COST-${m.suffix}-2`,
    `DN-COST-${m.suffix}`,
  ]),
);

/**
 * Money-in stress fixtures — the Receive Payment side's answer to the AP batching fixtures.
 * Three shapes the allocation UI has to survive:
 *   installments (many schedule rows on one invoice) · one payment split across three invoices ·
 *   an overpayment that leaves an unallocated credit.
 *
 * 🔴 The overpayment is not a curiosity. An unallocated payment comes back from the AP report with
 * a negative outstanding and no due date, and that row silently emptied the whole Pay Outstanding
 * board (gotchas G13). The receive side has the same shape and deserves a fixture that produces it
 * on purpose.
 */
export const AR_PAYMENT_FIXTURE_KEYS = Object.freeze([
  "SI-INST",
  "SI-SPLIT-A",
  "SI-SPLIT-B",
  "SI-SPLIT-C",
  "PE-SPLIT",
  "SI-OVER",
  "PE-OVER",
]);

/** Installment fixture shape: 12 rows, one a month, summing to the invoice total. */
export const AR_INSTALLMENT_ROWS = 12;
export const AR_INSTALLMENT_AMOUNT = 250.0;

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100;
}

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
 * @param {boolean} [opts.reselling] include the 25×25 year-long reselling population (default true)
 * @param {number} [opts.resellingMonths] shorten the reselling year — the knob for a faster seed
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
    // The traced chain's vendor. Deliberately outside the rotation and deliberately **not** a
    // withholding vendor: the chain exists to show one clean amount travelling from quote to
    // cheque, and a TDS deduction would make the payment disagree with the bill for a reason that
    // has nothing to do with the trail. A cheque term, because the chain "cuts a check".
    {
      key: "SUP-BOWTIE",
      name: "SAMPLE Vendor Bowtie Trace",
      taxWithholding: false,
      paymentTermsKey: "PT-NET30-POST-STRICT",
    },
  );
  // Chain + money-in stress customers. All four are sales-tax **exempt** on purpose: these
  // fixtures are about link trails and allocation arithmetic, and a pass-through tax would make
  // every total in them a number you have to back out before you can check the interesting part.
  // The taxable rotation above already covers sales tax (OI-115).
  customers.push(
    { key: "CUS-BOWTIE", name: "SAMPLE Customer Bowtie Trace", taxable: false },
    { key: "CUS-INST", name: "SAMPLE Customer Installments", taxable: false },
    { key: "CUS-SPLIT", name: "SAMPLE Customer Split Payment", taxable: false },
    { key: "CUS-OVER", name: "SAMPLE Customer Overpayment", taxable: false },
  );
  const items = Array.from({ length: partyCounts.items }, (_, i) => ({
    key: `ITM-${pad2(i)}`,
    code: `SAMPLE-SKU-${pad2(i + 1)}`,
    name: `SAMPLE Item ${pad2(i + 1)}`,
    rate: 10 + (i % 7) * 5.5,
  }));
  // 🔴 These four carry `openingQty: 0`. Every generic SAMPLE SKU is seeded with 500 units so that
  // receipts and invoices always value, but 500 units of prior stock bury the two receipts a
  // costing panel is supposed to point at — and make the traced chain's "we shipped what we bought"
  // unprovable. A zero opening balance is what makes their Stock Ledger short enough to read.
  items.push({
    key: "ITM-BOWTIE",
    code: "SAMPLE-SKU-BOWTIE",
    name: "SAMPLE Item Bowtie Trace",
    cost: BOWTIE_COST,
    rate: BOWTIE_SELL,
    openingQty: 0,
  });
  for (const method of COSTING_LAYER_METHODS) {
    items.push({
      key: method.key,
      code: `SAMPLE-SKU-COST-${method.suffix}`,
      name: `SAMPLE Item Costing ${method.suffix}`,
      // The buy rates live on the movements, not the master — the whole point is two different
      // incoming rates for one SKU. This is only the fallback ERPNext values an unrated row at.
      rate: COSTING_LAYER_MOVES[0].rate,
      valuationMethod: method.valuationMethod,
      openingQty: 0,
      expect: { onHandValue: method.onHandValue, layers: method.layers },
    });
  }
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
  appendTracedChainFixture(docs, { windowDays });
  appendCostingLayerFixture(docs, { windowDays });
  appendArPaymentFixtures(docs, { windowDays, items });

  // A year of reselling across 25 vendors and 25 customers, with its own parties, its own SKUs and
  // its own 360-day window. Kept as a separate population so the 60-day rotation above — which the
  // tax mix, the batching fixtures and the Find dogfood are all calibrated against — does not move.
  const reselling =
    opts.reselling === false
      ? null
      : buildResellingCorpus(
          Number.isFinite(opts.resellingMonths) ? { months: opts.resellingMonths } : {},
        );
  if (reselling) {
    suppliers.push(...reselling.vendors);
    customers.push(...reselling.customers);
    items.push(...reselling.items);
    docs.push(...reselling.docs);
  }

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
    reselling: reselling
      ? {
          months: reselling.months,
          windowDays: reselling.windowDays,
          settleDays: reselling.settleDays,
          ...reselling.summary,
        }
      : null,
    summary: summarizePlan(docs),
  };
}

/**
 * Extra submitted rows beyond DEFAULT_COUNTS contributed by the 2026-09-26 fixtures: the traced
 * chain, the OI-177 costing SKUs, and the money-in stress set. Kept as a declared table rather
 * than a magic number in the tests, so adding a fixture forces the count to be stated.
 */
export const CHAIN_FIXTURE_EXTRA_COUNTS = Object.freeze({
  quotation: 1, // BT-Q
  sales_order: 1, // BT-SO
  purchase_order: 1, // BT-PO
  purchase_receipt: 7, // BT-PR + 2 costing receipts x 3 methods
  purchase_invoice: 1, // BT-PI
  delivery_note: 4, // BT-DN + 1 costing note x 3 methods
  sales_invoice: 6, // BT-SI + SI-INST + SI-SPLIT-A/B/C + SI-OVER
  payment_entry: 4, // BT-PE-PAY / BT-PE-RCV + PE-SPLIT + PE-OVER
});

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
 * Staggered by 2 days and spaced 7 apart:
 *
 *   bill A   day  0     7     14
 *   bill B   day    2     9      16
 *   bill C   day      4     11     18
 *
 * Designed 2026-09-08 against a 7-day group window, which cut this into three clean A-B-C groups.
 * That window was retired 2026-09-12 for an exact cheapest grouping, so the cut now falls wherever
 * fees against float say: at ACH's $0.40 it is still usually three groups of three, but the bank
 * calendar can move it (a Columbus Day installment walks back onto the previous Friday and changes
 * which group it joins), and at the cheque fee two larger groups win. What survives either way is the
 * fixture's point — every group draws installments from more than one invoice.
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

/**
 * The traced chain — one customer order walked through both sides, nine documents deep.
 *
 * Dates march strictly forward (larger `dayOffset` = older), and two of them are deliberate:
 *   - the Item Receipt (40) precedes the Delivery Note (26), so the stock that ships is the stock
 *     that arrived and the costing panel has a real layer to point at;
 *   - the Delivery Note and the Invoice share a posting date (26), because 5zorro's process is
 *     "create an invoice at the same time as I ship". Two documents rather than one
 *     `update_stock` invoice, so the stock movement stays separable from the billing (OI-177).
 *
 * @param {object[]} docs
 * @param {{ windowDays: number }} ctx
 */
function appendTracedChainFixture(docs, ctx) {
  const { windowDays } = ctx;
  const buyLine = { itemKey: "ITM-BOWTIE", qty: BOWTIE_QTY, rate: BOWTIE_COST, salesOrderRef: null };
  const sellLine = { itemKey: "ITM-BOWTIE", qty: BOWTIE_QTY, rate: BOWTIE_SELL, salesOrderRef: null };
  const scenario = "bowtie-traced-chain";
  /** @param {object} extra */
  const chainDoc = (kind, key, dayOffset, extra) => ({
    ...baseDoc(kind, 920, windowDays, 0, {
      ...extra,
      dayOffset,
      dogfoodScenario: scenario,
    }),
    key,
  });

  docs.push(
    chainDoc("quotation", "BT-Q", 56, {
      partyKey: "CUS-BOWTIE",
      items: [{ ...sellLine }],
      source: null,
    }),
    chainDoc("sales_order", "BT-SO", 52, {
      partyKey: "CUS-BOWTIE",
      items: [{ ...sellLine }],
      source: { kind: "quotation", key: "BT-Q" },
    }),
    // The hinge. `salesOrderLink` puts the Sales Order on the PO's lines
    // (`Purchase Order Item.sales_order`) — bought *for* that order, not merely on the same day.
    chainDoc("purchase_order", "BT-PO", 48, {
      partyKey: "SUP-BOWTIE",
      items: [{ ...buyLine, salesOrderRef: { kind: "sales_order", key: "BT-SO" } }],
      source: null,
      salesOrderLink: { kind: "sales_order", key: "BT-SO" },
      logbookPoNo: "BT-1001",
    }),
    chainDoc("purchase_receipt", "BT-PR", 40, {
      partyKey: "SUP-BOWTIE",
      items: [{ ...buyLine }],
      source: { kind: "purchase_order", key: "BT-PO" },
    }),
    chainDoc("purchase_invoice", "BT-PI", 38, {
      partyKey: "SUP-BOWTIE",
      items: [{ ...buyLine }],
      source: { kind: "purchase_receipt", key: "BT-PR" },
      billNo: "SMP-BOWTIE-INV-01",
      updateStock: false,
      taxWithholding: false,
    }),
    chainDoc("payment_entry", "BT-PE-PAY", 30, {
      direction: "Pay",
      partyKey: "SUP-BOWTIE",
      modeOfPayment: "USPS_Check",
      // No amount: settle whatever the bill actually owes. Stating a number here would make the
      // fixture disagree with the bill the first time a tax or rounding rule changes.
      allocations: [{ key: "BT-PI" }],
      source: null,
    }),
    chainDoc("delivery_note", "BT-DN", 26, {
      partyKey: "CUS-BOWTIE",
      items: [{ ...sellLine }],
      source: { kind: "sales_order", key: "BT-SO" },
    }),
    chainDoc("sales_invoice", "BT-SI", 26, {
      partyKey: "CUS-BOWTIE",
      items: [{ ...sellLine }],
      source: { kind: "delivery_note", key: "BT-DN" },
      updateStock: false,
      salesTax: false,
    }),
    chainDoc("payment_entry", "BT-PE-RCV", 12, {
      direction: "Receive",
      partyKey: "CUS-BOWTIE",
      modeOfPayment: "ACH",
      allocations: [{ key: "BT-SI" }],
      source: null,
    }),
  );
}

/** Selling rate on the costing SKUs — above both buy rates, so no below-cost noise (OI-179). */
export const COSTING_SELL = 90.0;

/**
 * OI-177 — buy 2 @ 50, buy 1 @ 75, sell 2, against three SKUs that differ only in
 * `valuation_method`. Two Item Receipts and one Delivery Note each, from nothing.
 *
 * Real stock documents rather than bare Stock Entries, because the panel this feeds is reached
 * *from a document* — a clerk looking at one shipment asking what it cost. The buy rates ride on
 * the receipt lines, which is the only way one SKU ends up with two different incoming rates.
 *
 * @param {object[]} docs
 * @param {{ windowDays: number }} ctx
 */
function appendCostingLayerFixture(docs, ctx) {
  const { windowDays } = ctx;
  const [buy1, buy2, sell] = COSTING_LAYER_MOVES;
  // Strictly decreasing: both receipts land before the shipment draws on them.
  const offsets = { buy1: 44, buy2: 38, sell: 30 };

  COSTING_LAYER_METHODS.forEach((method, i) => {
    const scenario = `oi177-cost-layers-${method.suffix.toLowerCase()}`;
    const line = (qty, rate) => [{ itemKey: method.key, qty, rate, salesOrderRef: null }];
    docs.push(
      {
        ...baseDoc("purchase_receipt", 930 + i * 2, windowDays, 0, {
          partyKey: "SUP-BOWTIE",
          items: line(buy1.qty, buy1.rate),
          source: null,
          dogfoodScenario: scenario,
          dayOffset: offsets.buy1,
        }),
        key: `PR-COST-${method.suffix}-1`,
      },
      {
        ...baseDoc("purchase_receipt", 931 + i * 2, windowDays, 0, {
          partyKey: "SUP-BOWTIE",
          items: line(buy2.qty, buy2.rate),
          source: null,
          dogfoodScenario: scenario,
          dayOffset: offsets.buy2,
        }),
        key: `PR-COST-${method.suffix}-2`,
      },
      {
        ...baseDoc("delivery_note", 930 + i, windowDays, 0, {
          partyKey: "CUS-BOWTIE",
          items: line(sell.qty, COSTING_SELL),
          source: null,
          dogfoodScenario: scenario,
          dayOffset: offsets.sell,
        }),
        key: `DN-COST-${method.suffix}`,
      },
    );
  });
}

/**
 * Money-in stress fixtures (5zorro 2026-09-26: *"perhaps have a few stress tests on the payment
 * receipt side?"*). Three shapes, each the AR twin of something that already bit us on the AP side:
 *
 *   `SI-INST`        one invoice, 12 monthly installments — the explode path, Receive side
 *   `SI-SPLIT-A/B/C` one payment allocated across three invoices, two of them partly
 *   `SI-OVER`        a payment larger than the invoice, leaving an unallocated credit
 *
 * 🔴 `SI-OVER` is the one to keep. Its leftover credit is the same shape as the row that emptied
 * the Pay Outstanding board (gotchas G13) — negative outstanding, no due date — so the receive side
 * now has that row on purpose instead of meeting it for the first time in front of a clerk.
 *
 * @param {object[]} docs
 * @param {{ windowDays: number, items: object[] }} ctx
 */
function appendArPaymentFixtures(docs, ctx) {
  const { windowDays, items } = ctx;
  const item = items[0];
  const scenario = "ar-receive-stress";

  // Installments: posting 40 days back, one row a month, so the run spans overdue → future.
  const instPosting = 40;
  const instSchedule = Array.from({ length: AR_INSTALLMENT_ROWS }, (_, i) => ({
    dayOffset: instPosting - (i + 1) * 30,
    amount: AR_INSTALLMENT_AMOUNT,
  }));
  docs.push({
    ...baseDoc("sales_invoice", 940, windowDays, 2, {
      partyKey: "CUS-INST",
      items: [
        {
          itemKey: item.key,
          qty: AR_INSTALLMENT_ROWS,
          rate: AR_INSTALLMENT_AMOUNT,
          salesOrderRef: null,
        },
      ],
      source: null,
      updateStock: false,
      salesTax: false,
      paymentSchedule: instSchedule,
      dogfoodScenario: scenario,
      dayOffset: instPosting,
    }),
    key: "SI-INST",
  });

  // Split: three invoices, one payment. 400 + 700 + 900 = 2000 owed, 1000 paid.
  const splits = [
    { key: "SI-SPLIT-A", index: 941, amount: 400.0, allocate: 400.0 },
    { key: "SI-SPLIT-B", index: 942, amount: 700.0, allocate: 300.0 },
    { key: "SI-SPLIT-C", index: 943, amount: 900.0, allocate: 300.0 },
  ];
  for (const sp of splits) {
    docs.push({
      ...baseDoc("sales_invoice", sp.index, windowDays, 2, {
        partyKey: "CUS-SPLIT",
        items: [{ itemKey: item.key, qty: 1, rate: sp.amount, salesOrderRef: null }],
        source: null,
        updateStock: false,
        salesTax: false,
        dogfoodScenario: scenario,
        dayOffset: 34,
      }),
      key: sp.key,
    });
  }
  docs.push({
    kind: "payment_entry",
    index: 941,
    key: "PE-SPLIT",
    dayOffset: 20,
    direction: "Receive",
    partyKey: "CUS-SPLIT",
    modeOfPayment: "ACH",
    // A fully settles; B and C are left part-paid, which is what makes the board interesting.
    amount: 1000.0,
    allocations: splits.map((sp) => ({ key: sp.key, amount: sp.allocate })),
    source: null,
    dogfoodScenario: scenario,
  });

  // Overpayment: 500 owed, 800 arrives. 300 stays unallocated as a credit on the customer.
  docs.push({
    ...baseDoc("sales_invoice", 944, windowDays, 2, {
      partyKey: "CUS-OVER",
      items: [{ itemKey: item.key, qty: 1, rate: 500.0, salesOrderRef: null }],
      source: null,
      updateStock: false,
      salesTax: false,
      dogfoodScenario: scenario,
      dayOffset: 30,
    }),
    key: "SI-OVER",
  });
  docs.push({
    kind: "payment_entry",
    index: 942,
    key: "PE-OVER",
    dayOffset: 16,
    direction: "Receive",
    partyKey: "CUS-OVER",
    modeOfPayment: "DOM_WIRE",
    amount: 800.0,
    allocations: [{ key: "SI-OVER", amount: 500.0 }],
    unallocated: 300.0,
    source: null,
    dogfoodScenario: scenario,
  });
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
    case "delivery_note":
      return "DN";
    case "payment_entry":
      return "PE";
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
