# Implementation plan — Doc Pay skin: economic batching of outstanding Bills (OI-138 / OI-161)

> **Working plan (temporary).** `docs/implementation-plan-YYYY-MM-DD.md`
> When this tranche's durable facts live in HANDOFF / OI status / CHANGELOG, **delete this file**.
>
> **Started:** 2026-09-03 · **Does not supersede** `implementation-plan-2026-07-29.md` (Simplified /
> OI-086), which stays open in parallel. (Nav instrumentation `implementation-plan-2026-08-19.md`
> closed 2026-09-05 — spine folded into HANDOFF § Navigation spine.)
> **Repo:** `erpnext-ui-app` · **Museum:** `~/agent-harness/erpnext/doc-shell/open_items.md`
> **Primary OIs:** **OI-138** (Doc Pay skin: outstanding Bills grouped by vendor + payment date —
> brainstorm 2026-08-25) · **OI-161** (Payment batching economics: postage + daily interest vs due
> dates — discovery 2026-08-29). **Sibling context (not in scope, do not build):** OI-129 (list
> return/scroll — explicit no-build until Vanilla dogfood felt), OI-135 (Bill "already paid" JIT
> PE — shipping separately), OI-139 (applied-payments table on submitted Bill — shipping
> separately), OI-064 G (in-doc "Pay Bill" button — museum backlog, unbuilt).

---

## How to handle cross-architecture dogfood (copy into every new dated plan)

> **Template for future plans:** Keep this section near the top of every
> `docs/implementation-plan-YYYY-MM-DD.md`. It is process SSoT for the *working*
> tranche — not for museum `open_items.md` (that inbox stays long-lived discovery).

Cross-surface dogfood (Bill + PO + IR + chrome/nav in one message) strains the
LLM harness when treated as one blob. Prefer **error classes / architecture
families**, not a single mega-diff.

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
2. Update museum **OI status** (OI-138, OI-161) — set `done` or note what promoted.
3. **Delete** this dated plan; open a **new** dated plan for the next tranche.

---

## Goal (this tranche)

1. Close the **research gap** OI-161 named ("likely not first-class for this math in Vanilla") with
   a concrete Vanilla inventory — done below in **Packet 0**, so Packet 1+ builds on facts, not a
   guess.
2. Ship a **pure, tested** economics helper (`paymentBatchEconomics`) that takes outstanding-Bill
   data + a cost model and returns suggested batches with an auditable rationale string — no ERP
   writes.
3. Ship a **Doc Pay skin v1**: outstanding Purchase Invoices grouped by vendor + due date, with a
   suggested-batch chip (expand to show the math). **Suggestion only — clerk still drives the
   actual pay action** (existing Vanilla Payment Entry / `Pay Bill` escape hatch); no auto-submit.
4. Leave the **write path** (Payment Entry / Payment Order creation from a chosen batch) as a named
   stretch packet, not required to close this tranche.

> **Gate (5zorro 2026-09-03):** none of this is reviewable against real data until sample data
> exists that actually exercises batching — "a vendor with a bill with 1 payment due every day for
> 3 months." **Packet G** below builds that fixture and is a **prerequisite to dogfooding** Packets
> 1–4 (pure unit tests can proceed in parallel against hand-built fixtures; the live Doc Pay skin
> cannot be judged without it).

Architecture unchanged: **Electron shell → HTTP → unmodified ERPNext**. This tranche adds one pure
module and one new Doc-skin surface; no new ERP-side code (Clean Core — we call existing whitelisted
methods only, never patch `apps/frappe` / `apps/erpnext`).

```mermaid
flowchart LR
  subgraph pure ["src/ — pure, unit-tested"]
    Fetch["outstanding-bills.js\n(normalize AP rows)"]
    Cal["bank-business-days.js\n(federal holidays + blur, Packet 1b)"]
    Econ["payment-batch-economics.js\n(suggest groups + rationale)"]
    Prefs["payment-batch-prefs.js\n(APR / postage / per-check SSoT)"]
  end
  subgraph shell ["Electron"]
    Page["electron/pay-outstanding.html\nsurfaceMode: pay-outstanding (in-window)\nHome tile trigger — shipped"]
    PEForm["Same content, anchored to\nPayment Entry doc skin instead\n(Packet 4b — refined, not built)"]
  end
  ERP["ERPNext HTTP API\n(existing whitelisted methods only)"]
  ERP -->|"query_report.run\nAccounts Payable"| Fetch
  Fetch --> Econ
  Cal --> Econ
  Prefs --> Econ
  Econ --> Page
  Page -.->|"Packet 4b: re-anchor + filter (have) + creation modal (new write, not built)"| PEForm
  PEForm -.->|"modal creates"| Write["Payment Entry\n(Packet 4b's modal — real write, not built)"]
```

---

## Packet 0 — Vanilla research (closes OI-161 bullet 5)

> Confirms/extends OI-161's "likely not first-class for this math in Vanilla" hypothesis with
> concrete schema/controller reads (`docker exec frappe_docker-backend-1` browse, 2026-09-03).

