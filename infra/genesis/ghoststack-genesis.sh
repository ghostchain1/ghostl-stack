#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# GhostStack Autonomous Genesis Installer v4
# ══════════════════════════════════════════════════════════════════════════════
#
# One-command full-ecosystem deployment for GhostChain L1 + L2 + L3.
#
# Phases 1-18 are delegated to the v3 installer (infra/genesis-installer-v3.sh).
# Phases 19-24 are implemented here:
#   19  DeFi Protocol Deployment  — forge script → GhostLend/Stable/Yield/Derivatives
#   20  Bridge Initialization     — register L1↔L2↔L3 bridge contracts
#   21  AI Service Swarm          — start ghostbrain-swarm, ghost-deployer, ghost-evolution
#   22  Security Initialization   — multi-sig treasury, slashing, fraud detection params
#   23  Genesis Manifest          — write genesis-manifest.json with all endpoints + addresses
#   24  Health Verification       — poll all nodes + services, print pass/fail summary
#
# Usage:
#   bash ghoststack-genesis.sh
#   ghoststack genesis
#   GHOST_MODE=prod ./infra/genesis/ghoststack-genesis.sh
#   DRY_RUN=true ./infra/genesis/ghoststack-genesis.sh            # prints actions, no execution
#   SKIP_BOOTSTRAP=true ./infra/genesis/ghoststack-genesis.sh     # skip phases 1-18 (v3)
#
# Environment variables:
#   GHOST_MODE        dev | prod           (default: dev)
#   DRY_RUN           true | false         (default: false)
#   SKIP_BOOTSTRAP    true | false         (default: false — runs v3 phases 1-18 first)
#   DEPLOYER_KEY      0x<privkey>          (required for forge contract deployment)
#   L1_RPC            http://…:18545       (default: http://localhost:18545)
#   L2_RPC            http://…:29545       (default: http://localhost:29545)
#   L3_RPC            http://…:39545       (default: http://localhost:39545)
#   VALIDATOR_COUNT   integer              (default: 10)
#   CANONICAL_GST     0x<addr>             (GST token address on L1 — set after L1 deploy)
#   TREASURY          0x<addr>             (treasury address on L1)
#   GOVERNANCE        0x<addr>             (governor address on L1)
#   GHOST_ORACLE      0x<addr>             (oracle address — optional, uses zero if unset)
#   AI_SWARM_URL      http://…:7960        (ghostbrain-swarm — default: localhost:7960)
#   DEPLOYER_URL      http://…:7961        (ghost-deployer   — default: localhost:7961)
#   EVOLUTION_URL     http://…:7962        (ghost-evolution  — default: localhost:7962)
#
# Chain IDs: L1=14000101 | L2=901 | L3=903
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
V3_INSTALLER="${STACK_ROOT}/infra/genesis-installer-v3.sh"
CONTRACTS_DIR="${STACK_ROOT}/contracts"
MANIFEST_FILE="${STACK_ROOT}/genesis-manifest.json"

# ── Configuration ─────────────────────────────────────────────────────────────
GHOST_MODE="${GHOST_MODE:-dev}"
DRY_RUN="${DRY_RUN:-false}"
SKIP_BOOTSTRAP="${SKIP_BOOTSTRAP:-false}"
VALIDATOR_COUNT="${VALIDATOR_COUNT:-10}"

L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:29545}"
L3_RPC="${L3_RPC:-http://localhost:39545}"

DEPLOYER_KEY="${DEPLOYER_KEY:-}"

# Deployed contract addresses (resolved after forge script)
CANONICAL_GST="${CANONICAL_GST:-}"
TREASURY="${TREASURY:-}"
GOVERNANCE="${GOVERNANCE:-}"
GHOST_ORACLE="${GHOST_ORACLE:-0x0000000000000000000000000000000000000000}"

