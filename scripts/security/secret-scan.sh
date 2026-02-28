#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/artifacts/security}"
mkdir -p "$OUT_DIR"

echo "[secret-scan] root=$ROOT_DIR"

have_scanner=0
failures=0

if command -v gitleaks >/dev/null 2>&1; then
  have_scanner=1
  echo "[secret-scan] running gitleaks"
  if ! gitleaks detect \
    --source "$ROOT_DIR" \
    --config "$ROOT_DIR/.gitleaks.toml" \
    --report-format json \
    --report-path "$OUT_DIR/gitleaks.json" \
    --exit-code 1; then
    echo "[secret-scan] FAIL gitleaks detected potential leaks"
    failures=$((failures + 1))
  fi
else
  echo "[secret-scan] WARN gitleaks not installed"
fi

if command -v trivy >/dev/null 2>&1; then
  have_scanner=1
  echo "[secret-scan] running trivy secret scan"
  if ! trivy fs \
    --scanners secret \
    --secret-config "$ROOT_DIR/trivy-secret.yaml" \
    --severity HIGH,CRITICAL \
    --format json \
    --output "$OUT_DIR/trivy-secrets.json" \
    --exit-code 1 \
    --skip-dirs node_modules,contracts/node_modules,dist,contracts/dist,contracts/artifacts,contracts/cache,contracts/.hardhat-cache,ops/preflight,ops/snapshots,backups,infra/docker/_backup,infra/docker/runtime,infra/ghostchain/data,infra/ghostchain/secrets,infra/opstack/data,infra/opstack/broadcast,infra/opstack/secrets,infra/opstack/l3/secrets,chains/l2/data,chains/l3/data \
    "$ROOT_DIR"; then
    echo "[secret-scan] FAIL trivy detected potential leaks"
    failures=$((failures + 1))
  fi
else
  echo "[secret-scan] WARN trivy not installed"
fi

if [[ "$have_scanner" -eq 0 ]]; then
  echo "[secret-scan] ERROR no supported scanner available (install gitleaks and/or trivy)"
  exit 2
fi

if [[ "$failures" -gt 0 ]]; then
  echo "[secret-scan] FAIL findings=$failures"
  exit 1
fi

echo "[secret-scan] PASS"

