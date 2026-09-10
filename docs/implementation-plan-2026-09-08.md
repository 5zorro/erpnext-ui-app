# Implementation plan — 2026-09-08

**Tranche:** Payment terms as **structured data**, and the batching **assumptions** made explicit.
**Successor to** `implementation-plan-2026-09-03.md` (Doc Pay skin economic batching, OI-138 /
OI-161 — MVP shipped 2026-09-08, plan deleted; durable rules folded into `HANDOFF.md` § Pay
Outstanding flow and `docs/gotchas.md` G7–G8).

**Museum OIs:** OI-161 (payment batching economics) · OI-138 (Doc Pay skin) — both marked MVP; this
plan carries their unfinished threads.

> **Status 2026-09-09: Packet A shipped (waves 1–2 + A5, sandbox seeded and verified). Packet C is
> the live front** — the engine knows things the screen does not show, and 5zorro cannot steer
> what he cannot see. **C0 gates everything: per-method pricing is inert in the running app until
> the view is wired.**
>
> Historical status — The two threads come from 5zorro (2026-09-08):
> *"i want to tweak the structured data from terms and the assumptions."* Packet A's data model was
> settled with 5zorro later the same day — see **Decided 2026-09-08** — and open questions 1 and 2
> are now answered. Packet B is still scoped-only. One new 🔴 question (grace vs the
> "never pay later" lock) blocks Packet A5's sample data and must be answered before fixtures land.

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

### Decided 2026-09-08 (5zorro) — the three values a bill must carry

The dashboard needs exactly three facts per bill, and only two of them exist in Vanilla:

| # | Value | Example | Native? | Home |
|---|---|---|---|---|
| 1 | **Days until payment** | `Net 30`, `2% 10 days, net 30` | ✅ fully | `due_date_based_on` + `credit_days`/`credit_months`; discount half is `discount_type`/`discount`/`discount_validity_based_on`/`discount_validity` |
| 2 | **Method of payment** | `USPS_Check`, `ACH`, `DOM_WIRE`, `INT_WIRE` | ✅ as a *label only* | `mode_of_payment` on Payment Term → template detail → `payment_schedule` row |
| 3 | **Grace period** | `+7`, `-3` | ❌ nowhere | **encoded in the Payment Term's name** — see below |

**Value 3 rides in the term name, not a Custom Field and not a Description token.** Decided by
5zorro 2026-09-08: *"having the name of the term be `Net_30_Days +7` so that it is obvious from
just looking at the name of the term… having names unique like that would make no names colliding
later."*

Why the name is the right carrier (verified against ERP source, not assumed):

- `Payment Term.autoname` is `field:payment_term_name` and that field is `unique: 1` — **the DB
  enforces the no-collisions property**, no shell-side check needed.
- `payment_schedule.payment_term` is a **Link**, already `in_list_view` on the Bill's Payment
  Schedule grid, and already inside the `frappe.client.get` payload `fetchOutstandingBills` pulls.
  So the value arrives as structured link data with **zero new fetches** — not free text a clerk can
  reword mid-bill, and not dependent on `fetch_from` propagation.
- It is legible at every point of assignment (Supplier → Template → Term), which is the whole
  point: a clerk picking a template can see the real settlement day without opening anything.
- `frappe/model/naming.py::validate_name` bans only `<` and `>`, so `+`, `-`, `%`, `,`, spaces and
  underscores are all legal in the name.

**The method goes in the name too** (5zorro 2026-09-08). Not because the name clobbers
`mode_of_payment` — they are independent fields on the same record — but because `mode_of_payment`
*lives on the Payment Term*, so "Net 30 by post" and "Net 30 by ACH" are two genuinely distinct
Payment Term records, and `unique: 1` forces them to have distinct names anyway. **Fill both**: the
name for legibility, the `mode_of_payment` link for the math.

This matters because of what Vanilla shows. The Bill's Payment Schedule grid renders only the
`in_list_view` fields — `payment_term`, `description`, `due_date`, `invoice_portion`,
`payment_amount`. `mode_of_payment` is **not** among them, so a method that lives only in the field
is one click into the row expand. In the name, it is column 1.

**Grammar** — method in parentheses, grace last, end-anchored:

```
/\s([+-]\d+)\s*$/          (grace must be the LAST token — 5zorro chose option (a) 2026-09-08)

NET_30_DAYS (POSTAL) -3   → grace  -3      mode_of_payment: USPS_Check
NET_30_DAYS (ACH) +2      → grace  +2      mode_of_payment: ACH
2%_10_NET_30 (ACH) +2     → grace  +2      mode_of_payment: ACH
NET_15 (WIRE) 0           → grace  absent  (unsigned — see below)
NET 45                    → grace  absent  (the sign requirement stops "45" reading as +45)
NET-45                    → grace  absent  (no leading space — safe failure, never a wrong number)
```

Absent is **absent**, never `0` — same A1 rule as every other term field. A bare `0` does not parse
either (no sign); write `+0` if "explicitly no grace" ever needs to be distinguishable from
"nobody said". Avoid `/` in term names: legal, but it makes poor Desk URLs. Use `2%_10_NET_30`,
not `2/10 Net 30`.

**Rejected:** the looser "signed integer anywhere in the name" grammar. It would have allowed
`NET_30_DAYS -3 (POSTAL)`, but grace-last is unambiguous by construction and needs no
"two matches → refuse" rule. Order is a naming convention the generator (see below) can enforce.

The cartesian product is smaller than it looks — a vendor is normally paid one way, so you need the
combinations actually in use, not every pairing. Five terms and five templates covered the whole
dogfood corpus.

**🔴 The cost of this encoding, accepted knowingly:** the name *is* the primary key, and Payment
Term has `allow_rename: 1`, so `frappe.rename_doc` → `update_link_field_values`
(`frappe/model/rename_doc.py:415`) rewrites `payment_schedule.payment_term` on **every historical
bill**. Changing `+7` to `+10` therefore retroactively changes what past bills say their terms were.
**House rule: never rename a Payment Term to change grace — create a new term and reassign.** A
changed grace is a different term. (The lazier path not taken: a `Grace:` line in the Payment Term's
Description would override the name without a rename — `description` is `fetch_from`-linked at both
hops with `fetch_if_empty: 1`, so it propagates and survives per-bill override. ~5 lines in the same
pure module. Not built; name it if renaming ever becomes a real workflow.)

### What grace *is*, and the three model consequences (5zorro 2026-09-09)

Grace is **not a contractual term**. `credit_days` is stated by the vendor and lives in the ledger;
grace is an **empirically observed tolerance** — "this vendor has accepted +16 for twelve years and
never raised a late fee." Same field, completely different epistemic status. Three consequences,
each of which changes code rather than just motivation. (Business rationale lives in the museum, not
in this public tree.)

