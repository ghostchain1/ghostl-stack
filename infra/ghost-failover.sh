#!/usr/bin/env bash
# GhostStack Global Failover Monitor
# Monitors regional chain endpoints and logs failover recommendations.
# Traffic-shifting decisions require human ratification — no automatic DNS changes.

set -euo pipefail

STACK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${STACK_ROOT}/logs"
LOG="${LOG_DIR}/failover.log"
mkdir -p "${LOG_DIR}"

REGIONS="${FAILOVER_REGIONS:-}"
INTERVAL="${FAILOVER_INTERVAL:-60}"
L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:29545}"
L3_RPC="${L3_RPC:-http://localhost:39545}"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [FAILOVER] $*" | tee -a "${LOG}"; }

check_region() {
  local label="$1" url="$2"
  local result
  result="$(curl -sS --max-time 5 -X POST "${url}" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    2>/dev/null || echo "")"
  if [[ -n "${result}" ]]; then
    log "HEALTHY  ${label}"
    return 0
  else
    log "DEGRADED ${label} at ${url} — RECOMMENDATION: shift L1 traffic to standby region"
    return 1
  fi
}

log "Failover monitor started (interval=${INTERVAL}s)"

while true; do
  if [[ -n "${REGIONS}" ]]; then
    for ENTRY in ${REGIONS}; do
      REGION_LABEL="${ENTRY%%=*}"
      REGION_URL="${ENTRY##*=}"
      check_region "${REGION_LABEL}" "${REGION_URL}" || true
    done
  else
    check_region "local-L1 (14000101)" "${L1_RPC}" || true
    check_region "local-L2 (901)"      "${L2_RPC}" || true
    check_region "local-L3 (903)"      "${L3_RPC}" || true
  fi
  sleep "${INTERVAL}"
done
