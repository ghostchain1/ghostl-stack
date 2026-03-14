#!/usr/bin/env bash
# GhostStack Genesis Installer
#
# Single-command deployment of the complete GhostStack ecosystem:
#
#   Phase 1  System preparation
#   Phase 2  Node.js tooling validation
#   Phase 3  Bridge networking
#   Phase 4  VM directories & provisioning (libvirt)
#   Phase 5  Docker infrastructure
#   Phase 6  Blockchain nodes  (GhostChain L1 | GhostL2 | GhostL3)
#   Phase 7  AI control services
#   Phase 8  Monitoring stack
#
# Usage:
#   ./infra/genesis-installer.sh               # full install (dev mode)
#   GHOST_MODE=prod ./infra/genesis-installer.sh
#   SKIP_VMS=true   ./infra/genesis-installer.sh   # skip libvirt provisioning
#   DRY_RUN=true    ./infra/genesis-installer.sh   # print actions, do nothing
#
# Chain IDs  : L1=14000101 (:18545)  L2=901 (:29545)  L3=903 (:39545)
# AI services: GhostBrain=7900  ProtocolArchitect=7910  DeFiArchitect=7920
#              GovernorAI=7930  InfraController=7940   MultichainCtrl=7950

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Configuration (environment overrides) ────────────────────────────────────
GHOST_MODE="${GHOST_MODE:-dev}"              # dev | prod
SKIP_VMS="${SKIP_VMS:-false}"               # skip libvirt VM provisioning
DRY_RUN="${DRY_RUN:-false}"                 # print actions without executing

L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:29545}"
L3_RPC="${L3_RPC:-http://localhost:39545}"
COSMOS_LCD="${COSMOS_LCD:-http://localhost:1317}"

PROMETHEUS_IMAGE="${PROMETHEUS_IMAGE:-prom/prometheus:v2.51.0}"
GRAFANA_IMAGE="${GRAFANA_IMAGE:-grafana/grafana:10.4.0}"

VM_IMAGE_DIR="${VM_IMAGE_DIR:-/var/lib/libvirt/images/ghoststack}"

SUPERVISOR_SCRIPT="${STACK_ROOT}/infra/self-healing-loop.sh"
SUPERVISOR_LOG_DIR="${STACK_ROOT}/logs/supervisor"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()   { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }
die()   { echo "[FATAL] $*" >&2; exit 1; }
warn()  { echo "[WARN]  $*" >&2; }

phase() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "  Phase %-2s  %s\n" "$1" "$2"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# run_cmd: in DRY_RUN mode, print the command and skip it; otherwise execute.
run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "  [DRY-RUN] $*"
  else
    "$@"
  fi
}

check_cmd() { command -v "$1" &>/dev/null || die "Required tool '$1' not found."; }

# safe HTTP health probe — non-fatal (caller decides what to do with result)
http_ok() {
  local url="$1"
  curl -fsS --max-time 5 "${url}" &>/dev/null
}

# wait for an HTTP endpoint (up to $2 seconds, default 60)
wait_for_http() {
  local label="$1" url="$2" timeout="${3:-60}"
  local elapsed=0
  while ! http_ok "${url}"; do
    if (( elapsed >= timeout )); then
      warn "  ${label} at ${url} not reachable after ${timeout}s – continuing."
      return 0
    fi
    sleep 3
    (( elapsed += 3 )) || true
  done
  log "  ${label} OK"
}

# ── Banner ────────────────────────────────────────────────────────────────────
cat <<'BANNER'

  ╔═══════════════════════════════════════════════════════════╗
  ║              GhostStack Genesis Installer                 ║
  ║         1 command  →  full GhostStack network            ║
  ╚═══════════════════════════════════════════════════════════╝
  GhostChain L1 (14000101) · GhostL2 (901) · GhostL3 (903)
  AI: GhostBrain · ProtocolArchitect · DeFiArchitect
      GovernorAI · InfraController   · MultichainCtrl

BANNER

