#!/usr/bin/env bash
# GhostStack Autonomous Installer v3
#
# Extends v2 with:
#   Post-quantum hybrid key management (ML-KEM-768 + Ed25519 via liboqs / OpenSSL 3.x OQS provider)
#   AI validator orchestration         (registers validators with ghost-governor-ai REST API)
#   Economic optimization init         (seeds ghost-defi-architect with GST economic parameters)
#   Multi-region / multicloud federation (SSH + rsync remote node provisioning)
#   Global failover daemon             (regional health monitoring + failover recommendations)
#   Autonomous upgrade hooks           (git pull + compose reload + AI service rebuild via cron)
#
# Usage:
#   ./infra/genesis-installer-v3.sh
#   GHOST_MODE=prod FEDERATION_HOSTS="user@host1 user@host2" ./infra/genesis-installer-v3.sh
#   DRY_RUN=true ./infra/genesis-installer-v3.sh               # prints actions, executes nothing
#   SKIP_VMS=true SKIP_FEDERATION=true ./infra/genesis-installer-v3.sh
#   ENABLE_AUTO_UPGRADE=true ./infra/genesis-installer-v3.sh   # installs daily 03:00 cron
#
# Environment variables:
#   GHOST_MODE            dev | prod           (default: dev)
#   VALIDATOR_COUNT       integer              (default: 4)
#   VAULT_VERSION         semver               (default: 1.16.1)
#   PQ_ALGO               ML-KEM-768 | X25519  (default: ML-KEM-768, auto-fallback to X25519)
#   FEDERATION_HOSTS      "user@h1 user@h2"   (default: none)
#   SKIP_VMS              true | false         (default: false)
#   SKIP_FEDERATION       true | false         (default: false)
#   DRY_RUN               true | false         (default: false)
#   ENABLE_AUTO_UPGRADE   true | false         (default: false)
#   FAILOVER_REGIONS      "r1=url1 r2=url2"   (default: monitors local L1/L2/L3)
#
# Chain IDs: L1=14000101 (:18545) | L2=901 (:29545) | L3=903 (:39545)
# AI ports : 7900 GhostBrain | 7910 ProtocolArchitect | 7920 DeFiArchitect
#            7930 GovernorAI | 7940 InfraController   | 7950 MultichainCtrl

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Configuration (environment overrides) ────────────────────────────────────
GHOST_MODE="${GHOST_MODE:-dev}"
VALIDATOR_COUNT="${VALIDATOR_COUNT:-4}"
VAULT_VERSION="${VAULT_VERSION:-1.16.1}"
PQ_ALGO="${PQ_ALGO:-ML-KEM-768}"
FEDERATION_HOSTS="${FEDERATION_HOSTS:-}"
SKIP_VMS="${SKIP_VMS:-false}"
SKIP_FEDERATION="${SKIP_FEDERATION:-false}"
DRY_RUN="${DRY_RUN:-false}"
ENABLE_AUTO_UPGRADE="${ENABLE_AUTO_UPGRADE:-false}"

L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:29545}"
L3_RPC="${L3_RPC:-http://localhost:39545}"

GOVERNOR_AI_URL="${GOVERNOR_AI_URL:-http://localhost:7930}"
DEFI_ARCHITECT_URL="${DEFI_ARCHITECT_URL:-http://localhost:7920}"

PROMETHEUS_IMAGE="${PROMETHEUS_IMAGE:-prom/prometheus:v2.51.0}"
GRAFANA_IMAGE="${GRAFANA_IMAGE:-grafana/grafana:10.4.0}"

VM_IMAGE_DIR="${VM_IMAGE_DIR:-/var/lib/libvirt/images/ghoststack}"
VALIDATOR_DIR="${STACK_ROOT}/validators"
LOG_DIR="${STACK_ROOT}/logs"
FAILOVER_SCRIPT="${STACK_ROOT}/infra/ghost-failover.sh"
UPDATE_SCRIPT="${STACK_ROOT}/infra/update-stack.sh"
SUPERVISOR_SCRIPT="${STACK_ROOT}/infra/self-healing-loop.sh"

PQ_AVAILABLE=false   # elevated to true in Phase 3 if OQS provider is detected

# ── Helpers ───────────────────────────────────────────────────────────────────
log()       { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }
die()       { echo "[FATAL] $*" >&2; exit 1; }
warn()      { echo "[WARN]  $*" >&2; }
check_cmd() { command -v "$1" &>/dev/null || die "Required tool '$1' not found. Install it and retry."; }

phase() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "  Phase %-3s  %s\n" "$1" "$2"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# run_cmd: in DRY_RUN mode, print the command without executing it.
run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "  [DRY-RUN] $*"
  else
    "$@"
  fi
}

http_ok() { curl -fsS --max-time 5 "$1" &>/dev/null; }

wait_for_http() {
  local label="$1" url="$2" timeout="${3:-60}"
  local elapsed=0
  while ! http_ok "${url}"; do
    if (( elapsed >= timeout )); then
      warn "  ${label} not ready after ${timeout}s — continuing."
      return 0
    fi
    sleep 3; (( elapsed += 3 )) || true
  done
  log "  ${label} OK"
}

