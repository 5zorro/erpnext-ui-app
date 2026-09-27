# Sample data seed (sandbox only) — OI-055 / plan S−1

Deterministic corpus for dogfooding **create from nothing** vs **create from source**
across Quotation, Sales Order, Sales Invoice, Purchase Order, Purchase Receipt, and
Purchase Invoice (~25 **submitted** each + **5 drafts** each, last 60 days, multiple
SAMPLE vendors/customers), plus **Delivery Note** and **Payment Entry** rows that exist
only inside the named fixtures below. Drafts are create-from-nothing and use distinct parties
(first 5 vendors / customers) so Find Bill can open real `docstatus === 0` rows.

## Tax mix (OI-115)

| Side | Mix | Effect |
|------|-----|--------|
| **AR / customers** | ~7 of 8 taxable, 1 exempt | Submitted Sales Invoices for taxable customers get **Sales Taxes and Charges** (prefer `US ST 6.25% - HI`) → ST liability accounts |
| **AP / purchases** | No purchase sales-tax template | Wholesale/resale realism — Bills are nontaxable for sales tax |
| **Tax withholding (TDS)** | ~2 of 8 SAMPLE vendors | Category **`SAMPLE-TDS`** (10%, threshold 0); submitted PIs for those vendors withhold → **Tax Withholding Details** report |

**Reports after seed**

- **Tax Withholding Details** — filter the sandbox company / FY 2026; expect SAMPLE TW Bills (not sales-tax SIs).
- **Sales Invoice** taxes table / ST account ledger — open a taxable SAMPLE Customer SI (not the exempt customer).
- Sales tax does **not** appear in Tax Withholding Details (different ERP feature).

## Layout

| Path | Role |
|------|------|
| `src/sample-data/corpus-plan.js` | Pure plan SSoT (unit-tested) |
| `src/sample-data/sandbox-guard.js` | Allowlist / confirm checks (unit-tested) |
| `ops/sample-data/emit-plan.js` | Emit plan JSON |
| `ops/sample-data/seed_corpus.py` | Frappe applicator (`bench execute`) |
| `ops/sample-data/run-seed.sh` | Docker + sandbox gate |

## Run

```bash
# frappe_docker up on :8080, company name contains SANDBOX
CONFIRM_SAMPLE_SEED=1 npm run seed:sample

# wipe prior tagged docs then recreate (soft reset — keeps company / login / volumes)
CONFIRM_SAMPLE_SEED=1 npm run seed:sample -- --reset
```

Idempotent without `--reset`: skips docs whose `remarks` already contain the current tag
(`ui-app-sample-v5` — see `SAMPLE_TAG` in `corpus-plan.js`).

**Dupe-check dogfood (OI-054 / OI-087):** After you have typed seeded `bill_no` values once, a
**soft reset** avoids stale duplicate warnings:

```bash
CONFIRM_SAMPLE_SEED=1 npm run seed:sample -- --reset
npm run dogfood:ap-sources   # refresh HTML paper sources (gitignored output)
```

Use **fresh refs** (`DOGFOOD-…`) when manually testing entry — not the seeded `SMP-V…-INV-…` series.

## The traced chain ("the bowtie") — keys `BT-*`

Everything else in this corpus links along **one** side of the business. This is the single row
that crosses: one customer order walked all the way through, nine documents deep.

```
Quotation → Sales Order ─┬→ Purchase Order → Item Receipt → Bill → Payment (Pay, cheque)
                         └→ Delivery Note → Invoice → Payment (Receive, ACH)
```

The hinge is **`Purchase Order Item.sales_order`** — the only field in stock ERPNext that says
*this purchase exists because of that customer order*. Without it the two halves are just documents
that happen to share a week.

| Key | Doc | Day (before asOf) | Notes |
|-----|-----|------|-------|
| `BT-Q` | Quotation | 56 | 4 × 150.00 |
| `BT-SO` | Sales Order | 52 | ← `BT-Q` |
| `BT-PO` | Purchase Order | 48 | 4 × 125.00; **carries `sales_order` → `BT-SO`**; logbook `BT-1001` |
| `BT-PR` | Item Receipt | 40 | ← `BT-PO` |
| `BT-PI` | Bill | 38 | ← `BT-PR`; `SMP-BOWTIE-INV-01` |
| `BT-PE-PAY` | Payment Entry (Pay) | 30 | `USPS_Check` — the chain "cuts a check" |
| `BT-DN` | Delivery Note | 26 | ← `BT-SO` |
| `BT-SI` | Invoice | 26 | ← `BT-DN`, **same posting date as the shipment** |
| `BT-PE-RCV` | Payment Entry (Receive) | 12 | `ACH` |

