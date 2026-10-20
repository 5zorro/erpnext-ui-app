# Implementation plan — 2026-10-19

**Tranche:** an **architecture review** of everything the dated plans built, 2026-07-15 → 2026-10-12.
The question is not "does it work" (dogfood answers that) but what was **missed while getting it
to work**, in three lenses:

- **S — security / stability:** what the app trusts that it should not, writes that can stop
  halfway, races, things that fail silently.
- **M — maintainability:** files too big to change safely, the same fact worked out twice, dead
  code, plans that should have been closed.
- **P — performance:** repeated server calls, work done on every keystroke, listeners and logs that
  grow without limit, pages that slow down as the books fill up.

This plan **reviews; it does not build.** A review session writes findings. A fix is a later
session (or a slice of whichever plan owns that area), except a one-line fix with its test.

**Runs alongside** plan 09-26 (dogfood of the papers continues) and 10-12 (Sales Order dashboard,
built, being dogfooded). It edits no code.

> **Status 2026-10-19:** session 1 ✅ (R14, R1, R11 — reviewed through `7611ee9`).
> Fixed with tests: R1-5, R11-1, and afterwards R1-1 and R11-2 (5zorro asked for the serious
> ones). **Still open and high: R14-1** — 5zorro's infrastructure; the steps are in museum OI-183.
> Next: session 2 (R9 + R10c + R6c).
> Code baseline was `4c10e30`. Re-sized the same day (7 sessions, not 20).

---

## How to handle cross-architecture dogfood

Same as plan 2026-10-03 § *How to handle cross-architecture dogfood*. For this plan the
"families" are the slices below, which are the coverage map's families
(`src/architecture-families.js`), split where a family is too big to read in one session.

---

## How to run one review session (read this, then only your slice)

1. **Do not read this whole plan, `HANDOFF.md`, or `docs/gotchas.md` end to end.** Read this
   section, then your slice only:
   `grep -n '^### R' docs/implementation-plan-2026-10-19.md`, then `sed -n` that slice's range.
   Each slice names the HANDOFF section and plan sections to read — read **those sections**, by
   `grep -n` + `sed -n`, nothing more. A session covers several slices — read them one at a time,
   and write each slice's findings before opening the next.
2. **Ask the slice's questions; don't read files top to bottom.** Grep for the thing the question
   is about, then read the ranges that come back. Never open `electron/main.js` or `src/bill-form-page.js`
   whole. Other large files only when the slice says so.
3. **Check a finding before writing it down.** Per the "don't match buggy code" rule: if a finding
   depends on what ERPNext does, read the ERPNext source (`~/erpnext/erpnext` at the sandbox tag —
   see the local notes) rather than trusting this repo's comments.
4. **Write findings into the slice's table** (one row each, template below). A **security** finding
   with enough detail to exploit goes in the museum (`open_items.md`, a new OI), with a one-line
   row here pointing at the OI — this file is public.
5. **Close the session:** fill *Reviewed through* for each slice (the commit you reviewed at), mark
   the session ✅ in the schedule, and stop. Do not roll into the next session's slices.

**Finding row template:**

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R1-1 | S | high / med / low | `file:line` | one sentence | one sentence | open / fixed `<sha>` / won't fix (why) |

---

## Where each area's decisions live — the plan lineage

A reviewer needs the *why* behind the code. Six plans are deleted (their durable rules were folded
into `HANDOFF.md`); read a deleted one with `git show <commit>^:<path>`, by section.

| Plan | Tranche | State | Durable rules now in | Read with |
|------|---------|-------|----------------------|-----------|
| `implementation-plan.md` (undated) | first scaffold | deleted 2026-07-16 | HANDOFF rule 1 (no undated plan) | `git show b101d7a^:docs/implementation-plan.md` |
| 07-15 | Scaffold POC + parity ladder | deleted | not named in HANDOFF's registry (check the deleting commit) | `git show 3279b53^:docs/implementation-plan-2026-07-15.md` |
| 07-18 | Doc usability + shared patterns | closed 2026-07-29 (T1–T4 MVP) | HANDOFF read order names no fold | `git show 754b53f^:docs/implementation-plan-2026-07-18.md` |
| 07-29 | Vanilla Simplified lens (OI-086) + calculator (OI-018) | deleted 2026-09-08 | HANDOFF § Simplified lens; calculator split on museum OI-018 | `git show 9972857^:docs/implementation-plan-2026-07-29.md` |
| 08-19 | Nav instrumentation + map (OI-126/127) | deleted 2026-09-04 | HANDOFF § Navigation spine | `git show 10419bf^:docs/implementation-plan-2026-08-19.md` |
| 08-30 | AP Doc skin T0–T6 | deleted 2026-09-02 | `docs/gotchas.md`; remaining OIs museum only | `git show d9d590b^:docs/implementation-plan-2026-08-30.md` |
| 09-03 | Doc Pay skin, economic batching (OI-138/161) | deleted 2026-09-08 | HANDOFF § Pay Outstanding flow; gotchas G7–G8 | `git show 5c02bb8^:docs/implementation-plan-2026-09-03.md` |
| 09-08 | Payment terms as data; the assumptions | **superseded**, still on disk | not folded yet (slice R15) | `docs/…-09-08.md` |
| 09-16 | Pay Outstanding fixes; void-and-amend | built; dogfood residuals | HANDOFF § Editing a submitted document | `docs/…-09-16.md` |
| 09-21 | Receiving scanner, phase 1 | **parked** 2026-09-25 | **not registered in HANDOFF** (its *Registration owed*) | `docs/…-09-21.md` |
| 09-26 | Nav audit, Find pages, A/R skins, DF-01/02 follow-ups, printing, Papers | built; being dogfooded | HANDOFF § Printing, invariants 6 & 8 | `docs/…-09-26.md` |
| 10-03 | The trace; the coverage map | stages 1, 2, C built; pages not | — | `docs/…-10-03.md` |
| 10-12 | Sales Order as the A/R dashboard | built | — | `docs/…-10-12.md` |

