/**
 * Dogfood **source documents** — the paper 5zorro types from. Pure SSoT; nothing here is posted to
 * ERP.
 *
 * 🔴 **Each entry is one edge case, and the catalogue is the list of edge cases we claim to handle.**
 * That is the whole point of the pack: the unit tests prove the pure logic, and these prove the
 * *surface* — a person entering real-looking paper into the real UI, which is the only thing that
 * catches a button that is wired to nothing. Adding a scenario here is how an edge case gets
 * formalized rather than remembered.
 *
 * Every document carries four things a reader needs and cannot infer:
 *
 * | Field | Answers |
 * |---|---|
 * | `flow` | which side of the business — `ap` (money out) or `ar` (money in) |
 * | `target` | the ERPNext doctype this paper is typed **into** |
 * | `scenario` | the edge case, in one line |
 * | `expect` | what proves it worked, or the trap to watch for |
 *
 * `dogfoodHint` stays what it always was: how to actually do it, including anything already
 * confirmed against Vanilla.
 *
 * Two optional lists turn a paper into a round a person can pass or fail without re-reading the
 * plan (5zorro 2026-09-26: "add them as paper… so that i hit them when i go through the source"):
 *
 * | Field | Answers |
 * |---|---|
 * | `checks` | ticks to do right after entering it — including the click-through checks (Find pages, the hatch toggle, Home) placed on the paper where you are already on that screen |
 * | `knownGaps` | what the Doc skin cannot do yet, so that part is done in Vanilla instead of typed into a wall |
 */

/**
 * @typedef {"purchase_order"|"packing_list"|"vendor_invoice"|"vendor_statement"
 *   |"customer_rfq"|"customer_po"|"billing_instruction"|"customer_remittance"} SourceKind
 */
/** @typedef {"classic"|"grid"|"plain"|"ack"} TemplateId */
/** @typedef {"ap"|"ar"} SourceFlow */

/** Every `kind`, and the ERPNext doctype its paper is normally typed into. */
export const SOURCE_KIND_TARGET = Object.freeze({
  purchase_order: "Purchase Order",
  packing_list: "Purchase Receipt",
  vendor_invoice: "Purchase Invoice",
  vendor_statement: "Payment Reconciliation",
  customer_rfq: "Quotation",
  customer_po: "Sales Order",
  billing_instruction: "Sales Invoice",
  customer_remittance: "Payment Entry",
});

/** Which side of the business each kind belongs to. */
export const SOURCE_KIND_FLOW = Object.freeze({
  purchase_order: "ap",
  packing_list: "ap",
  vendor_invoice: "ap",
  vendor_statement: "ap",
  customer_rfq: "ar",
  customer_po: "ar",
  billing_instruction: "ar",
  customer_remittance: "ar",
});

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
 *   scenario: string,        // the edge case, one line
 *   expect?: string,         // what proves it worked, or the trap to watch for
 *   oi103?: number,          // museum OI-103's own numbered scenarios
 *   oi?: string,             // any other museum item this paper exists for, e.g. "OI-171"
 *   kind: SourceKind,
 *   target?: string,         // ERPNext doctype it is typed into; defaults from `kind`
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
 *   checks?: string[],       // ticks right after entering it (see the table above)
 *   knownGaps?: string[],    // what the Doc skin cannot do yet — do that part in Vanilla
 *   lines: SourceLine[],
 * }} DogfoodSourceDoc
 */

