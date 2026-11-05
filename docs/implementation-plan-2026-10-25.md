# Implementation plan 2026-10-25 — split `main.js` by concern; write the Bill / doc-form code once

> **Closing (2026-11-04).** The rules that outlive the plan are in HANDOFF § *Main-process code by
> concern*. The residuals, as 5zorro sorted them the same day:
> - **To multi-window (museum OI-040):** R2-5's doc-form and Bill moves. They hold the
>   one-of-everything state multi-window must make per window, so they are done once, there.
> - **Promoted, built before this file is deleted** (his words; he dogfoods after them):
>   1. **The smoke specs that fail on any code are removed** (*"it makes debugging new stuff
>      hairy, and the purpose of the tests likely is lost to time or is now irrelevant"*): the
>      Sales Order ones that read a lens preference, the blank-sandbox Estimate price, the A/R
>      Invoice / Receive Payment and desk-hatch ones, OI-190's void-and-amend. **Done 2026-11-05:**
>      12 tests that failed on the code before (run 2026-11-05 from a snapshot of `8e36ebd`):
>      `scaffold-ar-doc-skins` whole (its 4 tests; the A/R family has no spec now),
>      `scaffold-peek-return-focus`'s Sales Order blocks (create Customer ×2, create Item on line
>      2, Create ▾ › Purchase Order, the Sources column), `scaffold-find-doc`'s F3 and "sort …
>      remember the search", `scaffold-bill`'s void-and-amend offer (OI-190). What those covered
>      on the Sales Order has no spec now; the probes and `nav:check` do not reach it either.
>   2. **The warm pick lists make no request a form does not use** (3b finding 4: every Doc open
>      rechecked all 8 lists). **Built 2026-11-05:** each picker tells main its list once per form;
>      an opening warms only those. Probe `warm-lists-used-only` failed on the code before (Customer
>      and both tax templates copied with no picker for them) and passes; `link-search-doors` now
>      waits on the Bill's five lists, not eight (its copy doors change on purpose);
>      `dogfood-warm-new-vendor`, `dogfood-warm-lists-chaos` pass.
>   3. **One failed-save path and wording for every Doc form, failing loud with ERPNext's reason**
>      (R6a-1 step 2 kept the two pages' wordings as found: the Bill's "Save did not finish", the
>      doc-form's "ERPNext rejected the save").
>   4. **The rest of the duplication between the two pages is shared** (569 identical lines in 36
>      functions, measured 2026-11-04).
> - **Waiting on his answer:** 3b findings 3, 5 and 6 (judged "leave"); the shared rows module's
>   ~35 hooks; the vendor pick's open check that no probe has reproduced.
> - **Already parked, no action:** OI-187, OI-188, OI-189, OI-190 (settled with multi-window).

> **Status: step 0 built (2026-10-25): 0a, T-3, T-2, T-1. R6a-1 steps 1–2 built (2026-10-26).
> R6a-1 step 3 built (2026-10-26): the item rows, and one taxes table for every form, the Bill's
> way (5zorro). Plan 2026-10-26 (tests that run while the app is open, and where their time goes)
> built and closed 2026-10-26 (HANDOFF § *Test strategy*). R6a-2's four dialogs: Assign moved
> 2026-10-27 (`src/bill-assign.js` its steps, pure and tested; `src/bill-assign-modal-ui.js` the
> dialog), then museum OI-192 fixed at 5zorro's word (a tick on an order no longer listed is dropped;
> customer and project picks kept by name); the informal link dialog moved 2026-10-27
> (`src/bill-informal-link.js`, `src/bill-informal-link-modal-ui.js`; museum OI-193 found, his call);
> the source picker's Bill side moved 2026-10-31 (`src/bill-source-modal-ui.js`; a pick's meaning in
> `src/bill-source-flow.js`), and Allocate into items moved 2026-10-31
> (`src/bill-allocate-charge-modal-ui.js`; museum OI-195 found): **R6a-2's four dialogs are done**. Fixed from what the moves found, at
> 5zorro's word: OI-193 (a cleared informal link leaves "Removed linked …" in Remarks, and the box
> shows what was written) and OI-195's status line (plain money); OI-195's over-allocation stays. The Item Receipt's
> lines got the Line column and sortable headers 2026-11-01 (decided 2026-10-26; end of the step 3 section). Then 3b, a
> performance deep dive over every probe's times and charts (added 2026-10-26, *Order*): **run
> 2026-11-01, report in § *3b — the performance report*; his picks the same day: finding 1 (a
> vendor with no address waited ~9 s) and finding 2 (the save-drain timer) built, finding 7 (the
> probes' fixed sleeps) done: the `@nav` matrix (28 → 13 min), then every other probe waits for the
> page to be quiet (`docQuiet`, 47 probes −28%); OI-200 (a vendor switch clears the document) built
> alongside; 3–6 left as reported. `nav:check` / `dogfood:check` not re-run whole since.**
> **R2-5 started 2026-10-31 alongside, from the far end (his pick): printing, Papers, Find and
> payment settings moved to `electron/ipc/`; after 3b, `nav:check` (109/109) and `dogfood:check`
> (one probe's wait fixed) ran whole on 2026-11-01, then re-link and method change moved
> (`electron/ipc/relink-method-change.js`), then health and incidents
> (`electron/ipc/health-incidents.js`, 2026-11-02), then link search with its warm pick lists
> (`electron/ipc/link-search.js`, 2026-11-03). Next in the order: doc-form, then Bill with the
> bridge (*Order*, item 4).** Alongside, at 5zorro's word (2026-11-03): **a new Bill waits on
> nothing** (§ *A new Bill waits on nothing*), and the shell's refused calls no longer leave
> ERPNext's message box in the ERPNext page (gotchas G27). 5zorro paused his DF-03 dogfood round partway (2026-10-25) until
> this plan is done: most of what he was finding would have added to the refactor's work. Promoted from the architecture review (plan 2026-10-19,
> closed 2026-10-25) at 5zorro's word: *"one part of the plan is to have a separate session to break
> about main.js into separation of concerns and merge doc form and bill form to have 'don't repeat
> yourself'. that is going to be a separate session."* Its own goal: changing the app gets cheaper
> and safer; nothing a clerk sees changes.
>
> **Share, not merge (5zorro, 2026-10-25), with every data-entry form in view** (*Decided* below).
> Then the sessions in the order under *Order*.
>
> **2026-10-25, added: step 0.** 5zorro's DF-03 dogfood found three bugs in the items table's
> keys, in code both pages carry (*Step 0* below). He chose to do this plan before finishing that
> dogfood run, starting with the table: its keyboard code moves into one module first, and the
> three fixes land there once. This is the one place the plan changes what a clerk sees, and only
> in step 0b.

**Why now is the right time to plan it, not build it:** the review measured the cost (R6a-1: 1,295
identical lines across 55 functions; R2-5: 12,744 lines and 82 shared variables in `main.js`) and it
keeps landing: on 2026-10-25 the calculator's site rounding had to be wired into both pages, by hand,
twice. No behaviour changes, so the proof is the existing nets: `npm test` (`write-path-wiring`,
`review-session*-wiring` follow moved code), both skins' smoke specs, `npm run dogfood:check`, and
the full `npm run nav:check -- --ongoing`.

## How to handle cross-architecture dogfood

Same as plan 2026-10-03 § *How to handle cross-architecture dogfood*. The "families" are the
coverage map's (`src/architecture-families.js`); this plan moves code between files, so after each
step run `npm run dogfood:for-change <step's base>` and the probes it names.

### Closeout (before deleting this plan)

Follow `HANDOFF.md` § *Closing a plan*: fold the durable rules (where each concern now lives goes
into HANDOFF's module map), list every residual and sort each one with 5zorro — promoted, parked or
dropped — then update HANDOFF's registry and the local notes file, and delete this file.

---

## Decided: share, with every data-entry form in view (2026-10-25)

**Share, not merge.** 5zorro, 2026-10-25: *"There are other document forms that might share in the
future: the AR forms, the Journal entry form, the payment entry form … if we are doing a specific
maintainability pass on the "data entry forms" then we need to consider those. … sharing makes the
most sense here and keeping that perspective might make this review extend further (or be prepared
to extend further) by the end of it."* Both pages stay as entry points; what they share moves into
modules both import (as `item-import-ui.js` and `address-picker-ui.js` already are), with each
page's extras passed in as hooks.

**Which forms are in view.** The doc-form page already runs more than the A/P pair: Purchase Order,
Item Receipt, and on the A/R side Estimate, Sales Order, Invoice and Receive Payment (a Payment
Entry whose lines are `references`, not `items`). Not yet on a shared page: the Pay Outstanding
pages (Payment Entry, their own pages) and Journal Entry (no page yet). So a shared module serves
six forms today, not two.

**Rules for every shared module in this plan:**
- Talk about *lines*, not items. The lines table comes from the layout (`linesTable`, default
  `items`); a module never reads `doc.items` or `item_code` itself. Where a rule really is about
  items (the empty-Item line is deleted on Tab), it is a hook the layout supplies.
- A/P-only or Bill-only behaviour (Rec'd editor, Assign, account-company blockers, the Bill's own
  save) comes in as a hook, never as a `profileId` branch inside the module.
- Build nothing for Journal Entry or Pay Outstanding now. Each step notes, in its commit or here,
  what one of them would still need; the closeout lists what a new form would reuse, which is where
  the review can extend.

## Step 0 — the items table's keys, written once, then three fixes (DF-03)

**Why first:** these are the bugs 5zorro is hitting while he dogfoods, and the code behind them is
the same in both pages. The item cell's `keydown` handler (`src/doc-form-page.js` ~2030–2163,
`src/bill-form-page.js` ~2624–2760) is 134 lines and differs in three spots: the Bill calls
`neighborItemCell` / `nextItemFocusAfterEdit` without the layout's `navFields`, and Shift+Tab out
of the first box goes to the Bill's Amount Due / bill number but to the doc-form's last header
field. `focusItemCell` is 90% the same (R6a-1). Fixing these in place means fixing them twice.

**0a — move, behaviour unchanged.** The item cell's key handling and `focusItemCell` go into one
module (e.g. `src/item-table-keys-ui.js`) that both pages call with a small deps object: the
table element, `lastDoc`, `navFields`, `apply`, `api.addItem` / `deleteItem`, and a hook for
"leave the table backward". Proof: `npm test`, both skins' smoke specs, the nav matrix's item-table
cells.

**0a built (2026-10-25).** `src/item-table-keys-ui.js` (`createItemTableKeys(deps)`) holds the
cell's edit / nav mode and its mirror on the table, the busy flag (was `itemTabGuard`),
`focusItemCell` and the cell's keydown; each page passes `table`, `editable`, `painting`,
`calcActiveOn`, `lastDoc`, `lines`, `lineKey` and `leaveBackward` (Bill: Amount Due, else the bill
number; doc-form: `focusLastHeaderBeforeItems`), and per cell `field`, `rowIndex`, `navFields`,
`readValue`, `apply`, `afterEdit` (the page's `focusAfterItemEdit`, which stays in the page until
R6a-1 step 3). The Bill's own columns were checked: its editable ones are the default five, so it
now passes them (`BILL_NAV_FIELDS`) with no change in behaviour, and a Bill column added later moves
Tab with it. Proof: `npm test` (`tests/item-table-keys.test.js`, stand-in inputs; 0b adds its
failing-first tests there); probe `item-table-keys` (AP clerk, Bill and PO: Escape, ↓, ↑, →,
Shift+Tab out the front, Tab past the last box adds a line) passed on the code before the move and
after it with the same path, key for key. Smoke specs: `scaffold-bill`, `scaffold-ar-doc-skins`,
`scaffold-peek-return-focus`, `scaffold-pure-wiring` — 20 pass; the same 10 fail on the code before
the move too: the Sales Order ones open in ERPNext because the specs read the user's own
`lens-prefs.json` (`"sales-order": "vanilla"`) instead of setting the lens, and the Estimate one
expects a price (100) the blank sandbox does not have (residual: the specs should set their own
lens and scene). Found 2026-10-26: `scaffold-bill`'s void-and-amend test fails on this commit too
(museum OI-190), so it was failing then as well and is not one of the 10 named here. For another form: Journal Entry would pass `lines: (d) => d.accounts`,
`lineKey: (l) => l.account`. Two item names remain: ↑ / ↓ always move in `qty` (no spinner), and
`nextItemFocusAfterEdit` lands on the next line's `item_code`; both would become layout settings
when a form without them shares the module.

**Left alone (5zorro, 2026-10-25):** the keys read `items` / `item_code`, which may not fit
Receive Payment's `references` lines. Receive Payment exists only because of the Pay Bills
dashboard and has had no development of its own, so it is not dug into here. The module takes
`lines` / `lineKey` from the page anyway, so it costs nothing later.

**0b — the three fixes, each in that module, each with a test that fails on the old code:**

| ID | What the clerk saw | Cause | Fix |
|----|--------------------|-------|-----|
| T-1 | Sorted by a column, typed in it, pressed Tab: "it jumped to the wrong row" | Every repaint sorts again, so the line moves to its new place and the cursor goes with it | The order on screen holds still while the clerk types. It is set when a header is clicked; an edit never moves a line, and a new line goes at the bottom. When an edit leaves the table out of sorted order, a banner over the table says so: **"Sort is out of date — it refreshes when you click away. 🔄"** (5zorro: *"i want a banner or something saying 'sorting out of order will refresh sort when you click away.' and have a refresh emoji next to it so that i could click there to have sorting refresh specifically"*). Clicking 🔄 sorts now; focus leaving the table sorts too. The default order (line number) never shows the banner |
| T-2 | Tab past a line's last box, or ↑ / ↓, went to a line that is not the next one on screen | `neighborItemCell` / `nextItemFocusAfterEdit` step to the next line in ERPNext's order (`rowIndex ± 1`), not the next line painted | Moves between lines follow the order on screen: the helpers take that order (the row indexes as painted) and step through it. Shift+Tab out of a line's first box goes to the line above on screen. 5zorro: *"it needs to match what the user expects"* |
| T-3 | Tab past a line's last box: "it takes a bit before the new line … appears and focus is placed in the item code box" (that wait is museum OI-187). Corrected 2026-10-25: 5zorro saw **one** new line, then tabbed away and it went (by design: Tab out of a line with no Item removes it). An earlier reading of the log (focus on line 4's Item, then Terms 0.3 s later) as two blank lines was a guess; the app logs no line adds or deletes | A Tab pressed **during** that wait is not checked: it runs as a second move from the old box. Probe `df03-item-table` (1200 ms lag) on the code before the fix: two quick Tabs left the table — the PO to Terms, the Bill to the taxes with no line added | A Tab or move while an earlier one is still working is dropped, so the clerk stays on the new line's Item. The wait itself is OI-187 |

