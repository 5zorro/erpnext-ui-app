# Implementation plan 2026-10-31 — dependencies first, then a linter

> **Status 2026-10-31: not started.** Nothing is installed in the repo for it. 5zorro wants to look
> at linter vendors himself, and to have a dependency policy in place, before he says yes to any new
> package. The order is: **(1)** review what is installed now, **(2)** agree the rules for adding a
> package, **(3)** pick a linter under those rules, **(4)** run it in `npm test`. Steps 1 and 2 need
> no new package. Step 3 is his decision.

**Why now.** On 2026-10-31 a linter run from outside the repo found two Bill payment paths that
had been broken since 2026-10-23: Add payment, and Submit on a Bill marked Already paid (fixed in
`5bef496`). An edit had cut one function's end and the next one's start, and no test noticed. The
lint check reported "is not defined" in seconds. The same day, moving printing out of `main.js`
named an import from the wrong module, and the app would not start. The linter did not catch that,
because no-undef does not check imports; the printing spec did. A checker that does both would have
stopped both before any clerk could meet them.

**Why not just add one.** 5zorro, 2026-10-31: *"I have heard of llm injection attacks by having llms
suggest dependencies that can get an updated rootkit, so i am wary, and i want to have a specific
plan (review current and strategy before accepting additional) before i say yes."* The risks he
means, in plain words:

- **A lookalike name.** A suggested package can be a near-copy of a real one's name, published by
  someone else. Anyone can suggest the wrong name, whether a person, an agent or a web page.
- **A good package that turns bad.** A real package's maintainer account is taken over, and a new
  version carries harmful code. Anyone whose version range allows that new version gets it on their
  next install.
- **Code that runs at install.** A package can run a script the moment it is installed, before
  anything in the app uses it.
- **Many packages behind one.** Each package brings the packages it needs, and each of those is
  one more publisher to trust.

## How to handle cross-architecture dogfood

Same as plan 2026-10-03 § *How to handle cross-architecture dogfood*. This plan changes the repo's
process (the *Repo process* family in `src/architecture-families.js`), not what a clerk sees, so it
has no dogfood paper.

### Closeout (before deleting this plan)

Follow `HANDOFF.md` § *Closing a plan*: the policy goes into `AGENT_CONVENTIONS.md` (how agents
behave) and HANDOFF § *Run / validate* (the lint command), then sort any residual with 5zorro.

## Step 1 — what is installed now (a report; nothing changes)

What was seen on 2026-10-31, to check again when the step runs:

| | |
|---|---|
| Packages the app ships with (`dependencies`) | `mammoth` (reads Word files), `pdfjs-dist` (reads PDFs) |
| Packages for building and testing (`devDependencies`) | `electron` (the app's runtime), `@playwright/test` (drives the app in tests) |
| Installed in all | 54 packages (`package-lock.json`, version 3), including each one's own packages |
| Version ranges | all four are `^`, so `npm install` may take a newer minor version. `npm ci` installs exactly what the lockfile says |
| Install scripts | only `fsevents` 2.3.2, which installs on macOS only. Electron 43 has none |
| `allowScripts` in `package.json` | names `electron@33.4.11` (from 2026-07-16). Electron is 43.1.1 now, so the entry looks stale. Find what reads it, if anything, before removing it |

To do in the step, for each direct package: what it is for, who publishes it, how recently it was
released, how many packages it brings, and whether it still earns its place (the ladder in
`AGENT_CONVENTIONS.md`: standard library, then the platform, then a package already installed).
Then run `npm audit` (known vulnerabilities) and `npm audit signatures` (checks that each package
came from the registry unchanged, and which ones say where they were built). Report the results;
change nothing.

## Step 2 — the rules for adding a package (5zorro accepts them before any new package)

A starting draft for him to change:

1. **An agent proposes, never adds.** 5zorro approves each new direct package by exact name and
   version. That covers dev tools, and covers an agent's scratch folder when its output feeds a
   commit. On 2026-10-31 the lint check above ran from a scratch install made without asking:
   ESLint 9.14.0 and `globals` 15.12.0, 88 packages, outside the repo.
2. **A proposal comes with a short dossier:** what it does; the publisher, with the repository link
   checked against the npm page, so a lookalike name shows; how old it is and how widely used; how
   many packages it brings; whether any of them run install scripts; and the cheaper alternative
   the ladder found, if one exists.
3. **Exact versions** for new packages (no `^`), the lockfile always committed, and `npm ci` for
   setting up and for test runs.
4. **Install scripts off by default** (`ignore-scripts=true` in a project `.npmrc`), with a short
   allow-list for a package that truly needs one.
5. **A waiting period** before taking a new version, for example 14 days, because a hijacked
   version is usually found and pulled within days. Check what npm 11 offers for this (its
   `--before <date>` install option) before writing the rule.
6. **An upgrade is its own commit**, with the lockfile's change read and summarised in the message.
7. **The review repeats** before each release, and when a package is added.

## Step 3 — which checker (after 5zorro's own look at the vendors)

What it must catch, from the two real cases above:

- a name used but never defined (the payment paths);
- a named import that the module does not export (the printing move);
- and, a smaller win, imports nobody uses.

Candidates to compare. Fill in the facts during the step, not from memory:

| Candidate | Known going in | To find out |
|---|---|---|
| **ESLint** | The long-standing standard for JavaScript; its `no-undef` rule found the payment bug. Brought 88 packages in a scratch install | Whether a plugin is needed for the import check, and what that adds |
| **TypeScript's checker on plain JavaScript** (`checkJs`, no TypeScript code written) | One package, from one publisher. It reads the JSDoc types already in the code, and reports both undefined names and missing exports | How noisy it is on this codebase at first; whether it can start with only those two kinds of error |
| **Biome** | A single program (written in Rust), shipped as one npm package plus one per operating system | Whether it checks that named imports exist |
| **oxlint** | Same shape as Biome (one program per operating system) | Same question |

## Step 4 — run it in `npm test`

Once a checker is chosen: one `npm test` step, so a failure blocks a commit the way a failing unit
test does (`AGENT_CONVENTIONS.md`). First, settle what it reports on today's code. On 2026-10-31,
`no-undef` / `no-unused-vars` over `electron/main.js` showed, beyond the two fixed bugs, two unused
names: `classifyPrintNavResult` (an import) and a variable `co`. Fix those, or record why they
stay. Start with `electron/` and `src/`, then the tests and scripts.

## Dogfood residuals

| Family | Residual | Status |
|---|---|---|
| — | (none; not started) | |
