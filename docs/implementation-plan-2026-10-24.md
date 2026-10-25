# Implementation plan 2026-10-24 — the navigation spine: a probe per path, and DC-4

> **Status: built 2026-10-24 — steps 1–6 done.** Last full run on the final code
> (`test-logs/nav-check/2026-10-24T10-29-51/`): 109 / 109 fresh cells; the long session's cells
> and cruft check pass after two probe-only fixes (an Esc sent mid-navigation is pressed again; each
> cell sets the Doc lens, since forms follow the last lens). Findings N-1 … N-7 fixed, DC-4 built
> (A), 5zorro's answers 3–4 in; rules folded into HANDOFF § Navigation spine.
>
> **Next, in this order (5zorro 2026-10-24):**
> 1. ~~**Build answer 5** below — a sort toggle on the Submitted section.~~ **Built 2026-10-24**
>    (see answer 5).
> 2. ~~**The review of everything this session built** (`03b3b42` … `fa0bb6e6`): the two-part
>    end-of-session review — the stability / security, maintainability, performance pass over the
>    nav fixes N-1 … N-7, DC-4, the matrix driver and `nav:check`, and moving any context-only
>    detail into durable files.~~ **Done 2026-10-24** — *Review of this session's work* below.
> 3. Then session 6 of plan 10-19 (R7 + R8 + R12). 5zorro still dogfoods the feel.

5zorro (2026-10-24): *"is there a probe for each of the possible ways to navigate … I have made a
whole implementation plan just to review navigation, and it has broken at least once since that was
applied."* And on DC-4 (plan 10-19 § Dogfood check, an unsaved new Bill lost when the ERPNext page
reloads): *"this is entwined with how peeks and reloads work … either make a plan where all form
entries keep info on reload without breaking navigation, or we need to make it match vanilla."*

The navigation architecture is plan 09-26 Parts A–D (HANDOFF invariant 8, `nav-destination.js`
`openTargetFor` → `openResolvedTarget`). This plan does not change it; it pins it.

## What Vanilla does on a reload (read 2026-10-24, frappe v16.31.0)

Vanilla keeps **nothing** across a reload. `form.js` `dirty()` adds a `beforeunload` listener, so a
browser asks "There are unsaved changes, are you sure you want to exit?" — leave, and the typing is
gone; stay, and nothing happens. Electron does not show that box itself: the shell catches it
(`will-prevent-unload` → `onErpWillPreventUnload`, `main.js`), lets it through when its own unsaved
check ran just before (`decideErpUnload`), else asks with its own dialog.

**Checked first (build step 1, done 2026-10-24 — probe `nav-reload-gate`, `docs/gotchas.md` G23):**
R2-1's reload asked nothing because **Chromium runs a page's "leave?" listener only after a person
has interacted with that page**. The form *is* dirty and Frappe's listener *is* on (a new document is
dirty from the start), but the clerk types in the Doc page, never in the ERPNext page, so the
listener is skipped silently and `will-prevent-unload` never fires — at 4 s or 22 s after the open
alike; the shell's 20 s "recent check" window plays no part. After one gesture in the ERPNext page
the same reload was asked, and Stay kept the typing. So "match Vanilla" is **not** half true today:
Frappe's listener guards only typing done in Vanilla, and DC-4 (A) has to come from the shell's own
unsaved check (`dirtyState.userEdited`). Also seen: after the reload the Doc page's status line
still names the old `new-purchase-invoice-…` that no longer exists (the stale header DC-4 must
repaint).

## DC-4 — two ways

| | A. Match Vanilla (recommended first) | B. Keep the typing across a reload |
|---|---|---|
| What the clerk gets | A reload under unsaved Doc typing is asked first, as Vanilla asks; if it happens anyway (a crash, a logout in a browser tab), the Doc page says "ERPNext reloaded — this bill was never saved" and repaints from the reloaded form, never showing stale typing | The typed values are kept by the shell and offered back after the reload: "Restore what you typed" |
| Where it touches navigation | Only the reload path (`did-navigate` on the ERPNext page while the Doc page holds an unsaved new document) | Every path that navigates the ERPNext page: a peek, an errand, a lens switch and a detour all navigate it **on purpose** — each must be told apart from a reload, or B restores typing into the wrong document |
| Size | Small: one check on `did-navigate` + one message + the probe | Large: a per-document unsaved store, restore rules per path, a probe per path |
| Risk | Low | The peek/park/errand machinery (`parkedDocSurface`, `shelvedDrafts`, soft peeks) already keeps documents across navigation; B is a second mechanism beside it |

