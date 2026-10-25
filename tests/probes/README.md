# Probes

A **probe** answers one question against the real app and the live sandbox — "does this still
happen?", "which call hangs?" — by driving the app the way a clerk does. Kept here (5zorro
2026-10-22) so the next session reuses it instead of writing it again, and so a probe that proves
a fix can grow into an e2e test. Not part of `npm test` (it reads only `tests/*.test.js`) and not
in the e2e coverage map (`e2e/` only).

## Run

```bash
npm run probe                     # lists the probes
npm run probe -- r5b5-po-missing-vendor [another …]
ERP_CHAOS_LAG_MS=1200 ERP_CHAOS_LAG_PCT=100 npm run probe -- <name>   # 5zorro's chaos mode
```

`scripts/run-probe.js` refuses while 5zorro's app is open (a restore would undo what it saves
meanwhile; `--with-app-open` overrides — then tell him), backs up `~/.config/erpnext-ui-app/*.json`
right before the run, runs headless with `WAYLAND_DISPLAY` and `DISPLAY` cleared, then restores
the backup and removes any prefs file the run created — Ctrl+C included (proven 2026-10-22). It does **not** cover the Doc page's Local
Storage (dragged column widths) — a probe that drags columns puts them back.

## Probes that leave records — `leaves-records/`

Some questions need a **submitted** document (a paid bill, a posted payment). ERPNext will not
delete a submitted document once it is cancelled — its ledger entries link to it — so those probes
leave cancelled records behind every run. They live in `tests/probes/leaves-records/`, and run only
with `--leaves-records`:

```bash
npm run probe -- r10a-installment-part-paid --leaves-records
```

5zorro 2026-10-22: fine on this sandbox; on a site with company data, think twice before running
one. Each such probe:

- says in its header, under 🔴 LEAVES RECORDS, exactly what stays behind per run;
- calls `assertSandboxSite(app)` before writing anything (every company's name must contain
  "sandbox", or it stops);
- names its records `ZZ…` and cancels what it submitted, so nothing stays open on the A/P side;
- reuses its `ZZ…` vendor instead of making a new one each run.

## Dogfood check and setup — `@dogfood`

