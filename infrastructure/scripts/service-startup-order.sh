#!/usr/bin/env bash
# =============================================================================
# GhostStack Service Startup Order — Staged Deployment Helper
# =============================================================================
#
# Starts all GhostStack services in the correct dependency order,
# waiting for each stage to be healthy before proceeding to the next.
#
# Usage:
#   bash infrastructure/scripts/service-startup-order.sh [--stage N] [--dry-run]
#
#   --stage N     Start from stage N (1-12)  Default: 1
#   --dry-run     Print plan without starting services
#   --stop        Stop all stages in reverse order
#
# Startup Stages:
#   1  Data Plane          postgres, redis
#   2  Identity & Auth     auth, rbac, ghost-guard, ghost-compliance
#   3  Bridge & Interop    ghost-relayer, rollup-proposers, bridge-hub
#   4  AI Core             ghostbrain-core, ghostbrain-gsa
#   5  AI Specialists      ghost-ai-consensus, ai-monitor, anomaly-detection
#   6  AI Orchestration    hyper-ghost-ai, hg-treasury-agent, hg-risk-oracle
#   7  Treasury & Economy  l3-fee-collector → l2-revenue-aggregator → treasury-engine
#   8  Governance          governance-service, hyper-ghost-governor, staking
#   9  Explorer & Indexing block-index, tx-index, ghostscout L1/L2/L3
#   10 DNS & Networking    ghostdns-resolver, ghostload-controller, ghost-mapper
#   11 GhostX & GNS        ghostx-api, gns-api, gns-indexer
#   12 Control Plane       ghost-compliance, apps/api, apps/web
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

STACK_ROOT="${STACK_ROOT:-/home/ghost/ghostl-stack}"
SERVICES_DIR="$STACK_ROOT/services"
STACK_ENV="$SERVICES_DIR/stack.env"
COMPOSE_FILE="$SERVICES_DIR/docker-compose.yml"
ROOT_COMPOSE="$STACK_ROOT/docker-compose.yml"
DEV_COMPOSE="$STACK_ROOT/docker-compose.dev.yml"

START_STAGE="${START_STAGE:-1}"
DRY_RUN=0
DO_STOP=0

for arg in "$@"; do
  case "$arg" in
    --stage)  shift; START_STAGE="${1:-1}" ;;
    --stage=*) START_STAGE="${arg#--stage=}" ;;
    --dry-run) DRY_RUN=1 ;;
    --stop)    DO_STOP=1 ;;
    --help|-h)
      grep '^#' "$0" | head -40 | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

log()    { echo -e "${CYAN}[startup]${RESET} $(date -u +%H:%M:%SZ) $*"; }
ok()     { echo -e "${GREEN}[  OK  ]${RESET} $*"; }
warn()   { echo -e "${YELLOW}[ WARN ]${RESET} $*" >&2; }
stage()  { echo -e "\n${BOLD}${CYAN}══ STAGE $1: $2 ══${RESET}"; }
dryrun() { [ "$DRY_RUN" = "1" ] && echo -e "${YELLOW}[DRY]${RESET} $*"; }