**Decided (5zorro 2026-10-24): A.** B only if dogfood later shows reloads under typing happen. Either way the
spine probes below come first, so the change is made against a pinned map.

## The spine — every way to move, as a matrix

Four axes. A probe runs each cell and checks the same four things: **lands** on the right surface
and document; **unsaved typing** is kept or the gate asks (never silently lost); **back** (Esc /
← Back / the rail) returns to where the clerk was; **focus** lands where it was left.

- **Start from:** Home tile · toolbar lens (Doc ⇄ Default-skin) · history rail (Recent) · Drafts
  flyout · a link inside the ERPNext page · a Find page · the Pay Outstanding board.
- **Document state:** new + unsaved · saved draft clean · saved draft with unsaved changes ·
  submitted.
- **Move:** to Desk · same document in the other lens · an errand (Create Item / Create Vendor and
  back, saved and abandoned) · a peek at a source (PO, receipt) and back · another document ·
  the ERPNext page reloads (DC-4).
- **Fresh vs ongoing** (5zorro 2026-10-24: *"to see if accumulated cruft happens such that the
  flyout bar become unreliable and needs a pruning"*): each cell run once on a fresh start (empty
  `nav-state.json` from a backup copy) and once **after a long session** — the same probe first plays
  a scripted day (say 100 moves across the cells: opens, peeks, errands, abandoned drafts, deleted
  documents, lens switches) and then runs the cell. Extra checks for the ongoing run: the Drafts
  flyout and the history rail list only documents that still exist, each once, in the order used;
  a deleted or submitted draft has left the Drafts flyout; nothing is still parked or peeked that the
  clerk left; the peek stack is empty at Home; `nav-state.json` stays under a set size; the startup
  prune (`nav-prune`) and any in-session prune keep it so. Every row a check finds wrong is a
  pruning rule to write down (HANDOFF), not a one-off delete.

Not every cell exists (a submitted document has no unsaved changes); the probe file lists the cells
it skips and why. The probes never touch 5zorro's own `nav-state.json` contents: the runner already
backs up and restores the prefs; the fresh run starts from an empty copy, the ongoing run from the
scripted day.

**Covered today** (e2e specs, run by hand): detour from the board and back (`scaffold-detour`);
peek parent / Go to Vendor add… / ping-pong (`scaffold-peek-parent`); Create Item / Customer errands
saved and abandoned, unsaved-bill gate before a PO (`scaffold-peek-return-focus`); Find doors
(`scaffold-find-doc`); D1 (dropdown closed after Vanilla and back, dogfood probe).

