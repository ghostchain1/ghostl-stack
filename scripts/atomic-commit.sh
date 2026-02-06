#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/atomic-commit.sh -m "commit message"

Runs a minimal preflight + lint gate and then creates a single atomic commit
from the currently staged changes.

Env overrides:
  - ATOMIC_ALLOW_DIRTY=1      (allow unstaged/untracked files)
  - ATOMIC_SKIP_LINT=1        (skip `npm run lint`)
  - ATOMIC_TEST_CMD="<cmd>"   (optional extra test command to run)
EOF
}

msg=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -m)
      shift
      msg="${1:-}"
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "[atomic-commit] unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift || true
done

if [ -z "$msg" ]; then
  echo "[atomic-commit] missing -m \"commit message\"" >&2
  usage >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$repo_root" ]; then
  echo "[atomic-commit] not in a git repo" >&2
  exit 2
fi
cd "$repo_root"

if [ -z "$(git diff --cached --name-only)" ]; then
  echo "[atomic-commit] nothing staged to commit" >&2
  exit 1
fi

allow_dirty="${ATOMIC_ALLOW_DIRTY:-0}"
if [ "$allow_dirty" != "1" ]; then
  if [ -n "$(git diff --name-only)" ]; then
    echo "[atomic-commit] working tree has unstaged changes (stage or stash them, or set ATOMIC_ALLOW_DIRTY=1)" >&2
    exit 1
  fi
  if [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "[atomic-commit] untracked files present (stage or remove them, or set ATOMIC_ALLOW_DIRTY=1)" >&2
    exit 1
  fi
fi

echo "[atomic-commit] running diff-only guard"
bash scripts/guard-diff-only.sh --staged

echo "[atomic-commit] running git diff whitespace check"
git diff --check --cached

echo "[atomic-commit] running node version guard"
npm run node:check

if [ "${ATOMIC_SKIP_LINT:-0}" != "1" ]; then
  if node -e "const p=require('./package.json'); process.exit(p?.scripts?.lint ? 0 : 1)"; then
    echo "[atomic-commit] running lint"
    npm run lint
  else
    echo "[atomic-commit] lint script not present; skipping"
  fi
else
  echo "[atomic-commit] lint skipped (ATOMIC_SKIP_LINT=1)"
fi

if [ -n "${ATOMIC_TEST_CMD:-}" ]; then
  echo "[atomic-commit] running tests: ${ATOMIC_TEST_CMD}"
  bash -lc "${ATOMIC_TEST_CMD}"
fi

echo "[atomic-commit] committing"
git commit -m "$msg"
echo "[atomic-commit] OK"
