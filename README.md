# erpnext-ui-app

Standalone **desktop UI + tools** for [ERPNext](https://erpnext.com/) / Frappe — Doc-style forms, chrome, and shortcuts that behave like an app, while the backend stays **unmodified vanilla ERPNext**.

**License:** [AGPL-3.0-or-later](LICENSE)

> **Alpha stage.** While Alpha only pushes to `main` when tests pass, there is still a high likelihood of broken links or similar issues if you do not have the exact ERPNext modules installed as in the test environment. Please file problems in [GitHub Issues](https://github.com/5zorro/erpnext-ui-app/issues); **5zorro** will read them and decide the best path forward.

## Why this exists (product purpose)

This shell is not a second ERP. It exists to make daily books work safer and more familiar on ordinary office PCs:

1. **Interface hygiene** — Fewer jarring switches between 
 - input pages (toolbar, history, Doc vs Vanilla, and the forms themselves). Same job, less mode thrash.
 - input interfaces (qwerty, 10-key, and mouse). Same input, less input changes.
2. **Security on non-enterprise PCs** — Many workstations have no corporate browser lockdown. A normal browser with extensions can read data on **every** site the user visits, including ERPNext. A dedicated desktop shell talks to your Books server over HTTP and does not inherit the whole extension ecosystem of a general-purpose browser. (Vanilla browser access remains available for troubleshooting; it is not the recommended daily path on an unlocked PC.)
3. **Document-view-first and process-first flows** — Layouts and workflows that match how people already think about paperwork (years on a document-first UI train the fingers the same way years on a QWERTY keyboard do, and users are simply "faster/smarter" if they keep the same keyboard shortcuts and similar flows). The aim is verification and data entry that feel like the expected format, not a generic dense database input and navigation grid by default.

**Target display:** design primarily for a **1080p 16:9** monitor at full screen, or a **4K 16:9** monitor at half (longer on the vertical edge) or quarter screen. Prefer flexible layout (so other sizes still work) over hard-coded one-resolution UI.

### Fewer things to click, measured, not asserted

Every lens is scored the same way: count the actual interactable controls (fields, buttons,
tabs) on a representative one-line Purchase transaction. **Doc** is a purpose-built form;
**Simplified** is stock ERPNext with an assumptions bar that pre-fills or quiets the fields
a given doctype's Doc skin already owns. Competitor products are deliberately left out of
this table (elevated advertising-claim risk for an unaffiliated comparison).

| Transaction | Vanilla ERPNext | Simplified skin | Doc skin |
|---|---|---|---|
| Bill (Purchase Invoice) | 65 | 54 (−17%) | 57 (−12%) |
| Purchase Order | 58 | 48 (−17%) | 39 (−33%) |
| Item Receipt (Purchase Receipt) | 66 | 56 (−15%) | 56 (−15%) |

Both alternate lenses cut real interactables versus stock ERPNext on every transaction type
that has one; **Doc vs Simplified is not a race** — read the two independently, not against
each other (methodology and why: `docs/input-count-gotchas.md`, gotcha G11).

Caveats, stated plainly: Vanilla's column is a representative-density fixture, not a live
Desk HTML dump (gotcha G1); Simplified's seed profiles for Purchase Order and Item Receipt
shipped 2026-09-05 and have not yet been dogfooded end-to-end. Reproduce with
`npm run report:input-count`.

## Architecture (same as the prior decision log)

| Layer | What it is |
|-------|------------|
| This repo | Electron shell, Doc skin, shortcuts, history, tools |
| ERPNext | Unmodified server — also usable in a normal browser for troubleshooting |
| Link | HTTP / API only (Clean Core: no edits under `apps/frappe` or `apps/erpnext`) |

Language for this tree: **plain JavaScript** . That is a tooling choice, not an architecture change.

**M0–M2** chrome, history, Doc Workflow Home · **M3** Bill Doc binder · **T4** PO + IR Doc skins —
AP daily-entry MVP on `alpha` / `main`. Active how:
[docs/implementation-plan-2026-07-29.md](docs/implementation-plan-2026-07-29.md) (Vanilla Simplified /
OI-086 — temporary working plan).

## Develop

```bash
cd ~/erpnext-ui-app
npm install
npm test
npm run test:e2e:xvfb   # optional Playwright Electron smoke (health ping)
npm start
```

In the app: **Home** is the museum-style **Doc Workflow Home** (grouped tiles). Click a tile to open
that ERP route. **Vanilla skin** → Desk; **ERP console** → DevTools for dogfood. Left **Recent** updates as you browse.

**Plan (working, dated):** [docs/implementation-plan-2026-07-18.md](docs/implementation-plan-2026-07-18.md) · **Handoff / doc lifecycle:** [HANDOFF.md](HANDOFF.md) · **Beta:** [docs/beta-slice.md](docs/beta-slice.md) · **Commits:** [docs/commit-conventions.md](docs/commit-conventions.md)

## Related

- Process: unit tests first; `alpha` → `main` when a milestone is green; agents may **commit** freely — only the maintainer **pushes** GitHub.
- Clean Core: never edit vendor ERPNext/Frappe in place — customize via fixtures / HTTP shell only.
