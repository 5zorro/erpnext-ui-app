# Agent Conventions — erpnext-ui-app

Single tool-agnostic source for how any AI coding agent should behave in this repo. This
file replaces having the same behavioral rules live separately in each tool's own native
format.

**If your tool has its own native rules mechanism** (a project-instructions file, an
editor-specific rules directory, an `*.instructions.md` file, etc.) — read this file first,
then fold whatever applies into that native file/format so your tool's normal auto-load
behavior still works. Treat this file as canonical: if a tool-native translation disagrees
with it, this file wins and the translation is stale.

This file itself stays public, but any editor-specific rules should be local only — gitignored, e.g. `this-ai-agent-brand-instructions.md` and any editor
rules directory it replaces. `HANDOFF.md` is the tracked, public architecture SSoT.

## Non-negotiables

1. **No model/tool attribution in public commits** — no "Co-Authored-By" trailer, and no
   reference to a specific AI model or coding-tool codename in any commit message, author
   identity, or committer identity. `scripts/check-commit-attribution.sh` enforces this as
   the local `commit-msg` hook — never bypass it with `--no-verify`. If a commit message
   needs to describe a change to tool-specific config, describe it generically rather than
   naming the tool (e.g. "the editor's local rules directory", not the literal name) — the
   hook has no notion of intent, only pattern-matching, and will reject the literal word
   even in a clearly legitimate sentence.
2. **Museum privacy** — open items / discovery brainstorms and decision-rationale prose
   live only in `~/agent-harness/` (private, gitignored there too). Public files in this
   repo may cite `OI-NNN + one-line status`, never the discovery essay or the why.
3. **Architecture invariants** (Clean Core, HTTP-only, pure-first, one ERP base,
   commits-vs-pushes) — see `HANDOFF.md` § Invariants. Not restated here; that file is the
   SSoT for them.
4. **`npm test` green** before handing work back to the user.

## Scope discipline (ponytail lite)

Build what's asked; don't add unrequested abstractions, error handling for scenarios that
can't happen, or speculative future-proofing. After delivering, name the lazier alternative
in one line if one exists — the user picks. Ladder before writing code: does this need to be
built at all → does the standard library already do it → does a native platform feature
cover it → does an already-installed dependency solve it → can this be one line → only then
write the minimum custom code.

## Pointers

- Architecture, layers, extension points: `HANDOFF.md` (public, tracked — the real map).
- Fuller local orientation for the current session's coding agent (gitignored).
- Editor-specific workflow notes (e.g. remote-workspace setup) that only apply to one
  particular tool stay in that tool's own local config — out of scope for this file.
