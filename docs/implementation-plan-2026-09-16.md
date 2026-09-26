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

## P1 — OI-169 + OI-171 + OI-170: edit means void and amend

> **Re-scoped 2026-09-21 (5zorro).** The original P1 below proposed a shell-side override map that
> never reaches ERPNext. That was the wrong layer. `mode_of_payment` sets no `allow_on_submit` on
> either the invoice header or the payment-schedule row (`purchase_invoice.json`,
> `payment_schedule.json`, read 2026-09-21), so once a bill is submitted **ERPNext's only way to
> change it is cancel + amend**. 5zorro: *"if i want the mode of payment to be ach, then i think
> vanilla requires that i void and amend the associated bills until it is ach."* Correct. So P1 is
> now the Edit (void and amend) action, and the old override map is dead — a shell-side fiction
> sitting on top of a document ERP still holds the old value for is worse than the honest write.

**Three stages, in order** (5zorro 2026-09-21): an Edit button on the **Bill** Doc skin first, then
the same action on the **other Doc skins** (PO, IR, Payment Entry), then the **Pay Outstanding
dashboard's** just-in-time mode-of-payment change, which may amend several bills at once.

**OI-170 ships with stage 1, not after it.** Amending stamps a *new* ERPNext ID on the document —
`_set_amended_name` (`naming.py:549`) names it `<original>-1`, then `-2` — while the vendor's own
invoice number and the PO logbook number stay put. 5zorro: *"i mostly track bills and po's based on
their 'logbook number' or their 'supplier ref number' and not the 'unique id stamped by erpnext'."*
The moment amend becomes an everyday action, the number the clerk tracks by is the one that
survives it, so which number reads as dominant stops being cosmetic.

### Verified against the running ERPNext, 2026-09-21

Terms: **void and amend** is ERPNext's own two-step — cancel the submitted document (it stays in the
system, marked cancelled), then create an editable copy of it that points back at the original.

| Fact | Where it was read | What it means for the build |
|---|---|---|
| `frappe.client.cancel(doctype, name)` is whitelisted | `frappe/client.py:285` | The cancel half is one ordinary call over the bridge we already use |
| There is **no** server-side "amend" call | `form.js:1129 amend_doc` | Amend is client-side: copy the cancelled doc, set `amended_from`, insert it. We do the same, in the ERP view, with ERPNext's own function |
| `frappe.model.copy_doc(doc, from_amend)` builds the copy | `create_new.js:281` | 🔴 `from_amend` **keeps** `no_copy` fields rather than stripping them (`is_no_copy = !from_amend && …`) — the opposite of the obvious guess. It also drops any key that is not a real docfield, and all Password fields. **We call it rather than reimplement it** |
| A document can be amended **once** | `client.py:416 is_document_amended`, checked by Desk before amending | The action must make the same check, or the clerk meets a traceback on insert |
| The amendment cannot be made until the original is cancelled | `document.py:618 validate_amended_from` | Cancel and amend are one action to the clerk, but two steps that can fail independently — and failing between them leaves a cancelled document and no replacement |
| The new document gets a **new name** | `naming.py:549 _set_amended_name` | This is OI-170's whole reason. `ACC-PINV-2026-00001` becomes `…-00001-1` |
| 🔴 **`unlink_payment_on_cancellation_of_invoice = 1` in this sandbox** | `tabSingles`, read 2026-09-21; enforced at `accounts_controller.py:2048` | Cancelling a bill that has payments against it **does not stop** — it quietly **detaches** them. The payments stay submitted and become unallocated, and the bill's outstanding goes back up. The clerk must re-apply them to the amended bill by hand |

That last row is the sharp edge of this whole packet, and it is the reason stage 3 is last rather
than first: "change the method on this vendor's five bills" is five cancels, and any of those bills
that has been partly paid silently loses its payment allocation.

