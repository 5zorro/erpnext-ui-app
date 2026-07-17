# Beta slice (locked until the maintainer revises)

Public / `main` only advances when a **milestone** is green (see the current dated
[implementation-plan-2026-07-15.md](implementation-plan-2026-07-15.md); plans are temporary — see
[../HANDOFF.md](../HANDOFF.md)).

## Current public tip (local `alpha`)

**M0** chrome + live ERP · **M1/M1.5** Recent history · **M2** launcher tiles + ERP console — ready to promote when you push.

## Next promotes

| Promote | Milestone | Must have |
|---------|-----------|-----------|
| **1** | **M0+M1+M1.5** (this bundle) | Home→`/`, Vanilla Desk/login, DB health, Recent 7 + Older |
| **next** | **M3** | Bill Doc binder pattern + dirty-gate units |

How / scaffold POC matrix: [implementation-plan-2026-07-15.md](implementation-plan-2026-07-15.md).

M0 and M1 may ship as **one** `main` release or two — both are “ready for push” only after offline units pass.

## Then (tests may reorder)

3. **M2** — ERP WebContents + real Home (shell reaches sandbox; Vanilla Desk).
4. **M3** — Doc skin **Bill** read+save (`set_value` discipline); offline units + optional smoke skip-OK.
5. **M4+** — More doctypes / tools; then OI-040…044 (tint, bowtie, nickel UI, series, date filter).

## Hard rules

- Offline unit suite always green (`npm test`) with **no** live server required for merge.
- Full automated confidence (when built): units + Playwright browser→ERP workflows + sparse
  Playwright Electron shell smoke — see `HANDOFF.md` Test strategy (OI-049). Smoke/e2e may skip if
  ERP or display is down — never the only gate.
- Architecture: shell → HTTP → **unmodified** ERPNext; stock browser still used for troubleshooting.

## Process

| Branch | Role |
|--------|------|
| `alpha` | Day-to-day work |
| `main` | Stable / publishable milestones only |

**5zorro** alone pushes to GitHub.

Museum (frozen): `~/agent-harness/erpnext/doc-shell/`  
Process ADR: `~/agent-harness/docs/adr-0002-docflow-rebuild-agpl-alpha-stable.md`
