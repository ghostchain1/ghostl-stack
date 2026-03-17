#!/usr/bin/env bash
# =============================================================================
# GhostStack — Evolution System Master Start Script
# =============================================================================
#
# What this script does (in order):
#   1.  Validates prerequisites (node, docker, forge, git)
#   2.  Creates .env from stack.env.example if missing
#   3.  Enforces all DRY_RUN flags = 0 (live mode)
#   4.  Ensures ghost-internal docker network exists
#   5.  Starts GAIS (hypervisor supervisor) in live mode
#   6.  Starts ghostbrain-core + ghostbrain-simulator
#   7.  Starts ghost-orchestrator + ghost-promotion-engine (evolution stack)
#   8.  Prints unified status dashboard
#
# Usage:
#   ./scripts/evolution-start.sh [--dry-run] [--status-only] [--reset]
#
#   --dry-run      Start everything in DRY_RUN=1 mode (safe — no real VM ops)
#   --status-only  Just print current status, don't start anything
#   --reset        Clear pipeline state files and restart from IDLE
#   --stop         Stop all evolution services
#
# Routing law enforced by all services:
#   L3 (chain 903) → L2 (chain 901) → L1 (chain 14000101) [settlement]
#   Boot order:  L1 first → L2 → L3 [startup]
#
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Parse args ────────────────────────────────────────────────────────────────
ARG_DRY_RUN=0
ARG_STATUS_ONLY=0
ARG_RESET=0
ARG_STOP=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)      ARG_DRY_RUN=1 ;;
    --status-only)  ARG_STATUS_ONLY=1 ;;
    --reset)        ARG_RESET=1 ;;
    --stop)         ARG_STOP=1 ;;
    --help|-h)
      echo "Usage: $SCRIPT_NAME [--dry-run] [--status-only] [--reset] [--stop]"
      exit 0 ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

