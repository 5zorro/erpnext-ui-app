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

> **Status 2026-10-19:** session 1 ✅ (R14, R1, R11). Then, at 5zorro's request,
> every code finding of it was fixed with tests except R1-2 (session 3), R1-4 / R11-6 (release
> checklist in plan 09-26) and R14-5 (won't fix); R1-1 and R1-3 were proven in the real app. The
> fixes themselves were then reviewed (the *After the first pass* step) — two gaps found and fixed
> (R1-6, R11-7). The durable rules are HANDOFF invariant 9. **Still open and high: R14-1** —
> 5zorro's infrastructure (stop the proxy; bind 8080 to `127.0.0.1` in `~/erpnext/frappe_docker/pwd-custom.yml`), museum
> OI-183. **Session 2 ✅** (R9, R10c, R6c): no high findings; all 11 fixed 2026-10-20 with tests
> (`tests/write-path-wiring.test.js` pins the main.js half), and the batch method change now stops at
> the first refusal with per-bill chips and Try again. The fixes were reviewed before the session ended
> (two more found and fixed: R10c-4, R6c-5). Not proven live: see *Dogfood residuals*. Session 2 plus
> its fixes and the OI-184 discussion ended.
> **Session 3 ✅ 2026-10-20** (R2, R3, R4): 10 findings, all open — two medium. **R2-1**: a script
> in the ERP page never returns if that page reloads or crashes, so a button can spin forever and a
> document's "already running" guard holds until restart. **R2-2**: assigning a Bill line to Sales
> Orders makes and submits a Purchase Order and hides it when that fails. Also R2-4, the Bill and
> doc-form handlers are copies, which comes before any split of `main.js` (R2-5 gives the order).
> R4-1 is 5zorro's call: the login check keeps the session from ever idling out.
> **Session 3's fixes ✅ 2026-10-20** (`5e9fb6a`): all but R2-5 (the file split, its own session).
> `tests/review-session3-wiring.test.js` pins them (20 of 22 fail on the old code). R2-1 proven in
> the app; Bill smoke specs pass. Find and A/R specs fail the same way before and after — they need
> the SAMPLE parties the blank sandbox does not have. Session 3 ended.
> **The fixes were reviewed** before the session ended (*After the first pass*): one gap, fixed — with
> no timer behind the login check, a check asked for while one was out (the load right after
> logging in) shared the earlier, possibly stale answer and could leave *Log in* showing; it now
> runs once more after. Session Expiry itself is ERPNext's setting: recommended `05:00` or shorter
> (HANDOFF's site-settings table), never set by the shell.
> **Session 4 ✅ 2026-10-20** (R5, R5b, R6a): 6 findings, all open, none high. Two are medium and
> S/P: **R5b-1**, a link field can commit an option from the *previous* search when the clerk
> Tabs or presses Enter before the latest answer is back (no stale-answer check, the old list is
> kept). **R5-1**: every repaint adds three page-wide listeners per link cell that are never
> removed, all day. **R6a-1** measures the Bill / doc-form duplication (1,295 identical lines in
> 55 same-named functions) and gives a three-step order for sharing it. **R6a-3**:
> `electron/bill.html.old` is dead, and deleting it is 5zorro's call (untracked).
> Same day, 5zorro's answers: R5-1, R5b-2 and R6a-3 **fixed** with tests and proven in the app;
> R6a-1 / R6a-2 agreed (own sessions); R5b-1 needs the read-back in its row first.
> **The fixes were reviewed 2026-10-21** (*After the first pass*): two gaps, fixed — a dropdown
> re-opened by each search was added to the open set again each time (now one entry per picker),
> and an import call that *throws* rather than refuses skipped the new message and repaint (now the
> same stop). Re-proven in the app. Then the **test-run log** was built (§ *Test-run log*,
> `ebe5a63`) and reviewed the same day: a Ctrl+C now logs the run as aborted instead of nothing.
> Smoke: `scaffold-peek-return-focus` fails 5 Sales Order / Customer tests with or without the
> fixes (6 on the old code): the blank sandbox has no sample parties.
> **R5b-1 fixed 2026-10-21** after 5zorro's read-back (choice "a": a held Tab does what a slow
> Tab would) and proven in the app on a Bill and a PO, old code failing the same probe. The probe
> found two older bugs, both open: **R5b-3** (an item typed just after the vendor is set loses its
> typing) and **R5b-4** (an unknown vendor + fast Tab leaves every ERP call waiting until reload).
> 5zorro's warm-list idea (cached pick lists, refresh button) is a museum open item, to design
> before building; the picker's "matches for this text" is where it would plug in.
> Next: R5b-4, then session 5 (R6b + R10a + R10b).
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
- **Reviewed through:** `7611ee9` (session 1), and the fixes after it through the commit that adds this line (2026-10-19 review of the fixes).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R1-1 | S | med | `main.js` `createWindow()` — every shell view | Only the ERP view has a `will-navigate` / `setWindowOpenHandler` guard. The shell views (doc form, Home, Find, pay board, payment page, toolbar, history) have none, and none of their pages handles `drop` — so a file dropped on the Doc form navigates that view to the file, which then runs with the view's full preload bridge (saves, payments, printing). No shell page renders a server link today (checked), so a drop is the only door found. **This is also the answer to Q3:** the ~10 sender checks are enough *only while* shell views never leave their own file | An `app.on("web-contents-created")` guard (`main.js`, before `whenReady`): every page but the ERP view may only reload its own file (`isShellNavAllowed`, `src/nav-guard.js`), and every `window.open` is denied unless the ERP view's own handler replaced it. Proven in the real app with a throwaway probe: the Doc form view went to `https://example.com/` on the old file and stays put on the new; Vanilla's window handler still wins | fixed (2026-10-19, after session 1) |
| R1-2 | S | low | `main.js` `setWindowOpenHandler` (≈7017) | A `window.open` (or Ctrl+click) to an ERP address is **allowed**, which makes a real second window — against invariant 6 — and that window has no `will-navigate` guard of its own | Deny and route it through `openTargetFor()` (the nav spine), as printing already is | open — session 3 (R3, the nav spine); changes behaviour, so it goes through dogfood |
| R1-3 | S | low | `main.js` ERP view | No `will-redirect` guard: a server redirect is not a `will-navigate`, so an ERP address that redirects off the base lands the ERP view elsewhere, and `did-navigate` then injects the bridge and Simplified payload into that page | 5zorro: warn, let the clerk click through. `will-redirect` now guards like `will-navigate`; leaving ERPNext by either shows *Go back* (default) / *Open in my browser* / *Continue here* (`offBaseWarning`, `src/nav-guard.js`); non-web addresses are never opened. Every script the shell injects goes through `erpExec()`, which refuses a page that is not ERPNext. Proven live with a throwaway probe (back stays, continue goes and injects nothing, back on ERPNext the bridge returns). A **redirect** off the base was not reproduced live — no ERPNext address that does it was found — only links | fixed (2026-10-19) |
| R1-4 | S | low | no packaging config yet | Before the first release per OS: the Electron fuses that stop a shipped app being run as plain Node or opened with an inspector (`RunAsNode`, `EnableNodeCliInspectArguments`, `OnlyLoadAppFromAsar`). Without them `__erpE2e`'s `E2E=1` gate is the least of it | Add to plan 09-26 *After the dogfood papers* (release checklist) | open — release |
| R1-5 | S | — | ERP view `webPreferences` | No `sandbox: true` written; Electron ≥ 20 sandboxes it by default, so behaviour was already right | Made explicit, and `tests/view-sandbox-wiring.test.js` now fails if any view or window loses sandbox / isolation / no-Node (checked: fails on the old file) | fixed (this session) |
| R1-6 | S | med | `main.js` `erp-route-hop` handler | **Introduced by R1-3's *Continue here*:** another website in the ERP view keeps the ERP preload, and its route-hop messages passed the sender check (right view) and reached the nav history | The handler also requires the view to be on ERPNext; `ensureErpFormBridge` answers no off ERPNext, so bridge calls return `{ ok: false }` rather than throw. Pinned in `tests/nav-guard.test.js` | fixed (2026-10-19, review of the fixes) |

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
- **Reviewed through:** `37cf078` (2026-10-20, session 3).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R2-1 | S | med | `main.js` `erpEval` (2768) | A script running in the ERP page **never settles** if that page navigates, reloads or crashes — proven on Electron 43 (a load and a reload still pending after 11 s; a killed renderer the same, 20 s). 63 of 72 `erpEval` callers have no time limit, so the clerk's button spins forever, R9-2's "may already be done" never shows, and the in-flight guards (`voidingDocs`, `billNewInflight`, `billSnapshotEnrichInflight`) stay held until restart. Reachable: a session expiry redirect to `/login`, a lens click that reloads the ERP view, a renderer crash | `erpEval` keeps a set of pending calls; the ERP view's `did-start-navigation` (main frame, not same-document), `render-process-gone` and `destroyed` settle them all with `{ ok: false, reason: "ERPNext page reloaded mid-script" }` — no `notRun`, so writes read it as uncertain. No blanket timeout on writes | fixed `5e9fb6a` — proven in the app: a reload 1 s into a 20 s script returns in ~1 s |
| R2-2 | S | med | `main.js` `bill-apply-line-allocation` (8635) | Assigning a Bill line to Sales Orders creates **and submits** a bridge Purchase Order in one try with no step, and **drops a failure silently**: the clerk reads "Line 1 assigned." with no PO. A refused submit leaves an unnamed draft PO. No `navDebug` either side — session 2's write-path rules (R6c-4, R10c-2) not applied here | Split insert and submit (as R6c-4), say in the status when the PO was not made, name a leftover draft, log both sides | fixed `5e9fb6a` (`bridgePoFailureText`) |
| R2-3 | M | low | `main.js` `bill-so-bridge-po` (8479) | Dead write path: the preload and `bill-doc-api-adapter.js` expose it, nothing calls it. It is a second copy of R2-2's PO rules (schedule +7 days, logbook title, customer copied from the SO) | Delete it with its preload/adapter lines; if a bridge PO is ever needed again, build the PO shape once in `src/` | fixed `5e9fb6a` (with `src/jit-po-bridge.js`, which only it used) |
| R2-4 | M | med | `main.js` 7553–10345 | ~15 `bill-*` / `doc-*` handler pairs are copies (item/tax add/set/delete, clear qty, revert-unsaved, save, mandatory, find, new, search, merge-source, open-vanilla …). They differ only in which scratch field rides along (Amount Due vs Date expected) and the receipt-only tax gate. A fix to one is easily missed in the other | One implementation per action with a per-skin scratch hook; register both channel names to it. Do this before splitting the file (R2-5) | fixed `5e9fb6a` for the real copies — tax add/set/delete, clear qty, revert-unsaved. Left as two: set-header (the skins' features differ on purpose) and the attach-file doors (`tests/peek-doors.test.js` reads each door's own body) |
| R2-5 | M | low | `main.js` as a whole | 12,744 lines, 187 handlers, 264 functions, **82 module-level `let`s** — the shared state, not the handler count, is what stops a split. Blocks by state touched: print IPC 2 vars, Papers 3, Find 2, payment settings 7, re-link/method change 9, health/incidents 15, doc-form 9, Bill 16 | Move in that order, each to `electron/ipc/<family>.js` taking a `deps` object; Bill and doc-form last, after R2-4 gives `dirtyState` and the scratch fields one owner. No behavior change per step; `tests/write-path-wiring.test.js` must follow the moved code | open — R2-4, its prerequisite, is done; the moves are a session of their own |
| R2-6 | P | low | `main.js` `navDebug` / `focusDebug` (539, 573) | The debug logs have no cap: `nav-debug.log` is 16.9 MB / 105k lines since 2026-09-07 on this machine, `focus-debug.log` 4.2 MB. Each line is an `appendFileSync` on the main process. (The in-memory rings are capped; nothing reads the files whole) | At startup, rename a log past ~5 MB to `.1` (one generation kept), so "read the last line" still works | fixed `5e9fb6a` (`debugLogNeedsRotation`; the 17 MB log here moved to `.1` on the first run) |
| R2-7 | S | low | `main.js` `bill-allocate-charge` (9002) | If setting line N's rate fails mid-loop, lines 1…N-1 keep their raised rates on the ERP form but the offset Deduct row is never added, and the reply carries no `doc` — the page does not repaint, so it shows the old rates while a Save would post a bill total too high by the part already allocated | Return `doc: dirtyState.doc, partial: true` from the loop failure too, and say which lines changed | fixed `5e9fb6a` — the raised rates are put back; `partial` only if that fails too |

**Checked and fine:** every shell view is created once in `createWindow()` and reused; the five
popups are singletons; every listener added outside `createWindow()` is removed (`did-finish-load`
waiters, focus/blur, print worker `did-navigate`). Business logic sampled in the ten largest
handlers is mostly already in `src/` (`planChargeToStockAllocation`, `splitQtyAcrossSalesOrders`,
`mode-change-plan`); the exceptions are the bridge-PO shape (R2-2/R2-3) and the injected write
scripts, which by nature live in `main.js`.

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
- **Reviewed through:** `37cf078` (2026-10-20, session 3).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R3-1 | M | low | `src/stale-focus-guard.js`; `src/doc-form-page.js` `restoreFocusAnchor` (1145, called at 2826–2897); `src/bill-form-page.js` `scheduleFocusInvoiceDateField` (3694) | Two modules answer "has the clerk moved on?" differently. `user-move-guard` counts the clerk's Tab/Enter/arrow keys and clicks; `stale-focus-guard` looks at where focus is now and treats focus on the page body as "not moved". G18 says any focus move made **after waiting** on ERPNext must ask the first; the doc-form header blur paths (after `await api.setHeader` / `setDateExpected` / `refresh`) and the Bill's Invoice-date move ask only the second. So a clerk whose box was rebuilt by the repaint, or who clicked blank space, is moved back — G18's incident on the PO/IR/A-R pages | One question for both: `shouldMoveFocusAfterWait(mark, active, anchor)` = not moved since `mark` **and** the position test; take the mark before each await. `peek-return-focus` is separate (where to land after a peek) and already takes the mark | fixed `5e9fb6a` — not by the move guard: a header `change` fires after the Tab it rode on, so a mark taken there misses it. The doc form now does what the Bill's paint does: `paint(…, { keepFocus })` takes the clerk's place at the repaint and restores only if the repaint dropped focus. The Bill's Invoice-date retries stop on a move, or once the clerk is in the date (a second `select()` would let the next key replace what they typed) |

**Checked and fine:** Recent (7 shown, capped list), Drafts (100 soft cap), peek children and
peek links (capped in `peek-stack.js`), Submitted (capped) are all bounded. The nav intent
(G6) clears on every branch, its 15 s timer is cleared on clear; `lensHijackLock` is released in
a `finally`; a pending dirty gate is superseded by the next click ("last click wins"), so a
crashed Doc renderer cannot leave it stuck. Every `navigate` door that passes
`skipDirtyGate: true` (Find, New) runs after the page's own commit gate, and the credit memo
replaces the form only from a submitted bill or an untouched draft (`planCreditMemoSource`).
The one way a nav still dies is R2-1: `gateDirtyThen` awaits a snapshot through `erpEval`, so a
reload mid-snapshot leaves that click doing nothing — fixed by R2-1's fix.

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
- **Reviewed through:** `37cf078` (2026-10-20, session 3).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R4-1 | S | low | `main.js` `tickLogin` (every `HEALTH_PING_MS` = 5 s) | The login check is a signed-in request every 5 s, and Frappe extends a session on **every** signed-in request (`sessions.py` `Session.update`, run after each response; expiry is idle time since `last_updated`). So while the app is open the site's *Session Expiry* never fires — an unattended, signed-in shell stays signed in indefinitely, which a plain Desk tab would not | **5zorro decides:** keep (convenience), or check login only when health changes, on window focus, and after a request fails, so idle time counts again | fixed `5e9fb6a` — 5zorro chose events only (2026-10-20): launch, health change, window focus, ERP load, refused read. The idle limit itself is ERPNext's `System Settings.session_expiry` (stock `170:00`); the recommendation is `05:00` or shorter, recorded in HANDOFF's site-settings table — a site setting, not app code |
| R4-2 | S | low | `electron/find-doc.html` `runQuery` (376) | If **Show more** fails (server slow, session gone), the rows already on screen are thrown away and replaced by the error, so the clerk loses the list they were reading | On an append failure keep `state.rows` and show the error on the *Show more* row | fixed `5e9fb6a` — rows kept, error on the Show more row, button reads Try again |

**Checked and fine:** Find reads go only to registry doctypes (`findListQuery` returns null
otherwise); fields, the sort and the status are all taken from the registry, and the page's typed
values only ever become `like` values on registry search fields — nothing the page sends names a
field or doctype. Saved searches and the peek are re-checked against the registry too. Reads run
as the clerk over `/api/resource`, so ERPNext's permissions apply. Typing is debounced (250 ms)
and stale answers are dropped (`querySeq`). Show more fetches 200 at a time by offset, so a
long list (the 2,700-document reselling corpus) costs one page per click, and the redraw is one
`innerHTML`. Health: ping and login check each time out at 3 s on a 5 s interval, so they cannot
stack. A dead session (the 2026-09-28 reinstall) flips the toolbar to *Log in* within 5 s, and
the next fresh login prunes Recent / Drafts / Submitted rows the server no longer has.

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
- **Reviewed through:** `05b6aec` (2026-10-20, session 4).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R5-1 | P | med | `src/link-picker-ui.js:114`, `:116`, `:320`; mounted per cell on every paint at `doc-form-page.js:1545` / `:1929`, `bill-form-page.js:1834` / `:2524` | Every link picker adds three page-wide listeners (window `resize`, window `scroll` in capture, document `click`) and never removes them. The line and tax tables are rebuilt with `innerHTML` on every paint, and a paint follows every committed edit, so each paint adds 3 listeners per link cell, and each one keeps its thrown-away row alive. The page is reloaded only when the Bill and doc-form controllers swap (`needsDocShellReload`), so a day of Bills in a row only grows: a 20-line Bill with 3 tax rows adds ~70 listeners per edit, and every scroll or click in the page runs all of them | One `resize` / `scroll` / `click` listener per page over a set of *open* dropdowns: add on show, remove on hide, and skip any whose `wrap` is no longer in the page | fixed (2026-10-20) — `src/link-picker-open-set.js`; proven in the app over the DevTools protocol: 4 repaints took the old code from 9 to 37 of each listener, the new stays at 0 (one set while a dropdown is open) |

**Checked and fine:** (1) Every server value the page writes as HTML (item codes, descriptions,
accounts, tax descriptions, Sales Order progress, the tax-default note) goes through `escapeHtml`.
Amounts go through `formatUsdAmountHtml`, which escapes each part. `sourcesCellHtml` escapes
labels, routes and names. `doc-chrome.js` and `doc-form-boot.js` build no HTML strings. The Bill
page's one unescaped interpolation (`openInformalLinkPicker`'s title) is a constant. (2) On a
keystroke the page only copies the value into the cell's resting text and filters date
characters. Line and header values commit on `change` / blur, never on `input`. (3) Column resize
binds one debounced (120 ms) window `resize` per table (`__relayoutBound`). The only leak is the
pickers' listeners (R5-1). (4) How much the Bill page duplicates: see R6a-1.

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
- **Reviewed through:** `05b6aec` (2026-10-20, session 4); then the picker and Bill changes through the commit that adds this note (2026-10-21 *After the first pass* over `cebf807..`: R5b-1, warm pick lists, D1–D3 — one gap, fixed: D3's 50 ms floor sat on all 31 `afterAjaxQuiet` callers and would have slowed every cell write; now only the two polling loops pace themselves, one-off waits yield with `setTimeout` 0. Measured: a search of a 20k-row copy ≈2 ms, the copy ≈20 MB. Smoke: scaffold-bill, -bill-taxes, -pure-wiring, -views, -typed-dates, -receive-gate all pass).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R5b-1 | S | med | `src/link-picker-ui.js` `runSearch` (223) and the `keydown` handler (277) | A link field can commit a value the clerk did not type. `runSearch` has no sequence check, so a slow answer for `ABC-1` that lands after the one for `ABC-12` replaces it. And `opts` keeps the *previous* list while a new search runs (the box says "Searching…") or waits out the 280 ms debounce. Tab or Enter then picks that list's highlighted (or first) option and writes it into the field. A fast typist (5zorro's chaos-mode dogfood) who types `ABC-12` and Tabs can get `ABC-1` on the line, with nothing said | Number each search and drop any answer that is not the latest. Clear `opts` / `hi` when the text changes. On Tab / Enter while the latest search is not back, wait for it (or pick only an exact match of the typed text) | fixed (2026-10-21) — 5zorro OK'd the read-back and chose **(a)**: a held Tab does what a slow Tab would (picks the first match), because a practised clerk knows the lists; typing or leaving the box cancels it. `linkPickerCommitPlan` (pure, tested); the picker numbers its searches and drops all but the newest, remembers which text its list is for, and replays a held key when that list is in. Assign's customer / project search drops late answers too. Proven in the app on a Bill and a PO with one search slowed to 1.5 s: typed `SAMPLE-SKU-02` + Tab over the `SAMPLE-SKU` list → SKU-02 at once (old code: SKU-01); typed `SAMPLE-SKU-0` + Tab over the `W` list → held, nothing written meanwhile, then SKU-01 and the cell moves on (old code: WIDGET A); typing `4` during the hold → nothing committed. Earlier: **5zorro 2026-10-20:** partly a feature. He types a prefix he knows has one match and Tabs straight to the Source modal faster than the latest answer comes back. A fix must keep that. Proposal to read back before building: Tab / Enter picks at once when the list on screen was fetched for the text now typed, or when the typed text exactly matches one option; only otherwise does it wait for the answer to the typed text. Never commit from a list fetched for other text |
| R5b-2 | S | low | `src/item-import-ui.js` `applyImportedItemRows` (348), `wireItemImportButton` (450) | An import that fails on line 7 returns `ok: false` without the document, so the page is not repainted. Lines 1–6 are on the ERPNext form (and a later Save keeps them) but not on the page, and the message says only what failed. The Import button also stays live while the rows are written one by one by row number, so a second import, or a line the clerk deletes meanwhile, shifts what the later writes land on | On failure return the last document and say "Lines 1–6 imported; line 7 stopped: …", and repaint. Block the line table (or at least the Import button) until the import ends | fixed (2026-10-20) — `importStoppedText`; the items body and Add line are `inert` and Import disabled while it runs. Proven in the app with one write refused: "Import stopped at line 2 of 3: … Line 1 is on the form. Check line 2." and line 1 painted |
| R5b-3 | S | low | doc-form item cell on a new Purchase Order, right after the vendor is set | Found while proving R5b-1 (same on the old code). Typing an item within ~1 s of setting the vendor: the half-typed text (`SAMPLE-SKU`) was written to the line and focus jumped to Qty, and the rest of the typing was lost. With a 3 s pause first it does not happen. Likely the vendor's settling repaint rebuilding the row mid-typing (the DF-03 guard covers header fields, not line cells); not yet traced | Trace it first (`nav-debug` / focus log around the repaint); then keep a line cell's typing across a repaint the way the header fields already do | open — found 2026-10-21 by a probe that set the vendor through `erpDoc.setHeader`; to confirm by hand (pick a vendor, type an item at once) |
| R5b-4 | S | med | `electron/main.js` erpEval queue (the R2-1 machinery) | Found while proving R5b-1 (same on the old code). On a new PO with no vendor, typing an unknown name (`ZZNOPE`) and Tabbing before the list opens: from then on every read and write into the ERP page waits — `getSnapshot` never answers, and at close the trail says `erp-eval-interrupted … 35 pending: closed`. A call into Vanilla never settles, and the ones after it queue behind it until the page reloads. R2-1 ended the wait on a reload or crash, not on a call that simply never returns | Find which call hangs (set the unknown vendor by hand in a probe, read the trail); then give an ERP call a deadline that frees the queue, as R2-1 did for a reload. **Likely mechanism (2026-10-21, `docs/gotchas.md` G19):** `frappe.db.get_list` and friends never settle when the server raises, while `frappe.xcall` rejects — so the sweep is: every `frappe.db.*` inside an `erpEval` → `frappe.xcall`, plus the deadline | open — found 2026-10-21; next to look at |

**Checked and fine:** (1) Item import takes pasted text or a `.csv` / `.tsv` file only, and
`parseGridText` never touches Word or PDF. `mammoth` and `pdfjs-dist` are used by Papers alone,
which R11-1 / R11-8 already reviewed. Every pasted cell, header and warning in the preview goes
through `esc`, and an import is capped at `MAX_ITEM_IMPORT_ROWS` = 100. (2) Link search is
debounced at 280 ms and capped at 25 results (`page_length` / `limit`). It runs as the clerk
through `search_link` with its arguments JSON-encoded, so it is ERPNext's permission check. The
dropdown escapes every value and label. The flaws are the stale answer and stale list (R5b-1).
(3) Column widths are one localStorage entry per table and column field, clamped to 40–900 px.
A column that leaves a layout leaves a few bytes behind, which match no header and are never
applied. Double-click resets a column. Clearing them between tests is a test-isolation chore
(local notes, trap 2), not a product bug. The address picker escapes every address field.

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
- **Reviewed through:** `05b6aec` (2026-10-20, session 4).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R6a-1 | M | med | `src/bill-form-page.js` ↔ `src/doc-form-page.js` | 55 functions have the same name in both pages. Measured by trimmed non-blank lines, those functions are 2,193 lines in the Bill and 1,831 in doc-form, and **1,295 lines are identical**. The largest: `paintItems` (464 / 454, 76% the same), `resolveCommitGate` (80%), `beginAmountBackIn` (80%), `focusItemCell` (90%), `paintMoneyStack` (89%), `removeAllTaxes` (79%). The tax-default note, `wireDateField`, `setLineTab`, `setItemCellMode`, `keepTaxesRemoved` and the tax "fixed amount" note are 100%. The differences are mostly words ("Bill" vs `docTitle()`), the paint signature (`paint(doc, amountDue)` vs `paint(doc, scratch)`) and features one side has (Bill: account-company blockers, `announceSaveBlocker`, Find continuing after a gated save; doc-form: direct save). The drift already costs: R3-1 needed two different fixes, and R5-1 / R5b-1 sit under both pages | Don't merge the pages. Move shared code into modules that take a small deps object, as `item-import-ui.js` / `address-picker-ui.js` already do, in this order: **(1)** the identical leaves (~120 lines); **(2)** the commit gate (`openGate` … `resolveCommitGate`, ~150 lines at 80–100%), with hooks for title, blockers and paint; **(3)** `paintItems`' cell builder (~350 identical lines), with the Bill-only cells (Rec'd editor, Assign, ref chip) as hooks. Steps 1–2 are one session. Step 3 is its own session, with both skins' smoke specs. It is independent of R2-5 | open — 5zorro agreed 2026-10-20; schedule as its own sessions |
| R6a-2 | M | low | `src/bill-form-page.js:275–6087` | The whole Bill page is one 5,800-line closure, `bootBillFormPage(api)`, with all state held inside it, so no inner function can be imported or tested, and every extraction must thread state through. The doc-form page is module-level functions. The biggest functions: `paintItems` 472, `openLineAllocationPicker` 318, `paintTaxes` 315, `openInformalLinkPicker` 209, `paint` 201, `runBillSourcePicker` 173, `openAllocateChargeModal` 163, `paintLinkedSources` 139, `doSave` 126 | Four of them are self-contained dialogs (Assign, informal link, source picker, allocate charge: ~860 lines) that read only `lastDoc`, `api`, `setStatus` and `paint`. Move each to its own `src/bill-*-modal-ui.js` taking deps. Assign's steps (customer → Sales Orders → project) become a pure reducer with tests. `paintItems` / `paintTaxes` go with R6a-1 step 3 | open — 5zorro agreed 2026-10-20; with R6a-1 |
| R6a-3 | M | low | `electron/bill.html.old` | 180 KB, dated 2026-08-29, untracked and ignored (`.gitignore` `*.old` and `electron/bill.html*`). Nothing loads it. Its only mention is the `bill-skin` family's `paths` (`src/architecture-families.js:93`), which makes the coverage map treat a dead file as part of the Bill | 5zorro deletes the file. It is untracked, so git keeps no copy: his call, not an agent's. Then drop it from the family's paths | fixed (2026-10-20) — 5zorro: a reference kept from the migration, every feature since exercised or removed. File deleted; family path and stale `bill.html` mentions removed |

**Checked and fine:** the Bill's own pickers debounce their searches (Assign 180 ms, informal
link 220 ms; Sales Orders are fetched once and filtered locally). Assign's customer search has
the same missing stale-answer check as R5b-1, but it only fills a list the clerk must still click,
and it should take the same sequence fix. The Bill page's HTML strings escape server values the
same way as doc-form (R5 checked).

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
- **Reviewed through:** `e422410` (session 2, 2026-10-19), and its fixes `b87a096` plus the commit that adds this line (2026-10-20 review of the fixes).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R6c-1 | S | med | `main.js` `enrichBillLineContext()` | It works out which bill to store the source-line limits under (`currentBillDocKey()`) **after** the fetch returns, not before. The 15 s `raceTimeout` abandons a slow fetch but does not cancel it. So if the clerk has moved to bill B by the time bill A's fetch lands, A's per-row limits and allocations are written under B. Both are keyed by **row index**, so B's row 1 gets A's row-1 PO limit, and the over-billing split at save can cap or split B's line by the wrong quantity. This can also wipe B's already-finished limits and leave B stuck on "line limit still loading". Read from the code, not reproduced. The window is the fetch time (500 ms settle plus the HTTP calls), and it is much longer under chaos lag or a busy ERP | Take the key from `doc.name` before the await, and drop the result if that bill is no longer the one on screen (the background loop already checks `docName` between rounds; the slice itself does not) | fixed 2026-10-20 — the key is taken from `doc.name` before the fetch; an answer for a bill no longer on screen is dropped (`bill-enrich-stale` in nav-debug.log) |
| R6c-2 | S | low | `main.js` `scheduleBillEnrichBackground()`; `bill-po-qty-split.js` message | When the background retry gives up (15 rounds, about 2 min), it logs `bill-enrich-stop max_rounds` and tells the page nothing. The page keeps showing "Still loading…", and Save keeps saying "wait for source columns to finish, then retry Save" — waiting for something that will never come. Refresh does recover it | Push one last snapshot flagged as given up, and have the page say "Couldn't load the PO/receipt limits — Refresh to try again" | fixed 2026-10-20 — `enrichPending.gaveUp`; the source fields say "Couldn't load — press Refresh" and Save says the same |
| R6c-3 | P | low | `main.js` `enrichBillSnapshotExtrasInner()` | **Q1:** there are no per-line calls. Each Bill snapshot makes one full-document GET per linked PO and per linked receipt, plus two list calls (PO titles, receipt refs), so a 20-line Bill from one PO costs 3–4 requests. But a sourced bill pays this on **every** snapshot (open, Refresh, after each merge), behind a fixed 500 ms sleep and an `ensureErpFormBridge()` that the HTTP path does not need. It also never reuses the limits it already holds, and fetches PO titles twice (the PO GET already carries `title`) | Skip the line-context fetch when the cached limits already cover every sourced row of the same bill; drop the settle sleep and the bridge wait when the HTTP path is used; take titles from the PO documents | fixed 2026-10-20 (the safe two) — the bridge wait and 500 ms settle now happen only on the bridge fallback, and PO titles come from the PO documents; reusing stored limits across refreshes was **not** done (a stale limit is the wrong kind of fast) |
| R6c-4 | S | low | `main.js` `bill-jit-receipts` handler | Each just-in-time receipt is an insert then a submit inside one `try`. If the submit is refused, a **draft** receipt is left, the failure line names no receipt, and the "reuse what an earlier Submit made" lookup only matches submitted receipts **of a saved bill**. A retry therefore makes a second one. If the ERP page dies mid-script on an **unsaved** bill (the R9-2 mechanism), the retry can receive the goods twice | Return the draft's name and delete it when its submit is refused (it never touched stock); log the name either way | fixed 2026-10-20 — insert and submit split; a refused submit deletes the draft (or names it if the delete fails). The unsaved-bill crash case is left as is (see below) |
| R6c-5 | S | low | `main.js` `bill-jit-receipts` | Found reviewing the fixes: a receipt script that died mid-way (no `cancelled` key) was shown as a plain failure; the receipt may already be submitted | Say "Lost contact mid-way — the receipt may already have been made; check this vendor's Item Receipts"; log `uncertain=1` | fixed 2026-10-20 |

**R6c-4, what was left as is (5zorro 2026-10-20):** on an **unsaved** bill, if the ERP page dies
after a receipt is submitted, a retry can receive the goods again — guarding it would mean saving
the bill before receiving, which changes the dogfooded flow. 5zorro's preferred flow is the
"already paid"-style just-in-time entry; the gap is a known Clean Core trade-off until a way to
stamp the receipts without custom fields is found. The error already names receipts it knows were
made.

Checked and fine: **Q2's overwrite inside one bill**: the background loop stops on a different bill, and stops when the bill is submitted. **Q3:** *receive with the bill* is ERPNext's own `update_stock` on the bill, so it is one write. For a just-in-time receipt, the receipts are submitted before the bill lines are pointed at them. If the pointing fails, the result names the receipts that were made ("were made but the bill lines could not be pointed at them"), and a saved bill's retry reuses them through the remarks token. A just-in-time line also gets an exact limit, its receipt's own quantity, as a backstop.

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
- **Reviewed through:** `e422410` (session 2, 2026-10-19), and its fixes `b87a096` plus the commit that adds this line (2026-10-20 review of the fixes).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R9-1 | S | med | `main.js` `voidAndAmendDoc()`, the failure return at its end | The failure return rebuilds the result from `ok`, `cancelled`, `name`, `step`, `reason` and **drops `amendedName`**. Only stage 3 (`run-mode-change`, `submit: true`) can fail *after* the insert — when the submit is refused — and then the amended draft exists but the clerk is told the bill "was cancelled without a replacement". A retry is answered "already amended once" (`is_document_amended` counts drafts), which contradicts what they were just told; re-entering the bill would make it exist twice | Carry `amendedName`, `droppedRows` and `patched` through the failure return, and have `describeVoidAndAmendResult` say "cancelled; the amendment `<name>` was created but not submitted — open it" when `amendedName` is set | fixed 2026-10-20 — the failure keeps `amendedName` (`voidAmendOutcome`), and the clerk is told "cancelled; its amended copy … was created but not submitted — open it and submit it" |
| R9-2 | S | med | `main.js` `erpEval()` → `voidAndAmendDoc()`, `run-mode-change` | `voidAndAmendDoc` treats a non-object result as "may already be cancelled" — but `erpEval` turns a thrown `executeJavaScript` (the ERP page reloading or navigating mid-script, a renderer crash) into `{ ok: false, reason }` with **no `cancelled` key**, which becomes `cancelled: false` → "Nothing was changed." The cancel may well have landed. In `run-mode-change` the same misreport means the loop does **not** stop and goes on to cancel the next bill. Every return from the injected script sets `cancelled` explicitly, so a missing key always means the script did not finish. Not reproduced live (would need the ERP page to reload between cancel and insert) | Read a missing `cancelled` as unknown and report it like the lost-contact case (and stop the batch); have `erpEval` mark the refusals that happen *before* anything runs (view not ready, off ERPNext) as `notRun: true` so those still say nothing changed. Unit-test the result mapping by pulling it into a pure helper | fixed 2026-10-20 — `voidAmendOutcome` (pure, tested) reads a missing `cancelled` as "may already be cancelled"; `erpEval` marks pre-send refusals `notRun`; the batch stops on it |
| R9-3 | S | low | `bill-form-page.js` / `doc-form-page.js` / `payment-doc.src.html` void-amend buttons; `doc-void-and-amend` handler | No in-flight guard: the button stays live while the write runs, and main does not refuse a second run for the same document. A second click asks again (the facts may not show the first amendment yet); if confirmed, under Amend Counter the second insert collides on `<name>-1` and is reported as "cancelled but not amended" while the first succeeded; under "Default Naming" two amendments could be created | Disable the button while `runVoidAndAmend` is pending, and keep a `Set` of names being voided in main that refuses a second start | fixed 2026-10-20 — a second start for the same document is refused, both in `runVoidAndAmend` (page) and `voidAndAmendDoc` (main) |
| R9-4 | S | low | `main.js` `auto-relink` handler, `relinkPayment()`, `flagRelinkForReview()` | The `auto-relink` summary line logs `ok=0` without the reason, and a failed provenance Comment or review flag is returned to the page but never written to `nav-debug.log` — so "why is this auto-link not flagged / has no source comment" leaves no trace | Add `reason=` to the summary line and `provenance=` / `flagged=` to the per-link and `payment-relink` lines | fixed 2026-10-20 |

**Fixes, 2026-10-20 (5zorro agreed every proposal; one changed).** The batch method change now
**stops at the first bill that did not go as asked** — refused, half-done, unknown, or amended
without the method sticking (`modeChangeShouldStop`) — not only at a stranded one. While it runs,
each bill's row in the Method… panel carries a chip (Waiting → Changing… → ✓ / Not changed /
Cancelled — copy not submitted / May be cancelled / Not attempted; `modeChangeChip`, fed by
`mode-change-progress` events). After a stop the panel stays up with **Try again on the remaining N**
(bills never attempted, and bills refused before anything changed — `modeChangeRemainder`) and
**Done — refresh the board**. 5zorro's framing: the batch is not the normal path for a one-off
method problem — a payment's method need not match the bill's terms (09-16 P1 *Root cause*: the
drawer field is editable and the write honours it), so a one-off can simply be paid on the other
rail.

Checked and fine: **Q3** — two auto re-link runs for one payment cannot both post. `relinkPayment` re-reads the open payments before each post, and ERPNext's `check_if_advance_entry_modified` (`accounts/utils.py:581`) refuses an allocation whose unallocated amount has changed ("Payment Entry has been modified after you pulled it"). The board swallows that refusal, so the second run is silent. **Off ERPNext** (after R1-3's *Continue here*), `erpExec` refuses before anything runs and void-and-amend correctly says nothing changed. **Stage 3's submit** sends the inserted document back to `frappe.client.submit`, which rebuilds it with `get_doc(dict)` and submits it, and that is sound. **Q4** — void-and-amend, `run-mode-change` and `payment-relink` log both sides; the gaps are R9-4.

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
- **Reviewed through:** `e422410` (session 2, 2026-10-19), and its fixes `b87a096` plus the commit that adds this line (2026-10-20 review of the fixes).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R10c-1 | S | low | `main.js` `insertAndSubmitPaymentEntry()`; `check-doc-mount.js` submit click | When the insert lands and the submit is refused, the result carries the draft's `name`, but the drawer shows only ERPNext's reason and does not refresh *Draft payments*. The clerk fixes the cause and clicks again, which makes a second payment, and the first is left as an unexplained draft against the same bills. The same thing happens if the ERP page dies mid-script (the R9-2 mechanism): the result has no name at all | On `step: "submit"` with a name, say "Saved as draft `<name>` but not submitted: … — finish or delete it under Draft payments", and reload the drafts panel | fixed 2026-10-20 — `paymentCreateFailureText`, and the Draft payments panel reloads |
| R10c-2 | S | med | `main.js` `create-batch-payment-entry`, `create-blank-payment-entry`, `create-payment-term` handlers | The payment and term **creates** write nothing to `nav-debug.log` — no start line and no outcome line — although the draft submit/delete, void-and-amend and re-link paths log both sides. A failed or doubled payment would leave no trace (the local notes' rule) | `navDebug` before and after each, with the bills, the amount, the step, the name and the reason | fixed 2026-10-20 — batch, blank, term and the just-in-time payment at bill submit; pinned by `tests/write-path-wiring.test.js` |
| R10c-3 | S | low | `main.js` `createPaymentTermDocs()`; `payment-term-plan.js` | **Never run live.** A Payment Term is inserted, then the Template. If the Template insert fails, the term stays. A retry of the same plan is then refused with "A Payment Term called … already exists" (the planner treats any existing name as a collision), so the modal can never finish the job, and the clerk has to build the Template in Vanilla. The failure message also leaves out the names of the terms that landed when it is the Template that failed (`made` is not returned on that branch). The document shapes themselves match ERPNext: `invoice_portion` and `due_date_based_on` are required on the detail, the template's portions must total 100 at 2 dp, and no two rows may repeat (payment_term, days, months, basis) — checked against `payment_terms_template.py` and both JSONs | Since a term's name encodes its numbers, an existing term with that name **is** that term: reuse it (after checking that its fields match) instead of refusing, and on the Template-failure branch return `made` | fixed 2026-10-20 — `paymentTermFieldMismatch`; a matching existing term is reused, a different one is refused naming the field; the template-failure message names the terms that landed. Still never run live |
| R10c-4 | S | low | `main.js` `insertAndSubmitPaymentEntry()`, `createJitPaymentEntryForBill()`, the bill's "already paid" result | Found reviewing the fixes (the R9-2 mechanism, missed in session 2): a payment write whose script died mid-way (no `step`, or its catch-all `unknown`) was shown as a plain failure, although the payment may already be saved or submitted. The bill's own just-in-time payment showed only ERPNext's reason, not the draft a refused submit leaves | Map a missing / catch-all step to `step: "uncertain"`; `paymentCreateFailureText` says "may already be saved — check Draft payments"; the bill's payment failure goes through the same text | fixed 2026-10-20 |

Checked and fine: **Q1** — a batch is **one** Payment Entry covering N bills (`mergeSinglePaymentEntries`), so it is a single insert; there is no payment k of N. **Q2** — the drawer's Submit is disabled while the write runs. Even two concurrent submits cannot pay a bill twice, because `PaymentEntry.validate_allocated_amount_with_latest_data` (`payment_entry.py:419`, run on every validate for a Supplier) refuses an allocation above the bill's current outstanding — the worst case is R10c-1's stray draft. The draft Submit/Delete re-reads the payment and refuses anything that is no longer a draft. **Q3** — see R10c-3. Noted, not a finding: `resolveErpCompany()` prefers a company whose name contains "sandbox" (a seed-era rule); on a single-company site it falls through to the only company, so it is harmless here — fold into R2 if production ever runs multi-company.

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
- **Reviewed through:** `7611ee9` (session 1), and the fixes after it through the commit that adds this line (2026-10-19 review of the fixes).

| ID | Lens | Sev | Where | What | Proposed fix | Status |
|----|------|-----|-------|------|--------------|--------|
| R11-1 | S | **high** | `src/compare-pane-ui.js` (both `convertToHtml` sites) | A Word paper was converted by mammoth and pasted into the Doc form page as is. Mammoth's own README: it does **no sanitising**, and links keep their targets. Papers come from outside (vendors), and that page can save, pay and print. Details: museum **OI-183** | `inertWordHtml()` (`src/compare-papers.js`): outside links lose their address, `#…` links stay; tests pin it and fail if a new conversion skips it | fixed (this session) |
| R11-2 | S | **high** (on Windows) | `main.js` `openPaper()` (≈11398) | **Open** hands *any* attachment to the operating system, whatever its type, from a temp copy. Details: museum **OI-183** | `openablePaper()` (`src/compare-papers.js`): documents only (PDF, images, Office, text, `.html`); the local copy is renamed from the checked extension; main refuses anything else and the pane's Open button is disabled with the reason. On Windows the copy (and a Download) also gets the internet-zone mark, so SmartScreen and Office's macro block apply — **not run on Windows yet** | fixed (2026-10-19, after session 1); Windows mark untested |
| R11-3 | S | low | `main.js` `paperBytes()` (≈11332) | Checks the address *starts* with `/files/` or `/private/files/` but not that it has no `..` segment, so `/files/../api/method/…` would be fetched with the clerk's session. The addresses come from ERPNext's own File records today | `isErpFilePath()` (`src/compare-papers.js`) refuses `..`, `.`, encoded `%2e%2e` and backslashes | fixed (2026-10-19) |
| R11-4 | P | low | `paperBytes()` | `MAX_PAPER_BYTES` (25 MB) is checked after the whole file is in memory | `content-length` checked before the body is read; the after-check stays | fixed (2026-10-19) |
| R11-5 | S / P | low | `openPaper()`; `savePdfsEach()` | Every **Open** leaves a copy in the temp folder that is never removed. "One PDF per document" overwrites a same-named file in the chosen folder without asking, and two documents whose names clean to the same file name overwrite each other | Startup sweep of `erpnext-ui-paper-*` / `erpnext-ui-print-*` over a day old (`isStaleTempCopy`); "one PDF per document" numbers a clashing name (`freeFileName`) instead of overwriting | fixed (2026-10-19) |
| R11-6 | S | low | `main.js` `printerPaper()` (Windows) | The printer name is spliced into a PowerShell command in single quotes with `'` doubled — but PowerShell also treats curly quotes (‘ ’ ‚ ‛) as single quotes. Printer names are set by the computer's admin, so low | Pass the name through an environment variable (`$env:P`) instead of the command text | open — before the first Windows release (cannot be tested here) |
| R11-7 | S | low | `main.js` `paperBytes()` | The 25 MB preview cap also applied to **Open**, **Download** and **Save as ZIP**, so a big scan could be neither shown, opened nor saved — and the message said "open it instead" | `MAX_OPEN_BYTES` (250 MB) for those three; the preview keeps 25 MB. Pinned in `tests/compare-papers.test.js` | fixed (2026-10-19, review of the fixes) |
| R11-8 | S | — | `inertWordHtml()` | Could mammoth emit an `<img>` pointing *outside* the file (a Word "linked picture", `r:link`)? | Checked: the browser build the pane loads replaces `docx/files.js` with one that refuses every linked file (`mammoth/browser/docx/files.js`), and embedded images arrive as `data:` | no change needed |

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
- **Reviewed through:** `7611ee9` (session 1), and the fixes after it through the commit that adds this line (2026-10-19 review of the fixes).

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
| 2 ✅ | R9 + R10c + R6c | ~62k | R8 (would make ~84k listed) | every multi-step write: what is left behind when step 2 fails | done |
| 3 ✅ | R2 + R3 + R4 | ~69k | R1 (already done; `main.js` again) | `main.js` structure, the nav spine it wires, the toolbar / Find on top | done |
| 4 ✅ | R5 + R5b + R6a | ~72k | any other R6 | the shared form page and the Bill page side by side — the duplication question | done |
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

## Test-run log — so a flaky failure can be looked at later (5zorro 2026-10-21)

Why: on 2026-10-21 one `npm test` run failed one test, the next five passed, and nothing was
left to say which test it was. Failures seen while "getting the thing to work" are exactly the
ones nobody scrutinizes.

- `npm test` runs `scripts/run-tests.js`: the same tests and the same screen output, plus a TAP
  copy of the run in `test-logs/runs/<time>-<commit>.tap`. `test-logs/` sits in the repo and is
  **untracked** (`.gitignore`).
- One line per run in `test-logs/runs.tsv`: time, commit, whether the tree had changes, a
  fingerprint of the code (commit + uncommitted diff + untracked files), pass / fail counts,
  duration, the log's name, the failing tests' names, and the scope (`all`, or the files named
  after `npm test --`: a run of other files never ran a test, so it is not compared with a full run). Kept whole: it is what the flaky report
  reads, so history outlives the logs.
- `npm run test:flaky` lists tests that both failed and passed **at the same fingerprint**:
  flaky, as opposed to broken and then fixed.
- The last **50** run logs are kept. **Before** any is deleted, one entry is appended to
  `test-logs/flaky-history.md`: the time, which logs are going, and the `test:flaky` report at
  that moment. That file is cut from the top, by whole entries, once past **64 KB**.
- Pure parts (TAP failure parsing, the fingerprint grouping, the capped append) in
  `src/test-run-log.js` with tests. Known limit: `runs.tsv` is never trimmed (~300 bytes a run;
  it is what makes old flakes findable). **Built 2026-10-21**; rotation proven with 50 dummy logs (entry
  written first, then the 3 oldest removed). The e2e specs are not logged here; they keep their failures
  in `test-results/`.

## Open questions for 5zorro

1. Fix in the same session when a finding is a one-liner with a test, or always a separate
   session? (Default here: one-liners in place, everything else later.)
2. Should a high-severity security finding stop dogfood of that area until it is fixed?

## Dogfood residuals

The review itself changes no behavior; its fixes do. What unit tests cannot show:

| Fix | What to try | Expect |
|-----|-------------|--------|
| Batch method change (R9) | Method… on a vendor with 3+ bills, where ERPNext will refuse one (e.g. a bill whose posting date falls in a closed period) | Chips move bill by bill; the batch stops at the refused one; Try again offers the untouched rest; Done refreshes the board |
| R9-1 | Same, with the refusal at **submit** | That bill's chip: "Cancelled — `<name>-1` not submitted"; the copy is a draft in ERPNext |
| R6c-2 | A Bill from a PO under `npm run start:chaos` until enrich gives up (~2 min) | PO/receipt fields say "Couldn't load — press Refresh"; Save says Refresh, not wait |
| R10c-1 | Pay a batch where submit is refused | Drawer names the draft; it appears under Draft payments at once |
| R10c-3 | Create a term that already exists with the same numbers (the never-run-live path) | "Created … (reusing the existing …)" — and a term with different numbers is refused naming the field |
| R6c-4 | A just-in-time receipt whose submit ERPNext refuses | No draft Purchase Receipt left behind |
| R2-2 | Assign a Bill line to a Sales Order where ERPNext will refuse the bridge PO's submit (e.g. a closed period) | Status: "Line N assigned. The Purchase Order for it was not made: ERPNext refused to submit it (…). Nothing was left behind." No draft PO |
| R2-1 | Under `npm run start:chaos`, click Save on a Bill and log out in a browser tab before it finishes, or restart Docker mid-save | The button comes back with "The ERPNext page reloaded before the step finished" — it never spins forever; Edit / New work without restarting |
| R4-1 | Leave the app open and idle past the site's *Session Expiry* (170 h here; shorten it in System Settings to try) | On returning to the window the toolbar offers *Log in*; the health dot stayed green throughout |
| R4-2 | Find on a list over 200 rows, stop ERPNext, click Show more | The rows already shown stay; "Could not read more…" under them and the button reads Try again |
| R5b-2 | Import 10+ lines on a Bill and stop ERPNext (or log out in a browser tab) part way | "Import stopped at line N of M: … Lines 1–(N−1) are on the form." — those lines show on the page; the line table and Import were locked while it ran |
| R5b-1 | Under `npm run start:chaos`, type an item number you know fast and Tab; then a partial number and Tab at once | The exact number is taken at once; the partial one waits a beat, then takes the first match and moves on. Never an item from the list you typed past |
| Warm lists (HANDOFF § Warm pick lists) | Open a Bill under `npm run start:chaos`; type a vendor, then an item | Lists appear without "Searching…"; the order is the one you know. **First run at production size:** `nav-debug.log` `link-list loaded dt=Item rows=… ms=…` says what the item copy costs |
| Warm lists | Add a vendor through Create Vendor…, come back, type part of it | It is listed at once (a check runs on the peek's return) |
| D1 | Open a vendor dropdown, go to Vanilla, come back | The dropdown is closed |
| D2 | Pick a vendor deleted in another window (or type one that never existed and leave the box) | Banner across the top naming it; no source picker; the box shows the bill's old vendor |
| D3 | Set a vendor on a new Bill under chaos | The page stays responsive; sources open within ~10 s for a vendor with no address on file, sooner for one with |
| R5-1 | Enter a long Bill (20+ lines, many edits), then scroll the line table | Scrolling stays smooth all day; an open dropdown follows its cell |
| R2-7 | Allocate a charge to stock where one line's rate cannot be set | "… Nothing was changed." — the other lines keep their old rates |

## Validate

```bash
cd ~/erpnext-ui-app && npm test
```