echo "  Stack root : ${STACK_ROOT}"
echo "  Mode       : ${GHOST_MODE}"
echo "  DRY_RUN    : ${DRY_RUN}"
echo "  Skip VMs   : ${SKIP_VMS}"
echo "  Timestamp  : $(date -u)"
echo ""
[[ "${GHOST_MODE}" == "prod" ]] && warn "Production mode — review all secrets before continuing."

# ── Phase 1: System Preparation ──────────────────────────────────────────────
phase 1 "System Preparation"

run_cmd sudo apt-get update -qq
run_cmd sudo apt-get upgrade -y -q

run_cmd sudo apt-get install -y --no-install-recommends \
  git curl wget jq build-essential unzip ca-certificates \
  docker.io docker-compose \
  qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virtinst \
  openssl

run_cmd sudo systemctl enable --now docker

log "Phase 1 done."

# ── Phase 2: Node.js Tooling Validation ──────────────────────────────────────
phase 2 "Node.js Tooling Validation"

check_cmd node
check_cmd npm

NODE_VER="$(node --version)"
# Enforce v22.x — must be >=22.21.0 and <23
if ! echo "${NODE_VER}" | grep -qE "^v22\."; then
  die "Node.js v22.21.0–v22.x required (detected: ${NODE_VER}). \
Install from https://nodejs.org or via nvm/volta."
fi
log "Node ${NODE_VER} OK"

NPM_VER="$(npm --version)"
log "npm ${NPM_VER} OK"

# Install global TypeScript tooling (non-fatal if already present)
run_cmd sudo npm install -g --silent ts-node typescript 2>/dev/null || true

# Install workspace dependencies
log "  Installing workspace dependencies…"
run_cmd npm install --prefix "${STACK_ROOT}" --silent

log "Phase 2 done."

# ── Phase 3: Bridge Networking ────────────────────────────────────────────────
phase 3 "Bridge Networking"

if ! ip link show br0 &>/dev/null; then
  run_cmd sudo brctl addbr br0
  run_cmd sudo ip link set br0 up
  log "  Bridge br0 created."
else
  log "  Bridge br0 already exists."
fi

log "Phase 3 done."

# ── Phase 4: VM Directories & Provisioning ───────────────────────────────────
phase 4 "VM Directories & Provisioning"

run_cmd sudo mkdir -p "${VM_IMAGE_DIR}"

if [[ "${SKIP_VMS}" == "true" ]]; then
  log "  SKIP_VMS=true — VM provisioning skipped."
else
  check_cmd virt-install
  check_cmd virsh

  #
  # _provision_vm name ram_mb vcpus disk_gb
  #   Idempotent: skips if the VM already exists in libvirt.
  #
  _provision_vm() {
    local name="$1" ram="$2" cpus="$3" disk="$4"
    if virsh domstate "${name}" &>/dev/null; then
      log "  VM ${name} already exists — skipping."
      return 0
    fi
    log "  Provisioning VM: ${name} (RAM=${ram}M  CPU=${cpus}  Disk=${disk}G)"
    run_cmd virt-install \
      --name        "${name}" \
      --ram         "${ram}" \
      --vcpus       "${cpus}" \
      --disk        "path=${VM_IMAGE_DIR}/${name}.qcow2,size=${disk}" \
      --network     bridge=br0 \
      --os-variant  ubuntu22.04 \
      --graphics    none \
      --import \
      --noautoconsole || true
  }

  # GhostStack node VMs
  _provision_vm ghostchain-l1         8192  4  80  # GhostChain L1 sovereign node
  _provision_vm ghostl2               8192  4  80  # GhostL2 OP Stack node
  _provision_vm ghostl3               8192  4  80  # GhostL3 OP Stack node
  _provision_vm ghost-validator       4096  2  40  # CometBFT validator
  _provision_vm ghost-ai-controller   4096  2  40  # AI services host
fi

log "Phase 4 done."

# ── Phase 5: Docker Infrastructure ───────────────────────────────────────────
phase 5 "Docker Infrastructure"

cd "${STACK_ROOT}"