1. **Observed ≠ stated, and the audit trail must say which.** B5 cannot render "Net 30 +16" as one
   undifferentiated fact. `credit_days: 30` is citable against a document; `+16` is citable only
   against payment history. An audit trail that blurs them is worthless precisely when it is needed.
   `explainPaymentTerm` already emits **separate lines** rather than a joined sentence — that turns
   out to be load-bearing, not stylistic. What it still lacks is a *provenance* marker per line.

2. **🔴 Grace is a ceiling, never a target.** The payoff is asymmetric: undershooting costs a few
   days of float, overshooting costs a late fee **plus** the standing tolerance that took years to
   establish — a one-off gain against a recurring loss. So the engine must treat recorded grace as a
   hard upper bound it may approach but never exceed, and must never "optimise" its way past one.
   Concretely: whatever consumes `applyGraceToDueDate` clamps at the deadline, and no later rule
   (batching, calendar rounding, a window widening) may push a proposal past it. **This needs its
   own test, and the test is the deliverable** — a batching optimisation that quietly overshoots by
   a day is exactly the bug this domain cannot absorb.

3. **Float captured is an OUTPUT, not just an input.** Today `apr` is only ever a cost term used to
   argue *against* paying early. The same arithmetic run across the portfolio is the number that
   justifies the feature existing, and nothing currently totals it. New step **B6** below.

- **B6 — Portfolio float capture, annualized (new 2026-09-09).** Sum, across every proposed
  payment, the float held by paying at the proposed date rather than at the naive `due_date` — then
  **express it on a standard period**, which is the whole difficulty and the actual requirement
  (5zorro 2026-09-09): *"Business cycles A/P, A/R, etc. are the precise thing that I want obvious in
  the UI because they are hard to think about and extend to be relevant on standard time periods."*

  **A per-payment sum is one turn of the payables, not a year, and presenting it as a year is the
  error to avoid.** Worked example, 5zorro's own: average AP $1,000,000, 30-day terms (≈12 turns a
  year), terms extended 5 days.

  | Framing | Arithmetic | Result |
  |---|---|---|
  | One turn (**what a per-payment sum gives you**) | `1e6 × 0.09 × 5/365` | **$1,232.88** |
  | Twelve turns — 60 days of carry | `1e6 × 0.09 × 60/365` | **$14,794.52** |
  | Cross-check via run rate | `$1e6/30 = $33,333/day` → +5 days holds `$166,667` → `× 0.09` | **$15,000** |

  The last two agree to the 360-vs-365 convention, which is the check that the annualization is
  right. So B6 needs **turnover**, not just a sum: derive it from AP data (annual purchases ÷ average
  AP balance) rather than assuming 12, and show the per-turn figure and the annualized figure
  together with the turnover that connects them. Reporting over `PaymentBatchGroup[]` plus one
  turnover read — no new economics; B2b's per-group `perPaymentFee` / `floatCost` tagging is most of
  the input.

- **B7 — Grace discovery from history: 🚫 REJECTED 2026-09-09. Do not build, do not re-propose.**
  It was scoped for one day (derive a vendor's tolerance from the distribution of payment-date minus
  due-date against late-fee incidence) and **5zorro killed it**: *"I am afraid that you are adding
  functionality to 'test and extend' the grace periods. While an AP clerk can do that, i don't want
  to make it frictionless in this UI. I still think it is somewhat questionable ethics, but an
  observable emergent property in the current system."*

  The distinction the product holds to: grace is a value a human **records from what they already
  know**, and the tool respects it as a ceiling. The tool does **not** discover it, does not search
  for it, and does not help ratchet it. Modelling an emergent property is not the same as building a
  machine to exploit it, and this is the line. Recorded as rejected rather than deferred precisely
  because it is the kind of feature that looks helpful to a future agent reading only the mechanics.

### 🔄 REVERSED 2026-09-09 — grace folds into `credit_days`; the shell does not apply it

5zorro: *"if terms say 'net 30 (postal) +16' then the total due date would be '46'. We don't have to
do anything special with 'grace'… I must not be thinking clearly about how important grace was to
your calculation, why are we parsing it again?"*

**He is right, and the earlier design was wrong.** Grace was modelled as a *second quantity the
shell applies on top of* ERPNext's due date. Putting the same number in `credit_days` puts it where
ERPNext already computes, and deletes the entire apparatus built to defend the parallel encoding.

| | Original design | Adopted 2026-09-09 |
|---|---|---|
| Payment Term | `credit_days: 30`, `+16` parsed from the name | **`credit_days: 46`** |
| Due date | ERP says day 30; shell shifts to 46 | ERP says day 46 |
| Engine input | due date **plus a parsed number** | due date |
| Parse failure | **wrong deadline → wrong `payOn` → wrong batch group** | nothing parses, so nothing breaks |

The deciding argument is the failure mode, not the line count. A name the parser refused silently
produced a wrong payment date — which is why C7 had to exist at all, to detect it, rank it by sign,
and route it to a cancel-and-amend. **C7's whole complexity was defending a problem this plan
invented.** It is also better on the property that mattered most: *"grace is a ceiling, never a
target"* was a rule every future step had to remember to honour. With `credit_days: 46` the ceiling
**is** the due date — enforced by the data, not by discipline.

#### What survives: the name, as documentation only

`NET_30_DAYS (POSTAL) +16` records where 46 came from; `NET_46_DAYS (POSTAL)` cannot. That
distinction is load-bearing for the audit trail (B5) and for the course-of-dealing framing — the
contractual term is 30 and the 16 is observed tolerance. So the convention stays and
`payment-term-grace.js` stays, **demoted from load-bearing to decorative**: a parse failure now
degrades a tooltip from "Net 30 + 16 days tolerance" to "Net 46", and never moves a date.

#### Consequences to apply

| Item | Action |
|---|---|
| `applyGraceToDueDate` | **Delete.** Zero consumers (verified 2026-09-09). The shell must never shift a due date ERPNext computed |
| `parsePaymentTermGrace` / `stripGraceSuffix` / `withGraceSuffix` | Keep. Display + the C6 modal's name builder. Their tests stay — the refusal cases still matter for *labelling*, they just no longer gate a payment date |
| `payment-term-summary.js` | Unchanged in shape; its `graceDays` is now presentational |
| The settlement composition | `deadline = dueDate` — **no grace term**. Transit and the bank calendar are unaffected |
| **C7** | **Collapses.** No malformed-name-causes-wrong-grouping class exists. See its rewritten scope |
| A5 fixtures | 🔴 **Re-seed needed.** The seeded terms carry contractual `credit_days` (30/15/10) with grace only in the name, so today's sandbox has grace recorded *nowhere the engine reads*. Each term's `creditDays` must become contract + grace |
| **New, and now the check that matters** | Does the name's arithmetic agree with `credit_days`? Name says `NET_30…+16`, term says 46 — match? This catches the real error (someone edits one and not the other) and replaces "does the name parse" as the consistency test |

