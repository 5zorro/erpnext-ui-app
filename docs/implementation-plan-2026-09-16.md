# Implementation plan — 2026-09-16

**Tranche:** Pay Outstanding corrections (the method override, the overdue clamp), the delay
calendar panel, and the terms-name builder.
**Successor to** `implementation-plan-2026-09-08.md` (payment terms as structured data + the
batching assumptions). That plan is **superseded, not yet deleted** — its last two build items are
carried below, and its durable rules fold into `HANDOFF.md` at closeout.

**Museum OIs in play:** OI-169 (method locked on grouping) · OI-172 (batch all overdue) ·
OI-168 (pending state, remainder) · OI-171 / OI-175 (doc-skin actions, scoped not built).

> **Status 2026-09-16: direction set by 5zorro, nothing built yet.** Six packets below, ordered.
> P1 and P2 are corrections to a surface he is actively dogfooding and come first.

---

## How to handle cross-architecture dogfood (copy into every new dated plan)

> **Template for future plans:** keep this section near the top of every
> `docs/implementation-plan-YYYY-MM-DD.md`. It is process SSoT for the *working* tranche — not for
> museum `open_items.md` (that inbox stays long-lived discovery).

Cross-surface dogfood (Bill + PO + IR + chrome/nav in one message) strains the LLM harness when
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

## Decisions taken 2026-09-16 (5zorro) — do not re-litigate

| # | Decision | Consequence |
|---|---|---|
| 1 | **B4 (per-vendor override table) is dead.** *"grace already hits all the needs it would hit and grace is built and mostly handled by vanilla."* | Delete the B4 thread at closeout. `effectivePayByDate`'s `opts` seam stays as a seam; nothing is built on it |
| 2 | **Documentation SSoT is a three-file contract** — HANDOFF (public architecture), the dated plan (public, the tranche in flight), museum `open_items.md` (private discovery). An off-machine agent has only HANDOFF + the plan + GitHub issues, so anything it must know to work correctly belongs in one of those two | `CLAUDE.md` rewritten 2026-09-16 to state this. No mirroring job; no third copy |
| 3 | **Home-tile off-cycle count: build it**, as a corner notification on the payment tile, with a user toggle in the assumptions panel | Reverses the 2026-09-14 "may be too much" deferral — it is now opt-in rather than absent. See **P5** |
| 4 | **OI-172 approved** for overdue groups only, framed as an explicit *"oops"* override | *"if today is 2 weeks later because the paperwork wasn't filed, then it needs to be filed 2 weeks ago, and because i don't have a time machine, im going to just have to do everything overdue through today."* See **P2** |
| 5 | **Store the delay calendar as CSV only**, importable from what a finance professional actually uses | *"easy to edit in microsoft excel as that is the defacto software of choice of finance professionals. perhaps accept spreadsheets but only store as a csv?"* See **P3** |
| 6 | **The terms modal must teach the name**, not just accept numbers — three labelled parts with worked examples | See **P4** |
| 7 | **OI-171 / OI-175 must be built as a doc-skin action mechanism**, not one button on one page | *"this will likely be reused on every form entry doc skin. Im hoping that the architecture for this can be dynamic and easily extended to the shapes of the other forms."* Scoped in **P7**, not built this tranche |

### Decision 8 — the trace stays (5zorro 2026-09-16)

`src/pay-flow-focus.js` (89 lines) + `wireFlowFocus`. It is **none of the three things it was
confused with**: not the audit balloon (shipped, praised), not source-document navigation (his emoji
idea — still unbuilt). It is the hover/click highlight that lights **the whole chain across all five
columns** — invoice → schedule row → suggested payment — and dims the rest, because the two
aggregate columns want opposite sort orders and strands necessarily cross on either sort (measured
2026-09-08).

**Kept.** 5zorro, after dogfooding it: *"after dogfood and the movement of all interactables from
the potentially large areas of the table that are traced into emoji, the page feels intuitive and it
should be kept."* The trace earns its place **because** the interactables moved out of the traced
area: a large region that is only ever hovered can afford to light up, where one full of buttons
could not. That coupling is the reason to keep it and the thing to re-examine if interactables ever
move back into the traced rows — not the trace itself.

Closes open question 6 from the 2026-09-08 plan. Nothing to build.

---

## Carried in from the 2026-09-08 tranche (unfinished — do not lose)