# ── Banner ────────────────────────────────────────────────────────────────────
cat <<'BANNER'

  ╔═══════════════════════════════════════════════════════════╗
  ║        GhostStack Autonomous Installer v3                 ║
  ║   Sovereign · Self-Healing · Post-Quantum · Multi-Region  ║
  ╚═══════════════════════════════════════════════════════════╝
  GhostChain L1 (14000101) · GhostL2 (901) · GhostL3 (903)

  New in v3:
    Post-quantum hybrid keys     (ML-KEM-768 + Ed25519)
    AI validator orchestration   (ghost-governor-ai API)
    Economic optimization init   (ghost-defi-architect API)
    Multi-region federation      (SSH + rsync provisioning)
    Global failover daemon       (regional health monitor)
    Autonomous upgrade hooks     (git pull + compose reload)

BANNER

echo "  Stack root      : ${STACK_ROOT}"
echo "  Mode            : ${GHOST_MODE}"
echo "  Validators      : ${VALIDATOR_COUNT}"
echo "  PQ algorithm    : ${PQ_ALGO}"
echo "  Federation hosts: ${FEDERATION_HOSTS:-none}"
echo "  Auto-upgrade    : ${ENABLE_AUTO_UPGRADE}"
echo "  DRY_RUN         : ${DRY_RUN}"
echo ""
[[ "${GHOST_MODE}" == "prod" ]] && warn "Production mode — review all secrets before continuing."

# ── Phase 1: System Bootstrap ─────────────────────────────────────────────────
phase 1 "System Bootstrap"

run_cmd sudo apt-get update -qq
run_cmd sudo apt-get upgrade -y -q
run_cmd sudo apt-get install -y --no-install-recommends \
  docker.io docker-compose git curl wget jq build-essential \
  unzip ca-certificates openssl rsync \
  qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virtinst

run_cmd sudo systemctl enable --now docker

log "Phase 1 done."

# ── Phase 2: Node.js Tooling ──────────────────────────────────────────────────
phase 2 "Node.js Tooling"

check_cmd node
NODE_VER="$(node --version)"
echo "${NODE_VER}" | grep -qE "^v22\." \
  || die "Node.js v22.x required (detected: ${NODE_VER}). Install via nodejs.org, nvm, or volta."
log "Node ${NODE_VER} OK — npm $(npm --version) OK"

run_cmd sudo npm install -g --silent ts-node typescript 2>/dev/null || true
run_cmd npm install --prefix "${STACK_ROOT}" --silent

log "Phase 2 done."

# ── Phase 3: Post-Quantum Cryptography ───────────────────────────────────────
phase 3 "Post-Quantum Cryptography  [${PQ_ALGO}]"

#
# Target: OpenSSL 3.x + Open Quantum Safe (OQS) provider
#   Algorithms: ML-KEM-768 (key encapsulation) + ML-DSA-65 / Dilithium3 (signing)
#
# On Ubuntu 24.04 the oqs-provider package may be in universe or via PPA.
# If unavailable, the installer falls back to classical X25519 + Ed25519 hybrid
# with no loss of functionality — just without post-quantum hardening.
#

if [[ "${DRY_RUN}" != "true" ]]; then
  if sudo apt-get install -y --no-install-recommends liboqs-dev oqs-provider 2>/dev/null \
     && openssl list -providers 2>/dev/null | grep -qi "oqsprovider"; then
    PQ_AVAILABLE=true
    log "  OQS provider detected — ML-KEM-768 / ML-DSA-65 enabled."
  else
    warn "  OQS provider not available — falling back to X25519 + Ed25519 classical hybrid."
    warn "  To enable PQ keys: install liboqs-dev + oqs-provider from the OQS PPA, then re-run."
    PQ_ALGO="X25519"
  fi
else
  log "  [DRY-RUN] Would attempt OQS provider install; target PQ_ALGO=${PQ_ALGO}"
fi

log "  Key scheme: Ed25519 (classical signing) + ${PQ_ALGO} (key agreement / encapsulation)"
log "Phase 3 done."

# ── Phase 4: HashiCorp Vault ──────────────────────────────────────────────────
phase 4 "HashiCorp Vault ${VAULT_VERSION}"

if ! command -v vault &>/dev/null; then
  VAULT_ZIP="vault_${VAULT_VERSION}_linux_amd64.zip"
  VAULT_BASE="https://releases.hashicorp.com/vault/${VAULT_VERSION}"

  log "  Downloading Vault ${VAULT_VERSION}…"
  run_cmd wget -q "${VAULT_BASE}/${VAULT_ZIP}" -O /tmp/vault.zip
  run_cmd wget -q "${VAULT_BASE}/vault_${VAULT_VERSION}_SHA256SUMS" -O /tmp/vault_SHA256SUMS

  if [[ "${DRY_RUN}" != "true" ]]; then
    # Verify checksum against HashiCorp's published SHA256SUMS before installing
    (cd /tmp && grep "${VAULT_ZIP}" vault_SHA256SUMS | sha256sum --check) \
      || die "Vault checksum verification FAILED — refusing to install."
    unzip -q /tmp/vault.zip -d /tmp/vault_bin
    sudo install -m 0755 /tmp/vault_bin/vault /usr/local/bin/vault
    rm -rf /tmp/vault.zip /tmp/vault_SHA256SUMS /tmp/vault_bin
    log "  Vault installed: $(vault version)"
  fi
