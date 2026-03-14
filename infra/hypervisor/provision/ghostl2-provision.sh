#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ghostl2-provision.sh
# KVM VM topology:
#   76  ghostl2-mainnet  10.50.99.76  ENV=mainnet
#   77  ghostl2-testnet  10.50.99.77  ENV=testnet
#
# ROLE: OP-Stack L2 — op-geth + op-node + op-batcher + op-proposer.
#       Settles to L1 (VM 70 mainnet / VM 71 testnet).
#
# Usage:
#   sudo ENV=testnet bash ghostl2-provision.sh
#   sudo ENV=mainnet bash ghostl2-provision.sh
#   sudo ENV=testnet bash ghostl2-provision.sh --update
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV="${ENV:-testnet}"   # testnet | mainnet
UPDATE="${1:-}"

REPO_URL="${REPO_URL:-https://github.com/ghostchain1/ghostl-stack.git}"
REPO_DIR="${REPO_DIR:-/opt/ghostl-stack}"
ENV_FILE="${ENV_FILE:-/etc/ghostl-stack/l2-${ENV}.env}"
SVC_NAME="ghostl2-${ENV}"

# Settlement L1 RPC endpoints (the L1 VM for each environment)
if [ "$ENV" = "mainnet" ]; then
  L1_VM_IP="10.50.99.70"
  VM_IP="10.50.99.76"
else
  L1_VM_IP="10.50.99.71"
  VM_IP="10.50.99.77"
fi
log() { echo "[l2-provision/${ENV}] $(date -u +%H:%M:%SZ) $*"; }

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
# GhostL2 OP-Stack — ENV=${ENV}
# Managed by ghostl2-provision.sh.  Non-secret defaults only.

GHOST_ENV=${ENV}
REPO_DIR=${REPO_DIR}

# ── L2 chain ───────────────────────────────────────────────────────────────────
L2_CHAIN_ID=901

# ── L2 ports (op-geth) ────────────────────────────────────────────────────────
L2_GETH_HTTP_PORT=29547
L2_GETH_WS_PORT=29546
L2_GETH_AUTH_PORT=29551
L2_GETH_P2P_PORT=30306
L2_GETH_METRICS_PORT=29660

# ── L2 ports (op-node) ────────────────────────────────────────────────────────
L2_OP_NODE_RPC_PORT=29545
L2_OP_NODE_METRICS_PORT=29661

# ── L2 ports (op-batcher) ─────────────────────────────────────────────────────
L2_BATCHER_RPC_PORT=29548
L2_BATCHER_METRICS_PORT=29662

# ── L2 ports (op-proposer) ────────────────────────────────────────────────────
L2_PROPOSER_RPC_PORT=29549
L2_PROPOSER_METRICS_PORT=29663

# ── Settlement — L1 this L2 settles into ──────────────────────────────────────
# RPC (VM ${L1_VM_IP}) — use the auth port for engine API, public port otherwise
RPC_SETTLEMENT=http://${L1_VM_IP}:18545
L1_RPC=http://${L1_VM_IP}:18545
L1_WS=ws://${L1_VM_IP}:18546
L1_BEACON=http://${L1_VM_IP}:18545   # placeholder; set to real beacon URL if CL active
L1_CHAIN_ID=14000101

# ── Op-node sequencer (self) ───────────────────────────────────────────────────
# sequencer = this VM; replica nodes point here
OP_NODE_SEQUENCER_L1_CONFS=4
OP_NODE_VERIFIER_L1_CONFS=12

# ── Rollup & contract addresses (promoted from devnet via push-to-vm.sh) ──────
# These are populated by the deploy pipeline; set placeholders so service boots.
L2_OUTPUT_ORACLE_ADDRESS=REPLACE_WITH_PROMOTED_VALUE
L2_TO_L1_MESSAGE_PASSER=REPLACE_WITH_PROMOTED_VALUE
BATCH_INBOX_ADDRESS=0xff00000000000000000000000000000000000901
BATCH_SENDER_ADDRESS=REPLACE_WITH_PROMOTED_VALUE
PROPOSER_ADDRESS=REPLACE_WITH_PROMOTED_VALUE

# ── Batcher / proposer keys (loaded from Vault in prod; dev fallback below) ───
BATCHER_PRIVATE_KEY=REPLACE_VIA_VAULT
PROPOSER_PRIVATE_KEY=REPLACE_VIA_VAULT

# ── Expected chain ID cross-checks (ghost-rollup-proposer) ────────────────────
EXPECTED_SETTLEMENT_CHAIN_ID=14000101
EXPECTED_CHILD_CHAIN_ID=901

# ── Vault ─────────────────────────────────────────────────────────────────────
VAULT_ADDR=
VAULT_ROLE_ID=
VAULT_SECRET_ID=
VAULT_L2_PATH=ghostchain/l2/${ENV}
ENVBLOCK
  chmod 600 "$ENV_FILE"
  log "env file written → ${ENV_FILE}"
else
  log "env file already exists — skipping (use --update to overwrite)"
fi

# ── 4. Secrets ────────────────────────────────────────────────────────────────
mkdir -p /etc/ghostl-stack/secrets
chmod 700 /etc/ghostl-stack/secrets

