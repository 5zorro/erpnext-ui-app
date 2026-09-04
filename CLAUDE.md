# CLAUDE.md — erpnext-ui-app

Quick-orientation for compacted or fresh sessions. Read this, then HANDOFF.md.

## What this is

Electron shell that wraps an **unmodified ERPNext** instance with a document-first UI.
Architecture: `Electron shell → HTTP → ERPNext (Docker)`. Vanilla browser on the same
server remains a valid fallback at all times (Clean Core invariant).

## Run / test

```bash
npm test          # required before every push; pure unit tests (node --test)
npm start         # launch the app
npm run start:chaos  # stress test (delayed + out-of-order API calls)
npm run report:input-count  # field-count advertising report
```

## Key files

| Path | Role |
|------|------|
| `HANDOFF.md` | Architecture map, layers, invariants, extension points |
| `docs/implementation-plan-YYYY-MM-DD.md` | Active working plan (temporary; delete when tranche ships) |
| `docs/gotchas.md` | Runtime/architecture lessons from dogfood |
| `src/` | Pure business logic — testable offline, no DOM/IPC |
| `electron/main.js` | Window, views, IPC wiring |
| `electron/doc-form.html` | Unified Doc skin shell (Bill + PO + IR) |
| `electron/home.html` | Doc Workflow Home (tiled launcher) |
| `.cursor/rules/` | Cursor .mdc rules — also apply here (symlinks; gitignored) |

## Active plans (2026-09-03)

- `docs/implementation-plan-2026-07-29.md` — Simplified skin (OI-086), Calculator C0–C3 landed
- `docs/implementation-plan-2026-08-19.md` — Nav instrumentation (OI-126/127/128), all landed
- `docs/implementation-plan-2026-09-03.md` — Doc Pay skin: economic batching of outstanding
  Bills (OI-138 / OI-161) — planned, no code yet

Next: **Simplified skin Option B (ground-up)** — S1 lens tab, then S2 form.
Mockups at `docs/mockups/simplified-option-b-ground-up.html` (preferred) and `…-option-a-thin-inject.html`.
Parallel track: Doc Pay skin research done (Packet 0); Packet 1 (`outstanding-bills.js`) next.

## Process rules

- **Commits:** agents commit freely on `alpha` as checkpoints. Only `5zorro` pushes to GitHub.
- **Pure first:** new logic lands in `src/` + `tests/` before `electron/` wiring.
- **Museum privacy:** OI bodies and `decisions.md` prose stay in `~/agent-harness/` (gitignored).
  Public files may cite `OI-NNN + one-line status` only.
- **Ponytail lite:** build what's asked; name the lazier path in one line after delivering.
  Full rule: `.cursor/rules/ponytail-lite.mdc`.
- **`npm test` green** before handing work back to the user.

## ERP source access

| Resource | How to reach |
|----------|-------------|
| Running ERP | `http://localhost:8080` |
| ERP source (frappe/erpnext) | `docker exec frappe_docker-backend-1 ls /home/frappe/frappe-bench/apps/` |
| MariaDB (read-only schema browse) | `localhost:3306` — see `docs/erpnext-schema-browse.md` |
| Docker compose | `~/erpnext/frappe_docker/` |
| Museum / OI inbox | `~/agent-harness/erpnext/doc-shell/open_items.md` (private, not in this repo) |

## Lens system

Three lenses per doctype: `vanilla` (ERP Desk) · `simplified` (in-progress) · `doc` (current skins).
Last-used lens persists via `lens-prefs.js`. Forms follow the last lens on navigation.

## Test strategy (locked)

Layer 1 (pure unit, `npm test`) is the CI gate. Layer 2 (ERP e2e, Playwright browser) and
Layer 3 (shell smoke, Playwright `_electron`) are optional. Never use Selenium as Electron driver.

## Invariants

1. **Clean Core** — never edit `apps/frappe` or `apps/erpnext` inside Docker.
2. **HTTP only** — shell ↔ ERP over network; no direct DB writes from shell.
3. **Pure first** — `src/` logic before `electron/` wiring.
4. **One ERP base** — `src/config.js` / `ERP_BASE` env; no second server URL in panels.
