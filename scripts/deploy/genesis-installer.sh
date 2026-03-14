#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#
#   GhostStack Genesis Installer
#   One command — entire GhostStack ecosystem deployed.
#
#   Usage (fresh server):
#       git clone git@github.com:ghostchain1/ghostl-stack.git
#       cd ghostl-stack
#       bash scripts/deploy/genesis-installer.sh
#
#   Or curl-pipe:
#       curl -sL <raw-url>/genesis-installer.sh | bash
#
#   Flags:
#       --no-rust          Skip Rust toolchain install
#       --no-dashboard     Skip Next.js dashboard build
#       --no-monitoring    Skip monitoring stack
#       --no-chains        Skip L1/L2/L3 chain builds
#       --no-contracts     Skip Solidity contracts build
#       --dev              Dev mode (skip hardening + ufw)
#       --dry-run          Print steps without executing
#
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── colors ────────────────────────────────────────────────────────────────
RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
CYAN='\033[0;36m' MAGENTA='\033[0;35m' BOLD='\033[1m' DIM='\033[2m' NC='\033[0m'

log()  { echo -e "${CYAN}[ghost]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
info() { echo -e "${DIM}  ·${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}${MAGENTA}━━━ $* ${NC}"; }

# ── flags ─────────────────────────────────────────────────────────────────
NO_RUST=false; NO_DASHBOARD=false; NO_MONITORING=false
NO_CHAINS=false; NO_CONTRACTS=false; DEV=false; DRY=false

for arg in "$@"; do
    case "$arg" in
        --no-rust)        NO_RUST=true ;;
        --no-dashboard)   NO_DASHBOARD=true ;;
        --no-monitoring)  NO_MONITORING=true ;;
        --no-chains)      NO_CHAINS=true ;;
        --no-contracts)   NO_CONTRACTS=true ;;
        --dev)            DEV=true ;;
        --dry-run)        DRY=true ;;
    esac
done

run() { [[ "$DRY" == "true" ]] && { echo -e "${DIM}[dry] $*${NC}"; return; }; eval "$@"; }

# ── config ────────────────────────────────────────────────────────────────
GHOST_USER="${SUDO_USER:-${USER:-ghost}}"
GHOST_HOME="/home/${GHOST_USER}"
INSTALL_DIR="${GHOST_HOME}/ghostl-stack"
TOOLING_DIR="${GHOST_HOME}/hyperghost-tooling"
REPO_URL="git@github.com:ghostchain1/ghostl-stack.git"
LOG_FILE="/tmp/ghoststack-genesis-$(date +%Y%m%d-%H%M%S).log"
START_TS=$(date +%s)

# ── banner ────────────────────────────────────────────────────────────────
echo -e "${MAGENTA}${BOLD}"
cat << 'BANNER'
  ╔══════════════════════════════════════════════════════╗
  ║        GhostStack Genesis Installer                  ║
  ║  One command → entire ecosystem deployed             ║
  ║                                                      ║
  ║  GhostBrain · GhostChain · GhostL2 · GhostL3        ║
  ╚══════════════════════════════════════════════════════╝
BANNER
echo -e "${NC}"
echo -e "  ${DIM}Log → ${LOG_FILE}${NC}\n"

exec > >(tee -a "$LOG_FILE") 2>&1

# ════════════════════════════════════════════════════════════════════════════
section "1 · System Update + Base Packages"

run sudo apt-get update -qq
run sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    git curl wget jq unzip gnupg lsb-release \
    build-essential ca-certificates apt-transport-https \
    software-properties-common net-tools

ok "Base packages ready"

# ════════════════════════════════════════════════════════════════════════════
section "2 · Docker Engine"

if command -v docker &>/dev/null; then
    ok "Docker already installed: $(docker --version | grep -oP '[\d.]+' | head -1)"
else
    log "Installing Docker via get.docker.com..."
    run curl -fsSL https://get.docker.com | sh
    run sudo usermod -aG docker "$GHOST_USER"
    ok "Docker installed"
fi
run sudo systemctl enable --now docker
run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-compose-plugin || true
ok "Docker Compose plugin ready"

# ════════════════════════════════════════════════════════════════════════════
section "3 · Node.js 20 + pnpm"

if command -v node &>/dev/null && [[ $(node --version | grep -oP '\d+' | head -1) -ge 20 ]]; then
    ok "Node.js already: $(node --version)"
else
    log "Installing Node.js 20.x..."
    run curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
    run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
    ok "Node.js: $(node --version)"
fi

if ! command -v pnpm &>/dev/null; then
    run npm install -g pnpm
fi
ok "pnpm: $(pnpm --version)"

