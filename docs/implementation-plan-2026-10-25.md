# Implementation plan 2026-10-25 — split `main.js` by concern; write the Bill / doc-form code once

> **Status: plan only, nothing built.** Promoted from the architecture review (plan 2026-10-19,
> closed 2026-10-25) at 5zorro's word: *"one part of the plan is to have a separate session to break
> about main.js into separation of concerns and merge doc form and bill form to have 'don't repeat
> yourself'. that is going to be a separate session."* Its own goal: changing the app gets cheaper
> and safer; nothing a clerk sees changes.
>
> **First, one question for 5zorro (below).** Then the sessions in the order under *Order*.
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

## Question for 5zorro before building

**Recommended: share** (proposed 2026-10-25; confirm at the start of the session). Step 0 is a
share either way.

**Merge the two pages, or share their code?** 5zorro said *"merge doc form and bill form"*. The
review's proposal (R6a-1) is **not** to merge the pages into one but to move what they share into
modules both import (as `item-import-ui.js` and `address-picker-ui.js` already are), with the
differences — the Bill's account-company blockers, Rec'd editor, Assign, its own save path; the
doc-form's direct save — passed in as hooks. Both end with each piece of code written once; the
difference is risk and size of step:

- **Share (the review's proposal):** small steps, each one provable by itself; the two pages stay
  as entry points. Drift ends piece by piece.
- **Merge into one page:** one page for every skin, the Bill's extras switched on by its layout.
  Fewer files at the end, but one big step that has to be proven all at once.

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
cells. The Bill passes no `navFields` today, so it moves through the default columns
(`DEFAULT_ITEM_NAV_FIELDS`), not its own; keep that in 0a, then check whether the Bill's columns
differ, and if they do, ask 5zorro before 0b changes it.

**0b — the three fixes, each in that module, each with a test that fails on the old code:**

| ID | What the clerk saw | Cause | Fix |
|----|--------------------|-------|-----|
| T-1 | Sorted by a column, typed in it, pressed Tab: "it jumped to the wrong row" | Every repaint sorts again, so the line moves to its new place and the cursor goes with it | The order on screen holds still while the clerk types. It is set when a header is clicked; an edit never moves a line, and a new line goes at the bottom. When an edit leaves the table out of sorted order, a banner over the table says so: **"Sort is out of date — it refreshes when you click away. 🔄"** (5zorro: *"i want a banner or something saying 'sorting out of order will refresh sort when you click away.' and have a refresh emoji next to it so that i could click there to have sorting refresh specifically"*). Clicking 🔄 sorts now; focus leaving the table sorts too. The default order (line number) never shows the banner |
| T-2 | Tab past a line's last box, or ↑ / ↓, went to a line that is not the next one on screen | `neighborItemCell` / `nextItemFocusAfterEdit` step to the next line in ERPNext's order (`rowIndex ± 1`), not the next line painted | Moves between lines follow the order on screen: the helpers take that order (the row indexes as painted) and step through it. Shift+Tab out of a line's first box goes to the line above on screen. 5zorro: *"it needs to match what the user expects"* |
| T-3 | Tab from line 2's last box landed on line 4's Item, then left the table (PO-DOG-2002, 21:59:41 UTC) | A Tab while an earlier Tab is still adding a line is not checked, so a slow add (chaos) made two blank lines | A Tab while a line move is still working is held: no second line, no second move |

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
  replaying it would skip the new line's Item box. The same check covers the arrow moves.

**Proof for 0b:** unit tests on the pure order helpers (`src/item-table-nav.js`,
`src/link-picker-policy.js`, `src/doc-item-sort.js`); a probe per fix on both skins, as a
restricted clerk, failing on the old code (T-3 under `ERP_CHAOS_LAG_MS=1200 ERP_CHAOS_LAG_PCT=100`);
the full `npm run nav:check -- --ongoing` before the push. To read a dogfood run afterwards: each
`focusin` in `~/.config/erpnext-ui-app/focus-debug.log` names the cell (`doc-cell-<row>-<field>`,
row = ERPNext's line index), so a jump is a row change other than to the next line on screen. DF-05 (*odd line order for sort
dogfood*) is the paper to dogfood it with.

**Not in this plan:** the slow new PO, the slow added line, and the wait after a create-Item errand
(museum OI-187: causes found, each its own small look). The PO's focus after the source picker and
the Bill's ↗ peeks taking Tab were fixed outside this plan (`355249b`; probe
`df03-po-source-focus`).

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
4. **R2-5** in its order (print IPC → Papers → Find → payment settings → re-link / method change →
   health / incidents → the warm pick lists block → doc-form → Bill), each family to
   `electron/ipc/<family>.js` taking a `deps` object.

Each step is its own commit, behaviour unchanged, `npm test` green, the named probes re-run.

## Validate

```bash
cd ~/erpnext-ui-app && npm test && npm start
```
