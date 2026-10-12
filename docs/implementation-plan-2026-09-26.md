# Implementation plan — 2026-09-26

**Tranche:** Navigation audit, and Find pages as Doc skins (first stage: the plumbing plus a thin
static mockup per Find page).
**Runs alongside** `implementation-plan-2026-09-16.md` (still in flight, uncommitted work in
`electron/main.js`) and the parked `implementation-plan-2026-09-21.md`. This tranche adds new files
where it can; its `main.js` edits are small and listed in **What changed in main.js** so they can be
told apart from the 09-16 work sharing that file.

**Museum OIs in play:** OI-056 (Find Bills Doc skin — find vs enter are different jobs) ·
OI-062 (Find is its own Recent slot — done, relied on here) · OI-128 (peek granularity, open).

> **Status 2026-09-26:** audit written; stages **F1** (plumbing + static mockups) and **F2** (every
> door on the one answer) built. `npm test` green (2050). Layer-3 smoke green, 16/16 against the
> live sandbox, including `e2e/scaffold-find-doc.spec.js`. 5zorro has not clicked through it yet.
> F1–F4 and A1 are built (see the stage table). 5zorro's three decisions are in, and HANDOFF is updated.

---

## How to handle cross-architecture dogfood (copy into every new dated plan)

> **Template for future plans:** keep this section near the top of every
> `docs/implementation-plan-YYYY-MM-DD.md`. It is process SSoT for the *working* tranche — not for
> museum `open_items.md` (that inbox stays long-lived discovery).

Cross-surface dogfood (Bill + PO + IR + chrome/nav in one message) is hard to triage when
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

## Where this sits — 5zorro's sequence (2026-09-26)

This tranche is the groundwork under a three-step goal: Doc skins on the "Find" pages. The steps
below are what "step 1 / 2 / 3" mean elsewhere in this plan.

1. **A/R Doc skins, "good enough"** — one for each A/R entry page (Estimate, Sales Order, Sales
   Invoice, Receive Payment), shaped like the existing mockups. Stage A1 below.
2. **Sample data for one full flow** — Estimate → Sales Order → Purchase Order → Item Receipt →
   Bill → vendor payment → Sales Invoice → customer payment received. 25 customers and 25 vendors,
   with activity per party on a bell curve (a few busy, most light). Not started; `ops/sample-data/`
   is the existing seed runner to extend.
3. **A Doc skin for each Find page** — like the Pay Bills dashboard, but the bottom drawer is for
   read-only peeking, if there is a drawer at all. This plan's F1 (mockups) and F2 (navigation)
   are its groundwork; F3 makes it live once step 2's data exists.

Everything depended on the navigation being able to hold a Doc skin anchored to a list — which is
why this plan starts with the audit.

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
| 1 | `openShellDocSurface()` bolted after the doc-form check in three doors; `isShellDocSurface()` listing surfaces by hand; a Payment Entry special case written inline in `sendUiState` (`7edea69`, G9, G10) | Payment Entry has a Doc skin that is not a `doc-form.html` layout, so doors that asked "is there a doc-form profile?" said no | **No single "where does this route open?" function.** Each door answers for itself, from two different registries. G10 calls it "the *third* time `surfaceMode === "doc"` has been the wrong answer". A Find skin would be the fourth. |
| 2 | `lensHijackLock` released on `setImmediate`; nav-intent guard with a 15 s timer; `shouldBlockDocHijackForListIntent` written specifically so Find does not bounce back to a form (`69fd6d7`, `10419bf`, OI-054/OI-127) | The shell's *own* navigations trip the hijack, and stale browser events from the page being left trip it too | **The Doc lens is entered by reacting to Vanilla after it moves**, instead of deciding before moving. The guard (arm-or-clear, G6) is sound for events the shell cannot control; the lock only exists to stop the shell hijacking itself. |
| 3 | Find → Vanilla list: wait for the URL, wait for the filter box, dismiss the onboarding panel then sleep 400 ms, fake a mouse click, re-focus every 120 ms for 2.2 s, and the page calls a second "refocus" IPC after the first returns (`d482461`, marked `ponytail:`) | Filling the list's filter boxes by driving ERPNext's page from outside | **Frappe already takes filters in the address.** `/app/purchase-invoice?bill_no=123&supplier=X` fills the filters by itself (`router.js` `set_route_options_from_url` → `list_view.js` `parse_filters_from_route_options`, read from the local clone, tag `sandbox-v16.31.0`). |
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

## Part D — The architecture (F1 and F2 built)

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
- **Mockup honesty (F1 only):** a band said *Mockup — sample rows, not your data*, with rows from
  `src/find-skin-mock.js`. Both went at F3 — rows are live and the peek's Open works.

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
| **F2** | Every remaining door through `resolveOpenTarget`; one Find implementation; filters in the address; a table of shell pages; the unused `bill` view deleted; the hidden-page guard on all three shell pages | **built 2026-09-26** — see *What F2 changed* |
| **F3** | Live results: an IPC that reads the list over HTTP (`/api/resource`, the G1 path — not through the busy ERP page), the peek drawer fills from the real document, Open goes through `resolveOpenTarget` | **built 2026-09-26** — see *F3: live Find pages* |
| **F4** | A Find button on the payment pages and on each A/R Doc skin as it ships | **built 2026-09-26** — A/R skins via the doc-form chrome; **Find Payments…** on Pay Bills (opens on "Paid to vendors", vendor box) and on the check page (the payment's own side, check-no. box). One door, `openFindPayments()` in main: through the general unsaved-changes gate, never touching the Doc form's flag; Vanilla list with `?payment_type=` when the list lens is Vanilla |
| **A1** | 5zorro's step 1: A/R Doc skins — Estimate, Sales Order, Invoice, Receive Payment | **built 2026-09-26** — see *Step 1* |

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

## What F2 changed (and what it deliberately did not)

**Done:**

- **One answer, every door.** `openResolvedTarget()` in `main.js` carries out whatever
  `resolveOpenTarget` decided. Every door now goes through the pair: `openRoutePreferred` (Home
  tiles via `openEntry`, Drafts, the Doc-tab fallback), `openHistoryRoute` (Recent, Submitted),
  `openShellDocSurface`, the Doc tab (with an explicit `lens: "doc"` override), `openPaymentEntryTile`
  and the hijack. `resolveEntryOpen` and the doors' own `shouldOpenDocLens` checks are gone; its
  tests moved onto the resolver unchanged in meaning. `openEntry` had its own copy of the rule that
  fell back to the *Bill* skin for any doctype without a doc-form profile (harmless while Home only
  offered Bill/PO/IR, wrong the day an A/R tile used it).
- **One Find.** `bill-find` and `doc-find` are three-line handlers over `openDocFind()`. The Vanilla
  path hands the prefill over in the address, so `setListStandardFilterValues`, the per-field waits
  for each prefilled box, and `waitForPurchaseInvoiceList` are deleted.
- **A table of shell pages** (`src/shell-surfaces.js`). `place()`, `isShellDocSurface()` and the
  route guard read it. `enterShellSurface()` replaced the copied setup lines (and the copied
  `"home"` log reason) in the three show* functions.
- **The hidden-page guard covers Pay Bills and the payment page too.** Checked first: nothing on
  those pages relies on the hidden ERP view navigating (they use in-page calls, and the amend flow
  re-opens through `showPaymentDoc`).
- **The legacy `bill` view is gone**, with `bill-preload.cjs`. ⚠ The deletion landed in the
  other session's commit `95d1a78` (staged with `git rm`, swept up by their `git commit`); the
  `main.js` side that stops referencing it is in the F2 commit. Lesson for parallel sessions:
  delete with plain `rm` and stage at commit time.

**Kept on purpose:**

- **The cursor step on the Vanilla list** (`focusListStandardFilter`, the short focus keeper, the
  renderer's follow-up refocus). The address carries filters, not keyboard focus; that fight is
  between Electron views for the OS focus, and 5zorro dogfooded it into shape. The smoke now proves
  the cursor lands in *Ref No.* headlessly; whether the belt-and-braces parts can go needs a real
  desktop, so it waits for dogfood.
- **The dirty gate is not table-driven.** Only two pages can hold unsaved input and each asks a
  different question (the check drawer vs a Draft payment); a table row for that would be an
  abstraction with two members.
- **The hijack is narrower, not gone.** It now fires only when the one answer says "Doc form", and
  never for lists or the payment pages. It is still *reactive* (Vanilla moves, then the shell pulls
  it back), because an in-page link click inside ERPNext is an event the shell does not start;
  `lensHijackLock` stays with it.

## Step 1 — A/R Doc skins (stage A1, 5zorro 2026-09-26)

*"A quick set of doc skins for the A/R process (estimate, sales order, invoice, and payment
receipt)… use a similar architecture"* to the A/P ones, linked into navigation: the Home tiles and
the toolbar's Document-skin tab.

**How:** each is one more layout of the existing Doc form page (`doc-form.html`), the page Purchase
Order and Item Receipt already share. That page drives the real ERPNext form hidden behind it, so
ERPNext's own scripts still fill prices, tax templates, addresses and outstanding invoices — the
skin only chooses what to show and in what words.

| Doc skin | ERPNext form | Header | Lines | Wash |
|---|---|---|---|---|
| **Estimate** | Quotation | Customer, Date, Valid until, Payment terms, Sales tax | Item · Description · Qty · Rate · Amount | request |
| **Sales Order** | Sales Order | Customer, Date, Ship by (stamps every line's delivery date — ERPNext's own header field does this), Customer PO No., Terms, Sales tax, Ship to | … · Ship by · Amount · Delivered · Billed, plus a progress strip (delivered % / billed % / status) | order |
| **Invoice** | Sales Invoice | Customer, Date, Due date, Customer PO No., Terms, Sales tax, Bill to | Item · Description · Qty · Rate · Amount · Sales Order | invoice |
| **Receive Payment** | Payment Entry, *Receive* | Customer, Date, Amount, Method, Check/Ref No., Ref date, Deposit to | The customer's open invoices (ERPNext's own "get outstanding" call, run when the customer is picked) · the **Payment** column is the one editable cell | payment |

