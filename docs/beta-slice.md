# Beta slice (locked until the maintainer revises)

Public / `main` only advances when a **milestone** is green (see [implementation-plan.md](implementation-plan.md)).

## Current public `main`

Scaffold + docs. **M0 chrome lives on `alpha` until promoted.**

## Next promotes (first “real” beta)

| Promote | Milestone | Must have |
|---------|-----------|-----------|
| **1** | **M0 — Chrome + live ERP** | Home, Vanilla → real Desk/login, DB health; unit tests for health + chrome-state + nav-guard |
| **2** | **M1 — History flyout** | Deduped doctype history (pure `pushHistory` + UI); unit tests for route parse / dedupe / cap |

M0 and M1 may ship as **one** `main` release or two — both are “ready for push” only after offline units pass.

## Then (tests may reorder)

3. **M2** — ERP WebContents + real Home (shell reaches sandbox; Vanilla Desk).
4. **M3** — Doc skin **Bill** read+save (`set_value` discipline); offline units + optional smoke skip-OK.
5. **M4+** — More doctypes / tools; then OI-040…044 (tint, bowtie, nickel UI, series, date filter).

## Hard rules

- Offline unit suite always green (`npm test`) with **no** live server required for merge.
- Smoke e2e (when added) may skip if ERP is down — never the only gate.
- Architecture: shell → HTTP → **unmodified** ERPNext; stock browser still used for troubleshooting.

## Process

| Branch | Role |
|--------|------|
| `alpha` | Day-to-day work |
| `main` | Stable / publishable milestones only |

**5zorro** alone pushes to GitHub.

Museum (frozen): `~/agent-harness/erpnext/doc-shell/`  
Process ADR: `~/agent-harness/docs/adr-0002-docflow-rebuild-agpl-alpha-stable.md`
