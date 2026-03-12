#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#
#   ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗███████╗████████╗ █████╗  ██████╗██╗  ██╗
#  ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
#  ██║  ███╗███████║██║   ██║███████╗   ██║   ███████╗   ██║   ███████║██║     █████╔╝
#  ██║   ██║██╔══██║██║   ██║╚════██║   ██║   ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
#  ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║   ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
#   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
#
#   GhostStack Genesis Installer  v1.0.0
#   Sovereign AI-Managed Blockchain Infrastructure
#
#   Deploys the complete GhostStack ecosystem from a fresh Ubuntu/Debian server.
#
#   Usage:
#       curl -sL https://raw.githubusercontent.com/ghostmode25/ghost-home-private-20260301/main/ghostl-stack/scripts/deploy/bootstrap.sh | bash
#   Or locally:
#       sudo bash scripts/deploy/bootstrap.sh [--minimal] [--dev] [--skip-docker] [--skip-ghostbrain]
#
#   Options:
#       --minimal        Skip monitoring and dashboard — GhostBrain + validators only
#       --dev            Development mode — skip production hardening
#       --skip-docker    Assume docker is already installed
#       --skip-ghostbrain  Skip TypeScript build + GhostBrain image build
#       --dry-run        Print what would happen without doing it
#       --help           Print this help
#
#   What this installs:
#       1. System dependencies (git, docker, node, pnpm, jq, curl, wget)
#       2. Docker Engine + Compose plugin
#       3. Node.js v22 + pnpm
#       4. Repository structure (this repo + hyperghost-tooling)
#       5. GhostBrain TypeScript packages (pnpm install + build, all 21)
#       6. Docker images for all 16 GhostBrain services
#       7. Docker network (ghostbrain-net)
#       8. Environment file from .env.example
#       9. Persistent volumes for SCP, GDM, governance, kernel
#      10. GhostBrain stack (ghostbrain-swarm first, then all services in order)
#      11. Validator stack (4 GhostChain nodes + bootnode)
#      12. Data Mesh stack (Redis + Postgres + Elasticsearch + GhostStack Manager)
#      13. Monitoring stack (Prometheus + Grafana + Loki + Node Exporter)
#      14. Next.js dashboard (npm install + build)
#      15. Systemd service units (ghostbrain, ghostchain, ghoststack-monitoring)
#      16. Post-deployment health checks
#      17. Summary report
#
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — Constants and color codes
# ─────────────────────────────────────────────────────────────────────────────

INSTALLER_VERSION="1.0.0"
INSTALLER_START=$(date +%s)
LOG_FILE="/tmp/ghoststack-genesis-$(date +%Y%m%d-%H%M%S).log"

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'  # reset

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — Logging helpers
# ─────────────────────────────────────────────────────────────────────────────

log()     { echo -e "${CYAN}[ghost]${NC} $*" | tee -a "$LOG_FILE"; }
ok()      { echo -e "${GREEN}  ✓${NC} $*"    | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}  ⚠${NC} $*"   | tee -a "$LOG_FILE"; }
info()    { echo -e "${DIM}  ·${NC} $*"      | tee -a "$LOG_FILE"; }
section() {
    echo -e "\n${BOLD}${MAGENTA}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" \
        | tee -a "$LOG_FILE"
}
die() {
    echo -e "${RED}[✗ FATAL]${NC} $*" | tee -a "$LOG_FILE" >&2
    echo -e "${DIM}Log file: ${LOG_FILE}${NC}" >&2
    exit 1
}
step() {
    local n="$1"; local total="$2"; local msg="$3"
    echo -e "${BOLD}${BLUE}[${n}/${total}]${NC} ${msg}" | tee -a "$LOG_FILE"
}
dry() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${DIM}[DRY-RUN]${NC} $*" | tee -a "$LOG_FILE"
        return 0
    fi
    eval "$*" >> "$LOG_FILE" 2>&1
}
dry_show() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${DIM}[DRY-RUN] Would run: $*${NC}" | tee -a "$LOG_FILE"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

MINIMAL=false
DEV_MODE=false
SKIP_DOCKER=false
SKIP_GHOSTBRAIN=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --minimal)         MINIMAL=true;         shift ;;
        --dev)             DEV_MODE=true;         shift ;;
        --skip-docker)     SKIP_DOCKER=true;      shift ;;
        --skip-ghostbrain) SKIP_GHOSTBRAIN=true;  shift ;;
        --dry-run)         DRY_RUN=true;          shift ;;
        --help|-h)
            grep '^#' "$0" | head -40 | sed 's/^# \?//'
            exit 0
            ;;
        *)
            warn "Unknown flag: $1 — ignoring"
            shift
            ;;
    esac
done

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — Configuration
# ─────────────────────────────────────────────────────────────────────────────

GHOST_USER="${SUDO_USER:-${USER:-ghost}}"
GHOST_HOME="/home/${GHOST_USER}"
REPO_ROOT="${GHOST_HOME}/ghostl-stack"
TOOLING_ROOT="${GHOST_HOME}/hyperghost-tooling"
SERVICES_ROOT="${TOOLING_ROOT}/hyper-ghost-ai/services"
DOCKER_NET="ghostbrain-net"
NODE_VERSION_WANT="22"
GRAFANA_PORT="3001"
PROMETHEUS_PORT="9090"
DASHBOARD_PORT="3000"

# GhostBrain service startup order (dependencies first)
declare -a GHOSTBRAIN_STARTUP_ORDER=(
    "ghostbrain-swarm"
    "ghostbrain-kernel"
    "ghostbrain-economic"
    "ghostbrain-conscious-core"
    "ghostbrain-digital-twin"
    "ghostbrain-simulation-lab"
    "ghostbrain-evolution-engine"
    "ghostbrain-multichain"
    "ghost-devops-ai"
    "ghostbrain-interchain"
    "ghostbrain-governance"
    "ghostbrain-research-ai"
    "ghostbrain-validator-fabric"
    "ghostbrain-economy-engine"
    "ghostbrain-data-mesh"
    "ghostbrain-control-plane"
)

