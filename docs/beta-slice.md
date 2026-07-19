# Beta slice (locked until the maintainer revises)

Public / `main` only advances when a **milestone** is green (see the current dated
[implementation-plan-2026-07-15.md](implementation-plan-2026-07-15.md); plans are temporary — see
[../HANDOFF.md](../HANDOFF.md)).

## Current public tip (local `alpha`)

**M0** chrome + live ERP · **M1/M1.5** Recent · **M2** Home tiles · **M3** Bill Doc —
ready to promote when you push.

## Next promotes

| Promote | Milestone | Must have |
|---------|-----------|-----------|
| **1** | M0–M3 bundle (when dogfood OK) | Bill Doc read/edit/save; units green |
| **next** | T1–T2 from dated plan | Link pickers + Select PO (source modal) |

How: [implementation-plan-2026-07-18.md](implementation-plan-2026-07-18.md) (architecture batches T1–T4; deferred packets sketched).

## Then (tests may reorder)

Work follows **T1→T4** in the dated plan, then deferred packets (Home OI-050/051, bowtie PoC, shell utils, etc.).

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

**5zorro** alone **pushes** to GitHub. Agents may **commit** locally without waiting for a push.

Museum (frozen): `~/agent-harness/erpnext/doc-shell/`  
Process ADR: `~/agent-harness/docs/adr-0002-docflow-rebuild-agpl-alpha-stable.md`
