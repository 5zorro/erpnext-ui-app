# Implementation plan 2026-10-25 — split `main.js` by concern; write the Bill / doc-form code once

> **Status: step 0 built (2026-10-25): 0a, T-3, T-2, T-1. R6a-1 steps 1–2 built (2026-10-26).
> R6a-1 step 3 built (2026-10-26): the item rows, and one taxes table for every form, the Bill's
> way (5zorro). Plan 2026-10-26 (tests that run while the app is open, and where their time goes)
> built and closed 2026-10-26 (HANDOFF § *Test strategy*). R6a-2's four dialogs: Assign moved
> 2026-10-27 (`src/bill-assign.js` its steps, pure and tested; `src/bill-assign-modal-ui.js` the
> dialog), then museum OI-192 fixed at 5zorro's word (a tick on an order no longer listed is dropped;
> customer and project picks kept by name); the informal link dialog moved 2026-10-27
> (`src/bill-informal-link.js`, `src/bill-informal-link-modal-ui.js`; museum OI-193 found, his call);
> next the source picker, allocate charge; also owed, decided 2026-10-26: the Item Receipt's
> lines get the Line column and sortable headers (end of the step 3 section). Then 3b, a
> performance deep dive over every probe's times and charts (added 2026-10-26, *Order*).** 5zorro paused his DF-03 dogfood round partway (2026-10-25) until
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
Receipt's lines and fails on the code before.
`.taxes-table` / `.taxes-add` in `doc-fields.css` no longer style a doc-form page but stay: a test
keeps them as the vocabulary the check/ACH document will reuse. The item rows' `deps` is long
(about 35 hooks); the next steps (R6a-2) shrink the Bill's closure, which most of them reach into.

## The findings (verbatim from plan 2026-10-19)

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R2-5 | M | low | `main.js` as a whole | 12,744 lines, 187 handlers, 264 functions, **82 module-level `let`s** — the shared state, not the handler count, is what stops a split. Blocks by state touched: print IPC 2 vars, Papers 3, Find 2, payment settings 7, re-link/method change 9, health/incidents 15, doc-form 9, Bill 16 | Move in that order, each to `electron/ipc/<family>.js` taking a `deps` object; Bill and doc-form last, after R2-4 gives `dirtyState` and the scratch fields one owner. No behavior change per step; `tests/write-path-wiring.test.js` must follow the moved code | open — R2-4, its prerequisite, is done; the moves are a session of their own **2026-10-21:** the warm pick lists added a self-contained block (`linkListCopies` … `dropLinkLists`, `doc-link-exists`, `link-list-refresh`, ~300 lines) and `setSurfaceMode` — the first is a natural module to lift out in the split. |
| R6a-1 | M | med | `src/bill-form-page.js` ↔ `src/doc-form-page.js` | 55 functions have the same name in both pages. Measured by trimmed non-blank lines, those functions are 2,193 lines in the Bill and 1,831 in doc-form, and **1,295 lines are identical**. The largest: `paintItems` (464 / 454, 76% the same), `resolveCommitGate` (80%), `beginAmountBackIn` (80%), `focusItemCell` (90%), `paintMoneyStack` (89%), `removeAllTaxes` (79%). The tax-default note, `wireDateField`, `setLineTab`, `setItemCellMode`, `keepTaxesRemoved` and the tax "fixed amount" note are 100%. The differences are mostly words ("Bill" vs `docTitle()`), the paint signature (`paint(doc, amountDue)` vs `paint(doc, scratch)`) and features one side has (Bill: account-company blockers, `announceSaveBlocker`, Find continuing after a gated save; doc-form: direct save). The drift already costs: R3-1 needed two different fixes, and R5-1 / R5b-1 sit under both pages | Don't merge the pages. Move shared code into modules that take a small deps object, as `item-import-ui.js` / `address-picker-ui.js` already do, in this order: **(1)** the identical leaves (~120 lines); **(2)** the commit gate (`openGate` … `resolveCommitGate`, ~150 lines at 80–100%), with hooks for title, blockers and paint; **(3)** `paintItems`' cell builder (~350 identical lines), with the Bill-only cells (Rec'd editor, Assign, ref chip) as hooks. Steps 1–2 are one session. Step 3 is its own session, with both skins' smoke specs. It is independent of R2-5 | open — 5zorro agreed 2026-10-20; schedule as its own sessions |
| R6a-2 | M | low | `src/bill-form-page.js:275–6087` | The whole Bill page is one 5,800-line closure, `bootBillFormPage(api)`, with all state held inside it, so no inner function can be imported or tested, and every extraction must thread state through. The doc-form page is module-level functions. The biggest functions: `paintItems` 472, `openLineAllocationPicker` 318, `paintTaxes` 315, `openInformalLinkPicker` 209, `paint` 201, `runBillSourcePicker` 173, `openAllocateChargeModal` 163, `paintLinkedSources` 139, `doSave` 126 | Four of them are self-contained dialogs (Assign, informal link, source picker, allocate charge: ~860 lines) that read only `lastDoc`, `api`, `setStatus` and `paint`. Move each to its own `src/bill-*-modal-ui.js` taking deps. Assign's steps (customer → Sales Orders → project) become a pure reducer with tests. `paintItems` / `paintTaxes` go with R6a-1 step 3 | open — 5zorro agreed 2026-10-20; with R6a-1 |

## Order

0. **Step 0** (one session): 0a, then 0b's T-3, T-2, T-1.
1. **R6a-1 steps 1–2** (one session): the identical leaves, then the commit gate.
2. **R6a-1 step 3 with R6a-2's `paintItems` / `paintTaxes`** (its own session, both skins' smoke
   specs). Builds on step 0's module.
3. **R6a-2's four dialogs** to `src/bill-*-modal-ui.js` (Assign's steps as a pure reducer).
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
4. **R2-5** in its order (print IPC → Papers → Find → payment settings → re-link / method change →
   health / incidents → the warm pick lists block → doc-form → Bill), each family to
   `electron/ipc/<family>.js` taking a `deps` object.

Each step is its own commit, behaviour unchanged, `npm test` green, the named probes re-run.

## Validate

```bash
cd ~/erpnext-ui-app && npm test && npm start
```
