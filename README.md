# erpnext-ui-app

Standalone **desktop UI + tools** for [ERPNext](https://erpnext.com/) / Frappe — keyboard shortcuts, Doc-style forms, and chrome that behave like an app, while the backend stays **unmodified vanilla ERPNext**.

**License:** [AGPL-3.0-or-later](LICENSE)

## Architecture (same as the prior decision log)

| Layer | What it is |
|-------|------------|
| This repo | Electron shell, Doc skin, shortcuts, history, tools |
| ERPNext | Unmodified server — also usable in a normal browser for troubleshooting |
| Link | HTTP / API only (Clean Core: no edits under `apps/frappe` or `apps/erpnext`) |

Language for this tree: **plain JavaScript** (same as the frozen museum shell). That is a tooling choice, not an architecture change.

## Status

Scaffold / process repo (ADR-0002). **Beta slice** is documented in [docs/beta-slice.md](docs/beta-slice.md). Electron chrome is **not** ported yet — unit CI first.

Frozen museum (reference only): `~/agent-harness/erpnext/doc-shell/`

## Develop

```bash
cd ~/erpnext-ui-app
npm test          # offline; no Docker / ERPNext required
```

Branches: work on `alpha`; promote to `main` only when the beta slice is green. **5zorro** pushes GitHub.

## Related

- Process ADR: `~/agent-harness/docs/adr-0002-docflow-rebuild-agpl-alpha-stable.md`
- Clean Core ADR: `~/agent-harness/docs/adr-0001-clean-core-erpnext-addon.md`
