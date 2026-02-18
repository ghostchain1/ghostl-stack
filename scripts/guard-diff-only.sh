#!/usr/bin/env bash
set -euo pipefail

MAX_LINES_PER_FILE=${MAX_LINES_PER_FILE:-500}
ALLOW_LARGE_FILES=${ALLOW_LARGE_FILES:-}
ALLOW_DELETE_NON_DOCS=${ALLOW_DELETE_NON_DOCS:-0}

has_allow() {
  local file="$1"
  IFS="," read -r -a allow <<< "$ALLOW_LARGE_FILES"
  for token in "${allow[@]}"; do
    [[ -n "$token" && "$file" == *"$token"* ]] && return 0
  done
  return 1
}

if ! git diff --cached --quiet; then
  :
else
  echo "guard-diff-only: no staged changes" >&2
  exit 1
fi

# Block large diffs per file
while read -r added deleted file; do
  [[ -z "$file" ]] && continue
  if [[ "$added" == "-" || "$deleted" == "-" ]]; then
    # binary file; require allowlist
    if ! has_allow "$file"; then
      echo "guard-diff-only: binary change not allowed without ALLOW_LARGE_FILES match: $file" >&2
      exit 1
    fi
    continue
  fi
  total=$((added + deleted))
  if (( total > MAX_LINES_PER_FILE )); then
    if ! has_allow "$file"; then
      echo "guard-diff-only: $file has $total line changes (> $MAX_LINES_PER_FILE)." >&2
      exit 1
    fi
  fi
done < <(git diff --cached --numstat)

# Block deletions outside docs/ unless explicitly allowed
if [[ "$ALLOW_DELETE_NON_DOCS" != "1" ]]; then
  while read -r status file; do
    [[ -z "$file" ]] && continue
    if [[ "$status" == D* ]]; then
      if [[ "$file" != docs/* ]]; then
        echo "guard-diff-only: deletion blocked outside docs/: $file" >&2
        exit 1
      fi
    fi
  done < <(git diff --cached --name-status)
fi

echo "guard-diff-only: OK"
