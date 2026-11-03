# Implementation plan 2026-10-31 — dependencies first, then a linter

> **Status 2026-11-01: Step 1 done (the report below); Step 2's waiting rule is in force
> (`.npmrc`: `min-release-age=60`; an advisory fix after 7 days, his yes) and Electron is on 43.8.3
> under it; the checker is chosen: ESLint, with an import rule of our own instead of a plugin (his
> two answers under *Open questions*). Installed at his yes (2026-11-01): `eslint` 10.9.1,
> `@eslint/js` 10.0.1, `globals` 17.12.0, exact, as dev dependencies** — 69 packages added (the
> youngest 62 days old), all with verified registry signatures, none with an install script;
> `npm audit` reports only the `brace-expansion` / `minimatch` findings noted below. **The config and
> the import rule are built (2026-11-02):** `eslint.config.js` and `scripts/eslint-import-names.js`
> (`local/import-names`, parsed with espree, ESLint's own parser; 12 rule tests). The fair test:
> both 2026-10-31 bugs are reported (the payment code before `5bef496`, four undefined names; a
> `print.js` import pointed at the wrong module). Today's `electron/` and `src/`: 52 findings, one
> a real bug (museum OI-196), the rest unused or dead code. Next: Step 4. Nothing is installed in the repo for it. The dependency policy (Steps 1–2)
> still comes before any package goes in. The order is: **(1)** review what is installed now, **(2)** agree the rules for adding a
> package, **(3)** pick a linter under those rules, **(4)** run it in `npm test`. Steps 1 and 2 need
> no new package. Step 3 is his decision.

**Why now.** On 2026-10-31 a linter run from outside the repo found two Bill payment paths that
had been broken since 2026-10-23: Add payment, and Submit on a Bill marked Already paid (fixed in
`5bef496`). An edit had cut one function's end and the next one's start, and no test noticed. The
lint check reported "is not defined" in seconds. The same day, moving printing out of `main.js`
named an import from the wrong module, and the app would not start. The linter did not catch that,
because no-undef does not check imports; the printing spec did. A checker that does both would have
stopped both before any clerk could meet them. A third turned up in the same day's end-of-session review: the
Bill page calls a function it never imports (museum OI-196), so typing a payment terms name and
leaving without picking one does nothing and says nothing.

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

### Step 1 report (2026-11-01; read-only: registry lookups and `npm audit`, nothing installed or changed)

| Package | What for | Publisher (repo checked against the npm page) | Installed | Newest |
|---|---|---|---|---|
| `mammoth` | reads Word files (Papers) | one maintainer, `mwilliamson/mammoth.js` | 1.13.0, released 2026-09-26 (35 days) | the same |
| `pdfjs-dist` | reads PDFs | Mozilla, `mozilla/pdf.js` | 6.3.289, 2026-08-29 (64 days) | 6.4.299, 2026-10-03 |
| `@playwright/test` | drives the app in tests (dev only) | Microsoft, `microsoft/playwright` (Apache-2.0) | 1.61.1, 2026-06-23 | 1.64.1, 2026-10-14 |
| `electron` | the app's runtime (dev dependency; shipped inside the build) | the Electron project (OpenJS Foundation), `electron/electron` | 43.1.1, 2026-07-14 | 45.2.1, 2026-10-31 |

- **54 packages in the lockfile** (43 that install on Linux). The oldest are from 2015; 18 are
  newer than two months, every one of them pulled in by `mammoth` (1.13.0 and its `jszip`
  3.10.2, `dingbat-to-unicode` 1.0.2), `pdfjs-dist` (its optional `@napi-rs/canvas` 1.0.10 builds)
  or the dev tools. `mammoth` 1.13.0 went in on 2026-10-03 (`6b58437`), before the rule; it stays
  until its next upgrade, which follows the rule.
- **`npm audit signatures`:** all 43 have verified registry signatures; 11 also say where they
  were built (attestations).
- **`npm audit`: Electron 43.1.1 has 12 published advisories** (5 high, 4 moderate, 3 low), all fixed
  in later 43.x releases. The ones that matter most for an app that shows ERPNext's pages: a window
  opened from a sandboxed page does not keep the sandbox (fixed 43.4.1), file and http handlers
  allow cross-origin reads (43.4.1), `<webview>` can switch on Node.js in web workers (43.4.1), the
  preload code cache can be poisoned (43.5.0), and an eMudhra certificate mitigation (43.8.1).
  The other is `undici` 7.28.0 (24 advisories), which `@electron/get` uses only to download
  Electron at install; it is never in the app.
- **Install scripts:** `npm install-scripts ls` says none are unreviewed. npm 11.18 already blocks
  a dependency's install script unless `package.json`'s `allowScripts` names it (`npm help
  install-scripts`; its `deny-scripts` page still says scripts run by default; the two pages
  disagree, so the fair test checks it). The `allowScripts` entry `electron@33.4.11` matches
  nothing installed: Electron 43 has no install script. `npm install-scripts prune` removes it.
- **Who controls what:** Playwright is Microsoft's (he avoids tools a competitor of ERPNext
  controls). It is a test driver under Apache-2.0 and is not shipped; noted, not a change.

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
5. **A waiting period of two months** before taking any version (5zorro, 2026-11-01: *"don't
   install anything that hasn't been deployed for at least two months"*), because a hijacked
   version is usually found and pulled within hours or days (both cases under *Step 3* were).
   Set as `min-release-age=60` in a project `.npmrc`. **Checked 2026-11-01 on npm 11.18.0:** the
   value is in days (`npm help config`), `npm config get min-release-age` reads it back (`before`
   stays null), and a dry run of `electron@43` picked 43.5.1 (61 days old) with it and 43.8.6
   (1 day) without. A version too new for the window is skipped silently for a range; `npm audit
   fix` stops with an error naming it. `min-release-age-exclude` names packages exempt from it.
6. **An upgrade is its own commit**, with the lockfile's change read and summarised in the message.
7. **The review repeats** before each release, and when a package is added.

### Open questions for 5zorro (2026-11-01) — answered the same day

**Answers.** (1) *"published advisories should decrease the time, and decreasing it to 1 week
sounds reasonable. go ahead"*: done. Electron 43.1.1 → **43.8.3** (11 days; 43.8.1 carries the
eMudhra fix, 43.8.2 has no notes, 43.8.3 is Chromium / V8 / PDFium / Skia security backports) and
`undici` 7.28.0 → **7.30.1** (17 days, fixes its 24 advisories; it only downloads Electron), each
named in `--min-release-age-exclude` for that one install. The lockfile changed by those two
lines; `npm audit` finds 0; `package.json` now pins `electron` exactly. Electron 43 fetches its
binary on first use and checks it against the `checksums.json` inside its npm package. On 43.8.3:
`npm test` green, probes `vendor-no-address`, `pay-settings-doors`, `double-press` pass,
`scaffold-pure-wiring` passes, `scaffold-bill` fails only OI-190's void-and-amend (as on any code).
(2) *"i don't have the background to really evaluate this import check. perhaps the short rule is
best?"*: yes, the short rule kept in the repo; it gets the same fair test as a plugin would have.
Still to do in Step 2: the stale `allowScripts` entry (`npm install-scripts prune`), and the rules
he has not said yes to (exact versions for new packages, the lockfile, an upgrade per commit).