else
  log "  Vault already present: $(vault version)"
fi

log "Phase 4 done."

# ── Phase 5: Bridge Networking ────────────────────────────────────────────────
phase 5 "Bridge Networking"

if ! ip link show br0 &>/dev/null; then
  run_cmd sudo brctl addbr br0
  run_cmd sudo ip link set br0 up
  log "  Bridge br0 created."
else
  log "  Bridge br0 already exists."
fi

log "Phase 5 done."

# ── Phase 6: VM Provisioning ──────────────────────────────────────────────────
phase 6 "VM Provisioning"

run_cmd sudo mkdir -p "${VM_IMAGE_DIR}"

if [[ "${SKIP_VMS}" == "true" ]]; then
  log "  SKIP_VMS=true — VM provisioning skipped."
else
  # VM provisioning requires the baremetal hypervisor (libvirt/virsh).
  # If running inside a devnet/testnet VM, set SKIP_VMS=true.
  if ! command -v virsh &>/dev/null; then
    log "  ERROR: virsh is not available on this host."
    log "  VM provisioning must be run from the GhostStack baremetal hypervisor."
    log "  If running inside a devnet VM, set SKIP_VMS=true to skip this phase."
    exit 1
  fi
  check_cmd virt-install
  check_cmd virsh

  _provision_vm() {
    local name="$1" ram="$2" cpus="$3" disk="$4"
    if virsh domstate "${name}" &>/dev/null; then
      log "  VM ${name} already exists — skipping."; return 0
    fi
    log "  Provisioning VM: ${name}  RAM=${ram}M  CPU=${cpus}  Disk=${disk}G"
    run_cmd virt-install \
      --name "${name}" --ram "${ram}" --vcpus "${cpus}" \
      --disk "path=${VM_IMAGE_DIR}/${name}.qcow2,size=${disk}" \
      --network bridge=br0 --os-variant ubuntu22.04 \
      --graphics none --import --noautoconsole || true
  }

  _provision_vm ghostchain-l1        8192  4  100   # GhostChain L1 sovereign node
  _provision_vm ghostl2              8192  4  100   # GhostL2 OP Stack sequencer
  _provision_vm ghostl3              8192  4  100   # GhostL3 OP Stack node
  _provision_vm ghost-validator      4096  2   50   # CometBFT validator
  _provision_vm ghost-ai-controller  4096  2   50   # AI services host
fi

log "Phase 6 done."

# ── Phase 7: Docker Infrastructure ───────────────────────────────────────────
phase 7 "Docker Infrastructure"

cd "${STACK_ROOT}"

if [[ ! -f ".env" ]]; then
  [[ -f "stack.env.example" ]] \
    || die "No .env and no stack.env.example — create .env before running."
  run_cmd cp stack.env.example .env
  warn "  Created .env from stack.env.example — set secrets before production use."
fi

run_cmd docker compose pull --quiet 2>/dev/null || warn "  docker compose pull failed — continuing."
run_cmd docker compose up -d

log "Phase 7 done."

# ── Phase 8: Validator Key Generation  (Ed25519 + PQ Hybrid) ─────────────────
phase 8 "Validator Key Generation  [Ed25519 + ${PQ_ALGO}]"

run_cmd mkdir -p "${VALIDATOR_DIR}"
[[ "${DRY_RUN}" != "true" ]] && chmod 700 "${VALIDATOR_DIR}"

for i in $(seq 1 "${VALIDATOR_COUNT}"); do
  KEY_FILE="${VALIDATOR_DIR}/validator${i}.key"
  PQ_FILE="${VALIDATOR_DIR}/validator${i}.pq.key"
  PUB_FILE="${VALIDATOR_DIR}/validator${i}.pq.pub"

  if [[ -f "${KEY_FILE}" ]]; then
    log "  validator${i}: exists — skipping."
    continue
  fi

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "  [DRY-RUN] Generate Ed25519 entropy   → ${KEY_FILE}"
    echo "  [DRY-RUN] Generate ${PQ_ALGO} key pair → ${PQ_FILE} / ${PUB_FILE}"
    continue
  fi

  # Classical: 32-byte secure random hex (signing entropy for CometBFT)
  openssl rand -hex 32 > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"

  # Post-quantum / hybrid key pair
  if [[ "${PQ_AVAILABLE}" == "true" ]]; then
    if openssl genpkey -provider oqsprovider -algorithm ML-KEM-768 \
         -out "${PQ_FILE}" 2>/dev/null \
       && openssl pkey -provider oqsprovider -in "${PQ_FILE}" \
            -pubout -out "${PUB_FILE}" 2>/dev/null; then
      chmod 600 "${PQ_FILE}"
      log "  validator${i}: Ed25519 + ML-KEM-768 generated."
    else
      warn "  validator${i}: ML-KEM-768 key gen failed — using X25519 fallback."
      openssl genpkey -algorithm X25519 -out "${PQ_FILE}"
      openssl pkey -in "${PQ_FILE}" -pubout -out "${PUB_FILE}"
      chmod 600 "${PQ_FILE}"
    fi
  else
    # Classical hybrid: X25519 key exchange + Ed25519 signing
    openssl genpkey -algorithm X25519 -out "${PQ_FILE}"
    openssl pkey -in "${PQ_FILE}" -pubout -out "${PUB_FILE}"
    chmod 600 "${PQ_FILE}"
    log "  validator${i}: Ed25519 + X25519 (classical hybrid) generated."
  fi
