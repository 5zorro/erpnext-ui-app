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
| **GET `/api/resource/Purchase Order Item?filters=…`** | **417** / permission quirks — **child doctypes are a bad list target**. |
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

## Template (append G6+)

```markdown
### Gn — Short title (OI-xxx, date)

**Observed:** …
**Expected:** …
**Architecture / fix:** …
**Dogfood:** …
```
