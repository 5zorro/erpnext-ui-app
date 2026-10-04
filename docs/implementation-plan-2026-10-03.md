# Implementation plan — 2026-10-03

**Tranche:** The trace — one set of document links under four views (lifecycle table, statement,
bowtie, Gantt), from the mockup `docs/mockups/bowtie-trace.html`. Plus a proposal for the
**coverage map** 5zorro asked for, so a change says which tests and which dogfood papers it touches.

**Runs alongside** `implementation-plan-2026-09-26.md` (built, being dogfooded), `-09-16` (built,
dogfood residuals), `-09-08` (superseded) and the parked `-09-21`. Stages 1–2 are **new files
only** (`src/trace-*.js`, `src/payment-timeline.js`, `ops/trace/`, tests) and one catalogue addition
(DF-25 papers) — nothing another plan is editing.

**Museum OIs in play:** OI-041 (AP bowtie — widened 2026-09-28 into this) · OI-065 (sales side) ·
OI-108 (schema research, superseded by `src/trace-links.js`).

> **Status 2026-10-03:** stages **1, 2 and C built** (pure logic + readers + the coverage map; `npm test` green). Every
> question the trace asks was proven against the live site, read-only (144 of 144 accepted, including the charge and receipt-voucher fields). The
> pages (stages 3–6) are not built: they need 5zorro's data to be checked, and stage 4 edits the
> Find page the 09-26 plan built, which is still being dogfooded. Paper DF-25a…i is in the pack, so
> the data can be typed before the pages exist.

---

## How to handle cross-architecture dogfood (copy into every new dated plan)

> **Template for future plans:** keep this section near the top of every
> `docs/implementation-plan-YYYY-MM-DD.md`. It is process SSoT for the *working* tranche — not for
> museum `open_items.md` (that inbox stays long-lived discovery).

Cross-surface dogfood (Bill + PO + IR + chrome/nav in one message) is hard to triage when
treated as one blob. Prefer **error classes / architecture families**, not a single mega-diff.

### Intake (before code)

1. Sort 5zorro feedback into **architecture families**.
2. Log under **Dogfood residuals** below. **Do not** reopen Done batches from prior plans.
3. **Do not** dump mid-workflow triage into museum `open_items.md`.
4. Prefer class language in residual rows.

### Execute (one family per slice)

1. Gather context for **one** family only.
2. Surgical fix + sibling/variant check.
3. **Self-critique** (class fixed vs symptom patched).
4. Unit tests for pure logic + `npm test` green.
5. Checkpoint the residual row; then the next family.

### Closeout (before deleting this plan)

1. Append durable **decisions** via `~/agent-harness/scripts/append-decision.sh`.
2. Update museum **OI status** — set `done` or note what promoted.
3. **Delete** this dated plan; open a **new** dated plan for the next tranche.

---

## What is being built, in one picture

```
ERPNext documents ──(src/trace-query.js: fetch up and down from what is in focus)──▶ documents
        │
        ▼
src/trace-links.js — the link registry: which field on which document says "this came from that"
        │
        ▼
src/trace-graph.js — line-to-line links, whose story a line belongs to, landed cost, gaps
        │
        ├──▶ src/trace-lifecycle.js — one row per item, by stage and by document (Lifecycle page)
        ├──▶ src/payment-timeline.js — planned checks, today, checks written (Statement, Payments)
        └──▶ (stage 5/6) bowtie layout and Gantt rows — the mockup's geometry, made pure
```

The mockup's **Notes** tab is the agreed behaviour. The rounds that produced it (2026-09-28…30)
are summarised under *Decisions* below; the mockup itself stays in `docs/mockups/` as the picture.

## Decisions taken (5zorro, 2026-09-28…30) — do not re-litigate

1. **One set of links, several views.** A new kind of link (Material Request, drop ship, an
   advance) is a row in `src/trace-links.js`, never a new drawing rule.
2. **Links are line to line**, by ERPNext's own row ids (`po_detail`, `pr_detail`,
   `sales_order_item`, `so_detail`, …). Item code is only the fallback for a line that names a
   document but no line on it — and "no such item on it" is the mismatch the trace exists to catch.
3. **A line belongs to a story only through its own link.** Stock raised on a Material Request
   that rides on a customer's PO, receipt and bill never joins that customer's margin.