### 🔴 Terms freeze at submit — there is no correction path from the dashboard

Verified 2026-09-08 against the doctype JSON: **`allow_on_submit = 0` on every payment-terms field
there is** — all 20 fields of the `Payment Schedule` child row (`payment_term`, `mode_of_payment`,
`due_date`, the discount quartet, everything), plus `Purchase Invoice.payment_schedule`,
`.payment_terms_template` and `.mode_of_payment` on the header.

The Pay Outstanding dashboard only ever shows **submitted** bills — an unsubmitted PI has no
outstanding. So whatever the terms say at submit is what that bill carries forever, short of
cancel-and-amend. Consequences that shape this tranche:

- **The dashboard cannot fix a wrong term, only display one.** A5's rationale copy must not imply
  otherwise; "why this date" is the job, not "change this date".
- **A design is dead:** letting the clerk pick a method in the check drawer and writing it back to
  `payment_schedule.mode_of_payment` cannot work. The correct mental model is that the term states
  how you *intend* to pay and the **Payment Entry** (a separate, draft doc) records how you *did* —
  `payment_entry.py::get_payment_entry` seeds `pe.mode_of_payment` from the invoice **header**
  field, not the schedule row.
- **Divergence must happen at entry.** Per-bill difference is easy *before* submit — three native
  routes: swap `payment_terms_template` on the header (`rw`, gated `!is_paid && !is_return`), edit
  the schedule row's `payment_term` cell inline (`rw` **and** `in_list_view`), or take the Supplier
  default (`Supplier.payment_terms` only *seeds* the bill). All three shut at submit.

**One free fact:** `payment_schedule.mode_of_payment` is written by ERPNext and consumed **nowhere**
in the general path — the only real consumer in the whole codebase is Italian e-invoicing
(`regional/italy/utils.py`). And the header `Purchase Invoice.mode_of_payment` sits in a section
gated `depends_on: eval:doc.is_paid===1||(doc.advances && doc.advances.length>0)`, so it is
invisible on a normal unpaid bill. The schedule row's mode is therefore uncontested structured data:
nothing recomputes it and nothing will fight us over it.

### The settlement composition (what Packet B's math becomes)

Values 1–3 stop being three display strings and become one date chain. Grace shifts the **deadline**;
postal/transit float belongs to the **method**, not the vendor — that split is deliberate, so each
number has exactly one cause and mail float can never be double-counted:

```
deadline = dueDate + graceDays              (from the term name; absent → dueDate unchanged)
release  = deadline − method.transitDays    (USPS_Check ~5, ACH ~2, DOM_WIRE 0)
payOn    = effectivePayByDate(release, { includeBlur })
floatCost = apr × amount × (deadline − payOn − method.clearDays) / 365
```

`Mode of Payment` is a bare label in Vanilla — `mode_of_payment`, `type` (Cash/Bank/General/Phone),
`accounts`, `enabled`, and nothing else. So the **name** of the method is ERP truth and its
**economics** (`fee`, `transitDays`, `clearDays`) are shell prefs, exactly the class
`payment-batch-prefs.js` already holds. This is the same change B2 already wanted.

### Steps (pure first, per the invariant)

- **A1 — ✅ LANDED 2026-09-08.** Extend `OutstandingBillRow` with the term fields, in `outstanding-bills.js`. Additive
  and optional: absent fields must stay absent (never `""` or `0`), so callers can still tell "no
  term recorded" from "Net 0". Extend `explodeInstallments` to carry per-installment values rather
  than the header's.
- **A2 — ✅ LANDED 2026-09-08.** A pure `src/payment-term-summary.js`: given a schedule row, produce the short human label
  ("2/10 Net 30", "Net 30", "Due on receipt") and a longer explanation. Derive from
  `discount`/`discount_validity`/`credit_days` when `payment_term` is absent, since the link is
  optional on the child row. **Never invent a term that is not in the data.**
- **A2g — ✅ LANDED 2026-09-08.** A pure `src/payment-term-grace.js`: `parsePaymentTermGrace(termName)` → signed int or
  `undefined`, plus a `withGraceSuffix` / `stripGraceSuffix` pair so the label in A2 can show
  "Net 30" and the grace separately rather than printing the raw key. Mirrors `credit-memo.js`'s
  parse/strip/with trio. Table-driven tests must cover `NET 45` and `NET-45` returning `undefined`.
- **A3 —** Surface it. The suggested-payment node has no room (see `flow-node-density.js` — a
  one-row node is already full); the natural homes are the schedule row's title/tooltip, the
  rationale popup, and the check drawer's stub. **Do not** add a column without re-measuring: the
  invoice column is 208px precisely because a full naming-series name plus its peek button needs it.
- **A4 —** Respect `mode_of_payment` where the schedule row states one, instead of asking.
- **A5 — Seed the sandbox, because none of this is visible today.** Verified 2026-09-08 against the
  live DB: **one** Payment Term exists (`NET 45`, no mode, no description); the `NET 30 DAYS`
  template has a **NULL `payment_term`** so no term name can ever reach a bill from it; exactly one
  supplier (`ALPINE SUPPLY`) has terms and **every `SAMPLE Vendor …` has `payment_terms = NULL`**;
  every `payment_schedule` row in the sandbox has NULL `payment_term`, `mode_of_payment` and
  `description`; and `Mode of Payment` holds only the five ERPNext stock rows (`Bank Draft, Cash,
  Check, Credit Card, Wire Transfer`) — none of the four we need. Seeding is therefore a
  prerequisite for A3/A4 having anything to render, not a nice-to-have. Extend
  `ops/sample-data/` + `src/sample-data/corpus-plan.js` with: the four Modes of Payment, ~5 Payment
  Terms carrying grace suffixes, a template per term, and an assignment across the SAMPLE vendors.
  **Gotcha:** `credit_days` / `due_date_based_on` only copy through on a **PO → Bill** path when
  Accounts Settings `automatically_fetch_payment_terms` is on (`accounts_controller.py::
  fetch_payment_terms_from_order`); a Bill created straight from a template always gets them.

### ✅ Waves 1–2 landed 2026-09-08 — what exists now

All pure, all unit-tested, `npm test` green. No Electron wiring yet (invariant 3).

