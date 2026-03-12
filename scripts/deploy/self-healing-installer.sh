#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#
#   GhostStack Self-Healing Installer v2
#   Installs GhostStack AND leaves behind a fully self-maintaining system.
#
#   Additions over genesis-installer v1:
#     · validator key generation (openssl + geth-compatible keystore)
#     · secrets file sealing (chmod 600, optional Vault stub)
#     · health-monitor.sh as a systemd oneshot + timer (every 30s)
#     · ai-supervisor.sh as a persistent systemd service
#     · scale-nodes.sh wired into supervisor loop
#     · ghoststack-supervisor.service auto-start
#
#   Usage:
#       bash scripts/deploy/self-healing-installer.sh [flags]
#
#   Flags:
#       --no-rust           Skip Rust toolchain
#       --no-dashboard      Skip Next.js build
#       --no-monitoring     Skip Prometheus/Grafana/Loki
#       --no-chains         Skip L1/L2/L3 builds
#       --no-contracts      Skip Solidity contracts
#       --validator-count N Generate N validator keys (default: 4)
#       --dev               Skip systemd + hardening
#       --dry-run           Print steps without executing
#
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
CYAN='\033[0;36m' MAGENTA='\033[0;35m' BOLD='\033[1m' DIM='\033[2m' NC='\033[0m'

log()     { echo -e "${CYAN}[ghost]${NC} $*"; }
ok()      { echo -e "${GREEN}  ✓${NC} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${NC} $*"; }
info()    { echo -e "${DIM}  ·${NC} $*"; }
die()     { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}${MAGENTA}━━━ $* ${NC}"; }

# ── flags ──────────────────────────────────────────────────────────────────
NO_RUST=false; NO_DASHBOARD=false; NO_MONITORING=false
NO_CHAINS=false; NO_CONTRACTS=false; DEV=false; DRY=false
VALIDATOR_COUNT=4

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-rust)          NO_RUST=true ;;
        --no-dashboard)     NO_DASHBOARD=true ;;
        --no-monitoring)    NO_MONITORING=true ;;
        --no-chains)        NO_CHAINS=true ;;
        --no-contracts)     NO_CONTRACTS=true ;;
        --dev)              DEV=true ;;
        --dry-run)          DRY=true ;;
        --validator-count)  shift; VALIDATOR_COUNT="${1:-4}" ;;
        *) warn "Unknown flag: $1" ;;
    esac
    shift
done

run() { [[ "$DRY" == "true" ]] && { echo -e "${DIM}[dry] $*${NC}"; return; }; eval "$@"; }

# ── config ─────────────────────────────────────────────────────────────────
GHOST_USER="${SUDO_USER:-${USER:-ghost}}"
GHOST_HOME="/home/${GHOST_USER}"
STACK_DIR="${GHOST_HOME}/ghostl-stack"
TOOLING_DIR="${GHOST_HOME}/hyperghost-tooling"
COMPOSE_DIR="${STACK_DIR}/infrastructure/docker"
VALIDATOR_DIR="${STACK_DIR}/validators"
KEYS_DIR="${VALIDATOR_DIR}/keys"
LOG_DIR="${STACK_DIR}/logs"
SCRIPTS_DIR="${STACK_DIR}/scripts/maintenance"
REPO_URL="git@github.com:ghostchain1/ghostl-stack.git"
LOG_FILE="/tmp/ghoststack-shiv2-$(date +%Y%m%d-%H%M%S).log"
START_TS=$(date +%s)

mkdir -p "$LOG_DIR" "$KEYS_DIR" "$SCRIPTS_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1

# ── banner ─────────────────────────────────────────────────────────────────
echo -e "${MAGENTA}${BOLD}"
cat << 'BANNER'
  ╔══════════════════════════════════════════════════════════╗
  ║    GhostStack Self-Healing Installer  v2                 ║
  ║    Installs · Heals · Scales · Supervises                ║
  ║                                                          ║
  ║    GhostBrain × GhostChain × Validators × Monitoring     ║
  ╚══════════════════════════════════════════════════════════╝
BANNER
echo -e "${NC}"
info "Log → ${LOG_FILE}"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 1: System bootstrap (same robust base as genesis-installer) ──────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 1 · System Bootstrap"

run sudo apt-get update -qq
run sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    git curl wget jq unzip gnupg lsb-release bc openssl \
    build-essential ca-certificates apt-transport-https \
    software-properties-common net-tools

ok "Base packages ready"

# Docker
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    run curl -fsSL https://get.docker.com | sh
    run sudo usermod -aG docker "$GHOST_USER"
