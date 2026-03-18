#!/usr/bin/env bash
# GhostStack Self-Healing Genesis Installer v2
#
# Installs, configures, and starts the full GhostStack ecosystem:
#   system deps → Vault → VM provisioning → docker services →
#   validator keys → secret storage → OP Stack preflight →
#   monitoring → AI services → self-healing supervisor
#
# Usage:
#   GHOST_MODE=dev  ./infra/genesis-installer-v2.sh   # dev Vault (NOT for prod)
#   GHOST_MODE=prod VAULT_ADDR=http://vault:8200 \
#                   VAULT_TOKEN=<root> \
#                   ./infra/genesis-installer-v2.sh
#
# Chain IDs:  L1=14000101 (port 18545) | L2=901 (port 29547) | L3=903 (port 39545)
# GhostBrain: port 7900

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Configuration (override via env) ─────────────────────────────────────────
GHOST_MODE="${GHOST_MODE:-dev}"
VAULT_VERSION="${VAULT_VERSION:-1.16.1}"
VALIDATOR_COUNT="${VALIDATOR_COUNT:-2}"
L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:29547}"
L3_RPC="${L3_RPC:-http://localhost:39545}"
PROMETHEUS_IMAGE="${PROMETHEUS_IMAGE:-prom/prometheus:v2.51.0}"
GRAFANA_IMAGE="${GRAFANA_IMAGE:-grafana/grafana:10.4.0}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }
die()  { echo "[FATAL] $*" >&2; exit 1; }
step() { echo ""; echo "════════════════════════════════════════"; echo "  Phase $1: $2"; echo "════════════════════════════════════════"; }

# ── Phase 1: System Dependencies ─────────────────────────────────────────────
step 1 "System Dependencies"

sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  docker.io docker-compose \
  git curl jq wget unzip \
  qemu-kvm libvirt-daemon-system \
  libvirt-clients bridge-utils virtinst

sudo systemctl enable --now docker
log "Phase 1 done."

# ── Phase 2: Node Tooling ─────────────────────────────────────────────────────
step 2 "Node Tooling"

NODE_VER="$(node --version 2>/dev/null || echo none)"
if ! echo "${NODE_VER}" | grep -qE "^v22\."; then
  die "Node.js v22.x required (got: ${NODE_VER}). Install from nodejs.org or via volta/nvm."
fi
log "Node ${NODE_VER} OK"

sudo npm install -g ts-node typescript
log "Phase 2 done."

# ── Phase 3: HashiCorp Vault ──────────────────────────────────────────────────
step 3 "HashiCorp Vault ${VAULT_VERSION}"

if ! command -v vault &>/dev/null; then
  VAULT_ZIP="vault_${VAULT_VERSION}_linux_amd64.zip"
  VAULT_BASE_URL="https://releases.hashicorp.com/vault/${VAULT_VERSION}"

  log "Downloading Vault ${VAULT_VERSION}…"
  wget -q "${VAULT_BASE_URL}/${VAULT_ZIP}" -O /tmp/vault.zip
  wget -q "${VAULT_BASE_URL}/vault_${VAULT_VERSION}_SHA256SUMS" -O /tmp/vault_SHA256SUMS

  # Verify checksum against HashiCorp's published SHA256SUMS before installing
  (cd /tmp && grep "${VAULT_ZIP}" vault_SHA256SUMS | sha256sum --check) \
    || die "Vault checksum verification FAILED — refusing to install."

  unzip -q /tmp/vault.zip -d /tmp/vault_bin
  sudo install -m 0755 /tmp/vault_bin/vault /usr/local/bin/vault
  rm -rf /tmp/vault.zip /tmp/vault_SHA256SUMS /tmp/vault_bin
  log "Vault installed."
else
  log "Vault already present: $(vault version)"
fi

log "Phase 3 done."

# ── Phase 4: Networking ───────────────────────────────────────────────────────
step 4 "Bridge Networking"