| Item | State | Lands as |
|---|---|---|
| **C2 panel** — delay-calendar import/export/ratify UI, `userData` persistence, and the `effectivePayByDate` consult switch | Pure half landed (`src/delay-calendar.js`, 32 tests). **Nothing in `electron/` references it**; `bank-business-days.js:133` still reads *"until it is wired, this fires directly"* | **P3** |
| **C6 second launch point** — the Bill Doc skin's `payment_terms_template` picker | Planner + modal + IPC shared-ready; the picker hook is unwritten (`doc-form.html:109`, `bill-shell.fragment.html:34` are plain link inputs) | **P4** |
| **Write-path verification debt** | The three Payment Entry paths ran live 2026-09-11 (`ACC-PAY-2026-00001/00002`, GL verified). What is **not** covered: `erpEval`'s string marshalling and the IPC hop. Separately, **`createPaymentTermDocs` is a fourth write path that has never run live at all** | **P4 precondition** |
| **C8 leftovers** | Cadence-replay report and per-method run schedules: still unbuilt, no longer deferred *for the tile reason* (see decision 3) | Recorded; not scheduled |
| **The AP credit-memo chain** — OI-166 · OI-147 · OI-082 · OI-164 · OI-167 | Promoted obligation, twice carried, **still not droppable**. Nothing here schedules it | Carried again |
| **OI-163** — Doc skin field coverage toward Vanilla parity | **Parked deliberately.** Do not touch Bill Doc-skin code for it until 5zorro asks | Carried |

---

## P1 — OI-169: the mode of payment is a suggestion, so stop enforcing it

**Observed** (5zorro 2026-09-16, dogfooding): the Create Payment grouping would not allow overriding
the default mode of payment — *"a wire was forced into wire, a check was forced to check."*

### Root cause, traced 2026-09-16

The drawer field is **not** disabled, and the batch write already honours whatever it holds
(`main.js:4993`). The lock is upstream, in the engine: `payment-batch-economics.js:127` partitions a
vendor's bills with `methodKeyOf(bill)` — the bill's own `mode_of_payment`, read off the payment
schedule — as a **hard key**. Bills on different rails can never share a group, and nothing on the
dashboard can say otherwise.

That partition is correct as a *constraint* (a Payment Entry carries one header `mode_of_payment`,
B2b) and wrong as a *fact*: the term says how you intend to pay, not how you will.

### The constraint the fix must respect (Packet A, verified 2026-09-08)

`allow_on_submit = 0` on every payment-terms field, header and schedule row. The dashboard shows
only submitted bills. **So the override is shell-side and is never written back to ERP** — writing
the clerk's choice into `payment_schedule.mode_of_payment` is a design the previous tranche already
killed. The Payment Entry is where "how it was actually paid" gets recorded, and that already works.

### Steps

- **P1a — pure.** `src/payment-method-override.js`: a `{ [billName]: { method, setOn } }` map with
  `effectiveMethodOf(bill, overrides)`, `setMethodOverride`, `clearMethodOverride`, and
  `pruneMethodOverrides(overrides, outstandingBillNames)` so a paid bill's override does not leak
  forever. Provenance is part of the value, not a parallel structure — the audit has to name it.
- **P1b — one resolver, four consumers.** The override must reach **all four** places the method
  decides something, or they will disagree:
  1. the partition key (`methodKeyOf`),
  2. the per-payment fee (`feeForMethod`),
  3. the delay-calendar scope (`methodDelayScopes` — a cheque observes postal delay days, ACH does
     not), which **changes the date**,
  4. the C5 row audit, which must carry the override as its own step
     (*"Method overridden — ACH → Check, by you on 2026-09-16"*). A date that moves with no step
     explaining it is precisely the failure the audit trail exists to prevent.
- **P1c — UI.** The C3 method chip on the schedule row becomes the control: pick a method, the card
  re-partitions, an overridden chip renders visibly overridden with a one-click *revert to term*.
  Offer *apply to this vendor's other outstanding bills* as a convenience, not as the default.
- **P1d — persist** in `userData` beside the batch prefs, pruned on load.

**Lazier path:** one override per vendor instead of per bill. Cheaper, and wrong the first time a
vendor has one wire bill among twenty cheques — which is the case that produced the complaint.

---

## P2 — OI-172: batch all overdue, and the clamp underneath it

**5zorro:** *"it is worse than the apps own math, but if today is 2 weeks later because the
paperwork wasn't filed, then it needs to be filed 2 weeks ago… It is already 'earning float' in
excess of the transaction costs for the earlier batches, so it should be an easy 'oops' and batch
override for ONLY OVERDUE grouped payments."*

