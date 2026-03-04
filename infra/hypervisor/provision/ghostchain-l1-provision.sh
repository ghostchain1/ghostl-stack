#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ghostchain-l1-provision.sh
# KVM VM topology:
#   70  ghostchain-mainnet-l1    10.50.99.70  ENV=mainnet ROLE=fullnode
#   71  ghostchain-testnet-l1    10.50.99.71  ENV=testnet ROLE=fullnode
#   72  ghost-mainnet-validator  10.50.99.72  ENV=mainnet ROLE=validator
#   73  ghost-testnet-validator  10.50.99.73  ENV=testnet ROLE=validator
#
# Usage:
#   sudo ENV=testnet ROLE=fullnode  bash ghostchain-l1-provision.sh
#   sudo ENV=mainnet ROLE=validator bash ghostchain-l1-provision.sh
#   sudo ENV=testnet ROLE=validator bash ghostchain-l1-provision.sh --update
#
# fullnode  – syncing/archive node; exposes public-facing RPC.
# validator – IBFT consensus signer; RPC is auth-only, no public exposure.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV="${ENV:-testnet}"          # testnet | mainnet
ROLE="${ROLE:-fullnode}"       # fullnode | validator
UPDATE="${1:-}"

REPO_URL="${REPO_URL:-https://github.com/ghostchain1/ghostl-stack.git}"
REPO_DIR="${REPO_DIR:-/opt/ghostl-stack}"
ENV_FILE="${ENV_FILE:-/etc/ghostl-stack/l1-${ENV}-${ROLE}.env}"
SVC_NAME="ghostl1-${ENV}-${ROLE}"

# Peer IPs (fullnodes peer with validators and vice-versa)
L1_TESTNET_VALIDATOR_IP="10.50.99.73"
L1_TESTNET_FULLNODE_IP="10.50.99.71"
L1_MAINNET_VALIDATOR_IP="10.50.99.72"
L1_MAINNET_FULLNODE_IP="10.50.99.70"

if [ "$ENV" = "testnet" ]; then
  PEER_IP="$L1_TESTNET_VALIDATOR_IP"
  [ "$ROLE" = "validator" ] && PEER_IP="$L1_TESTNET_FULLNODE_IP"
else
  PEER_IP="$L1_MAINNET_VALIDATOR_IP"
  [ "$ROLE" = "validator" ] && PEER_IP="$L1_MAINNET_FULLNODE_IP"
fi

log() { echo "[l1-provision/${ENV}/${ROLE}] $(date -u +%H:%M:%SZ) $*"; }

# ── 1. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  usermod -aG docker ghost
else
  log "Docker already installed ($(docker --version))"
fi

# ── 2. Repo ───────────────────────────────────────────────────────────────────
if [ -d "$REPO_DIR/.git" ]; then
  log "Updating repo at $REPO_DIR..."
  git -C "$REPO_DIR" fetch --depth=1 origin main
  git -C "$REPO_DIR" reset --hard origin/main
else
  log "Cloning repo to $REPO_DIR..."
  git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi
chown -R ghost:ghost "$REPO_DIR"

# ── 3. env file ───────────────────────────────────────────────────────────────
mkdir -p /etc/ghostl-stack

if [ ! -f "$ENV_FILE" ] || [ "$UPDATE" = "--update" ]; then
  log "Writing $ENV_FILE..."
  cat > "$ENV_FILE" <<ENVBLOCK
# GhostChain L1 — ENV=${ENV} ROLE=${ROLE}
# Managed by ghostchain-l1-provision.sh.  Non-secret defaults only.
# Secrets (JWT, validator key, RPC auth token) are written by Vault or ops.

GHOST_ENV=${ENV}
GHOST_ROLE=${ROLE}
REPO_DIR=${REPO_DIR}

# ── Chain ──────────────────────────────────────────────────────────────────────
L1_ENV=${ENV}
L1_CHAIN_ID=14000101

# ── Ports ──────────────────────────────────────────────────────────────────────
# fullnode: public HTTP+WS; validator: auth-only (no public HTTP exposure)
L1_RPC_HTTP_PORT=18545
L1_RPC_WS_PORT=18546
L1_RPC_AUTH_PORT=18552
L1_P2P_PORT=18551
L1_METRICS_PORT=18660

# ── P2P boot peer (cross-pair within this layer) ───────────────────────────────
L1_BOOTNODE_IP=${PEER_IP}
L1_BOOTNODE_PORT=18551

# ── Secrets source ─────────────────────────────────────────────────────────────
# Set VAULT_ADDR + VAULT_ROLE_ID + VAULT_SECRET_ID for prod Vault AppRole.
# Leave blank to fall back to /etc/ghostl-stack/secrets/ on this VM.
VAULT_ADDR=
VAULT_ROLE_ID=
VAULT_SECRET_ID=
VAULT_L1_PATH=ghostchain/l1/${ENV}

