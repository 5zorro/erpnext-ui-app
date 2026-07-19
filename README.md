# erpnext-ui-app

Standalone **desktop UI + tools** for [ERPNext](https://erpnext.com/) / Frappe — Doc-style forms, chrome, and shortcuts that behave like an app, while the backend stays **unmodified vanilla ERPNext**.

**License:** [AGPL-3.0-or-later](LICENSE)

## Why this exists (product purpose)

This shell is not a second ERP. It exists to make daily books work safer and more familiar on ordinary office PCs:

1. **Interface hygiene** — Fewer jarring switches between 
 - input pages (toolbar, history, Doc vs Vanilla, and the forms themselves). Same job, less mode thrash.
 - input interfaces (qwerty, 10-key, and mouse). Same input, less input changes.
2. **Security on non-enterprise PCs** — Many workstations have no corporate browser lockdown. A normal browser with extensions can read data on **every** site the user visits, including ERPNext. A dedicated desktop shell talks to your Books server over HTTP and does not inherit the whole extension ecosystem of a general-purpose browser. (Vanilla browser access remains available for troubleshooting; it is not the recommended daily path on an unlocked PC.)
3. **Document- and process-first flows** — Layouts and workflows that match how people already think about paperwork (years on a document-first UI train the fingers the same way years on a QWERTY keyboard do, and users are simply "faster/smarter" if they keep the same keyboard shortcuts and similar flows). The aim is verification and data entry that feel like the expected format, not a generic dense database input and navigation grid by default.

**Target display:** design primarily for a **1080p 16:9** monitor at full screen, or a **4K 16:9** monitor at half (longer on the vertical edge) or quarter screen. Prefer flexible layout (so other sizes still work) over hard-coded one-resolution UI.

## Architecture (same as the prior decision log)

| Layer | What it is |
|-------|------------|
| This repo | Electron shell, Doc skin, shortcuts, history, tools |
| ERPNext | Unmodified server — also usable in a normal browser for troubleshooting |
| Link | HTTP / API only (Clean Core: no edits under `apps/frappe` or `apps/erpnext`) |

Language for this tree: **plain JavaScript** . That is a tooling choice, not an architecture change.

**M0–M2** chrome, history, Doc Workflow Home · **M3** Bill Doc binder (`bill.html` + `set_value`
lines) — on local `alpha`. Active how: [docs/implementation-plan-2026-07-18.md](docs/implementation-plan-2026-07-18.md).
Promote when ready.


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

- Process: unit tests first; `alpha` → `main` when a milestone is green; only the maintainer pushes GitHub.
- Clean Core: never edit vendor ERPNext/Frappe in place — customize via fixtures / HTTP shell only.
