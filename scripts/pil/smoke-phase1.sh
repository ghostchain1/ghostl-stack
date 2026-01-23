#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${PIL_BASE_URL:-http://localhost:3220}

check() {
  local path=$1
  local label=$2
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${path}")
  if [ "$status" != "200" ]; then
    echo "FAIL: ${label} (${path}) status=${status}" >&2
    exit 1
  fi
  echo "PASS: ${label}"
}

check "/health" "health"
check "/v1/chains" "chains"
check "/v1/jurisdictions" "jurisdictions"
check "/v1/legal-signals" "legal-signals"
check "/v1/policy-packs" "policy-packs"
check "/v1/attestations" "attestations"
check "/v1/metrics/summary" "metrics-summary"

echo "Phase 1 smoke tests passed."
