# Bug bounty — False dirty gate on Doc Bill (OI-033 class)

## Status

**Fixed** (2026-07-18) — false-trip fix, debrief at end.
**Strike 2 — Fixed** (2026-07-20) — two divergent gate UIs / stuck gate; SSoT merge, see "Strike 2" below.

## Contexts where found

1. **Museum (doc-shell)** — OI-033: lens switch / Second Skin / Doc bind false-tripped `cur_frm.is_dirty()`; users trained to mash Discard.
2. **erpnext-ui-app Doc Bill (2026-07-18)** — open Bill → Home with **no typing** still showed “Unsaved changes / Discard and continue.”
3. **Risk class (dogfood hypothesis)** — focus in an input, click through many fields, leave only whitespace → user expects **no** gate; any `markUserEdited` on focus/blur/no-op `set_value` would violate that.

## Behavior observed

- Navigation away from Doc Bill prompted Save / Discard / Stay when the user had not entered meaningful data.
- ERPNext marks many **new** Purchase Invoices dirty from defaults alone (`is_dirty() === true`).
- Doc shell previously captured a baseline, then gated when live doc drifted (taxes, title, timestamps) **without** Doc-side edits.
- `bill-set-header` / line setters called `markUserEdited` **before** checking whether the value actually changed — so a no-op or whitespace-only commit could poison the gate.

## Behavior expected

| User action | Gate? |
|-------------|-------|
| Open Bill, leave immediately | No |
| Focus / tab through fields, change nothing | No |
| Type spaces only (trim → same as before) | No |
| Change Amount Due, vendor, ref, line qty, etc. | Yes |
| Add/remove line | Yes |

Industry pattern: treat **application-owned edit flag** as SSoT for the overlay UI; do not trust host `is_dirty()` for exploration navigation. Compare **normalized** values (trim text; numeric equivalence for money) before marking dirty.

## Unified project architecture

```
Doc Bill UI (bill.html)
  → IPC only on meaningful change (trim / compare)
main.js
  → markUserEdited only after confirmed value change + successful write
src/dirty-gate.js
  → shouldGateNavigation === !!userEdited   (ERP is_dirty is noise on this surface)
  → valuesMeaningfullyEqual / normalizeEditableText
Vanilla ERP cur_frm
  → may still be is_dirty; ignored for Home/lens leave unless userEdited
```

## Ways forward (checklist)

- [x] Gate navigation on `userEdited` only (not ERP `is_dirty` / baseline drift).
- [x] Pure `valuesMeaningfullyEqual` (trim text; number-ish for qty/rate/amount due).
- [x] Skip `markUserEdited` + skip ERP `set_value` when new value equals current (normalized).
- [x] Amount Due: `markEdited` only when committed value differs from last committed scratch.
- [x] Unit tests: whitespace, no-op header, new-doc ERP-dirty, drifted baseline.
- [ ] Optional later: structured gate log ring (`gate:skipNoop`, `gate:userEdited`) for dogfood export.

## Debrief (after fix)

**Root cause:** Doc Bill reused ERP dirty + baseline matching. New forms are dirty by default; baseline drifts; setters marked `userEdited` even on no-ops.

**Fix:** Product contract for Doc Bill leave = **only** `userEdited`. Setters and the Bill UI refuse to mark dirty unless the normalized value changed.

**Validation:** `npm test` (dirty-gate + existing suite). Re-dogfood: Bill → tab fields → Home (no prompt); type Amount Due → Home (prompt).

---

## Strike 2 — Two dirty gates, one gets stuck (2026-07-20)

Recurrence of the dirty-gate **class** (per house rule: recurrence → update the bounty).
This time the defect is **presentation SSoT**, not false-tripping.

### Contexts where found

1. **erpnext-ui-app Doc Bill (dogfood, 2026-07-20)** — testing "Dirty + invalid Save draft, then continue" on the **New Bill** toolbar action, then navigating **Home and back**, left a **permanent commit-gate section** painted on the page that eventually **timed out** (the 45 s save race).