# Create .env from example if not present
if [[ ! -f ".env" ]]; then
  if [[ -f "stack.env.example" ]]; then
    run_cmd cp stack.env.example .env
    warn "  Created .env from stack.env.example — set secrets before production use."
  else
    die "No .env and no stack.env.example found. Create .env before deploying."
  fi
fi

# Pull images first so docker compose up is faster and errors surface early
log "  Pulling Docker images (this may take a few minutes)…"
run_cmd docker compose pull --quiet 2>/dev/null || warn "  docker compose pull failed — attempting 'up' anyway."

log "  Starting Docker services…"
run_cmd docker compose up -d

log "Phase 5 done."

# ── Phase 6: Blockchain Nodes ─────────────────────────────────────────────────
phase 6 "Blockchain Nodes"

#
# GhostChain L1, GhostL2, and GhostL3 are managed as Docker Compose services.
# The OP Stack opstack/up-l2.sh script handles L2 sequencer + batcher startup.
# We wait for each RPC to become responsive before declaring success.
#
# Note: do NOT use `npx hardhat node` for chain startup — GhostChain runs
# ghostchaind (Cosmos SDK + CometBFT + EVM) and OP Stack nodes, not Hardhat.
#

_check_rpc() {
  local label="$1" url="$2" expected_hex="$3"
  local result
  result="$(curl -sS --max-time 5 -X POST "${url}" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    2>/dev/null || echo "")"
  if echo "${result}" | grep -qi "${expected_hex}"; then
    log "  ${label} responding  (chain id ${expected_hex})"
  else
    warn "  ${label} not ready yet — self-healing supervisor will monitor."
  fi
}

# Optionally kick off the OP Stack L2 startup script if present
OPSTACK_UP="${STACK_ROOT}/infra/scripts/opstack/up-l2.sh"
if [[ -f "${OPSTACK_UP}" ]]; then
  log "  Running OP Stack L2 startup (up-l2.sh)…"
  run_cmd bash "${OPSTACK_UP}" || warn "  up-l2.sh returned non-zero — check OP Stack logs."
else
  log "  OP Stack startup script not found — using docker compose service management."
fi

# Env sync from deployed contracts (idempotent)
ENV_SYNC="${STACK_ROOT}/infra/scripts/env-sync-stack.sh"
if [[ -f "${ENV_SYNC}" ]]; then
  log "  Syncing env from deployed contract addresses…"
  run_cmd bash "${ENV_SYNC}" || warn "  env-sync-stack.sh returned non-zero — continuing."
fi

log "  Probing chain RPCs…"
_check_rpc "GhostChain L1 (14000101)" "${L1_RPC}" "0xd59a65"
_check_rpc "GhostL2      (901)"       "${L2_RPC}" "0x385"
_check_rpc "GhostL3      (903)"       "${L3_RPC}" "0x387"

log "Phase 6 done."

# ── Phase 7: AI Control Services ─────────────────────────────────────────────
phase 7 "AI Control Services"

#
# Each AI service is a TypeScript ESM package. We:
#   1) npm install + npm run build  (compile TS → dist/)
#   2) docker start (if a pre-built container image exists)
#
# Services are built sequentially to avoid OOM on constrained hosts.
# Set NODE_OPTIONS for solc-heavy builds; lighter AI services usually fine.
#

_build_ai_service() {
  local name="$1"
  local dir="${STACK_ROOT}/services/${name}"

  if [[ ! -d "${dir}" ]]; then
    warn "  ${name}: source directory not found at ${dir} — skipping build."
    return 0
  fi

  log "  Building ${name}…"
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "  [DRY-RUN] npm install && npm run build  in ${dir}"
    return 0
  fi

  if (
    cd "${dir}"
    npm install --silent
    npm run build 2>&1
  ); then
    log "  ${name} built OK"
  else
    warn "  ${name} build failed — check ${dir} for errors."
  fi
}

