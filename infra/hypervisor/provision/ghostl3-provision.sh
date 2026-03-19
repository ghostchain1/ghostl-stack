#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ghostl3-provision.sh
# KVM VM topology:
#   78  ghostl3-mainnet  10.50.99.78  ENV=mainnet
#   79  ghostl3-testnet  10.50.99.79  ENV=testnet
#
# ROLE: OP-Stack L3 — l3-geth + l3-op-node + l3-batcher + l3-proposer.
#       Settles to L2 (VM 76 mainnet / VM 77 testnet).
#
# Usage:
#   sudo ENV=testnet bash ghostl3-provision.sh
#   sudo ENV=mainnet bash ghostl3-provision.sh
#   sudo ENV=testnet bash ghostl3-provision.sh --update
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV="${ENV:-testnet}"   # testnet | mainnet
UPDATE="${1:-}"

REPO_URL="${REPO_URL:-https://github.com/ghostchain1/ghostl-stack.git}"
REPO_DIR="${REPO_DIR:-/opt/ghostl-stack}"
ENV_FILE="${ENV_FILE:-/etc/ghostl-stack/l3-${ENV}.env}"
SVC_NAME="ghostl3-${ENV}"

# Settlement L2 RPC endpoints
if [ "$ENV" = "mainnet" ]; then
  L2_VM_IP="10.50.99.76"
  L1_VM_IP="10.50.99.70"
  VM_IP="10.50.99.78"
else
  L2_VM_IP="10.50.99.77"
  L1_VM_IP="10.50.99.71"
  VM_IP="10.50.99.79"
fi

log() { echo "[l3-provision/${ENV}] $(date -u +%H:%M:%SZ) $*"; }

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
# GhostL3 OP-Stack — ENV=${ENV}
# Managed by ghostl3-provision.sh.  Non-secret defaults only.

GHOST_ENV=${ENV}
REPO_DIR=${REPO_DIR}

# ── L3 chain ───────────────────────────────────────────────────────────────────
L3_CHAIN_ID=903

# ── L3 ports (l3-geth) ────────────────────────────────────────────────────────
L3_GETH_HTTP_PORT=39545
L3_GETH_WS_PORT=39548
L3_GETH_AUTH_PORT=39551
L3_GETH_P2P_PORT=30307
L3_GETH_METRICS_PORT=39660

# ── L3 ports (rollup compat proxy + l3-op-node) ───────────────────────────────
L3_OP_NODE_RPC_PORT=39546
L3_OP_NODE_DIRECT_RPC_PORT=39646
L3_ROLLUP_RPC_PORT=19546
L3_ROLLUP_RPC_HOST_PORT=39546
L3_OP_NODE_METRICS_PORT=39661

# ── L3 ports (l3-batcher) ─────────────────────────────────────────────────────
L3_BATCHER_RPC_PORT=18551
L3_BATCHER_HOST_PORT=39551
L3_BATCHER_METRICS_PORT=8301
L3_METRICS_BATCHER_HOST_PORT=39301

# ── L3 ports (l3-proposer) ────────────────────────────────────────────────────
L3_PROPOSER_RPC_PORT=18560
L3_PROPOSER_HOST_PORT=39560
L3_PROPOSER_METRICS_PORT=8302
L3_METRICS_PROPOSER_HOST_PORT=39302

# ── Settlement — L2 this L3 settles into ──────────────────────────────────────
# L2 VM ${L2_VM_IP} — op-geth HTTP for eth calls, rollup compat proxy for
# internal rollup RPC. The canonical direct GhostL2 host RPC remains :29547.
RPC_SETTLEMENT=http://${L2_VM_IP}:29547
L2_RPC=http://${L2_VM_IP}:29547
L2_WS=ws://${L2_VM_IP}:29548
L2_OP_NODE_RPC=http://${L2_VM_IP}:29546
L2_CHAIN_ID=901

# ── L1 (for L3 verifier / challenger cross-reference) ─────────────────────────
L1_RPC=http://${L1_VM_IP}:18545
L1_CHAIN_ID=14000101

# ── L3 rollup & contract addresses (promoted from devnet via push-to-vm.sh) ───
L3_OUTPUT_ORACLE_ADDRESS=REPLACE_WITH_PROMOTED_VALUE
L3_TO_L2_MESSAGE_PASSER=REPLACE_WITH_PROMOTED_VALUE
L3_BATCH_INBOX_ADDRESS=0xff00000000000000000000000000000000000903
L3_BATCH_SENDER_ADDRESS=REPLACE_WITH_PROMOTED_VALUE
L3_PROPOSER_ADDRESS=REPLACE_WITH_PROMOTED_VALUE
L2_ROLLUP_L3_ADDRESS=0x130A46b6E41DB6E1e18fb9c759F223c459190e90
L3_FINALITY_ORACLE_ADDRESS=0x87F850cbC2cFfac086F20d0d7307E12d06fA2127

# ── L3 batcher / proposer keys (loaded from Vault in prod) ────────────────────
L3_BATCHER_PRIVATE_KEY=REPLACE_VIA_VAULT
L3_PROPOSER_PRIVATE_KEY=REPLACE_VIA_VAULT

