#!/usr/bin/env bash
# deploy-validator.sh — Deploy a GhostChain validator node via Docker
# Usage: ./deploy-validator.sh <region> [--validator-id <id>] [--rpc <url>]
#
# Integrates with GhostBrain Validator Fabric AI (GVF, port 9700)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIGS_DIR="${REPO_ROOT}/validators/configs"
KEYS_DIR="${REPO_ROOT}/validators/keys"
GVF_URL="${GHOSTBRAIN_GVF_URL:-http://localhost:9700}"

# ── Colors ───────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[validator]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ── Argument parsing ─────────────────────────────────────────────
REGION="${1:-unknown}"
VALIDATOR_ID=""
RPC_URL="${GHOSTCHAIN_L1_RPC:-http://localhost:8545}"
CHAIN_ID="${GHOSTCHAIN_L1_CHAIN_ID:-1337}"

shift 1 || true
while [[ $# -gt 0 ]]; do
    case "$1" in
        --validator-id) VALIDATOR_ID="$2"; shift 2 ;;
        --rpc)          RPC_URL="$2";       shift 2 ;;
        --chain-id)     CHAIN_ID="$2";      shift 2 ;;
        *)              die "Unknown argument: $1" ;;
    esac
done

if [[ -z "$VALIDATOR_ID" ]]; then
    VALIDATOR_ID="validator-${REGION}-$(date +%s | tail -c 6)"
fi

log "Deploying validator '${VALIDATOR_ID}' in region '${REGION}'"
log "RPC: ${RPC_URL} | Chain ID: ${CHAIN_ID}"

# ── Check dependencies ───────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker not found"

# ── Notify GVF AI (non-blocking) ─────────────────────────────────
notify_gvf() {
    local event="$1"; local payload="$2"
    curl -sf -X POST "${GVF_URL}/validators/events" \
        -H "Content-Type: application/json" \
        -d "{\"event\":\"${event}\",\"validatorId\":\"${VALIDATOR_ID}\",\"region\":\"${REGION}\",${payload}}" \
        >/dev/null 2>&1 || warn "GVF notification failed (non-critical)"
}

notify_gvf "DEPLOY_STARTED" "\"rpc\":\"${RPC_URL}\",\"chainId\":${CHAIN_ID}"

# ── Create per-validator data directory ──────────────────────────
DATA_DIR="${REPO_ROOT}/data/validators/${VALIDATOR_ID}"
mkdir -p "${DATA_DIR}"

# ── Generate key if not present ──────────────────────────────────
KEY_FILE="${KEYS_DIR}/${VALIDATOR_ID}.key"
if [[ ! -f "${KEY_FILE}" ]]; then
    log "Generating new validator key..."
    docker run --rm \
        -v "${KEYS_DIR}:/keys" \
        ethereum/client-go:stable \
        account new \
        --datadir /keys \
        --password /keys/password.txt \
        2>/dev/null | grep "Public address" | awk '{print $NF}' > "${KEY_FILE}"
    ok "Key generated → ${KEY_FILE}"
else
    log "Using existing key: ${KEY_FILE}"
fi

VALIDATOR_ADDRESS=$(cat "${KEY_FILE}" | tr -d '\n')

# ── Launch validator container ────────────────────────────────────
log "Starting validator container '${VALIDATOR_ID}'..."

docker run -d \
    --name "${VALIDATOR_ID}" \
    --restart always \
    -v "${DATA_DIR}:/data" \
    -v "${KEYS_DIR}:/keys:ro" \
    -e "VALIDATOR_ADDRESS=${VALIDATOR_ADDRESS}" \
    --network ghostbrain-net \
    --label "ghoststack.role=validator" \
    --label "ghoststack.region=${REGION}" \
    --label "ghoststack.validator-id=${VALIDATOR_ID}" \
    ethereum/client-go:stable \
        --datadir /data \
        --networkid "${CHAIN_ID}" \
        --http \
        --http.addr 0.0.0.0 \
        --http.api eth,net,web3,personal,miner \
        --mine \
        --miner.gasprice 0 \
        --unlock "${VALIDATOR_ADDRESS}" \
        --password /keys/password.txt \
        --allow-insecure-unlock 2>&1 | true

ok "Validator container started: ${VALIDATOR_ID}"

# ── Wait for validator to come online ───────────────────────────
log "Waiting for validator RPC..."
MAX_WAIT=60; WAITED=0
while [[ $WAITED -lt $MAX_WAIT ]]; do
    if docker exec "${VALIDATOR_ID}" wget -qO- http://localhost:8545 >/dev/null 2>&1; then
        ok "Validator RPC online"
        break
    fi
    sleep 2; ((WAITED+=2))
done

if [[ $WAITED -ge $MAX_WAIT ]]; then
    warn "Validator RPC did not respond within ${MAX_WAIT}s — check: docker logs ${VALIDATOR_ID}"
fi

# ── Notify GVF of successful deployment ──────────────────────────
notify_gvf "DEPLOY_COMPLETED" "\"address\":\"${VALIDATOR_ADDRESS}\",\"dataDir\":\"${DATA_DIR}\""

echo ""
ok "Validator '${VALIDATOR_ID}' deployed"
echo "  Address:    ${VALIDATOR_ADDRESS}"
echo "  Region:     ${REGION}"
echo "  Data dir:   ${DATA_DIR}"
echo "  Logs:       docker logs -f ${VALIDATOR_ID}"