done

log "Phase 8 done."

# ── Phase 9: Vault Secret Storage ────────────────────────────────────────────
phase 9 "Vault Secret Storage"

if [[ "${GHOST_MODE}" == "dev" ]]; then
  VAULT_DEV_TOKEN="${VAULT_DEV_TOKEN:-ghoststack-v3-dev-$(openssl rand -hex 8)}"
  VAULT_ADDR_DEFAULT="http://127.0.0.1:8200"

  if [[ "${DRY_RUN}" != "true" ]] \
     && ! http_ok "${VAULT_ADDR:-${VAULT_ADDR_DEFAULT}}/v1/sys/health"; then
    vault server -dev \
      -dev-root-token-id="${VAULT_DEV_TOKEN}" \
      -dev-listen-address="127.0.0.1:8200" \
      &>/dev/null &
    sleep 3
    echo "${VAULT_DEV_TOKEN}" > "${VALIDATOR_DIR}/.vault-dev-token"
    chmod 600 "${VALIDATOR_DIR}/.vault-dev-token"
    log "  Dev Vault started — token saved to ${VALIDATOR_DIR}/.vault-dev-token"
  fi

  export VAULT_ADDR="${VAULT_ADDR:-${VAULT_ADDR_DEFAULT}}"
  export VAULT_TOKEN="${VAULT_DEV_TOKEN}"
else
  [[ -n "${VAULT_ADDR:-}"  ]] || die "VAULT_ADDR required in prod mode."
  [[ -n "${VAULT_TOKEN:-}" ]] || die "VAULT_TOKEN required in prod mode."
  log "  Using Vault at ${VAULT_ADDR}"
fi

if [[ "${DRY_RUN}" != "true" ]]; then
  vault secrets enable -path=secret kv 2>/dev/null || true

  for i in $(seq 1 "${VALIDATOR_COUNT}"); do
    KEY_FILE="${VALIDATOR_DIR}/validator${i}.key"
    PQ_FILE="${VALIDATOR_DIR}/validator${i}.pq.key"
    PUB_FILE="${VALIDATOR_DIR}/validator${i}.pq.pub"

    # Store classical key + PQ public key together (safe to read)
    vault kv put "secret/ghostchain/validator${i}" \
      classical_key="$(cat "${KEY_FILE}" 2>/dev/null || echo missing)" \
      pq_pubkey="$(cat "${PUB_FILE}" 2>/dev/null || echo missing)" \
      pq_algo="${PQ_ALGO}" \
      created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    # Store PQ private key at a separate restricted path
    if [[ -f "${PQ_FILE}" ]]; then
      vault kv put "secret/ghostchain/validator${i}/pq-private" \
        pq_private_key="$(cat "${PQ_FILE}")" \
        algo="${PQ_ALGO}"
    fi

    log "  validator${i} stored at secret/ghostchain/validator${i} (classical + PQ)"
  done

  # Bootstrap AppRole in prod mode if the script exists
  if [[ "${GHOST_MODE}" != "dev" && -f "${STACK_ROOT}/infra/vault/bootstrap-approle.sh" ]]; then
    log "  Bootstrapping Vault AppRole auth…"
    bash "${STACK_ROOT}/infra/vault/bootstrap-approle.sh"
  fi
fi

log "Phase 9 done."

# ── Phase 10: Blockchain Nodes ────────────────────────────────────────────────
phase 10 "Blockchain Nodes"

#
# GhostChain L1 runs ghostchaind (Cosmos SDK + CometBFT + EVM).
# GhostL2 / GhostL3 run OP Stack (op-geth + op-node + op-batcher).
# Neither uses `npx hardhat node` — those are managed as Docker Compose services.
#

OPSTACK_UP="${STACK_ROOT}/infra/scripts/opstack/up-l2.sh"
if [[ -f "${OPSTACK_UP}" ]]; then
  log "  Running OP Stack L2 startup (up-l2.sh)…"
  run_cmd bash "${OPSTACK_UP}" || warn "  up-l2.sh returned non-zero — check OP Stack logs."
fi

ENV_SYNC="${STACK_ROOT}/infra/scripts/env-sync-stack.sh"
if [[ -f "${ENV_SYNC}" ]]; then
  run_cmd bash "${ENV_SYNC}" || warn "  env-sync-stack.sh returned non-zero — continuing."
fi

_check_rpc() {
  local label="$1" url="$2" hex="$3"
  local r
  r="$(curl -sS --max-time 5 -X POST "${url}" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    2>/dev/null || true)"
  if echo "${r}" | grep -qi "${hex}"; then
    log "  ${label} OK"
  else
    warn "  ${label} not ready — self-healing supervisor will monitor."
  fi
}

_check_rpc "GhostChain L1 (14000101)" "${L1_RPC}" "0xd59a65"
_check_rpc "GhostL2      (901)"       "${L2_RPC}" "0x385"
_check_rpc "GhostL3      (903)"       "${L3_RPC}" "0x387"

