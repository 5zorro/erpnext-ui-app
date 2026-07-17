# erpnext-ui-app

Standalone **desktop UI + tools** for [ERPNext](https://erpnext.com/) / Frappe — Doc-style forms, chrome, and shortcuts that behave like an app, while the backend stays **unmodified vanilla ERPNext**.

**License:** [AGPL-3.0-or-later](LICENSE)

## Why this exists (product purpose)

This shell is not a second ERP. It exists to make daily books work safer and more familiar on ordinary office PCs:

1. **Interface hygiene** — Fewer jarring switches between input modes (toolbar, history, Doc vs Vanilla, and the forms themselves). Same job, less mode thrash.
2. **Security on non-enterprise PCs** — Many workstations have no corporate browser lockdown. A normal browser with extensions can read data on **every** site the user visits, including ERPNext. A dedicated desktop shell talks to your Books server over HTTP and does not inherit the whole extension ecosystem of a general-purpose browser. (Vanilla browser access remains available for troubleshooting; it is not the recommended daily path on an unlocked PC.)
3. **Document- and process-first flows** — Layouts and workflows that match how people already think about paperwork (years on a document-first UI train the fingers the same way years on a QWERTY keyboard do). The aim is verification and data entry that feel like the expected format, not a generic dense Desk grid by default.

**Target display:** design primarily for a **1080p 16:9** monitor at full screen, or a **4K 16:9** monitor at roughly half or quarter screen. Prefer flexible layout (so other sizes still work) over hard-coded one-resolution UI.

## Architecture (same as the prior decision log)

| Layer | What it is |
|-------|------------|
| This repo | Electron shell, Doc skin, shortcuts, history, tools |
| ERPNext | Unmodified server — also usable in a normal browser for troubleshooting |
| Link | HTTP / API only (Clean Core: no edits under `apps/frappe` or `apps/erpnext`) |

Language for this tree: **plain JavaScript** (same as the frozen museum shell). That is a tooling choice, not an architecture change.

**Status:** Scaffold + **M0–M2 on `alpha`** (chrome, history, launcher tiles, ERP console). Promote when ready.

## Develop

```bash
cd ~/erpnext-ui-app
npm install
npm test
npm run test:e2e:xvfb   # optional Playwright Electron smoke (health ping)
npm start
```

In the app: **Launcher** tiles open Desk routes; left **Recent** updates as you browse.
Toolbar **Home** → ERP `/`; **Vanilla** → `/desk`; **ERP console** → DevTools for dogfood.

**Plan (working, dated):** [docs/implementation-plan-2026-07-15.md](docs/implementation-plan-2026-07-15.md) · **Handoff / doc lifecycle:** [HANDOFF.md](HANDOFF.md) · **Beta:** [docs/beta-slice.md](docs/beta-slice.md) · **Commits:** [docs/commit-conventions.md](docs/commit-conventions.md)

## Related

- Process: unit tests first; `alpha` → `main` when a milestone is green; only the maintainer pushes GitHub.
- Clean Core: never edit vendor ERPNext/Frappe in place — customize via fixtures / HTTP shell only.