| Vanilla mechanism | What it actually does | Gap vs OI-161's economic-batching ask |
|---|---|---|
| **Accounts Payable** report (`erpnext/accounts/report/accounts_payable/`) | Read-only ledger: outstanding Purchase Invoices per supplier, ageing buckets, group-by voucher/party/terms. Shares an engine (`ReceivablePayableReport`) with Accounts Receivable. | No selection/action affordance; no cost model; you read it, then hand-build Payment Entries elsewhere. This is our **data source**, not a suggestion engine. |
| **Payment Schedule** (child table on PI, `payment_schedule` doctype) | Per-installment `due_date`, `discount_date`, `discount_type`, `discount`, `discounted_amount`, `outstanding`. | Early-payment discount data **exists** but nothing surfaces "pay these N by Friday to capture $X" anywhere in the UI. |
| **Payment Order** (`erpnext/accounts/doctype/payment_order/`) | The closest thing to a "check run / ACH run / wire run": create against a `Company Bank Account`, then **manually** pick already-created, already-submitted `Payment Entry` or `Payment Request` rows via a `map_current_doc` picker (filtered by bank account + `payment_order_status = Initiated`). Submitting flips referenced docs to `Payment Ordered`. Rows carry `supplier`, `amount`, `mode_of_payment`, `bank_account` — grouping-by-mode is a **native field**, but nothing suggests *which* payments belong in a run. | Batching mechanism only, no suggestion logic, and it operates **downstream** of Payment Entry — clerk must already have created individual PEs before a run can be assembled. |
| **Mode of Payment** (`type` = `Cash \| Bank \| General \| Phone`) | No structured ACH/Wire/Check distinction — that's just whatever the company names the Mode of Payment record. | Fine to build on (Payment Order Reference already keys off `mode_of_payment`), but confirms there's no built-in per-channel cost (postage/fee) field — OI-161's cost model has nowhere to live in Vanilla. |
| **Bank Account** / **Bank** doctypes | `Bank Account`: `iban`, `bank_account_no`, `branch_code`. `Bank`: `swift_number`. | No ACH routing-number field distinct from account no.; international-wire SWIFT lives one level up on `Bank`. Adequate for *display*, not a gap this tranche needs to close. |
| **Payment Reconciliation** / **Process Payment Reconciliation** | Matches *already-existing* unallocated payments/JEs against invoices for one party. | Different job entirely (bookkeeping cleanup, not forward-looking "what should I pay"). Not a building block here. |
| Accounts **Payments** dashboard (workspace) | 4 number cards (Total Outgoing/Incoming Bills/Payments) + AR/AP ageing charts + bank balance. | Informational only, no drill-to-batch. Not a building block here. |

