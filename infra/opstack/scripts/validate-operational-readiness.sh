#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EVIDENCE_DIR="${PHASE11_EVIDENCE_DIR:-$ROOT_DIR/evidence/phase11}"

mkdir -p "$EVIDENCE_DIR"

normalize_url() {
  local url="$1"
  if [[ "$url" == *host.docker.internal* ]] && ! getent hosts host.docker.internal >/dev/null 2>&1; then
    url="${url/host.docker.internal/localhost}"
  fi
  printf '%s' "$url"
}

json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

run_check() {
  local key="$1"
  local desc="$2"
  local cmd="$3"
  local logfile="$EVIDENCE_DIR/${key}.txt"

  set +e
  bash -lc "$cmd" >"$logfile" 2>&1
  local code=$?
  set -e

  CHECK_KEYS+=("$key")
  CHECK_DESCS[$key]="$desc"
  CHECK_LOGS[$key]="$logfile"
  CHECK_CODES[$key]="$code"

  if [[ "$code" -ne 0 ]]; then
    failures=$((failures + 1))
    echo "[phase11] FAIL: $key ($desc)"
  else
    echo "[phase11] PASS: $key ($desc)"
  fi
}

failures=0
declare -a CHECK_KEYS=()
declare -A CHECK_DESCS
declare -A CHECK_LOGS
declare -A CHECK_CODES

GUARD_URL_RAW="${PHASE11_GUARD_URL:-${GUARD_URL:-http://localhost:7070}}"
RELAYER_URL_RAW="${PHASE11_RELAYER_URL:-${RELAYER_HEALTH_URL:-http://localhost:7171/health}}"
AI_MONITOR_URL_RAW="${PHASE11_AI_MONITOR_URL:-${AI_MONITOR_URL:-http://localhost:7575/health}}"

GUARD_URL="$(normalize_url "$GUARD_URL_RAW")"
RELAYER_URL="$(normalize_url "$RELAYER_URL_RAW")"
AI_MONITOR_URL="$(normalize_url "$AI_MONITOR_URL_RAW")"

run_check "doctor-l1" "L1 doctor" "cd '$ROOT_DIR' && ALLOW_DEV_SECRETS=1 bash infra/scripts/doctor-l1.sh"
run_check "doctor-l2" "L2 doctor" "cd '$ROOT_DIR' && ALLOW_DEV_SECRETS=1 bash infra/scripts/doctor-l2.sh"
run_check "doctor-l3" "L3 doctor" "cd '$ROOT_DIR' && ALLOW_DEV_SECRETS=1 bash infra/scripts/doctor-l3.sh"

run_check "health-guard" "Ghost guard health" "curl -fsS '$GUARD_URL/health' | jq . >/dev/null"
run_check "health-relayer" "Ghost relayer health" "curl -fsS '$RELAYER_URL' | jq . >/dev/null"
run_check "health-ai-monitor" "AI monitor health" "curl -fsS '$AI_MONITOR_URL' | jq . >/dev/null"

run_check "smoke-consensus-autonomy" "Consensus autonomy smoke" "cd '$ROOT_DIR' && bash scripts/smoke/consensus-autonomy.sh"
run_check "smoke-federation-invariants" "Federation invariants smoke" "cd '$ROOT_DIR' && bash scripts/smoke/federation-invariants.sh"
run_check "smoke-ai-stability" "AI stability smoke" "cd '$ROOT_DIR' && bash scripts/smoke/ai-stability.sh"

{
  echo "{"
  echo "  \"ok\": $([[ "$failures" -eq 0 ]] && echo true || echo false),"
  echo "  \"checks\": {"
  for i in "${!CHECK_KEYS[@]}"; do
    key="${CHECK_KEYS[$i]}"
    code="${CHECK_CODES[$key]}"
    logfile="${CHECK_LOGS[$key]}"
    desc="${CHECK_DESCS[$key]}"
    comma=","
    if [[ "$i" -eq $((${#CHECK_KEYS[@]} - 1)) ]]; then
      comma=""
    fi
    echo "    \"$key\": {"
    echo "      \"description\": $(json_escape "$desc"),"
    echo "      \"exitCode\": $code,"
    echo "      \"ok\": $([[ "$code" -eq 0 ]] && echo true || echo false),"
    echo "      \"log\": $(json_escape "${logfile#$ROOT_DIR/}")"
    echo "    }$comma"
  done
  echo "  },"
  echo "  \"endpoints\": {"
  echo "    \"guard\": $(json_escape "$GUARD_URL"),"
  echo "    \"relayer\": $(json_escape "$RELAYER_URL"),"
  echo "    \"aiMonitor\": $(json_escape "$AI_MONITOR_URL")"
  echo "  },"
  echo "  \"failures\": $failures"
  echo "}"
} | tee "$EVIDENCE_DIR/operational-readiness-gate.txt"

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase11] PASS: operational readiness gate satisfied"