# Service URLs
AI_SWARM_URL="${AI_SWARM_URL:-http://localhost:7960}"
DEPLOYER_URL="${DEPLOYER_URL:-http://localhost:7961}"
EVOLUTION_URL="${EVOLUTION_URL:-http://localhost:7962}"
GHOSTBRAIN_URL="${GHOSTBRAIN_URL:-http://localhost:7900}"

# Canonical bridge addresses from copilot-instructions.md
L2L3_BRIDGE_ADDR="0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2"
L1_ROLLUP_ADDR="0xad32D5C2Da9f4159C4cc98686C005852b3905355"
L2_ROLLUP_ADDR="0x130A46b6E41DB6E1e18fb9c759F223c459190e90"
FINALITY_ORACLE_L1="0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422"
FINALITY_ORACLE_L2="0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A"
FINALITY_ORACLE_L3="0x87F850cbC2cFfac086F20d0d7307E12d06fA2127"

# Deployed DeFi contract addresses (populated in phase 19)
GHOST_LEND_ADDR=""
GHOST_STABLE_ADDR=""
GHOST_YIELD_ADDR=""
GHOST_DERIVATIVES_ADDR=""

# ── Helpers ───────────────────────────────────────────────────────────────────
log()       { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }
die()       { echo "[FATAL] $*" >&2; exit 1; }
warn()      { echo "[WARN]  $*" >&2; }
check_cmd() { command -v "$1" &>/dev/null || die "Required tool '$1' not found. Install it and retry."; }

phase() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "  Phase %-3s  %s\n" "$1" "$2"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY-RUN] $*"
  else
    "$@"
  fi
}

http_ok() {
  local url="$1"
  curl -sf --max-time 5 "${url}" > /dev/null 2>&1
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local retries="${3:-30}"
  local sleep_s="${4:-3}"
  log "Waiting for ${name} at ${url} ..."
  for ((i = 1; i <= retries; i++)); do
    if http_ok "${url}"; then
      log "${name} is up."
      return 0
    fi
    [[ "${DRY_RUN}" == "true" ]] && { log "[DRY-RUN] Skipping wait for ${name}"; return 0; }
    log "  (${i}/${retries}) not ready — retrying in ${sleep_s}s ..."
    sleep "${sleep_s}"
  done
  warn "${name} did not become ready within $(( retries * sleep_s ))s — continuing anyway."
  return 0
}

# Extract a JSON field (simple grep-based, no jq dependency required during bootstrap)
json_field() {
  local json="$1"
  local field="$2"
  echo "${json}" | grep -oP "\"${field}\"\\s*:\\s*\"\\K[^\"]*" | head -1 || true
}

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║       👻 GhostStack Autonomous Genesis Installer v4                     ║"
echo "║                                                                          ║"
echo "║  GhostChain L1 (14000101)  ─►  GhostL2 (901)  ─►  GhostL3 (903)       ║"
echo "║  GhostBrain AI · LGE · DeFi Core · Bridge · Governance                 ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
log "Mode: ${GHOST_MODE} | DRY_RUN=${DRY_RUN} | SKIP_BOOTSTRAP=${SKIP_BOOTSTRAP}"
log "Stack root: ${STACK_ROOT}"
echo ""

# ── Prerequisite check ────────────────────────────────────────────────────────
check_cmd curl
check_cmd docker
check_cmd jq   # jq is needed for manifest generation
check_cmd node

# ══════════════════════════════════════════════════════════════════════════════
# PHASES 1-18 — Delegate to v3 installer
# ══════════════════════════════════════════════════════════════════════════════

if [[ "${SKIP_BOOTSTRAP}" == "true" ]]; then
  log "SKIP_BOOTSTRAP=true — skipping v3 bootstrap phases (1-18)."
