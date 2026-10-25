# Product gotchas (Doc shell / Electron)

Runtime and architecture lessons from dogfood and nav incidents.  
For Playwright/e2e specifics see `e2e/GOTCHAS.md`. For input-count scrape methodology see
`docs/input-count-gotchas.md`.

**Museum policy:** cite **OI ids + one-line status** only — no discovery essay here.

---

## G1 — Bill PO line enrich vs logbook title (OI-151 P3, 2026-08-31)

**Dogfood doc:** `ACC-PINV-2026-00197` vs submitted PO `PUR-ORD-2026-00375` (OVERLIMIT fixture:
PO line qty **1**, bill qty **2** — skin should cap sourced row and NIC the excess).

### Observed

- PO **logbook** column (`title`) could show **OVERLIMIT** while **Save & Submit** stayed blocked.
- Status / toast: *"PO/PR line limit still loading — wait for source columns to finish, then retry Save."*
- Or: *"Adding line…"* / *Still loading…* stuck when ERP webview was busy (chaos lag).
- Nav-debug: repeated `bill-enrich-slice lineContext timeout`; sometimes **no** enrich logs for
  ~2 min (background loop wedged).
- HTTP experiments logged `via=http fail status=400` (wrong API) then `po=417` (child-doctype list).

### Expected

- **Two enrich slices** on bill open — do not conflate them:
  1. **`linkedPos`** — PO header `title` (logbook #). Cosmetic / wayfinding.
  2. **`lineContext`** — PO/PR **child row** qty + `billed_amt` → `maxBillableQty` in
     `billPoLineMetaByDoc`. **Required** for OI-151 split + cache-only save (no JIT fetch at submit).
- When (2) is cold, renderer **correctly** blocks save before IPC (`listPoCapCacheBlockers`).
- After (2) succeeds: `bill-po-meta-fetch via=http parents=N caps=M` with `caps ≥ 1` for sourced
  over-limit rows; submit splits then proceeds.

### Why it broke (architecture)

| Layer | Failure |
|-------|---------|
| **ERP webview `executeJavaScript`** | `frappe.db.get_list` / bridge eval **hangs** under form ajax + chaos; `raceTimeout` abandons the waiter but the browser may still hold the eval. |
| **`erpEval` serialize queue (removed)** | Chained promises behind abandoned evals → background enrich never logged the next round. |
| **POST `frappe.client.get_list` + manual Cookie** | Frappe returned **400** — wrong shape for this session. |
| **GET `/api/resource/Purchase Order Item?filters=…`** | **417** / permission quirks — **child doctypes are a bad list target**. Exception (2026-10-22, checked live): `frappe.client.get_list` **with `parent: "<Parent DocType>"`** returns a child doctype's fields; without `parent` it returns only `name`. Pay Outstanding reads Payment Schedule that way in one call. |
| **GET `/api/resource/Purchase Order` (header only)** | Works for logbook — **misleading green** when child cap cache is still empty. |

### Fix (current SSoT)

1. **Read path:** `electron/main.js` → `erpSessionFetchImpl()` (`session.fetch`, cookies automatic).
2. **PO/PR line caps:** `GET /api/resource/Purchase Order/{name}?fields=["name","customer","customer_name","items"]`
   (and PR parent analog) — pure extractors in `src/bill-po-hydrate.js`
   (`poItemsAndHeadersFromParentDocs`, `prItemsFromParentDocs`).
3. **Logbook titles:** `GET /api/resource/Purchase Order?filters=…` list (header doctype only).
4. **Fallback:** bridge `fetchPoLineMeta` → `erpEval` only if HTTP parent fetch fails.
5. **Save path:** cache-only — `listOverbillCapCacheBlockers` / `OVERBILL_CAP_CACHE_BLOCKER`; no JIT
   cap fetch at submit. Renderer logs `bill-overbill-cache-block-renderer` to nav-debug.

**Key modules:** `src/erp-http-list.js`, `src/bill-po-hydrate.js`, `src/bill-po-qty-split.js`,
`electron/main.js` (`fetchBillPoLineMeta`, `enrichBillLineContext`, `saveBillFromErp`).

### Dogfood checklist (OI-151 P3)

After `npm start`, open the over-limit draft bill:

1. Nav-debug within ~2s: `bill-po-meta-fetch via=http parents=1 caps=1`.
2. PO logbook shows OVERLIMIT **and** source columns finish (no endless *Still loading…*).
3. Save & Submit → one PO-linked row qty **1**, one **NIC** row for excess → submit succeeds.
4. If blocked: check nav-debug for `bill-overbill-cache-block-renderer` (cache cold) vs
   `bill-po-meta-fetch via=http fail …` (HTTP still broken).

### Do not regress

- Do **not** reintroduce JIT PO cap fetch on save/submit (OI-151 policy: fetch once → cache → split).
- Do **not** treat logbook title load as proof that `maxBillableQty` is cached.
- Do **not** list **Purchase Order Item** / **Purchase Receipt Item** via `/api/resource/{child}` filters
  — fetch **parent doc + items[]** instead.
- Avoid **`erpEval` promise chains** that block the next IPC until a hung eval completes.

---

## G2 — Vanilla tab DOM for Simplified scroll-nav (2026-09-04)

**Observed:** Simplified skin thin-injects onto Vanilla's rendered form, which still uses
Frappe's native tab widget (Details / Payments / Address and Contact / Terms / More Info / …
— `frm.layout.tabs`), not doc skin's own single-scroll section layout. 5zorro wants
Simplified to read as one continuous scroll with a sticky jump nav + back-to-top
(DocuSign-style), same as doc skin already is.

**Expected:** All tab content stays in the DOM at all times (Frappe never unmounts inactive
tabs) — only `display` is toggled. So "single scroll" = force every pane's `display` on at
once and repurpose the existing sticky tab strip as jump links, rather than rebuilding
anything.

**Architecture / fix:** `frm.layout.tabs[i]` → `.wrapper` (the `.tab-pane`, id
`{scrubbed-doctype}-{fieldname}`) and `.tab_link` (the `<li class="nav-item">`). Visibility
is Bootstrap's `.tab-content > .tab-pane { display:none } .tab-content > .active { display:
block }` (`node_modules/bootstrap/scss/_nav.scss`) — no `!important`, so a plain inline
`el.style.display = "block"` on every non-hidden pane beats it without touching Frappe's own
`active`/`hide` class bookkeeping (`Tab.toggle()`/`set_active()` in
`frappe/public/js/frappe/form/tab.js`). `tab.hidden` (permission/empty-section) is legit —
skip those. Rewire `.nav-link` clicks to `scrollIntoView` instead of `set_active()` (leave
Frappe's own handler attached; harmless since ours doesn't fight the display override).
Landed in `src/assume-applier-payload.js` (`installScrollNav`, `installBackToTop`) —
IntersectionObserver scroll-spy highlights the current `.nav-link`; Esc-Esc (600ms window)
and a floating `#ss-top` button both scroll `tabs[0].wrapper` into view.

**Dogfood:** Open a Purchase Invoice under Simplified lens → all vanilla tab sections stack
in one scroll; clicking a tab strip item scrolls to it (no more show/hide flash); scrolling
highlights the matching tab; Esc twice back-to-top.

**Do not regress:** Don't add `active` class to every pane to fake visibility — other Frappe
code (`set_active_tab`, dashboard tab placement) assumes exactly one active tab exists. Keep
using inline `style.display`, not a class, for the force-visible override. Doctypes with no
tabbed layout (`frm.layout.tabs.length === 0`) must no-op cleanly — this is not Bill-specific.

---

## G3 — read_only + no value silently hides a field (hide_empty_read_only_fields, 2026-09-04)

**Observed:** 5zorro's doc-skin-seed assumptions (G2, L2 "quiet & locked" fields with no
literal value — the seed only sets a placement, never a value) rendered as genuinely
invisible (`getBoundingClientRect()` all-zero, `hide-control` class + `display:none`) on
Purchase Invoice's Payments/Terms/More Info tabs, not just dimmed. Nav incident: "the
section did not populate with details... it was hard to tell what I was supposed to see."

