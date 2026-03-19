#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ghostl2-provision.sh
# KVM VM topology:
#   76  ghostl2-mainnet  10.50.99.76  ENV=mainnet
#   77  ghostl2-testnet  10.50.99.77  ENV=testnet
#
# ROLE: Ghost-native L2 execution layer.
#       Runs the GhostL2 custom service set and anchors to GhostChain L1
#       (VM 70 mainnet / VM 71 testnet). The base L2 RPC on :29547 is treated
#       as a local prerequisite and is not bootstrapped by this script.
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
# GhostL2 custom execution layer — ENV=${ENV}
# Managed by ghostl2-provision.sh.  Non-secret defaults only.

GHOST_ENV=${ENV}
REPO_DIR=${REPO_DIR}
COMPOSE_PROJECT_NAME=ghostl2-${ENV}

# ── Chain identity ─────────────────────────────────────────────────────────────
L2_CHAIN_ID=901
L1_CHAIN_ID=14000101

# ── Canonical base RPC prerequisite (host-local) ─────────────────────────────
RPC_L2=http://localhost:29547
GHOST_L2_EXEC_RPC_URL=http://host.docker.internal:29547

# ── Ghost-native control-plane services (host) ────────────────────────────────
GHOST_EXEC_L2_PORT=7260
GHOST_SEQUENCER_L2_PORT=7261
GHOST_DERIVER_L2_PORT=7262
GHOST_SETTLEMENT_L2_PORT=7263
GHOST_BRIDGE_L2_PORT=7264
GHOST_PROOF_L2_PORT=7265

# ── Parent settlement RPC (remote L1 VM) ──────────────────────────────────────
L1_RPC=http://${L1_VM_IP}:18545
GHOST_L1_RPC_INTERNAL=http://${L1_VM_IP}:18545

# ── Canonical settlement metadata ─────────────────────────────────────────────
GHOST_L2_ROLLUP_ADDRESS=0xad32D5C2Da9f4159C4cc98686C005852b3905355
GHOST_L1_FINALITY_ORACLE_ADDRESS=0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422
GHOST_L2_BRIDGE_ADDRESS=0xad32D5C2Da9f4159C4cc98686C005852b3905355

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
ROLLUP_DST="/etc/ghostl-stack/ghostl2-chain.json"
ROLLUP_SRC="$REPO_DIR/chains/ghostl2/chain.json"
if [ ! -f "$ROLLUP_DST" ]; then
  if [ -f "$ROLLUP_SRC" ]; then
    log "Copying GhostL2 chain metadata from repo..."
    cp "$ROLLUP_SRC" "$ROLLUP_DST"
    chmod 644 "$ROLLUP_DST"
  else
    log "WARNING: $ROLLUP_SRC not found. Copy GhostL2 chain metadata before starting services."
  fi
fi

# ── 6. Compose file ───────────────────────────────────────────────────────────
# Dedicated GhostL2 VM launches only the L2 custom service slice.
COMPOSE_FILE="$REPO_DIR/docker-compose.custom-rollup.yml"
COMPOSE_SERVICES="ghost-exec-l2 ghost-sequencer-l2 ghost-deriver-l2 ghost-settlement-l2 ghost-bridge-l2 ghost-proof-l2"
if [ ! -f "$COMPOSE_FILE" ]; then
  die "L2 compose file not found: $COMPOSE_FILE"
fi

log "Configuring systemd service: ${SVC_NAME}..."
cat > "/etc/systemd/system/${SVC_NAME}.service" <<SERVICE
[Unit]
Description=GhostL2 custom service plane — ENV=${ENV}
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/docker compose --project-directory ${REPO_DIR} -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up --remove-orphans ${COMPOSE_SERVICES}
ExecStop=/usr/bin/docker compose --project-directory ${REPO_DIR} -f ${COMPOSE_FILE} --env-file ${ENV_FILE} stop ${COMPOSE_SERVICES}
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

service_check() {
  local name="\$1" url="\$2"
  if curl -sSf --max-time 6 "\$url" >/dev/null 2>&1; then
    echo "  OK   \${name}"
    (( ok++ )) || true
  else
    echo "  FAIL \${name}" >&2
    (( fail++ )) || true
  fi
}

echo "=== GhostL2 health [${ENV}] \$(date -u +%H:%M:%SZ) ==="
rpc_check     "L2 base RPC         :29547" "http://localhost:29547"
service_check "ghost-exec-l2       :7260/status" "http://localhost:7260/status"
service_check "ghost-settlement-l2 :7263/status" "http://localhost:7263/status"
rpc_check     "L1 settlement RPC   :18545" "http://${L1_VM_IP}:18545"

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
log "  GhostExec   : http://${VM_IP}:7260"
log "  Settlement  : http://${VM_IP}:7263"
log "  Service     : sudo journalctl -u ${SVC_NAME} -f"
log "  Health      : sudo ${HEALTH_BIN}"
log ""
log "  IMPORTANT before starting:"
log "    1. Ensure the local GhostL2 base RPC is available on :29547"
log "    2. Ensure GhostL2 metadata is at /etc/ghostl-stack/ghostl2-chain.json"
log "    3. Ensure L1 VM (${L1_VM_IP}) is synced and healthy"
log ""
log "  Then: sudo systemctl start ${SVC_NAME}"