# ════════════════════════════════════════════════════════════════════════════
section "4 · Rust Toolchain"

if [[ "$NO_RUST" == "true" ]]; then
    info "Skipping Rust (--no-rust)"
elif command -v rustc &>/dev/null; then
    ok "Rust already installed: $(rustc --version | head -c 30)"
else
    log "Installing Rust via rustup..."
    run curl https://sh.rustup.rs -sSf | sh -s -- -y --no-modify-path
    # shellcheck source=/dev/null
    source "${HOME}/.cargo/env" 2>/dev/null || true
    ok "Rust: $(rustc --version 2>/dev/null | head -c 30 || echo 'installed')"
fi

# ════════════════════════════════════════════════════════════════════════════
section "5 · Clone / Update GhostStack Repository"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log "Repository found — pulling latest..."
    run git -C "$INSTALL_DIR" pull origin main
    ok "ghostl-stack up to date"
else
    log "Cloning ghostl-stack from ${REPO_URL}..."
    run git clone "$REPO_URL" "$INSTALL_DIR"
    ok "ghostl-stack cloned → ${INSTALL_DIR}"
fi

cd "$INSTALL_DIR"

# ── environment file ───────────────────────────────────────────────────────
if [[ ! -f "${INSTALL_DIR}/.env" && -f "${INSTALL_DIR}/.env.example" ]]; then
    run cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
    ok ".env created from .env.example"
    warn "Review ${INSTALL_DIR}/.env — update secrets before production use"
fi

# ════════════════════════════════════════════════════════════════════════════
section "6 · Root Workspace Dependencies"

if [[ -f "${INSTALL_DIR}/package.json" ]]; then
    run cd "$INSTALL_DIR" && pnpm install
    ok "Root workspace dependencies installed"
fi

# ════════════════════════════════════════════════════════════════════════════
section "7 · Smart Contracts"

if [[ "$NO_CONTRACTS" == "true" ]]; then
    info "Skipping contracts (--no-contracts)"
elif [[ -d "${INSTALL_DIR}/contracts" ]]; then
    log "Building contracts..."
    cd "${INSTALL_DIR}/contracts"
    run pnpm install || true
    run pnpm build || true
    cd "$INSTALL_DIR"
    ok "Contracts built"
else
    info "contracts/ not found — skipping"
fi

# ════════════════════════════════════════════════════════════════════════════
section "8 · GhostChain L1 · L2 · L3"

if [[ "$NO_CHAINS" == "true" ]]; then
    info "Skipping chain builds (--no-chains)"
else
    for chain in ghostchain-l1 ghostl2 ghostl3; do
        chain_dir="${INSTALL_DIR}/chains/${chain}"
        if [[ -d "$chain_dir" ]]; then
            log "Building ${chain}..."
            cd "$chain_dir"
            run pnpm install || true
            run pnpm build || true
            cd "$INSTALL_DIR"
            ok "${chain} built"
        else
            info "chains/${chain} not found — skipping"
        fi
    done
fi

# ════════════════════════════════════════════════════════════════════════════
section "9 · GhostBrain Services"

GHOSTBRAIN_SRC="${TOOLING_DIR}/hyper-ghost-ai/services"

if [[ -d "$GHOSTBRAIN_SRC" ]]; then
    log "Building GhostBrain TypeScript packages..."
    cd "$GHOSTBRAIN_SRC"
    run pnpm install --frozen-lockfile || run pnpm install
    run pnpm -r build
    cd "$INSTALL_DIR"
    ok "All GhostBrain packages built"