| Module | Exports | Notes |
|---|---|---|
| `src/payment-term-grace.js` *(new)* | `parsePaymentTermGrace`, `stripGraceSuffix`, `withGraceSuffix`, `applyGraceToDueDate` | 32 tests. The refusal cases (`NET 45`, `NET-45`, grace-not-last) are pinned individually — each is a silent wrong payment date if the grammar ever starts guessing |
| `src/payment-term-summary.js` *(new)* | `paymentTermLabel`, `summarizePaymentTerm`, `explainPaymentTerm` | 20 tests. `explainPaymentTerm` returns a **list of lines, not a paragraph**, so B5 can attribute each claim separately |
| `src/outstanding-bills.js` | `+ pickTermFields`, `+ attachTermFields` | 12 new tests. Twelve term fields carried; absent stays absent; each installment gets **its own** term, never the header's |
| `src/payment-batch-prefs.js` | `+ DEFAULT_PAYMENT_METHOD_FEES`, `+ CHEQUE_METHOD`, `+ paymentMethodFee`, `+ paymentMethodFeeResolver` | 12 new tests. `USPS_Check` stays derived from the existing `postage`+`perCheck` prefs, so the panel inputs keep working with no migration |
| `src/payment-batch-economics.js` | `paymentBatchEconomics` gains optional `feeForMethod` | 10 new tests. Omit it → byte-identical to before, which is what keeps the un-wired view correct today |

Two shape decisions worth not re-litigating:

- **`method` is read from `mode_of_payment`, never parsed out of the term name.** The `(POSTAL)` in
  a name is decoration for humans; parsing it would create the second source of truth the whole
  encoding decision was avoiding. A test pins the disagreement case: name says `(POSTAL)`, field
  says `ACH`, the field wins.
- **An unknown method is priced at the cheque fee, never `$0`.** Every `payment_schedule` row in the
  sandbox is NULL today, and a zero fee would make the engine invent savings that do not exist.

**Deliberately not done in these waves:**

- **B3** — its original scoping ("expose `includeBlur` as a boolean pref") was **rejected by 5zorro
  on 2026-09-08**, mid-wave. Building it would have shipped the wrong shape; see the re-scoped B3.
- **The view still computes `perPaymentFee: prefs.postage + prefs.perCheck` inline**
  (`pay-outstanding.src.html:1417`). `paymentMethodFee` is the function it should call and
  `paymentMethodFeeResolver(prefs)` is the argument `paymentBatchEconomics` now takes — but that is
  Electron-layer wiring plus a re-run of `scripts/assemble-pay-outstanding-html.js`, so it belongs
  with A3/A4, not here. **Until it is wired, per-method pricing is inert in the running app.**
- **`transitDays` / `clearDays`** — still unanswered by 5zorro, still deliberately absent rather
  than guessed.

### 🟡 Payment Terms Generator — scoped 2026-09-08, **superseded 2026-09-09 by Packet C6**

> **Read C6 first.** 5zorro asked for this twice and it is now **in scope**, with a second launch
> point on the Pay Outstanding assumptions panel. The analysis below is still correct about the
> *shape* (a modal on surfaces we own, never a Doc skin on `Payment Term`); only its "not this
> tranche" conclusion is out of date — A5 shipped, which discharged the reason for waiting.

5zorro (2026-09-08): *"We could even stick in a 'Payment Terms Generator' modal that will make this
process painless/frictionless… Is it too much scope creep to have a 'payment terms entry doc skin'
that explains all the stuff that was not obvious?"*

**Answer: build the modal, never the Doc skin.** Three findings settle the shape.

1. **A Doc skin on Payment Term would break invariant 6.** HANDOFF: Doc skins stay scoped to the
   *transaction-entry forms* (PO, IR, Bill, Payment Entry, SO, SI, Quotation, JE) — "not spread
   across list views, reports, or other Vanilla surfaces." Payment Term is a master/setup doctype.
   Do not build a lens on it and do not call this one.
2. **The seam already exists and is already wired.** `link-search.js:59` already emits a
   `Create new Payment Terms…` action on the Bill Doc skin's `payment_terms_template` picker —
   *always*, not only when the search is empty — and `link-picker-ui.js:127` routes it to
   `api.openPaymentTermsAdd()`, which **peeks out to Vanilla's own template form** and relies on Esc
   to return. The generator is therefore a **replacement for an existing hop**, not new surface:
   same entry point, same trigger, better destination. Same architectural class as the credit-memo
   source picker.
3. **It removes a known sharp edge instead of adding one.** `docs/bug-bounty-setup-peek-return.md`
   is precisely this hop — Bill → create a master in Vanilla → no way back, draft lost — found twice
   and fixed 2026-08-20. A modal never leaves the Bill, so it cannot re-enter that class.

**Where it belongs:** the Bill's terms picker, which is where it already is. Not the dashboard.
5zorro's reasoning — *"a user will likely go to the payments section and look around there"* — is
right about **reading** and wrong about **creating**: by the time a bill reaches Pay Outstanding it
is submitted and frozen (see the 🔴 section above), so the dashboard can only explain a term, never
repair one. Dashboard explains; Bill picker creates.

**Why it waits for the next tranche** — sequencing, not appetite:

- Packet A is **read-only** by 5zorro's own answer to open question 1. A generator writes
  `Payment Term` + `Payment Terms Template` records. That is a *master* write with no ledger posting
  — materially lower-risk than the three idle financial write paths — but it is still a new write
  path opened while three sit unverified.
- **A5 proves the shape first.** The seed must create these exact records anyway; once seeded terms
  demonstrably drive the economics correctly, the modal is a thin UI over a proven shape and its
  spec is free — it is whatever `corpus-plan.js` had to encode. Designing the form before knowing
  what it must produce is the expensive order.

**What it must do when built** (so A5 can leave the door open): enforce the naming convention
(`CREDIT_PERIOD (METHOD) ±GRACE`, grace last) rather than trusting typing; set `mode_of_payment` on
the term to match the `(METHOD)` it wrote; create the wrapping single-row Payment Terms Template in
the same action, since a Supplier can only link a Template; and refuse to create a name that
collides — though `unique: 1` will refuse for us, a readable message beats a Frappe traceback.

### Explicit non-goals for Packet A

- No new ERP fields, no Custom Fields, no doctype changes (Clean Core).
- No **writing** to `payment_schedule` from this surface. `bill-payment-schedule.js` already owns
  header-due-date ↔ schedule sync for the Bill Doc skin; this tranche reads only.
- ~~**No Payment Terms Generator modal**~~ — **reversed 2026-09-09, see C6.** The shell will create
  Payment Term / Payment Terms Template masters. Creating a term master is **not** a write into
  `payment_schedule`, so the read-only non-goal on bill data above is unaffected and still stands.
