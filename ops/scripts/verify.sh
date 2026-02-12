#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CANONICAL="$ROOT_DIR/ops/STACK_CANONICAL.yml"
STRICT="false"
FAILURES=0
RUN_L1_DOCTOR="${RUN_L1_DOCTOR:-0}"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT_DIR}/scripts/lib/docker.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict) STRICT="true"; shift;;
    --l1-doctor) RUN_L1_DOCTOR="1"; shift;;
    -h|--help)
      echo "Usage: verify.sh [--strict] [--l1-doctor]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
  local message="$1"
  log "FAIL: $message"
  FAILURES=$((FAILURES+1))
}

rpc_call() {
  local url="$1"
  local method="$2"
  local payload
  payload=$(printf '{"jsonrpc":"2.0","id":1,"method":"%s","params":[]}' "$method")
  curl -sS --max-time 5 -H 'Content-Type: application/json' -d "$payload" "$url" || return 1
}

get_chain_url() {
  local key="$1"
  python3 - "$CANONICAL" "$key" <<'PY'
import json,sys,os
path=sys.argv[1]
key=sys.argv[2]
if not os.path.isfile(path):
    print("")
    raise SystemExit(0)
try:
    data=json.load(open(path))
    chain=data.get("chains",{}).get(key,{})
    print(chain.get("rpcHttp","") or "")
except Exception:
    print("")
PY
}

get_chain_ws() {
  local key="$1"
  python3 - "$CANONICAL" "$key" <<'PY'
import json,sys,os
path=sys.argv[1]
key=sys.argv[2]
if not os.path.isfile(path):
    print("")
    raise SystemExit(0)
try:
    data=json.load(open(path))
    chain=data.get("chains",{}).get(key,{})
    print(chain.get("rpcWs","") or "")
except Exception:
    print("")
PY
}

log "Docker runtime"
hg_docker ps --format '{{.Names}} {{.Status}}' || true

hg_docker compose ls --format json || true

if [[ "$RUN_L1_DOCTOR" == "1" && -x "$ROOT_DIR/infra/scripts/doctor-l1.sh" ]]; then
  log "Running L1 doctor"
  if ! "$ROOT_DIR/infra/scripts/doctor-l1.sh"; then
    log "L1 doctor failed"
    if [[ "$STRICT" == "true" ]]; then
      fail "L1 doctor failed"
    fi
  fi
fi

log "Compose project status"
projects="$(hg_docker compose ls --format json 2>/dev/null | python3 -c 'import json,sys; data=json.load(sys.stdin); print(\" \".join([p[\"Name\"] for p in data]))' 2>/dev/null || true)"
for project in $projects; do
  log "Project: $project"
  hg_docker compose -p "$project" ps --format json || true
  hg_docker compose -p "$project" ps || true
done

L1_URL=$(get_chain_url l1)
L2_URL=$(get_chain_url l2)
L3_URL=$(get_chain_url l3)

if [[ -z "$L1_URL" ]]; then L1_URL="http://localhost:18545"; fi
if [[ -z "$L2_URL" ]]; then L2_URL="http://localhost:29547"; fi
if [[ -z "$L3_URL" ]]; then L3_URL="http://localhost:39545"; fi

log "RPC checks"
print_rpc_field() {
  local label="$1"
  python3 - "$label" <<'PY'
import json,sys
label=sys.argv[1]
raw=sys.stdin.read()
try:
    data=json.loads(raw)
    print(label, data.get("result"))
except Exception:
    print(label, "unavailable")
PY
}

check_http() {
  local name="$1"
  local url="$2"
  if [[ -z "$url" ]]; then
    log "$name: skipped (empty URL)"
    return 0
  fi
  if curl -sS --max-time 5 "$url" >/dev/null; then
    log "$name: ok"
    return 0
  fi
  log "$name: failed"
  if [[ "$STRICT" == "true" ]]; then
    fail "$name unavailable"
  fi
  return 1
}

check_tcp() {
  local name="$1"
  local url="$2"
  if [[ -z "$url" ]]; then
    log "$name: skipped (empty URL)"
    return 0
  fi
  if python3 - "$url" <<'PY'
import socket,sys,urllib.parse
url=sys.argv[1]
parsed=urllib.parse.urlparse(url)
host=parsed.hostname or url.split(":",1)[0]
port=parsed.port
if not port:
    port=443 if parsed.scheme in ("https","wss") else 80
s=socket.socket()
s.settimeout(3)
s.connect((host,port))
s.close()
PY
  then
    log "$name: ok"
    return 0
  fi
  log "$name: failed"
  if [[ "$STRICT" == "true" ]]; then
    fail "$name unavailable"
  fi
  return 1
}

log "L1 rpc: $L1_URL"
L1_CHAIN_ID=$(rpc_call "$L1_URL" eth_chainId || true)
if [[ -n "$L1_CHAIN_ID" ]]; then
  printf '%s' "$L1_CHAIN_ID" | print_rpc_field "L1 chainId"
else
  log "L1 chainId unavailable"
  if [[ "$STRICT" == "true" ]]; then
    fail "L1 chainId unavailable"
  fi
fi
L1_BLOCK=$(rpc_call "$L1_URL" eth_blockNumber || true)
if [[ -n "$L1_BLOCK" ]]; then
  printf '%s' "$L1_BLOCK" | print_rpc_field "L1 blockNumber"
else
  log "L1 blockNumber unavailable"
  if [[ "$STRICT" == "true" ]]; then
    fail "L1 blockNumber unavailable"
  fi
fi
L1_NET=$(rpc_call "$L1_URL" net_version || true)
if [[ -n "$L1_NET" ]]; then
  printf '%s' "$L1_NET" | print_rpc_field "L1 net_version"