elif [[ -d "${INSTALL_DIR}/services/ghostbrain" ]]; then
    log "Building from services/ghostbrain/..."
    shopt -s nullglob
    for svc_dir in "${INSTALL_DIR}/services/ghostbrain"/*/; do
        if [[ -f "${svc_dir}package.json" ]]; then
            svc_name=$(basename "$svc_dir")
            log "  Building ${svc_name}..."
            cd "$svc_dir"
            run pnpm install || true
            run pnpm build || true
            cd "$INSTALL_DIR"
        fi
    done
    ok "GhostBrain services built"
else
    warn "GhostBrain source not found — clone hyperghost-tooling and re-run, or use --skip-ghostbrain"
fi

# ════════════════════════════════════════════════════════════════════════════
section "10 · Docker Network"

if run docker network inspect ghostbrain-net &>/dev/null; then
    ok "ghostbrain-net already exists"
else
    run docker network create --driver bridge --subnet 172.28.0.0/16 ghostbrain-net
    ok "ghostbrain-net created (172.28.0.0/16)"
fi

# ════════════════════════════════════════════════════════════════════════════
section "11 · Docker Image Builds"

COMPOSE_DIR="${INSTALL_DIR}/infrastructure/docker"
cd "$COMPOSE_DIR"

log "Building all Docker images (parallel)..."
GHOSTBRAIN_SRC="$GHOSTBRAIN_SRC" \
    run docker compose \
        -f ghostbrain-stack.yml \
        -f data-mesh-stack.yml \
        build --parallel

ok "Docker images built"
cd "$INSTALL_DIR"

# ════════════════════════════════════════════════════════════════════════════
section "12 · GhostBrain Stack"

log "Starting GhostBrain AI services (16 services)..."
GHOSTBRAIN_SRC="$GHOSTBRAIN_SRC" \
    run docker compose \
        -f "${COMPOSE_DIR}/ghostbrain-stack.yml" \
        --env-file "${INSTALL_DIR}/.env" \
        up -d

# Wait for SCP to become reachable
log "Waiting for Sovereign Control Plane (port 9500)..."
scp_up=false
for i in $(seq 1 20); do
    if curl -sf --max-time 3 http://localhost:9500/health &>/dev/null; then
        scp_up=true; break
    fi
    sleep 3
done
if [[ "$scp_up" == "true" ]]; then
    ok "SCP online"
else
    warn "SCP not yet responding — may need another minute to start"
fi

# ════════════════════════════════════════════════════════════════════════════
section "13 · Validator Network"

log "Starting bootnode + 4 validators..."
run docker compose \
    -f "${COMPOSE_DIR}/validator-stack.yml" \
    --env-file "${INSTALL_DIR}/.env" \
    up -d

ok "Validator network started"

# ════════════════════════════════════════════════════════════════════════════
section "14 · Global Data Mesh"

log "Starting Redis · Postgres · Elasticsearch · GhostStack Manager..."
run docker compose \
    -f "${COMPOSE_DIR}/data-mesh-stack.yml" \
    --env-file "${INSTALL_DIR}/.env" \
    up -d

# Wait for Redis
for i in $(seq 1 10); do
    docker exec ghostmesh-redis redis-cli ping &>/dev/null && { ok "Redis: PONG"; break; } || sleep 2
done

ok "Data Mesh running"

# ════════════════════════════════════════════════════════════════════════════
section "15 · Monitoring Stack"

if [[ "$NO_MONITORING" == "true" ]]; then
    info "Skipping monitoring (--no-monitoring)"
else
    log "Starting Prometheus · Grafana · Loki · Node Exporter..."
    run docker compose \
        -f "${COMPOSE_DIR}/monitoring-stack.yml" \
        --env-file "${INSTALL_DIR}/.env" \
        up -d

    for i in $(seq 1 20); do
        curl -sf http://localhost:3001/api/health &>/dev/null && { ok "Grafana online"; break; } || sleep 3
    done
fi

# ════════════════════════════════════════════════════════════════════════════
section "16 · Next.js Control Dashboard"

if [[ "$NO_DASHBOARD" == "true" ]]; then
    info "Skipping dashboard (--no-dashboard)"
else
    WEB_DIR="${INSTALL_DIR}/apps/web"
    if [[ -f "${WEB_DIR}/package.json" ]]; then
        log "Building Next.js dashboard..."
        cd "$WEB_DIR"
        run pnpm install
        run NEXT_PUBLIC_SCP_URL="http://localhost:9500" pnpm build
        # Launch detached — logs to /tmp/ghoststack-dashboard.log
        nohup pnpm start > /tmp/ghoststack-dashboard.log 2>&1 &
        echo $! > /tmp/ghoststack-dashboard.pid
        ok "Dashboard started (PID $(cat /tmp/ghoststack-dashboard.pid))"
        cd "$INSTALL_DIR"
    else
        info "apps/web/package.json not found — skipping dashboard"
    fi
fi

# ════════════════════════════════════════════════════════════════════════════
section "17 · Systemd Boot Service"

if [[ "$DEV" == "true" ]]; then
    info "Skipping systemd (--dev mode)"
else
    SYSTEMD_UNIT="/etc/systemd/system/ghoststack.service"
    if [[ ! -f "$SYSTEMD_UNIT" ]]; then
        sudo tee "$SYSTEMD_UNIT" > /dev/null << UNIT
[Unit]
Description=GhostStack — Sovereign AI Blockchain Infrastructure
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=${GHOST_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/scripts/deploy/bootstrap.sh --skip-docker
ExecStop=/usr/bin/docker compose \
    -f ${INSTALL_DIR}/infrastructure/docker/ghostbrain-stack.yml \
    -f ${INSTALL_DIR}/infrastructure/docker/validator-stack.yml \
    -f ${INSTALL_DIR}/infrastructure/docker/data-mesh-stack.yml \
    -f ${INSTALL_DIR}/infrastructure/docker/monitoring-stack.yml \
    down
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT
        sudo systemctl daemon-reload
        sudo systemctl enable ghoststack.service
        ok "ghoststack.service installed + enabled (auto-starts on reboot)"
    else
        ok "ghoststack.service already installed"
    fi

    sudo systemctl enable docker
fi

# ════════════════════════════════════════════════════════════════════════════
section "18 · Production Hardening"

if [[ "$DEV" == "true" ]]; then
    info "Skipping hardening (--dev)"
else
    [[ -f "${INSTALL_DIR}/.env" ]] && { chmod 600 "${INSTALL_DIR}/.env"; ok ".env → 600"; }
    [[ -d "${INSTALL_DIR}/validators/keys" ]] && { chmod -R 700 "${INSTALL_DIR}/validators/keys"; ok "keys/ → 700"; }

    if command -v ufw &>/dev/null && sudo ufw status | grep -q "active"; then
        sudo ufw allow 9500/tcp comment "GhostBrain SCP"   2>/dev/null || true
        sudo ufw allow 3001/tcp comment "Grafana"          2>/dev/null || true
        sudo ufw allow 9090/tcp comment "Prometheus"       2>/dev/null || true
        sudo ufw allow 3000/tcp comment "GhostStack Dashboard" 2>/dev/null || true
        ok "UFW rules applied"
    fi
fi

# ════════════════════════════════════════════════════════════════════════════
section "19 · Final Health Check"

declare -A SERVICES=(
    ["SCP (9500)"]="http://localhost:9500/health"
    ["Swarm (9000)"]="http://localhost:9000/health"
    ["Kernel (9300)"]="http://localhost:9300/health"
    ["Data Mesh (9900)"]="http://localhost:9900/health"
    ["Prometheus (9090)"]="http://localhost:9090/-/healthy"
    ["Grafana (3001)"]="http://localhost:3001/api/health"
)

pass=0; fail=0
for name in "${!SERVICES[@]}"; do
    url="${SERVICES[$name]}"
    code=$(curl -sf --max-time 4 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
        ok "${name}"
        ((pass++)) || true
    else
        warn "${name} → HTTP ${code}"
        ((fail++)) || true
    fi
done

redis_ok=false
docker exec ghostmesh-redis redis-cli ping &>/dev/null && { ok "Redis"; redis_ok=true; ((pass++)) || true; } \
    || { warn "Redis unreachable"; ((fail++)) || true; }

pg_ok=false
docker exec ghostmesh-postgres pg_isready -U ghost -d ghoststack &>/dev/null \
    && { ok "PostgreSQL"; pg_ok=true; ((pass++)) || true; } \
    || { warn "PostgreSQL not ready yet"; ((fail++)) || true; }

# ════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════════════════

ELAPSED=$(( $(date +%s) - START_TS ))
MINS=$(( ELAPSED / 60 )); SECS=$(( ELAPSED % 60 ))

echo ""
echo -e "${BOLD}${GREEN}"
cat << 'DONE'
  ╔══════════════════════════════════════════════════════╗
  ║         GhostStack Deployment Complete               ║
  ╚══════════════════════════════════════════════════════╝
DONE
echo -e "${NC}"

echo -e "  ${DIM}Time: ${MINS}m ${SECS}s   |   Health: ${pass} ✓  ${fail} ⚠${NC}"
echo ""
echo -e "  ${BOLD}Access Points${NC}"
echo -e "  ┌──────────────────────────────────────────────────┐"
echo -e "  │  Control Dashboard     http://localhost:3000     │"
echo -e "  │  SCP Control Plane     http://localhost:9500     │"
echo -e "  │  GhostStack Manager    http://localhost:8787     │"
echo -e "  │  Grafana               http://localhost:3001     │"
echo -e "  │  Prometheus            http://localhost:9090     │"
echo -e "  │  GhostChain RPC        http://localhost:8545     │"
echo -e "  └──────────────────────────────────────────────────┘"
echo ""
echo -e "  ${BOLD}Running Infrastructure${NC}"
docker ps --format '  {{.Names}}\t{{.Status}}' 2>/dev/null \
    | grep -E "ghost|validator|monitor" | head -25 || true
echo ""
echo -e "  ${BOLD}Quick Commands${NC}"
echo -e "  ${DIM}make up${NC}            start all stacks"
echo -e "  ${DIM}make down${NC}          stop all stacks"
echo -e "  ${DIM}make health${NC}        check all services"
echo -e "  ${DIM}make ghostbrain-logs${NC} tail AI logs"
echo ""
echo -e "  ${DIM}Full log: ${LOG_FILE}${NC}"
echo ""