- Sales tax is shown, not typed: the tax rows come from the customer's Sales Taxes template, and
  the skin lists them read-only with the subtotal / tax / total stack. Changing the template is the
  header field.
- **The Sales Order will grow.** 5zorro: it is "both a dashboard and a form entry", and will likely
  end up as involved as the Bill. A1 builds the form plus a small read-only progress strip; the
  dashboard half (linked POs, receipts, what is left to bill) is left for dogfood to shape.
- **Receive Payment** is a layout of the same Payment Entry doctype the Pay Bills dashboard uses, so
  it is picked by *layout*, not by doctype: a new payment follows the remembered direction
  (`payment-direction-prefs.js`: the Receive Payments tile says Receive), and an existing payment
  whose type turns out to be Receive is forwarded from the check page to this form. Pay is untouched.
- Deliberately out of A1: A/R Find buttons wired to live results (F3/F4), void-and-amend on A/R
  (the `doc-actions.js` registry has no A/R rows, so the Edit button simply does not appear),
  Simplified seeds for A/R, address pickers, credit notes.

Touches shared files: `main.js` (the doc-form IPC asks the profile instead of `=== "po"`),
`erp-form-bridge-page.js` (a child-table name on `setRow`, a fetch-outstanding call, and no
purchase-price fallback on sales lines), `payment-doc.src.html` (the Receive forward).

**State: built 2026-09-26.** Verified against the live sandbox, never saving (the smoke only
types into drafts and closes): `e2e/scaffold-ar-doc-skins.spec.js` opens each from its Home tile,
fills a customer and a selling-priced line on the Estimate, carries the Sales Order's Ship by onto
an existing and a new line, and lists SAMPLE Customer 01's open invoices on Receive Payment with
the amount spread oldest-first. The whole e2e suite (19) and `npm test` pass. **Not yet run:** any
Save or Submit of an A/R document. (The Receive forward from `payment-doc.html` ran once the
sample data brought Receive payments — `scaffold-pay-outstanding.spec.js` now expects it.)

What else A1 changed on the way:

- "Invoice" / "Find Invoices" on shell pages, as "Estimate" — Vanilla keeps "Sales Invoice"
  (same rule as decision 3; `doc-terms.js`, `doctype-labels.js`).
- New A/R lines run ERPNext's own `items_add` script (that is what copies Ship by); A/P lines do
  not, unchanged, since that was never dogfooded there.
- A typed Invoice date ticks `set_posting_time` first, so ERPNext keeps it instead of resetting
  it to today on save. 🔴 **The Item Receipt skin has the same trap and does not do this**: a
  backdated IR date is silently reset to today on save (`alignPostingDateLikeVanillaOk` resets it
  when the box is unticked). Left alone — A/P, not asked — and listed under residuals.
- Drafts: A/R saves shelve like PO / IR (label: number · customer · date). Receive Payment does
  not — it shares Payment Entry with the Pay Bills pages, which have no shelf.

### A/R ≠ A/P at a glance, and the Customers flow on Home (5zorro 2026-09-26, after A1)

*"The doc wash between AR and AP should have some kind of change… a global toggle to be easily
set… I currently see them as the exact same."* The difference existed but could not be seen:
the desk hatch was **white** lines over washes that are already near-white, and the Buying /
Selling stamp sits under the white sections of the card. The setting itself had no control
(OI-125: "settings UI later"), only a per-page localStorage value.

- The hatch is now drawn in the page's own role accent (`--hatch-desk` in `doc-wash.css`), on the
  Doc skins' card and toolbar, on the Find page header, and on the Home tiles.
- **One global toggle**, top right of Doc Workflow Home: *Hatch — A/R · A/P · Both · Off*, default
  A/R (so A/R is hatched and A/P plain, as OI-125 decided). `main.js` keeps it in
  `userData/doc-wash-prefs.json` and pushes it into every shell page at once
  (`washPatternSyncScript`); a page's localStorage only mirrors it.
- Home's Customers group is now a swimlane like Vendors': **Estimates above Sales Orders with a
  small down arrow** ("estimate optional") → Create Invoices → Receive Payments, then Customer
  Center after a divider (`src/customer-process-flow.js`; the renderer is shared with Vendors).
  One lane, not two, and Employees moved to the right column — otherwise Home stops fitting a
  maximized 1080p window (`tests/surface-width.test.js`; checked at 1920×1040: no scroll).

### F3: live Find pages (5zorro 2026-09-26: "wire it to pull from the same kind of data as the vanilla ERPNext find")

All seven Find pages now show real documents; `find-skin-mock.js` is deleted.

- **Same question as the Vanilla list.** Same doctype and fields, the Vanilla list's own order
  (`creation desc` — the DocType `sort_field` of all seven, read from the sandbox), cancelled and
  draft documents included, read over HTTP with the ERP session's cookies (`find-doc-list` in
  `main.js` → `frappeResourceGetList`, which gained `order_by` and `or_filters`). The query is
  pure: `src/find-skin-query.js` `findListQuery`.
- **Where it differs, on purpose:** a box matches *part* of a value, as you type (250 ms pause;
  only the newest answer paints), and the party box matches the id *or* the display name.
  Vanilla's `?field=value` filters are exact; "Search in Vanilla list →" still hands over those.
- **Newest 200**, then "type to narrow" — one more is asked for, to know whether there are more.
- Groups are ordered by their newest document (they were "busiest first" on the mockup).
- **Peek** reads the full document (`find-doc-peek`) for its lines — items, or for a payment the
  documents it was applied to. **Open this …** goes through `open-preferred`, so it lands on the
  document's Doc skin or Vanilla by the remembered lens.
- Checked live: each page's blank count equals the table's row count (Bills differed by 4 only
  because the sample-data session was seeding at that moment); Receive payments list under
  "Received from customers"; searching one customer leaves only that customer's card; Open from
  the peek lands on the Invoice Doc skin at that invoice (`e2e/scaffold-find-doc.spec.js`).
- Fixed on the way: the hatch change had marked the Find page `data-doc-desk`, which made
  `doc-wash.css` paint the desk stamp behind every result card, over its columns. The page now
  uses its own `data-find-desk`.

**Added the same day** (5zorro: "expand find pages to allow those expansions"):

- **Sort by any column** — click a heading; again to flip. Server-side (`order_by`), so the order
  covers every match, not only the rows loaded. Only the page's own column fields (plus `name`,
  `creation`) get through `findSortFor`, since the value becomes an SQL ORDER BY.
- **Show 200 more** — the next page from where the list stops (`limit_start`), appended in the
  same order. Bills passed 200 on the sandbox the same evening, so this is exercised live.
- **The last search is remembered** per page — boxes, status and sort — in
  `userData/find-doc-searches.json` via main (`find-doc-load-search` / `find-doc-save-search`).
  The page's own localStorage was tried first and lost the value across a restart. A value handed
  over by a Find button wins and starts the page from it alone; Pay / Receive stays with the
  app-wide remembered direction. **Clear search** puts the page back to every document, newest first.

### Dogfood checklist (A1)

1. Home → **Estimates** → Doc Estimate, cursor in Customer, blue "request" wash with the Selling
   stripes. Pick a customer, then an item: rate is the *selling* price. Save draft, then Submit.
2. Home → **Sales Orders** → type a Ship by in the header; every line takes it, and Add line
   starts with it too. Save needs every line to have one. The Delivered / Billed / Status strip
   shows under the addresses.
3. Home → **Create Invoices** → type a Date other than today, Save: the date stays.
4. Home → **Receive Payments** → pick a customer: their open invoices list. Type Amount received:
   ERPNext spreads it oldest-first; type in Payment to change one. Method fills Deposit to; a bank
   needs Check / Ref No. and Ref date. Save, Submit.