A probe that checks a row of plan 10-19's *Dogfood residuals* table says so in its header:
`@dogfood R9` (several rows split by `;`; a row's id is its first cell without the bracket).

```bash
npm run dogfood:check               # every tagged probe, then the table: pass / FAIL / yours
npm run dogfood:check -- R9 R5-1    # only those rows
npm run dogfood:setup -- --list     # rows with a scene, what each makes, where to look
npm run dogfood:setup -- R9         # make R9's records and leave them for 5zorro
npm run dogfood:setup -- --clear R9
```

A row's records are a *scene* in `dogfood-scenes.js` (make / clear / where to look), named `ZZ DF …`;
the probe for the row makes the same scene and clears it after (`DOGFOOD_KEEP=1` leaves it). Scenes
that submit documents follow the rules above. "ERPNext refuses" is made from ERPNext's own checks
(a Purchase Order On Hold refuses its bill's cancel; a disabled expense account refuses a submit),
never by changing a site setting.

## The navigation matrix — `@nav`

`nav-spine-<start>.probe.js` (one per start) run the cells of plan 2026-10-24's matrix through one
driver, `nav-spine.js`; `src/nav-spine.js` judges them. `npm run nav:check [-- <start>…] [--ongoing]`
prints the matrix; `NAV_ONLY=<start>/<state>/<move>,…` runs single cells. The driver empties
`nav-state.json` before each launch (fresh rail) — it refuses unless `npm run probe` backed the
prefs up (`ERP_PROBE_PREFS_BACKUP`). It makes `ZZ-NAV-A` / `ZZ-NAV-B` drafts and deletes them, and
any draft a cell saved (refs `ZZNAV…`) — **sandbox only** (`assertSandboxSite` at launch): every draft
uses up a Bill number, so on company data it would leave gaps in the invoice series. Lessons from building it:

- **Recent is one row per doctype**: "another document" is a Drafts row, and the way back is the
  Recent row (it reopens the last Bill) or the Drafts row.
- **Read a page mid-load softly**: `executeJavaScript` throws "Script failed to execute" or
  "Execution context was destroyed" while the ERPNext page navigates — inside a poll, read it as
  null and poll again (`soft`).
- **A stand-in that is faster than the real thing proves nothing about timing**: opening a saved
  Item from Frappe's cache took 0.7 s, before the shell saw the route — wait for the shell
  (`currentRoute`) as a real save's round trip would.
- **A race needs repeats**: N-3 failed 3 tries in 20; `nav-desk-after-discard` runs `NAV_TRIES`.
- **Save on a Bill needs the amount due = grand total**, and asks "Bill only?" — the gate's Save
  stays disabled until then (`doc-commit-gate-hint` says why).

## Writing one

- `<review-id or topic>-<what>.probe.js`; the header comment states the question and what the
  probe makes in the sandbox.
- Steps shared by probes are in `probe-helpers.js`: `openNewDoc`, `keys` (real keystrokes —
  `e2e/GOTCHAS.md` #15), `focusTestId`, `escPeek`, `docState`, `erpAnswers`, `inDoc` / `inErp`
  (each gives up after a few seconds, so a stalled page shows as `"TIMEOUT"`, not a hung run).
- Right after a peek returns (Esc), the ERPNext form reloads for a few seconds and the Doc page's
  snapshot is not `ok` — poll `docState(app).snapOk` before reading or typing. Esc keys sent to the
  Doc page do not reach a peek (it is the ERPNext view): use `escPeek`.
- Slow one search to make a race happen every run: wrap the IPC handler (`e2e/GOTCHAS.md` #16,
  example in `r5b1-vendor-held-tab.probe.js`).
- When the question is what ERPNext does with the data rather than what the keys do, drive the
  page's own calls (`window.erpDoc.setHeader` / `setItem` / `save`) through `inDoc`. When the
  sandbox lacks the case (every vendor here has terms), make a `ZZ…` record for it. Example of
  both: `r6b-due-date-schedule.probe.js` (it failed until R6b-1 was fixed, and is the regression check now).
- Sandbox records a probe makes are named `ZZ…` and deleted in `finally`. It saves a document only
  when that is the question, and deletes it after.
- "ERPNext stops" without stopping Docker: `erpDown(app, part | [parts])` makes the app's session
  refuse every request whose URL contains it, `erpDownAfter(app, part, n)` lets the first `n`
  through, `erpUp(app)` lifts it — always in `finally`. Find the URL first (log
  `session.defaultSession.webRequest.onBeforeRequest` once): the Bill's item lookups are
  `run_doc_method`, its background PO/receipt reads `/api/resource/…`, live link searches
  `search_link`.
- Bill steps a probe must answer as a clerk would: Save and Submit ask "receive with this bill?"
  first (`bill-receive-bill-only`), Submit needs the amount due typed (`bill-amount-due`,
  `billCompareTotal`); the page reads the vendor from its box, which `setHeader` does not repaint
  (set the box), and `repaintDoc(app)` repaints the lines. An item code sets its default warehouse
  after a `warehouse` write — give a ZZ item the warehouse as its default instead.
  `closeSourcePickers(app)` closes the picker a vendor pick opens.
- A run that died part way leaves its scene: `npm run dogfood:setup -- --clear <row>` removes it
  (R2-2's approval rule applies to every PO over 99,000 until then; R4-1 puts the login cookie back
  in `finally` — if that never ran, the app asks to log in once).
- To see a page without opening a window, capture it (`wc.capturePage()` from `app.evaluate`) into
  a folder the run names — `r6b4-split-by-need` does it when `PROBE_SHOTS=<dir>` is set.
- Print what was seen with `report(label, obj)` (`PROBE <label> {…}`) as well as asserting, so a
  run is readable later.
- **A probe that passes proves nothing until it has failed on the old code** — put the old file
  back (`git show <sha>:<path> > <path>`), run it, restore. Say in the plan row which code it
  failed on.
- In the ERPNext page call `frappe.xcall`, never `frappe.db.*` (`docs/gotchas.md` G19). To call
  an IPC handler from a probe: `e2e/GOTCHAS.md` #16.

## When a probe becomes a test

When what it proves should stay proven, move it to `e2e/` as a `.spec.js` and give it a family in
`src/architecture-families.js`.