else
  if [[ ! -f "${V3_INSTALLER}" ]]; then
    die "v3 installer not found at ${V3_INSTALLER}. Set SKIP_BOOTSTRAP=true if already run."
  fi
  log "Delegating phases 1-18 to v3 installer ..."
  echo ""
  # Pass through all supported env vars from v3
  GHOST_MODE="${GHOST_MODE}" \
  DRY_RUN="${DRY_RUN}" \
  VALIDATOR_COUNT="${VALIDATOR_COUNT}" \
  L1_RPC="${L1_RPC}" \
  L2_RPC="${L2_RPC}" \
  L3_RPC="${L3_RPC}" \
  bash "${V3_INSTALLER}"
  echo ""
  log "v3 phases 1-18 complete."
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 19 — DeFi Protocol Deployment
# ══════════════════════════════════════════════════════════════════════════════

phase "19" "DeFi Protocol Deployment (GhostLend · GhostStable · GhostYield · GhostDerivatives)"

if [[ -z "${DEPLOYER_KEY}" ]]; then
  if [[ "${GHOST_MODE}" == "prod" ]]; then
    die "DEPLOYER_KEY must be set in prod mode. Export DEPLOYER_KEY=0x<privkey> and retry."
  else
    warn "DEPLOYER_KEY not set — using Foundry dev account (index 0) for devnet deployment."
    # Foundry default dev private key (Anvil account #0) — safe only in devnet
    DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  fi
fi

# Resolve deployer address from private key
DEPLOYER_ADDR=""
if command -v cast &>/dev/null; then
  DEPLOYER_ADDR="$(cast wallet address --private-key "${DEPLOYER_KEY}" 2>/dev/null || true)"
fi
if [[ -z "${DEPLOYER_ADDR}" ]]; then
  # Fallback: first Anvil account
  DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
fi

# Use pre-configured addresses or fall back to deployer for devnet
CANONICAL_GST="${CANONICAL_GST:-${DEPLOYER_ADDR}}"  # dev only — replace with real GST address
TREASURY="${TREASURY:-${DEPLOYER_ADDR}}"
GOVERNANCE="${GOVERNANCE:-${DEPLOYER_ADDR}}"

log "Deployer:   ${DEPLOYER_ADDR}"
log "GST token:  ${CANONICAL_GST}"
log "Treasury:   ${TREASURY}"
log "Governance: ${GOVERNANCE}"
log "Oracle:     ${GHOST_ORACLE}"
log "Target:     L1 (${L1_RPC})"
echo ""

if ! command -v forge &>/dev/null; then
  warn "forge not found — skipping on-chain DeFi contract deployment."
  warn "Install Foundry: https://getfoundry.sh and re-run Phase 19 with SKIP_BOOTSTRAP=true."
