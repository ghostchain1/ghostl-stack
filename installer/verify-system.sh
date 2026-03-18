#!/usr/bin/env bash
# verify-system.sh — Validate the complete GhostStack deployment
#
# Performs health checks across all layers and prints a status report.
# Exit code 0 = all critical services healthy.
# Exit code 1 = one or more critical services failed.
#
# Critical (must pass): L1 RPC, L2 RPC, API
# Warning (reported but non-fatal): L3 RPC, GhostBrain, individual services

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

PASS=0
FAIL=1
WARN=2

RESULTS=()   # ("label|status|detail")

log() { echo "[verify-system] $*"; }

# ── Health check helpers ──────────────────────────────────────────────────────

check_http() {
  local label="$1"
  local url="$2"
  local critical="${3:-1}"   # 1=critical, 0=warning-only

  local http_code
  http_code=$(curl -sf --max-time 8 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

  if [[ "$http_code" =~ ^[23] ]]; then
    RESULTS+=("$label|PASS|HTTP $http_code")
    return 0
  else
    local severity
    severity=$([[ "$critical" -eq 1 ]] && echo "FAIL" || echo "WARN")
    RESULTS+=("$label|$severity|HTTP $http_code (url: $url)")
    return 1
  fi
}

check_rpc() {
  local label="$1"
  local port="$2"
  local critical="${3:-1}"

  local response block
  response=$(curl -sf \
    --max-time 8 \
    -X POST \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
    "http://localhost:${port}" 2>/dev/null || true)

  if echo "$response" | grep -q '"result"'; then
    block=$(echo "$response" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(int(d['result'],16))" 2>/dev/null || echo "?")
    RESULTS+=("$label|PASS|block=${block} port=${port}")
    return 0
  else
    local severity
    severity=$([[ "$critical" -eq 1 ]] && echo "FAIL" || echo "WARN")
    RESULTS+=("$label|$severity|no response on :${port}")
    return 1
  fi
}

check_tcp() {
  local label="$1"
  local host="$2"
  local port="$3"
  local critical="${4:-0}"

  if timeout 5 bash -c "echo > /dev/tcp/${host}/${port}" 2>/dev/null; then
    RESULTS+=("$label|PASS|tcp port ${port} open")
    return 0
  else
    local severity
    severity=$([[ "$critical" -eq 1 ]] && echo "FAIL" || echo "WARN")
    RESULTS+=("$label|$severity|tcp port ${port} not reachable")
    return 1
  fi
}

check_container() {
  local label="$1"
  local container_partial="$2"

  local state
  state=$(docker ps --filter "name=${container_partial}" --format "{{.Status}}" 2>/dev/null | head -1)
  if echo "$state" | grep -qi "up"; then
    RESULTS+=("$label|PASS|$state")
    return 0
  else
    RESULTS+=("$label|WARN|not running (searched: ${container_partial})")
    return 1
  fi
}

# ── Run checks ────────────────────────────────────────────────────────────────

log "╔══════════════════════════════════════════╗"
log "║  GhostStack System Verification          ║"
log "╚══════════════════════════════════════════╝"

# ── Blockchain layer (CRITICAL) ───────────────────────────────────────────────

check_rpc "GhostChain L1 RPC (chain_id=14000101)" "${L1_EVM_PORT:-18545}"  1 || true
check_rpc "GhostL2 RPC      (chain_id=901)"        "${L2_RPC_PORT:-29547}" 1 || true
check_rpc "GhostL3 RPC      (chain_id=903)"        "${L3_RPC_PORT:-39545}" 0 || true

check_http "Cosmos LCD"         "http://localhost:${GHOSTCHAIN_LCD_PORT:-1317}/cosmos/base/tendermint/v1beta1/node_info" 0 || true

# ── Applications (CRITICAL: API) ──────────────────────────────────────────────

check_http "GhostStack API"     "http://localhost:${API_PORT:-4000}/health"  1 || true
check_http "GhostStack Web UI"  "http://localhost:${WEB_PORT:-3200}"         0 || true
check_http "Compliance API"     "http://localhost:${COMPLIANCE_PORT:-8090}/health" 0 || true

# ── GhostBrain AI ─────────────────────────────────────────────────────────────

check_http "GhostBrain Core"         "http://localhost:${GHOSTBRAIN_CORE_PORT:-7900}/health" 0  || true
check_http "GhostBrain Orchestrator" "http://localhost:7895/health"                          0  || true
check_http "Hypervisor Supervisor"   "http://localhost:${HYPER_GHOST_PORT:-7741}/health"     0  || true
check_http "GSA / Swarm Agents"      "http://localhost:${GSA_PORT:-7850}/health"             0  || true
check_http "GAIS REST API"           "http://localhost:${GAIS_LISTEN_PORT:-9100}/health"     0  || true
check_http "NOC AI Portal"           "http://localhost:7960/health"                          0  || true

# ── Sovereign services ────────────────────────────────────────────────────────

check_http "L3 Fee Collector"        "http://localhost:${L3_FEE_COLLECTOR_PORT:-7681}/health"     0 || true
check_http "L2 Revenue Aggregator"   "http://localhost:${L2_REVENUE_AGGREGATOR_PORT:-7682}/health" 0 || true
check_http "Treasury Engine"         "http://localhost:${TREASURY_ENGINE_PORT:-7683}/health"      0 || true
check_http "Reward Distributor"      "http://localhost:${REWARD_DISTRIBUTOR_PORT:-7684}/health"   0 || true
check_http "Hyper Ghost Governor"    "http://localhost:${HYPER_GHOST_GOVERNOR_PORT:-7685}/health"  0 || true

# ── LitVybzLive Economy Services ──────────────────────────────────────────────

check_http "LV Economy: Creator Treasury"    "http://127.0.0.1:7040/health" 0 || true
check_http "LV Economy: Fan Memberships"     "http://127.0.0.1:7041/health" 0 || true
check_http "LV Economy: Creator Tokens"      "http://127.0.0.1:7042/health" 0 || true
check_http "LV Economy: NFT Gifts"           "http://127.0.0.1:7043/health" 0 || true
check_http "LV Economy: Staking Engine"      "http://127.0.0.1:7044/health" 0 || true
check_http "LV Economy: Revenue Distrib."    "http://127.0.0.1:7045/health" 0 || true
check_http "LV Economy: Fan DAO"             "http://127.0.0.1:7046/health" 0 || true
check_http "LV Economy: Marketplace"         "http://127.0.0.1:7047/health" 0 || true

# ── Infrastructure ─────────────────────────────────────────────────────────────

check_tcp "Postgres" "127.0.0.1" "${POSTGRES_PORT:-5432}" 0 || true
check_tcp "Redis"    "127.0.0.1" "${REDIS_PORT:-6379}"    0 || true
check_tcp "NATS"     "127.0.0.1" "${NATS_PORT:-4222}"     0 || true

# ── Key containers ────────────────────────────────────────────────────────────

check_container "Container: ghostchaind"    "ghostchaind"          || true
check_container "Container: ghostbrain"     "ghostbrain-core"      || true
check_container "Container: treasury"       "treasury-engine"      || true
check_container "Container: compliance"     "ghost-compliance"     || true

# ── Print report ──────────────────────────────────────────────────────────────

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

echo ""
echo "┌──────────────────────────────────────────────────────────────────────────────┐"
printf  "│ %-76s │\n" "GhostStack Verification Report — $(date '+%Y-%m-%d %H:%M:%S')"
echo "├──────────────┬──────────┬──────────────────────────────────────────────────┤"
printf  "│ %-40s │ %-8s │ %-48s │\n" "Service" "Status" "Detail"
echo "├──────────────┴──────────┴──────────────────────────────────────────────────┤"

for result in "${RESULTS[@]}"; do
  IFS='|' read -r label status detail <<< "$result"
  # Truncate long strings
  label="${label:0:40}"
  detail="${detail:0:48}"
  printf "│ %-40s │ %-8s │ %-48s │\n" "$label" "$status" "$detail"
  case "$status" in
    PASS) (( PASS_COUNT++ )) ;;
    WARN) (( WARN_COUNT++ )) ;;
    FAIL) (( FAIL_COUNT++ )) ;;
  esac
done

echo "├──────────────────────────────────────────────────────────────────────────────┤"
printf "│ %-76s │\n" "PASS: ${PASS_COUNT}   WARN: ${WARN_COUNT}   FAIL: ${FAIL_COUNT}"
echo "└──────────────────────────────────────────────────────────────────────────────┘"
echo ""

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  log "CRITICAL: ${FAIL_COUNT} service(s) failed. Check logs with: docker compose logs <service>"
  exit 1
else
  log "All critical services healthy. Warnings (if any) are non-fatal."
  exit 0
fi