---

## `electron/main.js` — where each family lives in it

`main.js` wires every family, so most slices read a slice of it. Line numbers at `4c10e30`; they
drift, so re-find with `grep -n` on the function or channel name.

| Lines (approx.) | What |
|-----------------|------|
| 189 | `child_process` import (`spawn`, `execFile`) |
| 971–1010, 7013, 10670 | Test-only hooks (`__erpE2e`, `E2E=1`) |
| 1946–1990 | `openResolvedTarget()` / `openTargetFor()` — every nav door |
| 2697–2720 | `session.fetch` with ERP cookies; `erpEval()` |
| 2300–2980 | `executeJavaScript` into the ERP page (bridge, Simplified payload, teardown) |
| 3580 | `place()` — view layout |
| 3740–4040 | Shell views and their `webPreferences` |
| 4360 | `showFindDoc()` |
| 6912–7030 | `createWindow()`, the ERP view, `setWindowOpenHandler`, `will-navigate` |
| 7088–7370 | IPC: health, calc, diagnose, nav, focus |
| 7200, 7377, 7392, 10310 | `shell.openExternal` |
| 7415–9406 | IPC: `bill-*` (≈45 handlers) |
| 9412–10202 | IPC: Doc form (PO / IR / A/R), `so-*` |
| 10208–10365 | IPC: open / go / soft nav / submitted / history |
| 10378–10549 | IPC: Find pages |
| 10640–10670 | Shell detour |
| 10760–11100, 11237–11280, 11516 | Printing: raster window, `lp`, print IPC |
| 11484–11540 | IPC: Papers |
| 11700–11830 | IPC: payment terms, settings |
| 11954–12275 | IPC: payments, re-link, auto re-link, method change |

187 `ipcMain` handlers and 257 top-level functions in one file.

---

## The slices

Read cost = the grep-driven pass this slice needs, in listed units (bytes ÷ 4). Full =
what reading the family whole would cost, for reference. Questions are **leads to check**, not findings — several may turn out fine.

### R1 — The trust boundary: what remote content can reach (S) — read ~25k

- **Family:** `wiring` (security half). **HANDOFF:** § Invariants 1–2, 4, 6.
- **Code:** all `electron/*-preload.cjs` (small; read them whole), `main.js` 6912–7030, 3740–4040,
  the `openExternal` and `executeJavaScript` sites, 971–1010.
