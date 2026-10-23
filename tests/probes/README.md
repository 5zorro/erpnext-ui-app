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
the backup and removes any prefs file the run created. It does **not** cover the Doc page's Local
Storage (dragged column widths) — a probe that drags columns puts them back.

## Writing one

- `<review-id or topic>-<what>.probe.js`; the header comment states the question and what the
  probe makes in the sandbox.
- Steps shared by probes are in `probe-helpers.js`: `openNewDoc`, `keys` (real keystrokes —
  `e2e/GOTCHAS.md` #15), `focusTestId`, `escPeek`, `docState`, `erpAnswers`, `inDoc` / `inErp`
  (each gives up after a few seconds, so a stalled page shows as `"TIMEOUT"`, not a hung run).
- Sandbox records a probe makes are named `ZZ…` and deleted in `finally`. It saves a document only
  when that is the question, and deletes it after.
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