JWT_FILE="/etc/ghostl-stack/secrets/l2-jwtsecret"
if [ ! -f "$JWT_FILE" ]; then
  log "Generating placeholder L2 JWT secret (replace via Vault for prod)..."
  openssl rand -hex 32 > "$JWT_FILE"
  chmod 600 "$JWT_FILE"
fi

# ── 5. Rollup config promotion ────────────────────────────────────────────────
# Copy the rollup.json promoted from devnet (push-to-vm.sh places it here).
ROLLUP_DST="/etc/ghostl-stack/l2-rollup.json"
ROLLUP_SRC="$REPO_DIR/chains/l2/rollup.json"
if [ ! -f "$ROLLUP_DST" ]; then
  if [ -f "$ROLLUP_SRC" ]; then
    log "Copying rollup.json from repo..."
    cp "$ROLLUP_SRC" "$ROLLUP_DST"
    chmod 644 "$ROLLUP_DST"
  else
    log "WARNING: $ROLLUP_SRC not found. Copy rollup.json from devnet before starting services."
  fi
fi

# ── 6. Compose file ───────────────────────────────────────────────────────────
# Minimal L2 compose: op-geth + op-node only (batcher/proposer added once contracts are deployed)
COMPOSE_FILE="$REPO_DIR/infra/opstack/docker-compose.l2-node.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  die "L2 compose file not found: $COMPOSE_FILE"
fi

log "Configuring systemd service: ${SVC_NAME}..."
cat > "/etc/systemd/system/${SVC_NAME}.service" <<SERVICE
[Unit]
Description=GhostL2 OP-Stack — ENV=${ENV} (op-geth + op-node + batcher + proposer)
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

# ── 7. Health check ───────────────────────────────────────────────────────────
HEALTH_BIN="/usr/local/bin/${SVC_NAME}-health"
cat > "$HEALTH_BIN" <<HEALTH
#!/usr/bin/env bash
set -euo pipefail
ok=0; fail=0

rpc_check() {
  local name="\$1" url="\$2"
  local res
  res=\$(curl -sSf --max-time 6 -X POST "\$url" \\
    -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' 2>/dev/null || echo "")
  if echo "\$res" | grep -q '"result"'; then
    local block
    block=\$(echo "\$res" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))" 2>/dev/null || echo "?")
    echo "  OK   \${name} block=\${block}"
    (( ok++ )) || true
  else
    echo "  FAIL \${name}" >&2
    (( fail++ )) || true
  fi
}

sync_check() {
  local name="\$1" url="\$2"
  local res
  res=\$(curl -sSf --max-time 6 -X POST "\$url" \\
    -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","id":1,"method":"optimism_syncStatus","params":[]}' 2>/dev/null || echo "")
  if echo "\$res" | grep -q '"result"'; then
    echo "  OK   \${name} sync OK"
    (( ok++ )) || true
  else
    echo "  FAIL \${name}" >&2
    (( fail++ )) || true
  fi
}

echo "=== GhostL2 health [${ENV}] \$(date -u +%H:%M:%SZ) ==="
rpc_check  "L2 op-geth  :29547" "http://localhost:29547"
sync_check "L2 op-node  :29545" "http://localhost:29545"
rpc_check  "L1 settle   :18545" "http://${L1_VM_IP}:18545"

echo "--- ok=\${ok} fail=\${fail} ---"
[ "\$fail" -eq 0 ]
HEALTH
chmod +x "$HEALTH_BIN"

cat > "/etc/systemd/system/${SVC_NAME}-health.service" <<HSVC
[Unit]
Description=GhostL2 health check [${ENV}]
After=${SVC_NAME}.service

[Service]
Type=oneshot
ExecStart=${HEALTH_BIN}
HSVC

cat > "/etc/systemd/system/${SVC_NAME}-health.timer" <<HTIMER
[Unit]
Description=Run GhostL2 health check every minute [${ENV}]
After=${SVC_NAME}.service

[Timer]
OnBootSec=120
OnUnitActiveSec=60
Unit=${SVC_NAME}-health.service

[Install]
WantedBy=timers.target
HTIMER

# ── 8. Reload + enable ────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable "${SVC_NAME}.service"
systemctl enable "${SVC_NAME}-health.timer"

log "L2 provision complete."
log "  ENV         : ${ENV}"
log "  VM IP       : ${VM_IP}"
log "  L1 settle   : http://${L1_VM_IP}:18545"
log "  L2 RPC      : http://${VM_IP}:29547"
log "  L2 op-node  : http://${VM_IP}:29545"
log "  Service     : sudo journalctl -u ${SVC_NAME} -f"
log "  Health      : sudo ${HEALTH_BIN}"
log ""
log "  IMPORTANT before starting:"
log "    1. Populate /etc/ghostl-stack/l2-${ENV}.env — BATCHER_PRIVATE_KEY, PROPOSER_PRIVATE_KEY"
log "       and contract addresses from push-to-vm.sh --target ${ENV}"
log "    2. Ensure rollup.json is at /etc/ghostl-stack/l2-rollup.json"
log "    3. Ensure L1 VM (${L1_VM_IP}) is synced and healthy"
log ""
log "  Then: sudo systemctl start ${SVC_NAME}"