Deliberate choices, each of which a later edit would quietly undo:

- **Receipt (40) precedes Delivery Note (26)** — the stock that ships is the stock that arrived, so
  the costing panel has a real layer to point at.
- **Shipment and invoice share a date** — 5zorro's process is "create an invoice at the same time as
  I ship". Two documents rather than one `update_stock` invoice, so the stock movement stays
  separable from the billing.
- **Its own vendor and customer, both outside the rotation, neither taxed.** `SUP-BOWTIE` has no tax
  withholding and `CUS-BOWTIE` is sales-tax exempt: the chain exists to show one clean amount
  travelling, and a TDS deduction or a pass-through tax would make the payment disagree with the
  bill for reasons that have nothing to do with the trail. Margin is exactly **100.00**
  (4 × 150 − 4 × 125).
- **Neither payment names an amount.** Each settles whatever its invoice actually owes — a number in
  the plan would make the fixture disagree with its own bill the first time a rounding rule moved.

🔴 The 1.2× markup is **sample data, not a rule**. Pricing belongs to the CRM and the salesman
(OI-179); nothing in the shell reads `BOWTIE_SELL` or derives a price from it.

## Costing layers (OI-177) — keys `PR-COST-*` / `DN-COST-*`

Three SKUs that differ **only** in `valuation_method`, given identical movements:
buy 2 @ 50, buy 1 @ 75, sell 2. `valuation_method` is per Item, so one SKU can never show two
answers — three is the minimum that makes the methods disagree visibly.

All three leave **one unit** on hand. Only its value differs:

| SKU | Method | Layers after (`stock_queue`) | On hand | Cost booked by the sale |
|-----|--------|------------------------------|---------|------|
| `SAMPLE-SKU-COST-FIFO` | FIFO | `[[1.0, 75.0]]` | **75.00** | 100.00 |
| `SAMPLE-SKU-COST-LIFO` | LIFO | `[[1.0, 50.0]]` | **50.00** | 125.00 |
| `SAMPLE-SKU-COST-AVG` | Moving Average | `[]` *(empty)* | **58.33** | 116.67 |

✅ **Read back off this sandbox 2026-09-26**, not predicted: every column above is what
`tabStock Ledger Entry` actually holds after the seed runs. The last column is the real payload —
the *same* sale of 2 units books three different costs, a 25.00 spread on a 175.00 purchase.

🔴 **The layers are stored, not derived.** `Stock Ledger Entry.stock_queue` is a Long Text holding
`[[qty, rate], ...]` as of that transaction, and `stock_value_difference` on the same row is the
cost that movement booked. A costing panel must **read** those — recomputing FIFO in the shell would
be a second opinion that silently drifts from the books.

🔴 **Moving Average writes no layers at all.** ERPNext keeps one running rate for it
(`get_moving_average_values`), so `stock_queue` stays empty. Saying so is the audit finding, not a
hole in the panel.

The seed prints this table at the end of a run, so the fixture states its own pass condition.
`tests/sample-data-corpus.test.js` re-derives all three values from the movements rather than
trusting the constants.

**Movements ride on real documents** (two Item Receipts and one Delivery Note each, from nothing)
because the panel is reached *from a document* — a clerk looking at one shipment asking what it
cost. The buy rates are on the receipt lines; that is the only way one SKU ends up with two
different incoming rates.

🔴 **Zero opening stock.** `ITM-BOWTIE` and the three costing SKUs carry `openingQty: 0`. Every
other SAMPLE SKU is seeded with 500 units so receipts and invoices always value — but 500 units of
prior stock buries the receipts these fixtures are meant to point at.

**Not covered:** negative inventory (shipping before receiving). Deliberately — see **OI-178** and
the static walk-through at `docs/mockups/negative-inventory-timeline.html`.

## Money-in stress fixtures — keys `SI-INST` / `SI-SPLIT-*` / `SI-OVER`

The Receive Payment side's answer to the AP batching fixtures.

| Key(s) | Shape | Why |
|--------|-------|-----|
| `SI-INST` | one invoice, **12 monthly installments** of 250 (3,000 total) | the explode path on the receive side |
| `SI-SPLIT-A/B/C` + `PE-SPLIT` | three invoices (400 / 700 / 900), **one payment of 1,000** — A settled, B and C left part-paid | multi-reference partial allocation |
| `SI-OVER` + `PE-OVER` | 500 owed, **800 arrives** → 300 unallocated credit | see below |

🔴 `SI-OVER` is the one to keep. Its leftover credit has the same shape as the row that silently
emptied the whole Pay Outstanding board (gotchas **G13**) — negative outstanding, no due date. The
receive side now meets that row in a fixture instead of in front of a clerk.