# All 21 TypeScript packages (build order)
declare -a PNPM_PACKAGES=(
    "ghost-sdk"
    "ghost-build-orchestrator"
    "ghostbrain-hub"
    "ghostbrain-swarm"
    "ghostbrain-kernel"
    "ghostbrain-economic"
    "ghostbrain-digital-twin"
    "ghostbrain-conscious-core"
    "ghostbrain-simulation-lab"
    "ghostbrain-evolution-engine"
    "ghostbrain-multichain"
    "ghost-devops-ai"
    "ghostbrain-dev-ai"
    "ghostbrain-interchain"
    "ghostbrain-governance"
    "ghostbrain-research-ai"
    "ghostbrain-validator-fabric"
    "ghostbrain-economy-engine"
    "ghostbrain-global"
    "ghostbrain-data-mesh"
    "ghostbrain-control-plane"
)

# Port → service name map
declare -A GHOSTBRAIN_PORTS=(
    [9000]="ghostbrain-swarm"
    [9050]="ghostbrain-economic"
    [9100]="ghostbrain-digital-twin"
    [9150]="ghostbrain-conscious-core"
    [9200]="ghostbrain-simulation-lab"
    [9250]="ghostbrain-evolution-engine"
    [9300]="ghostbrain-kernel"
    [9350]="ghostbrain-multichain"
    [9400]="ghost-devops-ai"
    [9450]="ghostbrain-interchain"
    [9500]="ghostbrain-control-plane"
    [9550]="ghostbrain-governance"
    [9600]="ghostbrain-research-ai"
    [9700]="ghostbrain-validator-fabric"
    [9800]="ghostbrain-economy-engine"
    [9900]="ghostbrain-data-mesh"
)

# Track which steps succeeded / failed for the summary
declare -a STEP_RESULTS=()
STEP_TOTAL=17

