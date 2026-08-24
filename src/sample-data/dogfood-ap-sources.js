/**
 * AP dogfood **source documents** (vendor paper) — pure SSoT.
 * These are what 5zorro types from — not ERP seed rows.
 * Scenarios align with museum OI-103 + common Bill/PO/IR entry.
 */

/** @typedef {"purchase_order"|"packing_list"|"vendor_invoice"} SourceKind */
/** @typedef {"classic"|"grid"|"plain"|"ack"} TemplateId */

/**
 * @typedef {{
 *   sku: string,
 *   description: string,
 *   qty: number,
 *   rate: number,
 *   uom?: string,
 * }} SourceLine
 */

/**
 * @typedef {{
 *   id: string,
 *   scenario: string,
 *   oi103?: number,
 *   kind: SourceKind,
 *   template: TemplateId,
 *   dogfoodHint: string,
 *   vendor: { legalName: string, dba?: string, accountNo?: string, address: string[] },
 *   shipFrom?: { name: string, address: string[] },
 *   shipTo?: { name: string, address: string[] },
 *   docNo: string,
 *   docDate: string,
 *   poNos?: string[],
 *   packingNo?: string,
 *   bolNo?: string,
 *   terms?: string,
 *   taxNote?: string,
 *   taxAmount?: number,
 *   notes?: string[],
 *   lines: SourceLine[],
 * }} DogfoodSourceDoc
 */

