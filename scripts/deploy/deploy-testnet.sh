#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GhostChain — Deploy testnet simulation stack
#
# Installs Docker on each testnet VM (via hypervisor), clones the workspace,
# and starts the testnet services + GhostBrain AI simulation stack.
#
# VMs targeted:
#   ghostchain-testnet-l1  (10.50.10.11)  — L1 chain + AI simulation host
#   ghost-testnet-validator (10.50.10.13) — Validator node
#   ghostl2-testnet        (10.50.20.11)  — GhostL2 custom execution host
#   ghostl3-testnet        (10.50.30.11)  — GhostL3 application host
#
# Usage (run from devnet as ghost, via hypervisor jump):
#   bash scripts/deploy/deploy-testnet.sh [--vm <name>] [--dry-run]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HYPERVISOR="hypervisor"
REPO_URL="https://github.com/ghostchain1/ghostl-stack.git"
REPO_BRANCH="main"
REMOTE_DIR="/home/ghost/ghostl-stack"
DRY_RUN=false
TARGET_VM=""
TESTNET_L1_RPC="http://10.50.10.11:18545"
TESTNET_L2_RPC="http://10.50.20.11:29547"
TESTNET_L3_RPC="http://10.50.30.11:39545"

# Testnet VMs (as known by hypervisor's SSH config)
declare -A TESTNET_VMS=(
    ["ghostchain-testnet-l1"]="L1 chain simulation host"
    ["ghost-testnet-validator"]="Validator simulation node"
    ["ghostl2-testnet"]="GhostL2 custom execution simulation"
    ["ghostl3-testnet"]="GhostL3 app chain simulation"
)

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --vm) TARGET_VM="$2"; shift 2 ;;
        *) shift ;;
    esac
done

log()  { echo "[deploy-testnet] $(date '+%H:%M:%S') $*"; }
warn() { echo "[deploy-testnet] WARN $*" >&2; }

# ── Run a command on a VM via hypervisor ─────────────────────────────────────
vm_exec() {
    local vm="$1"; shift
    local cmd="$*"
    if "$DRY_RUN"; then
        echo "[DRY-RUN] on ${vm}: ${cmd}"
    else
        ssh "${HYPERVISOR}" "ssh -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new '${vm}' '${cmd}'"
    fi
}

# ── Install Docker on a VM ────────────────────────────────────────────────────
install_docker_on_vm() {
    local vm="$1"
    log "  Installing Docker on ${vm}..."
    vm_exec "${vm}" "
        set -e
        if command -v docker >/dev/null 2>&1; then
            echo 'Docker already installed: '\$(docker --version)
            exit 0
        fi
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq ca-certificates curl gnupg lsb-release
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
        chmod a+r /etc/apt/keyrings/docker.asc
        echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable\" > /etc/apt/sources.list.d/docker.list
        apt-get update -qq
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        systemctl enable --now docker
        usermod -aG docker ghost 2>/dev/null || true
        echo 'Docker installed: '\$(docker --version)
    "
}

# ── Bootstrap workspace on a VM ───────────────────────────────────────────────
setup_workspace_on_vm() {
    local vm="$1"
    log "  Setting up workspace on ${vm}..."
    vm_exec "${vm}" "
        set -e
        if [[ -d '${REMOTE_DIR}/.git' ]]; then
            echo 'Workspace exists — pulling latest...'
            cd '${REMOTE_DIR}' && git fetch origin && git reset --hard origin/${REPO_BRANCH}
        else
            echo 'Cloning workspace...'
            git clone --depth=1 --branch '${REPO_BRANCH}' '${REPO_URL}' '${REMOTE_DIR}'
        fi
        echo 'Workspace ready at ${REMOTE_DIR}'
    "
}