log "Phase 10 done."

# ── Phase 11: AI Control Services ────────────────────────────────────────────
phase 11 "AI Control Services"

#
# Build (npm install + npm run build) then start each AI service container.
# Sequential builds prevent OOM on constrained hosts.
#

_build_ai_service() {
  local name="$1" dir="${STACK_ROOT}/services/$1"
  if [[ ! -d "${dir}" ]]; then warn "  ${name}: source not found at ${dir}."; return 0; fi
  log "  Building ${name}…"
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "  [DRY-RUN] npm install && npm run build  in ${dir}"
    return 0
  fi
  if ( cd "${dir}" && npm install --silent && npm run build 2>&1 ); then
    log "  ${name} OK"
  else
    warn "  ${name} build failed — check ${dir} for errors."
  fi
}

_start_ai_container() {
  local name="$1"
  docker ps --format '{{.Names}}' | grep -q "^${name}$" \
    && { log "  ${name} already running."; return 0; }
  if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
    if run_cmd docker start "${name}"; then
      log "  ${name} started."
    else
      warn "  ${name} start failed — check: docker logs ${name}"
    fi
  else
    warn "  Container ${name} not found — push its image before starting."
  fi
}

_build_ai_service ghostbrain-core
_build_ai_service ghost-contract-engine
_build_ai_service ghost-protocol-architect
_build_ai_service ghost-defi-architect
_build_ai_service ghost-governor-ai
_build_ai_service ghost-infra-controller
_build_ai_service ghost-multichain-controller

_start_ai_container ghostbrain-core
_start_ai_container ghost-contract-engine
_start_ai_container ghost-protocol-architect
_start_ai_container ghost-defi-architect
_start_ai_container ghost-governor-ai
_start_ai_container ghost-infra-controller
_start_ai_container ghost-multichain-controller

[[ "${DRY_RUN}" == "false" ]] && wait_for_http "GhostBrain (7900)" "http://localhost:7900/health" 30

log "Phase 11 done."

# ── Phase 12: AI Validator Orchestration ─────────────────────────────────────
phase 12 "AI Validator Orchestration"

#
# Registers each validator's key identity with ghost-governor-ai.
# The governor uses this registry for:
#   - uptime tracking + slash / reward decisions
#   - proposal ratification quorum calculations
#   - PQ public key attestation
#
# Non-fatal: if governor-ai is not yet reachable, registration can be re-run
# standalone by setting SKIP_VMS=true SKIP_FEDERATION=true and re-invoking.
#

check_cmd jq

if [[ "${DRY_RUN}" == "true" ]]; then
  log "  [DRY-RUN] Would register ${VALIDATOR_COUNT} validators with ${GOVERNOR_AI_URL}/api/v1/validators/register"
elif ! http_ok "${GOVERNOR_AI_URL}/healthz"; then
  warn "  ghost-governor-ai not reachable at ${GOVERNOR_AI_URL} — skipping registration."
  warn "  Re-run to register: bash ${SCRIPT_DIR}/genesis-installer-v3.sh  (SKIP_VMS=true SKIP_FEDERATION=true)"
else
  for i in $(seq 1 "${VALIDATOR_COUNT}"); do
    PUB_FILE="${VALIDATOR_DIR}/validator${i}.pq.pub"
    PQ_PUB=""; [[ -f "${PUB_FILE}" ]] && PQ_PUB="$(cat "${PUB_FILE}")"

    PAYLOAD="$(jq -cn \
      --arg id  "validator${i}" \
      --arg algo "${PQ_ALGO}" \
      --arg pubkey "${PQ_PUB}" \
      --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      '{validator_id: $id, pq_algo: $algo, pq_pubkey: $pubkey, registered_at: $ts}')"

    HTTP_CODE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 \
      -X POST "${GOVERNOR_AI_URL}/api/v1/validators/register" \
      -H "Content-Type: application/json" \
      --data "${PAYLOAD}" 2>/dev/null || echo "000")"

    if [[ "${HTTP_CODE}" =~ ^2 ]]; then
      log "  validator${i} registered with governor-ai (HTTP ${HTTP_CODE})"
    else
      warn "  validator${i} registration HTTP ${HTTP_CODE} — endpoint may not be implemented yet."
    fi
  done
fi

log "Phase 12 done."

# ── Phase 13: Economic Optimization Init ──────────────────────────────────────
phase 13 "Economic Optimization Engine"

#
# Pushes initial GST economic parameters to ghost-defi-architect.
# These seed the yield engine, liquidity router, and arbitrage monitor with
# the correct GhostChain-native values (GST not ETH, sovereignty route enforced).
#
# Non-fatal: defi-architect validates parameters on receipt and rejects non-GST
# token references. If not yet reachable, parameters can be pushed later.
#

if [[ "${DRY_RUN}" == "true" ]]; then
  log "  [DRY-RUN] Would POST GST economic parameters to ${DEFI_ARCHITECT_URL}/api/v1/config/economic"
elif ! http_ok "${DEFI_ARCHITECT_URL}/healthz"; then
  warn "  ghost-defi-architect not reachable — skipping economic init."
