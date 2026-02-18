#!/usr/bin/env bash
set -euo pipefail

MSG=${1:-}
if [[ -z "$MSG" ]]; then
  echo "usage: scripts/atomic-commit.sh \"commit message\"" >&2
  exit 1
fi

scripts/guard-diff-only.sh

if [[ -x scripts/preflight.sh ]]; then
  scripts/preflight.sh
fi

if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  if [[ -x scripts/lint.sh ]]; then
    scripts/lint.sh
  elif [[ -f package.json ]]; then
    if command -v pnpm >/dev/null 2>&1 && [[ -f pnpm-lock.yaml ]]; then
      pnpm -s lint
    elif command -v npm >/dev/null 2>&1; then
      npm run -s lint
    fi
  fi

  if [[ -x scripts/test.sh ]]; then
    scripts/test.sh
  elif [[ -f package.json ]]; then
    if command -v pnpm >/dev/null 2>&1 && [[ -f pnpm-lock.yaml ]]; then
      pnpm -s test
    elif command -v npm >/dev/null 2>&1; then
      npm test
    fi
  fi
else
  echo "atomic-commit: SKIP_TESTS=1 set; skipping lint/test"
fi

git add -A
git commit -m "$MSG"
