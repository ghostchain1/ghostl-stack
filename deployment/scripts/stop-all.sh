#!/usr/bin/env bash
# ============================================================
# GhostStack MDB — stop-all.sh
# Gracefully stops all stacks in reverse startup order
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MDB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STACK_ROOT="$(cd "${MDB_DIR}/.." && pwd)"
DOCKER_DIR="${STACK_ROOT}/infrastructure/docker"

if [[ -f "${MDB_DIR}/configs/ghoststack.env" ]]; then
  set -a; source "${MDB_DIR}/configs/ghoststack.env"; set +a
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[✓]${RESET} $*"; }
info() { echo -e "${CYAN}[→]${RESET} $*"; }

REMOVE_VOLUMES=false
if [[ "${1:-}" == "--volumes" || "${1:-}" == "-v" ]]; then
  REMOVE_VOLUMES=true
  echo -e "${RED}WARNING: --volumes flag set — all data volumes will be removed!${RESET}"
  read -r -p "Type 'yes' to confirm: " confirm
  [[ "${confirm}" == "yes" ]] || { echo "Aborted."; exit 1; }
fi

compose_down() {
  local file="$1"
  local label="$2"
  info "Stopping ${label}…"
  local flags="--remove-orphans"
  [[ "${REMOVE_VOLUMES}" == true ]] && flags="${flags} -v"
  docker compose -f "${file}" down ${flags} 2>/dev/null || true
  ok "${label} stopped"
}

echo
echo -e "${BOLD}${CYAN}── GhostStack — Stopping All Stacks ───────────────────${RESET}"

# Reverse startup order
compose_down "${DOCKER_DIR}/ai-marketing-stack.yml" "AI Engine Cluster"
compose_down "${DOCKER_DIR}/monitoring-stack.yml"   "Monitoring"
compose_down "${DOCKER_DIR}/validator-stack.yml"    "Chain Validators"
compose_down "${DOCKER_DIR}/ghostbrain-stack.yml"   "GhostBrain Core"
compose_down "${DOCKER_DIR}/data-mesh-stack.yml"    "Data Mesh"

# Stop background web process if running
if pgrep -f "next.*start" &>/dev/null; then
  info "Stopping Control Center (Next.js)…"
  pkill -f "next.*start" || true
  ok "Control Center stopped"
fi

echo
ok "All GhostStack services stopped."
