#!/usr/bin/env bash
# ============================================================
# GhostStack MDB — status.sh
# Polls every service health endpoint and prints a status table
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MDB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${MDB_DIR}/configs/ghoststack.env" ]]; then
  set -a; source "${MDB_DIR}/configs/ghoststack.env"; set +a
fi

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
TICK="${GREEN}✓${RESET}"; CROSS="${RED}✗${RESET}"; WARN="${YELLOW}?${RESET}"

check() {
  local label="$1"
  local url="$2"
  local status
  local http_code
  http_code=$(curl -o /dev/null -s --max-time 3 -w "%{http_code}" "${url}" 2>/dev/null || echo "000")
  if [[ "${http_code}" =~ ^2 ]]; then
    printf "  ${TICK}  %-42s ${GREEN}%-4s${RESET}  %s\n" "${label}" "UP" "${url}"
  elif [[ "${http_code}" == "000" ]]; then
    printf "  ${CROSS}  %-42s ${RED}%-4s${RESET}  %s\n" "${label}" "DOWN" "${url}"
  else
    printf "  ${WARN}  %-42s ${YELLOW}%-4s${RESET}  %s\n" "${label}" "${http_code}" "${url}"
  fi
}

echo
echo -e "${BOLD}${CYAN}  GhostStack Status Report$(date '+  (%Y-%m-%d %H:%M:%S)')${RESET}"
echo "  ────────────────────────────────────────────────────────────────"

echo -e "\n  ${BOLD}Data Mesh${RESET}"
# TCP checks for Redis / Postgres / Elasticsearch
for svc_port in "Redis:${REDIS_PORT:-6379}" "Postgres:${POSTGRES_PORT:-5432}" "Elasticsearch:${ELASTICSEARCH_PORT:-9200}"; do
  label="${svc_port%%:*}"; port="${svc_port##*:}"
  if (echo >/dev/tcp/localhost/"${port}") 2>/dev/null; then
    printf "  ${TICK}  %-42s ${GREEN}%-4s${RESET}  tcp://localhost:%s\n" "${label}" "UP" "${port}"
  else
    printf "  ${CROSS}  %-42s ${RED}%-4s${RESET}  tcp://localhost:%s\n" "${label}" "DOWN" "${port}"
  fi
done

echo -e "\n  ${BOLD}GhostBrain Core${RESET}"
check "GhostBrain Swarm"          "http://localhost:${GHOSTBRAIN_SWARM_PORT:-9000}/health"
check "GhostBrain Kernel"         "http://localhost:${GHOSTBRAIN_KERNEL_PORT:-9300}/health"
check "GhostBrain Control Plane"  "http://localhost:${GHOSTBRAIN_CP_PORT:-9500}/health"
check "GhostBrain Validator Fab." "http://localhost:${GHOSTBRAIN_VF_PORT:-9700}/health"
check "GhostBrain Economy Engine" "http://localhost:${GHOSTBRAIN_EE_PORT:-9800}/health"
check "GhostBrain Data Mesh"      "http://localhost:${GHOSTBRAIN_GDM_PORT:-9900}/health"

echo -e "\n  ${BOLD}Chain Validators${RESET}"
check "Validator RPC (geth)"      "http://localhost:8545"

echo -e "\n  ${BOLD}Monitoring${RESET}"
check "Prometheus"  "http://localhost:${PROMETHEUS_PORT:-9090}/-/healthy"
check "Grafana"     "http://localhost:${GRAFANA_PORT:-3001}/api/health"

echo -e "\n  ${BOLD}AI Engine Cluster${RESET}"
check "AIMS  — AI Marketing (9970)"        "http://localhost:${AIMS_PORT:-9970}/health"
check "VGE   — AI Growth (9971)"           "http://localhost:${VGE_PORT:-9971}/health"
check "AAE   — AI Adoption (9972)"         "http://localhost:${AAE_PORT:-9972}/health"
check "GEE   — AI Expansion (9973)"        "http://localhost:${GEE_PORT:-9973}/health"
check "AEE   — AI Economy (9974)"          "http://localhost:${AEE_PORT:-9974}/health"
check "AIE   — AI Infrastructure (9975)"   "http://localhost:${AIE_PORT:-9975}/health"
check "ASE   — AI Security (9976)"         "http://localhost:${ASE_PORT:-9976}/health"
check "GIE   — AI Intelligence (9977)"     "http://localhost:${GIE_PORT:-9977}/health"
check "AGE   — AI Governance (9978)"       "http://localhost:${AGE_PORT:-9978}/health"
check "GIEX  — AI Interchain (9979)"       "http://localhost:${GIEX_PORT:-9979}/health"
check "GAAN  — AI Agents (9980)"           "http://localhost:${GAAN_PORT:-9980}/health"
check "ADE   — AI Development (9982)"      "http://localhost:${ADE_PORT:-9982}/health"
check "SEE   — AI Evolution (9983)"        "http://localhost:${SEE_PORT:-9983}/health"
check "PNE   — AI Planetary (9984)"        "http://localhost:${PNE_PORT:-9984}/health"
check "INE   — AI Interplanetary (9985)"   "http://localhost:${INE_PORT:-9985}/health"

echo -e "\n  ${BOLD}Control Center${RESET}"
check "GhostStack Web (Next.js)"  "http://localhost:${CONTROL_CENTER_PORT:-3000}"

echo
