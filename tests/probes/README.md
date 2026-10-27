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
npm run probe -- df03-item-table --grep=T-2   # only the tests whose title matches
```

**Each run has its own profile folder** (plan 2026-10-26; `scripts/test-profile.js`, the probe
config's global setup): a throwaway copy of `~/.config/erpnext-ui-app/` seeded with the prefs and
the login cookies, not the logs or the Doc page's Local Storage (column widths and the calculator's
rounding start at their defaults). The app moves its `userData` there when `E2E=1`. So a probe never
touches 5zorro's prefs, login, Drafts shelf or `nav-debug.log`, and **runs while his app is open**
(`--with-app-open`, from before, is ignored). After the run, its `nav-debug.log` / `focus-debug.log`
are kept in `test-logs/profile-logs/probe/` and the folder is deleted. `scripts/run-probe.js`
runs headless with `WAYLAND_DISPLAY` and `DISPLAY` cleared (a window on his desktop takes his
keyboard). **One probe run at a time:** a second waits for the first (`test-logs/probe-run.lock.json`,
up to an hour), because a run starts by retiring any probe user left in the lock, which would end
the other run's clerk mid-test. The seed copy is taken while his app may be writing: a torn
`Cookies` copy would show as a probe that is not logged in — run it again. Proven 2026-10-26: a probe run left nothing changed in the real folder (the code before
changed 12 files there), and ran beside a second copy of the app (the code before refused, exit 3).

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

## Acting as a clerk, not Administrator — `probe-user.js`

Administrator reads everything, so a probe run as Administrator never meets a refusal a clerk would
(review 10-19 R7-4: a Purchase User may not read Sales Orders, and the PO's Select PO spun for good).
**5zorro 2026-10-24: most real users have limited permissions, so a probe should act as one.** New
probes act as a clerk with the roles that clerk would have. An existing probe moves over when it is
next touched. Set the scene as Administrator (records, accounts and rules a clerk cannot make), then:

Most probes should act as one of the **two clerks** in `probe-user.js` (5zorro 2026-10-25), built
from ERPNext's own roles: `AP_CLERK` (edits most things, and receives goods) and `AR_CLERK` (sales
orders, POs, sales invoices, payments received; reads payables; cannot make a vendor or an item).
Use a bare role list only to pin one role's refusal, as R7-4 does.

```js
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";
const clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name }); // zz-probe-ap-clerk@…
// or one role set: await loginAsProbeUser(app, ["Purchase User"]); // exactly these roles
try {
  // …drive the pages as the clerk…
  await clerk.back(); // Administrator again, e.g. to clean up (no password: the app's own cookies)
} finally {
  await clerk.retire(); // back(), then disable the user and end its sessions
}
```

- **Leaving an unsaved Doc page:** the shell's way back to Administrator is held by its Save / Discard
  gate, so `back()` reloads the ERPNext page itself when that has not taken within 10 s
  (`probe-user-reload` in the output). Otherwise the page keeps the clerk's CSRF token and every call
  fails.
- **Not done yet (2026-10-25):** the `@dogfood` set (`npm run dogfood:check`) and the `@nav` matrix
  (`npm run nav:check`) still act as Administrator; moving each set to the clerks is one sweep each,
  unblocked since 5zorro described his clerks. Until then these paths swept off `frappe.db` (review
  10-19 R7-5) have never run as a clerk, only as Administrator: the address picker (a filter on the
  Dynamic Link child table), the Bill's account-company check and vendor ranking, the PO / receipt
  terms read, the Bill line → Sales Order list, and Pay Bills' supplier payments. A refusal there now
  shows its reason instead of hanging, but whether a clerk *is* refused is unproven.
- One user per role set, `zz-probe-<roles>@example.com`, or per named clerk, `zz-probe-ap-clerk@…` (first name *ZZ Probe*), made on first use
  and reused. It is **disabled between runs**, and every run gives it a fresh random password that
  is never written down. Sandbox only (`assertSandboxSite`).
- **Interrupted runs:** the lock file `test-logs/probe-user.lock.json` names the user while it may be
  enabled. After the run ends any way (pass, fail, Ctrl+C, SIGTERM), `run-probe` retires it (its
  login was only ever in the run's own profile folder). A `run-probe` that was itself killed
  (kill -9) leaves the lock, and the next `npm run probe` (even with no probe named) retires the
  user then. Proven 2026-10-24: Ctrl+C mid-probe left the user disabled with
  no sessions and the Cookies file byte-identical; after a kill -9 the next run retired it.
- Retiring uses `bench execute` in the backend container (`ERP_BACKEND_CONTAINER`, `ERP_SITE` to
  override), so it needs no login.
- **What a refusal looks like:** a refused `frappe.xcall` rejects with nothing. Read the reason with
  `reasonFrom` (`src/erp-refusal-reason.js`), or the clerk sees "undefined" (the R7-4 probe found it).

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
`nav-state.json` before each launch (fresh rail) — in the run's own profile folder
(`runProfileDir()`, which refuses outside a run). It makes `ZZ-NAV-A` / `ZZ-NAV-B` drafts and deletes them, and
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

## Dogfood residuals

What 5zorro tries by hand for the fixes of the architecture review (plan 2026-10-19, closed
2026-10-25), and what each should do. `npm run dogfood:check` reads **this** table (it moved here
from the plan when the plan closed, so the check outlives plans); a row's id is its first cell. A
new row goes here, with a `@dogfood <id>` probe.

| Fix | What to try | Expect |
|-----|-------------|--------|
| R9 (batch method change) | Method… on a vendor with 3+ bills, where ERPNext will refuse one (e.g. a bill whose posting date falls in a closed period) | Chips move bill by bill; the batch stops at the refused one; Try again offers the untouched rest; Done refreshes the board |
| R9-1 | Same, with the refusal at **submit** | That bill's chip: "Cancelled — `<name>-1` not submitted"; the copy is a draft in ERPNext |
| R6c-2 | A Bill from a PO under `npm run start:chaos` until enrich gives up (~2 min) | PO/receipt fields say "Couldn't load — press Refresh"; Save says Refresh, not wait |
| R10c-1 | Pay a batch where submit is refused | Drawer names the draft; it appears under Draft payments at once |
| R10c-3 | Create a term that already exists with the same numbers (the never-run-live path) | "Created … (reusing the existing …)" — and a term with different numbers is refused naming the field |
| R6c-4 | A just-in-time receipt whose submit ERPNext refuses | No draft Purchase Receipt left behind |
| R2-2 | Assign a Bill line to a Sales Order where ERPNext will refuse the bridge PO's submit (a closed period does not apply to a PO; `npm run dogfood:setup -- R2-2` makes an approval rule that does) | Status: "Line N assigned. The Purchase Order for it was not made: ERPNext refused to submit it (…). Nothing was left behind." No draft PO |
| R6b-1 / R6b-2 | A Bill for a vendor made with *Create Vendor…* (no terms): type the due date first, then the lines; Save; change a qty; Save | Both saves go through. Any refusal on the status line is ERPNext's one sentence — no traceback, no "Message … Confirm" |
| R6b-4 | Two Sales Orders for one item (needing 6 and 2); a Bill line of 8, then 5, then 10, each *Assign…*ed to both | 8: no box, PO 6 / 2. 5: "Costing Assumptions!" 4 / 1 — tick one *Fill from stock* and it redraws; Okay makes the PO. 10: 6 / 2 and "2 more … → into stock". Each PO line opens its Sales Order line; the PO and orders carry a *Costing assumptions:* comment. Open each Sales Order: its line's Sources cell ends with *Costing* (×2 after the second bill), and it opens the same box, read-only, that order in bold |
| R10a-1 / R10b-1 | Pay Outstanding with an installment bill that was part-paid in Vanilla | The vendor card owes what ERPNext's A/P report says, on the later installment; the board opens without a pause per bill |
| R10a-3 | Pay Outstanding prefs: next check run 2026-12-25, every 14 days | Run strip: "… That day is a weekend or bank holiday — “Do this run today” runs it before." |
| R2-1 | Under `npm run start:chaos`, click Save on a Bill and log out in a browser tab before it finishes, or restart Docker mid-save | The button comes back with "The ERPNext page reloaded before the step finished" — it never spins forever; Edit / New work without restarting |
| R4-1 | Leave the app open and idle past the site's *Session Expiry* (170 h here; shorten it in System Settings to try) | On returning to the window the toolbar offers *Log in*; the health dot stayed green throughout |
| R4-2 | Find on a list over 200 rows, stop ERPNext, click Show more | The rows already shown stay; "Could not read more…" under them and the button reads Try again |
| R5b-2 | Import 10+ lines on a Bill and stop ERPNext (or log out in a browser tab) part way | "Import stopped at line N of M: … Lines 1–(N−1) are on the form." — those lines show on the page; the line table and Import were locked while it ran |
| R5b-1 | Under `npm run start:chaos`, type an item number you know fast and Tab; then a partial number and Tab at once | The exact number is taken at once; the partial one waits a beat, then takes the first match and moves on. Never an item from the list you typed past |
| Warm lists 1 (HANDOFF § Warm pick lists) | Open a Bill under `npm run start:chaos`; type a vendor, then an item | Lists appear without "Searching…"; the order is the one you know. **First run at production size:** `nav-debug.log` `link-list loaded dt=Item rows=… ms=…` says what the item copy costs |
| Warm lists 2 | Add a vendor through Create Vendor…, come back, type part of it | It is listed at once (a check runs on the peek's return) |
| D1 | Open a vendor dropdown, go to Vanilla, come back | The dropdown is closed |
| D2 | Pick a vendor deleted in another window (or type one that never existed and leave the box) | Banner across the top naming it; no source picker; the box shows the bill's old vendor |
| R5b-5 | On a new PO: type a vendor that does not exist, choose *Create Vendor…*, Esc, then Tab on into the dates and type | Banner naming it ("…the purchase order keeps its old one"); no source picker, then or later |
| R5b-6 / R5b-7 | First thing after starting the app: on a new PO type the first few letters of a vendor fast and Tab at once; close the source picker and type an item right away | The vendor is picked (sources open); the item goes in whole and you stay on its line when the vendor settles ~10 s later |
| D3 | Set a vendor on a new Bill under chaos | The page stays responsive; sources open within ~10 s for a vendor with no address on file, sooner for one with |
| R5-1 | Enter a long Bill (20+ lines, many edits), then scroll the line table | Scrolling stays smooth all day; an open dropdown follows its cell |
| R2-7 | Allocate a charge to stock where one line's rate cannot be set | "… Nothing was changed." — the other lines keep their old rates |

### How the check and the setup work (2026-10-23)

5zorro: "the dogfood residuals seem a little daunting. the setup for several of them are simply not
in the currently 'mostly empty' sandbox … I don't want to spend the majority of my time setting up
the dogfooding. I do want to do the dogfooding as the ultimate e2e test on the feel." So each row
gets two things that share one piece of setup code:

1. **A check before he dogfoods.** `npm run dogfood:check` runs every probe tagged with a row
   (`@dogfood <row>` in its header; a row's id is its first cell without the bracket) and prints the table above as pass / fail / *yours* (no probe:
   only a person can judge it). He dogfoods once it is green. The run's table is written to
   `test-logs/` too.
2. **Setup that stays.** `npm run dogfood:setup -- <row> …` makes the row's records on the sandbox
   and leaves them (a vendor with 4 bills, a 25-line draft bill, two Sales Orders needing 6 and 2…),
   named `ZZ DF …`, and prints where to look. `npm run dogfood:setup -- --clear` removes them
   (cancelling what was submitted — those stay, cancelled). A new row costs one setup step.

The setup code is `tests/probes/dogfood-scenes.js` (one *scene* per row: make, clear, where to
look); the probes call the same makers and clear after. Both run through `run-probe.js` (each run in
its own profile folder, so the app may stay open) and the leaves-records rules
(`assertSandboxSite`; submitted records are cancelled, not deleted).

**How the "ERPNext refuses" rows are made, from ERPNext's own checks (no site settings touched):**
a bill whose Purchase Order is **On Hold** cannot be cancelled (`purchase_invoice.py` `on_cancel` →
`check_for_on_hold_or_closed_status`); a bill whose expense account is **disabled** after it was
submitted cancels, and its amended copy saves, but the copy's submit is refused
(`general_ledger.py` `validate_disabled_accounts` runs only when ledger entries are made). Each
scene's own records only — a ZZ account, a ZZ Purchase Order.

**"ERPNext stops" rows** (R4-2, R5b-2, R6c-2) make the app's requests to ERPNext fail from inside the
run (the ERP view's session refuses them) instead of stopping Docker; R2-1 reloads the ERPNext page
mid-save; R4-1 removes the login cookie and puts it back after.

**Yours only:** how it *feels* — smooth scrolling (R5-1's "all day"), "a beat" (R5b-1), and warm
lists at ~20k items. The check proves the behavior; it says *yours* next to the feel.

Build order: the runner, setup and scenes with the R9 group (the most setup), then the rest by group.

**Built 2026-10-23 — every row has a probe** (`npm run dogfood:check` runs all 25 rows' probes,
~25 min, mostly R6c-2's give-up and R4-2's 205 drafts). Scenes for `dogfood:setup`: R9, R9-1,
R10c-1, R2-2, R6c-4, R10c-3, R4-2, R6b-4, R6b-1 / R6b-2, R5-1, R6c-2 (`-- --list` says what each
makes). Notes per row:

- **Simulated, not ERPNext's own refusal:** R2-7 (no plain-bill path refuses a line rate; the
  ERPNext page's bridge refuses one call). Every other "ERPNext refuses" row uses a real ERPNext
  check: PO On Hold (R9), disabled expense / bank / stock account (R9-1, R10c-1, R6c-4), an
  Authorization Rule (R2-2), an existing Payment Term (R10c-3).
- **"ERPNext stops":** the app's session refuses the matching requests (R4-2, R5b-2, R6c-2, Warm
  lists 1–2); R2-1 holds the save call in the ERPNext page and reloads inside it; R4-1 takes the
  login cookie out and puts it back.
- **Run on the old code:** R9, R9-1, R10c-1, R6c-4 and R5b-2 failed first on what they found (DC-1–3).
  Not re-run on pre-fix code: R10c-3, R2-7, D1, R5-1 (the pre-fix picker no longer loads in today's
  page), R4-2, R2-1, R4-1, D3 — each fix was proven when it was made.
- **Yours, still:** the feel — "smooth all day" (R5-1), "a beat" (R5b-1), warm lists at ~20k items.

**End-of-session review (2026-10-24, of `99ef999..d1e2f79`).** Fixed: `reasonFrom`'s
fallback to `frappe.last_response` now reads it only when that reply refused (a raised message or a
traceback) — a call that died with no reply leaves an earlier successful reply there, whose notes
would have been shown as the reason (G22). Proven: DC-3's "ERPNext did not fill in" check does not
fire on a slow ERPNext that still answers (R5b-2's probe holds each lookup 3 s: "Imported 2 line(s).").
Shared probe steps (`closeSourcePickers`, `repaintDoc`); the affected rows re-run, all pass. Checked
and fine: the Costing chip's `get_docinfo` is one bounded read per Sales Order open (10 versions, 21
messages, the order's comments; read permission); a costing note is drawn as text only, its PO route
encoded; the scenes touch only `ZZ DF …` records, a `ZZ DF` term description, the `ZZ-DF-` order
prefix and one Authorization Rule (removed by `--clear`) — plus the four board payment methods, left
on purpose. Open for 5zorro: DC-4; whether the board should offer only methods the site has.

**Found by the check** (each fixed and re-proven by the probe that found it):

- **DC-1 (R9): every refusal inside an ERPNext-page write read "Payment Entry request failed."**
  `frappe.xcall` rejects with `r.message`, which a refused call does not have — ERPNext's reason is
  in the reply's `_server_messages` / `exc`. So the batch said "ACC-PINV-… — not changed. Payment
  Entry request failed." for a bill whose Purchase Order is On Hold (a bill, not a payment). The
  reader (`reasonFrom`, used by 16 page scripts: payments, void and amend, the method change) is now
  `src/erp-refusal-reason.js`, tested, and falls back to `frappe.last_response` the way the Bill page
  does (R6b-2): "Purchase Order PUR-ORD-2026-00002 status is On Hold." Two copies became one.
- **DC-2 (R9-1, R10c-1, R6c-4): ERPNext's reason ran into the shell's advice, and two scripts showed
  its HTML.** ERPNext's messages often end without a full stop ("… disabled accounts: ZZ DF Bank -
  USE Finish or delete it …"): `endSentence` ends them in the method-change summary, the payment
  drawer and the just-in-time receipt status. The bridge PO and just-in-time receipt scripts had
  their own reader that took ERPNext's *first* message as HTML ("<br><strong>ZZ DF Stock -
  USE</strong>" on the status line); both use the shared `reasonFrom` now — the raised message,
  stripped. (For R2-2's approval rule that is ERPNext's raised "Can be approved by Guest" rather
  than the note before it, "Not authorized since Grand Total exceeds limits".)
- **DC-3 (R5b-2): an Import with ERPNext stopping part way said "Imported 12 line(s)."** Writing a
  line's item code succeeds on the form even when ERPNext never answers the item lookup
  (`run_doc_method`), so lines 5–12 sat on the form with no name, unit or account and nothing said
  so — R5b-2's stop only caught writes the bridge refused. `applyImportedItemRows` now stops when an
  item code comes back with neither a name nor a unit: "Import stopped at line 5 of 12: ERPNext did
  not fill in SAMPLE-SKU-01 (…). Lines 1–4 are on the form." Not changed: an item typed by hand into a
  cell while ERPNext is down shows the same blank name — visible on the line, so left as is.
- **DC-4 (open — moved to plan 2026-10-24, the navigation spine; seen while building R2-1's probe): an unsaved new Bill does not
  survive the ERPNext page reloading.** With chaos delaying the save call, the reload landed
  *before* it was sent: the reloaded page held a blank new Purchase Invoice, the save ran against
  that, and ERPNext answered "Supplier is required." — while the Doc page still showed the vendor and
  line the clerk typed. R2-1's fix covers a reload *during* a step (proven: "The ERPNext page reloaded
  before the step finished."); nothing covers the form itself being replaced. Options: (a) on an
  ERPNext page reload under an unsaved Doc, say so ("ERPNext reloaded; this bill was not saved —
  Save again to send it") and re-send the typed values; (b) only say so; (c) leave it (a reload
  mid-typing is rare). Not built.
- **Noted, not changed:** a blank ERPNext has none of the payment methods the board offers
  (USPS_Check, ACH, DOM_WIRE, INT_WIRE); choosing one in Method… would have every amended bill
  refused. The R9 scene makes them on the sandbox. A real site sets its own up; whether the board
  should offer only methods the site has is 5zorro's call.