- **Questions:**
  1. The ERP view loads whatever the server serves — including uploaded attachments. Its preload
     exposes `window.erpUiShell` to every page in that view. List what that bridge can make the
     main process do, and whether any of it trusts a URL, path, or doc name from the page.
  2. The ERP view's `webPreferences` (≈6956) sets no `sandbox: true`, unlike every other view.
     Confirm Electron 43's default really sandboxes it, and make it explicit either way.
  3. Of 187 IPC handlers only ~10 check `event.sender`. Which handlers can a page other than their
     intended one call (every preload's `invoke` list vs the handler list)?
  4. ~25 `executeJavaScript` sites build JavaScript as strings. For each one that splices in a
     value: is it `JSON.stringify`'d, or could a doc name / user text break out of the string?
  5. `shell.openExternal` at 4 sites: does each refuse non-`http(s)` schemes (10310 does)?
     `notifyUrl` comes from a prefs file.
  6. `setWindowOpenHandler` / `will-navigate`: can the ERP page navigate the main view off the
     configured ERP base (invariant 4)?
  7. Test hooks: is everything under `__erpE2e` unreachable without `E2E=1`, and could a packaged
     build be launched with it?
- **Reviewed through:** `7611ee9` (2026-10-19, session 1).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R1-1 | S | med | `main.js` `createWindow()` — every shell view | Only the ERP view has a `will-navigate` / `setWindowOpenHandler` guard. The shell views (doc form, Home, Find, pay board, payment page, toolbar, history) have none, and none of their pages handles `drop` — so a file dropped on the Doc form navigates that view to the file, which then runs with the view's full preload bridge (saves, payments, printing). No shell page renders a server link today (checked), so a drop is the only door found. **This is also the answer to Q3:** the ~10 sender checks are enough *only while* shell views never leave their own file | An `app.on("web-contents-created")` guard (`main.js`, before `whenReady`): every page but the ERP view may only reload its own file (`isShellNavAllowed`, `src/nav-guard.js`), and every `window.open` is denied unless the ERP view's own handler replaced it. Proven in the real app with a throwaway probe: the Doc form view went to `https://example.com/` on the old file and stays put on the new; Vanilla's window handler still wins | fixed (2026-10-19, after session 1) |
| R1-2 | S | low | `main.js` `setWindowOpenHandler` (≈7017) | A `window.open` (or Ctrl+click) to an ERP address is **allowed**, which makes a real second window — against invariant 6 — and that window has no `will-navigate` guard of its own | Deny and route it through `openTargetFor()` (the nav spine), as printing already is | open — session 3 (R3, the nav spine); changes behaviour, so it goes through dogfood |
| R1-3 | S | low | `main.js` ERP view | No `will-redirect` guard: a server redirect is not a `will-navigate`, so an ERP address that redirects off the base lands the ERP view elsewhere, and `did-navigate` then injects the bridge and Simplified payload into that page | 5zorro: warn, let the clerk click through. `will-redirect` now guards like `will-navigate`; leaving ERPNext by either shows *Go back* (default) / *Open in my browser* / *Continue here* (`offBaseWarning`, `src/nav-guard.js`); non-web addresses are never opened. Every script the shell injects goes through `erpExec()`, which refuses a page that is not ERPNext. Proven live with a throwaway probe (back stays, continue goes and injects nothing, back on ERPNext the bridge returns). A **redirect** off the base was not reproduced live — no ERPNext address that does it was found — only links | fixed (2026-10-19) |
| R1-4 | S | low | no packaging config yet | Before the first release per OS: the Electron fuses that stop a shipped app being run as plain Node or opened with an inspector (`RunAsNode`, `EnableNodeCliInspectArguments`, `OnlyLoadAppFromAsar`). Without them `__erpE2e`'s `E2E=1` gate is the least of it | Add to plan 09-26 *After the dogfood papers* (release checklist) | open — release |
| R1-5 | S | — | ERP view `webPreferences` | No `sandbox: true` written; Electron ≥ 20 sandboxes it by default, so behaviour was already right | Made explicit, and `tests/view-sandbox-wiring.test.js` now fails if any view or window loses sandbox / isolation / no-Node (checked: fails on the old file) | fixed (this session) |

Checked and fine: the ERP preload exposes two messages, `erp-route-hop` checks its sender and sanitizes, `soft-peek-esc` only closes a peek; all 74 `erpEval` / `executeJavaScript` templates splice values through `JSON.stringify` or build them from numbers / booleans / constants; all four `openExternal` calls open only `http(s)` (the notify URL is filtered by `isSafeNotifyUrl` when prefs load; the feedback URL comes from env); `isAllowedErpUrl` needs `/` or `?` right after the base, so `…:8080.evil` and `…:8080@evil` fail; `__erpE2e` lives on the main process's `globalThis`, which no page can reach, and is only built under `E2E=1`. Shell pages have **no Content-Security-Policy**; escaping is by convention (`escapeHtml` / `moneyTextHtml` — spot checks on the pay board and Home were clean). Whether every `innerHTML` in the Bill and Doc form pages escapes server text is R6a / R5's question.

### R2 — `main.js` as a file: size, duplication, the long-running process (M, P) — read ~22k

- **Family:** `wiring`. **HANDOFF:** § Layers, § Extension points. **Plans:** 09-26 *What changed in
  `main.js`*, *What F2 changed*. **Gotchas:** G9, G10, G12.
- **Questions:**
  1. Draw the 187 handlers by family (the table above is a start). Which groups could move to their
     own module (`electron/ipc/bill.js` …) with no behavior change? Propose the order; don't move.
  2. Business logic that belongs in `src/` (invariant 3) — sample 10 of the largest handlers.
  3. `erpEval()` (2705): every caller's timeout. What happens to a caller when the ERP page is
     mid-reload? (gotchas: "`executeJavaScript` hangs under form ajax + chaos")
  4. Views kept alive (`WebContentsView`s per surface): how many exist after an hour of use, and
     does any get created per open rather than reused? `src/web-contents-listener-budget.js`
     exists — is every `on(...)` in `main.js` paired with a removal?
  5. Log files (`nav-debug.log`, `focus-*.log`, `nav-incidents.log`): do any grow without a cap?
- **Reviewed through:** — **Findings:** none yet.

### R3 — Navigation spine (S, M, P) — read ~25k (full ~49k)

- **Family:** `nav` (**breaking** — a change here can break every page). **HANDOFF:** § Navigation
  spine, invariant 8. **Plans:** deleted 08-19; 09-26 Part A–D, *Dogfood round 2026-09-30*,
  *Doors: peek or navigate*. **Gotchas:** G6, G9, G18.
- **Code:** `src/peek-stack.js` (558), `src/lens-context.js` (440), `nav-*`, `dirty-gate`,
  `shell-detour`, `doc-doors`; `main.js` 1946–1990, 10208–10365.
- **Questions:**
  1. Peek stack and Recent / Drafts: is there a bound on depth and on stored entries?
  2. Stale intents (G6): every timer that guards a nav — is it cleared on every exit path?
  3. Dirty gate: any door that bypasses it (cross-check `tests/peek-doors.test.js` against
     `src/doc-doors.js`)?
  4. Focus guards (`user-move-guard`, `stale-focus-guard`, `peek-return-focus`): three modules —
     do they overlap or disagree?
- **Reviewed through:** — **Findings:** none yet.

### R4 — Chrome, health, Find pages (S, P) — read ~22k

- **Families:** `chrome`, `find`. **HANDOFF:** invariant 4; § *ERP site settings this shell
  reads*. **Plans:** 09-26 *F3: live Find pages*, Part D.
- **Code:** `src/config.js`, `health*.js`, `frappe-error.js`, `erp-http-list.js`,
  `find-skin-query.js`, `find-skin-registry.js`, `find-row-menu.js`; `electron/find-doc.html`
  (637 lines — grep it); `main.js` 7088–7205, 10378–10549.
- **Questions:**
  1. Find queries: do field names and filters from the page go to `get_list` as-is, or through an
     allow-list? Can the page ask for a doctype the registry does not list?
  2. Health polling: interval, and whether polls stack when the server is slow.
  3. Find "show more": page size, and what happens at 2,000+ rows (the reselling corpus).
  4. Login / cookie handling after a server reinstall (`health.js:75` comment) — any path that
     keeps using a dead session silently?
- **Reviewed through:** — **Findings:** none yet.

### R5 — Doc-form machinery, the page (M, P) — read ~25k (family full ~131k)

- **Family:** `doc-form` (part 1). **HANDOFF:** § Extension points, invariant 7. **Plans:** 09-26
  *DF-01 follow-ups* T, *DF-02 follow-ups*.
- **Code:** `src/doc-form-page.js` (3,473 — by question only), `doc-skin-registry.js`,
  `doc-form-boot.js`, `doc-chrome.js`, `electron/doc-form.html` + fragments.
- **Questions:**
  1. Where ERP data reaches the DOM: `innerHTML` with values that came from the server (party names,
     item descriptions, remarks)? This view has a preload with IPC, so this is S as well as M.
  2. Work done on every keystroke or every `input` event: what is debounced, what is not?
  3. Resize / scroll listeners (G11): one per page, or one per table / per open?
  4. How much of `doc-form-page.js` duplicates `bill-form-page.js`? (Feeds R6a.)
- **Same session as R5b and R6a** — question 4 needs both pages in view.
- **Reviewed through:** — **Findings:** none yet.

### R5b — Doc-form machinery: tables, pickers, import (S, P) — read ~22k

- **Family:** `doc-form` (part 2).
- **Code:** `link-search.js`, `link-picker-*.js`, `item-table-*.js`, `item-col-resize.js`,
  `item-import-cleaner.js`, `item-import-ui.js`, `address-*.js`, `doc-date.js`.
- **Questions:**
  1. Item import reads pasted / uploaded content (`mammoth` for Word files, `pdfjs-dist`): is the
     converted HTML ever put into the page unescaped? Are both libraries current?
  2. Link search: debounce, cancel of the previous request, result cap.
  3. Dragged column widths live in the page's localStorage (local notes, trap 2): any bound or
     cleanup when a column is removed?
- **Reviewed through:** — **Findings:** none yet.

### R6a — Bill skin: the page file (M) — read ~25k (family full ~166k)

- **Family:** `bill-skin` (part 1). **HANDOFF:** § Extension points. **Plans:** deleted 07-15,
  07-18, 08-30; 09-26 *DF-02 follow-ups*.
- **Code:** `src/bill-form-page.js` (6,074 — structure only: its function list via
  `grep -n '^function\|^export\|^async function'`, then sample), `electron/bill-shell.fragment.html`,
  `electron/bill.html.old`.
- **Questions:**
  1. The Bill page predates the unified doc-form page. Which parts are now duplicated and could go
     through `doc-form-page.js`? List them; size the move.
  2. `electron/bill.html.old` — still referenced anywhere? If not, delete.
  3. The biggest functions in the file: which could be split pure → `src/` with tests?
- **Same session as R5 / R5b** — question 1 needs both pages in view.
- **Reviewed through:** — **Findings:** none yet.

### R6b — Bill skin: money (taxes, terms, charges) (S, M) — read ~22k

- **Family:** `bill-skin` (part 2). **Plans:** 09-08 Packets A–C, 09-26 *DF-02 follow-ups* (taxes
  calculator, exact allocation). **Gotchas:** G16, G17.
- **Code:** `bill-tax-*.js`, `bill-payment-*.js`, `bill-charge-allocate.js`,
  `bill-line-allocation.js`, `bill-due-date.js`, `src/money.js`.
- **Questions:**
  1. Every place the shell **computes** a money figure ERPNext also computes: does it round the
     same way (`money.js`), and does it re-read ERP's figure after save instead of trusting its own?
  2. Floating-point sums over many lines (bill 00011 is 1¢ off — known, left; is the cause known?).
  3. Dates: due dates and posting dates built from `new Date()` — local time or UTC, and could a
     save just after midnight land on the wrong day?
- **Reviewed through:** — **Findings:** none yet.

### R6c — Bill skin: loading and enrich (P, S) — read ~20k

- **Family:** `bill-skin` (part 3). **Gotchas:** G1. **Plans:** 09-26 *R — receive with the bill*,
  *J — just-in-time receipt*.
- **Code:** `bill-load-phase.js`, `bill-enrich-pending.js`, `bill-po-hydrate.js`,
  `bill-receive-ask.js`, `jit-*.js`; `main.js` `bill-*` handlers that fetch.
- **Questions:**
  1. Server calls per Bill open, and per line (one request per PO line?). Count them on a 20-line
     Bill.
  2. The enrich timeout (G1): what the page shows when it fires, and whether a late answer can
     overwrite newer data.
  3. Receive-with-bill / JIT receipt: two writes (receipt then bill). If the second fails, what is
     left behind, and does the clerk see it?
- **Reviewed through:** — **Findings:** none yet.

### R7 — Sources, Purchase Order, Item Receipt (S, M) — read ~21k

- **Families:** `sources`, `po-ir`. **Plans:** 10-12 S3; deleted 08-30.
- **Code:** `source-*.js`, `po-*.js`, `receipt-*.js`, `so-picker.js`.
- **Questions:**
  1. The source modal is shared by three skins: one copy of the vendor/party filter, or several?
  2. Picking sources then saving: mapper call failures — partial PO / receipt left behind?
- **Reviewed through:** — **Findings:** none yet.

### R8 — A/R skins and the Sales Order dashboard (S, M) — read ~22k

- **Families:** `ar`, `home`. **Plans:** 09-26 *Step 1 — A/R Doc skins*, *A/R skin gaps*; 10-12
  whole (3k). Newest code, least dogfooded.
- **Code:** `estimate-map.js`, `sales-*.js`, `so-create-*.js`, `so-line-*.js`,
  `receive-payment-map.js`, `home-tiles.js`, `customer-process-flow.js`, `vendor-process-flow.js`;
  `main.js` 9663–9803.
- **Questions:**
  1. Create ▾ › Purchase Order: ERPNext's `make_purchase_order` **saves** the POs itself (v16).
     Double-click, or a second click while the first is in flight — two sets of POs?
  2. The Sources column queries per line — count requests on a 30-line order.
  3. Receive Payment shares Payment Entry with Pay Bills (`layoutOnly`): any A/P assumption that
     leaks into A/R (payment direction, party type)?
- **Reviewed through:** — **Findings:** none yet.

### R9 — Editing a submitted document (S) — read ~22k

- **Family:** `edit-submitted`. **HANDOFF:** § Editing a submitted document (read it whole —
  ~3k). **Plans:** 09-16 P1 (status section only). **Local notes:** *Verified ERP behaviour* —
  amend, cancel, re-link bullets.
- **Code:** `doc-actions.js` (761), `doc-action-flow.js`, `void-amend-flow.js`,
  `mode-change-plan.js`, `payment-relink.js`; `main.js` 11954–12275.
- **Questions:**
  1. Void-and-amend is cancel, then insert. If the insert fails after the cancel succeeds, what is
     on the books, what does the clerk see, and is there a way back? (Highest-stakes write path.)
  2. Stage 2 / 3 writes and the auto re-link trigger are **unproven in situ** (09-16 residuals).
     Read them for anything a live run would surface first.
  3. Auto re-link: can it fire twice for one payment (two windows of the event, retry)?
  4. Every write here: is there a `navDebug` line on both sides (local notes: a write with no log
     line was undiagnosable once)?
- **Reviewed through:** — **Findings:** none yet.

### R10a — Pay Outstanding: the pure math (M, S) — read ~25k (family full ~172k)

- **Family:** `pay` (part 1). **HANDOFF:** § Pay Outstanding flow. **Plans:** deleted 09-03;
  09-08 Packets A–B (by section); 09-16 P2–P4. **Gotchas:** G7, G8, G13.
- **Code:** `payment-batch-economics.js` (793), `payment-date-derivation.js`,
  `payment-term-*.js`, `bank-business-days.js`, `delay-calendar.js`, `outstanding-bills.js`.
- **Questions:**
  1. Plan 09-16 P2 found "the same fact worked out twice" — were all copies removed?
  2. Dates and holidays: local vs UTC, year-end, a bank holiday falling on the run day.
  3. Rows that are not bills (unallocated payments, negative outstanding, no due date) — every
     consumer guarded, not only the one that broke the board on 2026-09-26?
- **Reviewed through:** — **Findings:** none yet.

### R10b — Pay Outstanding: the board page (P, M) — read ~25k

- **Family:** `pay` (part 2). **Gotchas:** G13 (render died silently).
- **Code:** `electron/pay-outstanding.src.html` (3,907 — by question only; never the generated
  `pay-outstanding.html`), `scripts/assemble-pay-outstanding-html.js`, `check-*.js`.
- **Questions:**
  1. With the full reselling year loaded (25 vendors, a bill a month each, plus the 60-day rotation): how many requests to draw the
     board, and does a re-render rebuild everything?
  2. One exception in a render loop blanks the board (G13): is every loop guarded now?
  3. A 3,907-line HTML page: what should be in `src/` with tests?
- **Reviewed through:** — **Findings:** none yet.

### R10c — Pay Outstanding: the write paths (S) — read ~20k

- **Family:** `pay` (part 3). **Plans:** 09-08 *Three financial write paths* (the fourth,
  `createPaymentTermDocs`, has never run live), 09-26 *D — draft payments*.
- **Code:** `payment-entry-batch.js`, `payment-drafts.js`, `payment-entry-defaults.js`; `main.js`
  11700–11830, 11954.
- **Questions:**
  1. A batch of N payments: if payment k fails, what happened to 1…k−1 and does the clerk see which?
  2. Submit clicked twice; the board refreshed mid-batch.
  3. `createPaymentTermDocs`: never run live — read it as if it were about to be.
- **Reviewed through:** — **Findings:** none yet.

### R11 — Printing and Papers (S) — read ~24k

- **Families:** `printing`, `papers`. **HANDOFF:** § Printing. **Plans:** 09-26 *Printing*,
  *Printer hardening*, *Compare pane*; 09-26 DF-02 bullets on attachments.
- **Code:** `print-service.js` (563), `print-dialog-ui.js`, `print-raster-page.js`,
  `compare-*.js`, `attachment-*.js`, `sheet-preview.js`, `zip-store.js`; `main.js` 10760–11100,
  11237–11280, 11484–11540.
- **Questions:**
  1. `lp` / SumatraPDF are started with `execFile` / `spawn`: argument arrays only, never a shell
     string? Printer names and file names come from the system and the server.
  2. ZIP and "save all": entry names come from attachment file names on the server — can a name
     like `../x` escape the chosen folder?
  3. `.html` attachments fetched through `download_file`: where are they shown, and with what
     `webPreferences`?
  4. Temp files (raster pages, print copies): removed on failure as well as success?
- **Reviewed through:** `7611ee9` (2026-10-19, session 1).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R11-1 | S | **high** | `src/compare-pane-ui.js` (both `convertToHtml` sites) | A Word paper was converted by mammoth and pasted into the Doc form page as is. Mammoth's own README: it does **no sanitising**, and links keep their targets. Papers come from outside (vendors), and that page can save, pay and print. Details: museum **OI-183** | `inertWordHtml()` (`src/compare-papers.js`): outside links lose their address, `#…` links stay; tests pin it and fail if a new conversion skips it | fixed (this session) |
| R11-2 | S | **high** (on Windows) | `main.js` `openPaper()` (≈11398) | **Open** hands *any* attachment to the operating system, whatever its type, from a temp copy. Details: museum **OI-183** | `openablePaper()` (`src/compare-papers.js`): documents only (PDF, images, Office, text, `.html`); the local copy is renamed from the checked extension; main refuses anything else and the pane's Open button is disabled with the reason. On Windows the copy (and a Download) also gets the internet-zone mark, so SmartScreen and Office's macro block apply — **not run on Windows yet** | fixed (2026-10-19, after session 1); Windows mark untested |
| R11-3 | S | low | `main.js` `paperBytes()` (≈11332) | Checks the address *starts* with `/files/` or `/private/files/` but not that it has no `..` segment, so `/files/../api/method/…` would be fetched with the clerk's session. The addresses come from ERPNext's own File records today | `isErpFilePath()` (`src/compare-papers.js`) refuses `..`, `.`, encoded `%2e%2e` and backslashes | fixed (2026-10-19) |
| R11-4 | P | low | `paperBytes()` | `MAX_PAPER_BYTES` (25 MB) is checked after the whole file is in memory | `content-length` checked before the body is read; the after-check stays | fixed (2026-10-19) |
| R11-5 | S / P | low | `openPaper()`; `savePdfsEach()` | Every **Open** leaves a copy in the temp folder that is never removed. "One PDF per document" overwrites a same-named file in the chosen folder without asking, and two documents whose names clean to the same file name overwrite each other | Startup sweep of `erpnext-ui-paper-*` / `erpnext-ui-print-*` over a day old (`isStaleTempCopy`); "one PDF per document" numbers a clashing name (`freeFileName`) instead of overwriting | fixed (2026-10-19) |
| R11-6 | S | low | `main.js` `printerPaper()` (Windows) | The printer name is spliced into a PowerShell command in single quotes with `'` doubled — but PowerShell also treats curly quotes (‘ ’ ‚ ‛) as single quotes. Printer names are set by the computer's admin, so low | Pass the name through an environment variable (`$env:P`) instead of the command text | open — before the first Windows release (cannot be tested here) |

**Also fixed 2026-10-19 (5zorro asked about disguised names):** a right-to-left override (U+202E)
makes `invoice‮fdp.exe` *display* as `invoiceexe.pdf`. Open was already safe (it reads the real last
extension), but Download saved under the disguised name and the pane showed it. Every name shown or
saved now goes through `plainFileName()` (`src/zip-store.js`: invisible format and control
characters dropped, space runs collapsed) — attachment rows, the Papers pane, Open, Download, ZIP
entries, saved PDFs. Look-alike letters (`.еxe` with a Cyrillic е) already fail Open's ASCII
extension check.

Checked and fine: `lp` / SumatraPDF / `lpoptions` run as argument arrays (`execFile`, no shell); `pdfFileName` and `uniqueZipNames` strip path separators (and leading dots), so nothing in a ZIP or a saved PDF can land outside the chosen folder; the print temp copy is removed 30 s after `lp` returns, whether it succeeded or failed, and the raster worker is destroyed in a `finally`; the raster window has no preload and is sandboxed; pdf.js is 6.3 (past the 2024 font-eval hole); sheet previews escape every cell. **Q3:** a `.html` attachment comes through `download_file` as bytes only; the pane shows it as "can't show" plus **Open**, which is R11-2.

### R12 — Simplified lens (S, M) — read ~20k

- **Family:** `simplified`. **HANDOFF:** § Simplified lens. **Plans:** deleted 07-29.
  **Gotchas:** G2–G4.
- **Code:** `assume-applier-payload.js` (1,057 — injected into Vanilla's page),
  `assume-core.js`, `simplified-seed-*.js`; `main.js` 2930–2980.
- **Questions:**
  1. The payload runs inside ERPNext's page: does it survive an ERPNext upgrade gracefully (fails
     closed, shows Vanilla) or break the form?
  2. Teardown: everything the payload adds (listeners, observers, styles) removed on lens switch?
  3. The generated seed file (`npm run seeds:simplified`): is `--check` in `npm test`?
- **Reviewed through:** — **Findings:** none yet.

### R13 — Calculator, trace, dev tools (S, M) — read ~24k

- **Families:** `calc`, `trace`, `dev`. **Plans:** 10-03 (whole, 5k). **Gotchas:** G15.
- **Code:** `calc/calc-engine.js` (637), `calc/attach-field-calc.js`, `money.js`, `trace-*.js`,
  `payment-timeline.js`, `erp-chaos-lag.js`.
- **Questions:**
  1. The calculator parses typed expressions: hand-written parser, never `eval` / `Function`?
  2. Trace readers: proven read-only by `ops/trace/probe-trace-queries.js` — does that run anywhere
     automatically, or only by hand?
  3. Chaos lag: can it ever be on in a normal `npm start`?
- **Reviewed through:** — **Findings:** none yet.

### R14 — Things that touch the network or the database outside the app (S) — read ~15k

- **Families:** `receiving` (parked), `sample-data`, ops scripts. **Plans:** 09-21 *P2 — the secure
  address*, *What the proxy does and does not add*, *Resuming after the pause*.
- **Code:** `ops/receiving-proxy/` (`Caddyfile`, `compose.yml`), `pwa/receiving/sw.js`,
  `src/sample-data/sandbox-guard.js`, `ops/sample-data/` runner, `ops/erp-host/`, `ops/trace/`.
- **Questions:**
  1. The receiving proxy **comes up whenever Docker Desktop runs** (restart `unless-stopped`) even
     though the tranche is parked. What does it expose, to which network, and should it stay on?
  2. `sandbox-guard.js`: could the 15-minute seed ever run against a site that is not the sandbox?
     What does it actually check?
  3. Scripts that carry the sandbox DB root password — sandbox only, and nowhere a real site could
     inherit it?
- **Do first** — the most exposed.
- **Reviewed through:** `7611ee9` (2026-10-19, session 1).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R14-1 | S | **high** | `ops/receiving-proxy/compose.yml` ports; frappe_docker's 8080 | ERPNext's login is reachable from the Wi-Fi on two ports — frappe_docker's own (plan 09-21 *Waiting on* #8, open since 09-24) and the parked proxy's, which restarts with Docker. The 09-28 reinstall made #8 worse. Details: museum **OI-183** | 5zorro's infrastructure: stop the proxy while the scanner is parked, then #8's own fixes | open — 5zorro |
| R14-2 | M | low | `src/sample-data/sandbox-guard.js:1-3` | Says it is the guard's single source for the runner, but only tests call it. The guards that run are two untested copies: `run-seed.sh` (preflight) and `seed_corpus.py` `_assert_sandbox` (re-checked inside every write — the one that matters) | Comment now says the module is the rule and names the two mirrors that run | fixed (2026-10-19) |
| R14-3 | S | low | `seed_corpus.py` `_assert_sandbox` | The site half of the check admits `frontend`, which is frappe_docker's default name for *every* site, so the guard rests on the company name containing "sandbox". Safe today (the runner can only reach this machine's container, and the company is `ui-app sandbox erpnext`) | Said in the same comment: enough only while the runner reaches nothing but this machine's container | fixed (comment, 2026-10-19) |
| R14-4 | S | low | `ops/sample-data/run-seed.sh` purge banner | The 🔴 purge banner names one company, but `purge_ap()` deletes AP documents for **every** company that looks like a sandbox | Banner now says every sandbox company on the site; `purge_ap()` already prints each one | fixed (2026-10-19) |
| R14-5 | S | low | `ops/trace/export-trace-fixture.js:26` | Carries the DB root password as a literal. It is frappe_docker's default, the DB port is bound to `127.0.0.1`, and the call is an argument array (no shell) — so no exposure, but it breaks the day the password changes | Read it from an env variable, defaulting to today's value | won't fix (dev tool, local only; 5zorro does not mind the sandbox password once it is this-PC-only) |

