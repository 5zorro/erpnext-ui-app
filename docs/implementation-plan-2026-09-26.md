# Implementation plan — 2026-09-26

**Tranche:** Navigation audit, and Find pages as Doc skins (first stage: the plumbing plus a thin
static mockup per Find page).
**Runs alongside** `implementation-plan-2026-09-16.md` (still in flight, uncommitted work in
`electron/main.js`) and the parked `implementation-plan-2026-09-21.md`. This tranche adds new files
where it can; its `main.js` edits are small and listed in **What changed in main.js** so they can be
told apart from the 09-16 work sharing that file.

**Museum OIs in play:** OI-056 (Find Bills Doc skin — find vs enter are different jobs) ·
OI-062 (Find is its own Recent slot — done, relied on here) · OI-128 (peek granularity, open).

> **Status 2026-09-26:** audit written, stage F1 built (plumbing + static mockups). `npm test`
> green (2000+ units). Layer-3 smoke green, 15/15, including the new
> `e2e/scaffold-find-doc.spec.js`, which drives the Doc tab on a list, *Find Bill…* from a Doc
> Bill, the peek drawer, and *Search in Vanilla list* against the live sandbox. 5zorro has not
> clicked through it yet. Stages F2–F4 are proposals. 5zorro's three decisions are in, and HANDOFF
> is updated.

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

## Part A — How navigation works today (plain map)

The app is one window holding several stacked pages. Only one is on screen at a time; a variable
called `surfaceMode` says which:

| `surfaceMode` | What is on screen | File |
|---|---|---|
| `home` | Doc Workflow Home (the tiles) | `home.html` |
| `doc` | Bill / PO / Item Receipt Doc skin | `doc-form.html` |
| `erp` | ERPNext itself ("Vanilla") | the live ERP page |
| `pay-outstanding` | Pay Bills dashboard | `pay-outstanding.html` |
| `payment-doc` | One existing payment, as a check | `payment-doc.html` |

Behind every Doc form skin, the real ERPNext form is open in the hidden ERP page; the skin reads and
writes through it. That is why leaving and returning matters so much: the hidden page is the
document.

Three pieces of shared state carry "where am I":

- **`currentRoute`** — the ERP address the shell *believes* the clerk is on (`/app/purchase-invoice/ACC-PINV-…`).
  Recent, the toolbar lens tabs and incident reports all read it. It is a claim, not a fact (G6).
- **Lens preferences** — per document type, the lens last used (Vanilla / Simplified / Doc).
- **Park + peek** — a Doc form set aside while the clerk looks at a master record (OI-112 / OI-128).

"Which page should this open on?" is asked by at least **eight doors**: Home tiles, Recent,
Drafts, Submitted, the toolbar Doc tab, the toolbar Vanilla tab, the Find/New/Print buttons, and the
*hijack* — watching Vanilla navigate to a Bill and pulling it into the Doc skin.

## Part B — What the history shows (the fixes that felt hacky)

Read from `git log` of the nav modules and `docs/gotchas.md`. Each row is a fix that made a symptom
go away without removing what caused it. None of them is *wrong* — most were the right emergency
repair — but together they say where the structure is missing.