### 🔴 Finding — this is probably not an override at all

Read the engine before building a button over it. `paymentBatchEconomics` has **no notion of today**
(verified 2026-09-16: no `today` parameter, no clamp; only `check-run-schedule.js:172` compares a
pay-by date against today, and only to mark it off-cycle). So a vendor with four overdue groups is
being offered four payments on four **past** dates, with float costs computed between dates that
cannot happen any more.

Once the past is past, every overdue bill is paid on the **same** day — today — so the exact
cheapest grouping should already merge them, at **zero** float cost and `n − 1` fees saved. That is
5zorro's sentence restated in the engine's own terms: he is not asking to override the math, he is
pointing at an input the math never had.

**So P2 is two things, in this order:**

- **P2a — the clamp (engine truth).** The *payment* date cannot be in the past:
  `payOn = max(payByDate, today)`. The bill's **obligation** date does not move — "late by 11 days"
  stays visible and stays in the audit — only the proposal clamps. Then re-check what the exact
  grouping does on its own; the expectation is that overdue bills collapse into one payment per
  method without any new button. Assert it in a test before building UI on top of it.
- **P2b — the button, if P2a leaves anything to decide.** *"Batch all overdue payments for this
  vendor"*, rotated 90°, spanning the vertical extent of the late nodes (5zorro's shape). After
  P2a it is a one-click confirmation of what the engine already proposes — cheap, and impossible
  for it to disagree with the engine, which a separate override path would not be.
- **P2c — the method interlock.** One Payment Entry carries one `mode_of_payment`, so a vendor with
  overdue cheque **and** overdue ACH bills gets **two** payments, not one, and the button must say
  so rather than silently producing a number the clerk did not expect. P1's override is the escape
  hatch when the clerk genuinely wants one payment.
- **P2d — placement.** Overdue always means before the run date, so these are exactly C8's
  `OFF-CYCLE` rows. The action belongs beside that chip and should feed the run strip's count.

---

## P3 — ✅ BUILT 2026-09-16. The delay calendar panel, in the format finance actually uses

**What landed.** The stored file **is** the CSV (`userData/delay-calendar.csv`), so the artefact the
app reads is the artefact Excel edits — an export is a copy, not a conversion. The panel sits in the
assumptions drawer: *Suggest for \<year\>*, *Import CSV…*, *Export for Excel…*, a sign-off checkbox
per row, a remove button, and an add-a-day row with a reason. Unratified rows render tinted and say
*"not signed off, so it moves nothing"* in place of a silent no-op.

- **P3a** — `normalizeDelayDate` reads the locale dates Excel writes back over an ISO column
  (`1/16/2026`, `01-16-26`, `12.25.2026`), month-first because every other calendar here is US,
  day-first when month-first is impossible (`16/1/2026`), and **flagged as a warning** when it
  genuinely reads both ways (`3/4/2026`) — kept, not dropped, with the row named. A day that does
  not exist (`2026-02-30`, which `new Date` would happily turn into March 2nd) is an error with its
  line number. Export takes `{ excel: true }` for BOM + CRLF; the stored file stays byte-identical
  to what the module always wrote, and the parser strips its own BOM on the way back in.
- **P3d** — `explainPayByDate` takes `opts.delayDay`, a `(iso) => reason | ""` probe built by
  `delayDayProbe`. It **replaces** the bridge rule rather than stacking on it, which is the point:
  a day the user declined to sign off has to actually stop applying. The probe is a function, not
  the calendar, so `bank-business-days.js` keeps knowing nothing about rails or ratification and
  `delay-calendar.js` can keep importing it without a cycle.
- 🔴 **The engine gets the same calendar as the audit.** `paymentBatchEconomics` takes
  `delayDay(iso, method)` and routes every pay-by walk through it — including the discount-capture
  date and `explainGroupMembership` — because the grouping and the explanation walk the same dates.
  A test asserts the membership audit's `ownPayOn` matches the group's `payOn` under a calendar,
  and diverges without one.
- 🔴 **The switch is file existence, not entry count.** With no calendar file the built-in bridge
  rule still fires; the probe is only passed once a file exists. An empty calendar would otherwise
  switch every bridge day off at once with nothing on screen to turn them back on — the exact
  failure C2 exists to prevent.
- The audit step carries the user's own words: *"2026-04-03 is not a payable day. Good Friday —
  mail delayed."* — which is the whole reason a ratified list beats a heuristic.