4. **Landed cost** is the line plus its share of the charges (5zorro: "every item can have the
   various expenses allocated to it — default allocation by $ weight"). See *What ERPNext already
   does* 1: ERPNext already does exactly this for valuation charges, so the shell **reads** it.
   **Scope (5zorro 2026-10-03):** *"most of the time I want accurate landed cost and landed cost for
   an item is scoped to the actual costs named on one bill… Occasionally, a purchase order will say
   '100 frt for this whole bill' and then there will be 5 bills against the PO and only 1 will have
   frt of 100. That allocation should be handled."* So the **default is per bill** (ERPNext's own
   allocation, built), and a **PO-wide** cost is spread by a **Landed Cost Voucher** over the PO's
   receipts (*What ERPNext already does* 7; stage L).
5. **Gross margin** = what the customer was invoiced − the landed cost of that many, net of
   credits. Only a Sales Order's story has a margin; stock bought ahead is "stock", not a loss.
6. **Dates:** each document has a *paper* date (bill: the vendor's invoice date; payment: the
   check date; receipt: the day the goods arrived) and a *posted* date. Ageing is by the vendor's
   invoice date. "Who submitted" is shown as the creator for now (right ~9 in 10).
7. **Lifecycle columns are documents in date order** (paper date, else posting; ties: a source
   before what came from it, then by name), with link arcs over the header; a backwards link (a
   document dated before its source) is flagged. "By stage" stays as a toggle.
8. **Statement = Find Bills with quick filters** (Bills on by default; credits, receipts not billed,
   open POs one click each; all on = the vendor statement, linked from Home). Receipts not billed sit
   with the bills, indented. **Focus: Bills / Payments.** Payments focus is one timeline, newest
   first: planned checks (the Pay Outstanding run rule), today, checks written with **cleared / not
   cleared — in the mail?** and the part of each bill each check paid. One **No.** column on the
   Their / Our toggle.
9. **Bowtie:** Buy lane over Sell lane; **Payment and Invoice columns locked on the right**; the
   rest packs right; a PO and its Sales Order share a column (left side to left side). Credits sit
   in the Payment column. Every ribbon end is centred on its row — **no braces** — checked on the
   **painted** pixels after every draw. Item rows are fixed-height strips (a table cell's height is
   only a minimum). A payment's other bills are one "Other payables" box until it is in focus.
10. **Gantt:** each row washed up to its paper date, bordered on to its posted date.
11. **Charges in no item's cost** (5zorro 2026-10-03): *"the trace should agree with the books, but
    an 'info' emoji with a link to how to change the 'total only' should be available. I think it
    would be common for a user to want it to be spread but confused as to why it isn't."* Built:
    `chargeAdvisories` — an ⓘ per Total-only charge (and per valuation share left on a non-stock
    line) saying why, the setting that would spread it, and the bill to open (Edit → void and amend
    on a submitted one).
12. **Dates** (5zorro 2026-10-03): prefer the received / reference date, else the posting date —
    ERPNext's own model. As built: a receipt's `posting_date` *is* its received date (backdatable),
    keyed in = `creation`; a payment's paper date is `reference_date` (the check date), else
    `posting_date`. Who submitted, and when, come later from the version history (one query).
13. **Open credits** (5zorro 2026-10-03): *"should come off the check where the linked bill is. If
    there is no linked bill then they should come off the next planned check."* Built: a credit's
    `return_against` bill decides its planned check; a bill already paid, or none, means the next.

## What ERPNext already does (read from the v16 source and this instance, 2026-10-03)

1. 🔴 **Charges are already spread by dollar share.** `buying_controller.update_valuation_rate`
   splits every charge whose category is **Valuation** or **Valuation and Total** across the lines
   by net amount and stores each line's share in `item_tax_amount` (rounding remainder on the last
   line). With *Allocate full amount to stock items* ticked, only stock lines share it; otherwise a
   non-stock line's share is computed but **not** put into cost. A **Total**-only charge is added to
   what the vendor is owed and is in **no** line's cost. So: landed = `base_net_amount` +
   `item_tax_amount` + `landed_cost_voucher_amount` (`landedLine`), and the rest is reported beside
   it (`unallocatedCharges`), never quietly spread — see open question 1.