5. Open that submitted payment from Recent → it opens in the Receive Payment form (via the check
   page's forward), not the AP check.
6. On any of the four, the toolbar shows **Document-skin** lit and **Default-skin** available;
   Default-skin opens the same document in ERPNext.
7. Home → Pay Bills still opens the Pay Bills dashboard.
8. Home, top right: click **A/P** — the Vendors tiles take the hatch and the Customers tiles lose
   it; an open Doc Purchase Order (or Bill) is hatched when you return to it. **Off** clears both.
   The choice survives a restart.

**The paper for all of this is in the dogfood pack** (5zorro 2026-09-26: "add them as paper… so
that i hit them when i go through the source"). He dogfoods by typing real-looking paper under
`npm run start:chaos` — that is the one test that finds shell↔Electron↔ERPNext gotchas, so it is
never replaced by automation. Catalogue `src/sample-data/dogfood-ap-sources.js` (tracked);
`npm run dogfood:ap-sources -- --pdf` writes `ops/sample-data/dogfood-sources/generated/`
(gitignored, 27 papers + README index). Each paper can carry `checks` (tick boxes printed at the
foot — the click-through checks above ride on the paper where that screen is already open) and
`knownGaps` (red on the banner: do that part in Vanilla).

| Paper | Covers |
|---|---|
| DF-01 | hatch toggle; Find Bill… → Find Bills; the peek; Open this Bill |
| DF-06 | Find Payments… from Pay Bills and from the check page (F4) |
| DF-16 | Find page sort, Show 200 more, remembered search across a restart, Clear search |
| DF-18 → DF-21 | the A/R flow end to end on one customer (Northwind): Estimate → Sales Order (CPO-88120) → partial Invoice ($885, tax cleared) → a check that short-pays it by $25 and names only their PO number |
| DF-22 / DF-23 | a Bill and a packing list typed weeks after their date — the posting date follows the typed date |

### A/R skin gaps (known, marked on the paper, not built)

Found while writing DF-18…21 — each is a candidate for the next A/R stage, and each paper says to
do that part in Vanilla until it exists:

- **Customer ▾ cannot create a customer** (Vendor's picker can) — new customers go through Customer Center.
- **No customer part number column** on Estimate lines (ERPNext has `customer_item_code`).
- **No box for the customer's RFQ number** on the Estimate.
- **Bill to / Ship to are read-only** on the A/R skins — no address picker (the A/P skins have one).
- **The Invoice cannot pull lines from a Sales Order** — no source picker like the Bill's Select PO; today it is Vanilla's Create › Sales Invoice, then the Document-skin tab.
- (By design, not a gap: no void-and-amend and no Simplified seed on A/R yet.)

## Dogfood checklist (F1 + F2)

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
8. (F2) Home → Enter Bills / Purchase Orders / Receive Inventory → each opens its Doc skin as before.
   Pay Bills → Pay Bills dashboard. Recent, Drafts and Submitted rows reopen in the lens you last used.
9. (F2) With Find Bills set to Vanilla (step 2), a dupe-Ref warning's Find link on a Doc Bill →
   Vanilla list with Ref No. and vendor already filtered, cursor in Ref No.
10. (F2) While on Pay Bills or a payment, nothing you do there adds stray rows to Recent.

## Dogfood round 2026-09-30 — four nav/focus bugs that chained together

Found from the nav incidents and focus incidents filed while starting DF-01 on the blank sandbox
(chaos mode on, but none of these need chaos). One sequence: Vanilla Bill → make a vendor, its
address and a payment terms template from it → Esc → New Bill → Item Receipt Doc → Doc tab back
to the Bill.

| # | Family | What broke | Cause |
|---|---|---|---|
| N1 | Peek stack | Esc bounced between Supplier and Address forever | Returning to the parent is read as a *new* hop from the child, and the hop rule for payment pages re-parents the stack, so parent and child swap on every Esc (`applyErpHopToPeekStack`). Also: an unsaved new Vanilla Bill never became the parent, so the tree started at the vendor |
| N2 | Blocked unload | New Bill stayed on the Supplier page for 15 s, then the shell recorded a fake "Bill → Supplier" peek | A Frappe form with unsaved changes adds a `beforeunload` listener (`form.js` `dirty()`); Electron then **silently cancels** any page load unless `will-prevent-unload` is handled, and nothing handled it. When the shell's wait timed out it accepted the old page as a new arrival |
| N3 | Wrong page code | After Item Receipt → Doc tab, the Bill ran on the PO/IR page code: single-pick source window, focus fell to the toolbar after it, no vendor address refresh | `doc-form.html` picks Bill vs PO/IR code once per load; `showDocForm` reloads it when the kind changes, `resumeParkedDoc` did not |
| N4 | Stale resume | The Bill showed a vendor that wasn't on the real draft; the first edit wiped it | The park held the generic `/app/purchase-invoice/new`, so resuming it made a **fresh** draft while the skin painted the old saved copy. The "route-hold" fallback also parked a stale copy while the clerk was on Vanilla |

Not a code bug: the blank site's company address is not linked to the company, so ERPNext has no
Billing address to fill. Not proven yet: payment terms clearing the Invoice date (re-run after
N3/N4; the skipped-write path left no breadcrumb).

**Fixes (built 2026-09-30):**

- **N2.** The ERP view handles `will-prevent-unload`. A pure rule (`src/erp-unload-guard.js`)
  decides: when the shell's own unsaved-changes check passed in the last few seconds (Doc skin
  clean, or the clerk answered the shell's prompt), the load goes through; otherwise the clerk is
  asked, like a browser would ask — *Stay* or *Leave and discard*. Staying puts the shell back on
  the Vanilla page it never left, cancels the pending load, and the open that asked for it stops.
  When a navigation wait times out, the shell re-reads where the ERP view really is instead of
  treating it as a hop.
- **N3.** Resume reloads the doc-form page when the page code changes (same rule as
  `showDocForm`, now one pure function in `src/doc-shell-kind.js`).
- **N4.** A park on a generic `/new` address is resumed by the draft's own name
  (`new-purchase-invoice-…`), which Frappe still holds in memory; resume then re-reads the live
  form instead of painting the saved copy, and logs `doc-rebind-mismatch` if the draft is gone.
  The "route-hold" fallback no longer parks while the clerk is on Vanilla.
- **N4, second half (found while proving N2):** Vanilla → Doc on the draft Vanilla is showing used to
  reload it — which, once N2 asks before a reload, would have asked the clerk to discard their own
  typing. Now the Doc skin reads that form in place (`opensInPlace`), and typing that came along
  counts as the clerk's for the Doc gate (`carriesClerkEdits`: a saved document that is dirty, or a
  new draft holding a party or an item line — Frappe calls every new draft unsaved from birth).
  First slice of museum OI-180; Doc → Vanilla does not carry yet.

**Layer-3:** `e2e/scaffold-unload-resume.spec.js` — Stay, Leave, Esc-resume, Vanilla → Doc carry
(4/4 against the blank sandbox). The full suite's 7 other failures fail the same way on the code
before this change: they assert sample data the reinstalled sandbox does not have.

**N1 — 5zorro 2026-09-30, decided and built same day.** Who is a parent, and what Recent shows.

- **The page reports its own hops.** A listener on Frappe's router `change` event (it fires after
  Frappe records the route, `router.js` `route()`) sends the shell, for each hop: where it landed, the
  form it came from (`frappe.route_history`), whether that form had unsaved changes (`__unsaved` in
  `locals`), and `frappe._from_link`. Peek bookkeeping is driven by that, no longer by the shell's own
  `currentRoute` — the guess that invented the "Bill → Supplier" peek of nav incident 03:52.
  Pure part: `src/erp-route-hop.js` (`describeRouteHop`, serialized into the page like
  `shouldEscDismissSoftPeek`); preload `erpUiShell.noteRouteHop` → IPC `erp-route-hop`.
- **Parent rule (5zorro: "sounds good"):** the form Frappe itself names as the caller — a Link
  field's *Create a new …* sets `_from_link.set_route_args` — when the hop really is that (the
  previous form is the caller and the landing is a new record of the link's doctype; `_from_link` is
  only cleared on save, so a leftover one must not count). Otherwise the form left **with unsaved
  changes** (Frappe's own `__unsaved`, which a new draft has from birth — the unsaved Vanilla Bill of
  the incident is a parent). Any doctype; no Bill/PO/IR list. A child is a setup/master *record*
  (`isSoftPeekRoute` + a record), as before. Depth stays one: a hop from a child to another record
  is a sibling, except that a child left with unsaved changes (or named by `_from_link`) becomes the
  new parent — unless a Doc skin is parked under the session, which stays the anchor so Esc can
  always get back to it. The Doc skin's own peek buttons keep the Doc document as parent.
- **A return is a return:** a hop onto the current parent, or onto one of its children, leaves the
  stack alone (the Esc ping-pong).
- **Recent:** children fold under their parent's row as a dropdown (open while that session is live,
  closed after). A child row opens the child as a peek of that parent; Esc returns to the parent —
  in place when the parent is still loaded, otherwise by reopening it in the clerk's preferred lens
  (`reopen` on the parent ref; Esc action `reopen-parent`). A child later opened on its own (not
  under that parent) goes back to being a plain row. Children no longer take Recent slots.
## DF-01 follow-ups (5zorro 2026-09-30 notes → 2026-10-01)

Found on the first blank-bench dogfood (paper DF-01, entered three ways: Doc, Simplified, Vanilla).
The small fixes are in `f1a6784` and the commit after it: toolbar in the card's column, no doubled
text while editing a grid cell, Vendor Credit switch out of the tab order, *create Item…* from an
empty Item search (soft peek of `/app/item/new` carrying what was typed), a peek button on the
Bill's Applied payments rows, and in the Ship To picker a link to the company's addresses plus a
drop-ship note.

**Verified ERP behaviour behind them** (read from the sandbox tags, not guessed):
- A new Bill / PO fills Ship To from an Address **linked to the Company** with *Preferred Shipping
  Address* ticked (`company.py get_billing_shipping_address`). A Warehouse-linked address never
  counts, and Manufacturing Settings' warehouses feed Work Orders only. Saving an Address with a
  Company link ticks *Is Your Company Address* by itself (`accounts/custom/address.py`).
- **Drop ship belongs to the Purchase Order.** The PO has `customer`; its Ship To query switches to
  that customer's addresses (`buying.js` set_query). A Purchase Invoice has no `customer`, so Vanilla
  offers it company addresses only. A Bill made from a drop-ship PO carries the address over; a NIC
  Bill cannot have one. No generated dogfood paper covers drop ship yet.
- *Expense Head Changed* on submit is ERPNext moving a stock line with no receipt to *Stock Received
  But Not Billed* (perpetual inventory on). Expected.
- **ERPNext's own "receive with the bill" is the Purchase Invoice's `update_stock`.** Nothing here
  forces a separate receipt (`Buying Settings.pr_required` = No). `update_stock` is not
  `allow_on_submit`, is hidden once any line came from a receipt (`depends_on: !item.pr_detail`), and
  needs a warehouse per line (`set_warehouse` shows when it is on).

