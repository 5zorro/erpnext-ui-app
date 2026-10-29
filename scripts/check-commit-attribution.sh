#!/usr/bin/env bash
set -uo pipefail

usage() {
  echo "Usage: $0 --message-file <path> | --range <base..head>" >&2
  exit 2
}

failed=0

# AI-session sizing pins down which model and plan wrote the work: a context %, token counts, the
# window size, a model with its version. Lowercase text; POSIX ERE (bash =~ and grep -E).
SIZING_RE='([0-9]+ ?% (of (the )?)?context|context[^.|]{0,20}[0-9]+ ?%|[0-9]+(\.[0-9]+)? ?[km][- ]tokens?([^a-z0-9]|$)|(^|[^a-z0-9])1m[- ](token )?window|(^|[^a-z0-9])(anthropic|chatgpt|claude|codex|copilot|deepseek|fable|gemini|gpt|grok|haiku|llama|mistral|openai|opus|qwen|sonnet)[ -]?[0-9])'
# The policy's own files spell the patterns out.
POLICY_FILES=(':!scripts/check-commit-attribution.sh' ':!tests/commit-policy.test.js')

check_text() {
  local label="$1"
  local text="${2,,}"

  if [[ "$text" =~ co[[:space:]-]*authored[[:space:]-]*by ]]; then
    echo "ERROR: $label contains a prohibited co-author attribution." >&2
    failed=1
  fi

  if [[ "$text" =~ @gmail ]]; then
    echo "ERROR: $label contains a prohibited Gmail address or marker." >&2
    failed=1
  fi

  if [[ "$text" =~ (^|[^a-z0-9])(anthropic|chatgpt|claude|codex|copilot|deepseek|fable|gemini|gpt|grok|haiku|llama|mistral|openai|opus|qwen|sonnet|cursor)([^a-z0-9]|$) ]]; then
    echo "ERROR: $label references a model/tool codename." >&2
    failed=1
  fi

  if [[ "$text" =~ $SIZING_RE ]]; then
    echo "ERROR: $label sizes an AI session (\"${BASH_REMATCH[0]}\"): no context %, token counts, window size or model version." >&2
    failed=1
  fi
}

# Added lines of a diff (stdin; not a pipe, or failed=1 is lost in the subshell): the first that sizes an AI session fails the check.
check_added_lines() {
  local label="$1" hit
  hit="$(grep -aE '^\+' | grep -avE '^\+\+\+ ' | tr '[:upper:]' '[:lower:]' | grep -a -m1 -E "$SIZING_RE" || true)"
  if [[ -n "$hit" ]]; then
    echo "ERROR: $label adds a line that sizes an AI session: ${hit:1:160}" >&2
    failed=1
  fi
}

# A commit hash cited in a message or an added line must name a commit in this repository: a
# mistyped hash, or one from a history that was replaced, points at nothing. A citation is a whole
# word of 7-40 hex characters with a digit and a letter. `owner/repo@abc1234` cites another
# repository and is skipped (the @ makes it part of a longer word).
check_cited_hashes() {
  local label="$1" text="$2" tok
  while IFS= read -r tok; do
    [[ -n "$tok" && "$tok" =~ [0-9] && "$tok" =~ [a-f] ]] || continue
    git cat-file -e "${tok}^{commit}" 2>/dev/null && continue
    echo "ERROR: $label cites commit $tok, which is not in this repository." >&2
    failed=1
  done < <(grep -aoE '[0-9A-Za-z_@]+' <<< "$text" | grep -axE '[0-9a-f]{7,40}' | sort -u)
}

# The part of a diff's added lines that can cite a commit: whole lines in Markdown, only `code
# spans` in other files (hex data, colors and names in code are not citations).
citable_added_text() {
  awk '
    /^\+\+\+ / { md = ($0 ~ /\.md$/); next }
    /^\+/ {
      line = substr($0, 2)
      if (md) { print line; next }
      while (match(line, /`[^`]*`/)) { print substr(line, RSTART, RLENGTH); line = substr(line, RSTART + RLENGTH) }
    }'
}

check_message_file() {
  local message_file="$1"
  [[ -f "$message_file" ]] || usage

  check_text "commit message" "$(<"$message_file")"
  # Without git's comment lines, or the diff that `commit -v` puts under the scissors line.
  check_cited_hashes "commit message" "$(sed -e '/^# -* >8 -*$/,$d' -e '/^#/d' "$message_file")"
  check_text "Git author identity" "$(git var GIT_AUTHOR_IDENT 2>/dev/null || true)"
  check_text "Git committer identity" "$(git var GIT_COMMITTER_IDENT 2>/dev/null || true)"
  local diff
  diff="$(git diff --cached -U0 --no-color --no-ext-diff -- . "${POLICY_FILES[@]}" 2>/dev/null)"
  check_added_lines "the staged change" <<< "$diff"
  check_cited_hashes "the staged change" "$(citable_added_text <<< "$diff")"
}

check_range() {
  local range="$1"
  local commits

  if ! commits="$(git rev-list "$range" 2>/dev/null)"; then
    echo "ERROR: cannot inspect commit range: $range" >&2
    exit 2
  fi

  local diff
  while IFS= read -r commit; do
    [[ -n "$commit" ]] || continue
    check_text "commit ${commit:0:12}" "$(
      git show -s \
        --format='Author: %an <%ae>%nCommitter: %cn <%ce>%n%B' \
        "$commit"
    )"
    check_cited_hashes "commit ${commit:0:12}" "$(git show -s --format=%B "$commit")"
    diff="$(git show -U0 --no-color --no-ext-diff --format= "$commit" -- . "${POLICY_FILES[@]}")"
    check_added_lines "commit ${commit:0:12}" <<< "$diff"
    check_cited_hashes "commit ${commit:0:12}" "$(citable_added_text <<< "$diff")"
  done <<< "$commits"
}

case "${1:-}" in
  --message-file)
    [[ $# -eq 2 ]] || usage
    check_message_file "$2"
    ;;
  --range)
    [[ $# -eq 2 ]] || usage
    check_range "$2"
    ;;
  *)
    usage
    ;;
esac

if (( failed )); then
  echo "Commit attribution policy failed." >&2
  exit 1
fi

echo "Commit attribution policy passed."