log_info()  { echo -e "${GREEN}[INFO]${RESET}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
log_error() { echo -e "${RED}[ERROR]${RESET} $*"; }
log_step()  { echo -e "\n${BOLD}${CYAN}── $* ──${RESET}"; }
log_ok()    { echo -e "${GREEN}✅ $*${RESET}"; }
log_fail()  { echo -e "${RED}❌ $*${RESET}"; }

# ── Stop mode ─────────────────────────────────────────────────────────────────
if [[ "$ARG_STOP" -eq 1 ]]; then
  log_step "Stopping Evolution Services"
  cd "$REPO_ROOT"
  docker compose -f docker-compose.evolution.yml down --remove-orphans 2>/dev/null || true
  docker compose -f docker-compose.supervisor.yml down 2>/dev/null || true
  log_ok "Evolution services stopped"
  exit 0
fi

# ── Status only ───────────────────────────────────────────────────────────────
if [[ "$ARG_STATUS_ONLY" -eq 1 ]]; then
  log_step "GhostStack Evolution Status"
  echo ""
  echo -e "${BOLD}Ghost Orchestrator (port 7950):${RESET}"
  curl -sf http://localhost:7950/status 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  offline"
  echo ""
  echo -e "${BOLD}Ghost Promotion Engine (port 7951):${RESET}"
  curl -sf http://localhost:7951/status 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  offline"
  echo ""
  echo -e "${BOLD}GAIS (port 9100):${RESET}"
  curl -sf http://localhost:9100/status 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  offline"
  echo ""
  echo -e "${BOLD}GhostBrain Core (port 7900):${RESET}"
  curl -sf http://localhost:7900/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  offline"
  exit 0
fi

# ── Reset mode ────────────────────────────────────────────────────────────────
if [[ "$ARG_RESET" -eq 1 ]]; then
  log_step "Resetting Pipeline State"
  rm -f "$REPO_ROOT/.tmp/orchestrator_state.json"
  rm -f "$REPO_ROOT/.tmp/promotion_state.json"
  rm -f "$REPO_ROOT/.tmp/vm_manager_state.json"
  rm -f "$REPO_ROOT/.tmp/healer_state.json"
  log_ok "Pipeline state cleared — all services will start from IDLE"
  # POST reset to running services if available
  curl -sf -X POST http://localhost:7950/reset > /dev/null 2>&1 || true
  curl -sf -X POST http://localhost:7951/reset > /dev/null 2>&1 || true
  log_ok "Reset signals sent to running services"
  exit 0
fi

# =============================================================================
# MAIN BOOT SEQUENCE
# =============================================================================

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║  👻  GhostStack — Evolution System Boot                      ║${RESET}"
echo -e "${BOLD}${CYAN}║  DEV → TESTNET → MAINNET → APPS (Autonomous Pipeline)        ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

if [[ "$ARG_DRY_RUN" -eq 1 ]]; then
  log_warn "DRY_RUN mode — no real VM operations will be executed"
fi

cd "$REPO_ROOT"

# ── Step 1: Prerequisites ─────────────────────────────────────────────────────
log_step "Step 1: Validating prerequisites"

PREREQ_OK=1

check_cmd() {
  local cmd="$1"
  if command -v "$cmd" &>/dev/null; then
    log_ok "$cmd found"
  else
    log_fail "$cmd not found — please install it"
    PREREQ_OK=0
  fi
}

check_cmd docker
check_cmd git
check_cmd node
check_cmd python3

# Node version check (>=22.21.0 <23)
NODE_VER=$(node --version | tr -d 'v')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [[ "$NODE_MAJOR" -ne 22 ]]; then
  log_warn "Node version $NODE_VER detected — require >=22.21.0 <23 (see .github/copilot-instructions.md)"
fi

# forge is optional — orchestrator warns if missing
if command -v forge &>/dev/null; then
  log_ok "forge (Foundry) found"
else
  log_warn "forge not found — contract tests will be skipped by orchestrator"
fi

if [[ "$PREREQ_OK" -eq 0 ]]; then
  log_error "Missing prerequisites — aborting"
  exit 1
fi

# ── Step 2: .env setup ────────────────────────────────────────────────────────
log_step "Step 2: Environment configuration"

if [[ ! -f "$REPO_ROOT/.env" ]]; then
  if [[ -f "$REPO_ROOT/stack.env.example" ]]; then
    cp "$REPO_ROOT/stack.env.example" "$REPO_ROOT/.env"
    log_warn ".env created from stack.env.example — set GAIS_API_TOKEN and POSTGRES_PASSWORD before production use"
  else
    touch "$REPO_ROOT/.env"
    log_warn "No stack.env.example found — created empty .env"
  fi
fi

# ── Step 3: Enforce live dry-run flags ────────────────────────────────────────
log_step "Step 3: Enforcing live-mode DRY_RUN flags"

EVOLUTION_DRY_RUN=0
if [[ "$ARG_DRY_RUN" -eq 1 ]]; then
  EVOLUTION_DRY_RUN=1
fi

# Patch .env: set VM_MANAGER_DRY_RUN, GHOSTDNS_HEAL_DRY_RUN, GNMC_*_DRY_RUN
set_env_flag() {
  local key="$1"
  local value="$2"
  local file="$REPO_ROOT/.env"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # Use a temp file to avoid sed -i portability issues
    python3 -c "
import re, sys
content = open('$file').read()
content = re.sub(r'^${key}=.*', '${key}=${value}', content, flags=re.MULTILINE)
open('$file', 'w').write(content)
"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

set_env_flag "VM_MANAGER_DRY_RUN"    "$EVOLUTION_DRY_RUN"
set_env_flag "GHOSTDNS_HEAL_DRY_RUN" "$EVOLUTION_DRY_RUN"
set_env_flag "GNMC_VM_DRY_RUN"       "$EVOLUTION_DRY_RUN"
set_env_flag "GNMC_CONTAINER_DRY_RUN" "$EVOLUTION_DRY_RUN"
set_env_flag "EVOLUTION_DRY_RUN"     "$EVOLUTION_DRY_RUN"
set_env_flag "NOC_DRY_RUN"           "$EVOLUTION_DRY_RUN"
set_env_flag "AEE_DRY_RUN"           "$EVOLUTION_DRY_RUN"

if [[ "$ARG_DRY_RUN" -eq 1 ]]; then
  log_warn "DRY_RUN flags set to 1 in .env — safe simulation mode"
else
  log_ok "DRY_RUN flags cleared — LIVE mode (VM operations enabled)"
fi

# ── Step 4: .tmp directory ────────────────────────────────────────────────────
mkdir -p "$REPO_ROOT/.tmp"
log_ok ".tmp state directory ready"

# ── Step 5: Docker network ─────────────────────────────────────────────────────
log_step "Step 4: Ensuring ghost-internal docker network"

if docker network inspect ghoststack_ghost-internal &>/dev/null; then
  log_ok "ghost-internal network exists"
elif docker network inspect ghost-internal &>/dev/null; then
  log_ok "ghost-internal network exists"
else
  docker network create ghoststack_ghost-internal --driver bridge 2>/dev/null || \
  docker network create ghost-internal --driver bridge
  log_ok "ghost-internal docker network created"
fi

# ── Step 6: GAIS (Hypervisor Supervisor) ─────────────────────────────────────
log_step "Step 5: Starting GAIS (Hypervisor Infrastructure Supervisor)"

if [[ -z "${GAIS_API_TOKEN:-}" ]]; then
  log_warn "GAIS_API_TOKEN not set in environment — reading from .env"
  # shellcheck source=/dev/null
  export $(grep -E '^GAIS_API_TOKEN=' "$REPO_ROOT/.env" 2>/dev/null | head -1 | xargs) 2>/dev/null || true
fi

if [[ -z "${GAIS_API_TOKEN:-}" ]]; then
  log_warn "GAIS_API_TOKEN still empty — GAIS write endpoints will reject auth"
fi

# Start GAIS via docker-compose.supervisor.yml
docker compose -f "$REPO_ROOT/docker-compose.supervisor.yml" up -d --build 2>&1 | tail -5
log_ok "GAIS started (port 9100)"

# Brief wait for GAIS to be ready
echo -n "  Waiting for GAIS API"
for i in {1..12}; do
  if curl -sf http://localhost:9100/status > /dev/null 2>&1; then
    echo " ready"
    break
  fi
  echo -n "."
  sleep 2
  if [[ "$i" -eq 12 ]]; then
    echo " (timeout — continuing)"
  fi
done

# ── Step 7: GhostBrain Core ───────────────────────────────────────────────────
log_step "Step 6: Starting GhostBrain Core (port 7900)"

GB_COMPOSE_FILE=""
# Find the ghostbrain-core compose file
for f in docker-compose.ghostbrain.yml docker-compose.yml; do
  if [[ -f "$REPO_ROOT/$f" ]]; then
    if grep -q "ghostbrain-core\|ghostbrain_core" "$REPO_ROOT/$f" 2>/dev/null; then
      GB_COMPOSE_FILE="$f"
      break
    fi
  fi
done

if [[ -n "$GB_COMPOSE_FILE" ]]; then
  docker compose -f "$REPO_ROOT/$GB_COMPOSE_FILE" up -d ghostbrain-core 2>&1 | tail -3 || \
    log_warn "GhostBrain Core start skipped — check $GB_COMPOSE_FILE"
  log_ok "GhostBrain Core started"
else
  log_warn "No ghostbrain-core in main compose files — it may be run separately"
fi

# ── Step 8: Evolution Services ────────────────────────────────────────────────
log_step "Step 7: Building + starting Evolution Services"

echo "  Building ghost-orchestrator image..."
docker compose -f "$REPO_ROOT/docker-compose.evolution.yml" build ghost-orchestrator 2>&1 | tail -3

echo "  Building ghost-promotion-engine image..."
docker compose -f "$REPO_ROOT/docker-compose.evolution.yml" build ghost-promotion-engine 2>&1 | tail -3

echo "  Starting evolution stack..."
docker compose -f "$REPO_ROOT/docker-compose.evolution.yml" up -d 2>&1 | tail -5
log_ok "Evolution services started"

# ── Step 9: Health checks ─────────────────────────────────────────────────────
log_step "Step 8: Health verification"

echo -n "  ghost-orchestrator (7950)"
for i in {1..15}; do
  if curl -sf http://localhost:7950/health > /dev/null 2>&1; then
    echo -e " ${GREEN}✅ UP${RESET}"
    break
  fi
  echo -n "."
  sleep 2
  if [[ "$i" -eq 15 ]]; then echo -e " ${YELLOW}⏳ SLOW${RESET}"; fi
done

echo -n "  ghost-promotion-engine (7951)"
for i in {1..15}; do
  if curl -sf http://localhost:7951/health > /dev/null 2>&1; then
    echo -e " ${GREEN}✅ UP${RESET}"
    break
  fi
  echo -n "."
  sleep 2
  if [[ "$i" -eq 15 ]]; then echo -e " ${YELLOW}⏳ SLOW${RESET}"; fi
done

# ── Step 10: Status dashboard ─────────────────────────────────────────────────
log_step "Step 9: Live System Status"

echo ""
echo -e "${BOLD}  SERVICE                   PORT    STATUS${RESET}"
echo    "  ─────────────────────────────────────────────────────"

check_port() {
  local name="$1"
  local port="$2"
  local path="${3:-/health}"
  printf "  %-26s %-7s" "$name" "$port"
  if curl -sf "http://localhost:${port}${path}" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ UP${RESET}"
  else
    echo -e "${RED}❌ OFFLINE${RESET}"
  fi
}

check_port "GAIS Supervisor"          9100 /status
check_port "GhostBrain Core"          7900 /health
check_port "Ghost Orchestrator"       7950 /health
check_port "Ghost Promotion Engine"   7951 /health

echo ""
echo -e "${BOLD}  Pipeline State:${RESET}"
ORCH_STAGE=$(curl -sf http://localhost:7950/status 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('stage','?'))" 2>/dev/null || echo "OFFLINE")
PROMO_STAGE=$(curl -sf http://localhost:7951/status 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('stage','?'))" 2>/dev/null || echo "OFFLINE")

echo -e "  Build pipeline:     ${CYAN}$ORCH_STAGE${RESET}"
echo -e "  Promotion pipeline: ${CYAN}$PROMO_STAGE${RESET}"

echo ""
echo -e "${BOLD}  Architecture:${RESET}"
echo    "  ghostchain-devnet (/home/ghost/ghostl-stack)"
echo    "    ↓ build + test (ghost-orchestrator)"
echo    "  ghostchain-testnet + ghostl2-testnet + ghostl3-testnet"
echo    "    ↓ AI simulation (ghostbrain-simulator) + security audit"
echo    "  ghostchain-mainnet + ghostl2-mainnet + ghostl3-mainnet"
echo    "    ↓ governance proposal → ratification → deploy"
echo    "  ghost-web (apps/web, apps/api)"
echo ""

echo -e "${BOLD}  Useful commands:${RESET}"
echo    "  ./scripts/evolution-start.sh --status-only    # live status"
echo    "  ./scripts/evolution-start.sh --reset          # reset pipelines"
echo    "  ./scripts/evolution-start.sh --stop           # stop all"
echo    "  curl -X POST http://localhost:7950/trigger    # force build cycle"
echo    "  curl -X POST http://localhost:7951/trigger    # force promotion"
echo    "  curl http://localhost:9100/vms                # GAIS VM inventory"
echo ""

if [[ "$ARG_DRY_RUN" -eq 1 ]]; then
  echo -e "${YELLOW}  ⚠️  Running in DRY_RUN mode — no real VM operations${RESET}"
  echo    "  To activate live mode: ./scripts/evolution-start.sh (no --dry-run)"
fi

echo -e "${BOLD}${GREEN}  GhostStack Evolution System is running. 🚀${RESET}"
echo ""
