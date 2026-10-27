# Implementation plan 2026-10-26 — tests that run while the app is open, and how long they take

> **Status: step 1 built 2026-10-26 (each test run has its own profile folder); step 2 built
> 2026-10-26 (`npm run test:times`); step 2b built 2026-10-26 (each test's timeline chart,
> `test-logs/traces/`; then a chart for every test's end, timed-out ones included). 5zorro, after
> looking: nothing to cut for now — the charts are for tracing the next timeout. Built; to close
> out (HANDOFF § *Closing a plan*) at the next end-of-session review. Next work: plan 10-25's
> R6a-2.** A short tooling plan, slotted in before plan
> 2026-10-25's R6a-2 (that refactor needs many probe runs). Nothing a clerk sees changes.

## Why

5zorro, 2026-10-26: *"Ever since the probes became formalized, the testing is much much better,
but takes much much longer … I am not able to open the app and dogfood anything while a probe is
running … the fact that testing is much better means that i don't want to remove the probe."* He
asked whether there was an obvious answer before promoting the concurrency and multi-window
features for this reason. There is, and it is in the test runner, not the app.

## What blocks him today (found 2026-10-26)

The app has no single-instance lock and opens no port, so two copies can already run side by side.
What they share is the **profile folder**, `~/.config/erpnext-ui-app/` (Electron's `userData`): the
prefs files, the ERPNext login cookies, the Drafts shelf (`nav-state.json`), the Doc page's Local
Storage (dragged column widths, the calculator's rounding), and `nav-debug.log`. Because of that,
`scripts/run-probe.js` backs the folder up, lets the probe change it, restores it, and so must
refuse while his app is open (a restore would undo what the app saved meanwhile). Specs run by hand
need the same backup by hand (the local notes file). `nav:check` and `dogfood:check` stop with
"not run — the app is open".

What the probes take (the run logs in `test-logs/runs/`, 2026-10-26): `df03-item-table` 6 tests
279 s (T-3 74–87 s each, a slow server on purpose; T-1 36–38 s; T-2 22 s); `item-table-keys` 2 tests
98 s; `nav-desk-after-discard` 1 test 96 s; the full `nav:check -- --ongoing` about 30 min. `npm test`
(2,991 pure tests) about 21 s. A one-test probe taking 96 s suggests most of a test's time is
starting the app and loading ERPNext, not the question itself — **inferred, not measured** (step 2
measures it).

## Step 1 — every test run gets its own profile folder

**What changes:**

1. `electron/main.js`, first thing: with `E2E=1` and `ERP_USER_DATA_DIR` set, `app.setPath("userData",
   …)` to that folder. Only test runs can move the profile; a clerk's app is unchanged.
2. A new `scripts/test-profile.js`: makes a throwaway folder under the system temp folder and seeds
   it from the real one — the prefs (`*.json`), `delay-calendar.csv`, and the login cookies
   (`Cookies`, `Cookies-journal`), so a probe starts logged in and sees the same prefs as before.
   **Not copied:** the logs (a run starts its own trail), the Local Storage (column widths and the
   calculator's rounding start at their defaults — a probe no longer sees, or changes, his), and
   `db-ro.env` (a database password the app does not read). After the run it copies the run's
   `nav-debug.log` / `focus-debug.log` into `test-logs/profile-logs/<kind>/` (for reading a
   failure) and deletes the folder, cookies and all.
3. Both Playwright configs (`playwright.config.js`, `tests/probes/playwright.config.js`) get a
   global setup and teardown that do 2 and pass the folder to every launch through
   `ERP_USER_DATA_DIR`. One folder per run, not per test: some probes restart the app and check
   what it kept (nav-spine's Drafts shelf, the lens choice).
4. `scripts/run-probe.js` drops the backup, the restore, the cookie restore and the "app is open"
   refusal (`--with-app-open` is accepted and ignored). It keeps clearing the display variables and
   retiring a restricted probe user, before and after (that user lives on the server, not in the
   folder). `nav:check` and `dogfood:check` lose their "not run — the app is open" stop.
5. The probes that read or empty the real folder read the run's folder instead: `nav-spine.js`,
   `leaves-records/nav-submitted-backtrack.probe.js`, `leaves-records/dogfood-r6c-2-enrich-gives-up.probe.js`
   (`runProfileDir()` in `scripts/test-profile.js`, which refuses outside a run, so the clerk's
   folder is never emptied).

**What stays shared:** the ERPNext sandbox. A probe that sets a scene changes the `ZZ DF …` records
while he may be looking at them, and two copies of the app plus Docker share one machine — a
probe that depends on timing (the slow-server ones) may be flakier while he works. Those are for
him to judge in use, not to engineer around now.

**Proof (fails on the code before):** run one probe and compare the real folder before and after —
on the code before, `nav-debug.log` grows and the prefs' timestamps change; on the new code nothing
in `~/.config/erpnext-ui-app/` changes. Then start a stand-in for his app on the real folder (a
second hidden copy) and run a probe beside it: the code before refuses (exit 3), the new code runs.
`npm test`; a unit test for `test-profile.js` (what is copied, what is not, the logs kept); the
focused probes `item-table-keys`, `df03-item-table`, one nav start; then the full
`npm run nav:check -- --ongoing` and `npm run dogfood:check` (both owed before his push anyway)
to find any probe that leaned on his Local Storage.

**Built 2026-10-26.** Proven on the real app: on the code before, one `item-table-keys` run
changed 12 files in `~/.config/erpnext-ui-app/` (the prefs, `Cookies`, `nav-debug.log`,
`focus-debug.log`); on the new code the same run, a spec run (`scaffold-typed-dates`, 3 of 3) and
`npm run nav:check -- drafts` (14 of 14) changed nothing there, Local Storage included. With a
second, hidden copy of the app open, the runner before refused (exit 3); the new one ran the probe
beside it (2 of 2). `npm test` and `tests/test-profile.test.js`. Still to see: the full
`nav:check -- --ongoing` and `dogfood:check` (owed before 5zorro's push anyway), for any probe that
leaned on his Local Storage. A run killed outright leaves its folder (with a login cookie) in the
system temp folder; the next run sweeps folders a day old.

**Docs:** `tests/probes/README.md`, HANDOFF (the probe row of *Test strategy*, *Navigation spine*'s
"a full run blocks him", the upgrade checklist's "app closed"), the scripts' headers, the local
notes file's *Running the app's tests* section.

## Step 2 — time each stage of a test

Each test's total is logged already. Step 2 splits it: `launchShell` (start the app),
`waitForE2eApi` (the app ready), `openNewDoc` and the e2e `waitLoaded`s (ERPNext's form loaded)
record how long they took on the test (Playwright annotations); the run-log reporter writes them
with the test's line; `npm run test:times` prints, from `test-logs/`, each probe and spec test's
latest and median time, split by stage where known, slowest first.

**Intentional slowness, counted apart (5zorro, 2026-10-26):** *"can a certain part be classed as
'intentional slowness' or 'performance processing slowness'. So if a test is ran in chaos mode, the
actual cause may be easier to see?"* Yes. Each test's time is split three ways:
- **chaos lag:** the delay chaos mode injected. `maybeChaosLag` (`src/erp-chaos-lag.js`) already
  returns the ms it slept, so main keeps a running total the test reads through `__erpE2e`.
  Chaos delays can overlap (two calls lagged at once), so this is a sum of delays, not a slice of
  the clock, and the summary says so;
- **the test's own waits:** the probe's `sleep()`s (`probe-helpers.js`) and its deliberate slow-server
  set-ups (T-3's held write) add to a counter;
- **the rest is work:** the app and ERPNext actually working (start-up, loading, painting,
  saving). This is the part worth making faster.

Playwright has no built-in category for this, but its annotations take any label, so each test
carries its three numbers and the stage times, and `npm run test:times` shows them side by side.
Then a chaos run that got slower can be read: more injected lag, or more work.

**Proof:** a unit test for the summary; one probe run shows the split; the same probe in chaos mode
shows the chaos lag grow while the work stays about the same.

**Built 2026-10-26.** What it changed on the way: summing the chaos delays was useless — T-3
showed 236 s of delays inside an 87 s run (parallel calls overlap) — so main counts them as clock
time, overlapping delays once (`addLagInterval`, `src/erp-chaos-lag.js`): 71–81 s of 76–83 s runs.
That in turn showed "work = total − waits − chaos lag" says nothing under 100% chaos (some delay is
running nearly all the time), so a chaos-mode run is not split into work: it shows how much of it a
delay was running and how much longer it took than the same test's plain runs.

**What the first numbers say (2026-10-26)** — the opposite of the guess above:
- starting the app is **not** the cost: launch ~0.5 s, the app ready at once, a Doc form loaded
  2–10 s, the clerk's login 0.2–1.7 s;
- `nav-desk-after-discard`: 90 of its 95 s are its own pauses (8 tries × ~11 s, mostly a 6 s "does
  it stay on Desk?" watch per try);
- `df03-item-table` T-2 plain ~24 s (work 14–15 s, waits 11.7 s); the same under chaos ~80 s:
  **+58 s vs its plain runs**, waits unchanged. T-1: work 17–25 s, waits 15 s.
- Not exact: a polling loop written with `sleep` (`for … await sleep(20)`) counts as the test's
  wait though it is waiting on the app; `expect.poll` does not. Small where seen (≤ 4 s).
- Noticed on the way, filed, not changed: chaos mode delays a bridge call twice (museum OI-191).

## Step 2b — each test's timeline as a chart (a Gantt view)

5zorro, 2026-10-26: *"If im trying to understand a async series, a gantt chart works for me as i
understand shapes best … do we have to reinvent the wheel here"*. No: Chrome's **trace event
format** (a JSON list of spans — name, lane, start, length) is what browsers, Node and Electron
write, and existing viewers draw it as bars on lanes: Chrome DevTools' Performance panel (*Load
profile…*, offline) or Perfetto (ui.perfetto.dev, reads the file in the browser, no upload). We only
write the file.

**What changes:**
- Each test writes `test-logs/traces/<file> <test title>.json` at its end. Lanes:
  1. **test** — the stages (launch, app ready, form loaded, clerk login) and each deliberate wait;
  2. **ERPNext calls** — each bridge call (named by its method, e.g. `setRow`) and each other
     `erpEval` (named by its channel), from start to answer;
  3. **chaos lag** — each injected delay, named by its channel. Delays that overlap go on extra
     lanes ("chaos lag 2", "3" …), so the overlap is a shape, not a number.
- The app records its spans only in test runs (`E2E=1`), capped, and hands them over at close
  through `__erpE2e`; the test side keeps its own. A pure module turns both into the trace format
  and spreads overlapping spans over lanes. Names only — no document contents, no scripts.

**Proof:** a unit test for the lanes and the format; one T-3 run's trace opened in the viewer shows
the three lanes, with chaos delays stacked.

**Built 2026-10-26.** A T-3 (Bill) run wrote a chart spanning 79 of its 82 s: the test's 4 stages
(10.3 s), its 5 waits (22.5 s), 284 ERPNext calls on up to **8 lanes at once**, and 190 chaos
delays on up to **7** — the overlap that made a summed chaos number meaningless, now a shape. It
holds method and channel names only (checked: no document or user names). **Then, from 5zorro's first look (2026-10-26):** *"the gantt chart from chrome seems to be pretty
enlightening regarding where the time is going, but … we should probably have slightly more detail
than erpeval"*; and nothing to cut — *"when (not if) a probe is timing out, then this will be really
helpful in tracing the breadcrumbs to the culprit."* So:
- **A chart for every test's end, timed-out ones included.** The first version wrote it when the
  test closed its app, so a test that failed in its setup or timed out got none (seen: a T-3 whose
  clerk login timed out under load). Now the app appends each span to `test-spans.jsonl` in the
  run's profile folder as it ends, the test keeps its own spans on a `spans` annotation, and the
  run-log reporter writes the chart at the test's end from both, cut to the test's time — and works
  out the chaos clock from the same spans (main's counter and the close hook are gone). Proven with
  a throwaway probe that hangs until its timeout: its chart was written.
- **Charts live in `test-logs/traces/`**, not `test-results/`: Playwright empties `test-results/`
  at the start of every spec run, which is why 5zorro found no T-3 chart (a spec run after it had
  wiped it). The profile logs moved for the same reason (`test-logs/profile-logs/<kind>/`).
- **Each bar names who made the call:** a bridge call by its method (`setRow`, `snapshot`), any
  other ERPNext call by the function that made it (`ensureErpFormBridge`, `drainErpSaveIntoShelved`,
  or `main.js:<line>` for an unnamed one; test runs only, read from the stack); a chaos bar by the
  call it delayed and its channel (`setRow (bridge)`). First reading: most of a probe's ERPNext
  calls are the bridge check before each bridge call (127 in T-3's 80 s) and the save-drain poll
  (86), not the test's own edits.
- **What is kept (his question, 2026-10-26: "what is the log rotation going to look like?"):**
  `test-logs/traces/` holds the latest run of each test (overwritten; a chart not rewritten for
  30 days — a renamed or deleted test's — is swept at the next run). A test that **failed or timed
  out** also keeps its chart and the run's `nav-debug.log` / `focus-debug.log` so far in
  `test-logs/failures/<time>-<test>/`, the newest 30, so a pass on the next run cannot overwrite the
  breadcrumbs. The app's span file lives and dies with the run's profile folder. Proven with the
  hanging throwaway probe: its failure folder had the chart and both logs.
- **End-of-session review (2026-10-26), fixed:** (1) **two probe runs at once broke each other**
  — the old "app is open" refusal had also kept a second run out (it saw the first run's app), and
  a run starts by retiring any probe user in the lock, which would end the other run's clerk
  mid-test; now one probe run at a time, a second waits (up to an hour) — proven: started 6 s
  apart, the second printed "waiting" and ran after the first, both passed, lock gone after.
  (2) A failure folder copied the run's whole debug log (up to 5 MB, ×11 known smoke failures per
  run): it keeps the last 512 KB, the breadcrumbs nearest the failure. (3) `erpEval`'s two doc
  comments merged; `nav-spine.js`'s header still said the runner backs the prefs up. Checked and
  fine: nothing new waits without a deadline (the lock gives up after an hour); the spans hold
  method, caller and channel names only; the copied login lives in a 0700 temp folder, deleted
  after the run (a killed run's, after a day).
- **Chaos: one delay per call** (museum OI-191, his word: *"If it could happen in real life, then
  it should do it … We should probably remove the double lag"*). A bridge call used to be delayed
  twice on one trip (in `bridgeCall`, then in the `erpEval` it ends in); now only `erpEval`
  delays it. The bridge check before it is a separate trip and keeps its own delay, as it would in
  real life.

## After step 2 — decide with 5zorro, not built here

What to cut depends on step 2's numbers. If starting the app dominates: one app per probe file
instead of per test, where a test does not need a fresh app (trades isolation — a choice per
probe); or two probes at a time, each with its own folder (the sandbox's scenes may then collide).
Either goes back to him with the numbers.

**Not this plan:** the concurrency and multi-window features. If they move up, it is on dogfood's
word, not to make room for tests.

### Closeout (before deleting this plan)

Follow `HANDOFF.md` § *Closing a plan*: the rule (a test run never touches the real profile folder)
goes into HANDOFF's *Test strategy*; sort the residuals with 5zorro; update HANDOFF's registry and
the local notes file; delete this file.
