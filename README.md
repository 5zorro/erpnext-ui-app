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

**Status:** Scaffold + **M0/M1 on `alpha`** (chrome, live ERPNext, deduped history). Promote when ready.

## Develop

```bash
cd ~/erpnext-ui-app
npm install
npm test
npm start
```

In the app: **Open Desk / Login** → browse doctypes → left **Recent** list updates (one row per doctype).
**Home** returns to the local Home pane; session stays.

**Plan:** [docs/implementation-plan.md](docs/implementation-plan.md) · **Beta:** [docs/beta-slice.md](docs/beta-slice.md) · **Commits:** [docs/commit-conventions.md](docs/commit-conventions.md)

## Related

- Process ADR: `~/agent-harness/docs/adr-0002-docflow-rebuild-agpl-alpha-stable.md`
- Clean Core ADR: `~/agent-harness/docs/adr-0001-clean-core-erpnext-addon.md`
