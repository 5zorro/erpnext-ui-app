# Beta slice (locked until the maintainer revises)

Public / `main` only advances when a **milestone** is green (see the current dated
[implementation-plan-2026-07-15.md](implementation-plan-2026-07-15.md); plans are temporary — see
[../HANDOFF.md](../HANDOFF.md)).

## Current public tip (local `alpha`)

**`0.2.0-alpha.1`** — **Accounts payable daily data entry MVP** dogfood-passed 2026-07-21:
Bill · Purchase Order · Item Receipt Doc skins (read / edit / save / submit), plus T1–T3 Bill chrome.
Not yet promoted to `main`.

Earlier: **M0** chrome + live ERP · **M1/M1.5** Recent · **M2** Home tiles · **M3** Bill Doc.

## Next promotes

| Promote | Milestone | Must have |
|---------|-----------|-----------|
| **1** | AP daily-entry MVP (`0.2.0-alpha.1`) → `main` when you choose | Bill + PO + IR Doc read/edit/save/submit; units green; dogfood OK |
| **next** | Doc chrome from D-DocChrome (OI backlog in museum `open_items.md`) | Copy / Closed / ribbons / Recalc / Pay Bill / etc. as picked |

How: [implementation-plan-2026-07-18.md](implementation-plan-2026-07-18.md) (T1–T4 done at MVP; deferred packets). Discovery IDs live only in museum `open_items.md` (private issues list — not copied here).

## Then (tests may reorder)

Deferred packets (Home, bowtie, shell utils, Doc chrome, etc.) — pick deliberately from museum `open_items.md`; do not reopen museum *code* for layout ideas once an OI captures the intent.

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
