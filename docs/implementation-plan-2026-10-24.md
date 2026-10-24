# Implementation plan 2026-10-24 — the navigation spine: a probe per path, and DC-4

> **Status: plan only — nothing built.** Waiting on 5zorro's two answers (§ Questions). Written at
> the end of a long session; the next session starts here.

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

**To check first (not yet explained):** in R2-1's probe the ERPNext page reloaded with the Bill's
typing in it and no question was asked. Either the form was not `dirty()` (the bridge's writes may
not set it), or the shell's "recent check" let it through. That decides whether "match Vanilla" is
already half true.

## DC-4 — two ways

| | A. Match Vanilla (recommended first) | B. Keep the typing across a reload |
|---|---|---|
| What the clerk gets | A reload under unsaved Doc typing is asked first, as Vanilla asks; if it happens anyway (a crash, a logout in a browser tab), the Doc page says "ERPNext reloaded — this bill was never saved" and repaints from the reloaded form, never showing stale typing | The typed values are kept by the shell and offered back after the reload: "Restore what you typed" |
| Where it touches navigation | Only the reload path (`did-navigate` on the ERPNext page while the Doc page holds an unsaved new document) | Every path that navigates the ERPNext page: a peek, an errand, a lens switch and a detour all navigate it **on purpose** — each must be told apart from a reload, or B restores typing into the wrong document |
| Size | Small: one check on `did-navigate` + one message + the probe | Large: a per-document unsaved store, restore rules per path, a probe per path |
| Risk | Low | The peek/park/errand machinery (`parkedDocSurface`, `shelvedDrafts`, soft peeks) already keeps documents across navigation; B is a second mechanism beside it |

Recommendation: **A now**; B only if dogfood shows reloads under typing happen. Either way the
spine probes below come first, so the change is made against a pinned map.

## The spine — every way to move, as a matrix

Three axes. A probe runs each cell and checks the same four things: **lands** on the right surface
and document; **unsaved typing** is kept or the gate asks (never silently lost); **back** (Esc /
← Back / the rail) returns to where the clerk was; **focus** lands where it was left.

- **Start from:** Home tile · toolbar lens (Doc ⇄ Default-skin) · history rail (Recent) · Drafts
  flyout · a link inside the ERPNext page · a Find page · the Pay Outstanding board.
- **Document state:** new + unsaved · saved draft clean · saved draft with unsaved changes ·
  submitted.
- **Move:** to Desk · same document in the other lens · an errand (Create Item / Create Vendor and
  back, saved and abandoned) · a peek at a source (PO, receipt) and back · another document ·
  the ERPNext page reloads (DC-4).

Not every cell exists (a submitted document has no unsaved changes); the probe file lists the cells
it skips and why.

**Covered today** (e2e specs, run by hand): detour from the board and back (`scaffold-detour`);
peek parent / Go to Vendor add… / ping-pong (`scaffold-peek-parent`); Create Item / Customer errands
saved and abandoned, unsaved-bill gate before a PO (`scaffold-peek-return-focus`); Find doors
(`scaffold-find-doc`); D1 (dropdown closed after Vanilla and back, dogfood probe).

**Not covered** (5zorro's examples among them): Home → Desk; Home → submitted Doc → same document in
Vanilla; Home → draft with unsaved changes in Doc → Vanilla (does the typing carry?); every move
started from the Drafts flyout or the history rail rather than the toolbar or the page; an
ERPNext-page link from a Doc-skin document; a reload under each state (DC-4).

## Build order (after 5zorro's answers)

1. Explain the "To check first" above (one probe, read-only).
2. `tests/probes/nav-spine-*.probe.js`, one file per *start from*, each a table of cells (state ×
   move) driven by one runner; tagged `@nav`; makes only `ZZ NAV …` drafts, deleted after.
   `npm run nav:check` runs them all and prints the matrix pass / FAIL / skipped.
3. Run it on today's code; every FAIL is a finding sorted like plan 10-19's (fix, or 5zorro's call).
4. DC-4 (A or B) built against the pinned matrix; its reload column turns green.
5. Rule for later sessions (HANDOFF): a change to navigation runs `npm run nav:check` first and after.

## Questions for 5zorro

1. DC-4: **A** (match Vanilla — ask before, say so after, never show stale typing) or **B** (keep
   the typing across a reload)?
2. The matrix axes above — anything missing (a start surface, a move) or a cell that does not matter?
