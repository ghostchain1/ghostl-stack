#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/guard-diff-only.sh [--staged|--worktree]

Guards "diff-only" discipline by blocking:
  - large per-file edits (default max lines changed per file)
  - deletions outside docs/

Env overrides:
  - DIFF_ONLY_MAX_LINES_PER_FILE (default: 300)
  - DIFF_ONLY_ALLOW_LARGE=1       (disable per-file size limit)
  - DIFF_ONLY_ALLOW_DELETE=1      (allow deletions outside docs/)
  - DIFF_ONLY_ALLOW_BINARY=1      (allow binary changes)
EOF
}

mode="--cached"
case "${1:-}" in
  "" | "--staged")
    mode="--cached"
    ;;
  "--worktree")
    mode=""
    ;;
  "-h" | "--help")
    usage
    exit 0
    ;;
  *)
    echo "[guard-diff-only] unknown arg: $1" >&2
    usage >&2
    exit 2
    ;;
esac

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$repo_root" ]; then
  echo "[guard-diff-only] not in a git repo" >&2
  exit 2
fi

cd "$repo_root"

max_lines="${DIFF_ONLY_MAX_LINES_PER_FILE:-300}"
allow_large="${DIFF_ONLY_ALLOW_LARGE:-0}"
allow_delete="${DIFF_ONLY_ALLOW_DELETE:-0}"
allow_binary="${DIFF_ONLY_ALLOW_BINARY:-0}"

if ! [[ "$max_lines" =~ ^[0-9]+$ ]]; then
  echo "[guard-diff-only] DIFF_ONLY_MAX_LINES_PER_FILE must be an integer (got '$max_lines')" >&2
  exit 2
fi

diff_cmd=(git diff)
if [ -n "$mode" ]; then
  diff_cmd+=(--cached)
fi

numstat="$("${diff_cmd[@]}" --numstat)"
if [ -z "$numstat" ]; then
  echo "[guard-diff-only] OK: no changes to check"
  exit 0
fi

failures=()
binary_changes=()

while IFS=$'\t' read -r added deleted file_path; do
  if [ -z "$file_path" ]; then
    continue
  fi
  if [ "$added" = "-" ] || [ "$deleted" = "-" ]; then
    binary_changes+=("$file_path")
    continue
  fi
  changed=$((added + deleted))
  if [ "$allow_large" != "1" ] && [ "$changed" -gt "$max_lines" ]; then
    failures+=("${file_path} (+${added}/-${deleted} = ${changed} lines)")
  fi
done <<<"$numstat"

if [ "${#binary_changes[@]}" -gt 0 ] && [ "$allow_binary" != "1" ]; then
  echo "[guard-diff-only] FAIL: binary changes present (set DIFF_ONLY_ALLOW_BINARY=1 to allow):" >&2
  printf '  - %s\n' "${binary_changes[@]}" >&2
  exit 1
fi

deleted_files=""
if [ -n "$mode" ]; then
  deleted_files="$(git diff --cached --name-status --diff-filter=D | awk '{print $2}' || true)"
else
  deleted_files="$(git diff --name-status --diff-filter=D | awk '{print $2}' || true)"
fi

if [ -n "$deleted_files" ] && [ "$allow_delete" != "1" ]; then
  blocked=()
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    if [[ "$path" != docs/* ]]; then
      blocked+=("$path")
    fi
  done <<<"$deleted_files"
  if [ "${#blocked[@]}" -gt 0 ]; then
    echo "[guard-diff-only] FAIL: deletion(s) outside docs/ blocked (set DIFF_ONLY_ALLOW_DELETE=1 to allow):" >&2
    printf '  - %s\n' "${blocked[@]}" >&2
    exit 1
  fi
fi

if [ "${#failures[@]}" -gt 0 ]; then
  echo "[guard-diff-only] FAIL: per-file line limit exceeded (max ${max_lines}; set DIFF_ONLY_ALLOW_LARGE=1 to override):" >&2
  printf '  - %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "[guard-diff-only] OK"