**Conclusion:** OI-161's hypothesis holds. Nothing in Vanilla computes "combine these bills into one
payment because postage saved > float lost." The **Accounts Payable report** is the right read-only
data source (reuse its engine over HTTP rather than re-deriving ageing/currency math ourselves —
Clean Core: call the existing report, don't reimplement it). Everything past that point — grouping,
economics, suggestion — is new product surface, matching what 5zorro asked to research.

---

## Baseline (honest — 2026-09-03)

| Area | State |
|---|---|
| Doc Pay skin | **Not started.** `src/home-tiles.js` has `pay-bills` / `checks` tiles that deep-link straight to a blank `/app/payment-entry/new` — no list, no suggestions. |
| Bill due-date / payment-schedule plumbing | **Exists** — `src/bill-due-date.js`, `src/bill-payment-schedule.js` already read/write `payment_schedule` rows (`due_date`, multi-installment sync) on the single-Bill Doc skin. New work should reuse these shapes, not invent a second `due_date` convention. |
| Bill "already paid" (OI-135) | **Shipping separately** — JIT Payment Entry on Submit for card-at-entry Bills. Orthogonal: that's Bills paid *at entry*; this tranche is Bills **already submitted and outstanding**. |
| Applied-payments table (OI-139) | **Shipping separately** — read-only PE list on a submitted Bill. Orthogonal (single-Bill view vs cross-vendor batch view). |
| Cost-model prefs (APR / postage / per-check) | **Do not exist anywhere** — new SSoT, this tranche. |
| Multi-installment sample data | **Does not exist** — `ops/sample-data/seed_corpus.py::_normalize_pi_dates` unconditionally clears `payment_schedule` and flattens every seeded Bill to a single 30-day due date. Zero bills in the sandbox today have more than one due date. **Packet G** fixes this for one dedicated fixture. |
| Doc-skin Payment Entry | **Does not exist** — `DOC_SKIN_INDEX` (`src/lens-context.js`) only has `workflow-home` / `bill` / `po` / `receipt`. Payment Entry is Vanilla-only today (`/app/payment-entry/new`), and the doctype is shared by both AP (`payment_type: "Pay"`) and AR (`"Receive"`) flows. 5zorro decided (2026-09-04): **two entry points this tranche — Home tile AND a new Doc-skin Payment Entry form, AP only.** Rejected as anchors: the **Payments workspace** (bleeds AR ageing/reports into what should be an AP-only tool; AR gets its own doc skin later) and the **Payment Entry list/"Find" view** (it's an audit tool over already-created payments, not a bill-selection decision surface). See Packet 4 / new Packet 4b. |

---

## Packet G — Sample-data gate (blocking; 5zorro 2026-09-03)

> Do this **before** Packet 1's IPC wiring is worth dogfooding. Packet 1–3's unit tests can use
> hand-built fixtures and don't strictly need this, but nobody can look at the real Doc Pay skin
> and judge the batching math without it — 5zorro named this the primary gate.

### Business rule

"A vendor with a bill with 1 payment due every day for 3 months" — one Purchase Invoice, one
`payment_schedule` row per calendar day, ~90 rows, so the suggested-batch output (weekly-ish
groups) is visually obvious against a flat list of 90 individual due dates.

### Why today's seed can't show this

`ops/sample-data/seed_corpus.py::_normalize_pi_dates` runs on **every** seeded Purchase Invoice:

```python
doc.due_date = add_days(getdate(posting), 30)
if hasattr(doc, "payment_schedule"):
    doc.set("payment_schedule", [])
```

So all ~25 existing sample Bills get a single flat 30-day due date and an **empty**
`payment_schedule`. This must change for **one** new fixture without touching the other seeded
Bills — other OIs' dogfood already depends on the existing 25 (OI-054 bill-ref, OI-131 vendor
activity ranking, the OI-149/153/154 AP fixtures) staying exactly as they are.

### Confirmed against the ERP controller (2026-09-03 read of `accounts_controller.py`)

- `set_payment_schedule()` only auto-generates rows `if not self.get("payment_schedule")` — if we
  populate the child table **before** `doc.insert()`, our rows are left alone.
- `validate_payment_schedule_dates()` **throws on duplicate `due_date`s** within one doc's schedule
  — daily rows are fine (each is a distinct calendar day) but confirms this fixture couldn't have
  used, say, 90 rows all due "in 30 days."
- `validate_payment_schedule_amount()` requires `payment_schedule` rows' `payment_amount` to sum to
  `grand_total` (within field precision) — design the fixture so this is exact, not rounded.

### Design

Two fixtures, same shape, different scale — 5zorro wants small-dollar and larger-dollar runs to
both be dogfoodable (a flat $0.78+$0.05 fee matters a lot at $50/day and should matter ~nothing at
$2,500/day; seeing both side by side in one Accounts Payable pull is itself a check on Packet 2's
economics, not just a UI fixture).

| Piece | Small (`SUP-DAILY`) | Large (`SUP-DAILY-LG`) |
|---|---|---|
| Supplier | `SUP-DAILY` — "SAMPLE Vendor Daily Payrun." | `SUP-DAILY-LG` — "SAMPLE Vendor Daily Payrun (Large)." |
| One Purchase Invoice | `qty: 90`, `rate: 50.00` → `grand_total = 4500.00` exactly. | `qty: 90`, `rate: 2500.00` → `grand_total = 225000.00` exactly. |
| `payment_schedule` | 90 rows, row *i*: `due_date = posting_date + i days`, `payment_amount = outstanding = 50.00`. | Same cadence, `payment_amount = outstanding = 2500.00`. |
| Expected Packet 2 behavior | Batches into ~13 weekly groups (fee savings beat float cost at this scale). | Should **not** batch — float cost on $2,500/day swamps a $0.83 fee even at `groupWindowDays: 7`. Confirms the economics helper isn't just batching everything, it's actually pricing the tradeoff. |

Both fixtures: `invoice_portion = 0` (amounts set directly, no percentage math); header `due_date` =
**last** schedule row's date (`bill-payment-schedule.js::headerDueDateFromPaymentSchedule` "last row
wins" convention — reuse, don't invent a second rule); must land `docstatus=1` so the full balance
stays outstanding across all 90 rows (Accounts Payable report only sees submitted invoices).

**Parked, not this packet** (5zorro 2026-09-05): 30 bills on one check (stress-tests Packet 2's
per-group bill count, not its per-vendor scale) and applying credits in lieu of payment (a different
data shape — credit notes / negative outstanding, not another `payment_schedule` row). Both are
real Packet-2-adjacent stress tests once the basics are proven; do not build either into Packet G.

Optional, propose separately: 2–3 of either fixture's 90 rows also carrying `discount_type` /
`discount` / `discount_date`, so Packet 2's discount-capture branch has one live fixture too, not
only unit-test fixtures. **Confirm with 5zorro before adding** — the daily shape alone already
answers this packet's ask; don't grow scope unasked.

### Code changes

| File | Change |
|---|---|
| `src/sample-data/corpus-plan.js` | New `appendPaymentBatchFixture(docs, ctx)`, called alongside `appendApDogfoodFixtures`. Builds **both** `SUP-DAILY` and `SUP-DAILY-LG` supplier + PI specs, each carrying an explicit `paymentSchedule: [{ dueDate, amount }, …]` array and a `dogfoodScenario` (`"oi161-daily-payrun-small"` / `"-large"`). Bump `SAMPLE_TAG` (`ui-app-sample-v2` → `v3`) — existing convention: shape change ⇒ new tag, `--reset` drops the old one. |
| `ops/sample-data/seed_corpus.py` | In `_normalize_pi_dates` (or a guard just before it runs): if `spec.get("paymentSchedule")`, append those rows onto `doc.payment_schedule` and set `doc.due_date` to the last row's date **instead of** the existing wipe-and-flatten path. Every other Bill keeps today's behavior byte-for-byte. |
| `tests/corpus-plan.test.js` (existing suite) | Extend: plan includes both suppliers; each schedule has 90 rows on 90 consecutive distinct calendar days; `payment_amount` sum equals `grand_total` exactly for each. |

### Exit

`CONFIRM_SAMPLE_SEED=1 npm run seed:sample -- --reset` produces two submitted Purchase Invoices —
`SUP-DAILY` (90 × $50) and `SUP-DAILY-LG` (90 × $2,500) — each with 90 daily `payment_schedule` rows
and nothing paid. 5zorro can open the Accounts Payable report today (pre-Packet-1) and already see
180 distinct due-date rows across the two vendors; once Packet 1–2 land, this pair is what proves
the batching math scales correctly (small batches, large doesn't) on the real Doc Pay skin.

---

## Packet 1 — `src/outstanding-bills.js` (pure: normalize ERP rows)

### Business rule

The Doc Pay skin must show ERP truth, not a shell-side re-derivation of ageing/outstanding math.
Fetch via the **existing Accounts Payable report** (`frappe.desk.query_report.run` with
`report_name=Accounts Payable`, `filters={company, party_type: "Supplier"}`) over HTTP — same engine
Vanilla's report page uses. This module's job is only to **normalize** that report's row shape (and,
per-row, the linked Purchase Invoice's `payment_schedule` for discount dates) into a flat shape the
economics helper can consume.

### Shape

```js
/**
 * @typedef {{
 *   invoice: string,          // Purchase Invoice name (report's voucher_no)
 *   supplier: string,         // report's party (shared AR/AP engine field name)
 *   postingDate: string,      // ISO
 *   dueDate: string,          // ISO — header due_date (last installment; bill-payment-schedule.js convention)
 *   invoiced: number,         // bill's own grand total (report's invoiced) — needed for % discount math, not just display
 *   outstanding: number,      // party currency
 *   currency: string,
 *   discountDate?: string,    // ISO — earliest payment_schedule row with a discount, if any
 *   discountAmount?: number,  // absolute $ saved if paid by discountDate
 * }} OutstandingBillRow
 */
```

Captured a real row from the live sandbox (`bench execute frappe.desk.query_report.run`, `SUP-DAILY`,
2026-09-05) to confirm the report's actual field names rather than guessing — `voucher_no`, `party`,
`posting_date`, `due_date`, `invoiced`, `outstanding`, `currency`, `age`, plus ageing `range0..range5`
this packet doesn't need. Matches the typedef above field-for-field.

### How

| Piece | Job |
|---|---|
| `normalizeAccountsPayableRow(reportRow)` | Map report column names → `OutstandingBillRow` (pure; tested against the captured sample above). |
| `attachDiscountWindow(row, paymentScheduleRows)` | Pure merge: earliest-`discount_date` schedule row with `discount_type`/`discount` set → `discountDate`/`discountAmount`. **Found while implementing, not in the original sketch:** `discount_type: "Percentage"` computes off the bill's **`invoiced`/grand total**, not the schedule row's own `payment_amount` — confirmed against ERPNext's own `payment_entry.py::apply_early_payment_discount` (`discount_amount = grand_total * discount/100`). A naive `payment_amount * discount/100` would be wrong for any multi-installment bill (right by coincidence for single-installment ones, which is why this is easy to miss). `discount_type: "Amount"` uses `discount` directly, no total needed. Reuses the same `payment_schedule` shape as `bill-payment-schedule.js` — do not invent a second convention. |
| IPC (electron layer, Packet 4) | `get-outstanding-bills`: report run + per-invoice `payment_schedule` fetch. **Not the single batched `get_list` originally planned** — found live (2026-09-05) that `frappe.client.get_list` on a child doctype strips every field but `name`. Fetches each invoice's full document via `frappe.client.get` instead (child table comes fully populated with the parent), concurrently via `Promise.all`, not sequentially. |
| `explodeInstallments(row, paymentScheduleRows)` | **Added 2026-09-05 — found by running Packet 2 against the real Packet G fixture, not anticipated in the original sketch.** The Accounts Payable report is invoice-level: one row per Purchase Invoice, header `due_date` (last installment), full remaining `outstanding`. Fed straight through, `SUP-DAILY`'s 90 daily installments collapsed to **one** $4,500 bill due 2026-10-20 — the fixture's entire point (90 distinct payable obligations to batch) was invisible to Packet 2. Any real multi-installment Bill has this same problem, not just the fixture. When ≥2 unpaid schedule rows carry **distinct** `due_date`s, this returns one `OutstandingBillRow` per unpaid installment (its own `due_date`, its own `outstanding`, its own `discountDate`/`discountAmount` computed from *that row's* `discount_type`/`discount` — **not** `attachDiscountWindow`'s "earliest across the whole invoice," which stops being correct once installments are split apart). Returns `null` when there's only one distinct due date (the common case — nothing to explode); caller falls back to `attachDiscountWindow(row, paymentScheduleRows)` as before, unchanged. |
| `buildOutstandingBillRows(reportRow, paymentScheduleRows)` | New convenience entry point combining the three above — this is what Packet 4's IPC layer should call per invoice, not the individual pieces, so nobody forgets the explode step. |

**Typedef change:** every `OutstandingBillRow` now also carries `installmentKey: string` — unique per
row (`invoice` for a non-exploded bill, `${invoice}#${n}` for an exploded installment). `invoice`
alone stopped being a safe unique key once one invoice can produce several rows; `installmentKey` is
what Packet 2's `bills: string[]` output uses, `invoice` is still there whenever code needs the real
ERP document name back (e.g. a future write path).

### Tests

`tests/outstanding-bills.test.js` — normalize the captured Accounts Payable report row fixture above
(both `SUP-DAILY` and `SUP-DAILY-LG`); discount-window attach with 0/1/many schedule rows; Percentage
vs. Amount discount-type math (Percentage against `invoiced`, not `payment_amount`); multiple
discount-bearing rows picks the **earliest** `discount_date`; missing discount fields → `undefined`,
not `0` (so the economics helper can tell "no discount offered" from "$0 discount"); explode with 1
distinct due date → `null` (no-op); explode with many distinct due dates → one row per unpaid
installment with its own amount and its own discount fields; paid-off installments (`outstanding: 0`)
excluded; run against the real captured `SUP-DAILY` fixture (90 installments) end to end.

---

## Packet 1b — `src/bank-business-days.js` (pure: "not a processing day" calendar)

### Why this exists (5zorro 2026-09-05)

Packet 2's math as drafted below is silently wrong whenever a raw `dueDate` lands on a weekend or a
bank holiday — it would suggest paying on a Sunday. 5zorro's framing: this doesn't need to be
regulatory-grade (not a bank), **"federal holidays plus some blur… call it good enough."** Locked
scope, explicitly not more:

- **Weekends** (Sat/Sun).
- **US federal holidays** (same 11-day list the Federal Reserve uses for ACH/wire processing) —
  computed algorithmically per year (fixed dates + "nth weekday of month" dates), with the standard
  observed-date shift (Saturday holiday → observed Friday, Sunday holiday → observed Monday). No
  external data file, no year-by-year maintenance.
- **Blur days** — 5zorro's two named examples, both are "a Friday adjacent to a holiday that creates
  a long weekend": the Friday **before** a Monday holiday, and the Friday **after** a Thursday
  holiday (e.g., the day after Thanksgiving). One rule covers both: a Friday is a blur day if the
  following Monday is a holiday **or** the preceding Thursday was a holiday.
- **Direction of the shift, locked (5zorro 2026-09-05): earlier, always, as the default.** Real
  vendor terms vary a lot more than a shared calendar can encode — some vendors hand out late fees
  freely, some are relationship-based and forgiving, some may define terms like "net 30 but expect
  7 days of postage" (or 2 days if the remittance address changes) or "next business day after net
  30." **None of that granularity exists in Vanilla's data model** — confirmed directly (MariaDB
  read-only, 2026-09-05): `Payment Term.due_date_based_on` and `.discount_validity_based_on` each
  have exactly 3 options, all pure calendar-day/month arithmetic ("Day(s) after invoice date,"
  "…after the end of the invoice month," "Month(s) after…") — no business-day or holiday concept.
  `Supplier.payment_terms` is only a Link to a Payment Terms Template; the one free-text field
  (`Purchase Invoice.terms`, a Text Editor) is print boilerplate, not data anything could safely
  parse for a postage buffer. There's no mechanical way to pick up per-vendor nuance even if we
  wanted to — so absent real per-vendor detail, always default to the conservative shift: pay the
  last valid business day
  **before** the due date, never later. This is also consistent with the tranche's existing rule
  ("never batch past the earliest due date… never pay late to save postage"). Per-vendor overrides
  (a postage-buffer days field, a "next business day after" flag) are a real future extension point
  once that data is worth capturing — **not this packet**; `effectivePayByDate()`'s signature should
  stay open to an optional per-call override later without a breaking change, but nothing to build
  now.

### Shape

```js
/** @param {number} year @returns {Set<string>} ISO dates, observed-date shifted */
export function usFederalHolidays(year) { ... }

/** @param {string} isoDate @returns {boolean} */
export function isWeekend(isoDate) { ... }
export function isBankHoliday(isoDate) { ... }   // weekend OR federal holiday
export function isBlurDay(isoDate) { ... }       // Friday adjacent to a holiday long weekend

/**
 * Last valid processing day on or before isoDate. If isoDate is already a normal business day
 * (not weekend/holiday/blur), returns it unchanged.
 * @param {string} isoDate
 * @param {{ includeBlur?: boolean }} [opts]  // default true
 * @returns {string} ISO date
 */
export function effectivePayByDate(isoDate, opts) { ... }
```

### Tests

`tests/bank-business-days.test.js` — known federal holidays for a couple of concrete years
(including an observed-Friday and an observed-Monday case); a Sunday due date shifts to the prior
Friday (unless Friday is itself a holiday, then Thursday); the two named blur cases (Friday before a
Monday holiday, Friday after Thanksgiving) both shift; `includeBlur: false` disables blur but keeps
weekend/holiday shifting (so a future prefs toggle is possible without a second implementation).

### How Packet 2 uses it

Every bill's `dueDate` **and** `discountDate` (if present) run through `effectivePayByDate()` before
any grouping/float math — the whole algorithm operates on effective dates, not raw ERP dates. This
also fixes the pay-alone baseline: a bill due on a Sunday already has a nonzero "cost of paying on
time" even with zero batching, and every downstream comparison needs that baseline right.

---

## Packet 2 — `src/payment-batch-economics.js` (pure: the OI-161 math)

### Business rule (locked intent, from OI-161)

> Minimize **all-in** payment cost (fees + lost float), not due-date slavishness when economics
> favor one check. Batch adjacent small payments when combined per-payment savings exceed lost
> float; never batch past the **earliest** due date in the group (never pay late to save postage).

Concretely, for a same-vendor group of bills with due dates within a configurable window:

- **Per-payment cost** = flat fee (e.g. $0.78 postage) + `perTransactionCost` (e.g. $0.05/check),
  charged once **per payment made**, not per bill.
- **Float value of delaying** one bill from its own due date to an earlier **group** pay date =
  `amount * (apr / 365) * daysEarlier` — this is a **cost** of batching early (paying before you
  have to), not a savings. Batching only wins when `feesSavedByBatching > floatCostOfPayingEarly`.
- Suggested pay date for a group = **earliest** *effective* due date among the batched bills, run
  through Packet 1b's `effectivePayByDate()` (never later — that would risk lateness on the earliest
  one, and never a weekend/holiday/blur day either).