### D — Draft payments on the Pay Outstanding board (built 2026-10-01)
**Why it matters:** a draft Payment Entry writes no ledger, so the Accounts Payable report — the
board's only source — shows its bills as fully unpaid. Nothing stops the clerk paying them again.
- Load draft *Pay / Supplier* Payment Entries with each load of the board, beside the relink reviews.
- A **Draft payments** panel above the board: one group per draft — payment, vendor, amount, method,
  date, and the bills it covers — with **Open**, **Submit** and **Delete** (each confirmed; both log
  before and after to `nav-debug.log`).
- Each bill a draft covers gets an advisory on its row (*a draft payment covers this bill*).
  Advisory, not a gate (invariant 7).
- Pure part: `src/payment-drafts.js`.

### E — Supplier No / Our No toggle (OI-170, the plan-09-16 P1e — built 2026-10-01)
5zorro: the number to track by is the vendor's ref (Bill) or the logbook PO# (PO), not the ERPNext
ID, which changes on every amend. Wanted: a toggle in the **File** group of every Doc skin, and on
the payment board.
- One global setting, kept in main like `payment-direction-prefs.json`, so every page agrees.
- Doc skins: a fixed identity line in the banner (the status line is overwritten by every message,
  so it cannot carry it) — the chosen number large, the other beside it, muted.
- Payment board: each invoice node shows the chosen number; the filter matches both. The AP report
  already returns `bill_no`, so there is no extra read.
- "Their number" per doctype (`src/doc-number-pref.js` `THEIR_NUMBER`, now also what the void-and-amend
  confirm quotes): Bill `bill_no`, PO `title` (logbook), Item Receipt `lr_no` (packing list / BOL —
  what that skin already tracked by), Payment `reference_no`.
- **A/R (5zorro 2026-10-01):** the salesman makes a Sales Order once the customer's PO arrives.
  Asking the customer about an order you quote *their* PO; the customer asking about delivery quotes
  *our* Sales Order. So a **Sales Order** toggles Customer PO (`po_no`) ↔ its own number, and a
  **Sales Invoice** leads with the Sales Order(s) it bills (the approval, as the PO is when buying;
  it survives an invoice amend), its own number beside it. An Estimate shows its own number only.
  DF-21's remittance naming only the customer's PO is expected, not a gap: it is found by `po_no`.
- Not yet: the Payment document page (`payment-doc.html`, its own chrome) and the Find pages.

### Waiting on 5zorro
### J — just-in-time Item Receipt from Bill lines (parked 2026-10-01)
Wanted: "received on / received by" per bill line, a receipt made only when filled. It needs custom
fields (nowhere on a Purchase Invoice line to keep them, no "received by" on a receipt), which the
core app does not impose. **Parked as an opt-in module**; 5zorro files the GitHub issue (drafted).
Decided for when it is built: the receipt is made **on bill Submit** with ERPNext's own
`make_purchase_receipt` (`args.filtered_children`, one receipt per received-on + received-by group,
dated the day received), and **Received by is a link to a system User**. A second issue covers the
PO skin's use of `terms` as its remarks field (prints, copies onto the bill) until frappe/erpnext#59413.

### T — line tables take room only when they need it (built 2026-10-01; replaces `7d389e6`'s full bleed)
Agreed definition (5zorro 2026-10-01): the table sits on the card. Each column's width is its widest
value (or header), capped; Description is the one column that wraps and takes what is left, so it
never *asks* for room (counted at most 320px). When those widths plus any dragged ones exceed the
card, the section grows **to the right only**, as far as needed and no further than the window
(16px gutter); past that the table scrolls inside itself, never the page. Blank → never grows.
Cross-reference columns (Source line, Customer, Sales Order, Project) spill only when there is no
room — revisit if dogfood says otherwise. Wrapping columns get taller rows automatically; their
floors (Description 180px, Item 90px, text columns 70px) stop a sentence becoming one word per line.
Pure part: `naturalTableWidthPx` / `lineTableWidthPx` (`item-table-layout.js`); DOM:
`growSectionToNeed` (`item-col-resize.js`), re-run on window resize. Verified live at 1700 and 1250.
- **Invoice series from the Sales Order** (5zorro 2026-10-01: an invoice named `<SO>-01`, `-02`).
  Frappe's naming series can include a document field (`naming.py parse_naming_series`, a
  `{fieldname}` part) and counts per prefix, so `.{field}.-.##` gives `<value>-01`, `-02`. A Sales
  Invoice has no header Sales Order field (it is per line), so it needs a Custom Field the shell fills —
  site customization, no code. Not started; worth it once A/R is dogfooded.

### R — receive with the bill (built 2026-10-01)
- Vanilla offers **default on** only: Customize Form › Purchase Invoice › Update Stock › Default = 1
  (a Property Setter). There is no "ask at save" in Vanilla.
- **Doc Bill:** at Save / Submit, when a draft has stock lines with no receipt (not drop ship, not a
  credit memo or opening entry) and Update Stock is off, a dialog: *Receive with this bill* (sets
  `update_stock`, and `set_warehouse` from Stock Settings' default through the form so ERPNext fills
  the lines), *Bill only*, *Cancel*, a *Don't ask at save* box, and a link to the Customize Form
  default. Switched off, a save that leaves stock un-received says so in a toast that turns the
  question back on. Pure part: `src/bill-receive-ask.js`; setting in `bill-receive-prefs.json`.
- **Simplified:** ERPNext's own *Expense Head Changed* dialog gets a note — tick Update Stock before
  submitting, or default it in Customize Form (`assume-applier-payload.js`, version 12).

## Doors: peek or navigate — one convention (agreed 5zorro 2026-10-02)

**Why.** Nav incident 2026-10-03 (DF-02): "Go to Vendor add…" on the Doc Bill was a hard navigation
written in July, before peeks existed, while Payment Terms add next to it was a peek. The hard one
dropped the Bill. How a door moves the clerk was decided door by door, which is where the
workarounds come from. Fixed in `606fc73` for the create doors; this section makes it a rule.

**What a peek is.** An errand you come back from. **Not read-only**: you can edit and save on a peek
(creating the Vendor is one). What makes it a peek is that the page you left is kept as the return
point and Esc (or a visible back control) takes you there, with nothing discarded.

**The rule — one question per door: will the clerk come back to this page when done?**

| Kind | When | What happens |
|---|---|---|
| **Peek** | Yes — an errand for this document: create a missing master (Vendor, Item, Terms, Project, Address), look at or fix a linked document (source PO, a payment, the bill a check pays), a setting this document needs | The page is parked as the parent; Esc returns; a draft saved on the errand is followed under its new name (`renameInPeekStack`) |
| **Navigate** | No — other work: Find, New, a different document as the job | The page is left; the unsaved-changes gate asks first |
| **Lens** | Same document, other view: Open in Default-skin / Simplified | Only an explicit lens click changes the remembered lens — no door changes it as a side effect |

**Doors today, against the rule** (Bill / PO / IR / A/R Doc skins and the payment pages):

| Door | Today | Rule says |
|---|---|---|
| Create Vendor / Item / Payment Terms / Project | peek (Vendor + Project fixed `606fc73`) | ✅ peek |
| Linked source ↗ (PO / receipt / bill / Sales Order), Applied payment 👁, Add payment | peek | ✅ peek |
| Ship To → company addresses; receive dialog → Customize Form | peek | ✅ peek |
| Find…, New, Select PO / source | navigate / in place | ✅ navigate |
| Open in Default-skin / Simplified | lens | ✅ lens |
| **1. Landed Cost Voucher** (Bill) | hard navigate **and sets the Bill lens to Vanilla** | peek; lens untouched |
| **2. Attach file** | hard navigate to the same bill in Vanilla **and sets the lens to Vanilla** | peek to Vanilla's uploader on this bill; lens untouched |
| **3. "Discard draft and edit available addresses for this vendor"** | discards the draft, then navigates | peek to the Supplier; nothing discarded; reopen the picker on return |
| **4. Payment board eye "Peek at …" (and the payment document page's bill links)** | navigates (opens the bill via Recent's door); no way back to the board | peek with the board as the return point — below |

1–3 agreed. **4, clarified by 5zorro 2026-10-02:** writing a check, the clerk opens the bill it
pays to correct it — including a void and amend — and must land back on the payment work. So:

- The return point may be a **shell page** (Pay Outstanding, the payment document page), not only a
  Doc skin. Today only a Doc skin can be parked (`parkDocSurfaceIfNeeded`) and the errand always
  opens in Vanilla; both are new.
- The bill opens **in the clerk's usual lens** (currently the Doc skin), not forced into any skin.
- **The way back is visible**: a "← Back to Pay Outstanding" control in the Doc chrome while on the
  errand. Esc also returns when the page is not using Esc itself — a Doc skin also uses Esc to close
  its own dialogs and cancel an edit, so Esc alone is not enough.
- **Void and amend keeps the way back**: the amended bill's new name (`…-1`) is followed, like any
  draft renamed on save.
- **On return the board re-reads its bills** (the amend changed them; the re-link pass runs) and an
  unsaved check in the drawer keeps what was typed.

**Enforcement.** Every Doc-skin and payment-page door goes in one table, `src/doc-doors.js`
(door → peek / navigate / lens, with its reason), the way `src/shell-surfaces.js` lists the shell
pages. `tests/peek-doors.test.js` grows from "create doors peek" to "every navigating door is in
the table and uses the call its kind says". The rule moves into `HANDOFF.md` § Invariants when the
table lands.

**Order:** the table + 1–3 (small, existing machinery), then 4 (the two new abilities).