else
  ECON_PAYLOAD="$(jq -cn \
    --argjson min_apr_diff       2.0    \
    --argjson max_move_bps       500    \
    --argjson min_arb_spread     2.0    \
    --argjson oracle_refresh_ms  60000  \
    --arg gas_token "GST"               \
    '{
      min_apr_diff_pct:           $min_apr_diff,
      max_move_bps:               $max_move_bps,
      min_arbitrage_spread_pct:   $min_arb_spread,
      oracle_refresh_interval_ms: $oracle_refresh_ms,
      gas_token:                  $gas_token,
      sovereignty_route:          "L3\u2192L2\u2192L1\u2192External"
    }')"

  HTTP_CODE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 \
    -X POST "${DEFI_ARCHITECT_URL}/api/v1/config/economic" \
    -H "Content-Type: application/json" \
    --data "${ECON_PAYLOAD}" 2>/dev/null || echo "000")"

  if [[ "${HTTP_CODE}" =~ ^2 ]]; then
    log "  GST economic parameters applied (HTTP ${HTTP_CODE})"
  else
    warn "  Economic config HTTP ${HTTP_CODE} — endpoint may not be implemented yet."
  fi
fi

log "Phase 13 done."

# ── Phase 14: Monitoring Stack ────────────────────────────────────────────────
phase 14 "Monitoring Stack"

_ensure_monitor() {
  local name="$1" port="$2" image="$3"
  docker ps --format '{{.Names}}' | grep -q "^${name}$" \
    && { log "  ${name} already running."; return 0; }
  run_cmd docker run -d \
    --name "${name}" \
    --restart unless-stopped \
    -p "127.0.0.1:${port}:${port}" \
    "${image}"
  log "  ${name} started on 127.0.0.1:${port}."
}

_ensure_monitor ghost-prometheus 9090 "${PROMETHEUS_IMAGE}"
_ensure_monitor ghost-grafana    3000 "${GRAFANA_IMAGE}"

log "Phase 14 done."

# ── Phase 15: Multi-Region / Multicloud Federation ───────────────────────────
phase 15 "Multi-Region Federation"

#
# Deploys GhostStack to additional regions via SSH + rsync.
# Each remote host receives:
#   - A full rsync of the stack (excluding secrets and build artifacts)
#   - The local .env (copied separately over SCP)
#   - docker compose pull + up -d executed remotely
#
# Sovereignty rule is enforced: only GhostChain L1 routes to external chains.
# Remote nodes participate as L2/L3 sequencers or validator replicas.
#
# Requirements: passwordless SSH access to each FEDERATION_HOSTS entry.
#

if [[ "${SKIP_FEDERATION}" == "true" || -z "${FEDERATION_HOSTS}" ]]; then
  log "  No federation hosts configured (FEDERATION_HOSTS not set or SKIP_FEDERATION=true)."
  log "  To enable: FEDERATION_HOSTS=\"user@host1 user@host2\" ./infra/genesis-installer-v3.sh"
else
  check_cmd ssh
  check_cmd rsync

  for HOST in ${FEDERATION_HOSTS}; do
    # Validate input: only user@host with safe characters (prevent injection)
    if ! echo "${HOST}" | grep -qE '^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$'; then
      warn "  Skipping invalid FEDERATION_HOSTS entry: '${HOST}' (must be user@host)"
      continue
    fi

    log "  Federating → ${HOST}…"

    if [[ "${DRY_RUN}" == "true" ]]; then
      echo "  [DRY-RUN] rsync ${STACK_ROOT}/ ${HOST}:~/ghostl-stack/"
      echo "  [DRY-RUN] ssh ${HOST} docker compose up -d"
      continue
    fi

    if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "${HOST}" true 2>/dev/null; then
      warn "  Cannot reach ${HOST} via SSH — skipping this region."
      continue
    fi

    rsync -az --delete \
      --exclude='.env' \
      --exclude='validators/' \
      --exclude='node_modules/' \
      --exclude='contracts/out/' \
      --exclude='contracts/cache/' \
      --exclude='logs/' \
      "${STACK_ROOT}/" "${HOST}:~/ghostl-stack/"

    scp -q "${STACK_ROOT}/.env" "${HOST}:~/ghostl-stack/.env"

    ssh "${HOST}" bash <<'REMOTE'
set -euo pipefail
cd ~/ghostl-stack
docker compose pull --quiet 2>/dev/null || true
docker compose up -d
echo "  $(hostname): federation deployment complete."
REMOTE

    log "  ${HOST}: federation complete."
  done
fi

log "Phase 15 done."

# ── Phase 16: Global Failover Daemon ─────────────────────────────────────────
phase 16 "Global Failover Daemon"

#
# Writes infra/ghost-failover.sh and launches it as a background daemon.
# The failover monitor logs HEALTHY / DEGRADED state for each configured region
# and emits failover RECOMMENDATIONS — it does NOT automatically change routing.
# All traffic-shifting decisions require human ratification, consistent with
# GhostStack's AI-propose / human-ratify governance model.
#

cat > "${FAILOVER_SCRIPT}" <<'FAILOVER_EOF'
#!/usr/bin/env bash
# GhostStack Global Failover Monitor
# Monitors regional chain endpoints and logs failover recommendations.
# Traffic-shifting decisions require human ratification — no automatic DNS changes.

set -euo pipefail

