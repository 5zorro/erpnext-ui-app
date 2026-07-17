# Contributing to erpnext-ui-app

This project is AGPL-3.0. By contributing, you agree your work is licensed under the same terms.

## Before you write code

1. Read [docs/beta-slice.md](docs/beta-slice.md) — what belongs on `main` vs `alpha`.
2. Prefer **unit tests** for pure logic (`npm test`). See [HANDOFF.md](HANDOFF.md) **Test strategy**:
   full confidence = units + optional Playwright browser→ERP + sparse Playwright Electron smoke.
   Live ERP / Electron e2e may skip when the server or display is down; they are **never** a
   substitute for unit CI.
3. **Clean Core:** do not patch vendor Frappe/ERPNext. Troubleshoot the server in a stock browser against unmodified ERPNext.

## Commit discipline (Zulip-inspired)

- Each commit is one **minimal coherent idea** and should leave `npm test` green.
- Do not mix unrelated features in one commit.
- No “fix tests” follow-up commits — amend or rewrite so the fixing commit includes the tests.
- No `Co-Authored-By` / promo trailers.

## Branches

| Branch | Use |
|--------|-----|
| `alpha` | Default integration branch for in-progress work |
| `main` | Stable beta only — merge from `alpha` when CI is green for the beta slice |
| `feat/...` | Short-lived; merge into `alpha` first |

## Commit messages

See [docs/commit-conventions.md](docs/commit-conventions.md): one coherent idea, tests in the same
commit, author **5zorro** + noreply. Zulip-level PR theater is not required for solo work.

## Pull requests from outside

Open a PR if you like; **do not expect a merge** until **5zorro** has reviewed (often with Cursor). Random drive-by refactors of scope outside the beta slice will be closed.

## Publishing

Only **5zorro** pushes the public GitHub remote. Agents and contributors do not push `main`/`alpha` to origin unless 5zorro explicitly asks.
