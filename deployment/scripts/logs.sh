#!/usr/bin/env bash
# ============================================================
# GhostStack MDB — logs.sh
# Tail logs from one or all stacks
#
# Usage:
#   ./logs.sh                  — tail all stacks (50 lines each)
#   ./logs.sh ghostbrain       — tail ghostbrain-stack only
#   ./logs.sh ai               — tail ai-engine cluster only
#   ./logs.sh monitoring       — tail monitoring stack only
#   ./logs.sh validators       — tail validator stack only
#   ./logs.sh data-mesh        — tail data-mesh stack only
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MDB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STACK_ROOT="$(cd "${MDB_DIR}/.." && pwd)"
DOCKER_DIR="${STACK_ROOT}/infrastructure/docker"

FILTER="${1:-all}"
TAIL="${GHOSTSTACK_LOG_TAIL:-50}"

CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
section() { echo -e "\n${BOLD}${CYAN}── $* ──────────────────────────────────────────${RESET}"; }

logstack() {
  local file="$1"
  local label="$2"
  docker compose -f "${file}" logs --tail="${TAIL}" -f 2>/dev/null &
}

case "${FILTER}" in
  ghostbrain)
    section "GhostBrain Core Logs"
    docker compose -f "${DOCKER_DIR}/ghostbrain-stack.yml" logs --tail="${TAIL}" -f
    ;;
  ai|ai-engines)
    section "AI Engine Cluster Logs"
    docker compose -f "${DOCKER_DIR}/ai-marketing-stack.yml" logs --tail="${TAIL}" -f
    ;;
  monitoring)
    section "Monitoring Logs"
    docker compose -f "${DOCKER_DIR}/monitoring-stack.yml" logs --tail="${TAIL}" -f
    ;;
  validators)
    section "Validator Logs"
    docker compose -f "${DOCKER_DIR}/validator-stack.yml" logs --tail="${TAIL}" -f
    ;;
  data-mesh)
    section "Data Mesh Logs"
    docker compose -f "${DOCKER_DIR}/data-mesh-stack.yml" logs --tail="${TAIL}" -f
    ;;
  all|*)
    section "GhostStack — All Stacks (last ${TAIL} lines each)"
    echo "Press Ctrl-C to stop."
    logstack "${DOCKER_DIR}/data-mesh-stack.yml"    "data-mesh"
    logstack "${DOCKER_DIR}/ghostbrain-stack.yml"   "ghostbrain"
    logstack "${DOCKER_DIR}/validator-stack.yml"    "validators"
    logstack "${DOCKER_DIR}/monitoring-stack.yml"   "monitoring"
    logstack "${DOCKER_DIR}/ai-marketing-stack.yml" "ai-engines"
    wait
    ;;
esac