| # | Patch (commit) | What it papers over | Root cause |
|---|---|---|---|
| 1 | `openShellDocSurface()` bolted after the doc-form check in three doors; `isShellDocSurface()` listing surfaces by hand; a Payment Entry special case written inline in `sendUiState` (`1e4f216`, G9, G10) | Payment Entry has a Doc skin that is not a `doc-form.html` layout, so doors that asked "is there a doc-form profile?" said no | **No single "where does this route open?" function.** Each door answers for itself, from two different registries. G10 calls it "the *third* time `surfaceMode === "doc"` has been the wrong answer". A Find skin would be the fourth. |
| 2 | `lensHijackLock` released on `setImmediate`; nav-intent guard with a 15 s timer; `shouldBlockDocHijackForListIntent` written specifically so Find does not bounce back to a form (`dc1a91f`, `6d60002`, OI-054/OI-127) | The shell's *own* navigations trip the hijack, and stale browser events from the page being left trip it too | **The Doc lens is entered by reacting to Vanilla after it moves**, instead of deciding before moving. The guard (arm-or-clear, G6) is sound for events the shell cannot control; the lock only exists to stop the shell hijacking itself. |
| 3 | Find → Vanilla list: wait for the URL, wait for the filter box, dismiss the onboarding panel then sleep 400 ms, fake a mouse click, re-focus every 120 ms for 2.2 s, and the page calls a second "refocus" IPC after the first returns (`4730131`, marked `ponytail:`) | Filling the list's filter boxes by driving ERPNext's page from outside | **Frappe already takes filters in the address.** `/app/purchase-invoice?bill_no=123&supplier=X` fills the filters by itself (`router.js` `set_route_options_from_url` → `list_view.js` `parse_filters_from_route_options`, read from the local clone, tag `sandbox-v16.31.0`). |
| 4 | `bill-find` and `doc-find` — two near-copies (~80 lines each) of the same job, plus a `bill-*` / `doc-*` twin for most IPC channels | Bill was built first on its own shell and PO/IR joined later | Bill was folded into `doc-form.html` (tranche 10) but its IPC channels never were. |
| 5 | Each new shell page copies the same six setup lines (`showPayOutstanding`, `showPaymentDoc`), gets its own dirty flag and its own line in `place()` — even the log reason `collapsePeekStackHard("home")` was copied into both | — | **No table of shell pages.** Adding a Find page per document type this way means seven more copies. |
| 6 | Bill-only branches inside generic code: the "route-hold" park in `parkDocSurfaceIfNeeded` only for `purchase-invoice`; peek labels hardcoded per doctype; the `bill` view is created on every start and never shown | OI-112 strike 2 was a Bill incident | Fixed for the doctype that had the incident, not for the class. |

### Latent bugs found on the way (fixed in F1, each with a test)

1. **`/app/purchase-invoice/view/report` was read as a Bill named "view".** `routeInfo` treated the
   word `view` as a record name. ERPNext treats `/<doctype>/view/<kind>` as a *list* (Report, Kanban,
   Calendar views — `router.js` `set_doctype_route`), so on Vanilla's Report view the toolbar
   offered a Doc Bill for a document that does not exist. Now a list.
2. **Clicking Vanilla while on a list switched the *form* lens to Vanilla.** `lens-prefs.js` says a
   list must never flip the form lens; the Vanilla tab did exactly that, so a clerk who clicked
   Vanilla on Find Bills then got Vanilla on the next Enter Bills. Lists now remember their own lens.
3. **Recent said "Find Payment Entrys".** Added the label.

## Part C — Can the current structure hold a Find skin?

Not as it stood. Every layer assumed "Doc skin ⇒ a single document":

- The skin index only matched routes **with** a record (`needsRecord`).
- `lens-prefs.js` `shouldOpenDocLens` returns false with no record ("lists stay Vanilla").
- The toolbar rule in HANDOFF: "Desk, dashboards, lists, masters → Vanilla only".
- HANDOFF invariant 6: Doc skins stay on the transaction-entry forms, "not spread across list
  views". **Changed 2026-09-26 on 5zorro's direction — see Decisions taken.**

What *was* ready: Recent already keeps a separate slot for a list (OI-062, "Find Bills"); the "every
surface claims a route" rule (G9) already covers shell pages; the ERP page parses list routes.

## Part D — The architecture (proposed; F1 built)

Five rules. Each one removes a row from Part B's table rather than adding a patch.

1. **One question, one answer.** `src/nav-destination.js` `resolveOpenTarget(route)` answers
   *"this address, with this clerk's lens memory — which page opens?"* for forms **and** lists. Every
   door asks it. A new kind of Doc page (Find today, A/R skins next) is added in one place and every
   door learns it at once. *(F1: the Find doors and Recent use it. F2: the rest.)*