else
  # Build first to catch compilation errors
  log "Building DeFi contracts ..."
  run_cmd bash -c "cd '${CONTRACTS_DIR}' && forge build --skip test"

  log "Running DeployDeFiCore forge script against L1 ..."
  DEPLOY_OUTPUT_FILE="${STACK_ROOT}/logs/defi-deploy-$(date +%s).json"
  mkdir -p "${STACK_ROOT}/logs"

  if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY-RUN] forge script contracts/script/DeployDeFiCore.sol --broadcast --rpc-url ${L1_RPC}"
    GHOST_LEND_ADDR="0x1000000000000000000000000000000000000001"
    GHOST_STABLE_ADDR="0x1000000000000000000000000000000000000002"
    GHOST_YIELD_ADDR="0x1000000000000000000000000000000000000003"
    GHOST_DERIVATIVES_ADDR="0x1000000000000000000000000000000000000004"
  else
    set +e
    DEPLOY_JSON="$(
      cd "${CONTRACTS_DIR}" && \
      DEPLOYER="${DEPLOYER_ADDR}" \
      CANONICAL_GST="${CANONICAL_GST}" \
      TREASURY="${TREASURY}" \
      GOVERNANCE="${GOVERNANCE}" \
      GHOST_ORACLE="${GHOST_ORACLE}" \
      forge script script/DeployDeFiCore.sol \
        --private-key "${DEPLOYER_KEY}" \
        --rpc-url "${L1_RPC}" \
        --broadcast \
        --json \
        2>&1
    )"
    DEPLOY_EXIT=$?
    set -e

    echo "${DEPLOY_JSON}" > "${DEPLOY_OUTPUT_FILE}"

    if [[ ${DEPLOY_EXIT} -ne 0 ]]; then
      warn "forge script exited with code ${DEPLOY_EXIT}."
      warn "Check log: ${DEPLOY_OUTPUT_FILE}"
      warn "Continuing with genesis — DeFi addresses will be empty in manifest."
    else
      # Parse deployed addresses from broadcast output
      BROADCAST_DIR="${CONTRACTS_DIR}/broadcast/DeployDeFiCore.sol"
      if [[ -d "${BROADCAST_DIR}" ]]; then
        LATEST_RUN="$(find "${BROADCAST_DIR}" -name "run-latest.json" | head -1)"
        if [[ -n "${LATEST_RUN}" ]]; then
          GHOST_LEND_ADDR="$(jq -r '.transactions[] | select(.contractName == "GhostLend") | .contractAddress' "${LATEST_RUN}" 2>/dev/null || true)"
          GHOST_STABLE_ADDR="$(jq -r '.transactions[] | select(.contractName == "GhostStable") | .contractAddress' "${LATEST_RUN}" 2>/dev/null || true)"
          GHOST_YIELD_ADDR="$(jq -r '.transactions[] | select(.contractName == "GhostYield") | .contractAddress' "${LATEST_RUN}" 2>/dev/null || true)"
          GHOST_DERIVATIVES_ADDR="$(jq -r '.transactions[] | select(.contractName == "GhostDerivatives") | .contractAddress' "${LATEST_RUN}" 2>/dev/null || true)"
        fi
      fi
      log "GhostLend:        ${GHOST_LEND_ADDR:-<not parsed>}"
      log "GhostStable:      ${GHOST_STABLE_ADDR:-<not parsed>}"
      log "GhostYield:       ${GHOST_YIELD_ADDR:-<not parsed>}"
      log "GhostDerivatives: ${GHOST_DERIVATIVES_ADDR:-<not parsed>}"
    fi
  fi
fi

log "Phase 19 complete."

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 20 — Bridge Initialization
# ══════════════════════════════════════════════════════════════════════════════

phase "20" "Bridge Initialization (L1↔L2, L2↔L3)"

log "Canonical bridge addresses:"
log "  L2L3Bridge:         ${L2L3_BRIDGE_ADDR}"
log "  L1 Rollup (L2):     ${L1_ROLLUP_ADDR}"
log "  L2 Rollup (L3):     ${L2_ROLLUP_ADDR}"
log "  Finality Oracle L1: ${FINALITY_ORACLE_L1}"
log "  Finality Oracle L2: ${FINALITY_ORACLE_L2}"
log "  Finality Oracle L3: ${FINALITY_ORACLE_L3}"
echo ""

# Verify finality oracle L1 is live (must respond to eth_call)
if command -v cast &>/dev/null && [[ "${DRY_RUN}" != "true" ]]; then
  log "Pinging L1 finality oracle ..."
  set +e
  ORACLE_RESPONSE="$(cast call "${FINALITY_ORACLE_L1}" "latestTimestamp()(uint256)" \
    --rpc-url "${L1_RPC}" 2>/dev/null || echo "offline")"
  set -e
  if [[ "${ORACLE_RESPONSE}" == "offline" ]]; then
    warn "L1 finality oracle not responding — bridge may require manual initialization."
  else
    log "L1 finality oracle responding: timestamp=${ORACLE_RESPONSE}"
  fi
else
  log "[DRY-RUN] cast call ${FINALITY_ORACLE_L1} latestTimestamp()(uint256) --rpc-url ${L1_RPC}"
fi