**Not done:** a `.xlsx` parser (see below — decide after dogfood), and **no dogfood pass yet**. The
panel has unit coverage behind it (16 new tests, 1741 green) but nobody has clicked it.

### (Original statement)

### C2: the delay calendar panel, in the format finance actually uses

**5zorro:** *"something that is easy to edit in microsoft excel as that is the defacto software of
choice of finance professionals. perhaps accept spreadsheets but only store as a csv?"*

**Answer: yes — CSV is the stored format and the interchange format, and no spreadsheet parser
ships in the first cut.** Excel opens and writes CSV natively; a `.xlsx` reader is a dependency that
buys one avoided *Save As*. Revisit only if dogfood shows that step is real friction.

What matters more than the file format is surviving the **round trip through Excel**, which damages
data in specific, known ways. The importer must handle all of them or the feature lies:

| Damage | Requirement |
|---|---|
| ISO dates reformatted to locale on open (`2026-01-16` → `1/16/2026`) and saved back that way | Accept both; normalise to ISO; **never** guess between `3/4` readings — a two-digit-ambiguous date without a year is rejected with its line number |
| UTF-8 mangled without a BOM | Export UTF-8 **with** BOM and CRLF so double-click opens clean |
| Quoted fields, embedded commas in `reason`, trailing blank rows | Parser handles them; a bad row is **reported with its line, never silently dropped** (the rule `parseDelayCalendarCsv` already follows) |

### Steps

- **P3a** — extend `src/delay-calendar.js` only where the round trip demands it (locale-date
  tolerance, BOM/CRLF on serialise). The merge, ratify and index rules are already built and tested.
- **P3b** — the panel, in the assumptions drawer: **Propose** (generate from the corrected
  bridge-day rule), **Export CSV**, **Import CSV**, per-row **ratify**, add a manual dated row with
  a reason and a `postal` / `bank` scope, and unratified rows rendering visibly unratified.
- **P3c** — `userData` persistence.
- **P3d** — flip `effectivePayByDate` to consult the ratified calendar instead of calling
  `isBridgeDay` directly.

🔴 **P3b, P3c and P3d land together.** Wiring the consult without the ratify UI makes every bridge
day stop applying at once, with no way for anyone to turn them back on.

---

## P4 — 🟡 BUILT except the gated half (2026-09-16)

**Landed: P4b, P4c, P4e.** The modal is now shaped like the name it produces — three numbered
parts in the name's own order, each with a worked example:

1. **Contracted terms**, as a picker of the shapes a vendor actually writes (`Net 30 days`,
   `2% 10 days, net 30 days`, `Due on receipt`, … , `Custom…`). It fills the raw numbers rather
   than replacing them, so the planner keeps one input shape and Custom is not a second code path.
2. **Method of payment**, unchanged, with a line saying what it decides (price, and which delay
   calendar applies).
3. **Grace adjustment**, `+0` by default, with the both-directions sentence — negative pays early
   for transit, positive pays after the contractual due date on purpose.

**P4c** is a *What this writes in ERPNext* disclosure under the preview: the term and template
names, `credit_days` (contract + grace, folded), `mode_of_payment`, `due_date_based_on`,
`invoice_portion`, and the discount pair when there is one.

**P4e — installments.** A payments picker (1–6); above 1 it reveals a table of days and shares,
pre-split evenly with the remainder on the last row (100/3 is 33.33 three times, and ERPNext
refuses 99.99), with a live total that turns red off 100. `planPaymentTermsCreate` is the new pure
entry point: N terms inside one template, named `3_PAYMENTS_30_60_90 (ACH)`. One installment is
byte-identical to the old single-term plan — a test pins the documents against
`planPaymentTermCreate`'s. The three server rules are enforced before the insert rather than met as
a traceback (portions total exactly 100; no two rows the same term; every row gets a real master).
`main.js` now inserts N terms then the template, and names what landed if the run breaks midway.

**Deliberately not built:** a per-row discount quartet. Vanilla allows it; nobody asked for it, and
inventing discount numbers on a term master is worse than leaving the feature to Custom.

### Still gated: P4a and P4d