_start_ai_container() {
  local name="$1" port="$2"

  if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
    log "  ${name} already running on port ${port}."
    return 0
  fi

  if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
    log "  Starting container ${name}…"
    if run_cmd docker start "${name}"; then
      log "  ${name} started (port ${port})"
    else
      warn "  ${name} start failed — check: docker logs ${name}"
    fi
  else
    warn "  Container ${name} not found — push its image and run docker create first."
  fi
}

# Build all services sequentially
_build_ai_service ghostbrain-core
_build_ai_service ghost-contract-engine
_build_ai_service ghost-protocol-architect
_build_ai_service ghost-defi-architect
_build_ai_service ghost-governor-ai
_build_ai_service ghost-infra-controller
_build_ai_service ghost-multichain-controller

# Start containers
_start_ai_container ghostbrain-core               7900
_start_ai_container ghost-contract-engine         7895  # varies
_start_ai_container ghost-protocol-architect      7910
_start_ai_container ghost-defi-architect          7920
_start_ai_container ghost-governor-ai             7930
_start_ai_container ghost-infra-controller        7940
_start_ai_container ghost-multichain-controller   7950

# Probe GhostBrain (up to 30s) — it orchestrates all other AI services
wait_for_http "GhostBrain (7900)" "http://localhost:7900/health" 30

log "Phase 7 done."

# ── Phase 8: Monitoring Stack ─────────────────────────────────────────────────
phase 8 "Monitoring Stack"

#
# Prometheus and Grafana: start managed containers only if docker-compose
# did not already start them (compose config takes precedence).
#

_ensure_monitor() {
  local name="$1" port="$2" image="$3"
  shift 3
  local extra_args=("$@")

  if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
    log "  ${name} already running."
    return 0
  fi

  log "  Starting ${name} on port ${port}…"
  run_cmd docker run -d \
    --name "${name}" \
    --restart unless-stopped \
    -p "127.0.0.1:${port}:${port}" \
    "${extra_args[@]}" \
    "${image}"

  log "  ${name} started."
}

_ensure_monitor ghost-prometheus 9090 "${PROMETHEUS_IMAGE}"
_ensure_monitor ghost-grafana    3000 "${GRAFANA_IMAGE}"

# Mount grafana dashboards if the local config dir exists
GRAFANA_PROVISIONING="${STACK_ROOT}/grafana"
if [[ -d "${GRAFANA_PROVISIONING}" ]] && \
   ! docker ps --format '{{.Names}}' | grep -q "^ghost-grafana$"; then
  # Re-launch with volume mount (only if not already running)
  docker stop ghost-grafana 2>/dev/null || true
  docker rm   ghost-grafana 2>/dev/null || true
  run_cmd docker run -d \
    --name ghost-grafana \
    --restart unless-stopped \
    -p "127.0.0.1:3000:3000" \
    -v "${GRAFANA_PROVISIONING}:/etc/grafana/provisioning:ro" \
    "${GRAFANA_IMAGE}"
  log "  Grafana restarted with provisioning volume."
fi

log "Phase 8 done."

# ── Boot-order systemd unit (optional, non-fatal) ────────────────────────────
phase "★" "Systemd Boot-Order Unit (optional)"

SYSTEMD_UNIT="/etc/systemd/system/ghoststack.service"

if [[ "${DRY_RUN}" == "false" ]] && command -v systemctl &>/dev/null; then
  cat > /tmp/ghoststack.service <<UNIT
[Unit]
Description=GhostStack Blockchain OS
Documentation=https://github.com/ghostchain1/ghostl-stack
After=network-online.target docker.service libvirtd.service
Wants=network-online.target docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${STACK_ROOT}
ExecStart=/usr/bin/env bash ${STACK_ROOT}/infra/genesis-installer.sh
ExecStop=/usr/bin/docker compose -f ${STACK_ROOT}/docker-compose.yml down
TimeoutStartSec=600
TimeoutStopSec=60
User=root
Environment=SKIP_VMS=true