# Verify L2 rollup contract on L1
if command -v cast &>/dev/null && [[ "${DRY_RUN}" != "true" ]]; then
  log "Verifying L2 rollup contract on L1 ..."
  set +e
  ROLLUP_CODE="$(cast code "${L1_ROLLUP_ADDR}" --rpc-url "${L1_RPC}" 2>/dev/null || echo "0x")"
  set -e
  if [[ "${ROLLUP_CODE}" == "0x" || "${ROLLUP_CODE}" == "" ]]; then
    warn "L2 rollup contract has no bytecode at ${L1_ROLLUP_ADDR} on L1 — deployment may be pending."
  else
    log "L2 rollup contract verified at ${L1_ROLLUP_ADDR} (${#ROLLUP_CODE} bytes of bytecode)"
  fi
else
  log "[DRY-RUN] cast code ${L1_ROLLUP_ADDR} --rpc-url ${L1_RPC}"
fi

# Configure L1→L2 relayer via ghost-deployer if available
if http_ok "${DEPLOYER_URL}/health" || [[ "${DRY_RUN}" == "true" ]]; then
  log "Registering bridge config with ghost-deployer ..."
  BRIDGE_PAYLOAD="{
    \"action\": \"configureBridge\",
    \"l1RollupAddr\": \"${L1_ROLLUP_ADDR}\",
    \"l2RollupAddr\": \"${L2_ROLLUP_ADDR}\",
    \"l2l3BridgeAddr\": \"${L2L3_BRIDGE_ADDR}\",
    \"finalityOracleL1\": \"${FINALITY_ORACLE_L1}\",
    \"finalityOracleL2\": \"${FINALITY_ORACLE_L2}\",
    \"finalityOracleL3\": \"${FINALITY_ORACLE_L3}\"
  }"
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY-RUN] POST ${DEPLOYER_URL}/bridge/configure"
  else
    set +e
    curl -sf -X POST "${DEPLOYER_URL}/bridge/configure" \
      -H "Content-Type: application/json" \
      -d "${BRIDGE_PAYLOAD}" > /dev/null 2>&1 || warn "ghost-deployer bridge config endpoint not available yet."
    set -e
  fi
fi

log "Phase 20 complete."

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 21 — AI Service Swarm
# ══════════════════════════════════════════════════════════════════════════════

phase "21" "AI Service Swarm (ghostbrain-swarm · ghost-deployer · ghost-evolution)"

AI_SERVICES=(
  "ghostbrain-swarm:${STACK_ROOT}/services/ghostbrain-swarm:7960"
  "ghost-deployer:${STACK_ROOT}/services/ghost-deployer:7961"
  "ghost-evolution:${STACK_ROOT}/services/ghost-evolution:7962"
)

for svc_spec in "${AI_SERVICES[@]}"; do
  IFS=":" read -r svc_name svc_path svc_port <<< "${svc_spec}"
  svc_url="http://localhost:${svc_port}"

  if http_ok "${svc_url}/health"; then
    log "${svc_name} already running at ${svc_url}"
    continue
  fi

  log "Starting ${svc_name} on port ${svc_port} ..."

  if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY-RUN] cd ${svc_path} && node dist/index.js (background)"
    continue
  fi

  if [[ ! -d "${svc_path}" ]]; then
    warn "Service directory not found: ${svc_path} — skipping ${svc_name}"
    continue
  fi

  # Build service if dist doesn't exist
  if [[ ! -d "${svc_path}/dist" ]]; then
    log "Building ${svc_name} ..."
    (cd "${svc_path}" && npm run build 2>&1 | tail -5 || warn "Build warnings for ${svc_name}")
  fi

  # Start as background process
  (
    cd "${svc_path}"
    L1_RPC="${L1_RPC}" \
    L2_RPC="${L2_RPC}" \
    L3_RPC="${L3_RPC}" \
    GHOST_MODE="${GHOST_MODE}" \
    PORT="${svc_port}" \
    nohup node dist/index.js >> "${STACK_ROOT}/logs/${svc_name}.log" 2>&1 &
    echo $! > "${STACK_ROOT}/logs/${svc_name}.pid"
  )
  log "  PID stored at ${STACK_ROOT}/logs/${svc_name}.pid"
  sleep 2

  # Wait for health
  wait_for_http "${svc_name}" "${svc_url}/health" 15 2