if ! ip link show br0 &>/dev/null; then
  sudo brctl addbr br0
  sudo ip link set br0 up
  log "Bridge br0 created."
else
  log "Bridge br0 already exists."
fi

log "Phase 4 done."

# ── Phase 5: VM Provisioning ──────────────────────────────────────────────────
step 5 "VM Provisioning"

create_vm() {
  local name="$1" ram_mb="$2" cpus="$3" disk_gb="$4"
  if virsh domstate "${name}" &>/dev/null; then
    log "  VM ${name} already exists – skipping."
    return
  fi
  virt-install \
    --name        "${name}" \
    --ram         "${ram_mb}" \
    --vcpus       "${cpus}" \
    --disk        "path=/var/lib/libvirt/images/${name}.qcow2,size=${disk_gb}" \
    --network     bridge=br0 \
    --os-variant  ubuntu22.04 \
    --graphics    none \
    --import \
    --noautoconsole || true
  log "  VM ${name} provisioned."
}

create_vm ghostchain-l1        8192 4 80
create_vm ghost-validator      4096 2 40
create_vm ghostl2              8192 4 80
create_vm ghostl3              8192 4 80
create_vm ghost-ai-controller  4096 2 40

log "Phase 5 done."

# ── Phase 6: Docker Services ──────────────────────────────────────────────────
step 6 "Docker Services"

cd "${STACK_ROOT}"

if [[ ! -f ".env" ]]; then
  if [[ -f "stack.env.example" ]]; then
    cp stack.env.example .env
    log "  Created .env from stack.env.example – review secrets before production use."
  else
    die ".env not found and no stack.env.example to copy. Create .env before deploying."
  fi
fi

docker compose up -d
log "Phase 6 done."

# ── Phase 7: Validator Key Generation ────────────────────────────────────────
step 7 "Validator Key Generation"

VALIDATOR_DIR="${STACK_ROOT}/validators"
mkdir -p "${VALIDATOR_DIR}"
chmod 700 "${VALIDATOR_DIR}"

for i in $(seq 1 "${VALIDATOR_COUNT}"); do
  KEY_FILE="${VALIDATOR_DIR}/validator${i}.key"
  if [[ -f "${KEY_FILE}" ]]; then
    log "  validator${i}.key already exists – skipping."
    continue
  fi
  openssl rand -hex 32 > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
  log "  Generated ${KEY_FILE}"
done

log "Phase 7 done."

# ── Phase 8: Vault Secret Storage ────────────────────────────────────────────
step 8 "Vault Secret Storage"

if [[ "${GHOST_MODE}" == "dev" ]]; then
  log "  Dev mode: starting Vault in dev mode (NOT suitable for production)."
  VAULT_DEV_TOKEN="${VAULT_DEV_TOKEN:-ghoststack-dev-only-$(openssl rand -hex 8)}"
  VAULT_ADDR_DEFAULT="http://127.0.0.1:8200"

  if ! curl -fsS "${VAULT_ADDR:-${VAULT_ADDR_DEFAULT}}/v1/sys/health" &>/dev/null; then
    vault server -dev \
      -dev-root-token-id="${VAULT_DEV_TOKEN}" \
      -dev-listen-address="127.0.0.1:8200" \
      &>/dev/null &
    sleep 3
    log "  Dev Vault started (token written to ${STACK_ROOT}/validators/.vault-dev-token)"
    echo "${VAULT_DEV_TOKEN}" > "${VALIDATOR_DIR}/.vault-dev-token"
    chmod 600 "${VALIDATOR_DIR}/.vault-dev-token"
  fi

  export VAULT_ADDR="${VAULT_ADDR:-${VAULT_ADDR_DEFAULT}}"
  export VAULT_TOKEN="${VAULT_DEV_TOKEN}"
