# Commit messages (this repo)

We are a small AGPL app with one maintainer. Borrow **discipline** from Zulip, not the full
contributor gauntlet.

## Commit vs push

- **Agents commit** locally whenever useful (including dogfood `checkpoint:` commits).
- **Only 5zorro pushes** to GitHub. Commits stay on the machine until a maintainer push.
- Before a public push: tidy history if needed (`rebase`/`squash`); keep promote-ready commits coherent.

## Do

- **One coherent idea per commit** for promote-ready work (Zulip / Git project rule). Checkpoints may be looser.
- Imperative subject, ~50 chars: `Add DB health ping helpers` not `Added stuff`.
- Put **tests in the same commit** as the code they cover when shipping a feature (`npm test` green).
- Optional body for *why*; link milestone (`M0`, `M1`) when useful.
- Author as **5zorro** + GitHub noreply (already set in this clone’s local config).

## Optional Conventional Commits (prefix)

Useful for scanning history; not enforced by CI yet:

| Prefix | Use |
|--------|-----|
| `feat:` | User-visible capability |
| `fix:` | Bug fix |
| `test:` | Tests only |
| `docs:` | Docs only |
| `chore:` | Tooling / deps |

Examples:

```
feat(M0): add Home / Vanilla toolbar and DB health light

Pure health + chrome-state modules with unit tests; Electron shell wires them.
```

```
docs: align beta-slice with M0/M1 promote plan
```

## Don’t

- `Co-Authored-By` / promo trailers.
- “fix tests” follow-up commits — amend or fold into the feature commit locally before push.
- Mixing unrelated features in one commit.
- Using your personal email on public commits.

## Zulip vs us

Zulip reviews demand a clean **public** history and often many revisions. Solo here: keep commits
readable; interactive rebase before you push `alpha`/`main` is enough. No need for their full
docs/contributing stack until outside contributors show up.
