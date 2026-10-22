# Implementation plan — 2026-10-21: warm pick lists (OI-185)

> **Status 2026-10-21:** W1–W4 built and proven in the app the same day. 5zorro dogfoods next
> (*Dogfood* below). Came out of review 10-19 R5b-1 (plan 10-19): he chose "a" for a held Tab and
> asked for warm lists to make the pickers feel instant.

## What and why

Today every keystroke in a link field (vendor, item, terms …) waits for ERPNext: the shell asks
`frappe.desk.search.search_link` through the ERPNext page (`erpEval`), and a vendor search asks a
second time for the vendors' last Purchase Orders. That round trip is the bottleneck, and under
`npm run start:chaos` it is often over a second.

Vendors, items and terms change rarely. So the shell keeps **a copy of each list** in the main
process, answers searches from it at once, and keeps it fresh in the background. A **Refresh**
link under the dropdown reloads a list on demand. Clean Core is untouched: the copy is read with
the same `search_link` call, as the same user.

## Decisions (5zorro 2026-10-21, and the defaults chosen for him)

1. **Same order as today.** The list you see for a typed text must be the one ERPNext would show,
   or muscle memory breaks depending on which source answered. ERPNext's visible order, from its
   source (`frappe/desk/search.py`, v16.31.0):
   - **which 25:** rows whose name, title or search fields contain the text (case and accents
     aside), ranked by where the text first appears in the *name* (earlier first; not in the
     name last), then `idx` descending (how often the record is linked), then the list's own sort
     (`sort_field` / `sort_order`, e.g. Supplier `creation ASC`);
   - **shown as:** names that *start* with the text first, then the rest, each alphabetical
     (Python string order: capitals before small letters);
   - **vendors** are then re-ranked by Purchase Order activity, as today (`rankSupplierLinkOptions`,
     OI-131).
   The copy holds the rows exactly as `search_link` returns them (one call with an empty text and
   no page limit), plus each row's rank from one `get_list` ordered `idx desc, <sort>`. So the
   copy reproduces the order instead of approximating it. A row added by a refresh has no rank
   yet and sorts after the ranked ones until the next full load.
2. **A miss asks ERPNext.** No match in the copy → the live search, at once. A vendor added an
   hour ago in another window is one search slower, never missing.
3. **Fresh enough, never blocking:**
   - the copy is loaded in the background the first time a Doc page opens after login (and the
     first time a list is searched); until it is in, searches are live, as today;
   - **"changed since"** every time a Doc page opens, and at most once a minute while searching:
     the rows modified after the newest the copy has seen are re-read and put in (or taken out,
     if now disabled). If the count of rows then differs from ERPNext's (a delete or a rename),
     the whole list is reloaded;
   - **Refresh** under the dropdown reloads that list now;
   - a different user logging in, or logging out, drops every copy (permissions differ).
4. **Lives in the main process**, shared by every page and window. A Bill ↔ doc-form switch
   reloads the page; a page-held copy would be lost. Memory only, for now.
5. **Which lists:** Supplier, Customer, Item, Payment Terms Template, Mode of Payment, Project,
   Sales Taxes and Charges Template, Purchase Taxes and Charges Template. Not Account (its rows
   are re-labelled by company per Bill) and not Sales Order (changes all day). A list over
   **50,000** rows is not copied (live only) — the production item list is ~20k; measure the
   load time there on the first run (the trail logs it).
6. **Filters → live.** A search that carries filters (the payment pages' account and party
   pickers) is never answered from the copy.
7. **Only `frappe.xcall`.** Found while building: `frappe.db.get_list` **never settles** when the
   server raises (proven 2026-10-21: an unknown field hung 8 s+, while `frappe.xcall` rejected at
   once). A load that hung would hold an `erpEval` forever (plan 10-19 R5b-4). Every call here
   goes through `xcall`, and a failed load leaves the list live.
8. **The typing pause shrinks when the copy answers.** The picker waits 280 ms after a keystroke
   before searching; after an answer from the copy it waits 40 ms. The R5b-1 commit rule does not
   change — with the copy, its "hold" lasts one local answer.

## Breadcrumbs (for dogfood under chaos)

5zorro asked (2026-10-21) whether chaos-mode dogfood leaves enough trail. Before this change:
`nav-debug.log` had each injected delay (`chaos-lag channel=… ms=…`, not which call it slowed)
and `focus-debug.log` had `link-pick` with only the list name and the focused cell — not what was
typed, which list was on screen, or why that option was chosen. Now:

- `focus-debug.log` → `link-pick` / `link-held` / `link-held-replay` / `link-held-cancel` carry
  `typed=… list=… rule=current|exact|held picked=… src=copy|live`;
- `nav-debug.log` → `link-list` lines: load (rows, ms), changed-since (rows changed, removed),
  reload on a count mismatch, refresh, miss → live, dropped on login change, and a failed load.
  Not one line per search (that would flood it).

## Stages

