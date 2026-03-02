#!/usr/bin/env bash
# =============================================================
# GhostStack — ghostchain-l1-provision.sh
# Idempotent in-VM provisioner for GhostChain L1 full nodes.
# Run inside the VM as root; safe to re-run for updates.
#
# Usage:
#   sudo bash ghostchain-l1-provision.sh <mainnet|testnet>
#
# Remote update via hypervisor:
#   ssh ghost@<VM-IP> 'sudo bash /opt/ghostl-stack/infra/hypervisor/provision/ghostchain-l1-provision.sh mainnet'
# =============================================================
set -euo pipefail

NET="${1:?Usage: $0 <mainnet|testnet>}"
[[ "$NET" == "mainnet" || "$NET" == "testnet" ]] \
  || { echo "ERROR: net must be 'mainnet' or 'testnet'"; exit 1; }

REPO_DIR="/opt/ghostl-stack"
ENV_FILE="/etc/ghostl-stack/l1-${NET}.env"
COMPOSE_DIR="${REPO_DIR}/infra/ghostchain"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.l1.yml"
SERVICE="ghostl1-${NET}"
LOG_PREFIX="[ghostchain-l1-${NET}-provision]"
GHOSTCHAIN_PATH_PREFIX="${COMPOSE_DIR}"

log()  { echo "${LOG_PREFIX} $*"; }
ok()   { echo "${LOG_PREFIX} ✓ $*"; }
warn() { echo "${LOG_PREFIX} ⚠ $*" >&2; }
die()  { echo "${LOG_PREFIX} ✗ $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Must run as root (sudo bash $0 $NET)"

# ── 1. Install Docker if absent ───────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker CE..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y -q
  apt-get install -y -q \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "Docker installed."
fi

# ── 2. Clone / pull repo ──────────────────────────────────────
if [[ -d "${REPO_DIR}/.git" ]]; then
  log "Pulling latest from repo..."
  git -C "$REPO_DIR" pull --ff-only
  ok "Repo updated."
else
  log "Cloning ghostl-stack repo..."
  git clone --depth=1 https://github.com/ghostchain1/ghostl-stack.git "$REPO_DIR"
  ok "Repo cloned to ${REPO_DIR}."
fi

# ── 3. Verify env file ────────────────────────────────────────
mkdir -p /etc/ghostl-stack
if [[ ! -f "$ENV_FILE" ]]; then
  warn "Env file not found: ${ENV_FILE}"
  log "Installing default from cloud-init template..."
  CLOUD_INIT_ENV="${REPO_DIR}/infra/hypervisor/cloud-init/ghostchain-${NET}-l1.yaml"
  if [[ -f "$CLOUD_INIT_ENV" ]]; then
    # Extract the env block from the cloud-init YAML
    awk '/path: \/etc\/ghostl-stack\/l1-'"${NET}"'\.env/{found=1; next}
         found && /content: \|/{print_block=1; next}
         print_block && /^  [^ ]/{exit}
         print_block{sub(/^      /, ""); print}' "$CLOUD_INIT_ENV" > "$ENV_FILE"
  else
    cat > "$ENV_FILE" <<EOF
# Minimal fallback — fill in real values before use
L1_ENV=${NET}
L1_CHAIN_ID=14000101
GETH_IMAGE=ghostl/geth:alltools-v1.13.14
L1_NODE1_MINING_ENABLED=0
EOF
  fi
  chmod 600 "$ENV_FILE"
fi

if grep -q "REPLACE_ME" "$ENV_FILE"; then
  warn "REPLACE_ME placeholders detected in ${ENV_FILE} — fill in Vault config before starting."
fi

# ── 4. Pull Docker images ─────────────────────────────────────
log "Pulling Docker images for L1 ${NET}..."
GHOSTCHAIN_PATH_PREFIX="$COMPOSE_DIR" \
  docker compose \
    -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    pull --quiet || warn "Image pull failed — will use cached images."
ok "Images ready."

# ── 5. Install and (re)start systemd service ──────────────────
UNIT_SRC="${REPO_DIR}/infra/hypervisor/cloud-init/ghostchain-${NET}-l1.yaml"
UNIT_DEST="/etc/systemd/system/${SERVICE}.service"

# Extract systemd unit from cloud-init YAML if not already present
if [[ ! -f "$UNIT_DEST" ]]; then
  log "Writing systemd unit: ${UNIT_DEST}"
  awk '/path: \/etc\/systemd\/system\/ghostl1-'"${NET}"'\.service/{found=1; next}
       found && /content: \|/{print_block=1; next}
       print_block && /^  [^ ]/{exit}
       print_block{sub(/^      /, ""); print}' "$UNIT_SRC" > "$UNIT_DEST"
  chmod 644 "$UNIT_DEST"
fi

systemctl daemon-reload
systemctl enable "${SERVICE}.service"

if systemctl is-active --quiet "${SERVICE}.service"; then
  log "Restarting ${SERVICE}..."
  systemctl restart "${SERVICE}.service"
else
  log "Starting ${SERVICE}..."
  systemctl start "${SERVICE}.service"
fi

ok "Service ${SERVICE} running."
systemctl status "${SERVICE}.service" --no-pager --lines=5