Checked and fine: the proxy's Caddyfile (scanner files static, `.js` only from `lib/`, CSP + `frame-ancestors 'none'`, no path climbing; `:8081` hands out only the public CA certificate); `pwa/receiving/sw.js` caches same-origin GETs under its own scope and skips `/api/`; the trace exporter refuses the live DB by name.

### R15 — The process documents themselves (M) — read ~8k

- **Not a code family.** This is the review of the plans and handoff files, because they are what
  every session pays for in context.
- **Questions (checks, mostly yes/no):**
  1. The local notes file is loaded into **every** session, most of it the *Active plan* history.
     What can move into the plans it summarizes, leaving a 10-line pointer list? (Cheapest context
     win in the project.)
  2. Plan 09-08 is superseded; are its last two items (C2 panel, C6 second launch point) shipped
     under 09-16 P3/P4? If so: fold, delete (saves 26k for anyone who opens it).
  3. Plan 09-16: everything built; what stops closeout besides the dogfood residuals?
  4. Plan 09-21: *Registration owed* in HANDOFF — still owed.
  4b. HANDOFF's *Read order* still calls 09-16 "the active plan", and its closed-plan registry has
     no fold named for 07-15 / 07-18 — bring both up to date.
  5. Plan 09-26 at 24k: which sections are done and could fold into HANDOFF now?