All four stress customers are sales-tax **exempt**: these fixtures are about allocation arithmetic,
and a pass-through tax would make every total a number you have to back out first.

## The reselling year — 25 vendors x 25 customers x 12 months

A second population entirely, with its own 360-day window. SSoT: `src/sample-data/reselling-corpus.js`
(pure, unit-tested in `tests/reselling-corpus.test.js`); it is **on by default** and switched off with
`buildCorpusPlan({ reselling: false })`.

🔴 **Deliberately separate from the 8-vendor rotation above.** That rotation is calibrated for the
tax mix (OI-115), the batching fixtures and the Find dogfood; growing it to 25 would have moved all
of it. These are new parties (`SAMPLE Reseller Vendor 01-25` / `SAMPLE Reseller Customer 01-25`) and
new SKUs (`SAMPLE-RS-*`).

| | |
|---|---|
| Documents | **~2,726** — 365 PO, 460 IR, 456 Bill, 460 DN, 460 Invoice, 525 Payment |
| Window | 360 days, twelve 30-day months |
| Floor | **every party trades every month** — asserted per party per month, not on average |
| Activity spread | 3 heavy (3 cycles/mo), 7 steady (2), 15 light (1); tiers interleaved so vendor 01 is not automatically the busiest |
| Seed time | **~14 min** (measured: 465 docs in 2m24s, ~0.31s/doc) |

A **cycle** is one reselling transaction: `[PO] → Item Receipt → Bill` and `Delivery Note → Invoice`,
plus its share of a payment. 4 cycles in 5 carry a Purchase Order; the rest are bare receipts, which
resale does both ways and which keeps the create-from-source / create-from-nothing mix honest. Each
cycle sells **fewer** units than it bought, so ordinary stock accumulates and never goes negative by
accident.

### Cost moves every month — that is the point

Each resale SKU has a **different cost in each of the twelve months**, so a rate sitting in the FIFO
queue *names the month it was bought in*. That is the whole trace from purchase to sale: ERPNext has
no document link for resale, so the cost layer is the only evidence, and identical monthly rates
would make it unreadable.

`costForMonth(item, m) = baseCost + costStep * m`, with the tests asserting all twelve are distinct
and every month's price clears that month's cost. 🔴 **Two SKUs deflate** (`RS-ITM-03`, `RS-ITM-06`)
so nothing downstream may assume cost only rises.

### The two ageing rules

| Side | Rule | Result |
|---|---|---|
| Money in | an invoice **older than 25 days is paid in full** | nothing outstanding in AR is over 25 days old |
| Money out | a bill **older than 60 days is paid in full** | nothing outstanding in AP is over 60 days old |

Collect faster than you pay. Payments are **grouped per party per month** — one cheque settling
several bills, which is both what really happens and what the Pay Outstanding board exists for — and
dated at the *latest* settle date in the group, so the newest invoice in it lands exactly on the
limit. No allocation names an amount: each reference settles what its invoice really owes.

### Negative inventory, both flavours — keys `RS-NEG-*`

Four cases on **four dedicated SKUs**. Dedicated because a backdated receipt reposts every later
movement for that item and warehouse: on a shared SKU it would cascade through a year of unrelated
history (slow) and bury the case you came to look at (illegible).

| SKU | Flavour | Receipt dated | What you see |
|---|---|---|---|
| `SAMPLE-RS-NEG-F1` / `-F2` | forward | **after** the shipment | no repost, ever — the shipment keeps its guessed cost permanently, and the difference lands on the receipt |
| `SAMPLE-RS-NEG-B1` / `-B2` | backdated | **before** the shipment | `Repost Item Valuation` → the shipment's cost is genuinely rewritten |

🔴 Both need the Delivery Note **inserted before** the receipt, whatever the dates say — insert the
receipt first and there is stock on hand, so neither behaviour happens. That is what `applyLast` on
the receipt spec is for, and the seeder applies those rows in a final pass. Each item's
`valuation_rate` is deliberately **wrong** (above cost for F1/B1, below for F2/B2) so the correction
has a visible sign.

Every resale SKU sets `Item.allow_negative_stock`, per item rather than site-wide: `Stock
Settings.allow_negative_stock` is 5zorro's call and is the real answer to "all items default to allow
negative", and a 2,700-document seed should not fail over one date landing out of order.

### Insert order is load-bearing

`buildResellingCorpus` returns documents **sorted oldest-first within each kind**, and
`tests/reselling-corpus.test.js` asserts it. Inserting a stock movement dated earlier than one
already on file makes ERPNext queue a `Repost Item Valuation`; emit these out of order and a year of
history reposts itself thousands of times. The first version of the sort got this wrong — comparing
across kinds by returning 0 made the comparator non-transitive — and the test caught it.