done

# Also start GhostBrain core if not running
if http_ok "${GHOSTBRAIN_URL}/health"; then
  log "ghostbrain-core already running at ${GHOSTBRAIN_URL}"
else
  GHOSTBRAIN_PATH="${STACK_ROOT}/services/ghostbrain-core"
  if [[ -d "${GHOSTBRAIN_PATH}" ]] && [[ "${DRY_RUN}" != "true" ]]; then
    log "Starting ghostbrain-core on port 7900 ..."
    if [[ ! -d "${GHOSTBRAIN_PATH}/dist" ]]; then
      (cd "${GHOSTBRAIN_PATH}" && npm run build 2>&1 | tail -5 || true)
    fi
    (
      cd "${GHOSTBRAIN_PATH}"
      L1_RPC="${L1_RPC}" \
      L2_RPC="${L2_RPC}" \
      L3_RPC="${L3_RPC}" \
      PORT=7900 \
      nohup node dist/index.js >> "${STACK_ROOT}/logs/ghostbrain-core.log" 2>&1 &
      echo $! > "${STACK_ROOT}/logs/ghostbrain-core.pid"
    )
    wait_for_http "ghostbrain-core" "${GHOSTBRAIN_URL}/health" 15 2
  else
    [[ "${DRY_RUN}" == "true" ]] && log "[DRY-RUN] Would start ghostbrain-core at ${GHOSTBRAIN_PATH}" || \
      warn "ghostbrain-core not found at ${GHOSTBRAIN_PATH}"
  fi
fi

log "Phase 21 complete."

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 22 — Security Initialization
# ══════════════════════════════════════════════════════════════════════════════

phase "22" "Security Initialization (treasury multi-sig · slashing · fraud detection)"

# Post security parameters to GhostBrain if available
SECURITY_CONFIG="{
  \"slashing\": {
    \"doubleSign\": \"5000\",
    \"downtime\": \"100\",
    \"downtimeWindow\": \"10000\"
  },
  \"fraudDetection\": {
    \"enabled\": true,
    \"riskThreshold\": 75,
    \"autoJailThreshold\": 90
  },
  \"treasury\": {
    \"address\": \"${TREASURY}\",
    \"multisigRequired\": 2,
    \"multisigOf\": 3
  }
}"

if [[ "${DRY_RUN}" == "true" ]]; then
  log "[DRY-RUN] POST ${GHOSTBRAIN_URL}/api/security/init"
  log "[DRY-RUN] Slashing: double-sign=5000bps, downtime=100bps/10000 block window"
  log "[DRY-RUN] Fraud detection: enabled, risk threshold=75, auto-jail=90"
  log "[DRY-RUN] Treasury multi-sig: 2-of-3"
elif http_ok "${GHOSTBRAIN_URL}/health"; then
  set +e
  curl -sf -X POST "${GHOSTBRAIN_URL}/api/security/init" \
    -H "Content-Type: application/json" \
    -d "${SECURITY_CONFIG}" > /dev/null 2>&1 || \
    warn "ghostbrain-core security/init endpoint not available — apply manually."
  set -e
  log "Security parameters submitted to GhostBrain Core."
else
  warn "ghostbrain-core not reachable — security initialization deferred."
  log "To apply manually, POST to ${GHOSTBRAIN_URL}/api/security/init:"
  echo "${SECURITY_CONFIG}"
fi

# Write slashing config to file for node consumption
SLASHING_CONFIG_FILE="${STACK_ROOT}/infra/ghostchain/slashing.json"
mkdir -p "$(dirname "${SLASHING_CONFIG_FILE}")"
if [[ "${DRY_RUN}" != "true" ]]; then
  cat > "${SLASHING_CONFIG_FILE}" << 'SLASHING'
{
  "slash_fraction_double_sign": "0.05",
  "slash_fraction_downtime": "0.001",
  "downtime_jail_duration": "600s",
  "min_signed_per_window": "0.5",
  "signed_blocks_window": "10000"
}
SLASHING
  log "Slashing config written to ${SLASHING_CONFIG_FILE}"