- **Do last**, after the code slices, so it can also fold this plan's own conclusions.
- **Reviewed through:** — **Findings:** none yet.

---

## Session schedule

Grouped by **what the reviewer needs in view at once**, ordered by risk: what is exposed or writes
money first, structure later.

| # | Slices | Listed | Don't add | Why together | Done |
|---|--------|--------|-----------|--------------|------|
| 1 ✅ | R14 + R1 + R11 | ~64k | anything | everything remote content, the network or a spawned process can reach | done |
| 2 | R9 + R10c + R6c | ~62k | R8 (would make ~84k listed) | every multi-step write: what is left behind when step 2 fails | |
| 3 | R2 + R3 + R4 | ~69k | R1 (already done; `main.js` again) | `main.js` structure, the nav spine it wires, the toolbar / Find on top | |
| 4 | R5 + R5b + R6a | ~72k | any other R6 | the shared form page and the Bill page side by side — the duplication question | |
| 5 | R6b + R10a + R10b | ~72k | anything | all the money math and dates, and the board that shows it | |
| 6 | R7 + R8 + R12 | ~63k | R13 (would make ~87k listed) | the remaining skins and the lens injected into Vanilla | |
| 7 | R13 + R15 | ~32k | — | small tools, then fold everything and close this plan | |