1. **Security fixes against the two-month wait.** Electron 43.5.1 (61 days) is the newest 43.x the
   rule allows today. It fixes 5 of the 12 advisories, including 4 of the 5 high ones. 43.6.0
   passes on 2026-11-03 (still 7 open), and the last high one (the eMudhra certificates) needs
   43.8.1, which passes on 2026-12-19. Proposal: a published security advisory may shorten the
   wait to **7 days** for the patch release that fixes it (43.8.1 today, 12 days old), named in
   `min-release-age-exclude` only for that one install, with the dossier saying why. Or keep two
   months, and take 43.5.1 now, then 43.8.x when it ages.
2. **The import check: a plugin or a rule of our own.** Sizes, resolved under the 60-day window
   with `--package-lock-only` (lockfile only, nothing installed):
   - ESLint 10.9.1 + `@eslint/js` 10.0.1 + `globals` 17.12.0: **71 packages, no install scripts.**
   - The same + `eslint-plugin-import-x` 4.17.1: **109 packages**, one with an install script
     (`unrs-resolver` 1.12.2, a native resolver whose postinstall can fetch a binary). The plugin
     and the resolver have the same single maintainer. (`eslint-plugin-import` 2.32.0 supports only
     ESLint 9 and earlier, and ESLint 9's support has ended.)
   - Or a short import rule kept in the repo's own lint config: for each `import { a } from
     "./x.js"`, read `x.js` with the parser ESLint already ships and check it exports `a`. No new
     package; a few dozen lines to own. Both go through the fair test.
   Both sets report two `npm audit` findings in ESLint's own tree (`brace-expansion`, high, and
   `minimatch`, moderate: slow on a crafted file pattern). The linter only reads this repo's
   files, so these are noted rather than blocking; the fixed versions are newer than the window.

## Step 3 — which checker (after 5zorro's own look at the vendors)

What it must catch, from the two real cases above:

- a name used but never defined (the payment paths);
- a named import that the module does not export (the printing move);
- and, a smaller win, imports nobody uses.

### Micro RFP (searched 2026-10-31; first pass, to check against each vendor's own pages)

The questions any candidate answers, in order of weight:

| # | Requirement | Must / should |
|---|---|---|
| R1 | Reports a name used but never defined | must |
| R2 | Reports a named import its module does not export | must |
| R3 | Runs on plain JavaScript (ES modules, JSDoc), with no rewrite to TypeScript | must |
| R4 | Few packages behind it, and none that run code when installed | must |
| R5 | A clear owner, an active release record, and publishing from a recorded build | should |
| R6 | Can start with only R1 and R2 turned on, and add rules later | should |
| R7 | Fast enough to run in every `npm test` | should |

What a first search found (sources at the end; a "?" is still to check):

| | ESLint (keep) | TypeScript's checker (`checkJs`) | Biome | oxlint |
|---|---|---|---|---|
| Who | OpenJS Foundation project | Microsoft | Biome project; Vercel sponsored its 2.0 | Oxc project, VoidZero (the Vite company) |
| R1 undefined name | yes, `no-undef` (found the payment bug) | yes, a compile error | yes? (`noUndeclaredVariables`, to confirm) | yes, `no-undef` |
| R2 missing export | not in core: needs an import plugin (`eslint-plugin-import` / `-import-x`), more packages | yes, a compile error | yes, `noUnresolvedImports` (off by default; listed as nursery in the next version's docs) | yes, `import/named` (nursery, experimental) |
| R3 plain JS | yes | yes, but TypeScript 7 (the Go rewrite) changed its JSDoc reading, and older JSDoc patterns may report new errors | yes | yes |
| R4 packages | 88 in a scratch install, before the import plugin | one package (TypeScript 6); TypeScript 7 ships per operating system | one package plus one per operating system | same as Biome |
| R6 start small | yes, rule by rule | partly: it checks everything, so the first run may be noisy; switch it on file by file | yes, rule by rule | yes, rule by rule |
| R7 speed | slowest (seconds) | seconds | fastest (under a second, one benchmark) | fastest (under a second, one benchmark) |

**Two incidents that bear on R4 and on the waiting period:**

- **July 2025:** a maintainer of `eslint-config-prettier`, a popular ESLint add-on, was phished.
  Four versions were published with an install script that ran malware on Windows (CVE-2025-54313),
  and the same account's other packages were hit too. ESLint itself was not. It is the add-on
  packages around a linter that widen what has to be trusted.
- **September 2025:** another phished maintainer. `debug`, `chalk` and others were published with
  code that rewrote crypto payment addresses, and were live for hours. **This repo has `debug`.**
  It is 4.4.3, the clean version that replaced the bad 4.4.2. The scratch ESLint install is also
  clear (`chalk` 4.1.2, `color-name` 1.1.4, `ansi-styles` 4.3.0, `supports-color` 7.2.0).

**Reading so far, for 5zorro's own look, not a decision.** The two must-catch bugs split the field:
- ESLint catches R1 out of the box, but needs an extra plugin for R2, which means more packages.
- TypeScript's checker catches both from one publisher. The cost is a noisy first run and the
  JSDoc changes in version 7.
- Biome and oxlint catch both with no package tree behind them. Their R2 rules are still marked
  experimental.

**Narrowed (5zorro, 2026-11-01):** *"right now i think either eslint and a plugin or typescript is
the best"*. Biome and oxlint are on hold; he is hesitant about them. ESLint stays a good long-term
choice if the plugin is a known-good version and new versions wait out the waiting period.

**Recommended: TypeScript's checker, version 6.0.3, pinned exactly; ESLint with an import plugin
is the fallback.** From the npm registry's records on 2026-11-01 (read only; nothing installed):

| | TypeScript 6.0.3 | ESLint 10.14.0 + `eslint-plugin-import-x` 4.17.1 |
|---|---|---|
| Packages behind it | none (no dependencies) | ESLint: 30 direct dependencies (88 packages in all at version 9). The plugin: 9 more, including `unrs-resolver`, a native resolver that depends on `napi-postinstall`, one of the packages hijacked in July 2025 |
| Install scripts | none listed | via `napi-postinstall`, to confirm |
| Publisher | Microsoft (`microsoft1es`, `typescript-bot`, `typescript-deploys`, and named team members); repository `github.com/microsoft/TypeScript` | ESLint: OpenJS Foundation; the plugin: separate volunteer maintainers |
| Released | 2026-04-16 | 2026-10-30 / 2026-06-28 |

Why TypeScript 6 and not 7: 7.0.2 (the Go rewrite) was published 2026-10-31, so it is inside any
waiting period. It also changed how type comments in JavaScript are read. 6.0.3 is the last of the
original line. A later move to 7 is its own step. The risk with 6.0.3 is that it is noisy at first:
run it in full on this code and it will likely report many type complaints. So it starts by showing
only the two must-catch kinds ("cannot find name"; "module has no exported member"), and widens one
file at a time. If that cannot be made quiet enough, use the fallback.

**Decided (5zorro, 2026-11-01): ESLint.** *"i don't want to be dependent on microsoft. Microsoft has a
competing product against erpnext (microsoft dynamics), so im going to lean open source. lets do
eslint."* TypeScript's own licence is open source; the reason is independence from a competitor's
control of the tool, which ESLint, an OpenJS Foundation project, gives. So the recommendation above
is set aside. What is left to choose in Step 3:
- **the import plugin:** `eslint-plugin-import-x` (newer; 9 dependencies, including the native
  resolver and `napi-postinstall`) or the original `eslint-plugin-import` (19 dependencies, all
  plain JavaScript; last release 2025-06-20). Each gets a dossier under Step 2's rules;
- **the exact versions,** each older than the waiting period, checked against the known-bad
  version lists.

The fair test below is then run for ESLint and the chosen plugin only.

**What ERPNext and Frappe use** (5zorro asked 2026-11-01, *"why not use the same as them?"*; read
from the clones at the tags the sandbox runs, ERPNext v16.32.1 and Frappe v16.31.0):
- **JavaScript: ESLint too**, pinned at **8.44.0**, run through the Python `pre-commit` tool
  (`.pre-commit-config.yaml`, `mirrors-eslint`) and its GitHub workflow. The rules
  (`.eslintrc`) are `eslint:recommended`, which includes `no-undef`, with most style rules
  and `no-unused-vars` turned off and their page-wide names (`frappe`, `erpnext`, `$`, …) listed as
  globals. No import plugin. Formatting is Prettier 2.7.1.
- **Python:** Ruff (lint and format), Semgrep with Frappe's own rules, and in Frappe mypy on a
  list of files. Commit messages are checked with commitlint. None of it applies to this app's
  plain JavaScript.
- **So the same tool, and the same base rules, as decided.** Start from `eslint:recommended` as
  they do. Two differences are on purpose:
  - **The version.** ESLint 8 is past its end of support (support ended in October 2024; confirm
    on eslint.org's version-support page in the dossier), and its old `.eslintrc` format is gone
    in ESLint 9 and later. Pick a supported version under Step 2's rules, not 8.44.0.
  - **The import check (R2).** Frappe bundles its JavaScript with esbuild (`frappe/esbuild/`), and
    the bundler fails the build on a missing named import, so their lint does not need to check
    imports. This app loads its modules as they are, unbundled, so a wrong import only shows when
    the app starts (the `print.js` case). That is why we need an import plugin and they don't.
  - Running ESLint through `pre-commit` would bring in a Python tool and its downloads. Running it
    from `npm test` keeps one runner (Step 4).

A fair test before choosing is the same one ESLint passed: run each against the commit before
`5bef496` (the payment bug) and the version of `electron/ipc/print.js` with the wrong import (the
start-up failure). Count what each finds and how much else it reports. That run needs the
candidates installed somewhere, so it waits for Step 2's rules and his yes.

Sources: [Biome vs Oxlint in 2026 (DEV)](https://dev.to/jsmanifest/biome-vs-oxlint-in-2026-which-rust-powered-linter-should-you-replace-eslint-with-48lh) ·
[Oxlint vs Biome vs ESLint benchmark (DEV)](https://dev.to/fabwaseem/oxlint-vs-biome-vs-eslint-in-2026-benchmarked-on-a-real-nextjs-codebase-3lal) ·
[Biome: comparison with other tools](https://biomejs.dev/introduction/comparison-with-other-tools) ·
[Biome `noUnresolvedImports`](https://biomejs.dev/linter/rules/no-unresolved-imports/) ·
[Oxlint 1.0 stable](https://oxc.rs/blog/2025-06-10-oxlint-stable) ·
[Oxlint type-aware linting](https://voidzero.dev/posts/announcing-oxlint-type-aware-linting) ·
[oxlint `import/named`](https://oxc.rs/docs/guide/usage/linter/rules/import/named) ·
[typescript-go](https://github.com/microsoft/typescript-go) ·
[TypeScript native port (Visual Studio Magazine)](https://visualstudiomagazine.com/articles/2025/12/02/microsoft-gets-real-on-native-typescript-remake.aspx) ·
[eslint-config-prettier compromise (BleepingComputer)](https://www.bleepingcomputer.com/news/security/popular-npm-linter-packages-hijacked-via-phishing-to-drop-malware/) ·
[chalk / debug compromise (Semgrep)](https://semgrep.dev/blog/2025/chalk-debug-and-color-on-npm-compromised-in-new-supply-chain-attack) ·
[npm `min-release-age` (npm/cli #8825)](https://github.com/npm/cli/pull/8825)

## Step 4 — run it in `npm test`

Once a checker is chosen: one `npm test` step, so a failure blocks a commit the way a failing unit
test does (`AGENT_CONVENTIONS.md`). First, settle what it reports on today's code. On 2026-10-31,
`no-undef` / `no-unused-vars` over `electron/main.js` showed, beyond the two fixed bugs, two unused
names: `classifyPrintNavResult` (an import) and a variable `co`. Fix those, or record why they
stay. Start with `electron/` and `src/`, then the tests and scripts.

Two things the CI side needs (found 2026-11-01): `.github/workflows/ci.yml` runs `npm test` with no
install step, which works only while the unit tests need no package, so add `npm ci` before it
(checked: `npm ci` installs the lockfile's versions even under the `.npmrc` window, so Electron
43.8.3 installs although it is younger than two months); and ESLint 10 needs Node 20.19+ / 22.13+
/ 24+, while `package.json`'s `engines` says `>=20` (CI uses Node 22, which is fine).

## Dogfood residuals

| Family | Residual | Status |
|---|---|---|
| — | (none; not started) | |