# ── Expected chain ID cross-checks (ghost-rollup-proposer l3) ─────────────────
EXPECTED_SETTLEMENT_CHAIN_ID=901
EXPECTED_CHILD_CHAIN_ID=903

# ── Bootnode (peer with L2 geth) ──────────────────────────────────────────────
# l3-geth boots off the l2-geth enode; set at runtime by op-node init
L3_BOOTNODES=

# ── Vault ─────────────────────────────────────────────────────────────────────
VAULT_ADDR=
VAULT_ROLE_ID=
VAULT_SECRET_ID=
VAULT_L3_PATH=ghostchain/l3/${ENV}
ENVBLOCK
  chmod 600 "$ENV_FILE"
  log "env file written → ${ENV_FILE}"
else
  log "env file already exists — skipping (use --update to overwrite)"
fi

# ── 4. Secrets ────────────────────────────────────────────────────────────────
mkdir -p /etc/ghostl-stack/secrets
chmod 700 /etc/ghostl-stack/secrets

JWT_FILE="/etc/ghostl-stack/secrets/l3-jwtsecret"
if [ ! -f "$JWT_FILE" ]; then
  log "Generating placeholder L3 JWT secret (replace via Vault for prod)..."
  openssl rand -hex 32 > "$JWT_FILE"
  chmod 600 "$JWT_FILE"
fi

# ── 5. Rollup config promotion ────────────────────────────────────────────────
ROLLUP_DST="/etc/ghostl-stack/l3-rollup.json"
ROLLUP_SRC="$REPO_DIR/chains/l3/rollup.json"
if [ ! -f "$ROLLUP_DST" ]; then
  if [ -f "$ROLLUP_SRC" ]; then
    log "Copying l3 rollup.json from repo..."
    cp "$ROLLUP_SRC" "$ROLLUP_DST"
    chmod 644 "$ROLLUP_DST"
  else
    log "WARNING: $ROLLUP_SRC not found. Copy rollup.json from devnet before starting services."
  fi
fi

# ── 6. Compose file ───────────────────────────────────────────────────────────
# Minimal L3 compose: l3-geth + l3-op-node only (batcher/proposer added once L3 contracts deployed)
COMPOSE_FILE="$REPO_DIR/infra/opstack/docker-compose.l3-node.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  die "L3 compose file not found: $COMPOSE_FILE"
fi

log "Configuring systemd service: ${SVC_NAME}..."
cat > "/etc/systemd/system/${SVC_NAME}.service" <<SERVICE
[Unit]
Description=GhostL3 OP-Stack — ENV=${ENV} (l3-geth + l3-op-node + batcher + proposer)
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
    -d '{"jsonrpc":"2.0","id":1,"method":"ghost_compat_syncStatus","params":[]}' 2>/dev/null || echo "")
  if echo "\$res" | grep -q '"result"'; then
    echo "  OK   \${name} sync OK"
    (( ok++ )) || true
  else
    echo "  FAIL \${name}" >&2
    (( fail++ )) || true
  fi
}

echo "=== GhostL3 health [${ENV}] \$(date -u +%H:%M:%SZ) ==="
rpc_check  "L3 l3-geth    :39545" "http://localhost:39545"
sync_check "L3 rollup proxy :39546" "http://localhost:39546"
rpc_check  "L2 settle     :29547" "http://${L2_VM_IP}:29547"

echo "--- ok=\${ok} fail=\${fail} ---"
[ "\$fail" -eq 0 ]
HEALTH
chmod +x "$HEALTH_BIN"

cat > "/etc/systemd/system/${SVC_NAME}-health.service" <<HSVC
[Unit]
Description=GhostL3 health check [${ENV}]
After=${SVC_NAME}.service

[Service]
Type=oneshot
ExecStart=${HEALTH_BIN}
HSVC

cat > "/etc/systemd/system/${SVC_NAME}-health.timer" <<HTIMER
[Unit]
Description=Run GhostL3 health check every minute [${ENV}]
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

log "L3 provision complete."
log "  ENV         : ${ENV}"
log "  VM IP       : ${VM_IP}"
log "  L2 settle   : http://${L2_VM_IP}:29547"
log "  L3 RPC      : http://${VM_IP}:39545"
log "  L3 rollup proxy : http://${VM_IP}:39546"
log "  L3 op-node direct: http://${VM_IP}:39646"
log "  Service     : sudo journalctl -u ${SVC_NAME} -f"
log "  Health      : sudo ${HEALTH_BIN}"
log ""
log "  IMPORTANT before starting:"
log "    1. Populate /etc/ghostl-stack/l3-${ENV}.env — L3_BATCHER_PRIVATE_KEY, L3_PROPOSER_PRIVATE_KEY"
log "       and contract addresses from push-to-vm.sh --target ${ENV}"
log "    2. Ensure rollup.json is at /etc/ghostl-stack/l3-rollup.json"
log "    3. Ensure L2 VM (${L2_VM_IP}) is synced and healthy"
log ""
log "  Then: sudo systemctl start ${SVC_NAME}"