**Built 2026-10-03.** `src/doc-doors.js` lists every door; HANDOFF invariant 8 states the rule.
1–3 are peeks and no longer touch the lens (nor does Print, which had the same side effect).
"Discard draft and edit available addresses" is now "Edit this vendor's addresses… (Esc returns
here)" — no gate, nothing discarded; click the address box again on return (the picker re-reads).
Door 4: the board's two bill eyes, and an eye on each bill of a check stub (board drawer and the
payment page), call `shell-detour-open`; `openRoutePreferred(…, { skipDirtyGate: true })` leaves the
board loaded. The way back is a "← Back to …" button in the top bar (every lens), Esc on a Doc page
when no dialog is open and no field is being typed in (`doc-form-boot.js`), and the soft-peek Esc in
Vanilla once the peek stack has nothing to say. Return shows the page without reloading and fires
`shell-detour-return`: the board re-reads bills and runs the re-link pass; the payment page re-reads
unless it has unsaved edits. Home, Find or any other shell page ends a detour.
**Print stays pending:** a full load into Vanilla for the print preview; making it a peek is next.

## Printing — how Frappe does it, and one convention for the shell (research 2026-10-03, not built)

5zorro 2026-10-03: *"I have no idea how the underlying printing engine works or why it works on
vanilla but not on the doc skins … hitting print would have opened a popup."* Checks are printed in
batches (a check run); invoices are generated and then printed or saved in batches; POs, Item
Receipts and Bills are one-offs.

### How Frappe prints (read from the v16 source on this instance)

| What | Where | What it does |
|---|---|---|
| **Print** button | `printing/page/print/print.js` `printit()` → `render_page("/printview?", true)` | **`window.open`** of `/printview?doctype&name&format&no_letterhead&letterhead&settings&trigger_print=1`. That page renders the document as HTML and, because of `trigger_print`, calls the browser's own print. In a browser that is a new tab; **in Electron it is a new window — the popup** |
| **PDF** button | same file, `render_pdf()` | `window.open` of `/api/method/frappe.utils.print_format.download_pdf?doctype&name&format&…` — the server makes the PDF (`Print Settings.pdf_generator`: `wkhtmltopdf` here; `chrome` exists) |
| **Bulk print** (list view → Print) | `list/bulk_operations.js` `print()` | Up to **500** docs → `download_multi_pdf` (one merged PDF; `doctype` may be a `{doctype: [names]}` map, so several doctypes go in one file), or `download_multi_pdf_async` (a background job that saves a private File and announces it over realtime) |
| HTML only | `www/printview.py` `get_html_and_style` (whitelisted) | The rendered body + print-style CSS, no page around it |
| Server-side printer | `print_format.py` `print_by_server` | Prints on a **CUPS printer the server can reach** (`Network Printer Settings`, needs `pycups`); `enable_print_server` = 0 here |
| Raw printing | `print.js` via QZ Tray | Label/receipt printers, raw commands; `enable_raw_printing` = 0 here |

Rules ERPNext applies whatever the client (`printview.py`):
- **Drafts** print only with `Print Settings.allow_print_for_draft` (**1** here) and then carry a
  **"Draft" heading** (`add_draft_heading` = 1). **Cancelled** documents are refused
  (`allow_print_for_cancelled` = 0). The shell reflects these; it never works around them.
- **Every render is logged**: `make_access_log(method="Print", file_type="PDF", page="Print Format: …")`.
  That is a record that a print was *rendered* — a preview counts — not proof that paper came out.
- The layout is a **Print Format** (Jinja; this site has the standard ones, e.g. *Purchase Invoice
  Standard*, *Drop Shipping Format* for PO, *Bank and Cash Payment Voucher* for Payment Entry), plus
  a **Letter Head** and the site's **print style** (`Redesign`).
- **Checks**: ERPNext's **Cheque Print Template** (per bank) generates a Payment Entry Print Format
  with fields placed over pre-printed check stock (`create_or_update_cheque_print_format`). None
  exists on this sandbox yet.

### Why the Doc skin's Print breaks today
`bill-print` / `doc-print` hard-load the document in Vanilla, call Frappe's `print_doc()` (its print
*page*), switch the clerk to the ERP view, and set the lens to Vanilla (that last part removed
2026-10-03). The clerk then presses Frappe's Print, which `window.open`s the print view — and the
ERP view's `setWindowOpenHandler` **allows** any ERPNext-origin URL, so Electron opens a separate
window. That breaks invariant 6 (one window) and is the popup 5zorro remembers. Vanilla's own
Print / PDF buttons inside the shell do the same thing.

### The convention

1. **ERPNext renders; the shell only delivers.** Every printed page and PDF comes from ERPNext's
   own endpoints (`/printview`, `download_pdf`, `download_multi_pdf`) with ERPNext's Print Format,
   Letter Head and print style. Same output as Vanilla, and no second layout to drift. Clean Core.
2. **Print is an in-place action, not a door.** It never leaves the page and never opens a window.
   (`src/doc-doors.js` lists `bill-print` / `doc-print` as *pending peeks* today; they become
   in-place actions, which the doors test will check.)
3. **No popups, ever.** The ERP view's window-open handler sends `/printview` and
   `/api/method/frappe.utils.print_format.download_*` URLs to the shell's print service instead of
   allowing a window. That also fixes Vanilla's own Print / PDF buttons inside the shell.
4. **Two destinations, one engine each.**
   - **Printer**: load `/printview?…` (without `trigger_print`) in a hidden, never-shown view and
     call Electron's `webContents.print()` — the same HTML-to-printer path a browser takes on
     Vanilla's Print. The printer is chosen in the shell (Electron `getPrintersAsync`) and
     remembered per purpose (checks / invoices / everything else); with one chosen, a batch prints
     **silently** (`print({ silent: true, deviceName })`), with no dialog per document.
   - **File**: ERPNext's PDF (`download_pdf`, or `download_multi_pdf` for one merged file; the async
     variant above ~20 documents), saved where the clerk says.
5. **Print what ERPNext has saved.** Printing an unsaved page asks first (*Save draft, then print*);
   the commit gate already has a `print` action. Drafts and cancelled documents follow the site's
   own settings above.
6. **Choose the format, then remember it.** ERPNext's default Print Format for the doctype unless
   the clerk picks another; letter head on/off from Print Settings. The pick is remembered per
   doctype (like the lens), never written to the site.
7. **One print queue, app-wide.** "Add to print queue" from any Doc skin or Find page (multi-select),
   and automatically from a check run. The queue groups by doctype + format and offers *Print all*
   and *Save as one PDF / one PDF each*, reporting per document — a batch that prints 9 of 10 says
   which one did not.