### Status — stages 1, 2 and 3 built. Only OI-170's toggle (P1e) is outstanding.

| | What it is | State |
|---|---|---|
| Stage 1 | the Edit button on the **Bill** skin | ✅ built, dogfooded by 5zorro 2026-09-22 (two real bills) |
| Stage 2 | the same action on **PO, Item Receipt and Payment Entry** | ✅ built 2026-09-24; confirms read against live ERP on all four skins, writes not yet run live |
| Stage 3 | the dashboard's **just-in-time, multi-bill method change** | ✅ built 2026-09-26; plan + confirm read against live ERP, the batch write not yet run live |
| P1e | OI-170's **dominant-number toggle** | ❌ not built — the one thing still owed |

🔴 **What has and has not touched ERP.** Every *read* path is verified against the running sandbox:
the facts probes, the confirms, the per-doctype consequence sentences, the name predictions. The
stage-2 and stage-3 *write* paths run the same `voidAndAmendDoc` that stage 1 dogfooded, but they
have only been exercised as far as the confirm — every verification run dismissed the dialog. The
batch path additionally submits and re-reads, which stage 1 never did. That is 5zorro's dogfood.

#### Stage 1's three lessons (below) still hold. Stage 2 and 3 added four more:

4. **The registry earned its keep.** Adding PO, Item Receipt and Payment Entry was a row in
   `ACTIONS_BY_DOCTYPE` plus a row in the new `CANCEL_COST` table each — no new mechanism, and no
   per-doctype logic in any skin. The flow itself moved to `src/void-amend-flow.js` so four surfaces
   share one careful sequence instead of four copies of it.
5. 🔴 **Each doctype's cancel costs something different, and a shared "are you sure" would be wrong
   about three of the four.** A Bill's payments get **detached**; a PO is **refused** while receipts
   or bills stand against it; an Item Receipt puts the **stock back off the shelf** until the
   amendment is submitted; a Payment Entry puts the **bills it paid back to outstanding**. Those
   probes are declared in `doc-actions.js` and *executed* by `main.js`, so the query and the
   sentence it produces cannot drift apart.
6. 🔴 **Blockers are named, never enforced.** `check_no_back_links_exist` (`document.py:1578`) runs
   *after* `on_cancel` and rolls the whole transaction back, so a refusal changes nothing and cannot
   strand a document. That makes it safe to let ERP be the one that says no — and wrong for a skin
   to pre-empt it, since our list of what links to what is an approximation of a rule we do not own.
7. 🔴 **`<name>-1` is right exactly once.** `_set_amended_name` (`naming.py:549`) strips the trailing
   counter and increments it, so amending `…-00231-1` gives `…-00231-2`, not `…-00231-1-1` — and the
   whole scheme is off entirely when `Document Naming Settings.default_amend_naming` is "Default
   Naming". Caught 2026-09-26 by *reading a live confirm*, which was promising a name the sandbox's
   own data already contradicted. `predictAmendedName` now mirrors Frappe, and says nothing when it
   cannot know.

#### Stage 3 — what it actually does

The dashboard's vendor card gets a **Method…** panel: pick the target Mode of Payment, and every
one of that vendor's outstanding installments starts ticked (5zorro: *"all payment methods are
generally the same for a single vendor, so if it is weird, then there is a reason"*), with a
per-row opt-out.

🔴 **Five payments are not five amends**, and that is the point of the packet. The rows on the board
are `payment_schedule` installments, and a bill's installments live inside one document — so
`planModeChange` collapses the row selection to invoice-level work and the confirm counts the
*documents* that will be cancelled. Rows are matched by **due date**, never by index or by
`installmentKey`: the key is the dashboard's own ordinal over *unpaid* rows, so on a bill whose
first installment is paid, key `#1` is document row 2.