## Link graph (summary)

| Doc | From source | From nothing | Leftover open sources |
|-----|-------------|--------------|------------------------|
| SO | 15 ← Quotation | 10 | Quotation 15–24 unconverted |
| SI | 12 ← SO | 13 | SO 12–24 uninvoiced |
| PR | 12 ← PO | 13 (NIC) | |
| PI | 8 ← PR, 8 ← PO | 9 | PO 20–24 open (no PR/PI) |
| DN | 1 ← SO (`BT-DN`) | 3 (costing) | — |
| PE | 4, all inside fixtures | — | — |

Counts above are the **rotation**; the named fixtures add to them. `CHAIN_FIXTURE_EXTRA_COUNTS` in
`corpus-plan.js` declares exactly how many, so adding a fixture forces the number to be stated.

🔴 **Apply order changed 2026-09-26:** `sales_invoice` now runs **after** `delivery_note`, because
the traced chain invoices a shipment. Every other invoice still sources a Sales Order, which comes
earlier either way.

Every 4th PO also sets `sales_order` on lines (SO picker on PO).

**T0 AP fixtures (v2 tag, after `--reset`):**

| Plan key | OI | Role |
|----------|-----|------|
| `PO-MN` / `PR-MN` | OI-149, OI-102 | Same vendor; partial IR; **unbilled** — Bill source modal PO+PR |
| `PO-PP` / `PR-PP` | OI-153 | PO + full IR; **manual PE Pay $120** against PO before Bill (auto-seed best-effort) |
| `PO-LB` | OI-154, OI-121 | Logbook title **TO-5599** (Find by title, not ERP name) |

Paper sources **DF-14…DF-16** in `dogfood-ap-sources.js` match these sandbox rows.

**OI-131 picker fixtures:** `SAMPLE Vendor Idle` (one submitted PO older than the 60-day window) and `SAMPLE Vendor Never` (no PO). Not used in the create-from-source rotation. Re-seed to pick them in the Doc vendor dropdown.

## Human dogfood source pack (vendor paper → type into Doc)

ERP seed fills the **database**. For **data-entry dogfood** you also want paper-like
sources (PO ack / packing list / vendor invoice) that do **not** all share one online
template.

```bash
# HTML (open in browser → Print → Save as PDF)
npm run dogfood:ap-sources

# Or generate PDFs with Playwright Chromium
npm run dogfood:ap-sources:pdf
```

Output: `ops/sample-data/dogfood-sources/generated/` (gitignored — one `.html` and one `.pdf` per
scenario, plus a generated `README.md` index). Catalogue SSoT:
`src/sample-data/dogfood-ap-sources.js`. This path does **not** post to MariaDB.

### The catalogue is the list of edge cases we claim to handle

Unit tests prove the pure logic; this pack proves the **surface** — a person entering real-looking
paper into the real UI, which is the only thing that catches a button wired to nothing. Adding a
scenario here is how an edge case gets *formalized* rather than remembered.

Every entry carries four things, and `tests/dogfood-ap-sources.test.js` holds the catalogue to them:

| Field | Answers |
|---|---|
| `flow` | which side of the business — `ap` (money out) or `ar` (money in) |
| `target` | the ERPNext doctype the paper is typed **into** (derived from `kind`) |
| `scenario` | the edge case, in one line |
| `expect` | what proves it worked, or the trap to watch for |

`expect` is optional only because the original 20 scenarios predate it; the generated index prints
how many are still missing one, and a scenario with no pass/fail condition is a suggestion rather
than a test. Fill it in as each is dogfooded.

Both the generated index and each PDF's banner are built from those fields, so the catalogue and
the paper cannot drift apart.

**Money-in paper (AR).** `DF-18`–`DF-20` are the sales side: a customer RFQ → **Quotation**, a
customer PO → **Sales Order**, and a shipping notice → a partial **Sales Invoice**. `DF-20` depends
on `DF-19` being entered first, and says so.

**`DF-17` — the double-payment trap P1 creates.** Cancelling a bill *detaches* its payments on this
site, so a void-and-amend leaves the payment submitted-but-unallocated while the amended bill reads
Unpaid — and the vendor's statement then chases money you already sent. Vanilla's fix is
**Accounts → Payment Reconciliation**; there is no automatic re-link.

**OI-132 Import lines:** `DF-13` also emits `DF-13_purchase_order_import_paste.tsv` /
`.csv` — messy 11-column vendor export (2 junk header rows). Use **Import lines…** on
PO/Bill: ignore first 2 rows; map SKU, Vendor note (append), Qty, Extended; ignore the rest.
See generated `*_import_README.md` beside the paste files.