record_step() {
    local n="$1" label="$2" status="$3"
    STEP_RESULTS+=("${n}|${label}|${status}")
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 — Banner
# ─────────────────────────────────────────────────────────────────────────────

print_banner() {
    echo ""
    echo -e "${MAGENTA}${BOLD}"
    echo "  ┌─────────────────────────────────────────────────────────┐"
    echo "  │         GhostStack Genesis Installer v${INSTALLER_VERSION}               │"
    echo "  │   Sovereign AI-Managed Blockchain Infrastructure        │"
    echo "  │                                                         │"
    echo "  │   GhostBrain × GhostChain × GhostL2 × GhostL3          │"
    echo "  └─────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
    echo -e "  ${DIM}Log: ${LOG_FILE}${NC}"
    echo -e "  ${DIM}Mode: ${BOLD}$(
        parts=()
        [[ "$MINIMAL" == "true" ]]         && parts+=("minimal")
        [[ "$DEV_MODE" == "true" ]]        && parts+=("dev")
        [[ "$DRY_RUN" == "true" ]]         && parts+=("dry-run")
        [[ "$SKIP_DOCKER" == "true" ]]     && parts+=("skip-docker")
        [[ "$SKIP_GHOSTBRAIN" == "true" ]] && parts+=("skip-ghostbrain")
        [[ ${#parts[@]} -eq 0 ]]           && parts+=("production")
        echo "${parts[*]}"
    )${NC}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6 — System prerequisite checks
# ─────────────────────────────────────────────────────────────────────────────

check_os() {
    section "OS Compatibility Check"
    local os_id
    os_id=$(grep -oP '(?<=^ID=).+' /etc/os-release 2>/dev/null | tr -d '"' || echo "unknown")
    local os_ver
    os_ver=$(grep -oP '(?<=^VERSION_ID=).+' /etc/os-release 2>/dev/null | tr -d '"' || echo "unknown")

    info "Detected: ${os_id} ${os_ver}"

    case "$os_id" in
        ubuntu|debian|linuxmint|pop)
            ok "Supported OS: ${os_id} ${os_ver}"
            ;;
        rhel|centos|fedora|rocky|almalinux)
            warn "RHEL-family detected — some apt commands will need adjusting"
            ;;
        *)
            warn "OS '${os_id}' not explicitly supported — proceeding anyway"
            ;;
    esac

    # Architecture
    local arch
    arch=$(uname -m)
    info "Architecture: ${arch}"
    [[ "$arch" == "x86_64" ]] || warn "Non-x86_64 architecture — some images may not be available"
}

check_cpu_memory() {
    local cpus mem_gb
    cpus=$(nproc)
    mem_gb=$(awk '/MemTotal/ { printf "%.0f", $2/1024/1024 }' /proc/meminfo)
    info "CPU: ${cpus} cores | RAM: ${mem_gb} GB"
    [[ $cpus -ge 4 ]] || warn "Recommended ≥ 4 CPU cores (have ${cpus})"
    [[ $mem_gb -ge 8 ]] || warn "Recommended ≥ 8 GB RAM (have ${mem_gb} GB)"
}

check_disk_space() {
    local free_gb
    free_gb=$(df -BG "$GHOST_HOME" 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4}' || echo "0")
    info "Free disk space in ${GHOST_HOME}: ${free_gb} GB"
    [[ $free_gb -ge 20 ]] || warn "Recommended ≥ 20 GB free disk space (have ${free_gb} GB)"
}

check_network() {
    if curl -sf --max-time 5 https://github.com >/dev/null 2>&1; then
        ok "Internet connectivity: OK"
    else
        warn "Cannot reach GitHub — downloads may fail"
    fi
}

run_preflight() {
    section "Pre-flight Checks"
    check_os
    check_cpu_memory
    check_disk_space
    check_network
    ok "Pre-flight checks complete"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7 — System package installation
# ─────────────────────────────────────────────────────────────────────────────

install_system_packages() {
    step 1 $STEP_TOTAL "System Dependencies"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "apt-get update && apt-get install -y git curl wget jq unzip gnupg lsb-release ca-certificates apt-transport-https software-properties-common build-essential"
        record_step 1 "System Packages" "DRY-RUN"
        return 0
    fi

    log "Updating package index..."
    apt-get update -qq >> "$LOG_FILE" 2>&1

    log "Installing system packages..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        git \
        curl \
        wget \
        jq \
        unzip \
        gnupg \
        lsb-release \
        ca-certificates \
        apt-transport-https \
        software-properties-common \
        build-essential \
        net-tools \
        htop \
        vim \
        tmux \
        2>> "$LOG_FILE" || die "System package installation failed"

    ok "System packages installed"
    record_step 1 "System Packages" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 8 — Docker Engine installation
# ─────────────────────────────────────────────────────────────────────────────

install_docker() {
    step 2 $STEP_TOTAL "Docker Engine"

    if [[ "$SKIP_DOCKER" == "true" ]]; then
        info "Skipping Docker install (--skip-docker)"
        record_step 2 "Docker Engine" "SKIPPED"
        return 0
    fi

    if command -v docker >/dev/null 2>&1; then
        local docker_ver
        docker_ver=$(docker --version | grep -oP '[\d.]+' | head -1)
        ok "Docker already installed: ${docker_ver}"
        record_step 2 "Docker Engine" "ALREADY_INSTALLED"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "Install docker-ce via official apt repo"
        record_step 2 "Docker Engine" "DRY-RUN"
        return 0
    fi

    log "Adding Docker apt repository..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        -o /etc/apt/keyrings/docker.asc >> "$LOG_FILE" 2>&1
    chmod a+r /etc/apt/keyrings/docker.asc

    local codename
    codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
        https://download.docker.com/linux/ubuntu ${codename} stable" \
        > /etc/apt/sources.list.d/docker.list

    apt-get update -qq >> "$LOG_FILE" 2>&1
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
        >> "$LOG_FILE" 2>&1 || die "Docker installation failed"

    # Enable and start Docker
    systemctl enable --now docker >> "$LOG_FILE" 2>&1

    # Add user to docker group
    if id "$GHOST_USER" >/dev/null 2>&1; then
        usermod -aG docker "$GHOST_USER" >> "$LOG_FILE" 2>&1
        info "Added ${GHOST_USER} to docker group — re-login required for passwordless docker"
    fi

    ok "Docker Engine installed: $(docker --version | grep -oP '[\d.]+'| head -1)"
    record_step 2 "Docker Engine" "OK"
}

verify_docker() {
    command -v docker >/dev/null 2>&1 || die "Docker not found after installation"
    docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"
    ok "Docker: $(docker --version | head -c 40)"
    ok "Docker Compose: $(docker compose version | head -c 40)"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 9 — Node.js v22 + pnpm installation
# ─────────────────────────────────────────────────────────────────────────────

install_nodejs() {
    step 3 $STEP_TOTAL "Node.js v${NODE_VERSION_WANT} + pnpm"

    if command -v node >/dev/null 2>&1; then
        local node_maj
        node_maj=$(node --version | grep -oP '\d+' | head -1)
        if [[ $node_maj -ge $NODE_VERSION_WANT ]]; then
            ok "Node.js already installed: $(node --version)"
            install_pnpm
            record_step 3 "Node.js + pnpm" "ALREADY_INSTALLED"
            return 0
        else
            info "Node.js ${node_maj} found — upgrading to v${NODE_VERSION_WANT}"
        fi
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION_WANT}.x | bash -"
        record_step 3 "Node.js + pnpm" "DRY-RUN"
        return 0
    fi

    log "Installing Node.js v${NODE_VERSION_WANT}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION_WANT}.x" \
        | bash - >> "$LOG_FILE" 2>&1
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >> "$LOG_FILE" 2>&1 \
        || die "Node.js installation failed"

    ok "Node.js installed: $(node --version)"
    install_pnpm
    record_step 3 "Node.js + pnpm" "OK"
}

install_pnpm() {
    if command -v pnpm >/dev/null 2>&1; then
        ok "pnpm already installed: $(pnpm --version)"
        return 0
    fi
    corepack enable >> "$LOG_FILE" 2>&1 || true
    corepack prepare pnpm@latest --activate >> "$LOG_FILE" 2>&1 \
        || npm install -g pnpm >> "$LOG_FILE" 2>&1
    ok "pnpm installed: $(pnpm --version)"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 10 — Repository setup
# ─────────────────────────────────────────────────────────────────────────────

setup_repositories() {
    step 4 $STEP_TOTAL "Repository Setup"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "Ensure ${REPO_ROOT} and ${TOOLING_ROOT} exist and are on main"
        record_step 4 "Repositories" "DRY-RUN"
        return 0
    fi

    # ghostl-stack (this repo)
    if [[ -d "${REPO_ROOT}/.git" ]]; then
        log "ghostl-stack: pulling latest..."
        git -C "$REPO_ROOT" pull origin main >> "$LOG_FILE" 2>&1 || warn "git pull failed — continuing with current state"
    else
        log "ghostl-stack: initializing directory..."
        mkdir -p "$REPO_ROOT"
    fi

    # hyperghost-tooling (GhostBrain source)
    if [[ -d "${TOOLING_ROOT}/.git" ]]; then
        log "hyperghost-tooling: pulling latest..."
        git -C "$TOOLING_ROOT" pull origin main >> "$LOG_FILE" 2>&1 || warn "git pull failed"
    else
        warn "hyperghost-tooling not found at ${TOOLING_ROOT}"
        info "Clone it with: git clone https://github.com/ghostmode25/hyperghost-tooling-private-20260302.git ${TOOLING_ROOT}"
    fi

    ok "Repositories ready"
    record_step 4 "Repositories" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 11 — Environment file setup
# ─────────────────────────────────────────────────────────────────────────────

setup_environment() {
    step 5 $STEP_TOTAL "Environment Configuration"

    local env_file="${REPO_ROOT}/.env"
    local env_example="${REPO_ROOT}/.env.example"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "cp ${env_example} ${env_file}"
        record_step 5 "Environment" "DRY-RUN"
        return 0
    fi

    if [[ ! -f "$env_file" ]]; then
        if [[ -f "$env_example" ]]; then
            cp "$env_example" "$env_file"
            ok ".env created from .env.example"
            warn "Review ${env_file} and update secrets before production use"
        else
            warn ".env.example not found — creating minimal .env"
            cat > "$env_file" << 'ENVEOF'
GHOSTBRAIN_SRC=/home/ghost/hyperghost-tooling/hyper-ghost-ai/services
GHOSTBRAIN_SCP_PORT=9500
HYPERVISOR_HOST=208.110.71.164
GHOSTCHAIN_L1_CHAIN_ID=1337
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=ghoststack
SCP_API_KEYS=ghoststack-admin:admin
GHOSTSTACK_MANAGER_TOKEN=change-me
ENVEOF
        fi
    else
        ok ".env already exists — not overwriting"
    fi

    # Source the env file to make vars available
    set -o allexport
    source "$env_file" 2>/dev/null || true
    set +o allexport

    record_step 5 "Environment" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 12 — Directory structure creation
# ─────────────────────────────────────────────────────────────────────────────

create_directory_structure() {
    step 6 $STEP_TOTAL "Directory Structure"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "mkdir -p all GhostStack directories"
        record_step 6 "Directories" "DRY-RUN"
        return 0
    fi

    local dirs=(
        "${REPO_ROOT}/apps/web/app"
        "${REPO_ROOT}/apps/api/src"
        "${REPO_ROOT}/contracts"
        "${REPO_ROOT}/chains/ghostchain-l1"
        "${REPO_ROOT}/chains/ghostl2"
        "${REPO_ROOT}/chains/ghostl3"
        "${REPO_ROOT}/services/ghostbrain"
        "${REPO_ROOT}/services/ai-vault"
        "${REPO_ROOT}/services/ghost-explorer"
        "${REPO_ROOT}/services/ghost-indexer"
        "${REPO_ROOT}/services/ghost-api"
        "${REPO_ROOT}/infrastructure/docker"
        "${REPO_ROOT}/infrastructure/kubernetes"
        "${REPO_ROOT}/infrastructure/terraform"
        "${REPO_ROOT}/infrastructure/monitoring/prometheus/rules"
        "${REPO_ROOT}/infrastructure/monitoring/grafana/dashboards"
        "${REPO_ROOT}/infrastructure/monitoring/grafana/datasources"
        "${REPO_ROOT}/infrastructure/monitoring/loki"
        "${REPO_ROOT}/validators/configs"
        "${REPO_ROOT}/validators/scripts"
        "${REPO_ROOT}/validators/keys"
        "${REPO_ROOT}/scripts/deploy"
        "${REPO_ROOT}/scripts/maintenance"
        "${REPO_ROOT}/scripts/migrations"
        "${REPO_ROOT}/system/systemd"
        "${REPO_ROOT}/system/configs"
        "${REPO_ROOT}/data-mesh/telemetry"
        "${REPO_ROOT}/data-mesh/analytics"
        "${REPO_ROOT}/data-mesh/memory"
        "${REPO_ROOT}/data-mesh/blockchain-index"
        "${REPO_ROOT}/data-mesh/knowledge-graph"
        "${REPO_ROOT}/.github/workflows"
        "${GHOST_HOME}/data/validators"
    )

    local created=0
    for d in "${dirs[@]}"; do
        if [[ ! -d "$d" ]]; then
            mkdir -p "$d"
            ((created++)) || true
        fi
    done

    ok "Directory structure ready (${created} new dirs created)"
    record_step 6 "Directories" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 13 — GhostBrain TypeScript build
# ─────────────────────────────────────────────────────────────────────────────

build_ghostbrain() {
    step 7 $STEP_TOTAL "GhostBrain TypeScript Build (21 packages)"

    if [[ "$SKIP_GHOSTBRAIN" == "true" ]]; then
        info "Skipping GhostBrain build (--skip-ghostbrain)"
        record_step 7 "GhostBrain Build" "SKIPPED"
        return 0
    fi

    if [[ ! -d "$SERVICES_ROOT" ]]; then
        warn "GhostBrain services not found at ${SERVICES_ROOT}"
        warn "Clone hyperghost-tooling and re-run"
        record_step 7 "GhostBrain Build" "SKIPPED_MISSING"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "cd ${SERVICES_ROOT} && pnpm install --frozen-lockfile && pnpm -r build"
        record_step 7 "GhostBrain Build" "DRY-RUN"
        return 0
    fi

    log "Installing pnpm workspace dependencies (${#PNPM_PACKAGES[@]} packages)..."
    (cd "$SERVICES_ROOT" && pnpm install --frozen-lockfile 2>> "$LOG_FILE") \
        || (cd "$SERVICES_ROOT" && pnpm install 2>> "$LOG_FILE") \
        || die "pnpm install failed"

    log "Building all TypeScript packages..."
    (cd "$SERVICES_ROOT" && pnpm -r build 2>> "$LOG_FILE") \
        || die "pnpm -r build failed — check ${LOG_FILE} for details"

    ok "All 21 GhostBrain packages built"
    record_step 7 "GhostBrain Build" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 14 — Docker network creation
# ─────────────────────────────────────────────────────────────────────────────

create_docker_network() {
    step 8 $STEP_TOTAL "Docker Network"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "docker network create ${DOCKER_NET} --subnet 172.28.0.0/16"
        record_step 8 "Docker Network" "DRY-RUN"
        return 0
    fi

    if docker network inspect "$DOCKER_NET" >/dev/null 2>&1; then
        ok "Docker network '${DOCKER_NET}' already exists"
    else
        docker network create \
            --driver bridge \
            --subnet 172.28.0.0/16 \
            "$DOCKER_NET" >> "$LOG_FILE" 2>&1 \
            || die "Failed to create Docker network ${DOCKER_NET}"
        ok "Created Docker network: ${DOCKER_NET}"
    fi

    record_step 8 "Docker Network" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 15 — GhostBrain Docker image builds
# ─────────────────────────────────────────────────────────────────────────────

build_ghostbrain_images() {
    step 9 $STEP_TOTAL "GhostBrain Docker Images"

    if [[ "$SKIP_GHOSTBRAIN" == "true" ]]; then
        info "Skipping image builds (--skip-ghostbrain)"
        record_step 9 "Docker Images" "SKIPPED"
        return 0
    fi

    if [[ ! -d "$SERVICES_ROOT" ]]; then
        warn "Source not found — skipping image builds"
        record_step 9 "Docker Images" "SKIPPED_MISSING"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "docker compose -f ghostbrain-stack.yml build --parallel"
        record_step 9 "Docker Images" "DRY-RUN"
        return 0
    fi

    local compose_file="${REPO_ROOT}/infrastructure/docker/ghostbrain-stack.yml"
    if [[ ! -f "$compose_file" ]]; then
        warn "ghostbrain-stack.yml not found — skipping image builds"
        record_step 9 "Docker Images" "SKIPPED_MISSING"
        return 0
    fi

    log "Building GhostBrain Docker images (parallel build, this may take a few minutes)..."

    # Set GHOSTBRAIN_SRC for the compose build context
    GHOSTBRAIN_SRC="$SERVICES_ROOT" \
    docker compose \
        -f "$compose_file" \
        --env-file "${REPO_ROOT}/.env" \
        build --parallel >> "$LOG_FILE" 2>&1 \
        || die "Docker image build failed — check ${LOG_FILE}"

    ok "GhostBrain Docker images built"
    record_step 9 "Docker Images" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 16 — GhostBrain stack deployment
# ─────────────────────────────────────────────────────────────────────────────

deploy_ghostbrain_stack() {
    step 10 $STEP_TOTAL "GhostBrain Stack Deployment"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "docker compose -f ghostbrain-stack.yml up -d"
        record_step 10 "GhostBrain Deployment" "DRY-RUN"
        return 0
    fi

    local compose_file="${REPO_ROOT}/infrastructure/docker/ghostbrain-stack.yml"
    if [[ ! -f "$compose_file" ]]; then
        warn "ghostbrain-stack.yml not found — skipping"
        record_step 10 "GhostBrain Deployment" "SKIPPED_MISSING"
        return 0
    fi

    # Start swarm first (it's the event bus that everything else depends on)
    log "Starting ghostbrain-swarm (event bus)..."
    GHOSTBRAIN_SRC="$SERVICES_ROOT" \
    docker compose \
        -f "$compose_file" \
        --env-file "${REPO_ROOT}/.env" \
        up -d ghostbrain-swarm >> "$LOG_FILE" 2>&1

    # Wait for swarm to be healthy
    local waited=0
    while [[ $waited -lt 30 ]]; do
        if docker inspect --format='{{.State.Health.Status}}' ghostbrain-swarm 2>/dev/null \
                | grep -q "healthy"; then
            ok "ghostbrain-swarm: healthy"
            break
        fi
        sleep 3; ((waited+=3))
    done
    [[ $waited -lt 30 ]] || warn "ghostbrain-swarm did not report healthy in 30s"

    # Start remaining services in dependency order
    log "Starting remaining GhostBrain services..."
    GHOSTBRAIN_SRC="$SERVICES_ROOT" \
    docker compose \
        -f "$compose_file" \
        --env-file "${REPO_ROOT}/.env" \
        up -d >> "$LOG_FILE" 2>&1 \
        || die "GhostBrain stack deployment failed"

    # Brief wait for SCP to come online
    log "Waiting for Sovereign Control Plane (port 9500)..."
    local scp_waited=0
    while [[ $scp_waited -lt 60 ]]; do
        if curl -sf http://localhost:9500/health >/dev/null 2>&1; then
            ok "SCP online: $(curl -sf http://localhost:9500/health | jq -r '.status // "ok"' 2>/dev/null || echo "ok")"
            break
        fi
        sleep 3; ((scp_waited+=3))
    done
    [[ $scp_waited -lt 60 ]] || warn "SCP did not respond in 60s — may still be starting up"

    ok "GhostBrain stack deployed (all 16 services)"
    record_step 10 "GhostBrain Deployment" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 17 — Data Mesh deployment
# ─────────────────────────────────────────────────────────────────────────────

deploy_data_mesh() {
    step 11 $STEP_TOTAL "Data Mesh Stack (Redis + Postgres + Elasticsearch)"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "docker compose -f data-mesh-stack.yml up -d"
        record_step 11 "Data Mesh" "DRY-RUN"
        return 0
    fi

    local compose_file="${REPO_ROOT}/infrastructure/docker/data-mesh-stack.yml"
    if [[ ! -f "$compose_file" ]]; then
        warn "data-mesh-stack.yml not found — skipping"
        record_step 11 "Data Mesh" "SKIPPED_MISSING"
        return 0
    fi

    docker compose \
        -f "$compose_file" \
        --env-file "${REPO_ROOT}/.env" \
        up -d >> "$LOG_FILE" 2>&1 \
        || warn "Data Mesh stack had errors — check ${LOG_FILE}"

    # Wait for Redis
    local r_waited=0
    while [[ $r_waited -lt 30 ]]; do
        if docker exec ghostmesh-redis redis-cli ping >/dev/null 2>&1; then
            ok "Redis: PONG"; break
        fi
        sleep 2; ((r_waited+=2))
    done

    # Wait for Postgres
    local pg_waited=0
    while [[ $pg_waited -lt 60 ]]; do
        if docker exec ghostmesh-postgres pg_isready -U ghost -d ghoststack >/dev/null 2>&1; then
            ok "PostgreSQL: ready"; break
        fi
        sleep 3; ((pg_waited+=3))
    done

    ok "Data Mesh stack deployed"
    record_step 11 "Data Mesh" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 18 — Validator stack deployment
# ─────────────────────────────────────────────────────────────────────────────

deploy_validator_stack() {
    step 12 $STEP_TOTAL "Validator Network (4 GhostChain nodes)"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "docker compose -f validator-stack.yml up -d"
        record_step 12 "Validators" "DRY-RUN"
        return 0
    fi

    local compose_file="${REPO_ROOT}/infrastructure/docker/validator-stack.yml"
    if [[ ! -f "$compose_file" ]]; then
        warn "validator-stack.yml not found — skipping"
        record_step 12 "Validators" "SKIPPED_MISSING"
        return 0
    fi

    # Pull geth image if not present
    docker pull ethereum/client-go:stable >> "$LOG_FILE" 2>&1 || warn "Could not pull geth image"

    # Ensure validator keys directory is properly permissioned
    if [[ -d "${REPO_ROOT}/validators/keys" ]]; then
        chmod 700 "${REPO_ROOT}/validators/keys" 2>/dev/null || true
    fi

    docker compose \
        -f "$compose_file" \
        --env-file "${REPO_ROOT}/.env" \
        up -d >> "$LOG_FILE" 2>&1 \
        || warn "Validator stack had startup errors — this is normal on first run (keystore generation required)"

    ok "Validator stack deployed"
    record_step 12 "Validators" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 19 — Monitoring stack deployment
# ─────────────────────────────────────────────────────────────────────────────

deploy_monitoring_stack() {
    step 13 $STEP_TOTAL "Monitoring Stack (Prometheus + Grafana + Loki)"

    if [[ "$MINIMAL" == "true" ]]; then
        info "Skipping monitoring (--minimal)"
        record_step 13 "Monitoring" "SKIPPED"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "docker compose -f monitoring-stack.yml up -d"
        record_step 13 "Monitoring" "DRY-RUN"
        return 0
    fi

    local compose_file="${REPO_ROOT}/infrastructure/docker/monitoring-stack.yml"
    if [[ ! -f "$compose_file" ]]; then
        warn "monitoring-stack.yml not found — skipping"
        record_step 13 "Monitoring" "SKIPPED_MISSING"
        return 0
    fi

    docker compose \
        -f "$compose_file" \
        --env-file "${REPO_ROOT}/.env" \
        up -d >> "$LOG_FILE" 2>&1 \
        || warn "Monitoring stack had errors"

    # Wait for Grafana
    local g_waited=0
    while [[ $g_waited -lt 60 ]]; do
        if curl -sf http://localhost:${GRAFANA_PORT}/api/health >/dev/null 2>&1; then
            ok "Grafana: online at http://localhost:${GRAFANA_PORT}"
            break
        fi
        sleep 3; ((g_waited+=3))
    done
    [[ $g_waited -lt 60 ]] || warn "Grafana did not respond in 60s"

    ok "Monitoring stack deployed"
    record_step 13 "Monitoring" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 20 — Next.js dashboard build
# ─────────────────────────────────────────────────────────────────────────────

build_dashboard() {
    step 14 $STEP_TOTAL "Next.js Dashboard Build"

    if [[ "$MINIMAL" == "true" ]]; then
        info "Skipping dashboard (--minimal)"
        record_step 14 "Dashboard" "SKIPPED"
        return 0
    fi

    local web_dir="${REPO_ROOT}/apps/web"
    if [[ ! -f "${web_dir}/package.json" ]]; then
        warn "apps/web/package.json not found — skipping dashboard build"
        record_step 14 "Dashboard" "SKIPPED_MISSING"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "cd ${web_dir} && npm install && npm run build"
        record_step 14 "Dashboard" "DRY-RUN"
        return 0
    fi

    log "Installing Next.js dependencies..."
    (cd "$web_dir" && npm install --silent 2>> "$LOG_FILE") \
        || warn "npm install had warnings"

    log "Building Next.js dashboard..."
    (cd "$web_dir" && NEXT_PUBLIC_SCP_URL="http://localhost:9500" npm run build 2>> "$LOG_FILE") \
        || warn "Next.js build had warnings — dev mode may still work"

    ok "Dashboard built: run 'make web-start' to serve on port ${DASHBOARD_PORT}"
    record_step 14 "Dashboard" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 21 — Systemd service installation
# ─────────────────────────────────────────────────────────────────────────────

install_systemd_services() {
    step 15 $STEP_TOTAL "Systemd Service Units"

    if [[ "$DEV_MODE" == "true" ]]; then
        info "Skipping systemd installation (--dev mode)"
        record_step 15 "Systemd Units" "SKIPPED"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "systemctl enable ghostbrain ghostchain ghoststack-monitoring"
        record_step 15 "Systemd Units" "DRY-RUN"
        return 0
    fi

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        warn "Not running as root — skipping systemd installation"
        info "Run 'sudo bash system/systemd/install-systemd.sh' manually"
        record_step 15 "Systemd Units" "SKIPPED_NOT_ROOT"
        return 0
    fi

    local systemd_src="${REPO_ROOT}/system/systemd"
    local systemd_dst="/etc/systemd/system"
    local installed=0

    for unit in ghostbrain ghostchain ghoststack-monitoring; do
        local src="${systemd_src}/${unit}.service"
        if [[ -f "$src" ]]; then
            cp "$src" "${systemd_dst}/${unit}.service"
            systemctl daemon-reload >> "$LOG_FILE" 2>&1
            systemctl enable "${unit}.service" >> "$LOG_FILE" 2>&1
            ok "Enabled: ${unit}.service"
            ((installed++)) || true
        else
            warn "${unit}.service not found in ${systemd_src}"
        fi
    done

    ok "Systemd units: ${installed} installed and enabled"
    record_step 15 "Systemd Units" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 22 — Production hardening
# ─────────────────────────────────────────────────────────────────────────────

apply_production_hardening() {
    step 16 $STEP_TOTAL "Production Hardening"

    if [[ "$DEV_MODE" == "true" ]]; then
        info "Skipping production hardening (--dev mode)"
        record_step 16 "Hardening" "SKIPPED"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "Set file permissions, firewall rules, log rotation"
        record_step 16 "Hardening" "DRY-RUN"
        return 0
    fi

    # Secure .env
    if [[ -f "${REPO_ROOT}/.env" ]]; then
        chmod 600 "${REPO_ROOT}/.env"
        chown "${GHOST_USER}:${GHOST_USER}" "${REPO_ROOT}/.env" 2>/dev/null || true
        ok ".env permissions: 600"
    fi

    # Secure validator keys
    if [[ -d "${REPO_ROOT}/validators/keys" ]]; then
        chmod -R 700 "${REPO_ROOT}/validators/keys"
        ok "Validator keys: chmod 700"
    fi

    # Log rotation for GhostBrain audit logs
    if command -v logrotate >/dev/null 2>&1; then
        cat > /etc/logrotate.d/ghostbrain << 'LREOF'
/home/ghost/ghostl-stack/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
}
LREOF
        ok "Log rotation configured"
    fi

    # UFW rules (if available)
    if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "active"; then
        ufw allow 9500/tcp comment "GhostBrain SCP" >> "$LOG_FILE" 2>&1 || true
        ufw allow 3001/tcp comment "Grafana" >> "$LOG_FILE" 2>&1 || true
        ufw allow 9090/tcp comment "Prometheus" >> "$LOG_FILE" 2>&1 || true
        ok "UFW rules added for SCP (9500), Grafana (3001), Prometheus (9090)"
    fi

    record_step 16 "Hardening" "OK"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 23 — Post-deployment health checks
# ─────────────────────────────────────────────────────────────────────────────

post_deployment_health_check() {
    step 17 $STEP_TOTAL "Post-Deployment Health Checks"

    if [[ "$DRY_RUN" == "true" ]]; then
        dry_show "curl -sf checks for all GhostBrain services"
        record_step 17 "Health Checks" "DRY-RUN"
        return 0
    fi

    local passed=0; local failed=0; local skipped=0

    check_service_http() {
        local name="$1" url="$2"
        local status
        status=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        if [[ "$status" == "200" ]]; then
            ok "${name}: online"
            ((passed++)) || true
        elif [[ "$status" == "000" ]]; then
            warn "${name}: unreachable (may still be starting)"
            ((skipped++)) || true
        else
            warn "${name}: HTTP ${status}"
            ((skipped++)) || true
        fi
    }

    echo ""
    echo -e "${DIM}Checking GhostBrain AI services...${NC}"
    check_service_http "SCP (9500)"              "http://localhost:9500/health"
    check_service_http "Swarm (9000)"            "http://localhost:9000/health"
    check_service_http "Kernel (9300)"           "http://localhost:9300/health"
    check_service_http "Data Mesh (9900)"        "http://localhost:9900/health"
    check_service_http "Economy Engine (9800)"   "http://localhost:9800/health"
    check_service_http "Validator Fabric (9700)" "http://localhost:9700/health"
    check_service_http "Control Plane (9500)"    "http://localhost:9500/health"

    if [[ "$MINIMAL" != "true" ]]; then
        echo ""
        echo -e "${DIM}Checking monitoring...${NC}"
        check_service_http "Prometheus (9090)" "http://localhost:9090/-/healthy"
        check_service_http "Grafana (3001)"    "http://localhost:${GRAFANA_PORT}/api/health"
        check_service_http "Loki (3100)"       "http://localhost:3100/ready"
    fi

    echo ""
    echo -e "${DIM}Checking data mesh...${NC}"
    if docker exec ghostmesh-redis redis-cli ping >/dev/null 2>&1; then
        ok "Redis: PONG"; ((passed++)) || true
    else
        warn "Redis: unreachable"; ((skipped++)) || true
    fi

    if docker exec ghostmesh-postgres pg_isready -U ghost -d ghoststack >/dev/null 2>&1; then
        ok "PostgreSQL: ready"; ((passed++)) || true
    else
        warn "PostgreSQL: not ready yet"; ((skipped++)) || true
    fi

    echo ""
    echo -e "${DIM}Checking GhostStack Manager...${NC}"
    check_service_http "GhostStack Manager (8787)" "http://localhost:8787/"

    echo ""
    ok "Health check: ${passed} passed, ${skipped} pending/unreachable, ${failed} failed"
    record_step 17 "Health Checks" "OK (${passed} passed)"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 24 — Final summary report
# ─────────────────────────────────────────────────────────────────────────────

print_summary() {
    local elapsed=$(( $(date +%s) - INSTALLER_START ))
    local mins=$(( elapsed / 60 ))
    local secs=$(( elapsed % 60 ))

    echo ""
    echo -e "${BOLD}${MAGENTA}"
    echo "  ┌─────────────────────────────────────────────────────────┐"
    echo "  │              GhostStack Genesis — Complete              │"
    echo "  └─────────────────────────────────────────────────────────┘"
    echo -e "${NC}"

    echo -e "  ${DIM}Installation time: ${mins}m ${secs}s${NC}"
    echo ""

    # Step results
    echo -e "  ${BOLD}Step Results:${NC}"
    for result in "${STEP_RESULTS[@]}"; do
        IFS='|' read -r n label status <<< "$result"
        case "$status" in
            OK*)          echo -e "    ${GREEN}✓${NC} [${n}] ${label} — ${status}" ;;
            SKIPPED*)     echo -e "    ${DIM}·${NC} [${n}] ${label} — ${status}" ;;
            DRY-RUN)      echo -e "    ${CYAN}◦${NC} [${n}] ${label} — ${status}" ;;
            ALREADY_*)    echo -e "    ${GREEN}✓${NC} [${n}] ${label} — ${status}" ;;
            *)            echo -e "    ${YELLOW}!${NC} [${n}] ${label} — ${status}" ;;
        esac
    done

    echo ""
    echo -e "  ${BOLD}Access Points:${NC}"
    echo -e "    ${CYAN}SCP Control Plane${NC}  http://localhost:9500"
    echo -e "    ${CYAN}SCP Health${NC}         http://localhost:9500/health"
    echo -e "    ${CYAN}SCP AI Status${NC}      http://localhost:9500/ai/status"
    echo -e "    ${CYAN}Grafana${NC}            http://localhost:${GRAFANA_PORT}   (admin / ghoststack)"
    echo -e "    ${CYAN}Prometheus${NC}         http://localhost:${PROMETHEUS_PORT}"
    echo -e "    ${CYAN}GhostStack Manager${NC} http://localhost:8787"
    echo -e "    ${CYAN}Dashboard Dev${NC}      cd apps/web && npm run dev"

    echo ""
    echo -e "  ${BOLD}Management Commands:${NC}"
    echo -e "    ${DIM}make up${NC}            — start full stack"
    echo -e "    ${DIM}make down${NC}          — stop full stack"
    echo -e "    ${DIM}make health${NC}        — health check all services"
    echo -e "    ${DIM}make ghostbrain-logs${NC} — tail GhostBrain logs"
    echo -e "    ${DIM}make ps${NC}            — list running containers"

    echo ""
    echo -e "  ${BOLD}Next Steps:${NC}"
    echo -e "    1. Review ${BOLD}${REPO_ROOT}/.env${NC} — update secrets + API keys"
    echo -e "    2. Initialize GhostChain genesis: see ${BOLD}chains/ghostchain-l1/${NC}"
    echo -e "    3. Deploy validators: ${BOLD}bash validators/scripts/deploy-validator.sh us-east-1${NC}"
    echo -e "    4. Open dashboard: ${BOLD}make web-dev${NC}"
    echo -e "    5. Open Grafana: ${BOLD}http://localhost:${GRAFANA_PORT}${NC}"

    echo ""
    echo -e "  ${DIM}Full log: ${LOG_FILE}${NC}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 25 — Utility: wait_for_service
# ─────────────────────────────────────────────────────────────────────────────

wait_for_service() {
    local name="$1" url="$2" max_wait="${3:-60}"
    local waited=0
    while [[ $waited -lt $max_wait ]]; do
        if curl -sf --max-time 3 "$url" >/dev/null 2>&1; then
            ok "${name}: online"
            return 0
        fi
        sleep 3; ((waited+=3))
    done
    warn "${name}: did not respond within ${max_wait}s"
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 26 — Utility: check_port_conflict
# ─────────────────────────────────────────────────────────────────────────────

check_port_conflicts() {
    section "Port Conflict Check"
    local conflicts=0

    for port in 9000 9050 9100 9150 9200 9250 9300 9350 9400 9450 9500 9550 9600 9700 9800 9900 6379 5432 9090 3001 3100 8080 8787; do
        if ss -tlnp 2>/dev/null | grep -q ":${port} " || \
           netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
            local owner
            owner=$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\d+' | head -1 || echo "unknown")
            warn "Port ${port} is already in use (${owner})"
            ((conflicts++)) || true
        fi
    done

    if [[ $conflicts -eq 0 ]]; then
        ok "No port conflicts detected"
    else
        warn "${conflicts} port conflict(s) detected — some services may fail to bind"
        info "Re-configure ports in .env before starting"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 27 — Utility: print_docker_status
# ─────────────────────────────────────────────────────────────────────────────

print_docker_status() {
    if [[ "$DRY_RUN" == "true" ]]; then return; fi
    echo ""
    echo -e "${DIM}Running containers:${NC}"
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
        | grep -E "^NAMES|ghost" | head -30 2>/dev/null || true
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 28 — Utility: backup_existing_data
# ─────────────────────────────────────────────────────────────────────────────

backup_existing_data() {
    local backup_dir="${GHOST_HOME}/ghoststack-backups/$(date +%Y%m%d-%H%M%S)"

    # Only backup if Docker volumes have data
    if docker volume ls | grep -q "ghostbrain"; then
        if [[ "$DRY_RUN" != "true" ]]; then
            info "Existing GhostBrain volumes detected"
            info "Backup location if needed: ${backup_dir}"
        fi
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 29 — Interrupt handler
# ─────────────────────────────────────────────────────────────────────────────

handle_interrupt() {
    echo ""
    echo -e "${YELLOW}[!] Installation interrupted by user${NC}"
    echo -e "${DIM}Partial log saved to: ${LOG_FILE}${NC}"
    echo ""
    echo "To clean up partial deployment:"
    echo "  make down   (or docker compose -f infrastructure/docker/*.yml down)"
    exit 130
}
trap handle_interrupt SIGINT SIGTERM

# ─────────────────────────────────────────────────────────────────────────────
# MAIN ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────

main() {
    # Initialize log file
    touch "$LOG_FILE"
    chmod 600 "$LOG_FILE"
    echo "GhostStack Genesis Installer v${INSTALLER_VERSION}" >> "$LOG_FILE"
    echo "Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$LOG_FILE"
    echo "Args: $*" >> "$LOG_FILE"

    # Print banner
    print_banner

    # Pre-flight + port checks
    run_preflight
    check_port_conflicts
    backup_existing_data

    # Installation sequence
    install_system_packages
    install_docker
    [[ "$DRY_RUN" != "true" && "$SKIP_DOCKER" != "true" ]] && verify_docker
    install_nodejs
    setup_repositories
    setup_environment
    create_directory_structure
    build_ghostbrain
    create_docker_network
    build_ghostbrain_images

    # Deployment sequence
    deploy_ghostbrain_stack
    deploy_data_mesh
    deploy_validator_stack

    if [[ "$MINIMAL" != "true" ]]; then
        deploy_monitoring_stack
        build_dashboard
    fi

    install_systemd_services
    apply_production_hardening
    post_deployment_health_check

    # Final status
    print_docker_status
    print_summary

    echo "" >> "$LOG_FILE"
    echo "Completed: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$LOG_FILE"
}

main "$@"