The batch write is `voidAndAmendDoc` with two additions: an inert patch applied to the draft between
`copy_doc` and `insert`, and a submit afterwards — an amended bill left as a draft is not
outstanding, so a batch that left drafts would take the vendor's bills *off* the board the clerk is
standing on. It then **reads the method back**, because `set_payment_schedule`
(`accounts_controller.py:2658`) can refetch the whole schedule from the linked order when
`automatically_fetch_payment_terms` and `allocate_payment_based_on_payment_terms` are both on, which
would quietly undo the patch. Verifying is cheaper than enumerating every such path. The loop is
sequential and **stops at the first stranding** — a second irreversible half-step on top of an
unresolved first helps nobody — and reports one outcome per bill.

#### Two bugs this tranche found in its own foundations

- 🔴 **The Pay Outstanding board was drawing nothing at all** (found 2026-09-26; 5zorro: *"the
  drawer … seems to be so high as to cover up all suggested payment grouping (or there are no unpaid
  bills due to a db wipe)"*). Not the drawer, and not a wipe: the Accounts Payable report returns
  more than bills, and an **unallocated payment** comes back with a *negative* outstanding and no
  due date. `effectivePayByDate` threw on the empty date, `render()` died mid-loop, and the board
  drew zero vendor cards with nothing on screen and nothing in the console. These rows are not
  exotic — P1's own amend *creates* them, since cancelling a paid bill detaches its payment. The
  engine now returns them as `unschedulable` rather than throwing or dropping them, and the vendor
  card shows the credit as a chip, because it is real money the clerk is owed.
- 🔴 **`npm test` could be fully green over a `main.js` that would not start.** No unit test imports
  it (it needs Electron), and the `erpEval` write paths are JavaScript inside a template literal —
  so a comment naming a function the ordinary way, with backticks, silently ends the literal and
  inverts everything after it. That happened twice while building stage 3. `tests/erp-eval-scripts.test.js`
  now parses every shell entry point and separately forbids the specific mistake, because the parse
  error it produces points 20 lines away from the cause.

Three things the dogfood taught, all fixed:

1. **A method on the preload is not a method on the page.** `bill-doc-api-adapter.js` is an explicit
   allow-list, so a method added to the preload and not to it is simply `undefined` — and the page
   then blamed the shell and advised a restart that could not help. A test now reads what
   `bill-form-page.js` calls on `api` and fails naming anything the adapter does not provide; it
   immediately found a second, older instance (`navDebug`, wired to nothing, so a guarded
   diagnostic had been silently dead).
2. 🔴 **A document whose child rows link back to it cannot be amended from code — but Vanilla's
   Amend button works.** *(Corrected 2026-09-24; the original claim that Vanilla fails too was
   inferred from the code path and never clicked. 5zorro reproduced it by hand and it worked.)*
   A v16 Purchase Invoice carries `Tax Withholding Entry` rows whose Dynamic Links point at the
   invoice itself; `copy_doc` keeps them on amend (`from_amend` does **not** strip `no_copy`, and
   these are not `no_copy` anyway) and `_validate_links` (`document.py:477`) rejects them *before*
   `before_insert` or `validate` could rebuild them.

   Desk escapes it not by copying differently — it is the same `copy_doc` call — but by routing the
   copy to a **form**: `purchase_invoice.js:706`'s `onload` runs `frm.clear_table(
   "tax_withholding_entries")` on any new document, so by the time a human presses Save the table
   is empty. We never open a form, so nothing clears it for us. Clearing costs nothing either way —
   `_generate_withholding_entries` (`tax_withholding_entry.py:388`) empties and rebuilds the table
   during `validate`, so the rows we send are discarded regardless and only ever get as far as
   failing the link check. So we drop child rows that link back to the document being amended —
   stale by construction — and say which ones did not carry over. **The upstream draft at
   `erpnext-issue-draft.md` must not be filed**; there is no upstream bug here.
3. **A cancelled document is a legitimate starting point**, not a refusal: Desk offers Amend there,
   and it is exactly where a half-done attempt leaves one. The first failure stranded a real bill
   (cancel landed, insert failed) and the skin then refused to retry while its chip still read
   Submitted.

**The payment that comes unstuck — now answered (2026-09-26).** Cancelling detaches any payments
applied to the bill (this site unlinks rather than refusing), so they survive unallocated while the
amendment reads Unpaid, and the vendor's statement then chases money already sent.

🔴 **ERPNext keeps no record of what the payment paid.** The Payment Entry Reference row is
deleted, `against_voucher` is blanked on the ledgers, and the change is written through the query
builder so it is not even in the document's version history — verified on the sandbox. Its own
`allocate_entries` therefore falls back to oldest-invoice-first, which for an amended bill is
actively wrong: on this sandbox it would have put the loose 9.00 against a 107.00 bill and left the
9.00 amendment outstanding.

The shell proposes the pairing instead (`src/payment-relink.js`), using the one fact the allocator
ignores — an amendment carries `amended_from`, and a payment stranded by an amend is looking for
exactly such an invoice. High confidence when the amendment's outstanding matches the loose amount
to the cent; the doubt goes in the button label when it is a sole candidate at a different amount;
no proposal at all when two amendments match or none does. **Proposed, never posted on its own** —
the click hands the pairing to ERPNext's own Payment Reconciliation, which does the accounting.

Proven end to end on 2026-09-26: `ACC-PAY-2026-00002`'s stranded 9.00 was re-linked to
`ACC-PINV-2026-00231-1` from the board. The payment's `unallocated_amount` went 9.00 → 0.00, it
kept its name and docstatus, a reference row now names the amendment, and the bill reads **Paid**.

🔴 **And it is not a second amend.** `reconcile_against_document`'s docstring claims it cancels and
re-submits, but the code does `update_reference_in_payment_entry(do_not_save=True)` then
`doc.save()` on a submitted document and rebuilds the ledger entries directly
(`accounts/utils.py:553`) — the payment keeps its name and `docstatus`. The undo is
`Unreconcile Payment`, reachable from the Payment Entry form, and also not an amend. So putting a
payment back on an amended bill creates no new IDs and strands nothing.

#### Posted first, reviewed after (5zorro 2026-09-26)

5zorro: *"let it auto link on high but leave a checkbox or something that would say 'seems okay'…
the difference of clicking through before clicking to link vs an optional review click only that
could be skipped and wouldn't leave open ends in the accounting."*

That is the better trade and the reason is worth keeping: **an unallocated payment is itself an
open end in the accounting.** Holding the books wrong until somebody clicks leaves a real error
outstanding; posting and asking somebody to check leaves only a question. So the click moved from
before the posting to after it, and became optional.

Three things keep that defensible:

1. **`auto` is stricter than `high`.** On top of exact amount, single candidate and same supplier,
   the payment must be demonstrably **older** than the amendment — a payment created after the
   amendment existed was never attached to its predecessor, so however well the amount matches,
   that is not the story. An unknown date counts as "ask", never as "yes".
2. **A cap of three per pass** (`AUTO_LINK_LIMIT`). Each pairing is near-certain on its own; a
   screenful of them is not. A rule that turns out to be wrong multiplies by the batch size before
   a human sees it. Past the cap the proposals are still offered, they just wait for a click.
3. **The flag lives in ERPNext, not the shell.** `frappe.desk.form.assign_to.add` puts a ToDo plus
   `_assign` on the payment, so an allocation nobody typed carries its own explanation — who did
   it, why it was inferred, and that *UnReconcile* undoes it — visible to anyone opening the
   document in a plain browser. "Seems okay" closes the assignment; it is not an approval, because
   there is nothing pending to approve.

**Verified live 2026-09-26:** the flag, the vendor badge (*"1 auto-linked · review"*), the note in
the panel, and *Seems okay* closing the ToDo to `Closed` in ERP. The auto **trigger** itself (the
board-load pass) is unproven in situ — its posting call is the same `relinkPayment` that was proven
above, and the gating is pure and unit-tested, but nothing has yet watched it fire on a freshly
stranded payment. 🔴 Recreating one by driving `Unreconcile Payment` over HTTP left the invoice's
stored `outstanding_amount` disagreeing with its ledger until a `update_voucher_outstanding` repost;
use the Desk *UnReconcile* button instead.

### What gets built

**A declarative action registry, not a button** (decision 7, 5zorro 2026-09-16: *"this will likely
be reused on every form entry doc skin. Im hoping that the architecture for this can be dynamic and
easily extended to the shapes of the other forms."*). This is what P7 scoped; P1 now builds it,
because P1 is its first member and a registry with one member written inline is a button.

- **P1a — `src/doc-actions.js` (pure).** Per doctype, a list of actions: id, label, when it is
  offered (`docstatus`, whether the form is dirty, whether the document has already been amended),
  what the clerk is told before it runs, and where the shell goes afterwards. `offeredActions(ctx)`
  returns what to render; nothing about ERP calls lives here. Void-and-amend (OI-171) is the first
  entry; copy-as-draft (OI-175) and the Bill ↔ IR switch (OI-174) are later rows in the same table,
  which is the evidence the shape is right rather than speculative.
- **P1b — the consequences, stated before the click.** Not a generic "are you sure": the count of
  payments that will be detached (read first, from the live document), the new ID the document will
  get, and the fact that the vendor's own number does not change. A confirm that does not name what
  it is about to do is not a confirm.
- **P1c — the ERP call, mirroring Desk.** In `main.js` over `erpEval`: check `is_document_amended`,
  `frappe.client.cancel`, then `frappe.model.copy_doc(doc, 1)` + `amended_from` + `frappe.client.insert`.
  🔴 **Use ERPNext's own `copy_doc`.** Reimplementing its field rules in `src/` would be a second
  copy of a rule we do not own, and it has already surprised us once (the `no_copy` inversion above).
  Needs `frappe.model.with_doctype` first, since the meta may not be loaded in the ERP view.
- **P1d — the half-done state is the dangerous one.** Cancel can succeed and insert can fail. The
  result must say exactly which, name the cancelled document, and offer to retry the amend against
  it — never report a flat "failed" over a bill that is now cancelled with no replacement.
- **P1e — OI-170's toggle.** Which number is dominant on Bill and PO surfaces, persisted the way
  `lens-prefs.js` persists the lens, with the demoted number one click away.

**Stage 2** adds PO / IR / Payment Entry as rows in the registry, plus whatever each one's cancel
rules turn out to forbid. **Stage 3** is the dashboard's just-in-time change: default the new method
to *all this vendor's outstanding bills* (5zorro: *"all payment methods are generally the same for a
single vendor, so if it is weird, then there is a reason"*), let a single bill opt out, and run the
amend per bill with a per-bill result — because a batch that reports one outcome for five documents
will be wrong about at least one of them.

**Not in P1:** editing `payment_schedule` in place (still impossible), and any attempt to preserve
the ERPNext ID across an amendment (`_set_amended_name` owns that; fighting it is not Clean Core).

### (Original statement — superseded 2026-09-21, kept until closeout)

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

## P2 — ✅ BUILT 2026-09-21. OI-172: batch all overdue, and the clamp underneath it

**What landed.** `paymentBatchEconomics` takes `today` and clamps the *proposal* — never the
obligation. **P2b was not built and is not needed:** the clamp alone collapses the overdue groups,
which is what the finding below predicted and a test now pins (four groups 28 days apart become one
payment at zero float cost). P2c needed no code — the method partition already gives mixed-rail
overdue bills two Payment Entries. P2d is moot without a button.

**Backdating (5zorro 2026-09-21):** *"i think erpnext allows backdating, don't make it default, but
allow it if im right."* Correct — `posting_date` on Payment Entry carries no restriction (checked
`payment_entry.json` + the controller), and the write path already passed `payOn` through unvalidated.
The gap was upstream: the check drawer's date line was fixed text in *every* mode. It is now a real
editable date field in proposal/blank (disabled in edit/view, where ERP forbids it and
`mountCheckDocEdit` does not save it), pre-filled with the clamped default, refusing empty rather
than silently re-substituting the suggestion.

### Review 2026-09-21 — two places the same fact was worked out twice, and the copies could disagree

Terms used below: the **clamp** is the rule that moves an overdue payment forward to today, since a
payment cannot be dated in the past. A **rail** is how a payment physically travels — cheque, ACH,
wire — which matters because a postal delay day stops a cheque and not an ACH. The **audit** is the
balloon that explains why a payment is on the date it is on.

The first cut had the engine decide a date and then had the audit work the same date out again from
scratch. Two calculations of one fact can drift apart, and both of these would have. Both were
already settled by rules written down elsewhere, so neither needed a new decision.

1. **The audit re-walked the calendar instead of reading what the engine recorded.**
   `explainGroupMembership` recomputed each bill's pay-by date from `bill.dueDate`, so it agreed
   with the engine only while the caller remembered to hand it an identical `delayDay` — a second
   walk, structurally able to disagree. The governing rule is this plan's predecessor, on the fee:
   *"read off the group (recorded per-method fee…), **never re-derived from prefs**"*, and
   `bank-business-days.js`'s *"one walk, not two — an audit trail that can disagree with the engine
   it audits is worse than none, because it is believed."* Dates are the same kind of input, so they
   now get the same treatment: each suggested payment writes down the dates it was built from
   (`payByOf`) and the clamp date that applied to it (`clampedTo`), and the audit reads those
   instead of recalculating. 🔴 **This is the one P1 would have broken.** Overriding a bill's method
   changes its rail, which changes which delay days apply, which changes the date — so the engine's
   answer and the audit's answer would have parted company, and the audit would have announced
   "already overdue" about a bill that was never late. Saying *why* a date moved is now allowed only
   when the engine wrote down that it moved it; otherwise the audit reports what it can see and
   claims no cause.
2. **Lateness was measured from the pay-by date, not the obligation.**
   `payment-date-derivation.js` already fixes this: *"everything starts from the stored `due_date`…
   the stored date is what the vendor is owed"*, and it carries `dueDate` and `payOn` as separate
   fields precisely because they are different things (plus an `obligation` field that exists
   because *"a discount deadline called a 'due date' is a wrong claim"*). The pay-by date walks
   *earlier* over weekends, so measuring from it reported a bill due Sunday as two days later than
   ERP's own count — and `bill-paid.js` already derives overdue state from ERP, so the dashboard
   would have disagreed with itself. Lateness is now `due_date → payOn`.

Two more fixed in the same pass:

- **The clamp could land on a day you cannot pay on.** Every payment date the app proposes had
  always been a real banking day, because the calendar only ever walked *backward* off a weekend or
  holiday ("earlier, always" — being early is recoverable, being late is not). Using today's date
  raw broke that: it could propose a Saturday, or one of the very days the delay calendar you signed
  off calls closed. The calendar now also walks *forward*, for the overdue case only, sharing the
  same loop so a day cannot be closed in one direction and open in the other — and scoped by rail,
  so a cheque waits out a postal delay day and an ACH does not.
- **The derivation walk stopped short of the date on screen** — the bug 5zorro caught on 2026-09-12,
  re-opened one rule further down. The clamp is now a step in `payment-date-derivation.js`
  (`rule: "overdue"`, the only rule in that module that moves a date *later*, with the forward
  weekend/holiday/delay days as their own steps), so the table ends on the date the node shows.
  `derivationEl`'s silent `|| derivations[0]` anchor fallback now says so instead of printing one
  date's summary under another's heading.

**Known residual:** a bill whose discount window has already closed still proposes a discount
capture dated in the past. The clamp deliberately does not touch that path (a missed discount is
missed, not moved), but it is now the only node on the dashboard that can show a past date. Decide
whether to refuse the capture or mark it — not scheduled here.

### (Original statement)

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

### 2026-09-22 — P4e's open question, answered, and the trap underneath it

P4e left one thing to confirm: *"the detail row carries its own `mode_of_payment`, so one bill's
installments can legitimately sit on different rails… Confirm whether a mixed-rail installment bill
partitions per row or per bill before P1 lands."*

**Per row, and it already works.** `pickTermFields` (`outstanding-bills.js:49`) carries
`mode_of_payment` onto each exploded installment, so 50% by wire and 50% by ACH on one bill
partitions correctly. Nothing to build.

**But checking it turned up a live trap.** 5zorro asked whether ERPNext allows paying one bill
half by card and half by cheque, and whether that collides with our multiple-payments model. The
answers, read from source and from this instance 2026-09-22:

- **Split payment is always allowed, and payment terms do not constrain it.** One invoice can be
  referenced by any number of Payment Entries, each with its own method. Terms say what is owed
  when, not how it may be paid. The only constraint is the one already modelled: one Payment Entry
  carries one `mode_of_payment`, so two methods means two payments.
- **A schedule row needs no Payment Term at all.** Only `due_date` and `payment_amount` are
  required (`payment_schedule.json`), so a fully custom schedule — arbitrary dates and splits, no
  template — is ordinary ERPNext. Two rules to respect: the rows must sum to the grand total (0.1
  tolerance) and **no two rows may share a due date** (`validate_payment_schedule_dates` throws).
  Setting a `payment_terms_template` afterwards regenerates the schedule, so it is either/or.
- 🔴 **`allocate_payment_based_on_payment_terms` is a flag on the Template, and with it off the
  schedule rows are never updated by payments.** `PaymentEntry.update_payment_schedule` returns on
  its first line (`if not ref.payment_term: continue`), so a payment reduces the invoice's own
  `outstanding_amount` while every row keeps its original `paid_amount`/`outstanding`. Proved on a
  fully paid bill whose row still read `outstanding 201.00`. All nine templates in this instance had
  the flag off — which is why 5zorro saw term-level behaviour on some terms and not others.

**Why that is our problem:** `explodeInstallments` decides what is still owed from each row's own
`outstanding`. On a single-installment bill that never matters (the invoice-level figure is used and
ERPNext does maintain it). On a multi-installment bill it matters a lot — a part-paid installment
would keep being proposed and the vendor's total would be overstated.

**Fixed at the source:** `planPaymentTermsCreate` now sets
`allocate_payment_based_on_payment_terms: 1` on any template with more than one installment, so
ERPNext maintains the rows and allocates per term. Left off for a single installment, where it buys
nothing and would change how every ordinary one-row bill is paid in Vanilla.

This was **latent, not live** — multi-installment bills exist here (two 90-row, three 3-row) but
none had been part-paid, so invoice and row totals still agreed. *Lazier path not taken:* have the
shell reconcile row outstanding against the invoice's when they disagree. That is the shell
second-guessing ERP's own numbers, and it would have hidden the cause rather than removed it.

**Still open:** templates created *before* this change still have the flag off. Nothing has been
part-paid against them yet, so nothing is wrong today, but a multi-installment one would need the
flag set by hand (or be re-created) before it is part-paid.

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

## P7 — absorbed into P1 on 2026-09-21

The registry this packet scoped is now being built in **P1**, because P1's void-and-amend turned out
to be its first member and a registry with one member written inline is just a button. OI-175
(copy-as-draft) and OI-174 (the Bill ↔ IR switch) stay unbuilt, but they are now rows to add to an
existing table rather than a mechanism still to be designed. The precondition this packet named —
*"needs the ERPNext cancel/amend and duplicate call shapes confirmed first"* — was met 2026-09-21;
the findings are in P1's table.

### (Original statement)

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

Originally `P1` → `P2a` → `P5` → `P6` → `P3` → `P4`. What actually happened, and why:

`P3` → `P4` (2026-09-16) → `P2` (2026-09-21) → **`P1` next** → `P5` → `P6`.

P1 did not slip, it changed shape. Scoped here as a shell-side override map that never reaches ERP,
it turned out to be solving at the wrong layer: `mode_of_payment` sets no `allow_on_submit` on
either the header or the schedule row (`purchase_invoice.json` / `payment_schedule.json`, checked
2026-09-21), so on a submitted bill **cancel + amend is the only way to change it** — which is
OI-171, already scoped in P7. So P1 is now the void-and-amend action, in three stages: the Bill Doc
skin's edit button, then the other skins, then the dashboard's just-in-time possibly-multi-bill
mode edits. **OI-170 comes with it, not after it**: `_set_amended_name` (`naming.py:549`) stamps a
new `name` on every amendment, so the ERPNext ID you were tracking by changes each time while the
logbook / supplier ref does not — which makes "which number is dominant on screen" load-bearing the
moment amend becomes an everyday action rather than a rare escape hatch.

P3 and P4 went first because that re-derivation had to happen before P1 was buildable at all.

**What P1 inherits from P2's review:** the bill's method decides a date in two engine resolvers
(`payByResolver`, `clampResolver`) and once in the view (`derivationForBill`'s probe,
`pay-outstanding.src.html`). The engine pair both reach it through `methodKeyOf`, so making that one
function override-aware carries both; the view one is separate and is the easy one to miss. The
audit no longer re-derives dates at all, so an override changing the rail can no longer desynchronise
it from the engine.

## Out of this tranche

- Editing `payment_schedule` (still read-only; P1's override is shell-side by necessity).
- Any `Mode of Payment` / `Bank Account` schema change.
- Multi-currency batching.
- The AP credit-memo chain (carried, unscheduled).
- OI-163 (parked), OI-129, OI-135, OI-139, OI-153 (own tracks).
- A `.xlsx` parser (see P3).

## Dogfood residuals

| Family | Status | Notes |
|---|---|---|
| P1 / OI-171 — sandbox state | 🟡 one harmless artifact | `Unreconcile Payment` **fog3it52jk** is submitted against `ACC-PAY-2026-00002`. It was created on 2026-09-26 to recreate a stranded payment for testing; its net effect was undone by an `update_voucher_outstanding` repost, so it has no live ledger effect and the books read correctly (payment applied, `ACC-PINV-2026-00231-1` Paid). Left in place rather than cancelling a submitted accounting document to tidy up |
| P1e — OI-170's dominant-number toggle | ❌ not built | The one outstanding item of P1. Which number reads as dominant on Bill / PO surfaces (the vendor's own ref and the PO logbook number survive an amend; the ERPNext ID does not), persisted the way `lens-prefs.js` persists the lens |
| P1 stage 2 / 3 — writes | 🟡 unproven in situ | The confirms and every read path are verified against live ERP; the stage-2 and stage-3 *writes* have only been exercised as far as the confirm. They share `voidAndAmendDoc`, which stage 1 dogfooded, but stage 3 additionally submits and reads back |
| Auto re-link trigger | 🟡 unproven in situ | The posting call (`relinkPayment`) and the whole review loop (flag → badge → *Seems okay* → ToDo `Closed`) are verified live; nothing has yet watched the board-load pass fire on a freshly stranded payment. The clean way to prove it is the next real void-and-amend of a paid bill |

## Validate

```bash
cd ~/erpnext-ui-app && npm test && npm start
```

**Git:** commit on `alpha`; only **5zorro** pushes.