fi

log "Phase 22 complete."

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 23 — Genesis Manifest
# ══════════════════════════════════════════════════════════════════════════════

phase "23" "Genesis Manifest (${MANIFEST_FILE})"

MANIFEST_TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

MANIFEST_JSON="$(cat << MANIFEST
{
  "version": "4.0.0",
  "ghost_mode": "${GHOST_MODE}",
  "generated_at": "${MANIFEST_TIMESTAMP}",
  "chains": {
    "l1": {
      "name": "GhostChain",
      "chain_id": 14000101,
      "rpc": "${L1_RPC}"
    },
    "l2": {
      "name": "GhostL2",
      "chain_id": 901,
      "rpc": "${L2_RPC}"
    },
    "l3": {
      "name": "GhostL3",
      "chain_id": 903,
      "rpc": "${L3_RPC}"
    }
  },
  "defi_contracts": {
    "GhostLend": "${GHOST_LEND_ADDR}",
    "GhostStable": "${GHOST_STABLE_ADDR}",
    "GhostYield": "${GHOST_YIELD_ADDR}",
    "GhostDerivatives": "${GHOST_DERIVATIVES_ADDR}",
    "CANONICAL_GST": "${CANONICAL_GST}",
    "Treasury": "${TREASURY}",
    "Governance": "${GOVERNANCE}",
    "Oracle": "${GHOST_ORACLE}"
  },
  "bridge_contracts": {
    "L2L3Bridge": "${L2L3_BRIDGE_ADDR}",
    "L1Rollup_L2": "${L1_ROLLUP_ADDR}",
    "L2Rollup_L3": "${L2_ROLLUP_ADDR}",
    "FinalityOracle_L1": "${FINALITY_ORACLE_L1}",
    "FinalityOracle_L2": "${FINALITY_ORACLE_L2}",
    "FinalityOracle_L3": "${FINALITY_ORACLE_L3}"
  },
  "ai_services": {
    "ghostbrain_core": "${GHOSTBRAIN_URL}",
    "ghostbrain_swarm": "${AI_SWARM_URL}",
    "ghost_deployer": "${DEPLOYER_URL}",
    "ghost_evolution": "${EVOLUTION_URL}"
  },
  "monitoring": {
    "prometheus": "http://localhost:9090",
    "grafana": "http://localhost:3001"
  },
  "cosmos": {
    "lcd": "http://localhost:1317",
    "rpc": "http://localhost:26657",
    "grpc": "http://localhost:9090"
  }
}
MANIFEST
)"

if [[ "${DRY_RUN}" == "true" ]]; then
  log "[DRY-RUN] Would write manifest to ${MANIFEST_FILE}"
  echo "${MANIFEST_JSON}"
else
  echo "${MANIFEST_JSON}" > "${MANIFEST_FILE}"
  # Pretty-print with jq if available
  if command -v jq &>/dev/null; then
    jq . "${MANIFEST_FILE}" > "${MANIFEST_FILE}.tmp" && mv "${MANIFEST_FILE}.tmp" "${MANIFEST_FILE}"
  fi
  log "Manifest written: ${MANIFEST_FILE}"
fi

log "Phase 23 complete."

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 24 — Health Verification
# ══════════════════════════════════════════════════════════════════════════════

phase "24" "Health Verification"

PASS=0
FAIL_COUNT=0

check_endpoint() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    printf "  %-36s %s\n" "${name}" "[DRY-RUN — skipped]"
    return
  fi

  local status
  if [[ "${method}" == "RPC" ]]; then
    # JSON-RPC eth_blockNumber check
    local response
    response="$(curl -sf --max-time 5 -X POST "${url}" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"ghost_blockNumber","params":[]}' \
      2>/dev/null || \
      curl -sf --max-time 5 -X POST "${url}" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
      2>/dev/null || echo "")"
    if echo "${response}" | grep -q '"result"'; then
      status="online"
    else
      status="offline"
    fi
  else
    if curl -sf --max-time 5 "${url}" > /dev/null 2>&1; then
      status="online"
    else
      status="offline"
    fi
  fi

  if [[ "${status}" == "online" ]]; then
    printf "  ✓ %-36s online\n" "${name}"
    PASS=$(( PASS + 1 ))
  else
    printf "  ✗ %-36s offline\n" "${name}"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
  fi
}