else
  [[ -n "${VAULT_ADDR:-}"  ]] || die "VAULT_ADDR is required in prod mode."
  [[ -n "${VAULT_TOKEN:-}" ]] || die "VAULT_TOKEN is required in prod mode."
  log "  Using Vault at ${VAULT_ADDR}"
fi

# Enable KV secrets engine (idempotent)
vault secrets enable -path=secret kv 2>/dev/null || true

# Store validator keys
for i in $(seq 1 "${VALIDATOR_COUNT}"); do
  KEY_FILE="${VALIDATOR_DIR}/validator${i}.key"
  vault kv put "secret/ghostchain/validator${i}" \
    key="$(cat "${KEY_FILE}")" \
    created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  log "  Stored validator${i} key in Vault at secret/ghostchain/validator${i}"
done

# Bootstrap AppRole in prod mode
if [[ "${GHOST_MODE}" != "dev" && -f "${STACK_ROOT}/infra/vault/bootstrap-approle.sh" ]]; then
  log "  Bootstrapping Vault AppRole auth…"
  bash "${STACK_ROOT}/infra/vault/bootstrap-approle.sh"
fi

log "Phase 8 done."

# ── Phase 9: OP Stack Preflight + Chain Health ───────────────────────────────
step 9 "OP Stack Preflight & Chain Health"

# Sync env from deployed L1/L2/L3 contracts
if [[ -f "${STACK_ROOT}/infra/scripts/env-sync-stack.sh" ]]; then
  bash "${STACK_ROOT}/infra/scripts/env-sync-stack.sh" || log "  env-sync-stack.sh failed – continuing."
fi

# Run OP Stack preflight if available
if [[ -f "${STACK_ROOT}/infra/scripts/opstack/up-l2.sh" ]]; then
  log "  Running OP Stack preflight…"
  bash "${STACK_ROOT}/infra/scripts/opstack/up-l2.sh" || log "  L2 stack startup returned non-zero – check logs."
fi

# Chain RPC health checks
check_rpc() {
  local label="$1" url="$2" expected_hex_chain_id="$3"
  local result
  result="$(curl -sS --max-time 5 -X POST "${url}" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' 2>/dev/null || true)"
  if echo "${result}" | grep -qi "${expected_hex_chain_id}"; then
    log "  ${label} OK"
  else
    log "  ${label} not responding yet – self-healing supervisor will monitor."
  fi
}

check_rpc "GhostChain L1 (14000101)" "${L1_RPC}" "0xd59a65"
check_rpc "GhostL2      (901)"       "${L2_RPC}" "0x385"
check_rpc "GhostL3      (903)"       "${L3_RPC}" "0x387"

log "Phase 9 done."

# ── Phase 10: Monitoring Stack ────────────────────────────────────────────────
step 10 "Monitoring Stack"

if ! docker ps --format '{{.Names}}' | grep -q '^ghost-prometheus$'; then
  docker run -d \
    --name ghost-prometheus \
    -p 127.0.0.1:9090:9090 \
    --restart unless-stopped \
    "${PROMETHEUS_IMAGE}"
  log "  Prometheus started."
else
  log "  Prometheus already running."
fi

if ! docker ps --format '{{.Names}}' | grep -q '^ghost-grafana$'; then
  docker run -d \
    --name ghost-grafana \
    -p 127.0.0.1:3000:3000 \
    --restart unless-stopped \
    "${GRAFANA_IMAGE}"
  log "  Grafana started."
else
  log "  Grafana already running."
fi

log "Phase 10 done."

# ── Phase 11: AI Control Services ────────────────────────────────────────────
step 11 "AI Control Services"

# Build all AI/service packages that need a compile step.
# Each service is an ESM TypeScript package with its own tsconfig.
_build_service() {
  local dir="${STACK_ROOT}/services/$1"
  if [[ -d "${dir}" ]]; then
    log "  Building $1…"
    if ( cd "${dir}" && npm install --silent && npm run build 2>&1 ); then
      log "  $1 built OK"
    else
      log "  $1 build failed – check ${dir} for errors"
    fi
  else
    log "  $1 source not found at ${dir} – skipping build"
  fi
}

