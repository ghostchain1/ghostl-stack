#!/usr/bin/env bash
set -Eeuo pipefail

DOCTOR_DRY_RUN=0
FAILURES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DOCTOR_DRY_RUN=1
      shift
      ;;
    -h|--help)
      echo "Usage: infra/scripts/doctor-l2.sh [--dry-run]"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
WAIT_ATTEMPTS="${DOCTOR_WAIT_ATTEMPTS:-}"
if [[ -z "$WAIT_ATTEMPTS" ]]; then
  if [[ "$DOCTOR_DRY_RUN" -eq 1 ]]; then
    WAIT_ATTEMPTS=1
  else
    WAIT_ATTEMPTS=3
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
  local attempts="${2:-$WAIT_ATTEMPTS}"
  local _i
  for _i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
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
  local body=""
  body="$(jsonrpc_chain_id "$url" || true)"
  if [[ -n "$body" ]]; then
    echo "OK: $label ($url)"
    printf '%s\n\n' "$body"
  else
    echo "NOT READY: $label ($url)"
    FAILURES=$((FAILURES + 1))
  fi
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
  elif [[ "$severity" == "required" ]]; then
    echo "NOT READY: $label ($url)"
    FAILURES=$((FAILURES + 1))
  else
    echo "WARN: $label unavailable ($url)"
  fi
}

echo "L2 routing prerequisites:"
report_rpc "$HOST_L1_RPC" "GhostChain L1 RPC"
report_rpc "$HOST_L2_RPC" "GhostL2 RPC"

echo "GhostL2 services:"
report_http http://localhost:7260/status ghost-exec-l2 required 1
report_http http://localhost:7261/healthz ghost-sequencer-l2 optional 0
report_http http://localhost:7262/healthz ghost-deriver-l2 optional 0
report_http http://localhost:7263/status ghost-settlement-l2 required 1
report_http http://localhost:7264/healthz ghost-bridge-l2 optional 0
report_http http://localhost:7265/healthz ghost-proof-l2 optional 0

echo "Shared operator services:"
report_http http://localhost:7070/health ghost-guard optional 0
report_http http://localhost:7171/health ghost-relayer optional 0
report_http http://localhost:7575/health ai-monitor optional 0

if [[ "$FAILURES" -gt 0 ]]; then
  echo "FAIL: $FAILURES required GhostL2 checks are not ready." >&2
  exit 1
fi

echo "OK"