**Decided while writing 0b down (so the build does not have to guess):**
- T-1 "click away" means focus moves to something outside the items table: a header box, the
  taxes, Terms, the toolbar. A cell's own pick list, calculator tape or a peek opened from a cell
  is not away. A peek's return lands back in the cell, so the order holds through an errand.
- T-1 "out of date" compares the order on screen with the order the current sort would give; the
  banner shows only when they differ. The default sort (line number) cannot differ.
- T-2: Tab past the last box of the **last line on screen** adds a line (today: of the last line in
  ERPNext's order, which in a sorted table can be mid-screen). The rule that a trailing blank line
  is deleted on Tab instead of focused (`nextItemFocusAfterEdit`) also means the last line on screen.
- T-3: the extra Tab is dropped, not queued: the clerk pressed it because nothing showed yet, and
  replaying it would skip the new line's Item box. The same check covers the arrow moves. Each
  dropped key is logged (`item-key-dropped` in `focus-debug.log`).

**T-3 and T-2 built (2026-10-25).** T-3: the module's keydown drops a Tab or move while its busy
flag is up and logs `item-key-dropped` — for at most `BUSY_HOLD_MS` (10 s): a write that never
answers would otherwise leave the keys dead in the table, so after that a move goes ahead and
`item-key-busy-stale` is logged (end-of-session review 2026-10-25). T-2: the module reads the painted order from the table
(`screenOrder`, the `data-row` of its inputs in document order) and steps through it for arrows,
Shift+Tab and Tab (`neighborOnScreen`, `nextAfterEdit`); both pages' after-write focus asks
`itemKeys.nextAfterEdit`, so `rowItemCodeAt` is gone from both. Proof: `tests/item-table-keys.test.js`
(failed first: 2 for T-3, 8 for T-2); probe `df03-item-table` (`--grep=T-3` under its own 1200 ms
lag, `--grep=T-2` sorted by Qty) failed on the code before each fix on both pages and passes now;
`item-table-keys` walks the same path as before.

**T-1 built (2026-10-25).** `src/item-sort-hold.js` (`holdLineOrder`, pure) keeps the lines in the
order last shown, keyed by ERPNext's row `name`; new lines go at the bottom. The keys module decides
when to hold: focus last moved into the table, a cell's pick list (`.link-dd`) or the tape
(`#calc-overlay`). It sorts on a header click (`sortNow`), on 🔄, and when focus moves anywhere else
on the page (a `focusin` outside); a doc under a new name (a first save) is sorted, not held. Each
page's paint goes through `itemKeys.orderForPaint`; the banner (`items-sort-stale`, the yellow of the
tape's remainder note, `electron/doc-fields.css`) shows only while the order shown is not the sort's.
🔄 does not take focus, and the cell keeps it while its line moves. Proof: `tests/item-table-keys.test.js`;
probe `df03-item-table --grep=T-1` (sorted by Qty, type 9 over the top line's 1, Tab): before, the line
and cursor jumped to the bottom on the Bill and the PO; now it stays with the banner, 🔄 sorts, and
clicking a header box sorts. All eight table probes pass together. Smoke specs: the same 10 failures
as before step 0 (lens prefs, blank sandbox); two more failed once in a full run
(`scaffold-peek-return-focus` :577, :850) and pass alone on this code, and :850 failed alone once on
the code before T-1 — timing, not T-1.

**Proof for 0b:** unit tests on the pure order helpers (`src/item-table-nav.js`,
`src/link-picker-policy.js`, `src/doc-item-sort.js`); a probe per fix on both skins, as a
restricted clerk, failing on the old code (T-3 under `ERP_CHAOS_LAG_MS=1200 ERP_CHAOS_LAG_PCT=100`);
the full `npm run nav:check -- --ongoing` before the push. To read a dogfood run afterwards: each
`focusin` in `~/.config/erpnext-ui-app/focus-debug.log` names the cell (`doc-cell-<row>-<field>`,
row = ERPNext's line index), so a jump is a row change other than to the next line on screen. DF-05 (*odd line order for sort
dogfood*) is the paper to dogfood it with.

**Not in this plan:** the slow new PO, the slow added line, and the wait after a create-Item errand
(museum OI-187: causes found, each its own small look). Raised while dogfooding step 0
(2026-10-25), ideas to plan later: renumber the lines as shown, after a sort or a drag, on a draft
(museum OI-189); ask before closing the window on unsaved work, close on a second X (OI-188). Found
and fixed then: the Item list ran under the taxes (`f18d0b2`, probe `df03-item-picker-visible`). The PO's focus after the source picker and
the Bill's ↗ peeks taking Tab were fixed outside this plan (`355249b`; probe
`df03-po-source-focus`).

Found while proving R6a-1 step 1, there before it: a second Bill opened while a new Bill is still
loading can land on the new one (museum OI-190; `scaffold-bill`'s void-and-amend test, cause read
from the log, not yet proved).

## R6a-1 step 1 — the identical leaves, written once (built 2026-10-26)

Measured again after step 0 (same-named functions, trimmed lines). Fourteen were 100% the same; the
ones with a body worth sharing moved, each to a module that takes what differs as `deps`:

| Module | What moved (from both pages) |
|--------|------------------------------|
| `src/calc/site-rounding-ask.js` | `loadSiteRounding` / `moneyRounding` and their three variables: `createSiteRoundingAsk` → `ask()` for the tape, `money()` for the taxes Add box |
| `src/doc-form-date-field-ui.js` | `wireDateField` |
| `src/doc-form-line-tabs-ui.js` | `setLineTab`, and the two tab clicks (`wireLineTabs`) |
| `src/doc-form-tax-notes-ui.js` | `taxFixedNote` / `…RowHtml` / `…MarkerHtml` and the ⓘ clicks, `keepTaxesRemoved`, `collapseTaxDefaultNote`, `toggleTaxDefaultNote`; the maps and sets they share (`fixedByClerk`, `removedOn`) live in the module, which the pages' Remove all and first save still write to |

Left in each page on purpose: one- to five-line wrappers over page state (`setStatus`,
`noteUserEdit`, `peekHoldsRow`, `setItemCellMode`, `focusItemCell`) — sharing them would cost
more lines than it saves. `cancelCommitGateFromOutside` goes with step 2. One thing kept exactly:
the default note reads the document again after ERPNext answers, as both pages did.
Proof: `npm test` (`tests/doc-form-shared-leaves.test.js`, the asker's timing in
`tests/site-rounding.test.js`); specs `scaffold-bill-taxes`, `scaffold-typed-dates` and `scaffold-bill`
— 11 of 12 pass; the twelfth (`scaffold-bill` *OI-171 void and amend*) fails the same way on the
code before step 1 (museum OI-190, below).

## R6a-1 step 2 — the commit gate, written once (built 2026-10-26)

`src/doc-form-commit-gate-ui.js` (`createCommitGate(deps)`) holds the gate's flow; the DOM helpers
it paints with stay in `src/doc-commit-gate-ui.js`. Moved from both pages: `openGate`,
`hideCommitGate`, `setGateBusy`, `refreshCommitGateHint`, `refreshMetaPreflight` (only the newest
read applies), `cancelCommitGateFromOutside`, `requestToolbarAction`, `resolveCommitGate`, the
navigation gate's two handlers, and doc-form's direct-save gate (`openDirectSaveBlockedGate`,
`handleDirectSaveGateChoice`; a page opts in with `directSave`, the Bill does not). `pendingGate`
and the preflight's sequence number live in the module. Each page passes what differs: its words
(`text`), its save blockers and how its preflight reads them (the Bill also asks for account
companies; doc-form first commits a typed date and repaints from the answer), its save, what a
discard repaints (the Bill skips that on the way to Find), its toolbar actions, and how a blocker is
announced (the Bill's `announceSaveBlocker`, doc-form's status line). Four `reduceCommitGatePhase`
calls whose result nothing read are gone (the function is pure).

**Kept as found, noted for later:** on a save that timed out the Bill's gate says "Save did not
finish" and points to Vanilla; doc-form's says "ERPNext rejected the save". Each page still passes
its own wording. On doc-form, a navigation gate whose Save ERPNext refuses turns into the
direct-save gate (doc-form's `doSave` opens it), and main's waiting navigation is released only by
the next navigation (main supersedes it; nothing hangs). The Bill's `doSave` reads the same
preflight as its gate (mandatory fields + account companies) but keeps the prior blockers when the
read fails, where the gate clears them; `commitGateEls` (11 lines) is still one per page.
Proof: `npm test` (`tests/doc-form-commit-gate.test.js`: toolbar, discard, save from the gate,
navigation, the preflight's ordering, direct save, both pages wired); specs `scaffold-receive-gate`
(Save from the gate) and `scaffold-peek-return-focus` *unsaved bill → a PO* (Cancel stays); probe
`nav-desk-after-discard`. The full `nav:check` drives the gate from every door on both skins.

## R6a-1 step 3 — the lines table's rows, written once (item rows built 2026-10-26)

Measured again first (same-named functions): the Bill's `paintItems` is 342 lines, doc-form's 330.
`src/doc-form-item-rows-ui.js` (`createItemRows(deps)`) now paints the rows and wires every cell
for both pages: the shared cells (Line, Amount and its back-in button, Rate / money, checkbox, date,
Qty, text, read-only), and each cell's resting text, typed value, write, focus after the write (a
new line, an empty Item removed), pick list, tape, date filter, × and Amount. Each page keeps the
sorting and its own cells and buttons: the Bill's Source line, Sales order(s) with Assign and the
peeks, Customer and Rec'd (`billLineCellHtml`, wired after `itemRows.paint`); doc-form's Sources.
What differs comes in through `deps`: the test-id prefix, the columns read off a line, caps, the
Bill's line delete that keeps Rec'd, its Qty-over-the-PO split (from the tape or a refused write),
and its repaint after × cleared the only line. `lineApplyInFlight` moved with the write
(`itemRows.applyInFlight()`, which Save waits on). Gone: the Bill's one branch no column reached
(`col.scratch && col.readOnly`: every such column has its own cell) and its own line-key lookup
for the focus after a write (the shared one gives the same answer).

**Two differences found, settled by 5zorro (2026-10-26):** the Bill's × was in the Tab order and
doc-form's was not — *"the x should not be tabbable"*, so × is mouse-only on both. The Bill also
upper-cased a line value when it wrote it, a second layer under the ALL CAPS toggle that
upper-cases as the clerk types: the write-time one came first (2026-08-23), the as-typed one a
week later (2026-08-30, `src/doc-caps-ui.js`), on every page since. 5zorro: *"why not make it only
one layer? … the user should have default be caps on, but should be able to choose after that"*,
so the write-time layer is gone; the toggle is on by default on every form (checked on a new Bill,
PO and Item Receipt) and the clerk may turn it off for the page (spec `scaffold-typed-dates`).

Proof: `npm test` (`tests/doc-form-item-rows.test.js`: both pages' cells, a write, a refused write
the page takes or not, Tab past the last box, ×); probes `item-table-keys` (same key path, PO and
Bill) and `df03-item-table` (6 of 6); specs `scaffold-bill`, `scaffold-ar-doc-skins`,
`scaffold-peek-return-focus`, `scaffold-pure-wiring`: 19 pass, and the 11 that fail fail the same
on the code before (the Sales Order lens prefs and blank-sandbox ones from step 0, and OI-190);
`scaffold-receive-gate`, `scaffold-bill-taxes`, `scaffold-jit-receipt`, `scaffold-typed-dates`:
15 of 15.

**The taxes table: one for every form, the Bill's way.** The two tables had drifted: the Bill's has
the keyboard walk (Tab and the arrows between Account and the row's number, out to the Add box
or back to Add tax), commits on a move or leaving the box, a rate typed on a fixed row works out
its amount, and Rate % shows from the net total. doc-form's has none of that. 5zorro, 2026-10-26:
*"bill probably has the better tax table stuff, please merge the navigation"*, and of the rate
rule: *"normally the tax rate isn't "known" until the bill is received. so my testing and edits
were on the bill entry page. I don't see a reason why the tax rate should be different, can you
make them the same (again preferring the bill right)?"* So this part changes what a clerk sees on
the PO and the other forms: their taxes act like the Bill's. Allocate into items stays the Bill's.

**Built (2026-10-26).** `src/doc-form-tax-table-ui.js` (`createTaxTable(deps)`) is the Bill's table
moved out of its page: the sortable head, the rows (Rate % from the net total on a fixed row,
`displayTaxRateForRow`), the walk (`bill-tax-table-nav.js`), commit on change / blur / a move, the
rate-to-amount rule (`bill-tax-sync.js`), ×. The pages pass their columns (the Bill's has Line),
their own chrome (the Bill's Taxes subtotal footer, doc-form's template ⓘ), the Bill's Allocate
into items and its × lock while Allocate is open, and doc-form's A/R rule (a Sales Taxes template
makes the rows, so they are listed, not typed). What the doc-form forms gain (the Item Receipt is
the purchase form with taxes; the PO skin has none): the walk, a typed box committed when the
clerk moves or leaves it (before: only on change), a Rate on a fixed row writing its Amount, a
fixed row's Rate % shown from the net total (before: 0.00), and the Bill's status words. As on the
Bill, the browser's Tab order no longer enters the rows (the clerk clicks in, then walks) and × is
out of the Tab order. The Add box's own order (Account → Amount → Add tax) was already the same.

**The layout too (5zorro: *"yeah make the layout match the bills layout"*).** doc-form's taxes
section (`electron/doc-form-body.fragment.html`) is now the Bill's: the title row, the Line column
first and sorted by it, fixed column widths, the Taxes subtotal footer (painted by the shared
table), the Add row. `DOC_TAX_SORTABLE_HEADERS` (the Bill's columns without Line) is gone. The A/R
forms' listed taxes get the same layout.

Proof: `npm test` (`tests/doc-form-tax-table.test.js`: Rate % from the net total, the walk on a %
and a fixed row, Tab out to the Add box, a Rate on a fixed row, an Amount on a % row, the Bill's ×
lock, the subtotal); spec `scaffold-bill-taxes` *the Item Receipt's taxes act like the Bill's* (it
also checks the layout: Line first, the subtotal, no sideways scroll, × out of the Tab order) failed on the code
before (Rate % showed 0.00; the old page had no key handler on a tax cell, so the walk and the
Rate's commit could not run either) and passes, with the Bill's 7 (14 of 14 with
`scaffold-receive-gate` and `scaffold-jit-receipt`); the smoke specs fail the same 12 as the code
before (the 11 above and `scaffold-peek-return-focus` :1018, which failed on the old code too).
After step 3 the two pages are 7,816 lines (8,778 before it).

**End-of-session review (2026-10-26).** Found and fixed: a header click sorted twice after a PO →
Item Receipt switch in one window (doc-form's items head and the shared taxes head re-wired on
every layout switch; gotchas G24, spec `scaffold-form-switch`, failed on the code before). Seen,
not changed: the Item Receipt's lines have no Line column and no sortable headers
(`RECEIPT_ITEM_COLS` has no `sortKey`; the PO's and the Bill's have both). **5zorro, 2026-10-26:
match them — "yes".** To build (not started): give `RECEIPT_ITEM_COLS` (`src/receipt-map.js`) the
Line column and a `sortKey` on each column, as `PO_ITEM_COLS` has; then the hold-the-order rules
(T-1) and the walk follow on screen order there too. Proof: a probe or spec that sorts an Item
Receipt's lines and fails on the code before. **Built 2026-11-01:** `RECEIPT_ITEM_COLS` has the
Line column and a sort key on each column, and `readReceiptItemRows` the line number. Found while
proving it: on every doc-form page with a Line column (the PO since 2026-08-23, the Estimate, Sales
Order and Invoice) the Item subtotal sat under Line, because the totals row took the first
display-only column; `lineTotalsColumns` (`src/doc-item-sort.js`) now takes the column labelled
Amount. Proof: probe `df03-item-table` runs T-2 and T-1 on the receipt too, and a new test checks
the Line numbers and where the subtotal sits on the PO and the receipt; the four failed on the
code before (no sortable receipt header; the PO's subtotal under column 0, not Amount's 7), and
the whole probe passes, 10 of 10. `scaffold-form-switch` passes; `-peek-return-focus` and
`-ar-doc-skins` fail only their baseline Sales Order / A/R tests, so the A/R footers are covered by
the unit test, not a spec.
`.taxes-table` / `.taxes-add` in `doc-fields.css` no longer style a doc-form page but stay: a test
keeps them as the vocabulary the check/ACH document will reuse. The item rows' `deps` is long
(about 35 hooks); the next steps (R6a-2) shrink the Bill's closure, which most of them reach into.

## The findings (verbatim from plan 2026-10-19)

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R2-5 | M | low | `main.js` as a whole | 12,744 lines, 187 handlers, 264 functions, **82 module-level `let`s** — the shared state, not the handler count, is what stops a split. Blocks by state touched: print IPC 2 vars, Papers 3, Find 2, payment settings 7, re-link/method change 9, health/incidents 15, doc-form 9, Bill 16 | Move in that order, each to `electron/ipc/<family>.js` taking a `deps` object; Bill and doc-form last, after R2-4 gives `dirtyState` and the scratch fields one owner. No behavior change per step; `tests/write-path-wiring.test.js` must follow the moved code | open — R2-4, its prerequisite, is done; the moves are a session of their own **2026-10-21:** the warm pick lists added a self-contained block (`linkListCopies` … `dropLinkLists`, `doc-link-exists`, `link-list-refresh`, ~300 lines) and `setSurfaceMode` — the first is a natural module to lift out in the split. |
| R6a-1 | M | med | `src/bill-form-page.js` ↔ `src/doc-form-page.js` | 55 functions have the same name in both pages. Measured by trimmed non-blank lines, those functions are 2,193 lines in the Bill and 1,831 in doc-form, and **1,295 lines are identical**. The largest: `paintItems` (464 / 454, 76% the same), `resolveCommitGate` (80%), `beginAmountBackIn` (80%), `focusItemCell` (90%), `paintMoneyStack` (89%), `removeAllTaxes` (79%). The tax-default note, `wireDateField`, `setLineTab`, `setItemCellMode`, `keepTaxesRemoved` and the tax "fixed amount" note are 100%. The differences are mostly words ("Bill" vs `docTitle()`), the paint signature (`paint(doc, amountDue)` vs `paint(doc, scratch)`) and features one side has (Bill: account-company blockers, `announceSaveBlocker`, Find continuing after a gated save; doc-form: direct save). The drift already costs: R3-1 needed two different fixes, and R5-1 / R5b-1 sit under both pages | Don't merge the pages. Move shared code into modules that take a small deps object, as `item-import-ui.js` / `address-picker-ui.js` already do, in this order: **(1)** the identical leaves (~120 lines); **(2)** the commit gate (`openGate` … `resolveCommitGate`, ~150 lines at 80–100%), with hooks for title, blockers and paint; **(3)** `paintItems`' cell builder (~350 identical lines), with the Bill-only cells (Rec'd editor, Assign, ref chip) as hooks. Steps 1–2 are one session. Step 3 is its own session, with both skins' smoke specs. It is independent of R2-5 | open — 5zorro agreed 2026-10-20; schedule as its own sessions |
| R6a-2 | M | low | `src/bill-form-page.js:275–6087` | The whole Bill page is one 5,800-line closure, `bootBillFormPage(api)`, with all state held inside it, so no inner function can be imported or tested, and every extraction must thread state through. The doc-form page is module-level functions. The biggest functions: `paintItems` 472, `openLineAllocationPicker` 318, `paintTaxes` 315, `openInformalLinkPicker` 209, `paint` 201, `runBillSourcePicker` 173, `openAllocateChargeModal` 163, `paintLinkedSources` 139, `doSave` 126 | Four of them are self-contained dialogs (Assign, informal link, source picker, allocate charge: ~860 lines) that read only `lastDoc`, `api`, `setStatus` and `paint`. Move each to its own `src/bill-*-modal-ui.js` taking deps. Assign's steps (customer → Sales Orders → project) become a pure reducer with tests. `paintItems` / `paintTaxes` go with R6a-1 step 3 | **built 2026-10-27 … 31** (`f241b28`, `0f9d3d1`, `33d2127`, `3c3dd2f`); `paintItems` / `paintTaxes` went with R6a-1 step 3 |

## Order

0. **Step 0** (one session): 0a, then 0b's T-3, T-2, T-1.
1. **R6a-1 steps 1–2** (one session): the identical leaves, then the commit gate.
2. **R6a-1 step 3 with R6a-2's `paintItems` / `paintTaxes`** (its own session, both skins' smoke
   specs). Builds on step 0's module.
3. **R6a-2's four dialogs** to `src/bill-*-modal-ui.js` (Assign's steps as a pure reducer). **Built
   2026-10-27 … 31:** Assign (`src/bill-assign.js` + `-modal-ui.js`), the informal link
   (`src/bill-informal-link.js` + `-modal-ui.js`), the source picker's Bill side
   (`src/bill-source-modal-ui.js`; the shared modal was already `src/source-modal-ui.js`), Allocate
   (`src/bill-allocate-charge-modal-ui.js`). Bill page 5,197 → about 4,350 lines. **How each move
   was proven** (the way to prove any move that should change nothing a clerk sees, when no probe
   drives every path): a probe that drives every door of the dialog and `report`s what the clerk
   sees at each step, run on the code before the move and saved; the same probe on the moved
   code, and the two outputs `diff`ed (identical, with run-specific names normalised). These four
   were deleted after; that was a mistake. Probes are kept (HANDOFF § *Test strategy*, 5zorro
   2026-10-22), so from R2-5's payment settings on, the probe stays in `tests/probes/` for the
   next change to the same code. Where a probe would leave records, it makes its own (a PO for the run) and
   cancels and deletes it. The same probes found three bugs the moves kept as they were — the
   old code did the same — museum OI-192, OI-193, OI-195, fixed or left at 5zorro's word (status
   box). Each module was then imported in Node (a missing named import fails there) and checked
   with ESLint's `no-undef` from outside the repo.
3b. **A performance deep dive** (added 2026-10-26, 5zorro: *"perhaps we should add to the refactor, a
   deep dive into the results of the entire probe tests getting ran for performance smells"*):
   run every probe (`npm run nav:check -- --ongoing`, `npm run dogfood:check`, then the rest),
   read `npm run test:times` and the charts (`test-logs/traces/`; HANDOFF § *Test strategy*), and list each
   smell with its numbers — the call, how often, how long, which tests — before changing anything.
   Already seen in one T-3 chart: the bridge check (`ensureErpFormBridge`) runs before every bridge
   call (127 times in 80 s), and the save-drain poll (`drainErpSaveIntoShelved`) 86 times. Each
   smell found gets one line: fix it in R2-5 (which moves that code anyway), a later plan, or
   leave it with the reason. Before R2-5 on purpose: most smells live in `main.js`, and the split
   should carry the fix, not move the smell. Report, not code: what to fix is 5zorro's call.
   **Run 2026-11-01; the report is § *3b — the performance report*, with his picks and what was
   built under the table.**
4. **R2-5** in its order (print IPC → Papers → Find → payment settings → re-link / method change →
   health / incidents → the warm pick lists block → doc-form → Bill), each family to
   `electron/ipc/<family>.js` taking a `deps` object.
   **Started 2026-10-31, before 3b, at 5zorro's word, from the far end:** families away from the
   two smells first (print IPC → Papers → Find → payment settings); the bridge, doc-form and Bill
   moves wait for 3b's report, as above. Built: print (`e448c2e`, `electron/ipc/print.js`) and
   Papers (`b655e78`, `electron/ipc/papers.js`), Find (`18e1331`, `electron/ipc/find.js`: the list,
   the peek and the remembered search; opening the page and its "Open in Vanilla" door write the
   lens prefs and stay in main.js with the other navigation), payment settings
   (`electron/ipc/payment-settings.js`: the payment batch prefs and the delay calendar; the
   payment-direction prefs stay, navigation writes them; proven by the probe
   `pay-settings-doors`, the same output before and after); main.js 13,534 → 12,419 lines.
   Re-link and method change (`electron/ipc/relink-method-change.js`, 2026-11-01): the vendor's
   re-link facts, one re-link, the auto re-links and their reviews, the method-change facts and
   run; it borrows `navDebug`, `erpEval` and `voidAndAmendDoc` (void and amend stays in main.js,
   the Doc page uses it too). No spec or probe drove these doors, so the new probe
   `relink-method-doors` drives every one that writes nothing (a re-link that posts needs a loose
   payment the sandbox does not have; its reconcile, flag and comment calls are reached only to
   their refusals): 16 lines, the same before and after. `dogfood-r9-batch` (a real batch method
   change through the panel) passes on the moved code. main.js 12,549 → 11,926 lines. ESLint is
   in the repo now (plan 10-31) but has no config yet; the import check was done by reading the
   modules' `export`s, and the module's free names by hand.
   Health and incidents (`electron/ipc/health-incidents.js`, 2026-11-02): the DB light's beat and
   its Diagnose dropdown, IT recovery settings, the Navigation / Focus issue dialogs and their
   incidents, Feedback; 10 of the 15 shared variables move with it. It borrows the two trails
   (`navDebug`, `focusDebug` and their rings, read for Diagnose), the login check (`lastHealth`,
   `sendHealth`, `tickLogin`), what an incident freezes (`collect…IncidentContext`, which read the
   whole shell) and the popover dismiss the other dropdowns share; `loadPrefs` calls
   `loadHealthRemediation()`. Moved by script; every one of the 545 lines arrived (checked line by
   line, the getter edits undone), lint (plan 10-31, now in `npm test`) found the module's 33
   imports and `main.js`'s 31 unused ones. New probe `health-incident-doors`: 21 doors (Diagnose,
   Copy with the clipboard stood in for, IT recovery's boxes, both dialogs' refusal / save /
   close, Feedback), the same before and after. Found on the way and fixed first (`6801ccc`):
   Print as image had been falling back to the plain PDF since printing moved (`__dirname` in an
   ES module; probe `print-as-image`). main.js 11,925 → 11,350 lines.
   **The warm pick lists, mapped 2026-11-02:** state `linkListCopies`, `linkListBusy`,
   `linkListGeneration`, `linkListUser`, `linkListMissing`, `LINK_LIST_ERP_HELPERS`; functions
   `loadLinkList`, `checkLinkListChanged`, `warmLinkLists`, `dropLinkLists`; handlers
   `doc-link-exists`, `link-list-refresh`. Outside callers: `searchLink` (answers from the copy
   first), the login check (`tickLoginOnce` drops the copies on a user change), three warm-now
   calls, the test hook `linkListsLoaded`. `searchLink` reads the copies directly, so the cleaner
   cut moves link search with them (`searchLink`, `enrichAccountLinkResults`,
   `rankSupplierSearchResults`, the three `*-search-link` handlers): "link search and its warm
   copies" — to confirm on reading those helpers. Run long checks from a snapshot (HANDOFF §
   Test strategy).
   **Built 2026-11-03 that way** (`electron/ipc/link-search.js`): the four state variables and
   the ERPNext-page helpers, the load / check / warm / drop functions, `searchLink` with its
   Account and vendor enrichments, and the `bill-search-link`, `doc-search-link`,
   `doc-link-exists` and `link-list-refresh` handlers. It borrows `erpEval`, `navDebug`,
   `raceTimeout` and two getters, `lastLogin()` and `dirtyState()` (the Account search marks
   rows of another company than the open Bill's). main.js reads `linkListsUser()` (the login
   check drops the copies when the user changes) and `linkListsLoaded()` (the test hook); Pay
   Outstanding's search handler stays with Pay Outstanding and imports `searchLink`. Every one of
   the 455 lines arrived; lint clean. New probe `link-search-doors`: 20 doors, the same before
   (twice) and after; `dogfood:check` 25/25 on the moved code (from a snapshot). Found on the way: two tests that read main.js alone (no `frappe.db.*` in
   the ERPNext-page scripts; every injection goes through `erpExec`) had stopped seeing moved code;
   both read `tests/main-process-source.js` now. main.js 11,350 → 10,901 lines. Seen, left as it
   was then: the AP clerk cannot read Project, so that list's copy failed and its trail line said
   `reason=undefined`. It turned out to leave ERPNext's "Insufficient Permission" box in the hidden
   page on every open. Fixed 2026-11-03 (gotchas G27): a list the clerk may not read is not copied,
   and the shell's own calls are silent.
   **How each move
   goes** (keep it the same for the rest):
   - The code moves word for word. Its state moves with it as module-level `let`s; what it borrows
     from main.js is set once by `init<Family>(deps)`, called where the block was. A main.js
     variable that is replaced over time (`win`, `erp`) is lent as a getter (`mainWindow()`,
     `erpView()`), the only edit inside moved code. The rest of main.js reads the module through
     named exports, never its state directly (`printFormatFor(doctype)`, not `printPrefs.formats`).
   - Handlers register inside `register<Family>Handlers()`, so importing a module has no effect
     until main.js calls its init.
   - Tests that find a handler or a pinned line in the source read `tests/main-process-source.js`
     (main.js, then each `electron/ipc/*.js`), never main.js alone.
   - The coverage map (`src/architecture-families.js`) lists the new file under its family.
   - **Checks before the commit:** no name in main.js or the module is undefined. There is no
     linter in the repo, so the check is ESLint's `no-undef` run from outside it. Also, every named
     import must exist in its module. Lint does not catch that, and a wrong one stops the app at
     start-up (it happened once on this step: `normalizeEditableText` comes from
     `src/dirty-gate.js`). The import check loads each module in plain Node, which cannot load
     `electron/ipc/*.js` (they import `electron`), so check main.js's imports from them by reading
     their `export`s. Then `npm test`, start the app once headless (`E2E=1
     ERP_USER_DATA_DIR=<tmp>`, wrapped in `timeout -k 5 25`, never a `pkill electron`: 5zorro's
     own app is usually open) and read the errors, then the family's specs from
     `npm run dogfood:for-change`; compare failure names with a run on the code before. Where no
     spec or probe drives a door, write a probe that does, run it before and after, `diff` the
     outputs, and keep it (payment settings: `pay-settings-doors`).
   - The first lint pass found two Bill payment paths broken since 2026-10-23 (fixed `5bef496`,
     probe `leaves-records/bill-payment-paths`). Running that lint in `npm test` is open for
     5zorro to decide: it is one dev dependency.

Each step is its own commit, behaviour unchanged, `npm test` green, the named probes re-run.

## A new Bill waits on nothing (2026-11-03, 5zorro's ask)

5zorro: *"when i hit "new bill" or i hit "home" then "bill" that the new bill page is not instant. It
should wait on nothing via api to get the initial paint up and sticking a cursor into the initial
input box."* And: *"I ask to have a "baseline" that we are competing against."*

**Measured (probe `new-bill-instant`, AP clerk, this machine; it repeats the baseline every run):**

| | Ready (cursor in Vendor / blank shown) |
|---|---|
| Baseline: ERPNext's list "+ Add" | 0.11–0.83 s (no cursor placed) |
| Baseline: a full load of `/app/purchase-invoice/new` | 0.47–2.3 s |
| Shell before: New on a Bill / Home → New Bill | 0.9–5.4 s / 0.9–7.4 s |
| Shell with B (all four in place) | 0.88–1.03 s (within ~0.1–0.3 s of "+ Add" in the same run) |

Where the old time went: the ERPNext page loaded twice in full (`/app`, then the `/new` route,
~1.6 s), then ERPNext's Desk started up again (~3.1 s), then the form (0.1–0.6 s). The 2 s warm-list
check joined that queue on a loaded machine.

**Built (his order, "b then a"; his rule: clear an unsaved blank without a server call, keep
stability in mind):**
- **B.** `openFreshNewDocInPlace`: when ERPNext is up and a load would ask nothing, the blank is made
  in the page as "+ Add" makes it (gotchas G28). Every case a load treats differently takes the full
  load (HANDOFF § Navigation spine). The bridge's `waitForForm` takes `notNames` to wait for the
  fresh blank and ERPNext's opening calls (bridge 32).
- **A.** The provisional blank: painted at once, cursor in Vendor; the Doc page's preload holds what
  touches the form until ERPNext's blank of the same open arrives (`openToken`), then sends it in
  order, or refuses it with a reason. `tests/doc-form-preload-hold.test.js` keeps every channel
  sorted. Bill only; the PO and Item Receipt get B. Its probe found a race older than A: a vendor
  pick whose live checks (does the vendor exist, clear before a switch) were still out when New was
  pressed again was written to the next Bill. Re-checked, that run was the double-press guard (a New
  while one is opening joins it, so there was one Bill); the probe now replaces the blank with another
  open. The pick still notes the open it started on and stops (defensive; no probe reproduces that
  race yet).
- **Commits:** B `0888e11`, A `f5bb484`, the refused-call fix `f4c21c1` (G27). Proofs: B's focused
  probes 26/26 from a snapshot; A's two slow-ERPNext tests fail on B and pass on A; the fix's
  no-box doors fail on A and pass with it.
- **Found on the way:** museum OI-206 (the Project box, fixed with G27's sweep), OI-207 (the
  bridge's `waitForForm` leaves its hooks behind, not decided).

## 3b — the performance report (2026-11-01)

**What was run.** Every probe, on `5ab658a` (main.js did not change during the run; the other
session's uncommitted edits were in the Item Receipt / doc-form lines), 06:51–07:49 UTC: `npm run
nav:check -- --ongoing` (109 pass; after a long session 33 pass, cruft clean), `npm run
dogfood:check` (25 pass), then the 20 other probes (all pass; `dogfood-setup` left out, it builds
scenes). The numbers come from the 69 timeline charts written by that run (`test-logs/traces/`,
one per test), because `test:times` keeps only the last 50 probe logs and the run's own volume
pushed the first `@nav` runs out. Specs and `npm test` do not take the probe lock: one probe
(`nav-spine-home`) overlapped a spec run and a unit run and was run again alone (below).

**How to read the numbers.** A chart's "ERPNext calls" lane is every script the shell sends into the
ERPNext page (`erpEval`, named by method or caller), timed in whole milliseconds. A script's time
is mostly waiting for the page to be free (or for a page that is loading to finish), so the spans
overlap and their sum is not time a clerk could get back. What a clerk feels is a script that
something waits on.

**Headline.** 3,286 s of probe time: **1,858 s (57%) are the probes' own fixed `sleep`s**, 1,428 s
the app and ERPNext working. 21,295 scripts were sent into the ERPNext page.

| # | Smell | Numbers | Cause | Proposal (5zorro's call) |
|---|-------|---------|-------|--------------------------|
| 1 | **Picking a vendor with no address takes about 9 s** (the Bill's header write) | `setHeader`: 131 calls, median 31 ms, p90 220 ms; **9 calls at 9.06–9.17 s**, one per test, none under chaos. 13 of the sandbox's 14 vendors have no address | `waitForSupplierBillingSnapshot` (`electron/erp-form-bridge-page.js`) waits up to `SUPPLIER_PARTY_SETTLE_MAX_MS` (12 s) for the vendor's billing address and accepts "no address" only in the last `SUPPLIER_PARTY_META_ONLY_GRACE_MS` (3 s): 12 − 3 = 9 s. During the wait the page answers other scripts in 0–2 ms, so nothing is busy; it is a timer | **Fix soon, its own small change** (bridge script, not main.js): once ERPNext's own calls for the vendor have gone quiet and the address is still empty, the vendor has none, so stop waiting. Check in ERPNext's source first that the party fetch sets `address_display` only from an existing address. A probe with an address-less vendor times the write before and after. Worth asking whether the clerk sees the 9 s (does the page hold typing meanwhile?) |
| 2 | **The save-drain timer** | Every 750 ms, whatever is on screen, `pollErpRoute` sends two scripts: the bridge check, then the drain. 4,117 drains and as many checks: **39% of all scripts**. Most under 10 ms; 131 drains of 0.5 s or more (a page loading) | The drain runs `ensureErpFormBridge` first. But the bridge is already installed on `did-navigate`, `did-navigate-in-page` and `did-finish-load`; the timer's check is a backstop, and after a full reload it re-sends the 74.5 KB bridge script if those missed | **Fix in R2-5's bridge move:** the timer drains with `{ inject: false }` (a page without the bridge holds no save to take, as the unload path already says), plus a slower backstop check (say every 10 s) for a load whose page events all failed. Halves the timer's scripts. Little a clerk would notice; less churn and quieter charts |
| 3 | The bridge check before every bridge call ("127 in 80 s" in the T-3 chart) | 2,731 bridge calls: the check's median under 1 ms, p90 8 ms, 13% of bridge-call time | A count, not a cost: asking the page for its bridge version is cheap when the page is free | **Leave.** If the R2-5 bridge move wants it gone, skip the check while the page's document has not changed since the last one (a counter bumped on `did-navigate`) |
| 4 | Warm pick lists rechecked on every Doc form open | 8 lists loaded once per launch (674 loads in 66 charts, mean 212 ms); **all 8 rechecked on each Doc form open** when older than 10 s (1,039 checks, mean 86 ms; about 55 per long `@nav` run). Typing in a search rechecks after 60 s | `warmLinkLists(why, minAgeMs = 10_000)` checks every list in `WARM_LINK_DOCTYPES`, not the ones the opened form uses | **Later, with the warm-lists block move:** recheck only the lists the opened form uses, with one age rule (60 s). In the background either way |
| 5 | Reads made once per launch | `calc-site-rounding` 78 calls (mean 428 ms, up to 4.6 s), `fetchOutstandingBills` 86 (281 ms), `relink-reviews` 84 (184 ms), `fetchDraftPayments` 85 (61 ms) | Each test launches the app; a clerk launches it about once a day | **Leave** |
| 6 | The attachment list re-read on every document hand-over | `listPapers` 627 calls in 15 charts, 29 ms each | On purpose: a file attached in Vanilla keeps the document's name, so only a re-read notices it | **Leave** |
| 7 | **The probes' own fixed waits** | 1,858 of 3,286 s. `nav-spine-ongoing` 365 of 507 s; `nav-spine-erp-link` 138 of 194 s; `nav-spine-find` 138 of 175 s; `nav-desk-after-discard` 90 of 97 s. The full `nav:check` took 28 min | `sleep(2000)` (266 times, 532 s), `sleep(1500)`, `sleep(6000)` … where the probe could wait for the thing it needs | **Later plan (test side only, no app change):** replace fixed sleeps with waits on a condition (`expect.poll`), the `@nav` matrix first. The biggest saving in agent turnaround. HANDOFF's note that a `sleep` loop counts as the test's own wait applies |

**Not smells:** the long bridge checks (1,572 of 100 ms or more, up to 5.5 s) are scripts sent
while a new page loads, which wait for it. The probes' `clerkLogin` and `formLoaded` stages are
0.3–8.7 s and stay out of this table.

**Finding 1 built 2026-11-01** (his pick): the bridge's vendor wait ends once ERPNext has been quiet
50 ms with no address (`partyDetailsQuiet`, bridge version 30); the 12 s deadline stays as the
backstop. New kept probe `vendor-no-address` (AP clerk): a vendor with no address 9.2–9.4 s → 0.31 s;
with ERPNext's reply held 4 s the write still waits for it (address arrives; no-address ends at 4.3 s,
was 14.7 s). The source picker never waited (~0.1 s); the clerk saw "Setting vendor…" and the terms
late. Fails on the old script, passes on the new; `npm test` green; `r5b3-item-after-vendor` (also
under chaos 1200/100), `dogfood-d3-vendor-chaos`, `r5b1-vendor-held-tab`, `df03-po-source-focus` pass.

**Finding 2 built 2026-11-01** (his words: *"i think it was originally made when erpnext's source
code was more difficult to examine. drop the check and keep a slower one as a fallback"*), ahead of
the bridge move, as its own change: the route poll drains with `{ inject: false }` and checks the
bridge every 10 s (`BRIDGE_BACKSTOP_MS`). `nav-spine-drafts` on the code before and after (2.1 min
each): bridge checks 500 → 360, all chart spans 1,145 → 1,036 (the 360 left are finding 3's check
before each bridge call, left as decided). `nav-spine-drafts` and `dogfood-r2-1-reload-mid-save`
(a reload in the middle of a save, so the bridge comes back from page events alone) pass.

**Finding 7: his pick 2026-11-01** — replace the probes' fixed sleeps with waits on a condition,
then *"see what breaks then go from there"* (he expects some things to show before they paint
properly; a pause of a person's reaction time, ~300 ms, is his fallback for those).
First pass, the `@nav` matrix's shared `tests/probes/nav-spine.js`: 13 fixed sleeps (1–2.5 s after
a wait that had already seen the page, the reload cell's 3 s + 6 s) became a 300 ms `settle()`, a
poll for the gate to close after Stay, and a poll for the Doc page and ERPNext to name the same
document after a reload; sleeps inside polling loops stay, as does the 8 s after the cruft restart.
`npm run nav:check -- --ongoing`: **all 8 probes, 142 cells, pass in 13 min 20 s (28 min in the
sweep)**. Nothing broke, so no settle needed lengthening.

**Second pass, every other probe (2026-11-01, his "lets do all of these"; his question: "is there a
more elegant way to wait for [the repaints]?").** Yes: the page now says when it is quiet, and the
probes wait for that. Three small app-side marks, no behaviour change: the Doc page's preload counts
its calls to the main process still out (`erpDoc.inFlight()`), each page stamps the end of a repaint
(`window.__docPaintedAt`), and a pick list marks its box while a search waits out its pause or is in
flight (`data-search-pending`). `probe-helpers.js` `docQuiet(app)` waits until those and ERPNext's
`frappe.request.ajax_count` have been calm 300 ms; `searchDone(app)` waits for the pick list only;
`settle()` (now shared; nav-spine uses it) and `leftHome(app)` cover the rest. A `sleep` stays only
where time is the question (a "nothing happens in 15 s" window, the calculator tape's timed fade, a
race the probe sets up, a clerk's pause it imitates), with a comment saying which; the rules are in
`tests/probes/README.md` § *Writing one*. **47 probes, run before and after: 1,657 s → 1,193 s (−28%),
all pass.** Largest: `df03-item-table` 340 → 246 s, `nav-desk-after-discard` 97 → 49, `r5b3` 63 → 13,
`item-table-keys` 79 → 51, `nav-reload-gate` 80 → 55. Slower: `bill-payment-paths` 24 → 34 and
`pay-settings-doors` 17 → 22 — they now wait for ERPNext's background reads the old sleeps cut
across. In `pay-settings-doors` that race was real: `probe-user.js` `back()` swapped the login cookies
while a reply was still out, and the clerk's cookie came back (fixed: it waits for ERPNext to be
quiet first). `r4-2-find-show-more` swings 27–62 s on either code: its scene's delete of 205 POs alone
took 18–27 s across runs (an A/B with the app marks set aside: 35 and 41 s without, 30 and 53 s
with); it now reports both scene timings.

`nav-spine-home` run again: 67.2 s (47.0 s of it its own waits), against 65.5 s for the
overlapped run. A unit run (`npm test`, 27 s) overlapped the second run too; two runs under
different overlaps agreeing within 3% says the overlap did not change this probe's numbers.

## Validate

```bash
cd ~/erpnext-ui-app && npm test && npm start
```