_build_service ghost-contract-engine
_build_service ghost-protocol-architect
_build_service ghost-defi-architect
_build_service ghost-governor-ai
_build_service ghost-infra-controller
_build_service ghost-multichain-controller
_build_service ghostbrain-core

# Start containers that were previously built/pushed as Docker images.
_try_start() {
  local name="$1"
  if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
    if docker start "${name}" 2>/dev/null; then
      log "  Started ${name}"
    else
      log "  ${name} already running or start failed – check: docker logs ${name}"
    fi
  else
    log "  ${name} not found – deploy the container image before starting."
  fi
}

_try_start ghost-governor-ai
_try_start ghost-defi-architect
_try_start ghost-protocol-architect
_try_start ghost-contract-engine
_try_start ghost-infra-controller
_try_start ghost-multichain-controller

log "Phase 11 done."

# ── Phase 12: Self-Healing Supervisor ────────────────────────────────────────
step 12 "Self-Healing Supervisor"

SUPERVISOR="${STACK_ROOT}/infra/self-healing-loop.sh"
[[ -f "${SUPERVISOR}" ]] || die "Self-healing supervisor not found at ${SUPERVISOR}"
chmod +x "${SUPERVISOR}"

LOG_DIR="${STACK_ROOT}/logs/supervisor"
mkdir -p "${LOG_DIR}"

# Kill any previous supervisor instance
if [[ -f "${LOG_DIR}/supervisor.pid" ]]; then
  OLD_PID="$(cat "${LOG_DIR}/supervisor.pid")"
  if kill -0 "${OLD_PID}" 2>/dev/null; then
    kill "${OLD_PID}" && log "  Stopped previous supervisor (PID ${OLD_PID})"
  fi
fi

# Launch supervisor daemon with automatic restart wrapper
nohup bash -c "
  while true; do
    bash '${SUPERVISOR}' >> '${LOG_DIR}/self-healing.log' 2>&1 || true
    sleep 5
  done
" &>/dev/null &

echo "$!" > "${LOG_DIR}/supervisor.pid"
log "  Supervisor started (PID $(cat "${LOG_DIR}/supervisor.pid"))"
log "  Log: ${LOG_DIR}/self-healing.log"

log "Phase 12 done."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  GhostStack Installation Complete"
echo "════════════════════════════════════════"
echo "  L1 RPC (chain 14000101): ${L1_RPC}"
echo "  L2 RPC (chain 901):      ${L2_RPC}"
echo "  L3 RPC (chain 903):      ${L3_RPC}"
echo "  GhostBrain AI:           http://localhost:7900"
echo "  Prometheus:              http://localhost:9090"
echo "  Grafana:                 http://localhost:3000"
echo "  Compliance:              http://localhost:8090"
echo ""
echo "  AI & Controller Services:"
echo "  GhostBrain AI:           http://localhost:7900"
echo "  Protocol Architect:      http://localhost:7910"
echo "  DeFi Architect:          http://localhost:7920"
echo "  Governor AI:             http://localhost:7930"
echo "  Infra Controller:        http://localhost:7940"
echo "  Multichain Controller:   http://localhost:7950"
echo ""
echo "  Sovereignty rule enforced by Multichain Controller:"
echo "  L3 → L2 → GhostChain L1 → External Chains"
if [[ "${GHOST_MODE}" == "dev" ]]; then
  echo "  Vault (DEV mode):        ${VAULT_ADDR:-http://127.0.0.1:8200}"
  echo "  ⚠  Dev Vault is NOT suitable for production."
fi
echo "  Supervisor log:          ${LOG_DIR}/self-healing.log"
echo "════════════════════════════════════════"