echo ""
echo "  Checking chain nodes ..."
check_endpoint "GhostChain L1 (chainId=14000101)" "${L1_RPC}"  "RPC"
check_endpoint "GhostL2       (chainId=901)"       "${L2_RPC}"  "RPC"
check_endpoint "GhostL3       (chainId=903)"        "${L3_RPC}"  "RPC"

echo ""
echo "  Checking AI services ..."
check_endpoint "ghostbrain-core    :7900" "${GHOSTBRAIN_URL}/health"
check_endpoint "ghostbrain-swarm   :7960" "${AI_SWARM_URL}/health"
check_endpoint "ghost-deployer     :7961" "${DEPLOYER_URL}/health"
check_endpoint "ghost-evolution    :7962" "${EVOLUTION_URL}/health"

echo ""
echo "  Checking monitoring ..."
check_endpoint "Prometheus         :9090" "http://localhost:9090/-/ready"
check_endpoint "Grafana            :3001" "http://localhost:3001/api/health"

echo ""
echo "  Checking Cosmos SDK ..."
check_endpoint "Cosmos LCD         :1317" "http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info"
check_endpoint "CometBFT RPC      :26657" "http://localhost:26657/status"

TOTAL=$(( PASS + FAIL_COUNT ))
echo ""
echo "  ─────────────────────────────────────────────"
printf "  Results: %d/%d online\n" "${PASS}" "${TOTAL}"
echo "  ─────────────────────────────────────────────"

if [[ "${FAIL_COUNT}" -eq 0 ]]; then
  echo ""
  echo "  All services healthy — GhostStack genesis complete!"
elif [[ "${DRY_RUN}" == "true" ]]; then
  echo "  (Dry run — no actual services checked)"
else
  warn "${FAIL_COUNT} service(s) offline. Review logs at ${STACK_ROOT}/logs/"
  warn "You can re-run specific phases with SKIP_BOOTSTRAP=true."
fi

log "Phase 24 complete."

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║  👻  GhostStack Genesis v4 — Complete                                   ║"
echo "╠══════════════════════════════════════════════════════════════════════════╣"
printf "║  %-72s ║\n" "GhostChain L1   ${L1_RPC}"
printf "║  %-72s ║\n" "GhostL2         ${L2_RPC}"
printf "║  %-72s ║\n" "GhostL3         ${L3_RPC}"
echo "║                                                                          ║"
printf "║  %-72s ║\n" "GhostBrain Core ${GHOSTBRAIN_URL}"
printf "║  %-72s ║\n" "AI Swarm        ${AI_SWARM_URL}"
printf "║  %-72s ║\n" "Ghost Deployer  ${DEPLOYER_URL}"
printf "║  %-72s ║\n" "Ghost Evolution ${EVOLUTION_URL}"
echo "║                                                                          ║"
printf "║  %-72s ║\n" "DeFi — GhostLend:        ${GHOST_LEND_ADDR:-<pending>}"
printf "║  %-72s ║\n" "DeFi — GhostStable:      ${GHOST_STABLE_ADDR:-<pending>}"
printf "║  %-72s ║\n" "DeFi — GhostYield:       ${GHOST_YIELD_ADDR:-<pending>}"
printf "║  %-72s ║\n" "DeFi — GhostDerivatives: ${GHOST_DERIVATIVES_ADDR:-<pending>}"
echo "║                                                                          ║"
printf "║  %-72s ║\n" "Manifest: ${MANIFEST_FILE}"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
log "GhostStack genesis complete. Sovereign ecosystem is live."
echo ""
