#!/usr/bin/env bash
set -uo pipefail

usage() {
  echo "Usage: $0 --message-file <path> | --range <base..head>" >&2
  exit 2
}

failed=0

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
}

check_message_file() {
  local message_file="$1"
  [[ -f "$message_file" ]] || usage

  check_text "commit message" "$(<"$message_file")"
  check_text "Git author identity" "$(git var GIT_AUTHOR_IDENT 2>/dev/null || true)"
  check_text "Git committer identity" "$(git var GIT_COMMITTER_IDENT 2>/dev/null || true)"
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