else
  log "L1 net_version unavailable"
  if [[ "$STRICT" == "true" ]]; then
    fail "L1 net_version unavailable"
  fi
fi

log "L2 rpc: $L2_URL"
L2_CHAIN_ID=$(rpc_call "$L2_URL" eth_chainId || true)
if [[ -n "$L2_CHAIN_ID" ]]; then
  printf '%s' "$L2_CHAIN_ID" | print_rpc_field "L2 chainId"
else
  log "L2 chainId unavailable"
  if [[ "$STRICT" == "true" ]]; then
    fail "L2 chainId unavailable"
  fi
fi
L2_BLOCK=$(rpc_call "$L2_URL" eth_blockNumber || true)
if [[ -n "$L2_BLOCK" ]]; then
  printf '%s' "$L2_BLOCK" | print_rpc_field "L2 blockNumber"
else
  log "L2 blockNumber unavailable"
  if [[ "$STRICT" == "true" ]]; then
    fail "L2 blockNumber unavailable"
  fi
fi
L2_NET=$(rpc_call "$L2_URL" net_version || true)
if [[ -n "$L2_NET" ]]; then
  printf '%s' "$L2_NET" | print_rpc_field "L2 net_version"
else
  log "L2 net_version unavailable"
  if [[ "$STRICT" == "true" ]]; then
    fail "L2 net_version unavailable"
  fi
fi

log "L3 rpc: $L3_URL"
L3_CHAIN_ID=$(rpc_call "$L3_URL" eth_chainId || true)
if [[ -n "$L3_CHAIN_ID" ]]; then
  printf '%s' "$L3_CHAIN_ID" | print_rpc_field "L3 chainId"
else
  log "L3 chainId unavailable"
  if [[ "$STRICT" == "true" ]]; then
    fail "L3 chainId unavailable"
  fi
fi
L3_BLOCK=$(rpc_call "$L3_URL" eth_blockNumber || true)
if [[ -n "$L3_BLOCK" ]]; then
  printf '%s' "$L3_BLOCK" | print_rpc_field "L3 blockNumber"
else
  log "L3 blockNumber unavailable"
  if [[ "$STRICT" == "true" ]]; then
    fail "L3 blockNumber unavailable"
  fi
fi

log "WS checks"
L1_WS=$(get_chain_ws l1)
L2_WS=$(get_chain_ws l2)
L3_WS=$(get_chain_ws l3)
if [[ -z "$L1_WS" ]]; then L1_WS="ws://localhost:18546"; fi
if [[ -z "$L2_WS" ]]; then L2_WS="ws://localhost:29548"; fi
if [[ -z "$L3_WS" ]]; then L3_WS="ws://localhost:39546"; fi
check_tcp "L1 ws" "$L1_WS"
check_tcp "L2 ws" "$L2_WS"
check_tcp "L3 ws" "$L3_WS"

log "Health endpoints"

check_http "op-node" "http://localhost:9546"
check_http "op-node metrics" "http://localhost:7300/metrics"
check_http "op-sequencer" "http://localhost:9646"
check_http "op-sequencer metrics" "http://localhost:7303/metrics"
check_http "op-batcher" "http://localhost:8551"
check_http "op-batcher metrics" "http://localhost:7301/metrics"
check_http "op-proposer metrics" "http://localhost:7302/metrics"
check_http "op-gate" "http://localhost:28546/gate/status"
check_http "ghost-guard" "http://localhost:7070/health"
check_http "ghost-relayer" "http://localhost:7171/health"
check_http "compliance" "http://localhost:8090/health"
check_http "gas-engine" "http://localhost:3210/health"
check_http "pil" "http://localhost:3220/health"
check_http "prometheus" "http://localhost:9090/-/healthy"
check_http "prometheus (alt)" "http://localhost:9091/-/healthy"
check_http "prometheus targets" "http://localhost:9090/api/v1/targets"
check_http "prometheus targets (alt)" "http://localhost:9091/api/v1/targets"
check_http "grafana" "http://localhost:3000/api/health"
check_http "ui-status" "http://localhost:3200/api/status"
check_http "ghostscout-l1" "http://localhost:18641"
check_http "ghostscout-l2" "http://localhost:18642"
check_http "ghostscout-l3" "http://localhost:18643"
check_http "ghostscout-ui-l1" "http://localhost:18651"
check_http "ghostscout-ui-l2" "http://localhost:18652"
check_http "ghostscout-ui-l3" "http://localhost:18653"

if hg_docker info >/dev/null 2>&1; then
  log "Explorer DB checks"
  if hg_docker ps --format '{{.Names}}' | grep -q '^ghost_ghostscout-db$'; then
    if hg_docker exec ghost_ghostscout-db pg_isready -U ghostscout >/dev/null 2>&1; then
      log "ghostscout-db: ok"
    else
      log "ghostscout-db: failed"
      if [[ "$STRICT" == "true" ]]; then
        fail "ghostscout-db unavailable"
      fi
    fi
  else
    log "ghostscout-db: skipped (container not running)"
  fi
fi

log "Log scan (fatal patterns)"
patterns='panic|fatal|cannot connect|unauthorized|chainId mismatch|jwt'
mapfile -t containers < <(hg_docker ps --format '{{.Names}}' 2>/dev/null || true)
for name in "${containers[@]}"; do
  if hg_docker logs --tail 200 "$name" 2>/dev/null | grep -Eqi "$patterns"; then
    log "WARN: fatal pattern in $name"
  fi
done

log "Verify complete"
if [[ "$STRICT" == "true" && "$FAILURES" -gt 0 ]]; then
  exit 1
fi
