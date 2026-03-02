#!/usr/bin/env bash
# =============================================================
# GhostStack — ghost-validator-provision.sh
# Idempotent in-VM provisioner for GhostChain L1 validator nodes.
# Validators have mining ENABLED and hold the IBFT signer key.
#
# Usage:
#   sudo bash ghost-validator-provision.sh <mainnet|testnet>
# =============================================================
set -euo pipefail

NET="${1:?Usage: $0 <mainnet|testnet>}"
[[ "$NET" == "mainnet" || "$NET" == "testnet" ]] \
  || { echo "ERROR: net must be 'mainnet' or 'testnet'"; exit 1; }

REPO_DIR="/opt/ghostl-stack"
ENV_FILE="/etc/ghostl-stack/validator-${NET}.env"
COMPOSE_DIR="${REPO_DIR}/infra/ghostchain"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.l1.yml"
SERVICE="ghost-${NET}-validator"
LOG_PREFIX="[ghost-validator-${NET}-provision]"

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

# ── 3. Env file guard ─────────────────────────────────────────
mkdir -p /etc/ghostl-stack
if [[ ! -f "$ENV_FILE" ]]; then
  warn "Env file not found: ${ENV_FILE}"
  cat > "$ENV_FILE" <<EOF
# ── GhostChain L1 ${NET^} Validator ─────────────────────────
L1_ENV=${NET}
ALLOW_DEV_SECRETS=0
L1_SECRETS_SOURCE=vault
L1_CHAIN_ID=$([ "$NET" = "mainnet" ] && echo "14000101" || echo "14000102")
GETH_IMAGE=ghostl/geth:alltools-v1.13.14
L1_NODE1_MINING_ENABLED=1
VAULT_ADDR=REPLACE_ME
VAULT_ROLE_ID=REPLACE_ME
VAULT_SECRET_ID=REPLACE_ME
VAULT_L1_PATH=ghostchain/l1/${NET}/validator
EOF
  chmod 600 "$ENV_FILE"
  warn "Fill in VAULT_* values in ${ENV_FILE} before starting."
fi

if grep -q "REPLACE_ME" "$ENV_FILE"; then
  warn "REPLACE_ME placeholders in ${ENV_FILE} — Vault not configured; validator key unavailable."
fi

# ── 4. Secrets dir (Vault agent will write JWT + keystore here) ──
mkdir -p "${COMPOSE_DIR}/secrets"
chmod 700 "${COMPOSE_DIR}/secrets"

# ── 5. Pull images ────────────────────────────────────────────
log "Pulling Docker images for validator-${NET}..."
docker compose \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  pull --quiet || warn "Pull failed — using cached images."
ok "Images ready."

# ── 6. Systemd service ────────────────────────────────────────
UNIT_DEST="/etc/systemd/system/${SERVICE}.service"
if [[ ! -f "$UNIT_DEST" ]]; then
  cat > "$UNIT_DEST" <<UNIT
[Unit]
Description=GhostChain L1 ${NET^} Validator
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${COMPOSE_DIR}
ExecStart=/usr/bin/docker compose \\
  -f docker-compose.l1.yml \\
  --env-file ${ENV_FILE} \\
  up --remove-orphans
ExecStop=/usr/bin/docker compose \\
  -f docker-compose.l1.yml \\
  down
Restart=always
RestartSec=10
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

ok "Validator service ${SERVICE} running."
systemctl status "${SERVICE}.service" --no-pager --lines=5
