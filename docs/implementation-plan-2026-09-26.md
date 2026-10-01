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
  other session's commit `e75bd86` (staged with `git rm`, swept up by their `git commit`); the
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

**Fixes (built 2026-09-30, N2–N4; N1 is waiting on a design talk, below):**

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

**N1, open — 5zorro 2026-09-30:** "a return to the parent is a return" is agreed; the remaining
question is *who* is a parent. Not a hard-coded Bill/PO/IR list: Frappe records the calling form
itself when a Link field's *Create a new …* opens a full form (`frappe._from_link.set_route_args`,
`controls/link.js`), and routes back to it on save (`update_calling_link`, `save.js`). Proposal and
the Recent "dropdown" idea are with 5zorro (museum OI-128).

## Dogfood residuals

| Family | Residual | State |
|---|---|---|
| A/P (found in A1) | Item Receipt's Date: a typed past date is reset to today on save, because `set_posting_time` is never ticked (the Invoice skin now ticks it) | **fixed 2026-09-26** — 5zorro: keep it. IR ticks `set_posting_time` on a typed Date. And the Bill had the same gap: a typed Invoice date (`bill_date`) left the posting date on today, so a July bill posted in September. The Bill's Invoice date now *is* its posting date; clearing it goes back to today — ERPNext's own `bill_date or posting_date` (bridge `postingDateFollows`, `e2e/scaffold-typed-dates.spec.js`) |
| A1 | Save / Submit of an A/R document has not run | open — dogfood checklist A1; paper DF-18…23 |
| A1 | The A/R skin gaps listed above | open — marked on the paper; next A/R stage |
| 09-30 N1 | Peek stack: Esc swaps parent and child | open — design question with 5zorro (who is a parent) |
| 09-30 N2 | Blocked page unload strands navigation | built 2026-09-30 — 5zorro to dogfood |
| 09-30 N3 | Resume keeps the wrong page code | built 2026-09-30 — 5zorro to dogfood |
| 09-30 N4 | Resume shows a stale copy of a fresh draft | built 2026-09-30 — 5zorro to dogfood |