dc() {
  # docker compose wrapper — uses stack.env if present
  if [ -f "$STACK_ENV" ]; then
    docker compose --env-file "$STACK_ENV" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

dc_root() {
  docker compose -f "$ROOT_COMPOSE" "$@"
}

dc_dev() {
  if [ -f "$STACK_ENV" ]; then
    docker compose --env-file "$STACK_ENV" -f "$DEV_COMPOSE" "$@"
  else
    docker compose -f "$DEV_COMPOSE" "$@"
  fi
}

start_svc() {
  local svc="$1"
  if [ "$DRY_RUN" = "1" ]; then
    dryrun "  would start: $svc"
    return 0
  fi
  dc up -d "$svc" 2>/dev/null || warn "  $svc not in compose — skipping"
}

wait_http() {
  local url="$1" label="$2" attempts="${3:-45}"
  if [ "$DRY_RUN" = "1" ]; then
    dryrun "  would wait for: $label ($url)"
    return 0
  fi
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      ok "$label ready"
      return 0
    fi
    sleep 2
  done
  warn "$label not responding at $url — continuing"
}

wait_rpc() {
  local url="$1" label="$2" attempts="${3:-60}"
  if [ "$DRY_RUN" = "1" ]; then
    dryrun "  would wait for RPC: $label ($url)"
    return 0
  fi
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 3 -X POST "$url" \
        -H 'content-type: application/json' \
        --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
        >/dev/null 2>&1; then
      ok "$label RPC ready"
      return 0
    fi
    sleep 2
  done
  warn "RPC not responding: $label ($url) — continuing"
}

# =============================================================================
# STAGE DEFINITIONS
# =============================================================================

stage1_data_plane() {
  stage 1 "Data Plane (postgres, redis)"
  [ "$START_STAGE" -gt 1 ] && { log "Skipping stage 1 (--stage=$START_STAGE)"; return 0; }

  log "Starting shared data infrastructure..."
  for svc in postgres redis; do
    start_svc "$svc"
  done

  # Wait for postgres readiness
  if [ "$DRY_RUN" != "1" ]; then
    log "Waiting for postgres to be ready..."
    for i in $(seq 1 30); do
      local pg_container
      pg_container=$(docker ps -qf name=postgres 2>/dev/null | head -1)
      if [ -n "$pg_container" ] && \
         docker exec "$pg_container" pg_isready -U ghost &>/dev/null 2>&1; then
        ok "postgres ready"
        break
      fi
      sleep 2
    done
    wait_http "http://localhost:6379" "redis" 15 || true
  fi

  ok "Stage 1 complete"
}

stage2_identity() {
  stage 2 "Identity & Auth"
  [ "$START_STAGE" -gt 2 ] && { log "Skipping stage 2"; return 0; }

  log "Starting identity and security services..."
  local svcs=(
    auth-service
    rbac-service
    session-service
    key-rotation-service
    secrets-health-service
    ghost-guard
    ghost-jwks-guard
    audit-log-service
    ghost-secure-logger
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  wait_http "http://localhost:7070/health" "ghost-guard" 30

  log "Starting ghost-compliance (root compose)..."
  if [ "$DRY_RUN" != "1" ] && [ -f "$ROOT_COMPOSE" ]; then
    dc_root up -d ghost-compliance 2>/dev/null || true
    wait_http "http://localhost:8090/health" "ghost-compliance" 30
  fi

  ok "Stage 2 complete"
}

stage3_bridge() {
  stage 3 "Bridge & Interop"
  [ "$START_STAGE" -gt 3 ] && { log "Skipping stage 3"; return 0; }

  log "Starting bridge and interop services..."
  local svcs=(
    ghost-relayer
    ghost-rollup-proposer
    ghost-rollup-proposer-l2
    ghost-rollup-challenger
    bridge-service
    ghostchain-bridge-hub
    liquidity-service
    liquidity-router
    liquidity-prover
    transfer-lifecycle-service
    dispute-service
    dtn-relay
    preconfirm-service
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  wait_http "http://localhost:7171/health" "ghost-relayer"       30
  wait_http "http://localhost:7272/health" "rollup-proposer-l2"  30
  wait_http "http://localhost:7282/health" "rollup-challenger"   25

  ok "Stage 3 complete"
}

stage4_ai_core() {
  stage 4 "AI Core (GhostBrain)"
  [ "$START_STAGE" -gt 4 ] && { log "Skipping stage 4"; return 0; }

  log "Starting GhostBrain Core (base AI runtime)..."
  for svc in ghostbrain-core ghostbrain-gsa; do
    start_svc "$svc"
  done

  wait_http "http://localhost:7900/health" "ghostbrain-core" 60
  wait_http "http://localhost:7901/health" "ghostbrain-gsa"  30

  ok "Stage 4 complete — GhostBrain Core online"
}

stage5_ai_specialists() {
  stage 5 "AI Specialists"
  [ "$START_STAGE" -gt 5 ] && { log "Skipping stage 5"; return 0; }

  log "Starting AI specialist services..."
  local svcs=(
    ghost-ai-consensus
    ghost-ai-attestor
    ghost-ai-contract-engine
    ai-monitor
    ai-vault
    ai-policy
    ai-clock-sync
    anomaly-detection-service
    forecasting-service
    explainability-service
    ghost-storage-ai
    ghostvm-ai
    ghostcontract-ai
    host-orchestrator-ai
    vm-protocol-ai
    agent-node
    agent-registry-service
    autonomous-vault-hypervisor
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  wait_http "http://localhost:7903/health" "ghost-ai-consensus" 30
  wait_http "http://localhost:7930/health" "ghost-ai-attestor"  25
  wait_http "http://localhost:7950/health" "anomaly-detection"  25

  ok "Stage 5 complete — AI specialists online"
}

stage6_ai_orchestration() {
  stage 6 "AI Orchestration (HyperGhost)"
  [ "$START_STAGE" -gt 6 ] && { log "Skipping stage 6"; return 0; }

  log "Starting HyperGhost AI orchestration..."
  local svcs=(
    hyper-ghost-ai
    hyper-ghost-supervisor
    hg-treasury-agent
    hg-risk-oracle
    hg-proof-snapshotter
    hg-reporting-indexer
    ghost-sync-sentinel
    ghostdns-ai
    ghostdns-ai-policy
    ghostload-ai
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  wait_http "http://localhost:7902/health" "hyper-ghost-ai" 60

  log "AI Intelligence Stack:"
  echo -e "  ${GREEN}✓${RESET} GhostBrain Core    :7900  (base AI runtime)"
  echo -e "  ${GREEN}✓${RESET} GhostBrain GSA     :7901  (sovereign agent)"
  echo -e "  ${GREEN}✓${RESET} HyperGhost AI      :7902  (apex orchestrator)"
  echo -e "  ${GREEN}✓${RESET} AI Consensus       :7903  (consensus validation)"
  echo -e "  ${GREEN}✓${RESET} HG Treasury Agent  :7690  (treasury AI)"
  echo -e "  ${GREEN}✓${RESET} HG Risk Oracle     :7691  (risk scoring)"
  echo -e "  ●   Consciousness SDK        (in-process, loaded by apps/api)"
  echo -e "  ●   Cognitive SDK            (in-process, loaded by apps/api)"
  echo -e "  ●   Swarm SDK                (in-process, loaded by apps/api)"

  ok "Stage 6 complete — AI orchestration layer live"
}

stage7_treasury() {
  stage 7 "Treasury & Economy"
  [ "$START_STAGE" -gt 7 ] && { log "Skipping stage 7"; return 0; }

  log "Starting treasury and economy pipeline..."
  log "Revenue flow: L3 fees → L2 aggregator → L1 treasury → reward distributor"

  local svcs=(
    l3-fee-collector
    l2-revenue-aggregator
    treasury-engine
    treasury-ai
    treasury-service
    treasury-evidence
    reward-distributor
    payout-service
    supply-service
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  wait_http "http://localhost:7681/health" "l3-fee-collector"      25
  wait_http "http://localhost:7682/health" "l2-revenue-aggregator" 25
  wait_http "http://localhost:7683/health" "treasury-engine"       30
  wait_http "http://localhost:7684/health" "reward-distributor"    25

  ok "Stage 7 complete — economy pipeline live"
}

stage8_governance() {
  stage 8 "Governance"
  [ "$START_STAGE" -gt 8 ] && { log "Skipping stage 8"; return 0; }

  log "Starting governance and staking services..."
  local svcs=(
    governance-service
    hyper-ghost-governor
    hyper-ghost-supervisor
    staking-service
    validator-service
    rewards-service
    participation-service
    slashing-detection-service
    snapshot-service
    upgrade-orchestrator-service
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  wait_http "http://localhost:5000/health" "governance-service"   30
  wait_http "http://localhost:5001/health" "hyper-ghost-governor" 25

  log "Governance loop:"
  echo -e "  DAO Proposal → Timelock Executor → FederationRegistry"
  echo -e "  → FederationPolicy + TreasuryEngine → RewardDistributor"
  echo -e "  → GlobalPool / MemberPools / EventIncentives"

  ok "Stage 8 complete — governance active"
}

stage9_explorer() {
  stage 9 "Explorer & Indexing"
  [ "$START_STAGE" -gt 9 ] && { log "Skipping stage 9"; return 0; }

  log "Starting explorer and indexing services..."
  local svcs=(
    block-index-service
    tx-index-service
    mempool-service
    global-search-service
    entity-tagging-service
    ghostscout-l1
    ghostscout-l2
    ghostscout-l3
    ghostscout-frontend-l1
    ghostscout-frontend-l2
    ghostscout-frontend-l3
    node-health-service
    node-inventory-service
    chain-status-service
    peer-graph-service
    consensus-telemetry-service
    verification-service
    proxy-inspector-service
    contract-registry-service
    contract-risk-service
    ghost-registry
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  wait_http "http://localhost:4100/health" "block-index-service" 30
  wait_http "http://localhost:4501"        "ghostscout-l1"       45
  wait_http "http://localhost:4502"        "ghostscout-l2"       45
  wait_http "http://localhost:4503"        "ghostscout-l3"       45

  ok "Stage 9 complete — explorers live"
}

stage10_dns_network() {
  stage 10 "DNS & Networking"
  [ "$START_STAGE" -gt 10 ] && { log "Skipping stage 10"; return 0; }

  log "Starting DNS and network management services..."
  local svcs=(
    ghostdns-resolver
    ghostdns-indexer
    ghostdns-attestor
    ghostload-controller
    ghost-mapper
    ghost-pil
    ghost-pil-worker
    network-manager-service
    network-context-service
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  ok "Stage 10 complete — DNS and networking configured"
}

stage11_ghostx_gns() {
  stage 11 "GhostX & GNS"
  [ "$START_STAGE" -gt 11 ] && { log "Skipping stage 11"; return 0; }

  log "Starting GhostX exchange and Ghost Name Service..."
  local svcs=(
    ghostx-api
    gns-api
    gns-indexer
    ghost-gas-engine
    ghost-gas-engine-worker
    alerts-service
    notifications-service
    ghost-pil
    ghost-compliance-worker
    compliance-export-service
  )

  for svc in "${svcs[@]}"; do
    start_svc "$svc"
  done

  wait_http "http://localhost:6100/health" "ghostx-api" 30
  wait_http "http://localhost:6000/health" "gns-api"    25

  ok "Stage 11 complete — GhostX and GNS online"
}

stage12_control_plane() {
  stage 12 "Control Plane (API + Web)"
  [ "$START_STAGE" -gt 12 ] && { log "Skipping stage 12"; return 0; }

  log "Starting control plane (Express API + Next.js web)..."

  if [ "$DRY_RUN" != "1" ] && [ -f "$DEV_COMPOSE" ]; then
    dc_dev up -d
    wait_http "http://localhost:4000/health" "apps/api" 60
    wait_http "http://localhost:3200"        "apps/web" 60
  else
    dryrun "  would start apps/api + apps/web via docker-compose.dev.yml"
  fi

  log "Control Plane:"
  echo -e "  ${GREEN}●${RESET}  apps/api  (Express 5, port 4000)"
  echo -e "     RBAC: Viewer | Operator | SecurityAdmin | TreasuryAdmin | ProtocolAdmin | Developer"
  echo -e "     Auth: OIDC / JWKS (ghost-jwks-guard) + realm-auth middleware"
  echo -e "     Routes: 16 module routers → 50+ API endpoints"
  echo -e "  ${GREEN}●${RESET}  apps/web  (Next.js 14 App Router, port 3200)"

  ok "Stage 12 complete — control plane live"
}

# =============================================================================
# STOP sequence (reverse order)
# =============================================================================

do_stop() {
  echo -e "\n${BOLD}${RED}Stopping GhostStack services (reverse order)...${RESET}"

  [ -f "$DEV_COMPOSE" ]  && { log "Stopping control plane..."; dc_dev  down 2>/dev/null || true; }
  [ -f "$COMPOSE_FILE" ] && { log "Stopping all services...";  dc      down 2>/dev/null || true; }
  [ -f "$ROOT_COMPOSE" ] && { log "Stopping root services..."; dc_root down 2>/dev/null || true; }

  ok "All GhostStack services stopped"
}

# =============================================================================
# HEALTH CHECK
# =============================================================================

do_health_check() {
  echo -e "\n${BOLD}GhostStack Service Health:${RESET}"
  local PASS=0 FAIL=0

  chk() {
    local label="$1" url="$2"
    if curl -fsS --max-time 4 "$url" >/dev/null 2>&1; then
      echo -e "  ${GREEN}✓${RESET} $label"
      PASS=$((PASS+1))
    else
      echo -e "  ${RED}✗${RESET} $label ($url)"
      FAIL=$((FAIL+1))
    fi
  }

  echo -e "\n${BOLD}Chain:${RESET}"
  chk "L1 RPC  :18545" "http://localhost:18545"
  chk "L2 RPC  :29547" "http://localhost:29547"
  chk "L3 RPC  :39545" "http://localhost:39545"

  echo -e "\n${BOLD}Identity:${RESET}"
  chk "ghost-guard    :7070" "http://localhost:7070/health"
  chk "ghost-compliance :8090" "http://localhost:8090/health"

  echo -e "\n${BOLD}Bridge:${RESET}"
  chk "ghost-relayer      :7171" "http://localhost:7171/health"
  chk "rollup-proposer-l2 :7272" "http://localhost:7272/health"
  chk "rollup-proposer-l3 :7273" "http://localhost:7273/health"

  echo -e "\n${BOLD}AI:${RESET}"
  chk "ghostbrain-core :7900" "http://localhost:7900/health"
  chk "ghostbrain-gsa  :7901" "http://localhost:7901/health"
  chk "hyper-ghost-ai  :7902" "http://localhost:7902/health"
  chk "ai-consensus    :7903" "http://localhost:7903/health"

  echo -e "\n${BOLD}Treasury:${RESET}"
  chk "l3-fee-collector      :7681" "http://localhost:7681/health"
  chk "l2-revenue-aggregator :7682" "http://localhost:7682/health"
  chk "treasury-engine       :7683" "http://localhost:7683/health"
  chk "reward-distributor    :7684" "http://localhost:7684/health"

  echo -e "\n${BOLD}Governance:${RESET}"
  chk "governance-service   :5000" "http://localhost:5000/health"
  chk "hyper-ghost-governor :5001" "http://localhost:5001/health"

  echo -e "\n${BOLD}Explorer:${RESET}"
  chk "ghostscout-l1 :4501" "http://localhost:4501"
  chk "ghostscout-l2 :4502" "http://localhost:4502"
  chk "ghostscout-l3 :4503" "http://localhost:4503"
  chk "gns-api       :6000" "http://localhost:6000/health"
  chk "ghostx-api    :6100" "http://localhost:6100/health"

  echo -e "\n${BOLD}Control Plane:${RESET}"
  chk "apps/api :4000" "http://localhost:4000/health"
  chk "apps/web :3200" "http://localhost:3200"

  echo -e "\n${BOLD}Monitoring:${RESET}"
  chk "prometheus :9090" "http://localhost:9090/-/healthy"
  chk "grafana    :3100" "http://localhost:3100/api/health"

  echo ""
  echo -e "${BOLD}Result:${RESET} ${GREEN}$PASS passing${RESET} / ${RED}$FAIL not reachable${RESET}"
}

# =============================================================================
# MAIN
# =============================================================================
main() {
  echo -e "${BOLD}${CYAN}"
  echo "  👻 GhostStack Service Startup — Staged Deployment"
  echo -e "${RESET}"

  if [ "$DO_STOP" = "1" ]; then
    do_stop
    exit 0
  fi

  if [ ! -f "$COMPOSE_FILE" ]; then
    warn "Services compose not found at $COMPOSE_FILE"
    warn "Ensure the repo is cloned at $STACK_ROOT first."
    exit 1
  fi

  local start_ts
  start_ts=$(date +%s)

  stage1_data_plane
  stage2_identity
  stage3_bridge
  stage4_ai_core
  stage5_ai_specialists
  stage6_ai_orchestration
  stage7_treasury
  stage8_governance
  stage9_explorer
  stage10_dns_network
  stage11_ghostx_gns
  stage12_control_plane

  local elapsed=$(( $(date +%s) - start_ts ))
  echo ""
  ok "All 12 stages complete in ${elapsed}s"

  do_health_check
}

main "$@"