- **No Doc skin on `Payment Term`, ever** — invariant 6. This is a rule, not a schedule item.

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
- **B2a — ✅ PURE HALF LANDED 2026-09-08** (view still calls the old inline sum; see below). Move fee composition out of the view, and make it per-method.** `perPaymentFee:
  prefs.postage + prefs.perCheck` is business logic sitting in `pay-outstanding.src.html:1417`. It
  belongs in `payment-batch-prefs.js` as a derived value, so the shell and any future surface cannot
  disagree about what a payment costs. Packet A's decision widens this: the scalar becomes a lookup
  keyed by `mode_of_payment`, each entry `{ fee, transitDays, clearDays }`. `postage + perCheck`
  survives as the `USPS_Check` entry, so existing prefs migrate rather than break.

  **Real costs (5zorro 2026-09-08):**

  | Method | fee | Source |
  |---|---|---|
  | `USPS_Check` | **$0.83** | `postage 0.78 + perCheck 0.05` — the existing prefs, unchanged |
  | `ACH` | **$0.40** | per push |
  | `DOM_WIRE` | **$25.00** | per push |
  | `INT_WIRE` | **$50.00** | $25 push + $25 international intermediary. **Flat by decision** — 5zorro is not modelling intermediary count, so this is one number, not a multiplier |

  `transitDays` / `clearDays` are **still unanswered** — do not invent them. They change *when* a
  payment is released and how much float survives it, so a guess is a wrong number on screen, not a
  placeholder.

- **B2b — ✅ LANDED 2026-09-08.** Cluster by `(supplier, method)`, not by supplier.** Discovered 2026-09-08 and not in the
  original scope: **a Payment Entry carries one header `mode_of_payment`**, so bills paid different
  ways cannot merge into one payment no matter what the economics say. `paymentBatchEconomics` today
  takes a single `perPaymentFee` per call and the view calls it once per supplier
  (`pay-outstanding.src.html:1417`), so a vendor whose bills carry different terms would be offered
  an impossible batch. This is an engine change, not a prefs swap, and it must land with B2a rather
  than after it.

- **B2c — Re-examine whether batching still earns its place per method.** With the real numbers the
  feature's value is almost entirely a **wire** story. Breakeven — how many days early a bill can be
  pulled before float exceeds the fee saved, at `apr 0.09`, is `fee × 4055.6 / amount`:

  | Method | Fee | Breakeven, $5,000 bill | Breakeven, $500 bill |
  |---|---|---|---|
  | `ACH` | $0.40 | **0.3 days** | 3.2 days |
  | `USPS_Check` | $0.83 | 0.7 days | 6.7 days |
  | `DOM_WIRE` | $25.00 | 20.3 days | always batches |
  | `INT_WIRE` | $50.00 | 40.6 days | always batches |

  So at a 7-day window, ACH and cheque bills of any real size should come back **pay-alone** except
  where dates already coincide (the free same-day subset `coalesceSameDayPayAlone` already handles),
  and wires should batch essentially always. That is the engine working correctly, not a bug — but
  the dashboard currently implies batching is the interesting answer everywhere. **B1's copy must
  not oversell a $0.40 saving**, and it is worth checking during dogfood whether a mostly-ACH vendor
  card reads as broken when every row says "paid alone".
- **B3 — 🔴 RE-SCOPED 2026-09-08. Not a pref — a user-signed-off delay calendar.**
  The original step ("expose `includeBlur` as a boolean") is **wrong and must not be built.**
  5zorro rejected the heuristic outright: *"this should not be mathematical, it should be
  mathematically suggested then signed off by the user before using as a SSOT for postage… A
  determined user should be able to class whatever they want as a 'delay date' so that they could
  add weather events, etc."*

  Three separate corrections, all needed:

  1. **The shipped rule is wrong in both directions.** `isBlurDay` fires only on Fridays, for
     *Friday before a Monday holiday* **or** *Friday after a Thursday holiday*. The correct concept
     is the **bridge day** — the lone workday between a holiday and a weekend, when staff take the
     long weekend: **Thu holiday → Fri**, and **Tue holiday → Mon**. So the built rule contains one
     case 5zorro did not ask for (Fri before a Mon holiday — nobody is off yet) and is **missing**
     Mon-before-a-Tue-holiday entirely.
  2. **Delay is method-scoped.** *"ACH is bank days only, so the postage can't delay from a
     holiday."* Electronic methods (`ACH`, `DOM_WIRE`, `INT_WIRE`) observe **bank** non-processing
     days only. Only `USPS_Check` observes postal delay days on top. One calendar for every method
     is as wrong as one calendar for every vendor was.
  3. **The algorithm proposes; the user ratifies.** The computed set is a *suggestion*, and the
     persisted, user-confirmed list is the SSoT. Federal holidays are not the real postal calendar —
     5zorro's counterexample: *"Good Friday is not a federal holiday, but postage got really delayed
     around that time."* Users must be able to add arbitrary dated entries (weather events, local
     closures) with a reason.

  Shape this implies: `usFederalHolidays` + a corrected bridge-day rule generate **proposed** delay
  dates; a `userData` list of `{ date, reason, scope: "postal"|"bank", source: "suggested"|"user" }`
  is what `effectivePayByDate` actually consults. Unratified suggestions must be visibly
  unratified — never silently authoritative, which is the exact failure being corrected.

- **B5 — The audit trail (new, 5zorro 2026-09-08).** *"there may be an easily disclosed 'audit
  trail' of how the batching and payment date is calculated."* This is the endgame the other steps
  feed, and it is a **constraint on how they are built, not a later add-on**: every transformation
  between `due_date` and `payOn` must be *recordable*, not merely computed. Concretely — the date
  pipeline returns an ordered list of steps (term due date → grace → transit → calendar rounding,
  each with its input, output and the rule that fired) rather than a bare string, and the batching
  decision records the fee, the float and the comparison that chose. B1 renders a short form of it;
  B5 is the full disclosure. **Build the seam in waves 1–2 or pay to retrofit it.**
- **B4 — Per-vendor overrides, only if Packet A justifies them.** `effectivePayByDate`'s `opts` is
  already the seam. **Decide after A**: if `credit_days` / `due_date_based_on` turn out to carry the
  real vendor difference, a shell-side override table is redundant and should not be built.

### Constraint that does not move

