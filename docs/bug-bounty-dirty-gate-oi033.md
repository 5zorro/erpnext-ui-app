# Bug bounty — False dirty gate on Doc Bill (OI-033 class)

## Status

**Fixed** (2026-07-18) — see debrief at end.

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