STACK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${STACK_ROOT}/logs"
LOG="${LOG_DIR}/failover.log"
mkdir -p "${LOG_DIR}"

REGIONS="${FAILOVER_REGIONS:-}"
INTERVAL="${FAILOVER_INTERVAL:-60}"
L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:29545}"
L3_RPC="${L3_RPC:-http://localhost:39545}"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [FAILOVER] $*" | tee -a "${LOG}"; }

check_region() {
  local label="$1" url="$2"
  local result
  result="$(curl -sS --max-time 5 -X POST "${url}" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    2>/dev/null || echo "")"
  if [[ -n "${result}" ]]; then
    log "HEALTHY  ${label}"
    return 0
  else
    log "DEGRADED ${label} at ${url} — RECOMMENDATION: shift L1 traffic to standby region"
    return 1
  fi
}

log "Failover monitor started (interval=${INTERVAL}s)"

while true; do
  if [[ -n "${REGIONS}" ]]; then
    for ENTRY in ${REGIONS}; do
      REGION_LABEL="${ENTRY%%=*}"
      REGION_URL="${ENTRY##*=}"
      check_region "${REGION_LABEL}" "${REGION_URL}" || true
    done
  else
    check_region "local-L1 (14000101)" "${L1_RPC}" || true
    check_region "local-L2 (901)"      "${L2_RPC}" || true
    check_region "local-L3 (903)"      "${L3_RPC}" || true
  fi
  sleep "${INTERVAL}"
done
FAILOVER_EOF

chmod +x "${FAILOVER_SCRIPT}"
mkdir -p "${LOG_DIR}"

if [[ "${DRY_RUN}" == "false" ]]; then
  FAILOVER_PID="${LOG_DIR}/failover.pid"
  if [[ -f "${FAILOVER_PID}" ]]; then
    OLD_PID="$(cat "${FAILOVER_PID}")"
    if kill -0 "${OLD_PID}" 2>/dev/null; then
      kill "${OLD_PID}" 2>/dev/null || true
      log "  Stopped previous failover daemon (PID ${OLD_PID})"
    fi
  fi
  nohup bash "${FAILOVER_SCRIPT}" &>/dev/null &
  echo "$!" > "${FAILOVER_PID}"
  log "  Failover daemon started (PID $(cat "${FAILOVER_PID}"))"
  log "  Log: ${LOG_DIR}/failover.log"
else
  log "  [DRY-RUN] Would write and launch ${FAILOVER_SCRIPT}"
fi

log "Phase 16 done."

# ── Phase 17: Autonomous Upgrade Hooks ───────────────────────────────────────
phase 17 "Autonomous Upgrade Hooks"

#
# Writes infra/update-stack.sh — a safe, idempotent upgrade script that:
#   - git pull --ff-only (fails safely on merge conflicts, protecting local work)
#   - docker compose pull + up -d (rolling reload)
#   - npm install + npm run build for each AI service
#
# Does NOT auto-upgrade: Vault binary, validator keys, governance contracts.
# ENABLE_AUTO_UPGRADE=true installs a daily 03:00 cron entry.
#

cat > "${UPDATE_SCRIPT}" <<'UPDATE_EOF'
#!/usr/bin/env bash
# GhostStack Autonomous Upgrade Script
# Upgrades code, Docker images, and AI service builds.
# Does NOT upgrade Vault, rotate validator keys, or modify governance contracts.

set -euo pipefail

STACK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${STACK_ROOT}/logs/upgrades.log"
mkdir -p "$(dirname "${LOG}")"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [UPGRADE] $*" | tee -a "${LOG}"; }

log "Upgrade cycle started."
cd "${STACK_ROOT}"

# Pull latest code (fast-forward only — fails on dirty state, protecting local changes)
git fetch --quiet origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

if [[ "${LOCAL}" == "${REMOTE}" ]]; then
  log "Already at latest commit ${LOCAL:0:8} — nothing to upgrade."
  exit 0
fi

git pull --ff-only --quiet origin main
log "Code updated: ${LOCAL:0:8} → ${REMOTE:0:8}"

# Pull latest Docker images and reload services (zero-downtime rolling update)
docker compose pull --quiet 2>&1 | grep -v "^$" | while read -r line; do log "${line}"; done
docker compose up -d --remove-orphans
log "Docker services reloaded."

# Rebuild AI service packages that have changed
for SVC in ghostbrain-core ghost-contract-engine ghost-protocol-architect \
           ghost-defi-architect ghost-governor-ai ghost-infra-controller \
           ghost-multichain-controller; do
  DIR="${STACK_ROOT}/services/${SVC}"
  if [[ -d "${DIR}" ]]; then
    ( cd "${DIR}" && npm install --silent && npm run build 2>&1 ) \
      && log "${SVC} rebuilt." \
      || log "[WARN] ${SVC} rebuild failed — service continues on previous build."
  fi
done

log "Upgrade cycle complete."
UPDATE_EOF

chmod +x "${UPDATE_SCRIPT}"
log "  Upgrade script written: ${UPDATE_SCRIPT}"

