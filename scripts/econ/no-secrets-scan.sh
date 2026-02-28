#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [ "${SKIP_GITLEAKS:-0}" = "1" ]; then
  echo "SKIP_GITLEAKS=1; using npm secret scan script"
  npm run security:secret:scan
  exit 0
fi

if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --source . --redact --verbose; then
    exit 0
  fi
  echo "gitleaks detected potential secret exposure; running secondary scan for additional context"
  npm run security:secret:scan || true
  echo "econ:no-secrets FAILED due to gitleaks findings"
  exit 1
fi

echo "gitleaks not installed; falling back to npm secret scan script"
npm run security:secret:scan