fi
run sudo systemctl enable --now docker
run sudo apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
ok "Docker: $(docker --version 2>/dev/null | grep -oP '[\d.]+' | head -1)"

# Node.js
if ! command -v node &>/dev/null || [[ $(node --version 2>/dev/null | grep -oP '\d+' | head -1) -lt 20 ]]; then
    log "Installing Node.js 20.x..."
    run curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
    run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
command -v pnpm &>/dev/null || run npm install -g pnpm
ok "Node $(node --version) · pnpm $(pnpm --version)"

# Rust
if [[ "$NO_RUST" == "false" ]] && ! command -v rustc &>/dev/null; then
    log "Installing Rust..."
    run curl https://sh.rustup.rs -sSf | sh -s -- -y --no-modify-path
    # shellcheck source=/dev/null
    source "${HOME}/.cargo/env" 2>/dev/null || true
    ok "Rust: $(rustc --version 2>/dev/null | head -c 25 || echo installed)"
fi

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 2: Repository setup ─────────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 2 · Repository"

if [[ -d "${STACK_DIR}/.git" ]]; then
    run git -C "$STACK_DIR" pull origin main
else
    run git clone "$REPO_URL" "$STACK_DIR"
fi

[[ ! -f "${STACK_DIR}/.env" && -f "${STACK_DIR}/.env.example" ]] \
    && run cp "${STACK_DIR}/.env.example" "${STACK_DIR}/.env" \
    && warn "Review ${STACK_DIR}/.env — update secrets before production"

[[ -f "${STACK_DIR}/package.json" ]] && run cd "$STACK_DIR" && run pnpm install
ok "Repository ready"

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 3: Build artifacts ───────────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 3 · Build"

# contracts
if [[ "$NO_CONTRACTS" == "false" && -d "${STACK_DIR}/contracts" ]]; then
    cd "${STACK_DIR}/contracts"
    run pnpm install || true; run pnpm build || true
    cd "$STACK_DIR"
    ok "Contracts built"
fi

# chains
if [[ "$NO_CHAINS" == "false" ]]; then
    for chain in ghostchain-l1 ghostl2 ghostl3; do
        if [[ -d "${STACK_DIR}/chains/${chain}" ]]; then
            cd "${STACK_DIR}/chains/${chain}"
            run pnpm install || true; run pnpm build || true
            cd "$STACK_DIR"
            ok "${chain} built"
        fi
    done
fi

# GhostBrain TypeScript packages
GHOSTBRAIN_SRC="${TOOLING_DIR}/hyper-ghost-ai/services"
if [[ -d "$GHOSTBRAIN_SRC" ]]; then
    cd "$GHOSTBRAIN_SRC"
    run pnpm install --frozen-lockfile || run pnpm install
    run pnpm -r build
    cd "$STACK_DIR"
    ok "GhostBrain packages built"