[Install]
WantedBy=multi-user.target
UNIT

  sudo install -m 644 /tmp/ghoststack.service "${SYSTEMD_UNIT}"
  sudo systemctl daemon-reload
  sudo systemctl enable ghoststack.service
  log "  Systemd unit installed: ${SYSTEMD_UNIT}"
  log "  GhostStack will auto-start on reboot (SKIP_VMS=true — VMs are persistent)."
else
  log "  Skipping systemd unit (DRY_RUN=${DRY_RUN})."
fi

# ── Self-healing supervisor ───────────────────────────────────────────────────
phase "✓" "Self-Healing Supervisor"

if [[ -f "${SUPERVISOR_SCRIPT}" ]]; then
  chmod +x "${SUPERVISOR_SCRIPT}"
  mkdir -p "${SUPERVISOR_LOG_DIR}"

  # Stop any previous supervisor instance
  PID_FILE="${SUPERVISOR_LOG_DIR}/supervisor.pid"
  if [[ -f "${PID_FILE}" ]]; then
    OLD_PID="$(cat "${PID_FILE}")"
    if kill -0 "${OLD_PID}" 2>/dev/null; then
      if kill "${OLD_PID}"; then
        log "  Stopped previous supervisor (PID ${OLD_PID})"
      fi
    fi
  fi

  if [[ "${DRY_RUN}" == "false" ]]; then
    nohup bash -c "
      while true; do
        bash '${SUPERVISOR_SCRIPT}' >> '${SUPERVISOR_LOG_DIR}/self-healing.log' 2>&1 || true
        sleep 5
      done
    " &>/dev/null &
    echo "$!" > "${PID_FILE}"
    log "  Supervisor started  (PID $(cat "${PID_FILE}"))"
    log "  Log: ${SUPERVISOR_LOG_DIR}/self-healing.log"
  else
    log "  [DRY-RUN] Would start self-healing supervisor."
  fi
else
  warn "  self-healing-loop.sh not found at ${SUPERVISOR_SCRIPT} — skipping supervisor."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║            GhostStack Deployment Complete                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "  Blockchain"
echo "  ──────────────────────────────────────────────────────────"
printf "  GhostChain L1  (chain 14000101)  %s\n" "${L1_RPC}"
printf "  GhostL2        (chain      901)  %s\n" "${L2_RPC}"
printf "  GhostL3        (chain      903)  %s\n" "${L3_RPC}"
printf "  Cosmos LCD                       %s\n" "${COSMOS_LCD}"
printf "  CometBFT RPC                     %s\n" "http://localhost:26657"
echo ""
echo "  AI Control Layer"
echo "  ──────────────────────────────────────────────────────────"
printf "  GhostBrain (AI core)             %s\n" "http://localhost:7900"
printf "  Protocol Architect               %s\n" "http://localhost:7910"
printf "  DeFi Architect                   %s\n" "http://localhost:7920"
printf "  Governor AI                      %s\n" "http://localhost:7930"
printf "  Infra Controller                 %s\n" "http://localhost:7940"
printf "  Multichain Controller            %s\n" "http://localhost:7950"
echo ""
echo "  Monitoring"
echo "  ──────────────────────────────────────────────────────────"
printf "  Prometheus                       %s\n" "http://localhost:9090"
printf "  Grafana                          %s\n" "http://localhost:3000"
printf "  Compliance                       %s\n" "http://localhost:8090"
echo ""
echo "  Sovereignty rule (Multichain Controller)"
echo "  L3 → L2 → GhostChain L1 → External Chains"
echo ""
echo "  Supervisor log: ${SUPERVISOR_LOG_DIR}/self-healing.log"
echo ""
echo "  Autonomous operation active:"
echo "    AI generates contracts       AI deploys DeFi protocols"
echo "    AI monitors infrastructure   AI manages treasury"
echo "    AI routes cross-chain liquidity via sovereign path"
echo ""
if [[ "${GHOST_MODE}" == "dev" ]]; then
  warn "  Dev mode — do NOT use this configuration on a production network."
fi
if [[ "${DRY_RUN}" == "true" ]]; then
  warn "  DRY_RUN was enabled — no changes were made to the system."
fi
echo "══════════════════════════════════════════════════════════════"
