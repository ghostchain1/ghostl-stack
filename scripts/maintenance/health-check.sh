#!/usr/bin/env bash
# health-check.sh — GhostStack global health check
# Polls all GhostBrain services + validators + monitoring
# Called by: make health, systemd timers, CI pipelines

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}●${NC} $*"; }
warn() { echo -e "  ${YELLOW}●${NC} $*"; }
fail() { echo -e "  ${RED}●${NC} $*"; ((FAILURES++)) || true; }

FAILURES=0

check_http() {
    local name="$1" url="$2" timeout="${3:-5}"
    local status
    status=$(curl -sf --max-time "$timeout" -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [[ "$status" == "200" ]]; then
        ok "${name} (HTTP ${status})"
    elif [[ "$status" == "000" ]]; then
        fail "${name} — unreachable"
    else
        warn "${name} (HTTP ${status})"
    fi
}

check_container() {
    local name="$1"
    local state
    state=$(docker inspect --format='{{.State.Status}}' "$name" 2>/dev/null || echo "missing")
    case "$state" in
        running) ok "${name} (${state})" ;;
        missing) fail "${name} — not found" ;;
        *)       warn "${name} (${state})" ;;
    esac
}

echo -e "\n${BOLD}━━━ GhostStack Health Check ━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "    $(date '+%Y-%m-%d %H:%M:%S UTC')\n"

# ── GhostBrain AI Services ───────────────────────────────────────
echo -e "${CYAN}GhostBrain AI${NC}"
check_http "Control Plane (SCP)"     "${GHOSTBRAIN_SCP_URL:-http://localhost:9500}/health"
check_http "Swarm"                   "http://localhost:9000/health"
check_http "Kernel"                  "http://localhost:9300/health"
check_http "Data Mesh (GDM)"         "http://localhost:9900/health"
check_http "Economy Engine (AEE)"    "http://localhost:9800/health"
check_http "Validator Fabric (GVF)"  "http://localhost:9700/health"
check_http "Multichain"              "http://localhost:9350/health"
check_http "Interchain"              "http://localhost:9450/health"
check_http "Governance"              "http://localhost:9550/health"
check_http "Research"                "http://localhost:9600/health"
check_http "DevOps AI"               "http://localhost:9400/health"
check_http "SimLab"                  "http://localhost:9200/health"
check_http "Digital Twin"            "http://localhost:9100/health"
check_http "Conscious Core"          "http://localhost:9150/health"
check_http "Evolution Engine"        "http://localhost:9250/health"
check_http "Economic"                "http://localhost:9050/health"

# ── Validators ───────────────────────────────────────────────────
echo -e "\n${CYAN}Validators${NC}"
check_container "ghostchain-bootnode"
check_container "ghostchain-validator-1"
check_container "ghostchain-validator-2"
check_container "ghostchain-validator-3"
check_container "ghostchain-validator-4"

# ── Monitoring ───────────────────────────────────────────────────
echo -e "\n${CYAN}Monitoring${NC}"
check_http "Prometheus"     "http://localhost:9090/-/healthy"
check_http "Grafana"        "http://localhost:3001/api/health"
check_http "Loki"           "http://localhost:3100/ready"

# ── Data Mesh ────────────────────────────────────────────────────
echo -e "\n${CYAN}Data Mesh / Storage${NC}"
check_container "ghostmesh-redis"
check_container "ghostmesh-postgres"
check_container "ghostmesh-elasticsearch"

# ── GhostStack Manager ───────────────────────────────────────────
echo -e "\n${CYAN}Infrastructure${NC}"
check_http "GhostStack Manager" "http://localhost:8787/" 5

# ── Summary ──────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ $FAILURES -eq 0 ]]; then
    echo -e "  ${GREEN}All checks passed${NC}\n"
    exit 0
else
    echo -e "  ${RED}${FAILURES} check(s) failed${NC}\n"
    exit 1
fi