Rules that fall out of the numbers:

- **Three slices per session, four only if all are under ~20k listed.**
- The ~25k-per-slice sizing still holds on its own: the slices are not bigger because the window
  is, only more of them fit.

---

## After the first pass — making review part of every session's end

The step 5zorro wants added to the workflow: **before a session ends, or before closing a tranche,
review what changed since the last review, not the whole app.**

1. `git log --oneline <last reviewed sha>..HEAD` — what landed.
2. `npm run dogfood:for-change <last reviewed sha>` — which families it touched (the coverage
   map already does this).
3. Review only those slices, and only the diff: `git diff <sha>..HEAD -- <the slice's paths>`.
   The read cost is the size of the diff, so this usually fits in one session alongside the
   handoff updates.
4. Record findings in that slice's table here, and move its *Reviewed through* forward.

When this plan closes (R15), move the slice table and the *Reviewed through* column into
`HANDOFF.md` so the incremental review outlives the plan.

---

## Open questions for 5zorro

1. Fix in the same session when a finding is a one-liner with a test, or always a separate
   session? (Default here: one-liners in place, everything else later.)
2. Should a high-severity security finding stop dogfood of that area until it is fixed?

## Dogfood residuals

None — this tranche changes no behavior. Fixes that come out of it get their own rows in the plan
that owns the area.

## Validate

```bash
cd ~/erpnext-ui-app && npm test
```