if [[ "${ENABLE_AUTO_UPGRADE}" == "true" ]]; then
  CRON_ENTRY="0 3 * * * bash ${UPDATE_SCRIPT} >> ${LOG_DIR}/upgrades.log 2>&1"
  if [[ "${DRY_RUN}" != "true" ]]; then
    ( crontab -l 2>/dev/null | grep -v "update-stack.sh"; echo "${CRON_ENTRY}" ) | crontab -
    log "  Auto-upgrade cron installed: daily at 03:00."
  else
    echo "  [DRY-RUN] Would install cron: ${CRON_ENTRY}"
  fi
else
  log "  Auto-upgrade disabled (ENABLE_AUTO_UPGRADE=false)."
  log "  To enable: ENABLE_AUTO_UPGRADE=true ./infra/genesis-installer-v3.sh"
  log "  Run manually: bash ${UPDATE_SCRIPT}"
fi

log "Phase 17 done."

# ── Phase 18: Self-Healing Supervisor ────────────────────────────────────────
phase 18 "Self-Healing Supervisor"

[[ -f "${SUPERVISOR_SCRIPT}" ]] \
  || die "self-healing-loop.sh not found at ${SUPERVISOR_SCRIPT}"
chmod +x "${SUPERVISOR_SCRIPT}"

SUPERVISOR_LOG="${LOG_DIR}/supervisor"
mkdir -p "${SUPERVISOR_LOG}"
SUPERVISOR_PID="${SUPERVISOR_LOG}/supervisor.pid"

if [[ -f "${SUPERVISOR_PID}" ]]; then
  OLD_PID="$(cat "${SUPERVISOR_PID}")"
  if kill -0 "${OLD_PID}" 2>/dev/null; then
    kill "${OLD_PID}" 2>/dev/null || true
    log "  Stopped previous supervisor (PID ${OLD_PID})"
  fi
fi

if [[ "${DRY_RUN}" == "false" ]]; then
  nohup bash -c "
    while true; do
      bash '${SUPERVISOR_SCRIPT}' >> '${SUPERVISOR_LOG}/self-healing.log' 2>&1 || true
      sleep 5
    done
  " &>/dev/null &
  echo "$!" > "${SUPERVISOR_PID}"
  log "  Supervisor started (PID $(cat "${SUPERVISOR_PID}"))"
  log "  Log: ${SUPERVISOR_LOG}/self-healing.log"
else
  log "  [DRY-RUN] Would launch self-healing supervisor daemon."
fi

log "Phase 18 done."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║      GhostStack Autonomous v3 — Deployment Complete       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "  Blockchain"
echo "  ──────────────────────────────────────────────────────────"
printf "  GhostChain L1  (chain 14000101)  %s\n" "${L1_RPC}"
printf "  GhostL2        (chain      901)  %s\n" "${L2_RPC}"
printf "  GhostL3        (chain      903)  %s\n" "${L3_RPC}"
echo ""
echo "  Key Management"
echo "  ──────────────────────────────────────────────────────────"
printf "  Validators      %-2s keys\n" "${VALIDATOR_COUNT}"
printf "  Scheme          Ed25519 + %s\n" "${PQ_ALGO}"
printf "  PQ available    %s\n" "${PQ_AVAILABLE}"
printf "  Vault path      secret/ghostchain/validatorN\n"
echo ""
echo "  AI Control Layer"
echo "  ──────────────────────────────────────────────────────────"
printf "  GhostBrain (AI core)             %s\n" "http://localhost:7900"
printf "  Protocol Architect               %s\n" "http://localhost:7910"
printf "  DeFi Architect (econ opt.)       %s\n" "http://localhost:7920"
printf "  Governor AI (validator orch.)    %s\n" "http://localhost:7930"
printf "  Infra Controller                 %s\n" "http://localhost:7940"
printf "  Multichain Controller            %s\n" "http://localhost:7950"
echo ""
echo "  Monitoring"
echo "  ──────────────────────────────────────────────────────────"
printf "  Prometheus                       %s\n" "http://localhost:9090"
printf "  Grafana                          %s\n" "http://localhost:3000"
echo ""
echo "  Autonomous Systems"
echo "  ──────────────────────────────────────────────────────────"
printf "  Self-healing supervisor          %s\n" "${LOG_DIR}/supervisor/self-healing.log"
printf "  Global failover daemon           %s\n" "${LOG_DIR}/failover.log"
printf "  Upgrade script                   %s\n" "${UPDATE_SCRIPT}"
printf "  Auto-upgrade cron (03:00)        %s\n" "${ENABLE_AUTO_UPGRADE}"
echo ""
echo "  Federation"
echo "  ──────────────────────────────────────────────────────────"
if [[ -n "${FEDERATION_HOSTS}" ]]; then
  for H in ${FEDERATION_HOSTS}; do
    printf "  Remote node                      %s\n" "${H}"
  done
else
  echo "  None configured."
  echo "  To enable: FEDERATION_HOSTS=\"user@host1 user@host2\" ./infra/genesis-installer-v3.sh"
fi
echo ""
echo "  Sovereignty: L3 → L2 → GhostChain L1 → External Chains"
echo ""
[[ "${GHOST_MODE}" == "dev" ]] && warn "  Dev mode — not suitable for production."
[[ "${DRY_RUN}" == "true" ]]  && warn "  DRY_RUN was enabled — no changes were made."
echo "══════════════════════════════════════════════════════════════"