# ── Validator signing key (validator ROLE only) ─────────────────────────────────
# VALIDATOR_KEYFILE=/etc/ghostl-stack/secrets/validator.key
# VALIDATOR_KEYPASS=/etc/ghostl-stack/secrets/validator.pass

# ── RPC security ──────────────────────────────────────────────────────────────
L1_RPC_REQUIRE_AUTH=0
L1_RPC_RATE_LIMIT_PER_MINUTE=120
L1_RPC_RATE_LIMIT_BURST=40
L1_HTTP_CORS=*
L1_WS_ORIGINS=*
ENVBLOCK

  # Validator-specific hardening
  if [ "$ROLE" = "validator" ]; then
    cat >> "$ENV_FILE" <<'VALBLOCK'

# ── Validator hardening (public RPC disabled) ──────────────────────────────────
L1_RPC_REQUIRE_AUTH=1
L1_HTTP_CORS=localhost
L1_WS_ORIGINS=localhost
L1_HTTP_VHOSTS=localhost,127.0.0.1
VALBLOCK
  fi

  chmod 600 "$ENV_FILE"
  log "env file written → ${ENV_FILE}"
else
  log "env file already exists — skipping (use --update to overwrite)"
fi

# ── 4. Secrets directory ──────────────────────────────────────────────────────
mkdir -p /etc/ghostl-stack/secrets
chmod 700 /etc/ghostl-stack/secrets

# Generate a dev JWT if none exists (Vault will overwrite in prod)
JWT_FILE="/etc/ghostl-stack/secrets/jwtsecret"
if [ ! -f "$JWT_FILE" ]; then
  log "Generating placeholder JWT secret (replace via Vault for prod)..."
  openssl rand -hex 32 > "$JWT_FILE"
  chmod 600 "$JWT_FILE"
fi

# ── 5. Compose file selection ─────────────────────────────────────────────────
COMPOSE_FILE="$REPO_DIR/infra/ghostchain/docker-compose.l1.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  log "WARNING: $COMPOSE_FILE not found — check repo layout"
fi

log "Configuring systemd service: ${SVC_NAME}..."
cat > "/etc/systemd/system/${SVC_NAME}.service" <<SERVICE
[Unit]
Description=GhostChain L1 — ENV=${ENV} ROLE=${ROLE}
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up --remove-orphans
ExecStop=/usr/bin/docker compose  -f ${COMPOSE_FILE} down
Restart=on-failure
RestartSec=20
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SVC_NAME}

[Install]
WantedBy=multi-user.target
SERVICE

# ── 6. Health check ───────────────────────────────────────────────────────────
HEALTH_BIN="/usr/local/bin/${SVC_NAME}-health"
cat > "$HEALTH_BIN" <<HEALTH
#!/usr/bin/env bash
set -euo pipefail
RPC_URL="http://localhost:18545"
echo "=== GhostChain L1 health [${ENV}/${ROLE}] \$(date -u +%H:%M:%SZ) ==="
res=\$(curl -sSf --max-time 6 -X POST "\$RPC_URL" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' 2>/dev/null || echo "")
if echo "\$res" | grep -q '"result"'; then
  block=\$(echo "\$res" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))" 2>/dev/null || echo "?")
  echo "  OK   L1 block=\${block}"
else
  echo "  FAIL L1 RPC not responding" >&2
  exit 1
fi
HEALTH
chmod +x "$HEALTH_BIN"

cat > "/etc/systemd/system/${SVC_NAME}-health.service" <<HSVC
[Unit]
Description=GhostChain L1 health check [${ENV}/${ROLE}]
After=${SVC_NAME}.service

[Service]
Type=oneshot
ExecStart=${HEALTH_BIN}
HSVC

cat > "/etc/systemd/system/${SVC_NAME}-health.timer" <<HTIMER
[Unit]
Description=Run L1 health check every minute [${ENV}/${ROLE}]
After=${SVC_NAME}.service

[Timer]
OnBootSec=120
OnUnitActiveSec=60
Unit=${SVC_NAME}-health.service

[Install]
WantedBy=timers.target
HTIMER

# ── 7. Reload + enable ────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable "${SVC_NAME}.service"
systemctl enable "${SVC_NAME}-health.timer"

log "L1 provision complete."
log "  ENV     : ${ENV}"
log "  ROLE    : ${ROLE}"
log "  Peer IP : ${PEER_IP}"
log "  RPC     : http://$(hostname -I | awk '{print $1}'):18545"
log "  P2P     : $(hostname -I | awk '{print $1}'):18551"
log "  Service : sudo journalctl -u ${SVC_NAME} -f"
log "  Health  : sudo ${HEALTH_BIN}"
log ""
log "  IMPORTANT: populate secrets before starting:"
log "    /etc/ghostl-stack/secrets/jwtsecret     (already generated)"
if [ "$ROLE" = "validator" ]; then
  log "    /etc/ghostl-stack/secrets/validator.key  (copy from Vault / ops)"
  log "    /etc/ghostl-stack/secrets/validator.pass (copy from Vault / ops)"
fi
log ""
log "  Then: sudo systemctl start ${SVC_NAME}"