Prefs stay in `userData` JSON. They are company judgment calls with no ERPNext field to hold them
(confirmed in the closed tranche's Packet 0), and writing them into ERP would breach Clean Core.

---

## Packet C — Show the work (dogfood direction, 5zorro 2026-09-09)

**Why this packet exists, in 5zorro's words:** *"it is difficult to give feedback and direction
without me seeing what is being applied and dogfooding it."* Packets A and B put real structure
behind the numbers; **none of it is on screen**, so the feedback loop is closed to the only person
who can judge it. Packet C is the rendering debt, and it outranks further engine work.

**Sequencing rule for this packet:** pure module first, render second — but the *reason* is
different from usual here. Every item below is ultimately "explain a number", and an explanation
that is computed inside a template cannot be tested, reused by the check drawer, or audited. So
each C-step names the pure module that must exist before its pixels do.

### C0 — 🔴 Wire the view. Nothing else in Packet C matters until this lands.

`pay-outstanding.src.html:1417` still computes `perPaymentFee: prefs.postage + prefs.perCheck` and
never passes `feeForMethod`, so **B2a and B2b are inert in the running app** — ACH and wire are
priced identically on screen today despite the engine knowing better. Replace the inline sum with
`paymentMethodFeeResolver(prefs)` from `payment-batch-prefs.js`, then re-run
`scripts/assemble-pay-outstanding-html.js`. This is the smallest change on the list and it gates
every judgement 5zorro can make about the rest.

### C1 — The prefs panel is the wrong shape

Today it is four ungrouped inputs: `APR %`, `Postage $`, `Per Check 0.05`, `Batch window days`.
That shape encodes the pre-B2a world where one flat fee covered every payment. What 5zorro asked
for:

| Ask | Note |
|---|---|
| An explicit **ACH transaction cost** input | $0.40 today, currently unreachable in the UI |
| An explicit **check transaction cost** | It is *composed* — see below |
| *"at least a border around the two inputs that contribute"* | `Postage` + `Per Check` must read as **parts of one number**, with the composed total visible. They are the only two inputs that combine, and nothing on screen says so |
| Relabel APR as *"cost/relief of paying early/late"* | The current label states a rate; the ask is to state its **effect, in both directions**. Post-grace this genuinely runs both ways — paying late is relief, not just cost |

Wire costs (`DOM_WIRE` $25, `INT_WIRE` $50) get inputs on the same footing. `DEFAULT_PAYMENT_METHOD_FEES`
is already the SSoT; this is the panel catching up to it. Keep `methodFees` as the override map —
`paymentMethodFee` already validates entries individually, so one bad box cannot void the panel.

### C2 — Two delay calendars, as editable CSV (this is B3's concrete shape)

5zorro: *"CSV showing postal days with delays, CSV showing ach days with delays (mathematically
generated, but can be altered by a user)."* This supersedes B3's prose with a UI contract:

- **Two calendars, not one.** `ACH is bank days only, so the postage can't delay from a holiday.`
  Electronic rails observe bank non-processing days; only `USPS_Check` observes postal delay days
  on top. One calendar for every method is as wrong as one calendar for every vendor was.
- **Generated, then editable.** The corrected bridge-day rule proposes; the user ratifies; the
  ratified list is the SSoT. Unratified suggestions must render as unratified.
- **CSV is the interchange format**, because the user must be able to paste in a year of local
  knowledge (weather closures, a carrier strike) without a bespoke editor. Round-trip: export the
  generated set, edit, re-import.
- Pure module owns parse/serialise/merge; the panel only moves strings.

### C3 — Mode of payment is not legible on the dashboard

*"the mode of payment is unclear from the invoice as it currently renders."* It is now real data on
every seeded bill (`payment_schedule.mode_of_payment`, 100% coverage on the real company as of
2026-09-09) and the dashboard shows none of it. Needs to appear on the invoice row **and** on the
suggested-payment node, because the node is where the method explains the fee. Re-measure before
adding a column — the invoice column is 208px for a reason (see `flow-node-density.js`).

### C4 — Non-blocking validation chips

*"There should probably be a non-blocking warning emoji that makes a balloon on click explaining
that non-blocking validation."* The first and most important case is already true and already
invisible:

> **A vendor's bills paid by different methods will never batch together** — one Payment Entry
> carries one `mode_of_payment`. B2b enforces this; nothing tells the clerk. Today it reads as the
> engine failing to find an obvious saving.

Answering 5zorro's own question in the plan, because it is a recurring one: **no, mode of payment
is not fixed per vendor.** It lives on the `payment_schedule` row, so one vendor can have a cheque
bill and an ACH bill — and a single bill can even carry two installments on different rails. That
is exactly the case that must explain itself rather than look broken.

Chip candidates beyond that: a bill with no recorded term; a term whose name encodes no grace; a
discount window already expired. All advisory, none blocking — the skin reflects state, it does not
gate on it (HANDOFF invariant 7).

### C5 — The bumps, itemised (this is what B5 is *for*)

5zorro: *"It is difficult for me to audit the grouping bumps for each payment's suggested schedule.
(was it 2 weekend days, 1 blur day, 1 holiday, and 1 user entry OR was it exactly on time)"*

This is the sharpest statement of the audit-trail requirement so far, and it is a **data-shape
requirement before it is a UI one**. `effectivePayByDate` currently returns a bare string, so the
information needed to answer that question is destroyed inside the loop that computes it.