/** @type {DogfoodSourceDoc[]} */
export const DOGFOOD_SOURCES = [
  {
    id: "DF-01",
    scenario: "Invoice includes tax that should be backed out when paying in full",
    oi103: 1,
    kind: "vendor_invoice",
    template: "classic",
    dogfoodHint:
      "OI-103.1 (Vanilla confirmed 2026-08-16): Enter Bill as printed (tax 38.06). Book so tax debits Duties and Taxes / Sales Tax Payable; merchandise paid in full. Supplier PO# on paper — field dig later. Then try Doc/Simplified same path.",
    checks: [
      "Before typing — Home, top right, Hatch: click A/P. The Vendors tiles take the diagonal hatch and the Customers tiles lose it; the Doc Bill's card is hatched. Click A/R to put it back.",
      "After saving — Find Bill… lands on Find Bills with the cursor in Vendor's invoice no.; type ASI-77821 and the bill is the only row.",
      "Click its row: the peek drawer shows its two lines (WIDGET-A, WIDGET-B). Open this Bill takes you back to it on the Doc skin.",
    ],
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
    checks: [
      "Once the payment exists — Pay Bills → Find Payments… (header, left of the settings cog) opens Find Payments on ‘Paid to vendors’, cursor in the Vendor box.",
      "Open the payment from there: its check page has Find Payments… too, and that one opens with the cursor in the Check / reference no. box.",
    ],
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
    docNo: "DOGFOOD-NIC-88",
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
  {
    id: "DF-13",
    scenario: "Messy vendor spreadsheet paste — OI-132 Import lines",
    kind: "purchase_order",
    template: "grid",
    dogfoodHint:
      "Open generated DF-13 paste (.tsv/.csv). On PO/Bill: Import lines → ignore first 2 rows → map col D=SKU, C=append note, F=Qty, J=Extended (others ignored). Matches PO-DOG-3001 lines.",
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
    id: "DF-14",
    scenario: "OI-149 — PO + partial IR same vendor (multi-source Bill dogfood)",
    kind: "vendor_invoice",
    template: "classic",
    dogfoodHint:
      "Sandbox: PO-MN (logbook JE-88421) + PR-MN partial receive — select BOTH in Bill source modal. Expect merge edge-case dogfood; do not re-use seeded SMP-V… bill_no. Paper ref ASI-MN-901.",
    vendor: {
      legalName: "SAMPLE Vendor 01",
      accountNo: "CUST-44192",
      address: ["100 Sample Way", "Provo, UT 84601"],
    },
    docNo: "ASI-MN-901",
    docDate: "07/24/2026",
    poNos: ["JE-88421"],
    terms: "Net 30",
    notes: [
      "Matches ERP PO-MN / PR-MN after seed --reset.",
      "Line 2 qty billed as partial receive (4 of 10).",
    ],
    lines: [
      { sku: "SAMPLE-SKU-01", description: "Sample Item 01", qty: 10, rate: 10 },
      { sku: "SAMPLE-SKU-02", description: "Sample Item 02", qty: 4, rate: 15.5 },
    ],
  },
  {
    id: "DF-15",
    scenario: "OI-153 — Vendor prepayment (pay before goods)",
    kind: "purchase_order",
    template: "ack",
    dogfoodHint:
      "Sandbox: PO-PP (logbook PP-2200) — create PE Pay $120 against PO before Bill (OI-153 manual step). PR-PP posted after goods arrive. Enter Bill from PR-PP; verify advance applied.",
    vendor: {
      legalName: "SAMPLE Vendor 02",
      accountNo: "ACCT-998877",
      address: ["200 Sample Blvd", "Provo, UT 84601"],
    },
    shipTo: {
      name: "HECSANDBOX Receiving",
      address: ["1 Warehouse Way", "Provo, UT 84601"],
    },
    docNo: "PP-2200",
    docDate: "07/05/2026",
    terms: "Prepay 50% before ship",
    notes: [
      "ADVANCE PAID $120.00 — card on file.",
      "Do not pay again on Bill entry; apply advance in ERP.",
    ],
    lines: [
      { sku: "SAMPLE-SKU-03", description: "Sample Item 03", qty: 6, rate: 21 },
      { sku: "SAMPLE-SKU-04", description: "Sample Item 04", qty: 3, rate: 26.5 },
    ],
  },
  {
    id: "DF-16",
    scenario: "OI-154 — Logbook PO# Find (title TO-5599, not ERP name)",
    kind: "purchase_order",
    template: "ack",
    dogfoodHint:
      "Sandbox PO-LB only — PO Find should match logbook TO-5599 in title field (OI-121). ERP name will differ.",
    checks: [
      "Find Purchase Orders: type TO-5599 in PO# (logbook) — only this PO is left.",
      "Clear the box, then click the Amount heading: the whole list re-sorts biggest first (click again: smallest first). The summary line names the sort.",
      "Type a vendor, quit the app, start it again, open Find Purchase Orders: the vendor and the sort are still there. Clear search puts it back to every PO, newest first.",
      "If the list says ‘more below’, Show 200 more adds the next page underneath without losing your place.",
    ],
    vendor: {
      legalName: "SAMPLE Vendor 03",
      address: ["300 Sample Ln", "Provo, UT 84601"],
    },
    shipTo: {
      name: "HECSANDBOX Receiving",
      address: ["1 Warehouse Way", "Provo, UT 84601"],
    },
    docNo: "TO-5599",
    docDate: "07/02/2026",
    terms: "Net 30",
    lines: [{ sku: "SAMPLE-SKU-05", description: "Sample Item 05", qty: 2, rate: 30 }],
  },
  {
    id: "DF-17",
    scenario: "Vendor statement still shows a bill you already paid — because amending it detached the payment",
    oi: "OI-171",
    kind: "vendor_statement",
    template: "plain",
    dogfoodHint:
      "IMPORTANT: The trap P1's own Edit (void and amend) creates. Cancelling a bill DETACHES its payments here (Accounts Settings > unlink_payment_on_cancellation_of_invoice is ON), so the payment survives submitted-but-unallocated and the amended bill reads Unpaid. The vendor's statement then chases you for money you already sent. ERPNext's own fix is Accounts > Payment Reconciliation: party type Supplier, pick the vendor, Get Unreconciled Entries, tick the payment against the amended bill, Reconcile. Do NOT cut a second check. The Pay Outstanding board now proposes the pairing for you: click the vendor's 'unapplied' chip and it names the amended bill, because an amendment carries amended_from and ERPNext's own allocator ignores that. (The original sandbox example, ACC-PAY-2026-00002 against ACC-PINV-2026-00231-1, was re-linked with exactly that button on 2026-09-26.)",
    expect:
      "Pay Outstanding shows an 'unapplied' chip on the vendor for the loose payment. After reconciling, the chip is gone and the amended bill leaves the board. Paying again would leave the vendor holding a credit — that is the double-payment this scenario exists to prevent.",
    vendor: {
      legalName: "ALPINE SUPPLY CO.",
      accountNo: "CUST-44192",
      address: ["1200 Ridge Rd", "Salt Lake City, UT 84101"],
    },
    docNo: "STMT-2026-09",
    docDate: "09/30/2026",
    terms: "Net 30 — balance shown is PAST DUE per our records",
    notes: [
      "Statement of account — amounts shown are open per OUR records.",
      "If payment has been sent, please provide the check/ACH reference.",
      "IMPORTANT: Before paying: check whether this bill was amended. An amendment gets a NEW ERPNext ID and the original payment is left unallocated against the vendor, not against the bill.",
    ],
    lines: [
      { sku: "STMT-LINE", description: "Invoice ASI-77821 — open balance", qty: 1, rate: 9 },
    ],
  },
  {
    id: "DF-18",
    scenario: "Customer RFQ priced under THEIR part numbers, with a quantity break and an expiry",
    oi: "OI-143",
    kind: "customer_rfq",
    template: "plain",
    dogfoodHint:
      "Customer asks for a quote using their own part numbers, which are not our SKUs. Enter a Quotation: map each of their numbers to ours, honour the quantity break on line 2, and set Valid Till from the 'respond by' date — not today+default. Their RFQ number is what they will reference back, so it has to survive onto the Quotation.",
    expect:
      "The Quotation carries the customer's RFQ number somewhere findable, their part number stays visible next to our SKU, and Valid Till matches the paper rather than the ERP default.",
    checks: [
      "Before typing — Home › Customers reads Estimates (1, optional) → Sales Orders (2) → Create Invoices (3) stacked over Receive Payments (4), with Customer Center alone in ‘As needed’.",
      "Estimates tile opens the Doc Estimate (blue wash, Selling hatch). The toolbar shows Document-skin lit and Default-skin beside it.",
      "Pick an item: Rate fills with the SELLING price, not our cost.",
      "Valid until: type 10/28/2026 (30 days from the respond-by date). After Save it still says 10/28/2026.",
      "Find Estimates… opens Find Estimates; your estimate is the newest row under Northwind.",
    ],
    knownGaps: [
      "Northwind is not a customer yet, and the Customer ▾ picker cannot create one (only Vendor's can) — add NORTHWIND FABRICATION LLC in Customer Center first.",
      "The Estimate skin has no column for the customer's part number — add it in Vanilla (Quotation Item › Customer's Item Code) via Open in Default-skin.",
      "No box for their RFQ number either — put RFQ-2026-0442 in Vanilla (e.g. the Quotation's title or a comment) until the skin has one.",
    ],
    vendor: {
      legalName: "NORTHWIND FABRICATION LLC",
      accountNo: "RFQ-2026-0442",
      address: ["4400 Industrial Pkwy", "Boise, ID 83702"],
    },
    shipTo: {
      name: "Northwind Fabrication — Plant 2",
      address: ["77 Foundry Rd", "Nampa, ID 83651"],
    },
    docNo: "RFQ-2026-0442",
    docDate: "09/14/2026",
    terms: "Respond by 09/28/2026 — quote must hold 30 days",
    notes: [
      "Please quote using OUR part numbers below; cross-reference yours on the response.",
      "Line 2: quote BOTH price breaks (25 ea and 100 ea). We will order against whichever we choose.",
      "Quotes received after the respond-by date will not be considered.",
    ],
    lines: [
      { sku: "NW-PN-4471", description: "Their PN 4471 — our SAMPLE-SKU-03", qty: 25, rate: 21 },
      { sku: "NW-PN-4472", description: "Their PN 4472 — our SAMPLE-SKU-04 (break at 100)", qty: 100, rate: 24.75 },
    ],
  },
  {
    id: "DF-19",
    scenario: "Customer PO: bill-to is head office, ship-to is a jobsite, and their PO# is the only number they will quote",
    oi: "OI-134",
    kind: "customer_po",
    template: "ack",
    dogfoodHint:
      "Their PO number — not ours — is what shows up on every later phone call, so it has to be the number the Sales Order is findable by (same problem OI-170 names on the buying side). Bill-to and ship-to differ: head office pays, the jobsite receives. Partial shipment is explicitly allowed, which is what makes the Sales Invoice in DF-20 a partial one.",
    expect:
      "The Sales Order is findable by CPO-88120, ship-to is the jobsite and bill-to is head office, and the partial-ship permission is recorded somewhere the person invoicing will see it.",
    checks: [
      "Customer PO No.: type CPO-88120. Find Sales Orders › Customer's PO no. finds it by that number.",
      "Ship by in the header (type 10/05/2026) sets both lines' Ship by; Add line starts a new line with the same date.",
      "The Delivered / Billed / Status strip under the addresses reads 0% / 0% / Draft, then the real status after Submit.",
    ],
    knownGaps: [
      "Bill to / Ship to are read-only on the A/R skins (no address picker yet) — set the jobsite ship-to in Vanilla via Open in Default-skin, then Refresh.",
      "No field for ‘partial shipment accepted’ — note it in Terms and conditions.",
    ],
    vendor: {
      legalName: "NORTHWIND FABRICATION LLC",
      accountNo: "CPO-88120",
      address: ["4400 Industrial Pkwy", "Boise, ID 83702"],
    },
    shipTo: {
      name: "Northwind — Riverbend Jobsite",
      address: ["Gate 4, Riverbend Access Rd", "Caldwell, ID 83605"],
    },
    docNo: "CPO-88120",
    docDate: "09/21/2026",
    terms: "Net 45 from invoice date",
    notes: [
      "BILL TO: Accounts Payable, 4400 Industrial Pkwy, Boise ID 83702.",
      "SHIP TO: Riverbend jobsite address above. Do NOT ship to Boise.",
      "Partial shipment ACCEPTED. Invoice only what ships.",
      "IMPORTANT: Our PO number CPO-88120 must appear on the packing slip and the invoice or payment will be held.",
    ],
    lines: [
      { sku: "SAMPLE-SKU-03", description: "Sample Item 03", qty: 40, rate: 21 },
      { sku: "SAMPLE-SKU-05", description: "Sample Item 05", qty: 12, rate: 30 },
    ],
  },
  {
    id: "DF-20",
    scenario: "Bill only what shipped: partial invoice against a customer PO, with the rest on backorder",
    oi: "OI-134",
    kind: "billing_instruction",
    template: "grid",
    dogfoodHint:
      "Follows DF-19 — enter that Sales Order first. Only part of it shipped, so the Sales Invoice bills the shipped quantity and leaves the balance open on the order. Their PO number must print on the invoice (see the note on DF-19) or they hold payment. The backorder line is NOT invoiced now and must not quietly close the order.",
    expect:
      "The Sales Invoice totals the shipped quantities only, the Sales Order stays partly open for the backorder, and CPO-88120 appears on the invoice. Closing the order at this point is the failure this paper is looking for.",
    checks: [
      "Northwind buys for resale: clear Sales tax so the invoice totals $885.00 — DF-21's check is written against that amount.",
      "Date: type 09/25/2026 (the ship date, not today). After Save it still says 09/25/2026 — a typed invoice date sticks.",
      "Customer PO No. reads CPO-88120. The Sales Order's strip now shows Billed 74% ($885 of $1,200) and it is NOT Completed.",
      "Find Invoices › Customer's PO no. CPO-88120 finds it; the peek shows the two shipped lines only.",
    ],
    knownGaps: [
      "The Invoice skin cannot pull lines from a Sales Order yet — open the DF-19 order in Vanilla, Create › Sales Invoice, then click Document-skin to finish in the Doc Invoice.",
    ],
    vendor: {
      legalName: "NORTHWIND FABRICATION LLC",
      accountNo: "CPO-88120",
      address: ["4400 Industrial Pkwy", "Boise, ID 83702"],
    },
    shipTo: {
      name: "Northwind — Riverbend Jobsite",
      address: ["Gate 4, Riverbend Access Rd", "Caldwell, ID 83605"],
    },
    docNo: "SHIP-4471-A",
    docDate: "09/25/2026",
    poNos: ["CPO-88120"],
    terms: "Net 45 — customer PO# required on invoice",
    notes: [
      "Shipped today against CPO-88120: 25 of 40 SAMPLE-SKU-03, 12 of 12 SAMPLE-SKU-05.",
      "BACKORDER: 15 × SAMPLE-SKU-03 — do not invoice, do not close the order.",
      "Invoice must show customer PO CPO-88120.",
    ],
    lines: [
      { sku: "SAMPLE-SKU-03", description: "Sample Item 03 — SHIPPED 25 of 40", qty: 25, rate: 21 },
      { sku: "SAMPLE-SKU-05", description: "Sample Item 05 — SHIPPED 12 of 12", qty: 12, rate: 30 },
    ],
  },
  {
    id: "DF-21",
    scenario: "Customer check short-pays an invoice they identify only by THEIR PO number",
    kind: "customer_remittance",
    template: "classic",
    dogfoodHint:
      "Follows DF-20 — that invoice must exist, tax-exempt at $885.00. The remittance names CPO-88120, not our invoice number, and deducts $25 of freight they say was never agreed. Home › Receive Payments: pick Northwind, type Amount received 860.00, and put the whole 860.00 against the CPO-88120 invoice in the Payment column. Check No. 50113, dated 10/02/2026, deposited to the bank.",
    expect:
      "The invoice ends Partly Paid with $25.00 still open (the deduction is a dispute, not a write-off), Unapplied is $0.00, and the payment is findable by check 50113.",
    checks: [
      "Before typing — find the invoice by their number: Find Invoices › Customer's PO no. CPO-88120. Note our invoice number; that is the row to pay.",
      "Receive Payments tile opens the Doc Receive Payment (green wash, Selling hatch), not the Pay Bills dashboard.",
      "Picking Northwind lists their open invoices under ‘Open invoices’ — no Add line button, and only the Payment column takes typing.",
      "Type 860.00: ERPNext spreads it oldest-first; if it lands on another invoice, move it onto the CPO-88120 one. Unapplied reads 0.",
      "Method Check fills Deposit to; Check / Ref No. 50113 and Ref date 10/02/2026 are required for a bank account.",
      "After Submit — Recent › the payment reopens in the Receive Payment form (not the AP check page). Its Find Payments… lands on ‘Received from customers’.",
      "Find Payments › Check / reference no. 50113 finds it.",
    ],
    vendor: {
      legalName: "NORTHWIND FABRICATION LLC",
      accountNo: "CPO-88120",
      address: ["4400 Industrial Pkwy", "Boise, ID 83702"],
    },
    docNo: "CHK-50113",
    docDate: "10/02/2026",
    poNos: ["CPO-88120"],
    terms: "Check no. 50113 enclosed",
    notes: [
      "REMITTANCE ADVICE — detach and keep with your records.",
      "Paying your invoice for our PO CPO-88120 (shipment SHIP-4471-A).",
      "DEDUCTED: $25.00 freight — not on our PO, not agreed. Call AP to discuss.",
    ],
    lines: [
      { sku: "CPO-88120", description: "Your invoice for our PO CPO-88120", qty: 1, rate: 885 },
      { sku: "DEDUCT", description: "Less: freight not agreed on PO", qty: 1, rate: -25 },
    ],
  },
  {
    id: "DF-22",
    scenario: "A bill entered weeks after its invoice date must post on the invoice date, not the day it was typed",
    kind: "vendor_invoice",
    template: "grid",
    dogfoodHint:
      "Enter as printed on the Doc Bill. The Invoice date is 08/04/2026; you are typing it much later. The fix of 2026-09-26: a typed Invoice date is also the posting date (ERPNext's own ‘invoice date, else posting date’ rule). Before it, this bill posted to the ledger today.",
    expect:
      "In Vanilla the saved Bill shows Posting Date 08/04/2026 with Edit Posting Date ticked, and the Due Date is 30 days after 08/04 — not after today.",
    checks: [
      "After typing the Invoice date — Open in Default-skin: Posting Date is 08/04/2026 and ‘Edit Posting Date and Time’ is ticked.",
      "With Terms NET 30 DAYS, the Due date reads 09/03/2026 — 30 days from the invoice date.",
      "Back on the Doc skin, clear the Invoice date: in Vanilla the Posting Date returns to today. Retype 08/04/2026 before saving.",
      "Save, then Find Bills: the Bill date column shows Aug 4, 2026.",
    ],
    vendor: {
      legalName: "SAMPLE Vendor 04",
      address: ["400 Sample Ln", "Orem, UT 84057"],
    },
    docNo: "SV4-INV-2208",
    docDate: "08/04/2026",
    terms: "NET 30 DAYS",
    taxNote: "No tax — resale",
    taxAmount: 0,
    lines: [
      { sku: "SAMPLE-SKU-02", description: "Sample Item 02", qty: 6, rate: 18.5 },
    ],
  },
  {
    id: "DF-23",
    scenario: "Goods received last week, receipt typed today — the Item Receipt must keep the received date",
    kind: "packing_list",
    template: "ack",
    dogfoodHint:
      "Receive Inventory on the Doc Item Receipt, dated as the packing list is (09/18/2026). Until 2026-09-26 a typed receipt date was silently reset to today on save.",
    expect:
      "After Save the Item Receipt still says 09/18/2026, and in Vanilla its Posting Date is 09/18/2026 with Edit Posting Date ticked.",
    checks: [
      "Type Date 09/18/2026, Save: the Doc Item Receipt still shows 09/18/2026.",
      "Open in Default-skin: Posting Date 09/18/2026, ‘Edit Posting Date and Time’ ticked.",
      "Find Item Receipts: the Received column shows Sep 18, 2026.",
    ],
    vendor: {
      legalName: "SAMPLE Vendor 04",
      address: ["400 Sample Ln", "Orem, UT 84057"],
    },
    docNo: "PL-SV4-0918",
    docDate: "09/18/2026",
    packingNo: "PL-SV4-0918",
    notes: ["Received 09/18/2026 at dock 2 — signed J.R."],
    lines: [
      { sku: "SAMPLE-SKU-02", description: "Sample Item 02", qty: 12, rate: 18.5 },
    ],
  },
  // DF-24: drop ship (5zorro 2026-10-01). ERPNext marks a line drop-ship only on the Sales Order
  // ("Supplier delivers to Customer"); the PO made from it inherits that read-only, and a Bill line
  // from such a PO line skips the Stock Received But Not Billed swap (purchase_invoice.py
  // set_expense_account). The PO skin's "Customer (drop ship)" sets only the address, not the lines.
  {
    id: "DF-24a",
    scenario: "Drop ship, step 1 — the customer orders something we have the vendor ship straight to them",
    kind: "customer_po",
    template: "ack",
    dogfoodHint:
      "Enter as a Sales Order. The line is drop-ship: tick ‘Supplier delivers to Customer’ and pick SUMMIT PUMP SUPPLY as its Supplier — ERPNext only knows drop ship from that tick on the Sales Order line. Then, from the submitted Sales Order, Create › Purchase Order: that PO is DF-24b.",
    expect:
      "The submitted Sales Order's line shows ‘Supplier delivers to Customer’ with SUMMIT PUMP SUPPLY, and Create › Purchase Order offers it as a drop-ship PO to the customer's address.",
    checks: [
      "Customer PO No.: CPO-88410 — Find Sales Orders finds it by that number.",
      "Ship to is the Twin Falls site, not head office.",
    ],
    knownGaps: [
      "The A/R Doc skins have no ‘Supplier delivers to Customer’ / Supplier column — tick them on the line in Vanilla (Open in Default-skin), then Refresh.",
      "Ship to is read-only on the A/R skins — set the Twin Falls address in Vanilla.",
    ],
    vendor: {
      legalName: "NORTHWIND FABRICATION LLC",
      accountNo: "CPO-88410",
      address: ["4400 Industrial Pkwy", "Boise, ID 83702"],
    },
    shipTo: {
      name: "Northwind — Twin Falls Pump Station",
      address: ["1250 Canal Rd", "Twin Falls, ID 83301"],
    },
    docNo: "CPO-88410",
    docDate: "10/01/2026",
    terms: "Net 30",
    notes: [
      "Ship DIRECT to the Twin Falls pump station. Do not route through your warehouse.",
      "Our PO number CPO-88410 must appear on the invoice.",
    ],
    lines: [{ sku: "SAMPLE-SKU-09", description: "Sample Item 09 — drop ship", qty: 2, rate: 640 }],
  },
  {
    id: "DF-24b",
    scenario: "Drop ship, step 2 — our PO tells the vendor to ship to the customer, not to us",
    kind: "purchase_order",
    template: "ack",
    dogfoodHint:
      "Do not type this PO from scratch: it is what Create › Purchase Order on DF-24a's Sales Order makes. Open that PO in the Doc skin and compare it with this paper. Type the logbook PO# PO-DOG-4410 into PO# (logbook).",
    expect:
      "The PO's Ship to is the customer's Twin Falls address with Customer (drop ship) = NORTHWIND FABRICATION LLC, and its line is drop-ship (‘To be Delivered to Customer’ in Vanilla). There is nothing to receive into our warehouse.",
    checks: [
      "Click Ship to on the PO Doc skin: Customer (drop ship) reads NORTHWIND FABRICATION LLC and the Twin Falls address is current.",
      "The No.: toggle in File shows PO-DOG-4410 leading, the ERPNext PO name beside it.",
      "When the vendor confirms delivery: in Vanilla, the PO's Status › Deliver (Dropship), quantity 2; the Sales Order then reads Delivered.",
    ],
    knownGaps: [
      "Marking the drop-ship line delivered is Vanilla-only (Purchase Order › Status › Deliver (Dropship)).",
    ],
    vendor: {
      legalName: "SUMMIT PUMP SUPPLY",
      address: ["77 Foundry St", "Pocatello, ID 83201"],
    },
    shipTo: {
      name: "DROP SHIP — Northwind — Twin Falls Pump Station",
      address: ["1250 Canal Rd", "Twin Falls, ID 83301"],
    },
    docNo: "PO-DOG-4410",
    docDate: "10/01/2026",
    terms: "Net 30",
    notes: ["DROP SHIP to our customer at the address above. Reference customer PO CPO-88410 on the packing slip."],
    lines: [{ sku: "SAMPLE-SKU-09", description: "Sample Item 09 — drop ship", qty: 2, rate: 455 }],
  },
  {
    id: "DF-24c",
    scenario: "Drop ship, step 3 — the vendor bills us for goods that went straight to the customer",
    kind: "vendor_invoice",
    template: "grid",
    dogfoodHint:
      "Doc Bill → Select PO / source → PO-DOG-4410. Do not build it as a NIC bill: a Purchase Invoice has no customer field, so only a Bill made from the drop-ship PO can carry the customer's ship-to (the Bill's Ship to picker says so).",
    expect:
      "The Bill's Ship to is the Twin Falls address carried from the PO, and Submit shows no ‘Expense Head Changed’ message — a drop-ship line is not waiting on a receipt into our stock, so it is not parked in Stock Received But Not Billed.",
    checks: [
      "Ship to reads the Twin Falls address without picking it.",
      "Submit: no Expense Head Changed popup, and no ‘receive with this bill?’ question either.",
      "Now try the same lines as a NIC bill (no PO), then Revert: the Ship to picker offers only company addresses and explains why.",
    ],
    vendor: {
      legalName: "SUMMIT PUMP SUPPLY",
      accountNo: "SPS-NW-118",
      address: ["77 Foundry St", "Pocatello, ID 83201"],
    },
    shipTo: {
      name: "Northwind — Twin Falls Pump Station (drop ship)",
      address: ["1250 Canal Rd", "Twin Falls, ID 83301"],
    },
    docNo: "SPS-30418",
    docDate: "10/08/2026",
    poNos: ["PO-DOG-4410"],
    terms: "Net 30",
    lines: [{ sku: "SAMPLE-SKU-09", description: "Sample Item 09 — drop ship", qty: 2, rate: 455 }],
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
 * Which side of the business a document belongs to, and which doctype it is typed into. Both are
 * derived from `kind` unless the document overrides `target`, so a new scenario cannot forget them.
 * @param {DogfoodSourceDoc} doc
 */
export function sourceFlow(doc) {
  return SOURCE_KIND_FLOW[doc.kind] || "ap";
}

/** @param {DogfoodSourceDoc} doc */
export function sourceTarget(doc) {
  return doc.target || SOURCE_KIND_TARGET[doc.kind] || "";
}

/** The museum item this paper exists for, as one label. @param {DogfoodSourceDoc} doc */
export function sourceOi(doc) {
  if (doc.oi103 != null) return `OI-103.${doc.oi103}`;
  return doc.oi || "";
}

/** Money-out paper only — what the pack was before it grew a sales side. */
export const DOGFOOD_AP_SOURCES = DOGFOOD_SOURCES.filter((d) => sourceFlow(d) === "ap");

/** Money-in paper. */
export const DOGFOOD_AR_SOURCES = DOGFOOD_SOURCES.filter((d) => sourceFlow(d) === "ar");

/**
 * The catalogue as a table — this is what the generated README prints, so the index and the
 * documents cannot disagree about what the pack covers.
 *
 * @returns {{ id: string, scenario: string, expect: string, kind: string, flow: string,
 *   target: string, oi: string, oi103: number|null }[]}
 */
export function listDogfoodSourceIndex() {
  return DOGFOOD_SOURCES.map((d) => ({
    id: d.id,
    scenario: d.scenario,
    expect: d.expect || "",
    kind: d.kind,
    flow: sourceFlow(d),
    target: sourceTarget(d),
    oi: sourceOi(d),
    oi103: d.oi103 ?? null,
  }));
}