# ── Deploy services on L1 simulation host ─────────────────────────────────────
deploy_l1_simulation() {
    local vm="$1"
    log "  Deploying testnet L1 simulation on ${vm}..."

    vm_exec "${vm}" "
        set -e
        cd '${REMOTE_DIR}'
        # Set up env from example if .env not present
        if [[ ! -f .env ]]; then
            cp stack.env.example .env
            # Generate secrets for simulation
            sed -i 's/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=ghost_testnet_\$(openssl rand -hex 16)/' .env
            sed -i 's/COMPLIANCE_JWT_SECRET=.*/COMPLIANCE_JWT_SECRET=ghost_sim_\$(openssl rand -hex 32)/' .env
        fi

        docker network inspect ghost-rollup >/dev/null 2>&1 || docker network create ghost-rollup >/dev/null

        docker compose -f infra/ghostchain/docker-compose.l1.yml up -d \
            ghostchain-bootnode ghostchain-node1 ghostchain-node2 ghostchain-rpc-proxy 2>&1 | tail -30

        docker compose -f docker-compose.yml up -d \
            postgres redis migrate ghost-compliance ghost-compliance-worker 2>&1 | tail -30

        docker compose -f observability/infra/docker-compose.yml up -d \
            loki prometheus alertmanager grafana 2>&1 | tail -30

        echo 'Testnet L1/compliance/observability services started'
        docker compose -f infra/ghostchain/docker-compose.l1.yml ps
        docker compose -f docker-compose.yml ps
        docker compose -f observability/infra/docker-compose.yml ps
        echo
        echo 'Once GhostL2 and GhostL3 RPCs are reachable, start the control plane with:'
        echo '  RPC_L1=${TESTNET_L1_RPC} RPC_L2=${TESTNET_L2_RPC} RPC_L3=${TESTNET_L3_RPC} bash genesis-installer/start_stack.sh'
    "
}

# ── Deploy validator simulation ────────────────────────────────────────────────
deploy_validator_simulation() {
    local vm="$1"
    log "  Deploying validator simulation on ${vm}..."
    vm_exec "${vm}" "
        set -e
        cd '${REMOTE_DIR}'
        [[ ! -f .env ]] && cp stack.env.example .env
        echo 'Validator simulation ready (will sync to L1 once L1 is running)'
        docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | head -10 || true
    "
}

# ── Main deployment loop ───────────────────────────────────────────────────────
log "=== GhostChain Testnet Simulation Deployment ==="
$DRY_RUN && log "DRY-RUN mode — no changes will be made"

# Determine which VMs to deploy
if [[ -n "${TARGET_VM}" ]]; then
    VMS_TO_DEPLOY=("${TARGET_VM}")
    log "Targeting single VM: ${TARGET_VM}"
else
    VMS_TO_DEPLOY=("${!TESTNET_VMS[@]}")
    log "Targeting all testnet VMs: ${VMS_TO_DEPLOY[*]}"
fi

for vm in "${VMS_TO_DEPLOY[@]}"; do
    desc="${TESTNET_VMS[$vm]:-unknown}"
    log ""
    log "━━━ ${vm} (${desc}) ━━━"

    # Step 1: Install Docker
    install_docker_on_vm "${vm}"

    # Step 2: Bootstrap workspace (git clone / pull)
    setup_workspace_on_vm "${vm}"

    # Step 3: Deploy role-specific services
    case "${vm}" in
        ghostchain-testnet-l1)
            deploy_l1_simulation "${vm}"
            ;;
        ghost-testnet-validator)
            deploy_validator_simulation "${vm}"
            ;;
        ghostl2-testnet|ghostl3-testnet)
            log "  ${vm}: chain node (will connect to L1 when ready)"
            vm_exec "${vm}" "
                cd '${REMOTE_DIR}' && [[ ! -f .env ]] && cp stack.env.example .env
                echo 'Workspace ready, awaiting L1 bootnode coordination'
            "
            ;;
        *)
            warn "Unknown VM role: ${vm}"
            ;;
    esac

    log "  ✓ ${vm} setup complete"
done

log ""
log "=== Testnet Simulation Deployment Complete ==="
log "Monitor with:"
log "  ssh hypervisor 'ssh ghostchain-testnet-l1 \"cd ghostl-stack && docker compose -f infra/ghostchain/docker-compose.l1.yml ps\"'"