**Expected:** L2 ("Quiet & locked") should mean visible-but-greyed-and-locked, per its own
`PLACEMENT_UI` label ("filled, greyed, locked"). It should never make a field disappear.

**Architecture / fix:** Frappe's `Control.get_status()`
(`frappe/public/js/frappe/form/controls/base_control.js`) has a branch: if the resolved
status is "Read" (i.e. `read_only`), the value is null, and System Settings
`hide_empty_read_only_fields` is on, status downgrades to "None" → `refresh()` toggles
`hide-control` (`display:none`) on the field wrapper. `apply()` in
`src/assume-applier-payload.js` unconditionally called `frm.set_df_property(fn,
"read_only", 1)` for any assumed field (L1 *and* L2, not just L2) — so any seeded/assumed
field with no literal value collided with this setting and vanished outright. Fix: only set
`read_only` when the field actually carries a value (freshly set via the assumption or
already non-blank on the live doc); otherwise apply only the dim/detab visual treatment,
leaving the field genuinely visible (and technically still editable — an acceptable
trade-off vs. disappearing).

Diagnosed live via a throwaway Playwright script driving the real Electron app through
`E2E=1`'s `globalThis.__erpE2e.execInView("erp", js)` (see `e2e/helpers.js`) — injected
`buildSimplifiedPayload()` into a fresh `/app/purchase-invoice/new`, then read
`getBoundingClientRect()` + ancestor `hide-control`/`display` on specific fields. Faster and
more precise than a screenshot for this class of bug (exact ancestor chain, not just
"looks blank").

**Do not regress:** Never lock (`read_only`) an assumed field that has no resolved value —
check `hide_empty_read_only_fields` isn't silently eating it. A collapsed-looking section
under scroll-nav is not automatically this bug, though — some ERPNext sections
(`write_off`, `advances_section` on Purchase Invoice) are legitimately `collapsible: 1` and
start collapsed with no content height in Vanilla too; check `df.collapsible` before
assuming a fix is needed.

---

## G4 — Forced-visible tabs need Bootstrap's "show", and two click-time fights (2026-09-04)

**Observed:** "All fonts, text, input box borders and shadows... render as the exact same
color as the background" on every non-active tab under Simplified scroll-nav — text,
borders, even the caret, fully present in the DOM but invisible. Separately: clicking a
tab-strip nav-link *twice* first scrolled to the right section, then snapped back to the
top — "de-renders the rest of the scroll" on click, confirmed scrolling alone wasn't the
trigger.

**Expected:** A forced-`display:block` pane should render normally; clicking its nav-link
repeatedly should keep it in view, not toggle.

**Architecture / fix — three separate, compounding causes, each traced live by driving the
real Electron app through `E2E=1`'s `globalThis.__erpE2e.execInView(view, js)`
(`e2e/helpers.js`) rather than guessing from source alone:**

1. **Opacity, not just display.** Every `.tab-pane` also carries Bootstrap's `fade` class:
   `.fade:not(.show){opacity:0}` (`node_modules/bootstrap/scss/_transitions.scss`) is a
   *separate* gate from `display`. `Tab.set_active()` adds `show active` to the newly
   active tab and **removes `show` — not just `active` — from every other one**. G2's fix
   forced `display:block` but never re-added `show`, so every non-initially-active pane sat
   at `opacity:0`: fully laid out, fully transparent. Fix: also `classList.add("show")`
   (never `"active"` — see G2's own "do not regress").
2. **Something un-shows it again, once, fast.** Even with `show` added, it vanished again
   within ~100ms — too fast to be a later async refresh, and `apply()`/`installScrollNav`
   only ran once (confirmed via breadcrumb logging inside the real code, not a
   reimplementation). `Tab` isn't exposed as `frappe.ui.form.Tab` (only in
   dead/commented-out code in `form.js`), so there's nothing to patch directly, and the
   exact caller wasn't worth chasing further. Fix: out-persist it — a `MutationObserver` on
   each section's `class` attribute that re-adds `show` the instant anything removes it.
3. **A delegated click handler nobody's `off()` reaches.** `Layout.setup_events()`
   (`frappe/public/js/frappe/form/layout.js`) binds a **second**, separate click handler —
   delegated on `<ul id="form-tabs">` itself, not on the individual `.nav-link` buttons
   where `Tab.setup_listeners()` binds its own (already correctly neutralized via
   unnamespaced `off("click")` on the button). Delegation means `off("click")` on the
   button never touches it. It has its own logic: if `.form-tab-content`'s own top has
   scrolled above 100px from the viewport top, it calls `tabs_content.scrollIntoView()`
   bare (no smooth/`block:start`) — a safety net for Frappe's own tiny native tab-switch
   scroll, which our scroll-thousands-of-px navigation blows way past on the very first
   click, so a second click's bubbled event re-triggers it and snaps back to the start.
   Fix: `e.stopPropagation()` in the button-level handler — it fires first during bubble,
   so stopping propagation there keeps the event from ever reaching the delegated one.

Also found along the way and worth remembering on its own: **this Electron shell's ERP view
does not use normal document-level scrolling.** `window.scrollY` /
`document.documentElement.scrollTop` / `document.body.scrollTop` all read `0` throughout an
entire `scrollIntoView({behavior:"smooth"})` animation that visibly moves elements by
thousands of px (`getBoundingClientRect()` tracks it correctly) — `html`/`body` compute
`overflow: visible`, so there is no CSSOM-recognized scrolling box for `scrollTop` to
report, even though `scrollIntoView` still visibly works via some other Chromium-internal
path. **Any code that needs to react to "the user scrolled" here must poll geometry
(`getBoundingClientRect()`) — a `window`/`document` `scroll` event listener will not
reliably fire.** `updateScrollNavActive`'s back-to-top visibility toggle currently still
listens on `window`'s `scroll` event and inherits this weakness; not yet fixed.

**Dogfood:** Open a Purchase Invoice under Simplified. Every tab-pane's text/borders should
be visible (not just present) on scroll. Click a tab-strip nav-link 5 times in a row —
should land and stay at the same scroll position every time, no snap-back.

**Do not regress:** Don't assume `off("click")` on an element clears every handler that
reacts to clicks on it — check for a delegated ancestor-level handler too (`stack` on an
instrumented `scrollIntoView`/similar call will show it). Don't chase "why does a class
disappear" by reasoning from source alone once the answer isn't obvious in a read or two —
a `MutationObserver` breadcrumb log against the *real* injected code (not a hand-rolled
re-simulation of it) settles it in one run.

---

## G5 — Doc Bill's "Invoice date" was wired to the wrong vanilla field (posting_date vs bill_date, 2026-09-04)

**Observed:** Doc Bill's header shows a box labeled "Invoice date". The Simplified seed
(`simplified-seed-profiles.js`) locked vanilla's `bill_date` field as L2 ("quiet &
locked") on the theory that doc skin doesn't surface it. First pass here treated that as
a seed bug and un-seeded `bill_date` to match what the code actually did. That was
backwards: the seed's reasoning was correct, the *code* was the bug.

**Expected:** Doc Bill's "Invoice date" input should write to whichever vanilla field
vanilla itself treats as the invoice-date basis for credit-term due-date math, so a Bill
made in Doc skin computes the same due date a Bill made in Vanilla would.

**Root cause:** `BILL_HEADER_FIELDS` (`bill-map.js`) wired "Invoice date" to `posting_date`
— not `bill_date` (vanilla label "Supplier Invoice Date") — reusing ERPNext's *required*
accounting-date field so Doc Bill only needed one date input. Two independent pieces of
vanilla source prove this was wrong:
1. `accounts_controller.py`'s `set_payment_schedule()` / `get_due_date()`:
   `date = bill_date or posting_date` — vanilla's own credit-term ("Net 30" etc.) due-date
   calculation prefers `bill_date`, falling back to `posting_date` only when `bill_date` is
   blank. Doc Bill never wrote `bill_date`, so vanilla's due-date math landed on
   `posting_date` purely by that fallback, not because it was the intended basis.