- A discount window (Packet 1's `discountDate`/`discountAmount`, also effective-date-shifted)
  **always wins** its own comparison first: if `discountAmount > floatCostOfPayingEarly(thatBill,
  discountDate)`, suggest paying that bill alone by `discountDate` regardless of batching (discount
  capture is usually the largest single lever — do not let batching logic bury it).

### Signature

```js
/**
 * @param {{
 *   bills: OutstandingBillRow[],
 *   perPaymentFee: number,      // e.g. 0.78 (postage) + 0.05 (per-check) pre-summed by caller
 *   apr: number,                // e.g. 0.09
 *   groupWindowDays?: number,   // default 7 — max span between due dates to consider batching
 * }} args
 * @returns {{
 *   groups: Array<{
 *     supplier: string,
 *     bills: string[],          // installmentKeys (Packet 1) — unique per row, not always == invoice name
 *     payOn: string,            // ISO — earliest due date in group, or a discount date if that wins
 *     totalAmount: number,
 *     feesSaved: number,        // vs paying each bill separately
 *     floatCost: number,        // $ lost by paying earlier than each bill's own due date
 *     netBenefit: number,       // feesSaved - floatCost (+ any discount captured)
 *     rationale: string,        // human-readable, e.g. "3 bills batched: $0.83 fee saved vs $0.31 float cost = $0.52 net"
 *     reason: "batch" | "discount-capture" | "pay-alone",
 *   }>,
 * }}
 */
export function paymentBatchEconomics(args) { ... }
```

`reason: "pay-alone"` rows still appear (single-bill "groups") so the UI has one uniform list to
render — no separate "ungrouped" branch.

### Tests

`tests/payment-batch-economics.test.js` — table-driven:

1. Three $300 same-vendor bills due Mon/Tue/Wed, small per-check fee → batches to one group,
   `payOn` = Monday, `netBenefit > 0`.
2. Same bills but `apr` high enough that float cost of paying Tue/Wed's amount early on Monday
   exceeds fee savings → **does not** batch (each stays `pay-alone`).
3. A bill with a discount window where `discountAmount` beats batching → `reason: "discount-capture"`,
   `payOn = discountDate`, independent of any group it could otherwise join.
4. Different suppliers never batch together (group key is always `supplier`).
5. Bills outside `groupWindowDays` of each other don't batch even same-vendor.
6. Empty `bills` → `{ groups: [] }`. Single bill → one `pay-alone` group, `netBenefit: 0`.
7. A single bill due on a Sunday → `payOn` is the prior Friday (Packet 1b), with `floatCost` computed
   against that shifted date, not the raw Sunday.
8. Three bills whose raw earliest due date is a bank holiday → group `payOn` lands on the correct
   prior business day, not the holiday.

This is the packet the whole tranche hinges on — **auditable math**, per HANDOFF's "auditable how"
rule. 5zorro should read the test table before this packet is called done; the `rationale` string
is user-facing, not just a log line, so its wording is part of the review, not an afterthought.

---

## Packet 3 — `src/payment-batch-prefs.js` (pure: cost-model SSoT)

### Business rule

`apr`, postage, and per-check cost are **company/user judgment calls**, not ERP truth — they don't
exist as fields anywhere in ERPNext (confirmed in Packet 0). Store them the same way other shell-only
prefs live today (pattern: `lens-prefs.js` — per-scope JSON in `userData`, not a new ERP doctype;
Clean Core stays intact since nothing is written to ERP).

### Shape

```js
/** @typedef {{ apr: number, postage: number, perCheck: number, groupWindowDays: number }} PaymentBatchPrefs */
export const DEFAULT_PAYMENT_BATCH_PREFS = Object.freeze({
  apr: 0.09, postage: 0.78, perCheck: 0.05, groupWindowDays: 7,
});
```

| Piece | Job | Status |
|---|---|---|
| `src/payment-batch-prefs.js` | `DEFAULT_PAYMENT_BATCH_PREFS` + `validatePaymentBatchPrefs(prefs)` → `{ ok, errors }` (every invalid field reported, not just the first — a settings UI can highlight each one) + `mergePaymentBatchPrefs(raw)` → always a complete `PaymentBatchPrefs`, each field falling back to its own default independently (mirrors the existing `normalizeHealthRemediationPrefs` pattern in `health-remediation.js`, not a new convention). Pure. | **Done 2026-09-05.** |
| Electron: `userData/payment-batch-prefs.json` read/write | Same pattern as `main.js`'s existing `loadPrefs()`/`savePrefs()` for `lens-prefs.json` — raw `fs` read, `JSON.parse` in a try/catch, `mergePaymentBatchPrefs()` to sanitize. | **Deferred to Packet 4** — electron wiring lands with the rest of the Doc Pay skin's IPC, same as Packet 1's `get-outstanding-bills` call. |
| UI | Small settings affordance on the Doc Pay skin itself (not a separate settings page this tranche) — edit the three numbers inline, see suggestions re-flow live. | **Deferred to Packet 4.** |

### Tests

`tests/payment-batch-prefs.test.js` — defaults pass validation; validate rejects non-object,
negative, NaN, `Infinity`, and missing fields (reporting *all* invalid fields at once, not just the
first); zero is a legitimate value, not rejected; merge yields exactly the defaults with no
overrides, a partial override still yields a complete `PaymentBatchPrefs`, an individually-invalid
field falls back to its own default without discarding the rest of the object, unknown extra fields
are ignored, non-object input falls back to full defaults, and the frozen default is never mutated.

---

## Packet 4 — Doc Pay skin v1 (`electron/pay-outstanding.html`)

### Business rule

Vanilla's "New Payment Entry → Paid Amount > 0 → Get Outstanding Invoices → allocate" is
per-supplier and forward (start from a blank PE, then find invoices). 5zorro's job is the other
direction: start from **what's owed**, grouped by **vendor + due date**, with the batching
suggestion already computed — pick a group, decide to act, **then** go pay it (v1: hands off to
existing Vanilla Payment Entry / Payment Order as the write path — see Packet 5).

### How

### Entry points (locked 2026-09-04, **hosting revised 2026-09-05**)

**Home tile, in-window** — not a popup. First shipped (2026-09-05) as a standalone `BrowserWindow`
(same pattern as `open-mockup`); 5zorro's stated vision for the whole app overruled that the same
day: **"stay in window unless I spawn a second all-purpose window."** Reworked to a persistent
`WebContentsView` + a new `surfaceMode: "pay-outstanding"`, wired through `place()`/`showHome()`'s
exact existing pattern (`showPayOutstanding()`) — the same mechanism Bill/PO/Receipt already use,
just without going through `DOC_SKIN_INDEX` (this surface is triggered directly by the Home tile,
not by intercepting a Vanilla navigation, so it doesn't need route-matching). This is now recorded
as **HANDOFF.md invariant 6** ("One window") — durable, not tranche-scoped.

5zorro also named the durable **doc-skin scope boundary**: doc skins live only on the transaction-
entry forms (PO, IR, Bill, Payment Entry, SO, Sales Invoice, Quotation, Journal Entry) — never
spread across list views, reports, or other Vanilla surfaces. Also now HANDOFF invariant 6.

**Where this leaves the Payment-Entry anchor (Packet 4b):** 5zorro's refined vision (2026-09-05) —
Payment Entry becomes the *real* anchor, with an optional **filter by vendor or invoice** narrowing
the same flow view down to one vendor, and a **modal** on a suggested group that creates the actual
Payment Entry (folding Packet 5's write path in). The vendor/invoice filter already shipped on
today's Home-triggered surface (`#filter-input`, vendor-scoped — matching by vendor name or one of
its invoice names still shows that vendor's whole bill set, since slicing it would break
`paymentBatchEconomics`' grouping math). **Not yet done:** actually anchoring to Payment Entry
(today's trigger is still the Home tile only) and the creation modal. See **Packet 4b** below,
updated with this refined shape.

| Piece | Job |
|---|---|
| Home tile | `pay-outstanding` tile in the **Vendors** group (`src/home-tiles.js`), route `/pay-outstanding` (shell-only marker, not a real `/app/...` path — `SHELL_ROUTE_TILE_IDS` documents the exception). Existing `pay-bills` / `checks` tiles stay as-is (direct-to-blank-PE escape hatch); this is additive. |
| List (top level) | Grouped by **vendor**, sorted by earliest due date. **Three-stage Sankey** (added in dogfood): Invoice (blue, structural) → Payment Schedule installment (Payment date / Amount, sortable by date or invoice) → Proposed payment (Suggested date / Suggested amount, colored by `paymentBatchEconomics`' reason). Sticky page header, sticky column-label header, sticky per-vendor header. |
| Filter | `#filter-input` — vendor name or invoice name substring, vendor-scoped (see above). |
| Suggested-payment node | Click to expand: `rationale` string + bill-by-bill breakdown. Collapsed by default; **no auto-select, no auto-submit** (OI-161 rule 5, "suggestion only v1"). |
| Prefs affordance | `⚙ Assumptions` panel (Packet 3) — editing APR/postage/per-check/window re-runs `paymentBatchEconomics` client-side, no re-fetch. |
| Empty state | No outstanding bills → "Nothing outstanding"; no filter matches → "No vendor or invoice matches …". |

### Explicitly NOT this packet

- No checkbox multi-select → "Pay Now" action. No Payment Entry / Payment Order creation yet — that's
  the modal described above, now folded into **Packet 4b** rather than Packet 5 standing alone.
  Clicking a group today only deep-links to a blank Vanilla Payment Entry (`Open Payment Entry
  (Get Outstanding Invoices) →`) or the Bill itself — a link-out, not a shell-side write.
- No list-scroll-position/return-to-list work (that's **OI-129**, explicitly parked until 5zorro
  dogfoods this and feels the same pain — do not pre-solve it here).
- Anchoring to the actual Payment Entry form (today's only trigger is the Home tile) and the
  creation modal — **Packet 4b**, still not built; see its updated shape below.

### Tests

Layer 1: none new beyond Packets 1–3 (this packet is presentation over already-tested pure data).
Layer 3: `scaffold-pay-outstanding.spec.js` — Home tile → `surfaceMode` flips to `"pay-outstanding"`
→ real vendor cards/groups/ribbons render from live ERP data → rationale expands on click → Home
button (chrome toolbar) returns `surfaceMode` to `"home"`. Driven via `execInView`, like every other
persistent view (WebContentsView is not a reliable Playwright Page — e2e/GOTCHAS.md #1).

---

## Packet 4b — Doc-skin Payment Entry anchor (AP only) — refined 2026-09-05, still not built

### Business rule (refined 2026-09-05)

Payment Entry becomes the *real* anchor, replacing the Home tile as the primary entry point (Home
tile likely stays too, as a fast path — not decided). Shape 5zorro described:

- The same three-stage flow view (Packet 4, already shipped) renders **inside** the Payment Entry
  doc skin — "the Bill doc skin morphed from just form entry to closer to a dashboard; I was hoping
  this 'payment entry' would be kinda like a dashboard for the form entry." The dashboard *is* the
  primary content; raw field entry is secondary.
- **Filter by vendor or invoice** narrows the same view to one vendor — already shipped on today's
  Home-triggered surface (`#filter-input`), reusable here as-is.
- A **modal** on a suggested group's node collects whatever's needed and creates the actual Payment
  Entry — folding Packet 5's write path into this packet rather than keeping it a separate stretch.

Scope stays **AP only** — this Doc skin activates for Pay-type Payment Entries; Receive-type (AR)
stays Vanilla until AR gets its own doc skin (consistent with HANDOFF invariant 6's transaction-
entry-forms-only scope, and avoids the same AR bleed 5zorro flagged when rejecting the Payments
workspace as an anchor for Packet 4).

### What's already true, and what still isn't (honest status, 2026-09-05)

- **Already shipped, reusable as-is:** the three-stage flow view, the vendor/invoice filter, the
  prefs panel, sort toggle — all pure presentation over already-tested Packets 1–3 data, currently
  hosted on the Home-triggered `pay-outstanding` surface.
- **Still not built:** actually anchoring this content to the Payment Entry *form* (today's only
  trigger is the Home tile — `DOC_SKIN_INDEX` has no `payment-entry` entry), and the creation modal
  (a real ERP write — nothing in this tranche has written to ERP yet; Clean Core still means calling
  existing whitelisted methods only, e.g. `frappe.client.insert`/PE's own `frappe.call` methods, and
  reusing whatever write pattern the existing JIT-Payment-Entry code (OI-135) already established
  rather than inventing a second one).
- **Sizing note stands:** Bill/PO/Receipt share `shell: "doc-form"` in `src/doc-skin-registry.js` —
  one HTML shell (`electron/doc-form.html`) templated for "header + item grid + taxes" documents.
  Payment Entry has no item grid; confirmed live (2026-09-05) that `doc-form.html` doesn't reload per
  doctype at all — it's a persistent SPA reconfigured via `docFormUiPayload()`, so bolting a
  dashboard-shaped mode onto it means either a real branch inside an already-large file, or (cleaner,
  lower-risk to Bill/PO/Receipt) its own persistent `WebContentsView`, the same pattern Packet 4's
  `payOutstanding` view now uses. Reusing `pay-outstanding.html`'s content directly is the likely
  path — this packet is mostly *hosting* + *filter* + *modal*, not new dashboard content.
- **Not resolved:** distinguishing AP from AR if this ever also needs to intercept a *raw* Vanilla
  `/app/payment-entry/new` navigation (not just a Home-tile trigger) — `classifySurface`/
  `lookupDocSkin` key off route + doctype only, never a field value like `payment_type`. Deferred
  until/unless that interception is actually wanted; today's trigger (Home tile, soon Payment-Entry-
  anchored) doesn't need it.

### Recommended sequencing

Two separable steps, not one big change: (1) anchor the already-built dashboard content to Payment
Entry (hosting + filter wiring — no new writes), (2) the creation modal (a real write — deserves its
own review, separate commit, and a check of OI-135's existing write pattern before inventing a new
one). Do (1) first; do not block it on (2).

---

## Packet 5 (stretch — not required to close this tranche) — the write path

**Update 2026-09-05:** dogfood signal arrived faster than expected — 5zorro wants the write path
folded into **Packet 4b's creation modal** rather than kept as an independent stretch. This section's
three options are still the real menu for *how* that modal actually writes; keep evaluating them
here, just under Packet 4b's umbrella now, not as a separate later packet.

Only start after Packet 4 has been dogfooded and 5zorro has actually used the suggestions for a few
real payment runs. Options to evaluate then, **not decided now**:

| Option | Note |
|---|---|
| Deep-link into Vanilla Payment Entry `Get Outstanding Invoices`, pre-filtered to the chosen group's bills | Least shell-side risk; Vanilla still owns the write. |
| Shell-side batch Payment Entry creation via `erp-form-bridge.js` (existing Bill→PO/IR bridge pattern) | More Doc-native feel; more surface to maintain; needs its own dated plan. |
| Feed a **Payment Order** (the closest Vanilla "run" instrument, per Packet 0) from a chosen batch | Matches the "check run / ACH run / wire run" framing directly; still needs individual Payment Entries to exist first per Vanilla's `Payment Order` mechanics (Packet 0) — so this only replaces the *batching* step, not entry creation. |

Do not pick one now — this needs its own "how" once there's real dogfood signal on which
suggestions clerks actually act on.

---

## Dogfood residuals

*(New tranche — nothing carried over into this file. Related-but-out-of-scope OIs are listed in the
header block above; do not fold their status into this table.)*

| Family | Status | Notes |
|---|---|---|
| — | — | Populate as Packets 1–4 land and 5zorro dogfoods. |

---

## Out of this tranche

- Packet 5 (write path) — stretch, explicitly deferred pending dogfood.
- The Doc-skin Payment Entry form's actual **build** (Packet 4b) — the **decision** to anchor there
  (Home tile + PE form, AP only) is locked (2026-09-04); the build is deferred to its own follow-up
  dated plan once Packet 4 is dogfooded.
- Per-vendor payment-terms granularity (postage-buffer days, "next business day after net 30,"
  remittance-address-dependent buffers) — Vanilla has no field for any of this (Packet 0); Packet 1b
  defaults every vendor to the same conservative earlier-shift until real per-vendor detail is worth
  capturing (locked 2026-09-05, see Packet 1b).
- OI-129 (list return/scroll) — explicit no-build until 5zorro dogfoods this tranche's list.
- OI-135 / OI-139 — shipping on their own tracks; only touched here by reusing shared shapes
  (`payment_schedule`), not by changing their code.
- Any change to `Mode of Payment` / `Bank Account` schema (SWIFT/ACH routing fields) — Packet 0
  confirmed the gap but closing it would mean asking clerks to fill in more Vanilla setup, which is
  a product decision for 5zorro, not this tranche.
- Multi-currency batching (grouping bills across different `currency` values) — Packet 2's tests
  assume single-currency-per-group; cross-currency netting is a separate, harder economics problem.

---

## Validate

```bash
cd ~/erpnext-ui-app && npm test && npm start
```

**Git:** commit on `alpha`; only **5zorro** pushes.