2. **A list query can filter on a child table's field** — `/api/resource/Purchase Invoice` with
   `filters=[["Purchase Invoice Item","purchase_receipt","=",X]]` returns the bills made from
   receipt X. That is how the trace finds a document's children over HTTP.
3. **A misspelt field is refused** ("Field not permitted in query") even when nothing matches — so
   `ops/trace/probe-trace-queries.js` proves every field by asking about a name that cannot exist.
   It found one wrong assumption: a **Material Request line has no `base_net_amount`**.
4. **`clearance_date`** on a Payment Entry is set when the bank statement is reconciled; empty
   means the bank has not seen the check.
5. **A credit with `return_against`** keeps its own open balance by default
   (`update_outstanding_for_self` = 1) until a payment or reconciliation uses it. Its lines point at
   the lines they reverse with `purchase_invoice_item` / `sales_invoice_item`.
7. 🔴 **A PO-wide cost has its own ERPNext tool: the Landed Cost Voucher** (v16 source,
   `stock/doctype/landed_cost_voucher`). It lists **receipts** to spread over (Purchase Receipts, or
   bills that updated stock themselves — `validate_receipt_documents` refuses a bill without
   `update_stock`), takes the cost either as its own charge rows or **claimed from a vendor bill**
   (`vendor_invoices` → `Landed Cost Vendor Invoice`: a submitted bill with a **non-stock** line,
   not a return, not stock-updating; claiming writes `claimed_landed_cost_amount` on that bill so it
   cannot be claimed twice), spreads it by **Amount**, **Qty** or by hand, and writes each receipt
   line's share to `landed_cost_voucher_amount` (then reposts the stock value). The share lands on
   the **receipt's** line, so a bill line made from that receipt carries its part
   (`landedInTrace`, built — proportional to quantity when a bill takes only part of the line).
   Two traps a "spread this over the PO" button must avoid: the freight on the bill must be a
   **non-stock line** booked to the valuation expense account, not a *Valuation* charge row (that
   would already be in that bill's lines' cost — counted twice); and a receipt that does not exist
   yet cannot take a share (a second voucher later, or wait for the last receipt).
8. **Other links in the schema**, not yet in the registry (each a row when wanted): drop ship's
   back-links (Sales Order / Sales Invoice / Delivery Note Item `purchase_order` — the PO line's
   `sales_order` already carries the link), advances (a Payment Entry Reference to a PO or Sales
   Order), Supplier Quotation, Blanket Order, Pick List, Production Plan, inter-company references,
   Journal Entries as payments, Landed Cost Vouchers.

## What the real data showed (the seeded chain, read back out of a copy of the 09-28 backup)

`ops/trace/export-trace-fixture.js` runs the real `fetchTrace` walk against a **restored copy** of
the backup (SQL standing in for HTTP, answering the same child-table filters) and wrote
`tests/fixtures/trace-seeded-chain.json`; `tests/trace-real-chain.test.js` reads it.

- The seeded chain's margin is exactly **100.00**, as `ops/sample-data/README.md` promises, and the
  walk found both sides on its own — Delivery Note leg included.
- 🔴 **The seed links POs to Sales Orders by document only** — `sales_order` set, `sales_order_item`
  empty — where ERPNext's own *Create › Purchase Order* fills both. The trace copes (matches by item
  and marks it ⓘ), but stage 7 should make the seed set the row id the way ERPNext does.
- **A real backwards link**: PUR-ORD-2026-00370 is dated Sep 8, the day before the Sales Order
  (Sep 9) it is linked to. The flag works on real documents.
- **Tax withholding is a deduction, not a charge.** The amended bill's Total / Deduct row lowers
  what the vendor is paid; `unallocatedCharges` reports it as `deducted`, apart from the charges
  that are in no line's cost.
- **No seeded payment has a clearance date**, so every check reads "not cleared". Stage 7 should
  clear some.

## Stages

