#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
OP_ENV="$ROOT_DIR/infra/opstack/.env"
DOCTOR_DRY_RUN=0
DOCTOR_JSON=0
DOCTOR_VERBOSE=0

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

if [ -f "$OP_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OP_ENV"
  [ -f "$ROOT_DIR/infra/opstack/.env.secrets" ] && source "$ROOT_DIR/infra/opstack/.env.secrets"
  set +a
fi

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
HOST_GATE_RPC="${HOST_GATE_RPC:-http://localhost:28546}"
DOCTOR_WAIT_ATTEMPTS_DEFAULT="${DOCTOR_WAIT_ATTEMPTS:-}"
if [ -z "$DOCTOR_WAIT_ATTEMPTS_DEFAULT" ]; then
  if [ "$DOCTOR_DRY_RUN" -eq 1 ]; then
    DOCTOR_WAIT_ATTEMPTS_DEFAULT=1
  else
    DOCTOR_WAIT_ATTEMPTS_DEFAULT=5
  fi
fi

jsonrpc_chain_id() {
  local url="$1"
  curl -fsS -X POST "$url" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' 2>/dev/null || true
}

wait_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-$DOCTOR_WAIT_ATTEMPTS_DEFAULT}"
  local sleep_s="${4:-1}"
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
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
  if [ -n "$body" ]; then
    printf '%s\n' "$body"
  fi
  if [ -n "$body" ]; then
    echo
  fi
}

report_http() {
  local url="$1"
  local label="$2"
  local severity="${3:-optional}"
  local show_body="${4:-1}"
  if wait_http "$url" "$label" >/dev/null; then
    echo "OK: $label ($url)"
  elif [ "$severity" = "required" ]; then
    echo "NOT READY: $label ($url)"
  else
    echo "WARN: $label unavailable ($url)"
  fi
  if [ "$show_body" = "1" ]; then
    print_http "$url"
  fi
}

echo
echo "RPC chainIds:"
echo "  L1(anvil):  $(jsonrpc_chain_id "$HOST_L1_RPC" || true)"
echo "  L2(op-geth):$(jsonrpc_chain_id "$HOST_L2_RPC" || true)"
echo "  L3(op-stack optional): $(jsonrpc_chain_id "$HOST_L3_RPC" || true)"

echo
echo "Health endpoints:"

report_http "$HOST_GATE_RPC/gate/status" op-gate optional 1
report_http http://localhost:9546 optimism-op-node optional 0
report_http http://localhost:7070/health ghost-guard optional 0
report_http http://localhost:7171/health ghost-relayer optional 0
report_http http://localhost:7272/health rollup-proposer-l3 optional 0

if wait_http http://localhost:7273/health rollup-proposer-l2 >/dev/null; then
  echo "OK: rollup-proposer-l2 (http://localhost:7273/health)"
  print_http http://localhost:7273/health
else
  report_http http://localhost:7373/health rollup-proposer-l2-legacy optional 0
fi

report_http http://localhost:7282/health rollup-challenger-l3 optional 0

if wait_http http://localhost:7283/health rollup-challenger-l2 >/dev/null; then
  echo "OK: rollup-challenger-l2 (http://localhost:7283/health)"
  print_http http://localhost:7283/health
else
  report_http http://localhost:7383/health rollup-challenger-l2-legacy optional 0
fi

if wait_http http://localhost:9091/-/ready prometheus >/dev/null; then
  echo "OK: prometheus (http://localhost:9091/-/ready)"
  print_http http://localhost:9091/-/ready
else
  report_http http://localhost:9090/-/ready prometheus-legacy optional 1
fi

report_http http://localhost:3000/api/health grafana optional 1

report_http http://localhost:7575/health ai-monitor optional 0

report_http http://localhost:3210/ready ghost-gas-engine optional 0
report_http http://localhost:3210/metrics ghost-gas-engine-metrics optional 0

report_http http://localhost:8090/health ghost-compliance optional 1
report_http http://localhost:8090/metrics ghost-compliance-metrics optional 0

report_http http://localhost:3220/health ghost-pil optional 0
report_http http://localhost:3220/metrics ghost-pil-metrics optional 0

echo "OK"
