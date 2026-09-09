# Implementation plan — 2026-09-08

**Tranche:** Payment terms as **structured data**, and the batching **assumptions** made explicit.
**Successor to** `implementation-plan-2026-09-03.md` (Doc Pay skin economic batching, OI-138 /
OI-161 — MVP shipped 2026-09-08, plan deleted; durable rules folded into `HANDOFF.md` § Pay
Outstanding flow and `docs/gotchas.md` G7–G8).

**Museum OIs:** OI-161 (payment batching economics) · OI-138 (Doc Pay skin) — both marked MVP; this
plan carries their unfinished threads.

> **Status: scoped, not started.** No code has been written against this plan. The two threads come
> from 5zorro (2026-09-08): *"i want to tweak the structured data from terms and the assumptions."*
> Packet A and Packet B below say what is actually there today and what is provably missing; the
> **Open questions** section is where the product calls still belong to 5zorro, and is deliberately
> not answered by guessing.

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
2. Update museum **OI status** — set `done` or note what promoted.
3. **Delete** this dated plan; open a **new** dated plan for the next tranche.

---

## Carried in from the closed tranche (do not lose)

### 🔴 Three financial write paths have never run against a live sandbox

Built, unit-tested, and **never executed against real data**. All three stay gated on 5zorro's
explicit go-ahead — this is the single most important thing this plan inherits.

| Path | Code | What it would do |
|---|---|---|
| Batch Payment Entry submit | `main.js::createBatchPaymentEntry` + `payment-entry-batch.js` | Creates **and submits** a PE against N outstanding bills |
| Payment Entry draft save | `main.js::savePaymentEntryFields` | `frappe.client.set_value` on 4 fields of an existing draft |
| Blank Payment Entry create | `main.js::createBlankPaymentEntryDoc` | Inserts a new draft PE from the blank check drawer |

**Before any of these runs live:** confirm the sandbox company is the non-Demo one (the AP report
mixed both companies together once already), and verify on a bill whose numbers are trivially
checkable by hand.

### Other residuals

| Family | Status | Notes |
|---|---|---|
| Trace / hover focus on the flow | **Open — 5zorro leaning negative** | *"the trace is less helpful"* (2026-09-08). Downgraded to hover-first with click-to-pin retained as a convenience, not removed. Decide after dogfooding the buttons: if it still reads as noise, delete `wireFlowFocus` and `pay-flow-focus.js` rather than tuning it. |
| Ribbon shape option D (tapered) | **Mocked, unbuilt** | `docs/mockups/pay-flow-shapes.html` §1. Option B (centred bundle) shipped. Only revisit if the bundle reads badly at a scale we have not tried. |
| Per-vendor payment-terms granularity | **Carried into Packet B** | Was out of scope in the closed tranche because Vanilla has no field for it. Packet B re-examines whether `Payment Term` structure gets us far enough to stop guessing. |
| AR mount of the check document | **Out** | The fragment split exists so AR is a third host over one document, not a second implementation. Direction `"Receive"` stays in Vanilla. |

---

## Carried in from the Simplified tranche (`implementation-plan-2026-07-29.md`, closed 2026-09-08)

That plan closed with one **explicit non-droppable obligation** written into its own Deferred table
— *"D-CreditNote … must promote into the next dated plan at closeout, do not drop"* — plus a short
tail of optional threads. This section is where it landed. **None of it is scheduled against Packet
A or B below**; it is parked here so the next tranche after this one starts from a real list rather
than an archaeology dig.

### 🟡 The AP credit-memo thread (the promoted obligation)

Doc-skin credit-memo capacity **shipped** 2026-09-06/07: native Create Credit / Return from a
submitted Bill (`make_debit_note`), the "Vendor Credit" status relabel, the orphan-warning banner
(`creditMemoOrphaned`), informal Bill / Sales Order tokens in `remarks`, the draft-only
**Credit memo?** switch, and the source picker it opens (*"Which Bill is this credit against?"*).
Pure logic is in `src/credit-memo.js`, fully unit-tested. What is **not** done:

| OI | Thread | State |
|---|---|---|
| **OI-166** | Move the credit decision **into the source modal** — a slider that repoints it from PO / IR at `return_against` | New 2026-09-08 (5zorro). Needs the modal to flip multi-select → single-pick with the mode, and to keep routing through `planCreditMemoSource()` |
| **OI-147** | Return **inventory flow** — the received vs billed-only branches, and the flow strip that explains which ledger moves | Open. The billed-but-not-received half is answered empirically (a PI return with `update_stock = 0` posts **no** stock ledger entry) but nothing in the UI says so |
| **OI-082** | Copy-vs-return semantics documented in the anchors | Open; the "dangerous freeform copy" risk is now reproduced, not theoretical |
| **OI-164** | Credit memos issued in a period, each showing its linked Bill | Open — **content** spec only; placement moved 2026-09-08 |
| **OI-167** | The **default reports surface** those period reports belong on (credit memos **and** inventory adjustments) | New 2026-09-08. Blocked on 5zorro's pass over which ERPNext reports are "default" — do not design a report before the surface exists |

**The rule under all five:** a credit must be linked to a Bill. `is_return` with an empty
`return_against` does not error — it silently books to an accrual placeholder
(`Stock Received But Not Billed`) instead of the item's real expense account, because the fallback
keys off the **row's own** `po_detail` / `pr_detail` links, not "has this item ever been received".
Any new path that can set `is_return` must route through `planCreditMemoSource()`, never flip the
flag freeform.

### Optional threads that outlived the plan

| Thread | Home now | Note |
|---|---|---|
| Packet S3 — grow Simplified's field config toward \(N_s' \approx N_v\) | museum **OI-086** | Config, not a rewrite. The plan itself called it optional and non-blocking |
| Calculator C4 — align / dialect prefs, grow-on-scroll history | museum **OI-018** | Only opacity-on-hover landed |
| Calculator C5 — attach the calculator to **Simplified** numeric fields | museum **OI-018** | The one real gap: `attach-field-calc.js` is imported by the Doc form pages only, never by the injection payload |
| OI-078 — Esc / backdrop / New Bill leave no stuck modal | museum **OI-078** | Verify-first, never walked end to end; the matrix now has two more dialogs in it than when it was written |
| OI-163 — Doc skin field coverage toward Vanilla parity | museum **OI-163** | **Parked deliberately.** Do not touch Bill Doc-skin code for this until 5zorro asks |

---

## Goal (this tranche)

Two threads, in this order — Packet A makes the app **read what ERPNext already knows**, and Packet
B makes what the app **invents** visible and adjustable. A is first because it may shrink B: every
fact recovered from a Payment Term is one fewer assumption we have to let the clerk tune.

---

## Packet A — Payment terms as structured data

### Honest baseline (verified 2026-09-08 against ERP source, not guessed)

`main.js::fetchOutstandingBills` already fetches each invoice's **whole** `payment_schedule` child
table (via `frappe.client.get` on the parent — `get_list` on a child doctype silently strips every
field but `name`). So the data is already in the renderer's hands. The gap is entirely in what
`outstanding-bills.js` chooses to read.

`Payment Schedule` child doctype fields, and what we do with each today:

| Field | Type | Used today? |
|---|---|---|
| `due_date` | Date | ✅ the installment's date |
| `outstanding` | Currency | ✅ the installment's amount |
| `discount_date` | Date | ✅ discount window start |
| `discount` / `discount_type` | Float / Select | ✅ discount size (Percentage computes off the bill's `invoiced` grand total, matching `payment_entry.py::apply_early_payment_discount`) |
| `payment_term` | Link → Payment Term | ❌ **the name of the term** — "2/10 Net 30" |
| `description` | Small Text | ❌ the term in the vendor's own words |
| `invoice_portion` | Percent | ❌ what share of the bill this installment is |
| `payment_amount` | Currency | ❌ scheduled amount (vs `outstanding`, which nets off payments) |
| `paid_amount` | Currency | ❌ partial-payment truth |
| `discounted_amount` | Currency | ❌ discount **already taken** |
| `mode_of_payment` | Link | ❌ **per-installment** mode of payment |
| `due_date_based_on` | Select | ❌ how the due date was derived |
| `credit_days` / `credit_months` | Int | ❌ the credit period itself |
| `discount_validity_based_on` | Select | ❌ how the discount window was derived |
| `discount_validity` | Int | ❌ the discount period itself |

Fifteen fields available, five consumed. The five we use are enough to *compute* a suggestion and
not enough to *explain* one — which is the actual complaint: the dashboard can say "pay
2026-08-07, $7,500" but cannot say "because this is Net 30 from a 2026-07-08 bill."

### Why this is worth doing

1. **A named term explains a date.** `payment_term` + `description` turn an opaque due date into
   "2/10 Net 30", which is what a clerk recognises and what makes a *wrong* date obvious.
2. **`mode_of_payment` is per-installment and we are ignoring it.** The check drawer currently has
   the clerk pick a mode; the schedule row may already say. (Note: Vanilla's Payment Entry has **no**
   `set_query` on `mode_of_payment` — confirmed by reading `payment_entry.js` — so there is no
   filter to mirror, only a value to respect.)
3. **`paid_amount` / `discounted_amount` are partial-payment truth we currently infer.**
   `explodeInstallments` filters on `outstanding > 0`, which is right, but the dashboard cannot show
   "half paid" because it never reads the other half.
4. **`credit_days` / `due_date_based_on` are the vendor's real terms.** This is the structured
   per-vendor detail that `bank-business-days.js` says outright does not exist —
   *"Payment Term's `due_date_based_on` is pure calendar-day/month arithmetic"*. That claim is still
   true for a **postage buffer**, but it undersold what *is* there for the credit period itself.

### Steps (pure first, per the invariant)

- **A1 —** Extend `OutstandingBillRow` with the term fields, in `outstanding-bills.js`. Additive
  and optional: absent fields must stay absent (never `""` or `0`), so callers can still tell "no
  term recorded" from "Net 0". Extend `explodeInstallments` to carry per-installment values rather
  than the header's.
- **A2 —** A pure `src/payment-term-summary.js`: given a schedule row, produce the short human label
  ("2/10 Net 30", "Net 30", "Due on receipt") and a longer explanation. Derive from
  `discount`/`discount_validity`/`credit_days` when `payment_term` is absent, since the link is
  optional on the child row. **Never invent a term that is not in the data.**
- **A3 —** Surface it. The suggested-payment node has no room (see `flow-node-density.js` — a
  one-row node is already full); the natural homes are the schedule row's title/tooltip, the
  rationale popup, and the check drawer's stub. **Do not** add a column without re-measuring: the
  invoice column is 208px precisely because a full naming-series name plus its peek button needs it.
- **A4 —** Respect `mode_of_payment` where the schedule row states one, instead of asking.

### Explicit non-goals for Packet A

- No new ERP fields, no Custom Fields, no doctype changes (Clean Core).
- No **writing** to `payment_schedule` from this surface. `bill-payment-schedule.js` already owns
  header-due-date ↔ schedule sync for the Bill Doc skin; this tranche reads only.

---

## Packet B — The assumptions, made visible

### Honest baseline

Everything the batching engine assumes, and where it lives:

| Assumption | Default | Where | Tunable today? |
|---|---|---|---|
| Cost of capital (`apr`) | `0.09` | `payment-batch-prefs.js` | ✅ prefs panel |
| Postage | `$0.78` | `payment-batch-prefs.js` | ✅ prefs panel |
| Per-cheque cost | `$0.05` | `payment-batch-prefs.js` | ✅ prefs panel |
| Batching window | `7` days | `payment-batch-prefs.js` | ✅ prefs panel |
| Per-payment fee = `postage + perCheck` | — | `pay-outstanding.src.html` | ❌ **composition is hard-coded in the view** |
| Always pay **earlier**, never later | — | `bank-business-days.js` | ❌ locked (5zorro 2026-09-05) |
| Weekends + 11 US federal holidays | — | `bank-business-days.js` | ❌ algorithmic, no per-year data |
| "Blur day" — the Friday beside a long weekend | — | `bank-business-days.js` | ❌ heuristic, on by default (`includeBlur`) |
| One calendar for **every** vendor | — | `bank-business-days.js` | ❌ `effectivePayByDate(iso, opts)` is the stub extension point |
| Discount wins its own comparison first | — | `payment-batch-economics.js` | ❌ locked (OI-161) |
| Batching is all-or-nothing per cluster | — | `payment-batch-economics.js` | ❌ except the free same-day subset |
| Percentage discount computes off the bill's grand total | — | `outstanding-bills.js` | ❌ matches ERPNext's own formula |

Four are tunable; nine are invisible. Several of the nine are *judgment calls stated as facts* —
the blur-day heuristic in particular changed which date five payments landed on during dogfood, and
nothing on screen says it exists.

### Steps

- **B1 — Say what was assumed.** The rationale popup already explains the *arithmetic*
  ("3 bills batched: $1.66 fee saved vs $0.22 float cost"). It should also name the *inputs*: which
  date rule moved this payment, and by how many days. A payment pulled from Monday to the previous
  Thursday because of a holiday should say so — that is a fact about the calendar, not a preference.
- **B2 — Move fee composition out of the view.** `perPaymentFee: prefs.postage + prefs.perCheck` is
  business logic sitting in `pay-outstanding.src.html`. It belongs in `payment-batch-prefs.js` as a
  derived value, so the shell and any future surface cannot disagree about what a payment costs.
- **B3 — Make the blur-day heuristic a pref**, not a hidden default. It is genuinely opinionated
  (some shops pay the Friday, some do not), it already has an `opts.includeBlur` seam, and it is
  currently on with no way to see or change it.
- **B4 — Per-vendor overrides, only if Packet A justifies them.** `effectivePayByDate`'s `opts` is
  already the seam. **Decide after A**: if `credit_days` / `due_date_based_on` turn out to carry the
  real vendor difference, a shell-side override table is redundant and should not be built.

### Constraint that does not move

Prefs stay in `userData` JSON. They are company judgment calls with no ERPNext field to hold them
(confirmed in the closed tranche's Packet 0), and writing them into ERP would breach Clean Core.

---

## Open questions for 5zorro (do not guess these)

1. **"Tweak" — read, or edit?** Packet A as written makes the app *read* term structure it currently
   ignores. If the intent is to **edit** terms from the Doc skin, that is a write path into
   `payment_schedule` and a different, larger tranche — say which.
2. **Which term facts actually matter on the dashboard?** The honest answer is probably
   `payment_term` + `description` + `mode_of_payment`; the rest may be drawer-only or not wanted at
   all. Naming the two or three that matter keeps A3 from bloating a surface that is already dense.
3. **Is the blur-day rule right?** It is the assumption with the largest observed effect (it moved
   five payments onto one date during dogfood) and the least evidence behind it.
4. **Do the three write paths get their live-sandbox run this tranche?** They are built and idle.
5. **Trace: keep or delete?** See residuals — a decision, not a tuning exercise.

---

## Out of this tranche

- Editing `payment_schedule` (see open question 1 — read-only until told otherwise).
- Any `Mode of Payment` / `Bank Account` schema change (SWIFT/ACH routing fields). The gap is real
  and confirmed; closing it means asking clerks to fill in more Vanilla setup, which is 5zorro's
  product call.
- Multi-currency batching — the economics tests assume one currency per group; cross-currency
  netting is a separate, harder problem.
- OI-129 (list return/scroll) — still an explicit no-build pending dogfood.
- OI-135 / OI-139 — own tracks; touched here only by reusing `payment_schedule`'s shape.
- The AR mount of the check document.
- A user-facing density control for the flow view. `flowNodePlan(spanHeight, rowHeight)` already
  takes the row height as a parameter and is tested at 60px as well as 34px, so it is cheap when
  wanted — but nobody has asked for it.

---

## Dogfood residuals

*(Empty — new tranche. Carried-forward items live in **Carried in from the closed tranche** above;
do not reopen Done batches from the closed plan.)*

| Family | Status | Notes |
|---|---|---|

---

## Validate

```bash
cd ~/erpnext-ui-app && npm test && npm start
```

**Git:** commit on `alpha`; only **5zorro** pushes.