2. `erp-form-bridge-page.js`'s `alignPostingDateLikeVanillaOk()` — Doc Bill's own
   save path — already force-resets `posting_date` to *today* before every save whenever
   it differs (mirroring Vanilla's "posting date will change, OK?" confirm dialog, which
   Doc skin auto-accepts since it can't click a hidden dialog). So whatever the user typed
   into "Invoice date" was silently discarded and replaced with today's date at save time
   for any Bill not saved same-day as its typed date — the field was barely functional.

**Fix:** repointed `BILL_HEADER_FIELDS`'s "Invoice date" to `bill_date`
(`bill-map.js`). `posting_date` is no longer written by any Doc Bill input — it keeps its
DocType default (`"Today"`) and the existing save-time realignment, which is now exactly
right (accounting date = today; invoice date = whatever the vendor's invoice says).
Updated every place that treated `"posting_date"` as "the Invoice-date input's fieldname"
to say `"bill_date"` instead: `bill-form-page.js` (paint/read/blur dispatch),
`bill-payment-terms-settle.js` + its inline mirror in `erp-form-bridge-page.js`
(`settlePaymentTermsAfterHeaderChange`/`setHeader` — recompute due date/payment schedule
on change), `dirty-gate.js` (date-kind comparison), `stale-focus-guard.js`
(`shouldScheduleInvoiceDateFocus`), and the `data-field` attribute in `doc-form.html` /
`bill-shell.fragment.html` (whose `data-testid="bill-date"` had quietly been telling the
truth the whole time). Un-seeding `bill_date` in `simplified-seed-profiles.js` turned out
to be correct after all — now for the right reason (doc skin genuinely writes it) instead
of the original wrong one (it doesn't, so don't lock it). Bumped
`erp-form-bridge-page.js` VERSION 19->20.

**Generalize:** a Doc-skin box's *label* implying a vanilla field, and its `field:` wiring
actually using a *different* one, is a real class of bug — not just a seeding-methodology
gap. When cross-referencing `*_HEADER_FIELDS` against vanilla DocType JSON for the other 8
target doctypes, check whether vanilla's own server-side calculations (due dates, GL
posting, validations) key off the field the wiring *didn't* pick, the way `bill_date`
turned out to be the true credit-term basis here.

**Dogfood:** Open a Purchase Invoice under Simplified with no saved profile (or "Use
doc-skin assumptions"). `bill_date` ("Supplier Invoice Date") should show as Normal, not
locked — because Doc Bill's "Invoice date" now genuinely writes it. On Doc Bill: type an
Invoice date a few days in the past with a Payment Terms Template selected (e.g. Net 30);
Bill Due Date should compute from the typed Invoice date, not from today.

**Do not regress:** When a Doc-skin field mapping looks suspicious, check what vanilla's
own server-side logic actually keys off before "fixing" the seed/downstream logic to match
the existing mapping — the mapping itself may be the bug.

---

## G6 — A stale nav intent is worse than no guard (2026-09-05)

**Observed:** From Doc Home, clicking **Vanilla** landed back on the previous Vanilla list
("payment entry find") instead of Desk (nav incident 2026-09-05). Related: the toolbar lens
chip did not flip (2026-09-03), and the Simplified ⚙ Assumptions button stayed on screen
after switching to Vanilla (2026-09-04, logged twice).

**Expected:** The shell's `currentRoute` tracks where the ERP WebContents actually is, and
every consumer of it (toolbar lens chip, Simplified injection gate, Recent flyout) agrees.

**Architecture / fix:** `beginErpNavIntent()` guards an intentional shell nav so a late
`did-navigate` from the page we just left cannot overwrite `currentRoute`. It only armed for
`/app/…` paths — and for anything else (`/desk`, `/`, `/login`) it returned **without
clearing the intent already armed**. Proven against `src/erp-nav-intent.js`: with a stale
`/app/payment-entry` intent still armed, `shouldAcceptErpTrackNav` **rejects the real arrival
at Desk** (so `currentRoute` never updates, and `pollErpRoute` cannot repair it because it
calls the same guarded `trackNav`) while **accepting a late event from the old page**, which
writes the old route back. The window is the full 15s intent timeout.

Arming a `/desk` intent instead would be worse, not better: the guard matches on doctype, and
a doctype-less intent never accepts its own arrival, so it would never clear and would block
every event for the whole timeout (there is a unit test pinning this). The fix is therefore
**clear, never leave stale** — `resolveErpNavIntent()` returns arm-or-clear and `main.js`
obeys it.

Two consumers were repaired at the same time, because a lying `currentRoute` is only visible
through them: the toolbar chip now derives from the **live** ERP path via
`toolbarLensId()` (`src/chrome-state.js`), and the Simplified skin now has a real
`destroy()` so leaving the lens no longer depends on a page reload actually happening
(`ensureSimplifiedSkin` tears down whenever the lens is not simplified, making every ERP
nav a repair point).

**Dogfood:** From Doc Home click Vanilla → Desk home, not the last list. On a Simplified
Bill click Vanilla → the ⚙ button and every dimmed field disappear immediately, and the
toolbar chip reads Vanilla.

**Do not regress:** A guard that can be armed must have a defined "cannot guard this" branch.
Returning early from an arming function leaves the *previous* guard live — which is not
"no guard", it is a guard pointed at the wrong target.

---

## G7 — `[hidden]` loses to any author `display:` rule (2026-09-08)

**Observed:** `el.hidden = true` left the element on screen. Hit **four separate times** on the
Packet 4b surfaces: `.check-doc-write-actions` (a submitted Payment Entry still offered "Create &
submit"), `.col-header-row`, `.check-doc-payee`, and `.link-wrap` (a link picker's chevron floating
on the check face with no input beside it).

**Expected:** the UA stylesheet's `[hidden] { display: none }` hides it.

**Architecture / fix:** that UA rule is the weakest possible declaration — **any** author
`display:` on the same element beats it, and every one of these elements had one (`flex`, `grid`,
`block`). A guard rule is required, and the guard must also **win the cascade**:
`.check-doc-payee[hidden]` and `.check-doc-payee-row .check-doc-payee` have identical specificity,
so a guard declared *first* silently loses and looks like it is doing nothing. Two further traps:
a picker may **wrap** the element you hid (hide what the picker actually built, not just the input),
and `.some-button span { display: none }` also hides an icon's own wrapper span — `uiIconHtml`
emits `<span class="ui-ico"><svg…></span>`, so targeting bare `span` empties the button.

`tests/doc-skin-css.test.js` now scans for this: it collects every element the JS toggles via
`hidden`, checks for a bare `display:` rule, and requires a guard that is more specific — or equally
specific and declared later. Verified by reintroducing each bug.

**Dogfood:** the e2e that should have caught the first one asserted the `.hidden` *property*, which
was `true` the whole time. Assert `getClientRects().length` — visibility, not intent.

---

## G8 — Headless measurement lies in four specific ways (2026-09-08)

**Observed:** measurements said a layout was fine while the screenshot plainly showed it broken, and
separately reported 1336px of ribbon drift where there was none.

**Expected:** the numbers and the picture agree.

**Architecture / fix:** four distinct blind spots, all worth checking before trusting a number:

1. **`scrollWidth > clientWidth` cannot see wrapping.** Text that breaks to a second line reports
   `scrollWidth === clientWidth`, so a squeezed flex row reads as "fits". Force `white-space:
   nowrap` on anything claiming to be one line — then width pressure becomes clipping, which the
   check *can* see. (Also makes "one line" an enforced property rather than a hope.)
2. **`display: none` children have all-zero rects.** A collision check that includes them compares
   against `top: 0` and reports a collision for every row — 48 false positives here. Filter by
   computed `display` before measuring.
3. **`scrollHeight` misses symmetric overflow.** With `justify-content: center`, content that
   overflows a flex box spills equally top and bottom; `scrollHeight` counts only the bottom half.
   Measure the union of children's rects against the parent's rect instead.
4. **Pick the right end of the path.** A ribbon between a span and a row attaches at opposite ends
   depending on which side the span is on, so reading `M` blindly measures the *bundle* end and
   reports enormous drift. `querySelector` also silently takes the first of two SVG layers.

**Dogfood:** the fix loop that works — measure, change, re-measure, **then screenshot**. Two of
these were only caught because the picture disagreed with the numbers.

---

## G9 — A surface that never claims a route is invisible to the whole nav spine (2026-09-10)

**Observed:** "I clicked on a few pages, and the recent portion of the nav flyout did not
populate." (nav incident 2026-09-10). The snapshot's `history` was `[]` after a session of
Home → Pay Outstanding → Home, and the trail showed the surface change
(`openPaymentEntryTile lens=doc → pay-outstanding`) with `currentRoute` still on `/desk`
throughout — including in the incident record itself, which therefore reported the wrong page.

**Expected:** Recent shows the pages the clerk actually visited, and `currentRoute` names the
document in front of them regardless of which surface is painting it.

**Architecture / fix:** Recent is fed from *navigation*: `trackNav` (an ERP URL change) and
`showDocForm` (which sets `currentRoute`, remembers the lens, and pushes a row). The two
Payment Entry Doc surfaces — `pay-outstanding.html` and `payment-doc.html` — are
`loadFile()` of a local page, so **neither event ever happens**. They were the first surfaces
in the shell to be a place the clerk can *be* without being a place the shell knows about.
`noteShellDocSurfaceRoute()` now does what `showDocForm` does: the route comes from
`docSkinTargetRoute()` in `lens-context.js`, deliberately the *same* `/app/payment-entry/…`
route the Vanilla visit uses, so both lenses share one history slot.

The same root — **`doc-skin-registry.js` (doc-form layouts only) used as the oracle for "does
this doctype have a Doc skin?", while `lens-context.js` is the declared SSoT** — had three
more faces, all repaired here:

- `classifyHistoryOpen` filed every Payment Entry under `kind: "setup"`, the muted decoration
  meant for Tax Category and Company. Split into two questions: `doctypeHasDocSkin` still
  answers the *navigation* one (and so leaves soft-peek policy untouched), `routeIsDocSkinned`
  answers the *labelling* one from the skin index.
- `openRoutePreferred` / `openHistoryRoute` required a doc-form profile before honouring a
  remembered Doc lens, so every door into a payment except the toolbar Doc tab — Recent,
  Drafts, Submitted — silently downgraded to Vanilla. `openShellDocSurface()` asks
  `resolveDocSkinTarget` instead. (Deliberate consequence: an explicit Recent click on a
  Payment Entry now opens its skin rather than soft-peeking it, matching the precedent
  `docTabAction` already set — own skin beats return-peek for this doctype. In-page ERP links
  still soft-peek.)
- `open-vanilla-skin` fell through to `/desk` from Pay Outstanding, leaving the payment the
  clerk was looking at, because `currentRoute` was `/desk` *and* the branch that would have
  used it demanded a doc-form profile.

**Dogfood:** Home → Pay Bills (Doc lens) → Pay Outstanding. Recent shows **New Payment Entry**
immediately. Home, then click that row → back on Pay Outstanding, not Vanilla. From Pay
Outstanding click Vanilla → the Vanilla Payment Entry, not Desk home.

**Do not regress:** A surface that renders a document must claim its route the moment it is
shown. Recent, the lens chip and incident snapshots are all downstream of `currentRoute`; a
surface that skips it does not degrade gracefully, it becomes invisible — and it takes the
incident report meant to debug it down with it. Equally: when a second registry starts
answering "does this have a Doc skin?", the older one becomes a *subset* answer, not the
answer.

---

## G10 — The toolbar re-derived an answer main had already computed (2026-09-10)

**Observed:** *"While I'm on bill doc skin, the toolbar correctly has the label 'Document-Skin'
emphasized (white). While I'm on the payment dashboard doc skin, the label 'document-skin' never
is emphasized."* (nav incident 2026-09-10T05:29). Unreported second half: **Default-skin** was
emphasized there instead, so the toolbar claimed the clerk was in Vanilla while they sat in the
Doc skin.

**Expected:** The lit tab names the lens you are actually in, on every surface that is the Doc
lens — including the two that are not `doc-form.html`.

**Architecture / fix:** `sendUiState()` computes the right answer twice over — `onDoc =
showingHome() || isShellDocSurface()` feeds `toolbarLensId()`, which returned `"doc"` correctly
on `pay-outstanding`. The toolbar then **ignored** it and recomputed selection from the payload's
`showingBill || showingDocForm`, both of which are `surfaceMode === "doc"` — doc-form.html only:

```js
const onDocForm = !!(s.showingBill || s.showingDocForm);   // false on pay-outstanding
const onErpForm = !showingHome && !onDocForm;              // ...so: true
lensDoc.classList.toggle("active", (showingHome || onDocForm) && docOk);        // never lit
lensVanilla.classList.toggle("active", onErpForm && activeLens !== "simplified"); // wrongly lit
```

Selection is now `lensTabEmphasis()` in `chrome-state.js`, sent as `lensActive`, and
`chrome.html` only paints it. Note this is the *third* time `surfaceMode === "doc"` has been the
wrong answer to "am I on the Doc lens?" — `isShellDocSurface()` exists precisely because it is,
and every consumer has to use it rather than re-testing the narrow flags.

**Dogfood:** Home → Pay Bills → Pay Outstanding: **Document-skin** is white, Default-skin is not.
Same on a payment opened from Recent. Bill / PO / IR and Vanilla forms are unchanged.

**Do not regress:** If main computes an answer and sends it, the renderer paints it — a renderer
that recomputes the same question from a *narrower* input will silently disagree the moment a new
surface appears, and it disagrees in the worst direction: confidently naming the wrong lens.

---

## G11 — One `resize` listener is not a layout (2026-09-17)

**Observed:** Fullscreen on a 1080p monitor left the desktop showing under the history rail and
under the page — 5zorro's focus incident: "it does not use all vertical space. something didn't
update." Measured through a real window manager, entering fullscreen left **1347px of dead space
below the views and 2560px beside them**: the views kept their windowed size. Leaving fullscreen
left them oversized, clipping their own bottoms. A milder form was there at startup — views 27px
taller than the content box.

**Expected:** Views cover the window's content box in every window state.

**Architecture / fix:** The shell wired `win.on("resize", place)` and nothing else. A fullscreen
transition does not reliably deliver a `resize` whose `getContentBounds()` is the *final* size —
under WSLg the programmatic fullscreen delivered no usable resize at all. Two parts, both needed
(`src/shell-relayout.js`, pure + tested):
1. Listen to the state changes themselves — `enter-full-screen`, `leave-full-screen`, `maximize`,
   `unmaximize`, `restore`, `resized`, `show` — not only `resize`.
2. Re-place again **after** the event (0 / 80 / 250 / 600ms), because the final bounds can land
   after the event announcing them. The late passes compare content size first, so a settled
   window costs one comparison.

**Snap-to-half (Win+Right), measured separately:** the `resize` it fires reports the **pre-snap**
size — the real one arrives only in the `move` events that follow, and a left-half snap fired no
`resize` at all. So `move`/`moved` are in the event list too, and the immediate pass is guarded by
`contentSizeChanged` so an ordinary window drag re-places nothing.

**Do not regress:** `e2e/scaffold-window-fit.spec.js` measures dead space windowed → fullscreen →
windowed. It is a Layer 3 smoke on purpose: these numbers do not exist until a real window manager
has resized a real window, so no unit test can see this bug class. Verified by reverting the fix —
the smoke fails on the fullscreen assertion.

## G12 — `npm test` can be green over a shell that will not start (2026-09-26)

**Observed:** Twice while building P1 stage 3, `electron/main.js` was left syntactically invalid and
the whole suite stayed green — 2000+ passing tests over a main process that could not boot. The
second time, the error Node reported (`missing ) after argument list`) pointed about twenty lines
away from the cause.

**Expected:** A shell entry point that cannot parse fails the gate.

**Architecture / fix:** No unit test imports `main.js` — it needs Electron — so nothing ever parsed
it. And the `erpEval` write paths are JavaScript written **inside a template literal**, which makes
one specific mistake invisible: a comment that names a function the ordinary way, with backticks,
*ends the literal* and inverts everything after it. Both times it was a comment like
`` // so by carrying `amendedName`. `` inside the injected script.

`tests/erp-eval-scripts.test.js` now does two things, and it needs both:
1. Writes every shell entry point out under the extension that matches how the shell loads it
   (`.mjs` / `.cjs`) and runs `node --check` on it. Nothing is executed.
2. Separately scans each `erpEval(\`…\`)` template and fails on any **unescaped** backtick, naming
   the line. The parse error alone points somewhere else, so this is the half that says what to fix.

**Do not regress:** inside an `erpEval` template, escape every backtick (`` \` ``). Verified by
re-introducing the exact comment that broke it: both tests fail, and the second one prints the line.

---

## G13 — Render died mid-loop and the board drew nothing, silently (2026-09-26)

**Observed:** 5zorro: *"the drawer in the pay outstanding document skin seems to be so high as to
cover up all suggested payment grouping (or there are no unpaid bills due to a db wipe)."* Neither.
The board drew **zero vendor cards** over 212 loaded bills, with no error on screen, nothing in the
console, and the "Nothing outstanding" banner correctly hidden. Two Layer 3 smokes had been failing
on it for days and were read as flaky.

**Expected:** One unusable row does not take the other 211 with it.

**Architecture / fix:** The Accounts Payable report returns more than bills. An **unallocated
payment** comes back with a *negative* outstanding and **no due date**, and
`effectivePayByDate("")` throws. The throw escaped from inside `render()`'s per-supplier loop,
which had already emptied the container and hidden the empty-state banner — so the failure mode was
a blank page rather than an error. Nothing surfaced it because `render()` is called from an `async`
init, where an uncaught throw becomes an unhandled rejection that Playwright's `pageerror` does not
report either.

These rows are not exotic: P1's own void-and-amend detaches payments by design, so every amend of a
paid bill creates one. `paymentBatchEconomics` now returns them as `unschedulable` rather than
throwing **or** dropping them — it is real money — and the vendor card shows the credit.

**Do not regress:** when a render loop can throw per item, the item is the unit of failure, not the
page. Diagnosing this needed a listener installed *inside* the page (`window.onerror`) and a forced
re-render; neither the console nor `pageerror` showed anything.

---

## Template (append G13+)

```markdown
### Gn — Short title (OI-xxx, date)

**Observed:** …
**Expected:** …
**Architecture / fix:** …
**Dogfood:** …
```

## G14 — A pending repost makes the books read wrong, not incomplete (2026-09-26)

**Observed:** After seeding a year of reselling history, the two ageing rules the corpus is built
around looked broken: **29** Sales Invoices older than 25 days and **31** Purchase Invoices older
than 60 days still carried an outstanding balance, despite every one of them having a submitted
payment allocated in full. Minutes later, with nothing changed but a `Repost Item Valuation` queue
draining in the background, both counts were **0**.

**Expected:** A payment that has been submitted and allocated has settled its invoice. Either it did
or it did not.

**Architecture:** `outstanding_amount` on an invoice is a **stored field**, recalculated from the
ledger by `update_voucher_outstanding` — and a repost rebuilds GL entries, so any invoice caught in a
pending repost's range is reporting a number from before the rebuild. It is not a partial value, and
nothing about the invoice says it is provisional: the field, the status ("Overdue") and the AP/AR
reports all agree with each other and are all stale together.

The same is true of the stock side, more visibly: mid-drain, `SAMPLE-RS-01`'s `stock_queue` totalled
**540** units against a `qty_after_transaction` of **172**. That is what *FIFO Queue vs Qty After
Transaction* exists to find, and here it was not corruption — just work not yet done.

🔴 **So "is a repost pending?" has to be part of reading any costing or ageing number**, not a
background detail. Anything the shell shows from `outstanding_amount`, a stock queue or a valuation
has to check for an unfinished `Repost Item Valuation` over that item or voucher and say so —
which is the third bullet of the negative-inventory proposal in
`docs/mockups/negative-inventory-timeline.html`, arrived at from the opposite direction.

**Draining them by hand**, which is also the recipe for a seed run that queued a few thousand:

```python
from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost
for n in frappe.get_all("Repost Item Valuation",
                        filters={"status": ("in", ("Queued", "In Progress"))}, pluck="name"):
    repost(frappe.get_doc("Repost Item Valuation", n)); frappe.db.commit()
```

Expect most to come back **Skipped** — ERPNext collapses redundant reposts over the same item and
warehouse, so 1,135 skipped against 536 completed is normal rather than a failure.

🔴 **One pass is not enough — loop until the queue is actually empty.** A drain over 363 entries left
exactly **2** behind, and they were the two that mattered: the backdated negative-inventory fixtures,
whose whole purpose is to be reposted. `Stock Reposting Settings.limit_reposting_timeslot` was off, so
no time window was blocking them; they simply were not picked up on that pass. Re-running finished
them, and the restatement was then exactly as designed — one shipment 61.00 → **55.00** (COGS −366 →
−330) and the other 15.50 → **18.00** (COGS −93 → −108, the opposite direction, because its master
rate sat below cost rather than above). **Verify by count, never by "the drain finished".**

🔴 **A repost can also fail permanently and stay failed.** One here died with `[Errno 2] No such
file or directory` in `get_reposting_data` (`stock_ledger.py:457`): reposting stores its progress as a
gzipped **File attachment**, and this sandbox had a File row whose file was gone from disk. The
valuation after that point is then simply never recalculated, and nothing retries it. Worth checking
`status='Failed'` after any bulk seed.

**Recovering one** — delete the stale attachment so it starts clean rather than trying to resume:

```python
for att in frappe.get_all("File", filters={"attached_to_doctype": "Repost Item Valuation",
                                           "attached_to_name": name}, pluck="name"):
    frappe.delete_doc("File", att, force=1, ignore_permissions=True)
frappe.get_doc("Repost Item Valuation", name).db_set("status", "Queued", update_modified=False)
```

Then repost it as above. Done here 2026-09-26 for `SAMPLE-SKU-08` (failed at 2026-06-26): completed
on the retry, and the sandbox now carries nothing queued and nothing failed.

**Avoiding them in the first place** is G14's sibling lesson and lives in
`ops/sample-data/README.md`: seed stock movements in one globally chronological order, and give every
document an **explicit `posting_time`**. Without the latter a seeded document takes its insert's
wall-clock time, and `future_sle_exists` matches at `posting_datetime >= …`, so two documents sharing
a date and a second each queue a repost for the other.

---

## G15 — Ribbons drawn to the right numbers, painted 7–12px off their rows (2026-09-29, bowtie mockup)

**Observed:** 5zorro, from a screenshot: the payment's ribbon ended between two rows. The page's own
self-check said every ribbon end was 0.00px off its row.

**Expected:** each ribbon's centre on the centre of the row it starts or ends at — and a check that
can tell when it is not.

**Architecture / fix:** two causes, each invisible to arithmetic.

1. **An SVG whose `height` grows without its `viewBox`** keeps its old coordinate box, and the
   browser centres that box in the taller element (`preserveAspectRatio` default `xMidYMid meet`):
   everything paints lower by half the growth. Keep `viewBox` equal to the element's size, and set
   `preserveAspectRatio="xMinYMin meet"` so a mismatch shows at the top instead of sliding.
2. **A `<table>` row's height is a minimum, not a size.** A header border, a taller fallback font or
   a ⚠ glyph stretched rows from 16px to 16.5px and up, and every row below slid. Rows that something
   else is drawn *to* must be fixed-height strips that clip (`display: grid; height: 16px;
   overflow: hidden`), and the card's own border is part of the arithmetic.

**Dogfood:** the check compared the numbers written into each path with the rows — they agreed while
the picture did not (G8 again). Measure **painted** points:
`path.getPointAtLength(…).matrixTransform(path.getScreenCTM())` against `getBoundingClientRect()`
of the row, and prove the check by putting the bug back (it then read 11.90px, matching the
screenshot). An exemption in the check (braced bundles) hid a 1.5px error the same way — no
exemptions. The bowtie build (plan 2026-10-03 stage 5) carries both rules.


## G16 — A backdated invoice: ERPNext's own form and save disagree on the due date (2026-10-10)

**Observed:** with the Bill's posting date a stamp (today) and a Supplier Invoice Date in July, the
Doc Bill's save was refused: "Due Date cannot be after 08-27-2026". Vanilla saved the same bill.

**Cause:** `get_payment_term_details` (accounts_controller.py) counts from `bill_date or
posting_date`, then **pulls any due date earlier than the posting date up to it**. The form-side
call (`transaction.js payment_terms_template`) passes the real posting date → due = today. The save
path (`set_payment_schedule`) passes `bill_date or posting_date` *as* the posting date → no pull,
and `validate_due_date_with_template` refuses anything after invoice date + terms. The Doc Bill
re-ran the form-side call after the Invoice date; hidden while posting = invoice date.

**Fix:** the bridge fetches the schedule the save's way (`fetchScheduleLikeSave`) after the Invoice
date, the terms, or a vendor change. **Generalize:** when ERPNext computes the same thing on the
client and the server, they can differ — prefer the server path's arguments.

## G17 — A percentage tax row computes from a copy on each item line (2026-10-10)

**Observed:** changing a tax row's Rate % from 6 to 5 left its Amount at 24.00 — in Vanilla too —
until save.

**Cause:** v16 stamps each item line's `item_tax_rate` with the taxes table's rates when the line is
added (`get_item_tax_map`), and the client computes a % row from that copy. The server rebuilds
the copies on every save (`taxes_and_totals.update_item_tax_map`); the client refresh
(`update_item_tax_map`) only touches lines with an Item Tax Template. **Fix:** the bridge rebuilds
the copies the server's way after a Rate % edit. Also: a typed Amount on a % row is thrown away
unless the row is "Actual" — the bridge switches it, mirroring Vanilla's editable-field rule.

## G18 — Lost focus: where Tab goes next (2026-10-11)

When focus leaves a box, the next Tab depends on how it left. Measured in the Doc Bill (Chromium):

| How focus was lost | Next Tab goes to |
|---|---|
| Blur — the box still exists | the box after it (Qty → Cost): Chromium keeps its "sequential focus navigation starting point" on the blurred box |
| The repaint replaced that box (the line was rebuilt) | the first tabbable in the container — line 1's Item Code, from any line |

So a repaint that rebuilds the clerk's line must put focus back by row + field (`restoreBillFocus`),
or Tab sends them to the top of the table. And any focus move the shell makes *after waiting* on
ERPNext must first check the clerk has not moved (`user-move-guard.js`): a late move pulled a clerk
from Qty back to Description (focus incident 2026-10-11). The new bill's opening Vendor focus had
50/200/500 ms retries from a July debugging pass — removed; now one try and one after layout.
A focus-skipping path must hand the clerk's place back: a repaint that skipped its restore because
"Vendor will take focus" lost the clerk when Vendor declined. Skip the restore only when the other
focus actually happened (`vendorFocused` in the Bill's `paint`).


## G19 — `frappe.db.get_list` never settles when the server raises (2026-10-21)

Run inside the ERPNext page (the shell's `erpEval`), `frappe.db.get_list` (and the other
`frappe.db.*` helpers built on `frappe.call` with a callback) returns a promise that is **never
resolved or rejected** when the server answers with an error — asking for a field that does not
exist hung past 8 s, while the same request through `frappe.xcall` rejected at once (probe,
2026-10-21). An `erpEval` awaiting it never returns, and the shell's later calls wait behind it
until the page reloads — the likely mechanism of review 10-19 **R5b-4**. New ERP-page code uses
`frappe.xcall` (warm pick lists do, plan 2026-10-21). R5b-4 turned out to have another cause (G20),
so the sweep of the existing `frappe.db.*` calls was dropped, but that was judged as Administrator,
who is never refused. 🔴 **A clerk is refused all the time** (no read on a doctype), and then the same
hang happens. The restricted probe user proved it (review 10-19 R7-4, a Purchase User and Sales
Orders), so the sweep is back as **R7-5**. Read a refused `xcall`'s reason with `reasonFrom` (G22):
it rejects with nothing.

**Swept 2026-10-25 (R7-5).** No ERPNext-page script calls `frappe.db.*` any more
(`tests/erp-no-frappe-db.test.js` keeps it so). Use `xList` / `xValue` (`ERP_LIST_JS` in
`src/erp-refusal-reason.js`, a copy in the bridge): the same server methods and defaults as
`frappe.db.get_list` / `get_value`, through `frappe.xcall`. Two more things the sweep found, both
proven as a restricted user (`leaves-records/r7-5-clerk-refusals`):
- **A child table's rows need their parent named** (`parent_doctype: "Purchase Order"` for
  Purchase Order Item, `"Payment Entry"` for Payment Entry Reference). Without it ERPNext refuses
  anyone but Administrator ("Insufficient Permission for Purchase Invoice Item"), so the Bill's
  PO-line lookup would have hung for every clerk.
- **`frappe.db.get_all` does not exist in v16's `db.js`**: the Bill's applied-payments list called
  it, always threw, and showed a payment of several bills at its whole amount on each.
- `frappe.db.get_list` defaults `limit` to 20 even when `limit_page_length` is passed; two Account
  lookups were capped at 20 that way.
- 🔴 **A failure that used to hang now fails at once — so it must not read as "empty".** Code that
  relied on the hang (a timeout the caller retried) turns into code that treats a refusal as "no
  rows". The Bill's background loading did: its PO-line limits, PO titles and receipt refs returned
  empty on a refusal, the retry loop counted them loaded, and the Bill sat at "line limit still
  loading" with no retry (dogfood R6c-2 caught it). Those loaders now return `{ failed }` and the
  loop keeps the slice pending. When sweeping a call off `frappe.db`, check what its callers do
  with the error, not just that it settles.

## G20 — `frappe.after_ajax` calls back at once when nothing is in flight (2026-10-21)

`frappe.after_ajax(fn)` (`frappe/public/js/frappe/request.js`, v16.31.0) runs `fn` **synchronously**
when `frappe.request.ajax_count` is 0. A "wait until ERPNext is quiet" helper that resolves there,
inside `while (…) { …; await helper(); }`, never yields to the event loop: the loop spins on
microtasks until its deadline, the page freezes (an `executeJavaScript` of `document.title` got no
answer), and ERPNext's own replies cannot land — so the condition being waited for never comes
true and the wait always runs to its deadline. The Bill's vendor write did exactly this for
seven weeks (`afterAjaxQuiet` in `electron/erp-form-bridge-page.js`, plan 2026-10-21 D3): ~12 s
frozen per vendor, ~38 s under chaos, and a timing entry logged per spin. Every wait inside the
ERPNext page must yield a real turn (`setTimeout`), even when it is already quiet.

## G21 — Building another doctype's document in the ERPNext page needs its meta first (2026-10-22)

**Observed:** *Assign…* on a Bill line to Sales Orders never made its bridge Purchase Order —
"Cannot read properties of null (reading 'options')". No test had run that path to the end.

**Cause:** `frappe.model.get_new_doc("Purchase Order")` / `frappe.model.add_child(po, "items")` read
the doctype's meta from the page's cache, and the page was showing a Bill, so Purchase Order's meta
had never loaded. **Fix:** `await frappe.model.with_doctype("<Doctype>")` before building, as opening
that form would. Or build a plain `{ doctype, items: [...] }` and let `frappe.client.insert` fill it
server-side.

**Related, same day:** `frappe.xcall` sends its args as form text, so a whitelisted method that does
arithmetic on a typed-as-number argument gets a string (`get_payment_entry(party_amount=600)` →
"bad operand type for abs(): 'str'"). Set the number on the returned document instead. And a list
that asks for a field the doctype does not have is refused — with `frappe.db.get_list` that refusal
never comes back (G19): Assign's Project step hung on `customer_name`, which Project lacks on v16.

## G22 — `frappe.xcall` rejects with nothing when ERPNext refuses (2026-10-23)

`frappe.xcall` is `frappe.call` with `error: (r) => reject(r?.message)` — and a refused call's reply
has no `message`: ERPNext puts the reason in `_server_messages` (what it raised, JSON in JSON) and
`exc` (the traceback). So `catch (e)` around an xcall gets `undefined`, and every page script that
built its reason from `e` showed its fallback: "Payment Entry request failed." for a bill refused
because its Purchase Order was On Hold (found by the dogfood check, DC-1). Read the reason from
`frappe.last_response` — the reply that just failed — but only when it did refuse (a raised / red
message or a traceback); a call that died with no reply leaves an earlier, successful reply there.
One reader for all of it: `src/erp-refusal-reason.js` (`${PE_REASON_FROM_JS}` in a page script),
tested; ERPNext's messages carry HTML (`<br><strong>…`) and often no full stop (`endSentence`).

**Related:** a Purchase Order is not a period-closing doctype — an Accounting Period never refuses
one. ERPNext refuses a PO's *submit* (not its save) through an Authorization Rule; a disabled
account refuses only when ledger entries are made (submit and cancel of the copy's GL), never the
save; a bill whose Purchase Order is On Hold or Closed cannot be cancelled
(`check_for_on_hold_or_closed_status` in `on_cancel`), and the PO server itself never checks its
Sales Order's hold.

## G23 — The ERPNext page never asks "leave?" for typing done in the Doc page (2026-10-24)

Frappe's form adds a `beforeunload` listener the moment it goes dirty (`form.js` `dirty()`; a new
document is dirty from the start), and the shell answers that listener in `onErpWillPreventUnload`.
But Chromium runs a page's "leave?" prompt **only if a person has interacted with that page**
(sticky user activation, `navigator.userActivation.hasBeenActive`). A clerk who types a Bill in the
Doc page never touches the ERPNext page, so its listener is skipped silently and a reload throws the
typing away without `will-prevent-unload` ever firing. Proven by `tests/probes/nav-reload-gate`:
dirty form, listener on, no ask at 4 s or at 22 s after the open; the same reload after one user
gesture in the ERPNext page (`executeJavaScript(code, true)`) raised the prompt and the shell asked.
So the shell's own unsaved check (`dirtyState.userEdited`) is the only thing that can guard Doc-page
typing — Frappe's listener guards only what was typed in Vanilla. It is why R2-1's reload asked
nothing, and DC-4's cause (plan 2026-10-24).

**Related, probes:** Playwright auto-answers a page's `beforeunload` prompt and throws "No dialog is
showing" when Electron answered it first; a `page.on("dialog")` listener of the probe's own turns
that off. A real `dialog.showMessageBoxSync` would block the probe — stub it in main
(`app.evaluate(({ dialog }) => …)`).

---

## ERPNext behaviour verified from source (read the bullet you need; don't re-derive)

Facts about the ERPNext / Frappe this shell drives, read from the source at the sandbox's tags
(ERPNext v16.32.1, Frappe v16.31.0) and proven on the sandbox. Each one cost real time to
establish. Moved here from the local agent notes 2026-10-25 (review 10-19 R15-1), so an agent
off this machine has them too. `HANDOFF.md` § *ERP site settings this shell reads* is the table of
the settings among them.

- **List filters ride in the address** (2026-09-26, frappe `router.js` `set_route_options_from_url`
  → `list_view.js` `parse_filters_from_route_options`): `/app/purchase-invoice?supplier=X&bill_no=Y`
  opens the list already filtered and replaces its saved filters. A bare list address instead
  **restores the last saved filters** (seen live: a leftover `?name=…&supplier=…`). v16 shows
  `/app/…` in the address bar as `/desk/…` — assert either. `/<doctype>/view/<kind>` is a list view,
  never a record (`routeInfo` now agrees).

Read from source and from this instance. Each of these cost real time to establish.

- **Amend is client-side.** There is no server-side amend call: `frappe.client.cancel`, then
  `frappe.model.copy_doc(doc, 1)` with `amended_from` set, then insert — exactly what
  `form.js::amend_doc` does. 🔴 `from_amend` **keeps** `no_copy` fields rather than stripping them,
  and the copy carries a temporary local name that `set_new_name` discards. A document may be
  amended **once** (`frappe.client.is_document_amended`), and amending renames it to `<name>-1`,
  so the ERP id changes while the vendor ref and logbook number do not — that is OI-170's reason.
- 🔴 **Amending a v16 invoice with `Tax Withholding Entry` rows fails from code, not from Desk.**
  Those rows link back to the invoice itself, and a bare `copy_doc(doc, 1)` + insert keeps them, so
  `_validate_links` rejects the insert before anything could rebuild them. **Vanilla's Amend button
  works** — the form's `onload` empties the table on any new document (`purchase_invoice.js:706`;
  Sales Invoice and Payment Entry have the same clear), and ERPNext rebuilds the rows on save.
  5zorro confirmed it by hand 2026-09-24 on ACC-PINV-2026-00243 → `-1`, which has a withholding
  row. So the shell's drop-the-self-links fix is copying what the form does; it is **not** an
  upstream bug, and `erpnext-issue-draft.md` (repo root, untracked) must **not** be filed. The
  earlier claim that Vanilla fails too was inferred from the code path and never clicked. Both the
  code comment (`src/doc-actions.js`) and the plan's P1 finding 2 are corrected (2026-09-26).
  🔴 Testing withholding needs a supplier **with** a Tax Withholding Category (SAMPLE Vendor 01/02
  here) — the tickbox alone creates no rows, and no rows means nothing to test.
- **Cancelling an invoice detaches its payments here** — `unlink_payment_on_cancellation_of_invoice`
  is on, so payments survive unallocated and the invoice's outstanding goes back up. They are not
  re-applied to the amendment automatically.
- 🔴 **And ERPNext keeps no record of what the payment paid.** `unlink_ref_doc_from_payment_entries`
  (`accounts/utils.py:1025`) zeroes then *deletes* the Payment Entry Reference row, blanks
  `against_voucher` on GL and Payment Ledger entries, and writes through the query builder so the
  removal is not in the document's version history either. Confirmed by querying all three on this
  sandbox. So the pairing can only be inferred, never looked up — and ERPNext's own
  `allocate_entries` infers it badly (greedy over a `posting_date` sort, blind to amendments).
  `src/payment-relink.js` proposes it from `amended_from` + an exact amount match instead, and
  hands the chosen pairing to Payment Reconciliation to post. **Payment Reconciliation is a virtual
  doctype** and is driven over HTTP with `run_doc_method` + `docs` as a JSON *string* — its own
  `load_from_db` comment says that is the intended path, and it works (proven 2026-09-26).
- 🔴 **Re-linking a payment is an update-after-submit, NOT a cancel-and-amend.**
  `reconcile_against_document`'s docstring says "Cancel PE or JV … and resubmit", but the
  implementation is `update_reference_in_payment_entry(do_not_save=True)` then `doc.save()` on a
  submitted document, followed by deleting and rebuilding its ledger entries
  (`accounts/utils.py:553`). Proven 2026-09-26: the payment kept its name and `docstatus`. So there
  is **no second amendment** to chase when a payment is put back on an amended bill.
- **The undo is `Unreconcile Payment`** — its `on_submit` calls the same
  `unlink_ref_doc_from_payment_entries` and restores outstanding, and the Payment Entry form
  carries an *UnReconcile* button. Also no amend.
  🔴 But driving it over HTTP left this sandbox with the invoice's stored `outstanding_amount` (9.00,
  Unpaid) disagreeing with its own Payment Ledger (net 0, i.e. paid), and the reconciliation tool
  then offered neither side. Repaired with
  `bench --site frontend execute erpnext.accounts.utils.update_voucher_outstanding --kwargs "{...}"`,
  which is the recipe to remember for any stale outstanding. Prefer the Desk button over the
  whitelisted `create_unreconcile_doc_for_selection` until that is understood.
- **Provenance is a Comment; the review request is an assignment. Two records, on purpose.**
  An assignment *closes*, and a closed one is invisible — so on its own it cannot answer "did a
  person type this allocation or did a rule post it?", which is what a reviewer needs afterwards
  (5zorro 2026-09-26). So every re-link also writes a permanent Comment via the whitelisted
  `frappe.desk.form.utils.add_comment`, opening with the token `Allocation source:` and then
  `AUTO-LINK` or `PERSON`. The difference it records is **blast radius**: a wrong auto-link means
  the matching rule is wrong and others may be wrong the same way; a wrong manual one stops there.
  Both paths write one, because "no comment" would otherwise mean three different things.
- **Frappe assignments are the review flag.** `frappe.desk.form.assign_to.add` / `.close` (both
  whitelisted) put a ToDo plus `_assign` on a document — an Open/Closed status, visible on the form
  in a plain browser, and no custom field, so the site's schema is untouched. The shell finds its own
  flags again by querying ToDo for the phrase `Auto-linked by the Doc shell`, which makes that
  phrase load-bearing (`relinkReviewNote` in `src/payment-relink.js`).
- 🔴 **`auto_reconcile_payments` is a gate, not an automation** — it only enables the *Process
  Payment Reconciliation* tool, whose cron processes PPR documents somebody already queued. Turning
  it on reconciles nothing by itself, and when it does run it allocates oldest-invoice-first. Left
  **off** deliberately (5zorro 2026-09-26). `HANDOFF.md` § *ERP site settings this shell reads* is
  the public table of this and the four others; all are at stock default here.
- 🔴 **Cost layers are stored on every movement, not derived.** `Stock Ledger Entry.stock_queue` is
  a Long Text holding `[[qty, rate], ...]` **as of that transaction** (`stock_ledger.py:1019`;
  classes in `erpnext/stock/valuation.py`), and `stock_value_difference` on the same row is the COGS
  it booked. A costing panel must **read** those — recomputing FIFO shell-side would be a second
  opinion that drifts the first time a backdated entry reposts. `valuation_method` is per **Item**
  (Select: `FIFO` / `Moving Average` / `LIFO` — all three exist in v16), and **Moving Average writes
  no queue at all** (`get_moving_average_values`, `:1561`) — `stock_queue` stays `[]`. Verified on
  this sandbox 2026-09-26 with the seed's three costing SKUs (buy 2 @ 50, buy 1 @ 75, sell 2): one
  unit on hand under all three, worth 75.00 / 50.00 / 58.33, and the same sale booking COGS of
  100.00 / 125.00 / 116.67. OI-177.
- 🔴 **Shipping before receiving: whether the guess is ever corrected turns on the receipt's
  posting date, nothing else.** Enabled by `Stock Settings.allow_negative_stock` **or** per item by
  `Item.allow_negative_stock` (`is_negative_stock_allowed`, `stock_ledger.py:2417`). The outgoing
  movement books COGS at a guess: `get_fallback_rate` (`:1708`) → last SLE valuation rate →
  `Item.valuation_rate` → `standard_rate` → buying Item Price, landing on **0** if none exist. The
  queue keeps a negative bin at *the rate of the last layer it consumed*, or that fallback
  (`valuation.py` `remove_stock`: `[-qty, outgoing_rate or fifo_bin[RATE]]`) — **never** a future
  receipt's rate. Then, proven live 2026-09-26 (ship 2 on Aug 1 with master rate 60, receive 3 @ 50):
  - **receipt dated *after* the sale → no repost, ever.** The sale keeps 60.00 / −120.00 permanently.
    The receipt absorbs the difference instead: 150.00 of goods moves **170.00** of value. Balance
    sheet right, margin on that sale wrong in its own period and wrong in the receipt's, silently.
  - **receipt *backdated* before the sale → `Repost Item Valuation` (Queued, async) → the sale is
    genuinely rewritten** 60.00 → 50.00, −120.00 → −100.00. Costs land in the right periods.
  So the one prompt worth building is at receipt time: *date this when the goods arrived and the
  shipment corrects itself.* 🔴 The repost is **asynchronous**, so a panel reading straight after a
  save can show a figure about to change and must say so.
  **No cutoff out of the box:** `stock_frozen_upto`, `stock_frozen_upto_days` (both bypassed by
  `stock_auth_role`) and `role_allowed_to_create_edit_back_dated_transactions` all unset here.
  **No "negative stock" report exists** — Stock Balance shows negatives as rows, Stock Ledger shows
  the cause per item, and *FIFO Queue vs Qty After Transaction* / *Stock Ledger Invariant Check* are
  the audits. Not built: OI-178, walk-through at `docs/mockups/negative-inventory-timeline.html`.
- 🔴 **A pending repost makes stored numbers read wrong, not blank.** `outstanding_amount`,
  invoice status, stock queues and valuations are all **stored** and rebuilt by
  `Repost Item Valuation`; until it runs they agree with each other and are stale together (seen
  2026-09-26: 29 AR + 31 AP invoices "unpaid" with payments allocated in full, both 0 after the queue
  drained; a queue totalling 540 units against a balance of 172). So any costing or ageing figure the
  shell shows must check for an unfinished repost over that item/voucher. Most drain as **Skipped**
  (ERPNext collapses redundant ones); one can **fail permanently** — check `status='Failed'` after a
  bulk seed. Recipe and cause in `docs/gotchas.md` G14.
- 🔴 **The negative-stock guess comes from four sources, and a Purchase Order is not one of them.**
  `get_valuation_rate` stops at the first that answers: (1) the **last SLE's `valuation_rate`** for
  that *item + warehouse*, `>= 0` and with **no date filter**; (2) `Item.valuation_rate`;
  (3) `Item.standard_rate`; (4) the buying `Item Price.price_list_rate`. Source 1 wins whenever the
  item has any movement in that warehouse, so only a **new SKU (or new warehouse)** ever reaches the
  rest — and that is the case where the guess is often **0** and the shipment books no cost at all.
  ERPNext *does* already record the PO's price: `Item.last_purchase_rate`, written by
  `update_last_purchase_rate` (`buying/utils.py:14`) on **Purchase Order** submit
  (`Buying Settings.disable_last_purchase_rate` = 0 here) — it is just not one of the four. Live:
  `SAMPLE-RS-NEG-B1` had `last_purchase_rate` 55.00, the true cost, while costing its shipment at
  `valuation_rate` 61.00. Source 4 can be made to track each PO by turning on
  `Stock Settings.update_existing_price_list_rate` (0 here; `auto_insert_price_list_rate_if_missing`
  is already 1, so `insert_item_price` creates the Standard Buying row once and never moves it —
  `SAMPLE-RS-01` is stuck at 20.00 after a year of purchases). OI-178.
- **`posting_date` has no restriction against past dates**, so backdating a payment is ordinary
  usage. Default to today; do not forbid it.
- 🔴 **Amending an amendment does not stack a suffix.** `_set_amended_name` (`naming.py:549`)
  strips the trailing counter and increments it: `…-00231-1` → `…-00231-2`, not `…-00231-1-1`. And
  the whole scheme is a site setting — with `Document Naming Settings.default_amend_naming` set to
  "Default Naming" the amendment takes a fresh series name and the next name cannot be predicted at
  all. This instance is on **Amend Counter**. `predictAmendedName` in `src/doc-actions.js` mirrors it.
- 🔴 **Cancelling is refused, harmlessly, by anything submitted that links back.**
  `check_no_back_links_exist` (`document.py:1578`) runs *after* `on_cancel` and the raise rolls the
  whole transaction back — so a refused cancel changes nothing and cannot strand a document. Each
  doctype's `ignore_linked_doctypes` (set in its own `on_cancel`) decides what is exempt; ledger
  entries are, receipts and invoices are not. This is why the shell *names* blockers and never
  enforces them.
- 🔴 **The Accounts Payable report returns rows that are not bills.** An **unallocated payment**
  comes back with a negative `outstanding` and **no due date**, which threw in the bank-calendar
  walk and silently emptied the whole Pay Outstanding board (fixed 2026-09-26). Amending a paid
  bill *creates* these, so they are routine here, not exotic.
- **An existing `payment_schedule` survives validate.** `set_payment_schedule`
  (`accounts_controller.py:2633`) only builds rows when there are none, so a `mode_of_payment`
  written onto copied rows sticks — *except* when `automatically_fetch_payment_terms` and the
  template's `allocate_payment_based_on_payment_terms` are both on and the bill came from an order,
  where it refetches the schedule wholesale. The shell reads the value back rather than trusting it.
- 🔴 **Payment schedule rows are only maintained when the Template sets
  `allocate_payment_based_on_payment_terms`.** With it off, payments never touch
  `paid_amount`/`outstanding` on the rows while the invoice's own outstanding falls. Split payment
  itself is always allowed and terms never constrain it; a schedule row needs no Payment Term at
  all (only `due_date` + `payment_amount`), rows must sum to the grand total, and **no two rows may
  share a due date**.