**🔴 Step 0 is the due date's provenance, not the term's arithmetic** (5zorro 2026-09-09:
*"if a terms is specified but there is a separate 'due date' say 'DUE DATE OVERRIDING TERMS' or
something in the beginning portion of the bump"*).

The schedule row's own `due_date` is the real obligation; the term name is a *claim about* it. They
can legally disagree, and **ERPNext will not tell you** — verified 2026-09-09 in
`party.py::validate_due_date_with_template`, which throws only when
`due_date > template default`. An **earlier** due date passes in complete silence, and holding the
`credit_controller` role downgrades even the late case from a throw to a notice. So a bill can carry
`NET_30_DAYS (POSTAL) +16` while its stored due date is posting + 10, with nothing anywhere saying
the term is not being obeyed.

The derivation therefore **always starts from the stored `due_date`**, never from `credit_days`
arithmetic, and its first row states which of the two it is:

- `Due date  2026-08-31  from term NET_30_DAYS (POSTAL) +16` — they agree.
- `⚠ DUE DATE OVERRIDING TERMS  2026-08-11  term implies 2026-08-31 (−20)` — they do not. Everything
  below this row is computed from the stored date, because that is what the vendor is owed.

Required: a pure `src/payment-date-derivation.js` returning an **ordered list of steps**, each with
its rule, its input, its output and its day delta:

```
term due date        2026-08-31   (Net 30 from 2026-08-01)
grace                2026-09-16   +16   name suffix
transit              2026-09-11    -5   USPS_Check
weekend              2026-09-11     0   —
holiday              2026-09-11     0   —
user delay entry     2026-09-10    -1   "carrier backlog" (ratified)
                     ─────────────────
proposed pay date    2026-09-10    total -6 from due date
```

"Exactly on time" must be *representable* — a derivation with zero bumps renders as a single row
saying so, not as an empty popup. B1 renders the short form of this; C5 is the full disclosure; B6
sums the float column across the portfolio.

### C6 — Terms creation modal, launched from the dashboard's assumptions panel

5zorro 2026-09-09: *"I also wanted to see a 'terms creation modal' button or something from the
same assumptions payment dashboard doc skin."*

**This revises the 2026-09-08 deferral of the Payment Terms Generator.** That deferral rested on two
reasons; one is now discharged and the other has been overruled:

- *"A5 proves the shape first"* — **discharged.** A5 shipped. `seed_corpus.py::_ensure_payment_terms`
  creates Payment Term + single-row Template pairs that demonstrably drive real bills, including the
  two non-obvious parts (the template detail row needs its own explicit field copy because
  `fetch_from` is client-side only; the due date must come from `get_due_date_from_template` or
  ERPNext throws). The modal mirrors a proven shape rather than inventing one.
- *"Packet A is read-only"* — **overruled by 5zorro**, who has now asked for this twice. Note what
  it does and does not open: creating a **Payment Term master** is not a write into
  `payment_schedule`. The read-only non-goal on bill data stands unchanged.

**🔴 The distinction this modal must not blur.** Terms freeze at submit. A button on the dashboard
cannot fix the bills displayed beneath it, and the obvious naive implementation will look like it
does. It creates or edits **term masters for future bills**. The dashboard is the right place to
*notice* the setup is wrong ("why does this vendor show no grace?") and the wrong place to imply a
retroactive fix. Copy must say which bills a new term will and will not affect, and the modal must
not offer to re-point an existing bill at it.

Two launch points, one modal, one pure planner:

| Surface | Why it belongs there |
|---|---|
| Bill Doc skin's `payment_terms_template` picker | Already wired — `link-search.js:59` emits `Create new Payment Terms…` and `link-picker-ui.js:127` peeks out to Vanilla. This is the **last moment the decision is changeable**, and the modal replaces a hop with a known sharp edge (`docs/bug-bounty-setup-peek-return.md`) |
| Pay Outstanding assumptions panel (**new**) | Terms *are* assumptions in the economic model, and this is where a missing grace or a wrong method becomes visible. Sits beside the C1 cost inputs |

Still not a Doc skin on `Payment Term` — invariant 6 is unchanged and not negotiable. This is a
modal on two surfaces we already own.

What it must enforce (all of it already encoded in A5's fixtures and A2g's grammar): the
`CREDIT_PERIOD (METHOD) ±GRACE` name with grace **last**; `mode_of_payment` set to match the
`(METHOD)` it writes; the wrapping single-row Template created in the same action; a readable
collision message ahead of `unique:1`'s traceback; and the 🔴 rename warning — changing a term's
name rewrites `payment_schedule.payment_term` on every historical bill, so the modal offers
"create new and reassign", never "rename".

### C7 — 🔄 MOSTLY COLLAPSED 2026-09-09 — name/`credit_days` disagreement only

> **Superseded in scope.** Once grace folds into `credit_days` (see the reversal in Packet A), a
> name the parser refuses can no longer produce a wrong payment date or a wrong batch group, so the
> severity ranking, the float-stake table and the cancel-and-amend remedy below are all **no longer
> warranted** — they were defending a failure mode that no longer exists. What remains worth
> building is one cheap consistency check: **the name's arithmetic vs the term's `credit_days`**
> (`NET_30_DAYS (POSTAL) +16` should mean 46). A mismatch means someone edited one and not the
> other, and it is advisory — the engine uses `credit_days` and is correct either way.
>
> The analysis below is kept because it is the record of *why* the encoding changed, and because
> the cancel-and-amend reasoning stays true for any future case where a submitted bill genuinely
> carries the wrong term. Do not build it as written.

#### (Historical) When the term name defeats the parser

5zorro 2026-09-09: *"this dashboard is going to need to gracefully say 'your terms name is screwing
up the engine, go and make a new one that is functionally the same but has a proper name'."*

**This is the acknowledged cost of encoding grace in the name** (see *Decided 2026-09-08*). A Custom
Field cannot be malformed; a name can. We took the name for four good reasons — DB-enforced
uniqueness, a Link field rather than free text, visibility in the Payment Schedule grid, no
`fetch_from` dependency — and this step is the price. It is not a reason to reopen the decision, and
loosening the grammar is **not** the fix: a permissive parser trades a visible failure for a silent
wrong number, which in this domain is strictly worse. Detect, explain, and guide the correction.

#### Three states, not two — and only one of them is a warning

The trap is treating "no grace" as an error. Plenty of terms legitimately claim none; `NET 45` is a
real term. Warning on those is noise that trains the clerk to ignore the chip.

| State | Example | Engine behaviour | Surface |
|---|---|---|---|
| **Parsed** | `NET_30_DAYS (POSTAL) -3` | grace −3 applied | nothing |
| **No claim** | `NET 45`, `NET_30_DAYS (ACH)` | grace absent → treated as 0 | quiet marker at most. Not a warning — silence here is a legitimate statement |
| **🔴 Malformed** | `NET_30_DAYS -3 (POSTAL)` | grace absent → treated as 0, **contrary to the evident intent** | warning chip + proposed name + route to C6 |

#### Detecting the third state

A malformed name is one that contains a plausible grace token in a position the grammar refuses.
`payment-term-grace.js` deliberately refuses these rather than guessing — C7 re-reads the same names
with a *diagnostic* pass whose only job is to explain a refusal, never to feed a number to the
engine. Cases seen or likely:

| Name | Why it refuses | Evident intent |
|---|---|---|
| `NET_30_DAYS -3 (POSTAL)` | signed token present but not last | −3 |
| `NET_30_DAYS+7` | no whitespace before the sign | +7 |
| `NET_30_DAYS 7` | trailing integer with no sign | ambiguous — 7 or a credit period? |
| `NET_30 +2 -3` | two signed tokens | ambiguous, refuse to pick |
| `NET-45` | hyphen-number reads as a token | probably none; low confidence |

#### 🔴 Severity depends on the sign, and it is not symmetric

This is the part worth getting right, because the two failure modes are not equally bad:

- **A malformed *negative* grace is a risk of being late.** `NET_30_DAYS -3 (POSTAL)` intended "must
  land 3 days early"; parsed as absent it becomes grace 0, and the engine proposes paying on the due
  date — **3 days later than the vendor actually tolerates.** That is a late fee and a damaged
  standing tolerance, which is the asymmetric loss the whole grace model exists to protect.
- **A malformed *positive* grace is lost float.** `NET_30_DAYS +16` parsed as absent pays 16 days
  earlier than needed. Conservative, safe, and expensive — at $1M average AP that is real money
  (see B6).

So the chip ranks malformed-negative above malformed-positive, and says which kind it is. A
generic "bad name" chip would flatten a late-payment risk into a formatting nit.

#### The consequence chain the warning must state

5zorro 2026-09-09 wrote the message himself, and it is more complete than the version this step
originally carried:

> *"THIS BILL HAS AN INCOMPATIBLE TERMS NAME-SHAPE, IT WILL NOT BE GROUPED both ECONOMICALLY and
> correctly ACCORDING TO THESE assumptions until it has a compatible terms name shape (see modal
> button above) and is cancelled and amended to use the proper terms shape."*

Two things that earlier drafts of C7 got wrong, both worth naming:

1. **The damage is not confined to the grace number.** A missed grace shifts the deadline, which
   shifts `payOn`, which changes which `groupWindowDays` cluster the bill lands in — so the bill is
   mis-*grouped*, not merely mis-dated, and the batch it should have joined is costed without it.
   The warning says "will not be grouped correctly", not "grace not read".
2. **Creating a corrected term does not fix the bill in front of you.** Terms freeze at submit
   (`allow_on_submit = 0` on every field). A new term only helps *future* bills. Repairing **this**
   bill additionally requires **cancel and amend**. The original C7 remedy stopped at "create the
   term" and was therefore incomplete — it would have left a clerk believing a warning was resolved
   when the bill on screen was unchanged.

#### The remedy is constrained, two-part, and must not be demanded

The obvious instinct — "fix the name" — is **wrong and must be actively discouraged**. Payment Term
has `allow_rename: 1`, so renaming rewrites `payment_schedule.payment_term` on every historical
bill (`frappe/model/rename_doc.py::update_link_field_values`), retroactively changing what past
bills say their terms were. 5zorro's phrasing is the house rule:

> *make a new one that is functionally the same but has a proper name*

So the chip's action is **"Create corrected term"**, never "Rename". It opens C6's modal pre-filled
with every field copied from the offending term and the name rewritten to the convention —
`withGraceSuffix(stripGraceSuffix(name), intent)` — so "functionally the same" is mechanical rather
than retyped. Step two, cancel-and-amend, is stated as the requirement it is, and is **not**
automated from this surface: cancelling a submitted bill reverses its GL entries and cascades into
anything allocated against it.

**🔴 Show the stake, then let the clerk decide.** Cancel-and-amend is disruptive, and whether it is
worth doing depends entirely on a number the dashboard can already compute:

| Case | Cost of leaving it | Worth amending? |
|---|---|---|
| `+16` misparsed on a $5,000 bill | ≈ $19.72 of lost float | almost certainly not |
| `+16` misparsed on a $500,000 bill | ≈ $1,972 | probably |
| `−3` misparsed, any size | a **late fee** and the standing tolerance that took years to earn | usually, and urgently |

So the chip carries the float delta for *that bill* (B6's arithmetic, one row instead of the
portfolio) and, for the negative case, says plainly that the exposure is a late payment rather than
a sum. A warning that demands cancel-and-amend for $19.72 of float will be dismissed on sight, and
the one that mattered will be dismissed with it.

#### Pure module

`src/payment-term-name-health.js` — `classifyPaymentTermName(name)` returning
`{ state, intent?, confidence, reason, proposedName? }`. It imports the grammar from
`payment-term-grace.js` rather than restating it; a diagnostic that can drift from the parser it
diagnoses is worse than none. Table-driven tests over every row above, plus the negative control
that **no legitimately grace-free name ever classifies as malformed** — that false positive is the
one that kills the feature.

Feeds C4's chip mechanism and C6's modal. Cheap, entirely pure, and worth doing **early** —
5zorro's sandbox already contains `NET 45` and a `NET 30 DAYS` template with a NULL `payment_term`,
so the "no claim" path has live examples to render against today.

### Order

`C0` (unblocks all dogfooding) → `C5` + `C7` pure modules → `C3` + `C1` (the screen starts telling
the truth about methods and costs) → `C5` render + `B1` → `C6` → `C4` (renders C7) → `C2`/`B3`.

`C7`'s classifier rides along with `C5`'s derivation module: both are pure, both are cheap, and both
are inputs the rendering steps need to exist before they can show anything honest. `C7` has no
render of its own — it produces the content `C4`'s chip displays and the pre-fill `C6`'s modal
opens with.

`C6` lands after the screen is legible: the modal's whole justification is fixing what the dashboard
just showed you was wrong, so it is worth little before C1/C3/C5 make that visible — and its pure
planner is cheap once A2g's grammar and A5's shape are both proven, which they now are.

`C4` is explicitly lower priority per 5zorro (*"We probably could do some pure work first"*), and
`C2` is last because it is the largest surface and the least blocking — the generated calendar is
already correct-ish once B3's bridge-day bug is fixed; user ratification is the improvement, not
the fix.

---

## Open questions for 5zorro (do not guess these)

1. ~~**"Tweak" — read, or edit?**~~ **Answered 2026-09-08: read.** Packet A reads term structure and
   Packet A5 *seeds* it; nothing in this tranche writes to `payment_schedule`. The non-goal below
   stands.
2. ~~**Which term facts actually matter on the dashboard?**~~ **Answered 2026-09-08:** three, and
   only three — the credit period (`credit_days` + the discount quartet), `mode_of_payment`, and the
   grace suffix parsed off `payment_term`. Everything else in the fifteen-field baseline is
   drawer-only or unwanted. See **Decided 2026-09-08** in Packet A.
3. ~~**Does grace get to move a payment later than `due_date`?**~~ **Answered 2026-09-08: yes.**
   5zorro: *"positive grace would mean that I am sending the payment after the due date. The
   rounding rule was for simplicity and for the most broad and general of rules to be able to be
   applied consistently without causing weird late fees that are hard to audit."*
   **The lock is hereby narrowed in writing:** *"always pay earlier, never later"* governs
   **bank-calendar rounding only** — which direction `effectivePayByDate` walks when a date lands on
   a non-processing day. It does **not** constrain the deadline. A `+7` term legitimately proposes a
   pay date after `due_date`. A5 fixtures may use positive grace.
4. ~~**Is the blur-day rule right?**~~ **Answered 2026-09-08: no — rejected and replaced.**
   See **B3 (re-scoped)** below. The shipped heuristic is wrong in both directions and the whole
   "algorithm is the SSoT" premise is wrong. Do not tune `isBlurDay`; replace what it feeds.
5. **Do the three write paths get their live-sandbox run this tranche?** They are built and idle.
6. **Trace: keep or delete?** See residuals — a decision, not a tuning exercise.

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