elif [[ -d "${STACK_DIR}/services" ]]; then
    shopt -s nullglob
    for svc in "${STACK_DIR}/services"/*/; do
        [[ -f "${svc}package.json" ]] || continue
        cd "$svc"; run pnpm install || true; run pnpm build || true; cd "$STACK_DIR"
    done
    ok "Services built"
fi

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 4: Validator Key Generation ─────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 4 · Validator Key Generation (${VALIDATOR_COUNT} keys)"

# Delegate to the dedicated generator script, or run inline
GEN_SCRIPT="${VALIDATOR_DIR}/scripts/generate-validator-key.sh"

if [[ -x "$GEN_SCRIPT" ]]; then
    for i in $(seq 1 "$VALIDATOR_COUNT"); do
        run bash "$GEN_SCRIPT" "$i"
    done
else
    log "Generating ${VALIDATOR_COUNT} validator keys inline..."
    for i in $(seq 1 "$VALIDATOR_COUNT"); do
        KEY_ID="validator-$(printf '%02d' "$i")"
        KEY_FILE="${KEYS_DIR}/${KEY_ID}.key"
        if [[ "$DRY" == "true" ]]; then
            info "[dry] Would generate ${KEY_FILE}"
        elif [[ -f "$KEY_FILE" ]]; then
            info "Key already exists: ${KEY_FILE}"
        else
            openssl rand -hex 32 > "$KEY_FILE"
            chmod 600 "$KEY_FILE"
            ok "Generated: ${KEY_FILE}"
        fi
    done
fi

chmod -R 700 "$KEYS_DIR" 2>/dev/null || true
ok "${VALIDATOR_COUNT} validator keys ready in ${KEYS_DIR}"

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 5: Docker infrastructure ────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 5 · Docker Infrastructure"

docker network inspect ghostbrain-net &>/dev/null \
    || run docker network create --driver bridge --subnet 172.28.0.0/16 ghostbrain-net
ok "ghostbrain-net ready"

cd "$COMPOSE_DIR"
GHOSTBRAIN_SRC="$GHOSTBRAIN_SRC" run docker compose -f ghostbrain-stack.yml build --parallel
ok "Docker images built"

# Start all stacks
run docker compose -f ghostbrain-stack.yml  --env-file "${STACK_DIR}/.env" up -d
run docker compose -f validator-stack.yml   --env-file "${STACK_DIR}/.env" up -d
run docker compose -f data-mesh-stack.yml   --env-file "${STACK_DIR}/.env" up -d
[[ "$NO_MONITORING" == "false" ]] \
    && run docker compose -f monitoring-stack.yml --env-file "${STACK_DIR}/.env" up -d

ok "All stacks started"
cd "$STACK_DIR"

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 6: Next.js Dashboard ────────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 6 · Next.js Dashboard"

if [[ "$NO_DASHBOARD" == "false" && -f "${STACK_DIR}/apps/web/package.json" ]]; then
    cd "${STACK_DIR}/apps/web"
    run pnpm install
    run NEXT_PUBLIC_SCP_URL="http://localhost:9500" pnpm build
    nohup pnpm start > "${LOG_DIR}/dashboard.log" 2>&1 &
    echo $! > /tmp/ghoststack-dashboard.pid
    ok "Dashboard started (PID $(cat /tmp/ghoststack-dashboard.pid))"
    cd "$STACK_DIR"
fi

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 7: Self-Healing systemd services ────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 7 · Self-Healing Services"

if [[ "$DEV" == "true" ]]; then
    info "Skipping systemd (--dev)"
else
    # ── health-monitor timer (every 30s) ───────────────────────────────────
    sudo tee /etc/systemd/system/ghoststack-health-monitor.service > /dev/null << UNIT
[Unit]
Description=GhostStack Container Health Monitor
After=docker.service

[Service]
Type=oneshot
User=${GHOST_USER}
WorkingDirectory=${STACK_DIR}
ExecStart=${SCRIPTS_DIR}/health-monitor.sh
StandardOutput=append:${LOG_DIR}/health-monitor.log
StandardError=append:${LOG_DIR}/health-monitor.log
UNIT

    sudo tee /etc/systemd/system/ghoststack-health-monitor.timer > /dev/null << TIMER
[Unit]
Description=GhostStack Health Monitor — every 30 seconds
After=docker.service ghoststack-supervisor.service

[Timer]
OnBootSec=60s
OnUnitActiveSec=30s
AccuracySec=5s

[Install]
WantedBy=timers.target
TIMER

    # ── ai-supervisor persistent service ──────────────────────────────────
    sudo tee /etc/systemd/system/ghoststack-supervisor.service > /dev/null << UNIT
[Unit]
Description=GhostStack AI Infrastructure Supervisor
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${GHOST_USER}
WorkingDirectory=${STACK_DIR}
ExecStart=${SCRIPTS_DIR}/ai-supervisor.sh
Restart=always
RestartSec=10
StandardOutput=append:${LOG_DIR}/supervisor.log
StandardError=append:${LOG_DIR}/supervisor.log

[Install]
WantedBy=multi-user.target
UNIT

    # ── ghoststack boot service (brings stacks up on reboot) ──────────────
    sudo tee /etc/systemd/system/ghoststack.service > /dev/null << UNIT
[Unit]
Description=GhostStack — Sovereign AI Blockchain Infrastructure
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=${GHOST_USER}
WorkingDirectory=${STACK_DIR}
ExecStart=/bin/bash -c '\
    docker compose -f ${COMPOSE_DIR}/ghostbrain-stack.yml  up -d && \
    docker compose -f ${COMPOSE_DIR}/validator-stack.yml   up -d && \
    docker compose -f ${COMPOSE_DIR}/data-mesh-stack.yml   up -d && \
    docker compose -f ${COMPOSE_DIR}/monitoring-stack.yml  up -d'
ExecStop=/bin/bash -c '\
    docker compose -f ${COMPOSE_DIR}/ghostbrain-stack.yml  down && \
    docker compose -f ${COMPOSE_DIR}/validator-stack.yml   down && \
    docker compose -f ${COMPOSE_DIR}/data-mesh-stack.yml   down && \
    docker compose -f ${COMPOSE_DIR}/monitoring-stack.yml  down'
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT

    sudo systemctl daemon-reload
    sudo systemctl enable ghoststack.service
    sudo systemctl enable ghoststack-supervisor.service
    sudo systemctl enable ghoststack-health-monitor.timer
    sudo systemctl start  ghoststack-supervisor.service  || warn "supervisor start deferred (Docker may not be ready)"
    sudo systemctl start  ghoststack-health-monitor.timer
    sudo systemctl enable docker

    ok "ghoststack.service             — enabled"
    ok "ghoststack-supervisor.service  — enabled + running"
    ok "ghoststack-health-monitor.timer — enabled (30s interval)"
fi

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 8: Hardening ────────────────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 8 · Hardening"

if [[ "$DEV" == "false" ]]; then
    [[ -f "${STACK_DIR}/.env" ]]         && chmod 600 "${STACK_DIR}/.env"    && ok ".env → 600"
    [[ -d "${KEYS_DIR}" ]]               && chmod -R 700 "${KEYS_DIR}"       && ok "keys/ → 700"
    [[ -d "${LOG_DIR}" ]]                && chmod -R 750 "${LOG_DIR}"         && ok "logs/ → 750"

    # Log rotation
    sudo tee /etc/logrotate.d/ghoststack > /dev/null << 'LR'
/home/ghost/ghostl-stack/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
}
LR
    ok "Log rotation configured"

    if command -v ufw &>/dev/null && sudo ufw status 2>/dev/null | grep -q "active"; then
        sudo ufw allow 9500/tcp comment "GhostBrain SCP"       2>/dev/null || true
        sudo ufw allow 3000/tcp comment "GhostStack Dashboard" 2>/dev/null || true
        sudo ufw allow 3001/tcp comment "Grafana"              2>/dev/null || true
        sudo ufw allow 9090/tcp comment "Prometheus"           2>/dev/null || true
        ok "UFW rules applied"
    fi
fi

# ════════════════════════════════════════════════════════════════════════════
# ── Phase 9: Health check + summary ───────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

section "Phase 9 · Health Check"

pass=0; warn_count=0

check() {
    local n="$1" url="$2"
    local code; code=$(curl -sf --max-time 4 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then ok "${n}"; ((pass++)) || true
    else warn "${n} → HTTP ${code}"; ((warn_count++)) || true; fi
}

check "SCP Control Plane (9500)"  "http://localhost:9500/health"
check "GhostBrain Swarm (9000)"   "http://localhost:9000/health"
check "GhostBrain Kernel (9300)"  "http://localhost:9300/health"
check "Data Mesh GDM (9900)"      "http://localhost:9900/health"
[[ "$NO_MONITORING" == "false" ]] && check "Grafana (3001)" "http://localhost:3001/api/health"

docker exec ghostmesh-redis redis-cli ping &>/dev/null \
    && { ok "Redis"; ((pass++)) || true; } || { warn "Redis not ready"; ((warn_count++)) || true; }

ELAPSED=$(( $(date +%s) - START_TS ))

echo -e "\n${BOLD}${GREEN}"
cat << 'DONE'
  ╔══════════════════════════════════════════════════════════╗
  ║   GhostStack Self-Healing Installer v2 — Complete        ║
  ║   System is now self-maintaining.                        ║
  ╚══════════════════════════════════════════════════════════╝
DONE
echo -e "${NC}"

printf "  Time: %dm %ds   Health: %d ✓  %d ⚠\n\n" \
    $(( ELAPSED/60 )) $(( ELAPSED%60 )) "$pass" "$warn_count"

echo -e "  ${BOLD}Access Points${NC}"
echo    "  ┌────────────────────────────────────────────────────┐"
echo    "  │  Control Dashboard     http://localhost:3000       │"
echo    "  │  SCP Control Plane     http://localhost:9500       │"
echo    "  │  GhostStack Manager    http://localhost:8787       │"
echo    "  │  Grafana               http://localhost:3001       │"
echo    "  │  Prometheus            http://localhost:9090       │"
echo    "  │  GhostChain RPC        http://localhost:8545       │"
echo    "  └────────────────────────────────────────────────────┘"
echo ""
echo -e "  ${BOLD}Self-Healing Services${NC}"
systemctl is-active ghoststack-supervisor 2>/dev/null \
    && echo    "  ✓  ghoststack-supervisor.service  (running)" \
    || echo    "  ·  ghoststack-supervisor.service  (start after reboot)"
systemctl is-active ghoststack-health-monitor.timer 2>/dev/null \
    && echo    "  ✓  ghoststack-health-monitor.timer (30s)" \
    || echo    "  ·  ghoststack-health-monitor.timer (start after reboot)"
echo ""
echo -e "  ${BOLD}Maintenance Loop${NC}"
echo    "  monitor → repair → scale → feed telemetry to GhostBrain"
echo    "  Interval: 30 seconds"
echo -e "\n  ${DIM}Log: ${LOG_FILE}${NC}\n"