**Not covered** (5zorro's examples among them): Home → Desk; Home → submitted Doc → same document in
Vanilla; Home → draft with unsaved changes in Doc → Vanilla (does the typing carry?); every move
started from the Drafts flyout or the history rail rather than the toolbar or the page; an
ERPNext-page link from a Doc-skin document; a reload under each state (DC-4).

## Build order (after 5zorro's answers)

1. ~~Explain the "To check first" above (one probe, read-only).~~ Done 2026-10-24, above.
2. `tests/probes/nav-spine-*.probe.js`, one file per *start from*, each a table of cells (state ×
   move) driven by one runner; tagged `@nav`; makes only `ZZ NAV …` drafts, deleted after.
   `npm run nav:check` runs them all and prints the matrix pass / FAIL / skipped.
3. The ongoing-state run: the scripted day, then the same matrix, with the cruft checks.
4. Run it all on today's code; every FAIL is a finding sorted like plan 10-19's (fix, or 5zorro's call).
5. DC-4 (A) built against the pinned matrix; its reload column turns green.
6. Rule for later sessions (HANDOFF): a change to navigation runs `npm run nav:check` first and after.

## Matrix run 1 — today's code (2026-10-24, build steps 2 and 4)

`npm run nav:check`: 109 cells, 17 min (`test-logs/nav-check/2026-10-24T06-56-31/`): 81 pass, 28 fail.
After fixing the probe's own faults (a poll that read the ERPNext page mid-load; Esc sent before the
shell saw the stand-in Item's route — a real save takes a round trip) the failures sort into two:

| Finding | Cells | What | Cause | Sorted |
|---|---|---|---|---|
| **N-1** | `*/new-typed/other`, `*/draft-typed/other` (7) | From a Bill with unsaved typing, a Drafts-list row opens another draft **without asking** — the typing is gone (the draft came back as ERPNext saved it) | `showDocForm` skips the unsaved gate whenever the clerk is already on a Doc page (`if (surfaceMode === "doc" \|\| skipDirtyGate) proceed()`, since the PO / IR skins, `cb60d5b`) — the Home button, Desk and the lens tab gate, the rail does not | Fixed |
| **DC-4** | `*/new-typed/reload`, `*/draft-typed/reload` (7) | A reload under typing asks nothing (G23) and the Doc page keeps showing the typing and the dead `new-…` name | — | Build (step 5) |

| **N-2** | `*/new-typed/lens` under answer 3 | "Save draft, then continue" on a lens switch saved the Bill, then opened a **blank** new form in Vanilla | `open-vanilla-skin` took the route before the gate (`…/new-…`); after the save that address is a fresh form | Fixed: for an unsaved new document the handler gates first, then asks ERPNext's form for its saved name and opens that draft |
| **N-3** | `home/new-typed/desk` (intermittent) | Discard on a new Bill, then Desk: the clerk is pulled back onto a blank Bill | Discard runs `frappe.new_doc`; a load of `/desk` armed no route guard (it has no doctype), so the 750 ms route poll read the fresh `new-…` form after the Desk load began and the Doc lens took it | Fixed: Desk arms its own guard (`DESK_INTENT`: accepts any page that is not one document, rejects a form). Probe `nav-desk-after-discard`: old code 3 of 20 tries ended on the Bill, the fix 20 of 20 on Desk |

N-1 fixed too: `showDocForm` gates whenever it opens a *different* document from a Doc page (New
passes `skipDirtyGate`, as before); its 7 cells pass.

## Built (2026-10-24)

| Step | What | Where |
|---|---|---|
| 1 | Why a reload under Doc typing asks nothing — Chromium skips the "leave?" of a page nobody touched (G23) | probe `nav-reload-gate` |
| 2 | The matrix: 7 starts × 4 states × 7 moves (109 cells), judged on lands / typing / back / focus | `src/nav-spine.js`, `tests/probes/nav-spine*.js`, `npm run nav:check` |
| 3 | The long session: a seeded day of cells with drafts made and deleted in ERPNext, then the Drafts / Recent cells again and the cruft check, then a restart | `nav-spine-ongoing`, `src/nav-cruft.js`, `nav:check -- --ongoing` |
| 4 | Findings sorted and fixed: N-1, N-2, N-3 (table above); **N-4** — the startup / re-login prune asked ERPNext for a Recent row's URL-encoded name (`ALPINE%20SUPPLY%20CO`) and dropped rows whose name has a space (`navRecordOf` decodes; found by the cruft check) | `b7d9c34`, `b376e45` |
| 4b | **N-5** — a Vanilla save reaches Drafts on the 750 ms route poll; a load that replaced the page first lost it (the long-session day saved 3 drafts and moved on: none reached Drafts) → `loadErpUrl` drains first (after: 3 of 3). **N-6** — a draft deleted in ERPNext mid-session stayed on Drafts until a restart (the cruft check: 2 of 2 after the day, clean after a restart) → Home re-checks the rail at most once a minute | `main.js` `loadErpUrl`, `showHome`; `nav-prune.js` `shouldPruneOnHome` |
| 4c | **N-7** — Vanilla open of a document, Doc tab clicked at once: the load committed under the Doc page and cut off its reads — no lines, "The ERPNext page reloaded before the step finished", never recovered (made likelier by N-5's drain delaying the load). A load the shell started from Vanilla / Home that lands under the Doc page now repaints it silently (the move's origin is taken when it is asked, and a forced reopen's two loads share it) | `erp-reload-notice.js`, `main.js` `loadErpUrl` |
| 5 | DC-4 (A): after a load of the ERPNext page the shell did not start, the Doc page repaints from the reloaded form (header boxes forced) and says what was lost; during a Save, that it may or may not have saved | `src/erp-reload-notice.js`, `d6d0f14`, `b376e45` |
| 6 | HANDOFF rule: a navigation change runs `npm run nav:check` before and after | HANDOFF § Navigation spine |

Answer 4 checked by `leaves-records/nav-submitted-backtrack` (leaves two cancelled Bills): both
submitted Bills are on Submitted, newest first, once each, and the older reopens in the Doc lens
after a new Bill. **Reopening it does not move it up** — Submitted is in submission order, not
visit order. 5zorro's words were *"the correct order of deduplicated stuff I worked on recently"*;
if "worked on" means opened, Submitted should re-sort on open — his call.

Not re-run on the old code (the matrix's first run is the "before" for N-1 and DC-4; N-3 has its
20-try probe; N-2 was found under answer 3, a new rule): none outstanding.

## Review of this session's work (2026-10-24, after answer 5)

The two-part review 5zorro asked for (security / stability, maintainability, performance; and
context-only details moved somewhere durable), over `03b3b42` … `c8a56ae`.

| # | Kind | Gap | Sorted |
|---|---|---|---|
| RV-1 | stability, medium | DC-4's repaint waits for ERPNext to come back; its "moved on?" check compared only the surface and the skin, so a clerk who opened another Bill meanwhile could get "your unsaved changes to X are gone" on that other Bill | Fix: give up when the Doc page's document changed (a new document's `new-…` rename allowed) |
| RV-2 | stability, low | The one-time notice rides on the *next* snapshot pushed; if the repaint returns without pushing one, a later unrelated snapshot carries it | Fix: clear it when the repaint returns |
| RV-3 | stability, low | Two reloads in a row run two repaint loops; the `did-finish-load` listener stays attached when the 15 s timeout wins | Fix: the newest repaint supersedes; the listener is removed |
| RV-4 | stability, medium | Since N-5's drain a load starts after an async step, so two loads asked in quick succession can land out of order (the earlier one last) | Fix: a sequence number — a load superseded while draining never starts (resolves false, which every caller already reads as "did not happen") |
| RV-5 | performance | The drain injects the whole form bridge into a page that lacks it, only to ask about a save it cannot hold | Fix: drain without injecting |
| RV-6 | stability, low (pre-existing, newly reachable) | The lens switch remembers "Vanilla" for Bills *before* the gate, so Stay on the gate leaves Bills opening in Vanilla | Fix for the new-document branch: remember after the gate passes |
| RV-7 | safety, medium | The matrix probes write wherever they run — drafts made, saved, deleted — and every insert consumes a number of the Bill naming series (the sandbox went 00054 → 00188): on company data, gaps in the invoice series | Fix: the driver refuses off the sandbox (`assertSandboxSite`); README |
| RV-8 | honesty | This plan filed `lens/draft-clean/desk` under N-3 — that cell discards nothing, so the cause was not shown | Corrected: seen once (run 1), not seen in 6 later full runs; unexplained. If it comes back, its trail is in `nav-debug.log` |
| RV-9 | residual | N-7's repaint assumes the ERPNext form is the Doc page's document: a Vanilla open of X overtaken by opening Y on the Doc lens could pair Y's route with X's form (the Bill re-syncs, `ensureErpMatchesShellRoute`; other skins do not) | Recorded, not fixed — an edge of an edge; the matrix has no cell for it |
| RV-10 | residual | Only Doc-page Save / Submit count as "during a save" for DC-4's wording; a reload during void-and-amend or a board write gets the plain "changes are gone" | Recorded, not fixed |

**Proven how (focused, per HANDOFF's new rule):** RV-6 has a matrix check (`lensAfterStay`) that
failed on the old code ("Stay kept the typing but switched Bills to open in Vanilla") and passes
now; the lens cells around RV-1 … RV-5, `nav-reload-gate`, R2-1's probe and `nav-desk-after-discard`
pass on the fixes. **RV-1, RV-3 and RV-4 are reasoned, not probed** — no cell makes those races (a
second reload or a second load inside the drain; `erp-load-superseded` never logged), so they rest
on the code read. RV-7 runs on every matrix launch. The full `nav:check -- --ongoing` over these
fixes is owed before the next push (the run just before them: 109 / 109, 33 / 33, cruft clean —
`test-logs/nav-check/2026-10-25T03-17-58/`).

Context-only details moved: the sandbox's Bill series consumed by the matrix and the cancelled
`ZZ-NAV-S…` Bills (local notes file sandbox note); RV-8's correction above.

## 5zorro's answers (2026-10-24)

1. DC-4: **A** — match Vanilla: ask before a reload under unsaved typing, say so after one that
   happened anyway, never show stale typing.
2. The axes stand; add **fresh vs ongoing state** (accumulated cruft in the flyout / rail).
3. **Doc → Vanilla on a typed new document** (first matrix run: the shell asks, and Discard opens a
   *different, blank* new form in Vanilla): don't try to carry unsaved typing across lenses —
   *"increasingly difficult to litigate seeing as I want JIT entry of PO and IR"*. Instead the
   unsaved gate offers **Save as draft**, and Vanilla then opens **that saved draft**. A saved draft
   with unsaved typing already carries across (same form). The matrix cell
   `*/new-typed/lens` checks it: asked, and after Save the Vanilla form is the saved draft with the
   typing in it (the probe deletes that draft).
4. **Recent keeps one row per doctype — a feature, not a gap.** Backtracking to a submitted document
   is the **Submitted** section of the rail: *"if I submit then open a new bill, there should be a
   'submitted' section of the flyout bar that I can go to if I wanted to backtrack. So navigation
   info is not lost, and the correct order of deduplicated stuff I worked on recently should be at
   the top."* So: a document submitted in this session is at the top of Submitted (deduplicated,
   newest first) and opens again from there, after any number of other Bills. The matrix judges
   "back" for a merely *viewed* submitted bill as not applicable (Recent's row moved on, by design);
   a new probe submits a `ZZ-NAV` draft, opens a new Bill, and goes back through Submitted (leaves a
   submitted record — `leaves-records/`). The ongoing run checks Submitted stays deduplicated and
   newest-first.
5. **Submitted's order — a toggle, not a choice for every user** (2026-10-24, reply to the open
   question under *Built*): *"I don't want to choose for all users. Can there be a toggle slider for
   sort where sort is by submission date or by viewed date. Then I can have it by default
   'submission date' but be able to switch to viewed date if I'm working on a specific question and
   have bounced between some specific forms from today."* So the Submitted section gets a two-way
   switch: **Submitted** (default — newest submission first, as today) ⇄ **Viewed** (the one opened
   most recently first). The choice is remembered per user (a pref, as the rail's collapse is), and
   opening a document from Submitted records when it was viewed. **Built 2026-10-24:** a *Sort
   Submitted ◯ Viewed* switch at the top of the Submitted panel (`data-testid="submitted-sort"`),
   kept in `nav-state.json` as `submittedSort`. "Viewed" counts any time the submitted document is on
   screen — either lens, any door, a peek too (`noteSubmittedViewed` in `sendHistory`), not only a
   click in the panel: 5zorro's case is bouncing between forms. A row never viewed counts from its
   submission; in Viewed order the "Earlier sessions" divider is dropped (rows interleave) and each
   row shows when it was viewed (hover: both times). Pure: `src/submitted-docs.js`
   (`sortSubmitted`, `markSubmittedViewed`, `normalizeSubmittedSort`). Proven by
   `leaves-records/nav-submitted-backtrack`: default order unchanged by a reopen; the switch puts the
   one viewed last first and is kept; viewing the other re-sorts.