**P4a — the live write-path proof — is the blocker, and it is 5zorro's click.** `createPaymentTermDocs`
has never inserted a real Payment Term. The one existing door is Home → **Pay Bills** →
**⚙ Assumptions** → **＋ New payment term…** → **Create term**, and it writes for real. Until that
has been done once, **P4d (the Bill Doc skin's picker launching this modal) stays unwired** — a
second launch point onto an unproven write just doubles the blast radius.

### (Original statement)

### C6: the second launch point, and a modal that teaches the name

**5zorro:** *"I want the modal for this to prompt good form of a terms name, therefore, it would
have examples of the 3 fields that make up a name e.g. 'contracted terms e.g. 2% 10 days net 30
days' then mode of payment e.g. 'ACH' then grace period adjustment to the contracted terms '+0'. So
a user looking at that could then have a picker or something and have it all make a 'well formed
terms name' and at the same time have a intuitive internals working too."*

Today's modal is seven flat inputs (credit days, grace, method, counted-from, discount %, discount
days, description) plus a live name preview. Every number the planner needs is already there — what
is missing is that the form does not **look like the name it produces**.

### Steps

- **P4a — precondition, and it is a hard gate.** Prove `createPaymentTermDocs` inserts a real
  Payment Term + Template in the sandbox, through the shell. It is the fourth write path and it has
  never run live. Same preconditions as the other three: non-Demo company, a result checkable by
  hand. **Do not wire a second launch point onto an unproven write.**

  **The one existing door** — there is only one, which is why the feature reads as unbuilt: Home →
  **Pay Bills** tile → **⚙ Assumptions** at the top of Pay Outstanding → **＋ New payment term…**
  (`#term-modal-open`, `pay-outstanding.src.html:626`) → fill → **Create term**. The chain behind
  that button is live end to end — `pay-outstanding-preload.cjs:16` → `create-payment-term` IPC →
  `main.js::createPaymentTermDocs` → `frappe.client.insert` — so pressing it **creates real Payment
  Term and Payment Terms Template masters** in the sandbox. It is the lowest-risk write path in the
  app (create-only, no rename path, collision-checked, touches no existing bill), which is what
  makes it the reasonable one to dogfood first.
- **P4b — restructure the modal into the three parts of the name**, in the name's own order, each
  with a worked example as placeholder text:
  1. **Contracted terms** — *e.g. `2% 10 days, net 30 days`* — a picker of the common shapes
     (`net 30`, `net 45`, `2% 10 net 30`, `due on receipt`, **Custom…**) that fills credit days and
     the discount quartet. Custom reveals today's numeric inputs.
  2. **Mode of payment** — *e.g. `ACH`* — the existing picker, unchanged.
  3. **Grace adjustment to the contracted terms** — *e.g. `+0`* — with the sentence stating what it
     means in **both** directions (negative pays early for transit, positive pays after the due
     date), because the sign is the part people get backwards.
- **P4c — show the internals under the preview.** Which ERP fields each part writes
  (`credit_days`, `discount`, `discount_validity`, `mode_of_payment`, and the name itself), so the
  clerk can see the term is ordinary ERPNext data and not a shell invention. This is the *"intuitive
  internals"* half of the ask; the planner already returns everything needed to render it.
- **P4d — the Bill Doc skin launch point.** `link-search.js:59` already emits *Create new Payment
  Terms…* and `link-picker-ui.js:127` peeks out to Vanilla. Intercept it and open this modal
  instead — the hop it replaces has a known sharp edge (`docs/bug-bounty-setup-peek-return.md`).

- **P4e — installments (5zorro 2026-09-16).** *"something the payment terms modal is lacking is
  the ability to have installment payments. vanilla supports this, so maybe if there is a dropdown
  of 'installments' then it makes that payment table available at more than (1 payment at 100% of
  the amount due)."*

  Correct — the planner emits a **single-row** template by design, and Vanilla's own shape is
  richer. Verified against ERP source 2026-09-16, `Payment Terms Template Detail` carries per row:
  `payment_term`, **`invoice_portion` (%)**, `due_date_based_on`, `credit_days`, `credit_months`,
  `mode_of_payment`, and the discount quartet. So an installment plan is N term masters + one
  template with N detail rows — the same two objects the modal already creates, just not once.

  Three server rules the planner must enforce *before* the insert, or the clerk meets a traceback
  (`payment_terms_template.py`):
  1. **`invoice_portion` must total exactly 100.00** (2dp) across the rows — `validate_invoice_portion`
     raises otherwise. The modal shows the running total and refuses to submit at 99.99.
  2. **No duplicate row** — the tuple `(payment_term, credit_days, credit_months, due_date_based_on)`
     must be unique, so *three equal 33.33% installments at the same `credit_days` are rejected*.
     Real installments differ in days (30/60/90), which satisfies it naturally, but the modal must
     say why rather than passing a duplicate through.
  3. `allocate_payment_based_on_payment_terms` makes `payment_term` mandatory on every row.

  UI: an **Installments** control (1 → N) that reveals the portion/days table; at 1 the modal reads
  exactly as it does today. Each row gets its own well-formed name from the same grammar, so
  P4b's builder runs per row rather than once.

  🟡 **Check on the engine side, do not assume:** the detail row carries its **own**
  `mode_of_payment`, so one bill's installments can legitimately sit on different rails. The
  dashboard already renders a bill's schedule rows separately and chips each one, but
  `payment-batch-economics.js` keys the partition off the **bill**. Confirm whether a mixed-rail
  installment bill partitions per row or per bill before P1 lands — the two must agree, and P1 is
  where the method partition is already being reworked.