/** @type {DogfoodSourceDoc[]} */
export const DOGFOOD_AP_SOURCES = [
  {
    id: "DF-01",
    scenario: "Invoice includes tax that should be backed out when paying in full",
    oi103: 1,
    kind: "vendor_invoice",
    template: "classic",
    dogfoodHint:
      "OI-103.1 (Vanilla confirmed 2026-08-16): Enter Bill as printed (tax 38.06). Book so tax debits Duties and Taxes / Sales Tax Payable; merchandise paid in full. Supplier PO# on paper — field dig later. Then try Doc/Simplified same path.",
    vendor: {
      legalName: "ALPINE SUPPLY CO.",
      accountNo: "CUST-44192",
      address: ["1200 Ridge Rd", "Salt Lake City, UT 84101"],
    },
    docNo: "ASI-77821",
    docDate: "07/18/2026",
    poNos: ["PO-DOG-1001"],
    terms: "Net 30",
    taxNote: "UT sales tax 7.25% (vendor charged — your company may be exempt)",
    // 525.00 × 7.25% = 38.0625 → 38.06 (was 36.25 — inconsistent with rate label)
    taxAmount: 38.06,
    lines: [
      { sku: "WIDGET-A", description: "Widget A — blue", qty: 10, rate: 40 },
      { sku: "WIDGET-B", description: "Widget B — red", qty: 5, rate: 25 },
    ],
  },
  {
    id: "DF-02",
    scenario: "Invoice missing tax that should be added when paying in full",
    oi103: 2,
    kind: "vendor_invoice",
    template: "grid",
    dogfoodHint:
      "OI-103.2 (Vanilla confirmed 2026-08-16): Vendor forgot tax. Subtotal 169; add tax/charge (e.g. 7.5% → 12.68) so Sales Tax Payable increases. Vanilla tax cells do basic math (169*7.5%). Non-stock item OK. Then Doc/Simplified.",
    vendor: {
      legalName: "Summit Traders Ltd.",
      accountNo: "A-9081",
      address: ["88 Market St", "Ogden, UT 84401"],
    },
    docNo: "ST-5520",
    docDate: "07/22/2026",
    poNos: ["PO-DOG-1002"],
    terms: "Due on receipt",
    taxNote: "(none printed — taxable supply in your jurisdiction)",
    taxAmount: 0,
    notes: ["Taxable merchandise — no tax line on this invoice."],
    lines: [
      { sku: "SAMPLE-SKU-03", description: "Sample Item 03", qty: 3, rate: 21 },
      { sku: "SAMPLE-SKU-04", description: "Sample Item 04", qty: 4, rate: 26.5 },
    ],
  },
  {
    id: "DF-03a",
    scenario: "Multi-PO → one Bill — PO A (enter/receive first)",
    oi103: 3,
    kind: "purchase_order",
    template: "ack",
    dogfoodHint: "Create/submit PO matching this ack. Pair with DF-03b + DF-03c.",
    vendor: {
      legalName: "ALPINE SUPPLY CO.",
      address: ["1200 Ridge Rd", "Salt Lake City, UT 84101"],
    },
    shipTo: {
      name: "HECSANDBOX Receiving",
      address: ["1 Warehouse Way", "Provo, UT 84601"],
    },
    docNo: "PO-DOG-2001",
    docDate: "07/01/2026",
    terms: "Net 30",
    lines: [
      { sku: "SAMPLE-SKU-01", description: "Sample Item 01", qty: 2, rate: 10 },
      { sku: "SAMPLE-SKU-02", description: "Sample Item 02", qty: 2, rate: 15.5 },
    ],
  },
  {
    id: "DF-03b",
    scenario: "Multi-PO → one Bill — PO B",
    oi103: 3,
    kind: "purchase_order",
    template: "ack",
    dogfoodHint: "Second PO for the same vendor invoice DF-03c.",
    vendor: {
      legalName: "ALPINE SUPPLY CO.",
      address: ["1200 Ridge Rd", "Salt Lake City, UT 84101"],
    },
    shipTo: {
      name: "HECSANDBOX Receiving",
      address: ["1 Warehouse Way", "Provo, UT 84601"],
    },
    docNo: "PO-DOG-2002",
    docDate: "07/03/2026",
    terms: "Net 30",
    lines: [
      { sku: "SAMPLE-SKU-05", description: "Sample Item 05", qty: 1, rate: 30 },
      { sku: "SAMPLE-SKU-06", description: "Sample Item 06", qty: 2, rate: 37.5 },
    ],
  },
  {
    id: "DF-03c",
    scenario: "Multi-PO → one Bill — combined vendor invoice",
    oi103: 3,
    kind: "vendor_invoice",
    template: "classic",
    dogfoodHint:
      "OI-103.3 (Vanilla confirmed 2026-08-16): One Bill from both PO-DOG-2001 and PO-DOG-2002 — ERPNext handles 2+ POs on one PI. Paper/salesman logbook PO# (short JE/TO series) is a separate gap — OI-121.",
    vendor: {
      legalName: "ALPINE SUPPLY CO.",
      accountNo: "CUST-44192",
      address: ["1200 Ridge Rd", "Salt Lake City, UT 84101"],
    },
    docNo: "ASI-80110",
    docDate: "07/28/2026",
    poNos: ["PO-DOG-2001", "PO-DOG-2002"],
    terms: "Net 30",
    taxAmount: 0,
    lines: [
      { sku: "SAMPLE-SKU-01", description: "Sample Item 01", qty: 2, rate: 10 },
      { sku: "SAMPLE-SKU-02", description: "Sample Item 02", qty: 2, rate: 15.5 },
      { sku: "SAMPLE-SKU-05", description: "Sample Item 05", qty: 1, rate: 30 },
      { sku: "SAMPLE-SKU-06", description: "Sample Item 06", qty: 2, rate: 37.5 },
    ],
  },
  {
    id: "DF-04po",
    scenario: "Multi-Bill → one PO — shared PO",
    oi103: 4,
    kind: "purchase_order",
    template: "ack",
    dogfoodHint:
      "OI-103.4 (Vanilla confirmed 2026-08-16): One PO billed on multiple PIs. Re-dogfood on Doc skin.",
    vendor: {
      legalName: "MA Inc.",
      address: ["400 Industrial Blvd", "West Jordan, UT 84088"],
    },
    shipTo: {
      name: "HECSANDBOX Receiving",
      address: ["1 Warehouse Way", "Provo, UT 84601"],
    },
    docNo: "PO-DOG-3001",
    docDate: "06/15/2026",
    terms: "Net 45",
    lines: [
      { sku: "SAMPLE-SKU-07", description: "Sample Item 07", qty: 10, rate: 43 },
      { sku: "SAMPLE-SKU-08", description: "Sample Item 08", qty: 10, rate: 10 },
    ],
  },
  {
    id: "DF-04a",
    scenario: "Multi-Bill → one PO — first partial invoice",
    oi103: 4,
    kind: "vendor_invoice",
    template: "grid",
    dogfoodHint: "Bill 4 of 10 on each SKU against PO-DOG-3001.",
    vendor: {
      legalName: "MA Inc.",
      accountNo: "MA-220",
      address: ["400 Industrial Blvd", "West Jordan, UT 84088"],
    },
    docNo: "MA-10044",
    docDate: "07/10/2026",
    poNos: ["PO-DOG-3001"],
    terms: "Net 45",
    lines: [
      { sku: "SAMPLE-SKU-07", description: "Sample Item 07", qty: 4, rate: 43 },
      { sku: "SAMPLE-SKU-08", description: "Sample Item 08", qty: 4, rate: 10 },
    ],
  },
  {
    id: "DF-04b",
    scenario: "Multi-Bill → one PO — second partial invoice",
    oi103: 4,
    kind: "vendor_invoice",
    template: "grid",
    dogfoodHint: "Remaining 6 of 10 against same PO-DOG-3001.",
    vendor: {
      legalName: "MA Inc.",
      accountNo: "MA-220",
      address: ["400 Industrial Blvd", "West Jordan, UT 84088"],
    },
    docNo: "MA-10089",
    docDate: "08/01/2026",
    poNos: ["PO-DOG-3001"],
    terms: "Net 45",
    lines: [
      { sku: "SAMPLE-SKU-07", description: "Sample Item 07", qty: 6, rate: 43 },
      { sku: "SAMPLE-SKU-08", description: "Sample Item 08", qty: 6, rate: 10 },
    ],
  },
  {
    id: "DF-05",
    scenario: "Odd line order for sort dogfood",
    oi103: 5,
    kind: "vendor_invoice",
    template: "classic",
    dogfoodHint:
      "OI-103.5 (Vanilla DF-05 skipped 2026-08-16 — no useful sort): dogfood column sort on Doc/Simplified (OI-053). Lines deliberately not SKU-sorted.",
    vendor: {
      legalName: "Summit Traders Ltd.",
      address: ["88 Market St", "Ogden, UT 84401"],
    },
    docNo: "ST-5601",
    docDate: "07/25/2026",
    poNos: ["PO-DOG-1005"],
    lines: [
      { sku: "SAMPLE-SKU-09", description: "Zebra last alphabetically", qty: 1, rate: 99 },
      { sku: "SAMPLE-SKU-01", description: "Alpha first", qty: 5, rate: 10 },
      { sku: "SAMPLE-SKU-05", description: "Mid", qty: 2, rate: 30 },
      { sku: "SAMPLE-SKU-12", description: "High amount line", qty: 20, rate: 50 },
    ],
  },
  {
    id: "DF-06",
    scenario: "Credit-card pay path cue",
    oi103: 6,
    kind: "vendor_invoice",
    template: "plain",
    dogfoodHint:
      "OI-103.6 / OI-123: Vanilla DF-06 hit ‘Cash or Bank Account was not specified’ — PE not created. Recurring vendor or Simplified may be easier; Doc skin next.",
    vendor: {
      legalName: "Office Pantry LLC",
      address: ["12 Cafe Ave", "Lehi, UT 84043"],
    },
    docNo: "OP-9921",
    docDate: "07/30/2026",
    terms: "Card on file",
    notes: ["Please charge corporate Visa ending 4412.", "No PO — NIC purchase."],
    lines: [
      { sku: "PANTRY-01", description: "Breakroom supplies", qty: 1, rate: 186.4 },
    ],
  },
  {
    id: "DF-07",
    scenario: "Bill reference is the account number (utilities-class)",
    oi103: 7,
    kind: "vendor_invoice",
    template: "plain",
    dogfoodHint:
      "Invoice # field is blank-ish; only account # shows — OI-054/087 greyed-dupe story.",
    vendor: {
      legalName: "Rocky Mountain Utilities",
      accountNo: "ACCT-998877",
      address: ["1 Power Lane", "Salt Lake City, UT 84111"],
    },
    docNo: "ACCT-998877",
    docDate: "08/01/2026",
    terms: "Due 15th",
    notes: [
      "Invoice number: (same as account number)",
      "Service period July 2026 — monthly recurring.",
    ],
    lines: [
      { sku: "UTIL-ELEC", description: "Electric service", qty: 1, rate: 412.17 },
    ],
  },
  {
    id: "DF-08",
    scenario: "Employee personal goods on company charge",
    oi103: 8,
    kind: "vendor_invoice",
    template: "classic",
    dogfoodHint:
      "Enter Bill; then research recoup (Employee Advance / JE / PE) — OI-103.8.",
    vendor: {
      legalName: "TechGadgets Direct",
      address: ["900 Retail Park", "Murray, UT 84107"],
    },
    docNo: "TGD-44012",
    docDate: "07/19/2026",
    notes: [
      "Cardholder: J. Smith (employee)",
      "Line 2 is PERSONAL — do not expense to company; recoup from employee.",
    ],
    lines: [
      { sku: "HDMI-2M", description: "HDMI cable (office)", qty: 2, rate: 14 },
      { sku: "GAME-X", description: "Personal game console accessory", qty: 1, rate: 79.99 },
    ],
  },
  {
    id: "DF-09",
    scenario: "Packing list / BOL for Item Receipt",
    kind: "packing_list",
    template: "plain",
    dogfoodHint: "Enter Item Receipt from packing list; then Bill from IR or PO.",
    vendor: {
      legalName: "ALPINE SUPPLY CO.",
      dba: "Alpine West Warehouse",
      address: ["1200 Ridge Rd", "Salt Lake City, UT 84101"],
    },
    shipFrom: {
      name: "Alpine West Warehouse",
      address: ["55 Dock St", "Salt Lake City, UT 84104"],
    },
    shipTo: {
      name: "HECSANDBOX Receiving",
      address: ["1 Warehouse Way", "Provo, UT 84601"],
    },
    docNo: "PL-66001",
    docDate: "07/20/2026",
    poNos: ["PO-DOG-1001"],
    packingNo: "PL-66001",
    bolNo: "BOL-7788",
    lines: [
      { sku: "WIDGET-A", description: "Widget A — blue", qty: 10, rate: 40 },
      { sku: "WIDGET-B", description: "Widget B — red", qty: 5, rate: 25 },
    ],
  },
  {
    id: "DF-10",
    scenario: "Partial packing list (partial receive)",
    kind: "packing_list",
    template: "plain",
    dogfoodHint:
      "Receive only these qty against a larger PO — source picker partials (OI-102).",
    vendor: {
      legalName: "MA Inc.",
      address: ["400 Industrial Blvd", "West Jordan, UT 84088"],
    },
    shipTo: {
      name: "HECSANDBOX Receiving",
      address: ["1 Warehouse Way", "Provo, UT 84601"],
    },
    docNo: "PL-3001-A",
    docDate: "07/08/2026",
    poNos: ["PO-DOG-3001"],
    packingNo: "PL-3001-A",
    notes: ["PARTIAL SHIPMENT 1 of 2 — remainder to follow."],
    lines: [
      { sku: "SAMPLE-SKU-07", description: "Sample Item 07", qty: 4, rate: 43 },
      { sku: "SAMPLE-SKU-08", description: "Sample Item 08", qty: 4, rate: 10 },
    ],
  },
  {
    id: "DF-11",
    scenario: "Happy-path clean invoice (from nothing / NIC)",
    kind: "vendor_invoice",
    template: "classic",
    dogfoodHint: "Baseline Bill entry with no tax drama.",
    vendor: {
      legalName: "SAMPLE Vendor 01",
      address: ["100 Sample Way", "Provo, UT 84601"],
    },
    docNo: "SMP-BILL-88",
    docDate: "07/15/2026",
    terms: "Net 30",
    lines: [
      { sku: "SAMPLE-SKU-01", description: "Sample Item 01", qty: 1, rate: 10 },
      { sku: "SAMPLE-SKU-02", description: "Sample Item 02", qty: 2, rate: 15.5 },
    ],
  },
  {
    id: "DF-12",
    scenario: "House-of-brands ship-from DBA ≠ billing name",
    kind: "vendor_invoice",
    template: "grid",
    dogfoodHint: "Billing = legal entity; ship-from brand differs (OI-106).",
    vendor: {
      legalName: "ALPINE SUPPLY CO.",
      accountNo: "CUST-44192",
      address: ["1200 Ridge Rd Ste 400", "Salt Lake City, UT 84101"],
    },
    shipFrom: {
      name: "Peak Pack Brands (Alpine)",
      address: ["2 Freight Court", "Salt Lake City, UT 84116"],
    },
    docNo: "ASI-80990",
    docDate: "07/27/2026",
    poNos: ["PO-DOG-1066"],
    notes: ["Remit to ALPINE SUPPLY CO. only.", "Shipped from Peak Pack Brands warehouse."],
    lines: [
      { sku: "SAMPLE-SKU-03", description: "Sample Item 03", qty: 6, rate: 21 },
    ],
  },
];

/**
 * @param {DogfoodSourceDoc} doc
 * @returns {number}
 */
export function sourceSubtotal(doc) {
  return (doc.lines || []).reduce((s, L) => s + Number(L.qty) * Number(L.rate), 0);
}

/**
 * @param {DogfoodSourceDoc} doc
 * @returns {number}
 */
export function sourceGrandTotal(doc) {
  return sourceSubtotal(doc) + (Number(doc.taxAmount) || 0);
}

/**
 * @returns {{ id: string, scenario: string, kind: string, oi103: number|null }[]}
 */
export function listDogfoodSourceIndex() {
  return DOGFOOD_AP_SOURCES.map((d) => ({
    id: d.id,
    scenario: d.scenario,
    kind: d.kind,
    oi103: d.oi103 ?? null,
  }));
}