### Per document
- **Checks (batch).** A check run already groups payments (Pay Outstanding). Its Payment Entries go
  to the queue in check-number order with the bank's Cheque Print Template format, to the printer
  remembered for checks. Needs: an **alignment test page** before a run; a **spoiled check** path
  (the number is used — void-and-amend or edit the draft's number, never reprint the same number);
  and a decision on **print before or after submit** — a draft check would carry the "Draft"
  heading if its format renders it (to verify against a Cheque Print Template format).
- **Invoices (batch).** Generated Sales Invoices go to the queue: print, one PDF each (named by
  invoice number, for emailing), or one merged PDF. Emailing is ERPNext's own *Email* with the print
  attached — a later step.
- **PO, Item Receipt, Bill (one-off).** Print in place: format and letter head as remembered,
  printer or PDF, back on the same page.

### What a Bill print has to handle (the one 5zorro tried)
1. Stay on the Bill — no Vanilla hop, no popup, no lens change.
2. Saved state only: unsaved edits → *Save draft, then print*.
3. Draft → prints with ERPNext's "Draft" heading (site setting); cancelled → ERPNext refuses, so the
   button says why instead.
4. Which Print Format (*Purchase Invoice Standard* by default) and letter head.
5. Destination: printer or PDF file; optionally the PDF **attached to the Bill** for the record.
6. The Access Log entry is ERPNext's; nothing extra to record.

### Environment note
This WSL setup has **no CUPS client**, so Electron here sees no printers — only *Save as PDF*.
`ops/wsl-printing/README.md` is the minimal setup (`cups` + `printer-driver-cups-pdf`, a virtual
"PDF" printer). Real printers need the Windows build of the shell or CUPS in WSL.

🔴 **ERPNext's PDFs were broken on this sandbox, in Vanilla too** (found 2026-10-03): wkhtmltopdf
fetches the page's CSS from `get_url()`, which without `host_name` is the address the request came
in on (`localhost:8080`) — unreachable from inside the backend container ("network error:
ConnectionRefusedError", surfacing as `OSError`). Fixed by
`bench --site frontend set-config host_name 'http://frontend:8080'` (the compose network's
frontend). Side effect: ERPNext-made absolute links (emails) name `frontend:8080`. Any
frappe_docker deployment needs the same.

### Built 2026-10-03
- `src/print-service.js` (pure) + main's print service; `src/print-dialog-ui.js` (the dialog, shared).
- **No popups**: the ERP view's window-open handler hands `/printview` and `download_*pdf` to the
  print service — Vanilla's own Print / PDF / bulk print included. Verified live: no new window.
- **Doc skins**: Print opens the dialog in place (format, letter head, printer, Print / Save PDF /
  Add to print queue); the old Vanilla-hop `bill-print` / `doc-print` are deleted. `print-run` and
  `print-queue-run` are in-place actions the doors test holds to "never navigates".
- **Queue**: app-wide in main (in memory, this session); Print all / one merged PDF / one PDF each;
  what printed leaves the queue, what failed stays and is named. Pay Outstanding has a
  "Print queue (n)" button, and a payment made **by check** joins the queue on submit.
- **Printers**: the 3 most recently used sort to the top (5zorro 2026-10-03); each shows its full
  name and, when the system reports it, its address; the chosen one is spelled out under the menu.
- Remembered per doctype / purpose in `print-prefs.json`, never on the site.
- Verified live (`e2e/scaffold-print.spec.js`): ERPNext's PDF over the app's session, the dialog in
  place with the doctype's formats, queue add, a Vanilla PDF popup caught.
- **Self-healing** (5zorro 2026-10-03: *"ideally this app will self heal from stuff like that"*).
  `diagnosePrintFailure` sorts every failure by who can fix it: **rule** (ERPNext said no — passed
  through, never worked around), **session** (log in), **engine** (ERPNext's PDF engine broke —
  the shell makes the PDF itself from ERPNext's own `/printview` with Electron's `printToPDF`, says
  so, and the dialog shows IT's fix), **printer** (gone / refused — said up front, jobs stay
  queued). The shell never changes the server (HTTP only, Clean Core). A merged PDF cannot be
  healed without a PDF merger this app does not carry, so it falls back to one file per document
  beside the chosen file. **Proven live 2026-10-03**: with `host_name` blanked (the Docker fault
  back) the app still produced a PDF, marked healed, and a cancelled bill was still refused; with
  `host_name` restored ERPNext's own PDF came back and the notice cleared. A site-config change
  takes about a minute to reach ERPNext's workers.
- **Windows option (5zorro)**: SumatraPDF prints a PDF silently to a named printer — a candidate
  third path (ERPNext's server PDF straight to paper) for the Windows build; noted in
  `ops/wsl-printing/README.md`, not wired.
- **Printer path, proven live 2026-10-03 with CUPS + cups-pdf.** Chromium's silent print on Linux
  refused the working CUPS printer ("Invalid printer settings") for every option set tried, while
  `lp` printed. Self-healing: on that refusal the document's PDF (ERPNext's, or the app's own) goes
  to the OS print command — `lp -d <printer> -t <doc>` on Linux / macOS, SumatraPDF `-print-to
  -silent` on Windows when installed — and the rest of the session goes straight there. One bill and
  a two-bill batch printed silently to the "PDF" printer, each job titled with its document.
- **Not yet**: a Cheque Print Template, the alignment page,
  the spoiled-check path, and draft-vs-submit for checks; Find pages' multi-select "Add to print
  queue"; the queue does not survive a restart.

## Printer hardening (5zorro 2026-10-03; built 2026-10-03)

*"I don't want intermittent printer driver problems to be an issue for a user in this app."*

| Risk | Decision (5zorro) |
|---|---|
| **Paper size mismatch** — ERPNext prints A4 (Print Settings › PDF Page Size) while US printers load Letter: the job stalls ("load A4"), clips, or shrinks | Printers report their sizes (CUPS `lpoptions` *PageSize*, default starred; Windows `Get-PrintConfiguration`). A ⚠ beside each mismatched printer in the menu and the chosen one; clicking it explains document size vs the printer's paper, that the app **shrinks to fit**, and links to Print Settings so the override is not needed |
| **Driver crashes** — transparency (letter-head logos are transparent PNGs), complex pages | **Print as image on by default**: every page flattened onto white at printer resolution, so the driver gets plain pictures. The clerk may turn it off (remembered); then an ℹ says *"print jobs will be faster but there is a slightly increased risk that the printer driver won't be able to handle the job"* |
| **Jobs that queue but never print** | After sending, watch the job: printed, or *the printer stopped* with its reason (out of paper, paused) and two ways on — **Check again** (after fixing it) or **Stop watching** (Esc) |
| **Checks** | The exception: exact size, no shrink, no image conversion, never scaled — alignment depends on it |
| **Huge photos / long attachments in "Save as one PDF"** | Each picture fits **one page**; photos flattened onto white and capped at print resolution. **Word keeps all its pages** (5zorro: "microsoft word is okay"). **Spreadsheets** (Excel, CSV — "a csv that accidentally takes up 20 pages and no headers") are left out with "open it in its own program", unless they fit one page |

**Built and proven live 2026-10-03** (`src/print-service.js` pure; main's print service;
`electron/print-raster.html` + `src/print-raster-page.js`, the hidden "print as image" page):
- The PDF printer, set to Letter for the test, showed ⚠ in the menu and beside the selection; the ⚠
  opened "ERPNext lays documents out on A4 … this printer loads Letter. The app shrinks each page to
  fit … Open Print Settings".
- *Print as image* was on by default. The printed file came out on **Letter** (612×792 pt) with one
  image and no fonts — a flat picture, shrunk to fit — and the watcher read "The printer has all 1
  job". (The printer's paper and the test's `print-prefs.json` were put back after.)
- Job watching reads CUPS (`lpstat`) and Electron's `printer-state-reasons`; trouble names the cause
  (out of paper, paused, a door open…) with *Check again* / *Stop watching (Esc)*. A trouble state
  was proven in unit tests only — pausing a CUPS printer needs admin rights here.
- Every Electron print call has a 90-second deadline, so a hung driver cannot freeze a batch.
- **Spreadsheets that fit one page are shown** (5zorro: "csv and spreadsheets that are only one
  page is enough"): a CSV / TSV or the first sheet of an .xlsx as a plain table (values only) in the
  pane and in "Save as one PDF", up to 45 rows × 10 columns; bigger ones say "more than one page (N
  rows × M columns) — open it in its own program (Excel)". No library: `src/sheet-preview.js` reads
  the .xlsx ZIP with the platform's DecompressionStream; old binary .xls stays "open it in Excel".
  Proven live with a 3-row CSV, a 300-row CSV and a small .xlsx (attachments deleted after).

## Compare pane (5zorro 2026-10-03, "moonshot" — step 1 built 2026-10-03)

Beside the Doc Bill (when the window is wide enough), the papers it should match — scanned PDFs,
phone photos, a .docx — shown as **one continuous document**, as if a single PDF. Sketch, for when it
is picked up:

- **Where the files come from:** the bill's own ERPNext attachments (`File`, `attached_to_doctype`
  / `attached_to_name`), its source PO / receipt's attachments, and files dropped on the pane — which
  are uploaded to ERPNext as attachments (`upload_file`), so they are there next time and in Vanilla.
- **One column, every page:** PDFs rendered page by page (PDF.js), images as pages, .docx converted
  to HTML (mammoth — text and tables, layout approximate; "open in Word" for the exact look). HEIC
  phone photos are not readable by Chromium.
- **Layout:** the bill keeps its column on the left (papers are stapled on the left) and the pane
  fills the right from about 1700px of window; narrower, it is a toggle.
- **Then:** save the stack as one PDF (`printToPDF`) and attach it to the bill; and the real compare
  — find the bill's numbers (supplier no., date, total, line amounts) in the papers' text and mark
  both sides where they match or do not (text PDFs and .docx first; OCR for photos later).
- New dependencies: `pdfjs-dist`, `mammoth` (added 2026-10-03; `npm audit --omit=dev` clean), and
  `tesseract.js` for OCR, later.

**Step 1 (building):** a "Papers" toggle on the Doc skins opens the pane. It lists the document's
attachments — and, on a Bill, its source POs' and receipts' — read over the ERP session (the page
itself cannot reach ERPNext's private files), stacked in one column: PDFs page by page, images,
.docx as HTML; anything else is a card with *Open* (the system's viewer). Files dropped on the pane
are uploaded to ERPNext as attachments of the document (private), so they are there next time and in
Vanilla; on an unsaved draft they are shown but not uploaded, and the pane says so. Side by side from
1700px of window (the document column moves left; the line tables' grow-to-need stops at the pane),
an overlay below that. Steps 2 (one PDF, attached) and 3 (find the bill's numbers) come after.

**Built 2026-10-03.** `src/compare-papers.js` (pure) + `src/compare-pane-ui.js`; main's
`papers-list` / `papers-bytes` / `papers-upload` (Frappe's `upload_file` from the logged-in page,
CSRF and all; logged both sides) / `papers-open`. The pane scrolls on its own — the wheel over the
papers moves the papers, over the document moves the document. **Include PO and receipt papers**
(5zorro 2026-10-03) is a checkbox in the pane's header, shown only when the bill has a PO or
receipt, off by default, remembered. Verified live on ACC-PINV-2026-00004 at 1960px: a PDF drawn
page by page, a PNG, a .docx as text and a table, a .HEIC as its "cannot draw" card, side by side
with the bill (the line tables stop at the pane). The four test attachments were deleted after.

**Step 2, reshaped by 5zorro 2026-10-03 and built the same day.** Above the papers: **Save all as
ZIP** and **Save as one PDF**, with **Include the printed Bill** (and PO / receipt when their papers
are included). Usually printing the bill alone is enough; these are for bringing context to a
question. ZIP: the files as they are (`src/zip-store.js`, a stored-entry ZIP writer, no dependency).
One PDF: the pane draws every paper (PDF pages as images, a .docx as HTML, a HEIC as a "not
included" note) into one page that Chromium prints — no PDF merger. Printed documents go through the
self-healing PDF path. Verified live: a ZIP of 5 (printed Bill + 4 papers, byte-identical, valid)
and a 5-page PDF; test attachments deleted after. A "print all of it" button was considered and left
out: the saved PDF prints from the print dialog like any file.

**Step 3 parked (5zorro 2026-10-03)** until several other parts of the app reach MVP. "Find the
bill's numbers in the papers" was the idea of marking where the papers' amounts / dates / supplier
no. match the bill's. 5zorro's longer-term direction instead: link **emailed PDFs** to bills, and
extract them into a draft bill when approved / received. Far off.

## DF-02 follow-ups (5zorro 2026-10-10 notes)

Found on the DF-02 paper (blank bench). Agreed item by item with 5zorro before building.

- **Hang (fixed `a94bdca`).** Save in the unsaved-changes gate asks "Receive these items with this
  bill?" while the gate is still up; the question sat under the gate (z-index 80 vs 200), so the
  gate waited on "Saving…" for an answer nobody could see. Questions asked mid-save now use
  `.over-gate`. App test `e2e/scaffold-receive-gate.spec.js`.
- **Hatch through text (fixed `06f45ce`).** Every hatched surface names its solid colour
  (`--hatch-base`); text on it carries `.hatch-clear`. `tests/hatch-clear.test.js` lists the
  surfaces, so a new hatched page fails until its text is handled.
- **Esc from create Item (fixed `bd0105f`).** Back in the Item cell it was opened from, holding the
  new Item when it was saved (`src/peek-return-focus.js`).
- **Item Code (fixed `cbc98b1`).** Item columns use ERPNext's word. "Description" already is the
  long description field (it starts as the item name); no Item Name column.
- **Taxes and charges (built `05f57b3`).**
  - Root cause of "typed 0 in Amount, grand total did not move": **Tab** out of an edited Amount
    dropped the edit (the move guard also blocked the commit). Clicking away worked. Reproduced live.
  - Tab order follows ERPNext's own rule: a % row tabs Account → Rate %, a fixed (Actual) row
    Account → Amount. Amount on a % row is mouse-only; editing it makes the row Actual (the bridge
    already does), so the typed amount is that row's source of truth; the row says it was n% before.
  - The table sits in an inner panel like the items table: laid out against its own padding it was
    28px too wide, so it scrolled sideways and pushed the remove button off-screen.
  - 🗑 per row; **Remove all** clears the rows and the template field, and stays removed until the
    bill is saved (a vendor change would otherwise refill them from the template).
  - **ⓘ Vendor tax template default**: why these taxes (the template marked Default, or a Tax Rule
    naming this vendor) and how to change it (peek either).
- **J — just-in-time receipts (un-parked and built 2026-10-10: `931cf28`, `0c74ee1`, `600a862`; paper
  DF-26).** Rec'd by / Rec'd Date columns; a click opens a small editor (one line, or every line not
  yet received — stock items only); not Tab-walk cells yet. The block is written into the draft's
  Remarks on every change, not only at Save, so the draft carries it and the gate guards it.
  Submit order: ask about unfilled lines → save the draft → make + submit each receipt → point the
  lines at them (bridge v25 `linkReceiptLines`) → trim the block → submit. No custom fields:
  - Per line, Received by (plain text) and Received on. On Submit, before the bill: one Item Receipt
    per person + date, lines from several POs and NIC together, qty and rate from the bill (the bill
    is the source of truth; PO 3 / bill 5 is the existing over-PO split), dated the day received,
    submitted; then each bill line points at its receipt line; then the bill submits.
  - Receipt Remarks carries `Received by: <name>`; a receipt without it falls back to its creator.
  - A draft keeps the pending who/when in the bill's Remarks as a `[received]` block (line number +
    item code), hidden from the memo box and removed once the receipts exist.
  - Any line with who/when, or any line already from a receipt → the receipt route (ERPNext refuses
    Update Stock on such a bill). Otherwise "Receive with this bill" stays as it is.
  - Stock lines with no who/when on a receipt-route bill (5zorro 2026-10-10): the receive question
    at Submit names them and offers **Receive them now as <you> on <date>** (both editable) or
    **Not received yet (bill only)**. The date defaults to **the day before the invoice date** —
    common ERP practice, so goods sold the day they are billed are not costed as sold before they
    were received (negative-stock guess, the local notes file "Shipping before receiving").
  - Known gap, v1: the receipt carries no taxes; a bill tax with a Valuation category would not
    reach stock cost through these receipts.
- **A Bill's posting date is a stamp (5zorro 2026-10-10 — reverses the 09-26 "posts on its Invoice
  date").** It is the day the Bill is saved or submitted; the Supplier Invoice Date drives only the
  due date. Doc Bill: typing the Invoice date no longer moves the posting date, and save stamps
  today (bridge v26 `stampBillPostingDate`, which also corrects drafts left ticked). Simplified
  (Doc-skin profile): Posting Date quiet with "Today", Edit Posting Date locked off, save stamps
  today. Item Receipts keep their typed Date (DF-23) and just-in-time receipts their received date.
  🔴 **Exposed by the reversal, fixed:** on a backdated invoice ERPNext's form-side terms call
  (`get_payment_terms` with the real posting date) pulls a due date earlier than the posting date
  up to it, and its save then refuses it ("Due Date cannot be after <invoice date + terms>"). The
  bridge now fetches the schedule as ERPNext's save does, from `bill_date or posting_date`
  (`fetchScheduleLikeSave`), after the Invoice date, the terms, or a vendor change. DF-22 rewritten.
  Already-submitted ACC-PINV-2026-00006 posted on 07/22 under the old rule; left as is.
- **Simplified's Doc-skin defaults (DF-01 Update Stock, DF-02 posting date; built 2026-10-10).** The
  defaults were a hand-made list (09-03/04) that froze unticked checkboxes. Now: an unticked box is
  never locked unless the profile decides its value; under the Doc-skin profile the posting date is
  stamped as above. And the list is
  **generated**: `npm run seeds:simplified` applies `src/simplified-seed-rule.js` to a snapshot of
  ERPNext's field lists (`tests/fixtures/simplified-seed-meta/`, refresh with `-- --refresh-meta`
  after an upgrade) and writes `src/simplified-seed-profiles.generated.js`; a drift test fails
  until it is re-run. PI `project`, `subscription`, `title` were first kept Normal (the old hand
  list had not seeded them); 2026-10-11 5zorro: Simplified's assumptions come from the Doc skin
  (generated) or the clerk's own saved customization — so they follow the rule, quiet & locked.
- **Parked:** an opt-in custom-field module with a clear fence around it (5zorro: stay Clean Core).
- **DF-01 notes, read back 2026-10-11:** *built* — sequential check numbers (`proposeReferenceNo`,
  Pay Bills' check: highest all-digit reference on that bank account + 1; with none it asks for the
  first — the blank site's earlier references were all text, so DF-01 got the ask; next on
  OPERATING ACCOUNT is 1235. Vanilla Payment Entry proposes nothing); the items table's scroll bars
  when blank (T above); Simplified's Update Stock tick (above). *Built 2026-10-11:* link dropdowns
  placed against the window, ≥360px, flipping above near the bottom (`57aaa52`); Find pages hide
  cancelled documents, *Show cancelled* (or the Cancelled status) brings them back, not remembered
  (`2383557`); right-click / Menu key on a Find row (`6c793cb`) — four groups (party, this document,
  view & edit, this page), ≤12 items, data in `src/find-row-menu.js`; placeholders greyed: new
  document for the party, linked documents, **cancel or delete…** (where the three-step delete path
  goes — still not built), print, page settings. Copy is not driven by an app test.
- **DF-02 second round (2026-10-11):** JIT Submit dogfooded (ACC-PINV-2026-00008 → MAT-PRE-2026-00002).
  Rec'd by / Rec'd Date blank until Refresh, after Submit and after Simplified → Doc: two Doc-skin
  open pushes dropped `linkedReceipts`, and the JIT step did not return the new receipts — fixed
  `e006ee3`, but **not reproduced in a test** (the page's own fetch refills it there), so a
  `bill-recd-source` breadcrumb now logs which paint left a receipt line blank; 5zorro to repeat and
  file a nav incident if it recurs — 5zorro could not reproduce after the fix (two nav incidents
  2026-10-11; on ACC-PINV-2026-00010 the JIT paint logged `given=1 … blank=0`). Open: the Bill's
  Customer / Sales order(s) columns — a Bill line has no Sales Order field; both are read through
  its PO line (`sales_order`, editable on a draft PO, locked once submitted → void-and-amend the PO).
  Built 2026-10-11 (5zorro: peek the Sales Order *and the PO*, to fix or void & amend the PO): headers
  plain order wash, cells order wash + the A/R desk hatch (when the clerk hatches A/R), text in a
  hatch-free box; the Sales order(s) cell has 👁 SO and 👁 PO peeks (`billLineOrderPeeks`).
- **🔴 Gap found 2026-10-11 — a peek into a Doc-skinned document has no way back.** The doors table
  below marks *Linked source ↗ (PO / receipt / bill / Sales Order)* as a peek where Esc returns, but
  `notePeekParentAndChild` only records a child when `isSoftPeekRoute` says `vanilla-always` (a
  master with no Doc skin). A PO / Item Receipt / Sales Order opens in its own Doc skin, logs
  `peek-none … (not a record)`, and Esc has nothing to return to — 5zorro came back from
  MAT-PRE-2026-00002 through Recent (2026-10-11 06:03). Same for the new SO / PO peeks. Fix needs
  a Doc → Doc errand (park the bill, Esc / "← Back to bill" on the child Doc page) — likely the
  detour mechanism (`shell-detour.js`) widened to Doc pages; not started, read back first.
  **The unsaved parent (5zorro's question, 2026-10-11):** a parked Doc page is only `{skinId, route}`;
  the unsaved bill itself lives in Frappe's `locals` in the ERP view, which survives in-SPA hops
  (looking at a PO, editing and saving a draft PO) but **not a full load** — and Void & amend's
  reopen (`reopenAfterVoidAndAmend` → `showDocForm` → `loadErpUrl`) and any navigate from the child
  page are full loads. Frappe's own guard (`form.js` `dirty()` adds a `beforeunload` listener on the
  bill's form, removed only on that form's refresh; skipped in developer_mode) may refuse such a
  load, but what the shell then does mid-errand is unproven. Proposal: no question at the door;
  a dirty gate for the **parked** bill at the moment an errand action would full-load (Save it as a
  draft and continue / Back to the bill / Cancel); Esc / "← Back to bill" returns to the in-memory draft.
  **Decided (5zorro 2026-10-11): ask at the door instead** — a gate at the moment of danger would
  not be intuitive. Temp fix: going from an unsaved Doc page to another Doc-skinned document asks
  first (the unsaved-changes gate); a clean page peeks as today. The real answer is a **new window**
  for the errand, with its own defaults — OI-040 (multi-window / concurrent Doc skins, parked).
  Sizing given 2026-10-11: a plain Vanilla pop-out window is small; Doc skins in a second window
  mean splitting `main.js`'s single-window state (~78 module-level variables; `dirtyState` alone is
  read ~180 times, one hidden ERP view behind every `erpEval`) into one state object per window.
  **Built 2026-10-11:** `soft-peek-route` from a Doc page to a Doc-skinned record (`isDocErrandTarget`)
  runs `openDocErrand`: the unsaved-changes gate first (clean → straight through), then the document
  opens in the clerk's usual lens with a Doc-page detour (`beginDocDetour`: the saved name, read after
  the gate; a never-saved bill gets no way back) — "← Back to Bill …" in the top bar and Esc return;
  being back on the bill by other means ends it. App tests: clean bill → Item Receipt → Esc back;
  unsaved bill → PO → gate → Cancel stays. **Not driven:** the gate's *Save* then the errand (it writes
  a draft) — 5zorro's to dogfood. One detour at a time: an errand from the errand replaces the way back.
- **DF-03 (2026-10-11):** the Sales Order's Customer box offers *create Customer* when nothing
  matches (`name_field` prefill — `customer_name` is no_copy), Esc back fills it; a settling repaint
  no longer wipes a half-typed link search (`071e2ad`, app tests in `scaffold-peek-return-focus`).

- **Late focus moves (5zorro focus incident 2026-10-11):** a line edit's after-ERPNext move, and a
  new bill's opening "focus Vendor" (retried to 500 ms), no longer override the clerk — both check
  `user-move-guard.js` (Tab / Enter / Esc / arrows / clicks since the edit, or since the bill first
  appeared) and log `focus-after-edit-skipped` / `focus-vendor-skipped`. A repaint that rebuilds the
  line the clerk is in now puts them back in the same row and field (`restoreBillFocus`). The
  heavy-lag drop first left as a gap was the same family: a "start in Vendor" repaint skipped putting
  the clerk back on the assumption Vendor would take focus; once the guard could decline, nobody did.
  The repaint now restores whenever Vendor did not actually take focus. Proven under 1.2 s lag.

- **2026-10-11, later the same day (all committed, app-tested):**
  - *Taxes Add amount* has the shared in-field calculator (Bill + Item Receipt; the PO Doc skin has no
    taxes section), and Add works out a typed / pasted sum (`parseMoneyOrSum`, the calculator's
    left-to-right math, to cents); an unfinished sum (`5*`) is refused by name.
  - *Allocate to stock cost* is exact: unit costs are nudged a cent until the lines rise by exactly
    the charge (`exactRates`, Banker's rounding as this site); when every qty shares a factor the
    leftover (< that factor in cents) stays on the charge line and the status names it. Leftover
    cents spread by largest remainder (67¢ over ten $1 lines → seven 7¢, three 6¢), not piled on one
    line. ACC-PINV-2026-00011 was submitted 1¢ off before this — 5zorro: leave it (sandbox).
  - *Calculator ribbon* grows to fit its tape, lined up with the field's aligned edge
    (`calc-ribbon-place.js`); it was exactly the field's width and spilled in narrow cells.
  - *Attach* sits beside the notes on all three A/P skins — Item Receipt beside its Remarks, PO beside
    its Freeform comments (terms used as remarks; ERPNext's PO has no Remarks).
  - *Nav incident 2026-10-12:* a Material Request opened from Home adopted the hidden untouched new
    Item Receipt as its peek parent (any new Frappe form counts as unsaved), so the Doc tab offered
    "Back to Item Receipt". The shell's own no-parent decision now holds for the hops that follow
    (`applyErpHopToPeekStack` `shellOpened`). **Decided (5zorro):** the Doc tab shows only when the
    page has a Doc skin — hidden, not greyed, otherwise. **No Material Request Doc skin is planned**;
    decide by dogfood (it would be an A1-style layout-as-data skin; questions: which MR types,
    make-PO-from-request, trace).
  - *Create row always last* (5zorro: "SAMPLE" found two items, neither right): Create Item /
    Customer / Project and Vendor add now sit under the hits, not only when nothing matched (as
    Vanilla's Link does). Enter still takes the first hit.
  - *Nav incident 2026-10-12:* line 2 of a new Sales Order → create Item → Save → Esc removed the
    line instead of filling it. Picking "create …" empties the cell, and the empty-line cleanup (an
    Item cell left empty drops its line, 180 ms after blur) fired on the return before the new Item
    landed — under chaos lag. Line 1 never showed it (the last line is never dropped), so the Bill's
    line-1 tests could not catch it; the Bill had the same hole. Fix, both pages:
    `peekErrandHoldsRow` holds the line while the errand is out and after the return until the
    clerk's next move. App test (line 2, `ERP_CHAOS_LAG_MS=1200`) fails on the old code with the
    incident's own breadcrumb (`focus-after-items → terms`) and passes with the fix
    (`empty-line-kept`).

## Dogfood residuals

| Family | Residual | State |
|---|---|---|
| DF-02 hang | Receive question behind the unsaved gate | fixed `a94bdca` — app test drives the exact path; 5zorro to re-run DF-02 |
| DF-02 taxes | Tab commit, rate/amount rule, Remove all, no sideways scroll, ⓘ template default | built `05f57b3`, `e5b6a51` — app tests (4); the ⓘ's Tax Rule link not clicked through |
| DF-02 J | Just-in-time receipts from Bill lines | built — editor, block, question and ERPNext's acceptance of the receipt proven; **a real Submit has not run** (it leaves submitted documents). 5zorro: paper DF-26 |
| A/P (found in A1) | Item Receipt's Date: a typed past date is reset to today on save, because `set_posting_time` is never ticked (the Invoice skin now ticks it) | **fixed 2026-09-26** — 5zorro: keep it. *(The Bill half — posting on the Invoice date — was reversed 2026-10-10: a Bill posts the day it is saved; see DF-02 follow-ups.)* IR ticks `set_posting_time` on a typed Date. And the Bill had the same gap: a typed Invoice date (`bill_date`) left the posting date on today, so a July bill posted in September. The Bill's Invoice date now *is* its posting date; clearing it goes back to today — ERPNext's own `bill_date or posting_date` (bridge `postingDateFollows`, `e2e/scaffold-typed-dates.spec.js`) |
| A1 | Save / Submit of an A/R document has not run | open — dogfood checklist A1; paper DF-18…23 |
| A1 | The A/R skin gaps listed above | open — marked on the paper; next A/R stage |
| 09-30 N1 | Peek stack: Esc swaps parent and child; who is a parent; Recent dropdown | built 2026-09-30 — 5zorro to dogfood |
| 09-30 N2 | Blocked page unload strands navigation | built 2026-09-30 — 5zorro to dogfood |
| 09-30 N3 | Resume keeps the wrong page code | built 2026-09-30 — 5zorro to dogfood |
| DF-01 D | Draft payments on the Pay Outstanding board | built 2026-10-01 — the read runs live; Submit / Delete not yet clicked (5zorro's dogfood: make a draft from the Bill's *Add payment*) |
| DF-01 E | Supplier No / Our No toggle (OI-170) | built 2026-10-01 — driven live on ACC-PINV-2026-00001 (Bill). PO / IR / A/R skins share the code but were not opened; the separate Payment document page and the Find pages do not have it yet |
| DF-01 R | Receive with the bill: ask at Save (Doc), note on Expense Head Changed (Simplified) | built 2026-10-01 — dialog driven live on an unsaved draft and cancelled; *Receive* / *Bill only* not yet clicked |
| DF-01 T | Line tables take room only when they need it | built 2026-10-01 — measured live (blank stays on the card; a long item code grows it right only; no page scroll) |
| DF-24 | Drop ship papers (SO → PO → Bill) | added 2026-10-01 — 5zorro to dogfood |
| 10-03 nav | Vendor add from the Doc Bill dropped the Bill; a saved draft kept its placeholder in the peek session | fixed `606fc73` — guard test, incident replay, app test (verified failing on the old code) |
| Doors | Peek / navigate convention — table, mismatches 1–3, board → bill detour (4) | built 2026-10-03 — table + guard test; 1–3 are peeks; 4 driven live (`e2e/scaffold-detour.spec.js`: board → Doc Bill → Esc and ← Back, board not reloaded, drawer kept; Home ends it). A void and amend *during* a detour not yet run live. Print is listed **pending** (still a full load) |
| Printing | Print service, dialog, queue, no-popup handler, recent printers, self-healing | built 2026-10-03 — PDF, popup catch, healing and silent printing (CUPS `lp`) all verified live |
| Compare | Papers pane beside the Doc skins; Save all as ZIP / as one PDF | built 2026-10-03 — verified live; step 3 (match numbers, emailed-PDF intake) parked |
| DF-01 J | Just-in-time receipt (received on / by) | parked — opt-in custom-field module; issue drafted for 5zorro to file |
| 09-30 N4 | Resume shows a stale copy of a fresh draft; Vanilla → Doc reloads the draft | built 2026-09-30 — 5zorro to dogfood |