Unchanged and not negotiable: no Doc skin on `Payment Term` (invariant 6); no rename path
(create-and-reassign only); the `AFFECTS_COPY` sentence stays — a new term changes nothing on the
bills already on the dashboard.

---

## P5 — The Home tile off-cycle notification

**5zorro:** *"lets go ahead and make the home tile off cycle count 'notification' button in the
corner of the tile. in the payment view assumptions dropdown, we can add a slider toggle of 'show on
home screen as a tile count of overdue notification', so users can choose if they want it there."*

- **P5a** — toggle in the assumptions panel (`showHomeOverdueBadge`, default **off** — it arrives
  the way 5zorro originally wanted it absent, and turns on by choice).
- **P5b** — the count comes from the **same** module as the run strip (`summarizeCheckRun`), never a
  second count computed for Home. Two surfaces disagreeing about how many fire drills exist is worse
  than neither showing it — the same rule that made `methodChipEl` one function.
- **P5c** — badge in the corner of the payment tile in `home.html`; clicking it opens Pay Outstanding
  focused on the off-cycle rows.

Open: Home must get the number without loading the dashboard, so `main.js` computes or caches it.
Decide when built — a cached value with a visible as-of time beats a wrong live-looking one.

---

## P6 — OI-168 remainder on the payment surfaces

*(What this is, since it came up as "not sure what you are talking about": a field ERP is still
repopulating looks identical to a field that is genuinely empty, so a slow reply reads as a bug.
`src/field-loading.js` + a quiet sweep in `doc-skin.css` shipped 2026-09-09, but **only** the Bill's
vendor pick is wrapped.)*

`SETTLE_DEPENDENT_FIELDS` already names `payment_terms_template` and `bill_date` with nothing wired
to them, and the OI names Payment Entry writes as an uncovered surface. Cheap, no new architecture:
wrap the Payment Entry writes and the terms-template write with `withFieldSettleLoading`. Honest
test is `npm run start:chaos`.

---

## P7 — OI-171 / OI-175: scoped, not built

5zorro wants void-and-amend (OI-171) and copy-as-draft (OI-175) as **doc-skin actions**, extensible
to every form skin rather than one button on one page. The shape that implies: a declarative action
registry per doctype — id, label, when it is offered (`docstatus`, dirty state, source shape), the
ERP call, and where the shell routes afterwards — so a new skin declares actions instead of
re-implementing them. OI-174's Bill ↔ IR switch is a third member of the same family (gated on
source shape rather than docstatus), which is the evidence the registry is the right abstraction
and not speculative.

**Not scheduled here.** Needs the ERPNext cancel/amend and duplicate call shapes confirmed first.

---

## Order

`P1` → `P2a` (the clamp, which may absorb most of `P2b`) → `P5` → `P6` → `P3` → `P4`.

P1 and P2 are corrections to a surface being dogfooded now and outrank everything else. P5 and P6
are small and land while the corrections are still warm. P3 is the largest remaining surface and the
least blocking. P4 is last because its precondition (P4a) is a live write-path run, and because the
modal is worth little until a clerk has hit a wrong term on a dashboard that now reads honestly.

## Out of this tranche

- Editing `payment_schedule` (still read-only; P1's override is shell-side by necessity).
- Any `Mode of Payment` / `Bank Account` schema change.
- Multi-currency batching.
- The AP credit-memo chain (carried, unscheduled).
- OI-163 (parked), OI-129, OI-135, OI-139, OI-153 (own tracks).
- A `.xlsx` parser (see P3).

## Dogfood residuals

*(Empty — new tranche.)*

| Family | Status | Notes |
|---|---|---|

## Validate

```bash
cd ~/erpnext-ui-app && npm test && npm start
```

**Git:** commit on `alpha`; only **5zorro** pushes.
