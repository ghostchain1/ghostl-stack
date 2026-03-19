#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
DOCTOR_DRY_RUN=0
DOCTOR_JSON=0
DOCTOR_VERBOSE=0
FAILURES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DOCTOR_DRY_RUN=1
      shift
      ;;
    --json)
      DOCTOR_JSON=1
      shift
      ;;
    --verbose)
      DOCTOR_VERBOSE=1
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: infra/scripts/doctor.sh [--dry-run] [--verbose] [--json]

  --dry-run   reduce wait attempts for fast operator status checks
  --verbose   reserved for future expanded probe detail
  --json      accepted for ghostctl compatibility; current output remains text
USAGE
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
DOCTOR_WAIT_ATTEMPTS_DEFAULT="${DOCTOR_WAIT_ATTEMPTS:-}"
if [[ -z "$DOCTOR_WAIT_ATTEMPTS_DEFAULT" ]]; then
  if [[ "$DOCTOR_DRY_RUN" -eq 1 ]]; then
    DOCTOR_WAIT_ATTEMPTS_DEFAULT=1
  else
    DOCTOR_WAIT_ATTEMPTS_DEFAULT=3
  fi
fi

jsonrpc_chain_id() {
  local url="$1"
  local response
  local method
  for method in ghost_chainId eth_chainId; do
    response="$(curl -fsS -m 3 -X POST "$url" -H 'content-type: application/json' \
      --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":[]}" 2>/dev/null || true)"
    if [[ "$response" == *'"result"'* ]]; then
      printf '%s' "$response"
      return 0
    fi
  done
  return 1
}

wait_http() {
  local url="$1"
  local attempts="${2:-$DOCTOR_WAIT_ATTEMPTS_DEFAULT}"
  local sleep_s="${3:-1}"
  local _i
  for _i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_s"
  done
  return 1
}

print_http() {
  local url="$1"
  local body=""
  body="$(curl -fsS --max-time 3 "$url" 2>/dev/null || true)"
  if [[ -n "$body" ]]; then
    printf '%s\n\n' "$body"
  fi
}

report_rpc() {
  local url="$1"
  local label="$2"
  local severity="${3:-required}"
  local body=""
  body="$(jsonrpc_chain_id "$url" || true)"
  if [[ -n "$body" ]]; then
    echo "OK: $label ($url)"
    printf '%s\n\n' "$body"
    return 0
  fi
  if [[ "$severity" == "required" ]]; then
    echo "NOT READY: $label ($url)"
    FAILURES=$((FAILURES + 1))
  else
    echo "WARN: $label unavailable ($url)"
  fi
  return 0
}

report_http() {
  local url="$1"
  local label="$2"
  local severity="${3:-optional}"
  local show_body="${4:-0}"
  if wait_http "$url" >/dev/null; then
    echo "OK: $label ($url)"
    if [[ "$show_body" == "1" ]]; then
      print_http "$url"
    fi
    return 0
  fi
  if [[ "$severity" == "required" ]]; then
    echo "NOT READY: $label ($url)"
    FAILURES=$((FAILURES + 1))
  else
    echo "WARN: $label unavailable ($url)"
  fi
  return 0
}

echo
echo "RPC chainIds:"
report_rpc "$HOST_L1_RPC" "GhostChain L1 RPC" required
report_rpc "$HOST_L2_RPC" "GhostL2 RPC" required
report_rpc "$HOST_L3_RPC" "GhostL3 RPC" required

echo "Core rollup services:"
report_http http://localhost:7260/status ghost-exec-l2 required 1
report_http http://localhost:7261/healthz ghost-sequencer-l2 optional 0
report_http http://localhost:7262/healthz ghost-deriver-l2 optional 0
report_http http://localhost:7263/status ghost-settlement-l2 required 1
report_http http://localhost:7264/healthz ghost-bridge-l2 optional 0
report_http http://localhost:7265/healthz ghost-proof-l2 optional 0
report_http http://localhost:7270/status ghost-exec-l3 required 1
report_http http://localhost:7271/healthz ghost-sequencer-l3 optional 0
report_http http://localhost:7272/healthz ghost-deriver-l3 optional 0
report_http http://localhost:7273/status ghost-settlement-l3 required 1
report_http http://localhost:7274/healthz ghost-bridge-l3 optional 0
report_http http://localhost:7275/healthz ghost-proof-l3 optional 0
report_http http://localhost:7276/status ghost-observability optional 1

echo "Control plane:"
report_http http://localhost:7780/health ghost-mapper optional 0
report_http http://localhost:8088/health ghost-registry optional 0
report_http http://localhost:7070/health ghost-guard optional 0
report_http http://localhost:7575/health ai-monitor optional 0
report_http http://localhost:7171/health ghost-relayer optional 0
report_http http://localhost:7604/health bridge-service optional 0
report_http http://localhost:7606/health liquidity-service optional 0

echo "Platform services:"
report_http http://localhost:8090/health ghost-compliance optional 1
report_http http://localhost:7900/readyz ghostbrain-core optional 0
report_http http://localhost:9090/-/ready prometheus optional 1
report_http http://localhost:3000/api/health grafana optional 1

echo "Sovereign economy:"
report_http http://localhost:7681/health l3-fee-collector optional 0
report_http http://localhost:7682/health l2-revenue-aggregator optional 0
report_http http://localhost:7683/health treasury-engine optional 0
report_http http://localhost:7684/health reward-distributor optional 0
report_http http://localhost:7685/health hyper-ghost-governor optional 0

if [[ "$FAILURES" -gt 0 ]]; then
  echo "FAIL: $FAILURES required checks are not ready." >&2
  exit 1
fi

echo "OK"
