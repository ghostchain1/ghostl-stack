#!/usr/bin/env bash
# ============================================================
# GhostStack MDB — 00-preflight.sh
# Validates system requirements before deployment
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[✓]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!]${RESET} $*"; }
fail() { echo -e "${RED}[✗]${RESET} $*"; FAILED=$((FAILED+1)); }

FAILED=0

echo "──────────────────────────────────────────────────────"
echo "  GhostStack Preflight Checks"
echo "──────────────────────────────────────────────────────"

## ── Docker ──────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version | grep -oP '\d+\.\d+' | head -1)
  ok "Docker found: ${DOCKER_VER}"
else
  fail "Docker not found — install from https://docs.docker.com/get-docker/"
fi

if docker info &>/dev/null; then
  ok "Docker daemon is running"
else
  fail "Docker daemon not running — run: sudo systemctl start docker"
fi

## ── Docker Compose ──────────────────────────────────────────
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_VER=$(docker compose version --short 2>/dev/null || echo "v2")
  ok "Docker Compose (plugin) found: ${COMPOSE_VER}"
elif command -v docker-compose &>/dev/null; then
  warn "Using legacy docker-compose binary — consider upgrading to Compose v2"
else
  fail "Docker Compose not found"
fi

## ── Node.js (for web app) ───────────────────────────────────
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  ok "Node.js found: ${NODE_VER}"
else
  warn "Node.js not found — control-center web app will not be available in dev mode"
fi

## ── npm ─────────────────────────────────────────────────────
if command -v npm &>/dev/null; then
  ok "npm found: $(npm --version)"
else
  warn "npm not found — AI service local builds will not work"
fi

## ── Disk space (require at least 10 GB free) ────────────────
FREE_GB=$(df -BG "${GHOSTSTACK_ROOT:-/home/ghost/ghostl-stack}" 2>/dev/null | awk 'NR==2{gsub("G",""); print $4}')
if [[ -n "${FREE_GB}" && "${FREE_GB}" -ge 10 ]]; then
  ok "Disk space: ${FREE_GB} GB free"
elif [[ -n "${FREE_GB}" ]]; then
  warn "Low disk space: ${FREE_GB} GB free (recommended ≥ 10 GB)"
else
  warn "Could not determine free disk space"
fi

## ── RAM (require at least 4 GB) ─────────────────────────────
FREE_MEM=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
if [[ -n "${FREE_MEM}" && "${FREE_MEM}" -ge 2048 ]]; then
  ok "Free memory: ${FREE_MEM} MB"
elif [[ -n "${FREE_MEM}" ]]; then
  warn "Low free memory: ${FREE_MEM} MB (recommended ≥ 4096 MB)"
fi

## ── Required ports (check nothing is blocking them) ──────────
REQUIRED_PORTS=(3000 3001 5432 6379 8545 8546 9000 9090 9300 9500 9700 9800 9900
                9970 9971 9972 9973 9974 9975 9976 9977 9978 9979 9980 9982 9983 9984 9985)

BLOCKED=()
for port in "${REQUIRED_PORTS[@]}"; do
  if ss -tlnp 2>/dev/null | grep -q ":${port} " || \
     netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
    # Only flag non-docker processes blocking these ports
    if ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ":${port}->"; then
      BLOCKED+=("${port}")
    fi
  fi
done

if [[ ${#BLOCKED[@]} -eq 0 ]]; then
  ok "All required ports are available"
else
  warn "Ports already in use (may conflict): ${BLOCKED[*]}"
fi

## ── ghoststack.env secrets check ────────────────────────────
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  warn "OPENAI_API_KEY is not set — AI services will run in mock/offline mode"
fi
if [[ -z "${POSTGRES_PASSWORD:-}" || "${POSTGRES_PASSWORD}" == "ghoststack_db_password" ]]; then
  warn "POSTGRES_PASSWORD is using the default value — change it for production"
fi
if [[ -z "${GRAFANA_ADMIN_PASSWORD:-}" || "${GRAFANA_ADMIN_PASSWORD}" == "ghoststack_grafana_password" ]]; then
  warn "GRAFANA_ADMIN_PASSWORD is using the default value — change it for production"
fi

## ── Result ───────────────────────────────────────────────────
echo
if [[ "${FAILED}" -gt 0 ]]; then
  echo -e "${RED}Preflight failed with ${FAILED} error(s). Fix the above issues and retry.${RESET}"
  exit 1
else
  echo -e "${GREEN}All preflight checks passed.${RESET}"
fi
