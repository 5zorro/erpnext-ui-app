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
  hit="$(grep -E '^\+' | grep -vE '^\+\+\+ ' | tr '[:upper:]' '[:lower:]' | grep -m1 -E "$SIZING_RE" || true)"
  if [[ -n "$hit" ]]; then
    echo "ERROR: $label adds a line that sizes an AI session: ${hit:1:160}" >&2
    failed=1
  fi
}

check_message_file() {
  local message_file="$1"
  [[ -f "$message_file" ]] || usage

  check_text "commit message" "$(<"$message_file")"
  check_text "Git author identity" "$(git var GIT_AUTHOR_IDENT 2>/dev/null || true)"
  check_text "Git committer identity" "$(git var GIT_COMMITTER_IDENT 2>/dev/null || true)"
  check_added_lines "the staged change" < <(git diff --cached -U0 --no-color --no-ext-diff -- . "${POLICY_FILES[@]}" 2>/dev/null)
}

check_range() {
  local range="$1"
  local commits

  if ! commits="$(git rev-list "$range" 2>/dev/null)"; then
    echo "ERROR: cannot inspect commit range: $range" >&2
    exit 2
  fi

  while IFS= read -r commit; do
    [[ -n "$commit" ]] || continue
    check_text "commit ${commit:0:12}" "$(
      git show -s \
        --format='Author: %an <%ae>%nCommitter: %cn <%ce>%n%B' \
        "$commit"
    )"
    check_added_lines "commit ${commit:0:12}" < <(git show -U0 --no-color --no-ext-diff --format= "$commit" -- . "${POLICY_FILES[@]}")
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