| Stage | What | Proof | Paper |
|---|---|---|---|
| **1 — built** | `src/trace-links.js` (registry, paper / posted dates), `src/trace-graph.js` (line links, `reachFrom`, landed, unallocated charges and deductions, paid share, cost of a Sales Order line, backwards links, date order), `src/trace-lifecycle.js` (stories, by stage + by document, marks, margin), `src/payment-timeline.js` (planned checks on the run rule, checks written, clearance) | `tests/trace-graph`, `trace-lifecycle`, `payment-timeline`, `trace-real-chain` (the seeded chain read back out of the 09-28 backup) | — |
| **2 — built** | `src/trace-query.js` — the questions (`downstreamQueries`, `upstreamKeys`) and `fetchTrace` (up from what is in focus, down from it, bounded at 80 documents, submitted only, a payment's other bills not walked unless it is in focus) | `tests/trace-query` (a fake ERPNext answering the same filters); `ops/trace/probe-trace-queries.js` against the live site: **144/144** | — |
| 3 | **Lifecycle page**: a shell page (`shell-surfaces.js` row, invariant 6) reached from a Doc skin's ⋈ / ☰ door; IPC `trace-fetch` in `main.js` calls `fetchTrace` with `frappeResourceGetDoc` / `frappeResourceGetList` over `session.fetch`; date-order arcs and header highlight from the mockup | layer-3 smoke + 5zorro | DF-25a…i |
| 4 | **Statement** on the Find page: quick filters (Bills default), receipts-not-billed indented, Focus Bills / Payments using `paymentTimeline` with the Pay Outstanding check-run setting and `derivePaymentDate` | layer-3 smoke + 5zorro. 🔴 Waits for 5zorro's 09-26 Find-page dogfood — it edits `find-doc.html` | DF-25f, DF-25g |
| 5 | **Bowtie**: lanes, locked right columns, item-row ribbons; the geometry (layout, ribbon ends) moved into `src/` so it is unit-tested; the painted-pixel check kept as a dev assertion | painted-pixel check + 5zorro | DF-25c, DF-25i |
| 6 | **Gantt** over the same slice | 5zorro | DF-25e |
| 7 | **Seed**: add the trace chain's edge cases to `corpus-plan.js` (2+ POs into one bill, a Material Request line, NIC + valuation charges, a paper-date lag, a mismatch, a part payment, an uncleared check, a credit); set `sales_order_item` on PO lines the way ERPNext does; give most payments a clearance date | `seed:sample` on a sandbox, only after 5zorro's blank-site round | — |
| L — **parked** | **PO-wide freight** — parked 2026-10-03 by 5zorro; see *PO-wide freight (parked)* below. The trace already reads any Landed Cost Voucher a backward-looking costing process makes (`landedInTrace`) | — | — |
| **C — built** | **Coverage map** — `src/architecture-families.js`, `scripts/dogfood-for-change.js` (`npm run dogfood:for-change [base]`), `touches` on papers | `tests/architecture-families.test.js` (the tree, the papers, the planner) | every paper tagged |

## Open questions for 5zorro

(1–3 answered 2026-10-03 — decisions 11–13 above.)

(4, the PO-wide freight, is parked — next section.)

## PO-wide freight (parked 2026-10-03)

5zorro confirmed the model, then parked it: *"If we can figure out a way to make the user have zero
friction and not leave artifacts in the accounting software for partial receipts or changes in
freight from expected to actual then this is something that would be a clear value add. I don't want
to build it right now because it will muddy something for a 'nice to have, but ultimately might
break everything' kind of feature."* And: *"if the user has additional friction — has to allocate
against stuff that the user doesn't see directly — then I think the cost is not worth the benefit.
I would leave it to whatever backwards-looking landed cost process instead of the forward-looking
'analyse this transaction in progress' report we are looking at."*

**The model, as agreed** (so a later attempt starts here, not from scratch):

- **The PO is the source of truth for its freight** until its last receipt is billed. Each bill made
  from the PO carries the share for the goods it bills (by amount): that share is a *Valuation*
  charge, spread over the bill's lines into landed cost.
- **Freight billed up front** (all of it on the first bill): the part for goods not yet received is
  booked to a **Prepaid Freight Expense** account (a *Total*-only charge, in no item's cost). Every
  later bill from that PO then carries a **derecognition** of its share as part of its charges —
  its share moved out of Prepaid Freight Expense and into its items' cost — netting to zero against
  the vendor's total. **Freight charged as billed** (a share on each bill) needs no derecognition.
- **Facts it rests on** (v16): ERPNext copies a PO's charge table onto every bill made from it, in
  full (`reset_value`, no proration); a Landed Cost Voucher spreads over receipts only, and can claim
  a cost from a vendor bill that has a non-stock line.

**Not covered yet — the next edge case when this resumes:** a **separate freight vendor**. The
freight arrives on a different vendor's bill and has to be allocated to the goods of another
vendor's PO — and possibly to the Sales Order those goods were bought for.

**The bar for resuming:** zero extra steps for the clerk, nothing to allocate against documents the
clerk does not see, and no leftover entries in the books for partial receipts or for freight that
turns out different from expected. Until then the trace stays forward-looking and agrees with the
books: per-bill landed cost (built), an ⓘ for charges in no item's cost (built), and any Landed Cost
Voucher a backward-looking costing process makes is read on the receipt line (built).

## Coverage map (stage C) — built 2026-10-03

5zorro, 2026-10-03: *"Perhaps there needs to be a formalized 'this part of the unit tests refer to
this part of the architecture' and 'this part of the dogfood generated sources should touch this
architecture.' Right now I don't want to have to dogfood the whole entire app except for when I do
some possibly breaking changes."*

Today the answers are spread over HANDOFF's *Unit ↔ e2e coverage matrix* (hand-kept, already
missing most modules), the 09-26 plan's paper → coverage table, and each paper's free-text
`checks`. Proposal — one registry, kept honest by a test:

- **`src/architecture-families.js`** — one row per family (navigation spine, Find pages, Bill skin,
  PO / Item Receipt skins, A/R skins, Pay Outstanding, printing, Papers, trace, sample data, …):
  its `src/` modules (by name or prefix), its unit tests, its e2e specs.
- **`touches: [...]`** on every dogfood paper — the families it exercises. DF-25a…i would be the
  first tagged (`trace`, `find`, `a-r-skins`, `bill-skin`, `pay-outstanding`).
- **`tests/architecture-families.test.js`** fails when a `src/` module belongs to no family, a
  listed test or spec does not exist, or a paper names an unknown family — so the map cannot rot
  the way the HANDOFF matrix has.
- **`npm run dogfood:for-change [base]`** — reads `git diff --name-only base…HEAD`, maps changed
  files to families, and prints the papers to type (and the e2e specs to run). A change to
  `src/payment-timeline.js` prints DF-25f/g, not the whole pack; a change to `src/nav-*.js` prints
  every paper that touches the navigation spine — the "possibly breaking" case.
- HANDOFF's coverage matrix becomes a pointer to the registry instead of a second copy.

**As built:** 21 families over all 174 `src/` modules, every Electron file and all 15 e2e specs;
unit tests are worked out from imports (plus an explicit `// @covers path …` for a test that names
its files indirectly — two did); papers get families from their `kind` plus `touches`
(`PAPER_KIND_FAMILIES`). A changed test is listed to run, never dogfooded; a changed fixture lists
the tests that read it. The run on this tranche's own changes printed three families — the trace,
the paper pack, repo process — and the DF-25 papers, not the whole pack. Families with no paper
say why (`noPaper`): printing, Papers and the calculator are the real gaps.

## Dogfood paper for this tranche

DF-25a…i (in `src/sample-data/dogfood-ap-sources.js`, `oi: "OI-041"`): one customer order
(LAKESIDE MARINE SUPPLY, CPO-55120) through both sides — Estimate → Sales Order → one PO with the
customer's lines, a line naming the order that is not on it, and warehouse stock from a Material
Request → two receipts, the second dated the day after the vendor's invoice → one bill with
freight (valuation, stock only), a fuel surcharge (Total only) and a NIC line → part payment by an
uncleared check → a credit for the mismatched item → the customer's invoice → their check. The
numbers are the test fixture's (`tests/fixtures/trace-chain.js`): bill 900.00, credit 45.00,
invoice 1,000.00, margin 315.39. Each paper's `checks` say what to look at now, and what to look
at "later, when the trace pages are built". Typing it now means stages 3–6 are proven on data
5zorro entered by hand, not only on the seed.

## Dogfood residuals

| Family | Residual | Status |
|---|---|---|
| — | (none yet — no trace page is built) | |
