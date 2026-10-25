# Implementation plan 2026-10-25 — split `main.js` by concern; write the Bill / doc-form code once

> **Status: plan only, nothing built.** Promoted from the architecture review (plan 2026-10-19,
> closed 2026-10-25) at 5zorro's word: *"one part of the plan is to have a separate session to break
> about main.js into separation of concerns and merge doc form and bill form to have 'don't repeat
> yourself'. that is going to be a separate session."* Its own goal: changing the app gets cheaper
> and safer; nothing a clerk sees changes.
>
> **First, one question for 5zorro (below).** Then the sessions in the order under *Order*.

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

## The findings (verbatim from plan 2026-10-19)

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R2-5 | M | low | `main.js` as a whole | 12,744 lines, 187 handlers, 264 functions, **82 module-level `let`s** — the shared state, not the handler count, is what stops a split. Blocks by state touched: print IPC 2 vars, Papers 3, Find 2, payment settings 7, re-link/method change 9, health/incidents 15, doc-form 9, Bill 16 | Move in that order, each to `electron/ipc/<family>.js` taking a `deps` object; Bill and doc-form last, after R2-4 gives `dirtyState` and the scratch fields one owner. No behavior change per step; `tests/write-path-wiring.test.js` must follow the moved code | open — R2-4, its prerequisite, is done; the moves are a session of their own **2026-10-21:** the warm pick lists added a self-contained block (`linkListCopies` … `dropLinkLists`, `doc-link-exists`, `link-list-refresh`, ~300 lines) and `setSurfaceMode` — the first is a natural module to lift out in the split. |
| R6a-1 | M | med | `src/bill-form-page.js` ↔ `src/doc-form-page.js` | 55 functions have the same name in both pages. Measured by trimmed non-blank lines, those functions are 2,193 lines in the Bill and 1,831 in doc-form, and **1,295 lines are identical**. The largest: `paintItems` (464 / 454, 76% the same), `resolveCommitGate` (80%), `beginAmountBackIn` (80%), `focusItemCell` (90%), `paintMoneyStack` (89%), `removeAllTaxes` (79%). The tax-default note, `wireDateField`, `setLineTab`, `setItemCellMode`, `keepTaxesRemoved` and the tax "fixed amount" note are 100%. The differences are mostly words ("Bill" vs `docTitle()`), the paint signature (`paint(doc, amountDue)` vs `paint(doc, scratch)`) and features one side has (Bill: account-company blockers, `announceSaveBlocker`, Find continuing after a gated save; doc-form: direct save). The drift already costs: R3-1 needed two different fixes, and R5-1 / R5b-1 sit under both pages | Don't merge the pages. Move shared code into modules that take a small deps object, as `item-import-ui.js` / `address-picker-ui.js` already do, in this order: **(1)** the identical leaves (~120 lines); **(2)** the commit gate (`openGate` … `resolveCommitGate`, ~150 lines at 80–100%), with hooks for title, blockers and paint; **(3)** `paintItems`' cell builder (~350 identical lines), with the Bill-only cells (Rec'd editor, Assign, ref chip) as hooks. Steps 1–2 are one session. Step 3 is its own session, with both skins' smoke specs. It is independent of R2-5 | open — 5zorro agreed 2026-10-20; schedule as its own sessions |
| R6a-2 | M | low | `src/bill-form-page.js:275–6087` | The whole Bill page is one 5,800-line closure, `bootBillFormPage(api)`, with all state held inside it, so no inner function can be imported or tested, and every extraction must thread state through. The doc-form page is module-level functions. The biggest functions: `paintItems` 472, `openLineAllocationPicker` 318, `paintTaxes` 315, `openInformalLinkPicker` 209, `paint` 201, `runBillSourcePicker` 173, `openAllocateChargeModal` 163, `paintLinkedSources` 139, `doSave` 126 | Four of them are self-contained dialogs (Assign, informal link, source picker, allocate charge: ~860 lines) that read only `lastDoc`, `api`, `setStatus` and `paint`. Move each to its own `src/bill-*-modal-ui.js` taking deps. Assign's steps (customer → Sales Orders → project) become a pure reducer with tests. `paintItems` / `paintTaxes` go with R6a-1 step 3 | open — 5zorro agreed 2026-10-20; with R6a-1 |

## Order

1. **R6a-1 steps 1–2** (one session): the identical leaves, then the commit gate.
2. **R6a-1 step 3 with R6a-2's `paintItems` / `paintTaxes`** (its own session, both skins' smoke
   specs).
3. **R6a-2's four dialogs** to `src/bill-*-modal-ui.js` (Assign's steps as a pure reducer).
4. **R2-5** in its order (print IPC → Papers → Find → payment settings → re-link / method change →
   health / incidents → the warm pick lists block → doc-form → Bill), each family to
   `electron/ipc/<family>.js` taking a `deps` object.

Each step is its own commit, behaviour unchanged, `npm test` green, the named probes re-run.

## Validate

```bash
cd ~/erpnext-ui-app && npm test && npm start
```