### Behavior observed

- **Two different dirty-gate UIs** existed for the same concept:
  - Native `dialog.showMessageBox` (`main.js` `gateDirtyThen`) for **navigation** (Home / Vanilla / Recent / tiles) — choices: Save · Discard · Stay.
  - In-page `<div class="commit-gate">` (`bill.html`) for **toolbar** Find / New / Print — choices: Discard · Save · **Save+submit** + per-action rules + validation hints.
- The in-page gate was never hidden on repaint/refocus. Because `bill.html` is a persistent `WebContentsView` (not reloaded on Home→back), a gate left open **stayed open**; during an in-flight save its buttons stayed disabled until the timeout. Navigating via the **native** path meanwhile cleared `dirtyState` and moved on, orphaning the in-page div.

### Behavior expected

| User action | Gate |
|---|---|
| Any dirty leave (toolbar action OR navigation) | **One** gate UI, same choices, same labels |
| Save fails inside the gate | Gate stays open to retry/cancel — never a stuck, buttonless panel |
| Navigate away then back | No orphaned/duplicate gate; no second (native) dialog for the same dirty state |

Industry pattern: **one owner** of "is there a pending gate, what are the choices, and what runs after." Presentation is a single component; multiple entry points feed it, they do not each own a dialog.

### Unified project architecture (after fix)

```
Trigger (SSoT: GateTrigger { kind:"toolbar"|"nav", action|navToken, label })
  ├─ toolbar Find/New/Print  → requestToolbarAction → openGate(trigger)
  └─ navigation Home/Vanilla → main.gateDirtyThen → IPC bill-open-nav-gate → openGate(trigger)
                                                     (native dialog = fallback only if renderer gone)

ONE in-page commit-gate (bill.html)
  → resolveCommitGate(choice)
      → bill-action-flow.nextAfterGate(trigger, choice)  // SSoT decision table
           then: "close"        → stay (nav: resolveNavGate(false))
           then: "run-action"   → runPendingAction(action)         // toolbar
           then: "proceed-nav"  → resolveNavGate(token, true)      // main does the nav
  → on save/discard failure: KEEP gate open, re-enable buttons (no stuck panel)

main single-slot activeNavGate { token, settle } — last nav click wins, supersede cancels prior
```

### Ways forward (checklist)

- [x] Pure SSoT helpers `gateTriggerLabel` / `nextAfterGate` (`bill-action-flow.js`) + unit tests.
- [x] `bill.html`: one `pendingGate` model for toolbar **and** nav; `openGate()`; kind-aware `resolveCommitGate`.
- [x] Navigation routes through the in-page gate via IPC (`bill-open-nav-gate` / `bill-resolve-nav-gate` / `bill-cancel-nav-gate`).
- [x] Native `showMessageBox` demoted to `nativeGateFallback` — only when the Bill renderer is destroyed.
- [x] Failure paths re-enable buttons and keep the gate usable (no stuck/timeout panel).
- [ ] Optional later: gate a window-close/quit path through the same fallback (currently close is ungated).

### Debrief (Strike 2)

**Root cause:** the in-page gate was added for toolbar actions after the native nav dialog already existed, giving the same concept **two UIs** with divergent choices and **two reset paths**. Navigation bypassing the in-page gate left it orphaned and (mid-save) stuck.

**Fix:** one commit-gate component driven by a shared trigger model; both toolbar actions and navigation open it; a pure `nextAfterGate` table decides "run action" vs "proceed nav" vs "stay". The native dialog remains only as a renderer-gone fallback.

**Validation:** `npm test` (new `nextAfterGate` / `gateTriggerLabel` cases + existing suite). Re-dogfood matrix: Dirty→Discard→New; Dirty→invalid Save (warn, stay, no hang); Dirty→valid Save→continue; Home while dirty (same gate, not native); Home→back (no orphan gate).
