#!/usr/bin/env bash
# =============================================================
# GhostStack — ghostl3-provision.sh
# Idempotent in-VM provisioner for GhostL3 OP Stack nodes.
#
# ROUTING LAW (non-negotiable):
#   L3 settles to L2 ONLY (10.50.20.x).
#   L3 direct access to L1 (10.50.10.x) is FORBIDDEN.
#   nftables on the hypervisor enforces this at the network level.
#
# Usage:
#   sudo bash ghostl3-provision.sh <mainnet|testnet>
# =============================================================
set -euo pipefail

NET="${1:?Usage: $0 <mainnet|testnet>}"
[[ "$NET" == "mainnet" || "$NET" == "testnet" ]] \
  || { echo "ERROR: net must be 'mainnet' or 'testnet'"; exit 1; }

REPO_DIR="/opt/ghostl-stack"
ENV_FILE="/etc/ghostl-stack/l3-${NET}.env"
COMPOSE_DIR="${REPO_DIR}/infra/opstack"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.l3.yml"
SERVICE="ghostl3-${NET}"
LOG_PREFIX="[ghostl3-${NET}-provision]"

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
  git clone --depth=1 https://github.com/ghostchain1/ghostl-stack.git "$REPO_DIR"
  ok "Repo cloned."
fi

# ── 3. ROUTING LAW CHECKS ────────────────────────────────────
# Hard abort if env file points L3's parent (L2_RPC) at L1 addresses.
if [[ -f "$ENV_FILE" ]]; then
  if grep -qP 'L2_RPC=http://10\.50\.10\.' "$ENV_FILE" 2>/dev/null; then
    die "ROUTING LAW VIOLATION: L3 L2_RPC is set to an L1 address (10.50.10.x). L3 MUST settle to L2 (10.50.20.x). Aborting."
  fi
fi

# ── 4. Env file ───────────────────────────────────────────────
mkdir -p /etc/ghostl-stack
if [[ ! -f "$ENV_FILE" ]]; then
  warn "Env file not found: ${ENV_FILE}"
  if [[ "$NET" == "mainnet" ]]; then
    L2_IP="10.50.20.10"; L1_IP="10.50.10.10"
    L2_CID="901"; L3_CID="903"
  else
    L2_IP="10.50.20.11"; L1_IP="10.50.10.11"
    L2_CID="902"; L3_CID="904"
  fi
  cat > "$ENV_FILE" <<EOF
# ── GhostL3 ${NET^} ─────────────────────────────────────────
# ROUTING LAW: L3→L2 only. L2_RPC=L2 address. L1_RPC for reference only.
ROUTING_LAW_MODE=strict
L2_RPC=http://${L2_IP}:8545
L1_RPC=http://${L1_IP}:8545
L2_CHAIN_ID=${L2_CID}
L3_CHAIN_ID=${L3_CID}
L3_NAME=ghostl3
L3_DATA_PROFILE=${NET}
L3_INBOX_ADDRESS=0x1e2F4432bFeF9E9Ad39DA6d272F4aFf33629c770
L3_TOKEN_FACTORY_ADDRESS=0x446e7636a5Fa9af46c3718719e465B547248bF62
L2_OUTPUT_ORACLE_ADDRESS=REPLACE_ME
DISPUTE_GAME_FACTORY_ADDRESS=REPLACE_ME
BATCH_INBOX_ADDRESS=REPLACE_ME
SEQUENCER_KEY=REPLACE_ME
BATCHER_KEY=REPLACE_ME
PROPOSER_KEY=REPLACE_ME
CHALLENGER_KEY=REPLACE_ME
L3_SEQUENCER_L1_CONFS=2
OPSTACK_IMAGE_TAG=${NET}
OPSTACK_UID=1000
OPSTACK_GID=1000
CANONICAL_GAS_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
GAS_TOKEN_L3=GST
AI_CONSENSUS_MODE=$([ "$NET" = "mainnet" ] && echo "enforce" || echo "log")
AI_CONSENSUS_FAIL_OPEN=$([ "$NET" = "mainnet" ] && echo "0" || echo "1")
EOF
  chmod 600 "$ENV_FILE"
  warn "Fill in contract addresses and keys in ${ENV_FILE}."
fi

# Re-validate after write
if grep -qP 'L2_RPC=http://10\.50\.10\.' "$ENV_FILE" 2>/dev/null; then
  die "ROUTING LAW VIOLATION detected in env file: L3 L2_RPC → L1 address. Aborting."
fi

if grep -q "REPLACE_ME" "$ENV_FILE"; then
  warn "REPLACE_ME placeholders in ${ENV_FILE} — L3 sequencer will not start correctly."
fi

# ── 5. Data directories ───────────────────────────────────────
mkdir -p "${COMPOSE_DIR}/l3/ghostl3/data-${NET}"
mkdir -p "${COMPOSE_DIR}/l3/ghostl3/config"

# ── 6. Pull images ────────────────────────────────────────────
log "Pulling Docker images for L3-${NET}..."
docker compose \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  pull --quiet || warn "Pull failed — using cached images."
ok "Images ready."

# ── 7. Systemd service ────────────────────────────────────────
UNIT_DEST="/etc/systemd/system/${SERVICE}.service"
if [[ ! -f "$UNIT_DEST" ]]; then
  cat > "$UNIT_DEST" <<UNIT
[Unit]
Description=GhostL3 ${NET^} OP Stack (L3 on GhostL2)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${COMPOSE_DIR}
ExecStart=/usr/bin/docker compose \\
  -f docker-compose.l3.yml \\
  --env-file ${ENV_FILE} \\
  up --remove-orphans
ExecStop=/usr/bin/docker compose \\
  -f docker-compose.l3.yml \\
  down
Restart=always
RestartSec=20
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE}

[Install]
WantedBy=multi-user.target
UNIT
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