2. **Find pages are a table, not code.** `src/find-skin-registry.js` lists, per document type: its
   search boxes (the two human ways in — by party, or by the other side's reference number, OI-056),
   its result columns, its colour role. The skin index (`lens-context.js`) derives its Find rows from
   it, the way Simplified derives its tabs from its seed profiles. Every field name in it was checked
   against the doctype JSON on the sandbox tag.
3. **Lists remember their own lens.** Preference key `purchase-invoice:list`, separate from the
   form's `purchase-invoice`. Default Doc, like forms. Choosing Vanilla on a Find page makes the next
   Find open Vanilla; it never touches how Bills open.
4. **Lists are never hijacked.** A Vanilla list stays a Vanilla list however the clerk got there
   (Desk sidebar, a link). The Find skin opens only through explicit doors: a Find button, the Doc
   tab, a Recent row. The Vanilla list stays the escape hatch (Clean Core) — and this keeps the whole
   OI-054 class (Find bouncing back into a form) from coming back.
5. **Hand filters to ERPNext in the address, don't type them in.** The Find page's *Search in
   Vanilla list* builds `/app/<doctype>?field=value` from its own search boxes. *(F1: new path only.
   F2: move the Doc-form Find-to-Vanilla path onto it and delete the focus machinery in row 3.)*

Plus one guard: **a hidden page does not narrate.** While a shell page (Find) is on screen, an
address change reported by the hidden ERP page must not rewrite `currentRoute` or Recent — the clerk
never saw that page. *(F1: Find only. F2: the two payment pages too, after 09-16 lands.)*

### The Find page (what the mockup shows)

Modelled on the Pay Bills dashboard, with the difference 5zorro named: **the drawer is for reading,
not writing.**

- **Top:** the document's colour band and Buying/Selling stamp, title from the Recent label
  (*Find Bills*), and two real buttons — **New Bill** and **Search in Vanilla list →**.
- **Search:** the two search boxes for this type. The one that matches how you arrived has the
  cursor: *Find Bill…* from a Bill lands in **Vendor's invoice no.**; a Recent row lands in **Vendor**.
  Status chips from the doctype's real status list.
- **Results:** grouped by vendor/customer, one card each, like the payment dashboard.
- **Peek drawer:** click a row → a read-only preview of that document slides up from the bottom
  (Esc closes). The preview is a *preview*: opening the document for work is a separate button that
  lands on the real form, editable as usual (invariant 7 is untouched — nothing editable is made
  read-only).
- **Mockup honesty:** a band says *Mockup — sample rows, not your data*. Rows come from
  `src/find-skin-mock.js` (delete that file when F3 lands). The "Open" button in the peek is disabled
  in the mockup because a sample row has no real document behind it.

Seven Find pages, one per document in the sample-data flow: Estimates (Quotation), Sales Orders,
Purchase Orders, Item Receipts, Bills, Payments (one page, Pay/Receive switch — a Payment Entry is one
doctype either way), Sales Invoices.

**How each is reached in F1:**

| Find page | From | Also |
|---|---|---|
| Bills, Purchase Orders, Item Receipts | the **Find…** button on the Doc skin | Doc tab on the Vanilla list; Recent |
| Payments | Doc tab on the Vanilla Payment Entry list | Recent. The payment pages have no Find button yet — they are 09-16 files |
| Estimates, Sales Orders, Sales Invoices | Doc tab on the Vanilla list | Recent. These have no Doc form skin yet (step 1 of 5zorro's sequence) |

### Stages

| Stage | What | State |
|---|---|---|
| **F1** | Rules 1–4 for the Find doors; registry; skin-index rows; list lens memory; `find-doc.html` static mockup ×7; three latent bugs | **built 2026-09-26** |
| **F2** | Every remaining door through `resolveOpenTarget` (Home tiles, Drafts, Submitted, Doc tab fallback, hijack); merge `bill-find`/`doc-find`; replace the Vanilla-Find focus machinery with address filters; a small table of shell pages so `place()` / `isShellDocSurface()` / the dirty gate read one list; delete the unused `bill` view; extend the hidden-page guard | proposed — after 09-16 commits, since it edits the same functions |
| **F3** | Live results: an IPC that reads the list over HTTP (`/api/resource`, the G1 path — not through the busy ERP page), the peek drawer fills from the real document, Open goes through `resolveOpenTarget` | proposed — after sample data (5zorro's step 2) |
| **F4** | A Find button on the payment pages and on each A/R Doc skin as it ships | with each skin |

## Decisions taken 2026-09-26 (5zorro) — do not re-litigate

| # | Decision | Consequence |
|---|---|---|
| 1 | **Invariant 6:** Doc skins cover the transaction-entry forms *and each form's own Find page* — not reports, workspaces, masters or other lists | Written into HANDOFF invariant 6 |
| 2 | **Lists default to the Doc lens**, like forms | A first *Find Bills* opens the Find page; one click on Vanilla there switches that list back for good |
| 3 | **Doc skins say "Estimate"; Vanilla keeps "Quotation".** ERPNext's word stays in ERPNext's own screens, which are never edited; every shell page (Find, Recent, Home) says Estimate | `doc-terms.js` Quotation→Estimate pair; `doctype-labels.js` `quotation` / `quotation:list`. The A/R Estimate Doc skin (5zorro's step 1) uses the same pair |

## Registration (done 2026-09-26)

HANDOFF now carries: invariant 6 as above; the *Lens tabs are earned per page* row for lists with
a Find page; extension points for `nav-destination.js` and `find-skin-registry.js`; the Navigation
spine rules (one destination answer, list lens, no list hijack, hidden page does not narrate,
filters in the address).

## What changed in `main.js` (F1)

So these hunks can be told apart from the 09-16 work in the same file:

- New view `findDoc` + `surfaceMode: "find-doc"`, placed in `place()`, listed in
  `isShellDocSurface()`, in the E2E view map. It loads `about:blank` at startup — an empty view
  hangs Playwright's launch (e2e/GOTCHAS.md #11).
- `showFindDoc(doctypeKey, opts)` — claims `/app/<doctype>` (G9), remembers the list lens as Doc.
- `openShellDocSurface()` answers through `resolveOpenTarget`, so it now covers lists.
- `openHistoryRoute()` decides "Doc or not" through `resolveOpenTarget`.
- `openDocSkinContinue()` handles the `find-doc` target.
- `sendUiState()` decides "this page has its own Doc skin" from the skin index instead of the inline
  Payment Entry special case.
- `bill-find` / `doc-find` go to the Find page when the list lens is Doc; unchanged otherwise.
- `erp-refocus-list-filter` is a no-op on the Find page.
- `open-vanilla-skin` remembers the list lens (bug 2) and handles leaving the Find page.
- `showErp()` / `erpForceReopenRoute()` accept `search` (the `?field=value` part).
- `trackNav()` ignores the hidden ERP page while the Find page is on screen.
- New IPC: `open-preferred`, `find-doc-open-vanilla`.

## Dogfood checklist (F1)

1. Doc Bill → **Find Bill…** → the Find Bills mockup, cursor in *Vendor's invoice no.* Recent shows
   *Find Bills*. Toolbar: Document-skin lit, Default-skin available.
2. Type a vendor and a ref → **Search in Vanilla list →** → Vanilla Bill list, both filters already
   applied. Next **Find Bill…** from a Doc Bill goes straight to Vanilla (list lens now Vanilla);
   Enter Bills still opens the Doc skin (form lens untouched).
3. On the Vanilla list click **Document-skin** → back to the Find mockup.
4. Click a sample row → peek drawer rises; Esc closes it.
5. **New Bill** on the Find page → Doc Bill, blank.
6. Vanilla Payment Entry list / Sales Order list → Document-skin tab is offered → Find Payments /
   Find Sales Orders mockup. Payments: the Pay/Receive switch changes the columns' party label.
7. Vanilla Report view of Bills (`…/purchase-invoice/view/report`) → the Doc tab offers *Find Bills*,
   not a Bill named "view".

## Dogfood residuals

| Family | Residual | State |
|---|---|---|
| — | — | — |