| # | What | Status |
|---|------|--------|
| W1 | Pure `src/link-list-cache.js`: search the copy in ERPNext's order, merge a changed-since answer, decide when to refresh; tests | built 2026-10-21 (`tests/link-list-cache.test.js`, 12) |
| W2 | Main: load / changed-since / refresh / drop on login change; `searchLink` answers unfiltered searches from the copy; `link-list` trail | built 2026-10-21. Found in W4: opening a Bill moves the ERPNext page at the same moment, which cut every load off ("page reloaded before the step finished"); the page-open warm now starts 2 s later and a cut-off load retries once 3 s after |
| W3 | Picker: "Vendors as of 10:42 · Refresh" under the dropdown when the copy answered; 40 ms pause after a copy answer; breadcrumbs | built 2026-10-21 |
| W4 | Prove in the app (copy answers with ERPNext's order; a vendor added in Vanilla shows after a changed-since; Refresh) | done 2026-10-21 on the blank sandbox: the copy and ERPNext's live search gave the same rows in the same order for 6 lists × 9 texts (54/54; misses went live and agreed too); a vendor added through ERPNext was found live at once, was in the copy after the next page-open check, left it once disabled (then deleted); the dropdown read "Vendors as of 22:34 · Refresh" and Refresh reloaded; loads took 16–132 ms for these small lists. The R5b-1 probe passed again with the copy answering, and its trail named each rule. **Not proven:** a list of the production size (~20k items) — the trail's `loaded dt=Item rows=… ms=…` line on the first run will say |

## Dogfood round 1 — 5zorro 2026-10-21 (chaos mode), read from the trail

5zorro: "I think I saw the deleted vendor on the list after I deleted it." The trail says what
happened (`nav-debug.log` / `focus-debug.log`, 04:39–04:43 UTC):

- **Loads were clean:** the 8 lists loaded 2 s after the Bill opened, 44–515 ms each under chaos.
- **Not the copy.** He added *test add vendor* through Create Vendor… (04:40:21–32); his next
  search missed the copy and asked ERPNext (`miss dt=Supplier -> live`), as designed. That list,
  fetched live for "TES", **stayed open** while he went to Vanilla, deleted the vendor
  (`Deleted Document` 22:41:44 site time = 04:41:44 UTC) and came back to a *different* new Bill;
  13 s after the delete he clicked the vendor in it (`link-pick … list="TES" src=live`, box empty).
  → finding **D1** below.
- **The pick of a vanished vendor took ~38 s to undo itself:** the source picker opened for it at
  once, the vendor write waited (`bridge-supplier-wait meta_only_deadline`, 04:42:23), and ERPNext
  cleared the vendor box at 04:42:35. → **D2**.
- **Two gaps in W2, fixed the same day:** "changed since" ran only when the Doc *page* booted
  (`doc-get-ui`), and he opened Bills in place four times — only the first checked. It now runs on
  every Doc open, and right after returning from a peek (Create Vendor…, an edit in Vanilla), where
  what was just made is what gets typed next. Proven: add a vendor in ERPNext, open a Bill again →
  `check dt=Supplier via=doc-open changed=1`, and a search the copy could answer ("s") then lists
  it. Before the fix that search answered without it until a minute's search check.

| # | Finding | Proposed | Status |
|---|---------|----------|--------|
| D1 | A picker's dropdown stays open, list and all, when the clerk leaves the page (Vanilla, another view) or the page swaps to another document; coming back, it is still clickable. Older than warm lists — the list here was live | Close every open dropdown when the page loses focus to another view (`window` blur) or paints a different document; its next search starts fresh | **fixed 2026-10-21** (5zorro: "what I expected default behavior to be"). Main's `setSurfaceMode` tells the doc page when the Doc surface is left (`doc-surface-left`; the page's own window blur does not fire for a view switch inside an unfocused window), both pages close dropdowns when the document changes, and window blur still closes them. Proven: dropdown open → Vanilla → closed, still closed on return |
| D2 | Picking a vendor that no longer exists: the source picker opens for it, and the box clears ~38 s later under chaos (unclear what the clerk is told) | Check what the status line said; then either validate the pick first or say "*X* no longer exists in ERPNext" at once. Related to plan 10-19 R5b-4 (an unknown vendor on a new PO stalls instead) | **fixed 2026-10-21** (5zorro: a banner across the top when a missing vendor is picked, or its sources / NIC are asked for). Before a vendor pick, a typed vendor's commit, or Select PO, the Bill asks ERPNext live (`doc-link-exists`, never the warm copy) and, for a missing vendor, shows the banner (`bill-missing-vendor.js`), puts the box back and opens nothing; a missing answer also triggers a changed-since on the copy. And a vendor write that answers after the clerk has *typed in another field* no longer opens the source picker (his "pops up from timing out"). Proven: deleted vendor picked from the copy → banner, nothing written; made-up vendor typed → banner; typed real vendor + Tab → sources open as before; slowed write + typing elsewhere → `source-modal-skip blur:moved_on` |
| D3 | Found proving D2, **seven weeks old** (`d9d590b`, 2026-09-02): every Bill vendor write froze the ERPNext page until its 12 s deadline — `afterAjaxQuiet` resolved synchronously when ERPNext was quiet, so the wait loop spun without yielding (`docs/gotchas.md` G20). ERPNext's replies could not land, the wait always ran out (`meta_only_deadline` in 5zorro's trail), ~38 s under chaos; a typed vendor + Esc + Tab froze the page past 30 s in a probe, on every commit back to before warm lists | Always wait a real turn (≥ 50 ms `setTimeout`) even when quiet; cap the timing log at 100 entries | **fixed 2026-10-21**. Proven: the same probe now sets the vendor with the page answering throughout; ALPINE settled the moment its address arrived (`address_display`), not at the deadline. Likely the main cause of 5zorro's "navigation is really wonky" |

## Dogfood

| What to try | Expect |
|-------------|--------|
| Open a Bill, type a vendor, then an item, under `npm run start:chaos` | Lists appear as you type, without the "Searching…" pause; the order matches what you are used to |
| Add a vendor in Vanilla, come back, open a Bill and type it | It is there (changed-since on open); if not, *Refresh* under the dropdown finds it |
| Disable a vendor in Vanilla, open a Bill | It is gone from the list |
| A typing slip you think the picker caused | `focus-debug.log` `link-pick` line names what you typed, the list on screen and the rule |
