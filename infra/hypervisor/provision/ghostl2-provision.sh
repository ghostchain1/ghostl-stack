#!/usr/bin/env bash
# =============================================================
# GhostStack — ghostl2-provision.sh
# Idempotent in-VM provisioner for GhostL2 OP Stack nodes.
# Settles to GhostChain L1 — routing law L2→L1 enforced.
#
# Usage:
#   sudo bash ghostl2-provision.sh <mainnet|testnet>
# =============================================================
set -euo pipefail

NET="${1:?Usage: $0 <mainnet|testnet>}"
[[ "$NET" == "mainnet" || "$NET" == "testnet" ]] \
  || { echo "ERROR: net must be 'mainnet' or 'testnet'"; exit 1; }

REPO_DIR="/opt/ghostl-stack"
ENV_FILE="/etc/ghostl-stack/l2-${NET}.env"
COMPOSE_DIR="${REPO_DIR}/infra/opstack"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"
SERVICE="ghostl2-${NET}"
LOG_PREFIX="[ghostl2-${NET}-provision]"

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

# ── 3. Routing law assertion ──────────────────────────────────
# L2 must NOT have L1_RPC pointing to an L3 address.
# L3 CIDRs are 10.50.30.0/24 — if $ENV_FILE exists, check it.
if [[ -f "$ENV_FILE" ]]; then
  if grep -qP 'L1_RPC=http://10\.50\.30\.' "$ENV_FILE" 2>/dev/null; then
    die "ROUTING LAW VIOLATION: L2 env points L1_RPC at an L3 address (10.50.30.x). Aborting."
  fi
fi

# ── 4. Env file ───────────────────────────────────────────────
mkdir -p /etc/ghostl-stack
if [[ ! -f "$ENV_FILE" ]]; then
  warn "Env file not found: ${ENV_FILE}"
  if [[ "$NET" == "mainnet" ]]; then
    L1_IP="10.50.10.10"; L2_CID="901"
  else
    L1_IP="10.50.10.11"; L2_CID="902"
  fi
  cat > "$ENV_FILE" <<EOF
ROUTING_LAW_MODE=strict
L1_RPC=http://${L1_IP}:8545
L2_CHAIN_ID=${L2_CID}
OPSTACK_IMAGE_TAG=${NET}
OPSTACK_UID=1000
OPSTACK_GID=1000
SEQUENCER_KEY=REPLACE_ME
BATCHER_KEY=REPLACE_ME
PROPOSER_KEY=REPLACE_ME
CHALLENGER_KEY=REPLACE_ME
BATCH_INBOX_ADDRESS=REPLACE_ME
OP_PORTAL_ADDRESS=REPLACE_ME
CANONICAL_GAS_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
GAS_TOKEN_L2=GST
AI_CONSENSUS_MODE=$([ "$NET" = "mainnet" ] && echo "enforce" || echo "log")
AI_CONSENSUS_FAIL_OPEN=$([ "$NET" = "mainnet" ] && echo "0" || echo "1")
EOF
  chmod 600 "$ENV_FILE"
  warn "Fill in contract addresses and keys in ${ENV_FILE}."
fi

if grep -q "REPLACE_ME" "$ENV_FILE"; then
  warn "REPLACE_ME placeholders in ${ENV_FILE} — L2 sequencer will not start correctly."
fi

# ── 5. Data directories ───────────────────────────────────────
mkdir -p "${COMPOSE_DIR}/data"

# ── 6. Pull images ────────────────────────────────────────────
log "Pulling Docker images for L2-${NET}..."
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
Description=GhostL2 ${NET^} OP Stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${COMPOSE_DIR}
ExecStart=/usr/bin/docker compose \\
  -f docker-compose.yml \\
  --env-file ${ENV_FILE} \\
  up --remove-orphans
ExecStop=/usr/bin/docker compose \\
  -f docker-compose.yml \\
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
