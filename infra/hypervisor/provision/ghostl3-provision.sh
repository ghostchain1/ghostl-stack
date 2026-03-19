#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ghostl3-provision.sh
# KVM VM topology:
#   78  ghostl3-mainnet  10.50.99.78  ENV=mainnet
#   79  ghostl3-testnet  10.50.99.79  ENV=testnet
#
# ROLE: Ghost-native L3 application layer.
#       Runs the GhostL3 custom service set and anchors to GhostL2
#       (VM 76 mainnet / VM 77 testnet). The base L3 RPC on :39545 is treated
#       as a local prerequisite and is not bootstrapped by this script.
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
# GhostL3 custom application layer — ENV=${ENV}
# Managed by ghostl3-provision.sh.  Non-secret defaults only.

GHOST_ENV=${ENV}
REPO_DIR=${REPO_DIR}
COMPOSE_PROJECT_NAME=ghostl3-${ENV}

# ── Chain identity ─────────────────────────────────────────────────────────────
L3_CHAIN_ID=903
L2_CHAIN_ID=901
L1_CHAIN_ID=14000101

# ── Canonical base RPC prerequisite (host-local) ─────────────────────────────
RPC_L3=http://localhost:39545
GHOST_L3_EXEC_RPC_URL=http://host.docker.internal:39545

# ── Ghost-native control-plane services (host) ────────────────────────────────
GHOST_EXEC_L3_PORT=7270
GHOST_SEQUENCER_L3_PORT=7271
GHOST_DERIVER_L3_PORT=7272
GHOST_SETTLEMENT_L3_PORT=7273
GHOST_BRIDGE_L3_PORT=7274
GHOST_PROOF_L3_PORT=7275

# ── Parent settlement and execution RPC (remote L2 VM) ───────────────────────
L2_RPC=http://${L2_VM_IP}:29547
GHOST_L3_PARENT_RPC_URL=http://${L2_VM_IP}:7260
GHOST_L3_SOURCE_RPC_URL=http://${L2_VM_IP}:7260

# ── L1 (for L3 verifier / challenger cross-reference) ─────────────────────────
L1_RPC=http://${L1_VM_IP}:18545

# ── Canonical settlement metadata ─────────────────────────────────────────────
GHOST_L3_ROLLUP_ADDRESS=0x130A46b6E41DB6E1e18fb9c759F223c459190e90
GHOST_L3_FINALITY_ORACLE_ADDRESS=0x87F850cbC2cFfac086F20d0d7307E12d06fA2127
BRIDGE_L2L3_ADDRESS=0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2

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
ROLLUP_DST="/etc/ghostl-stack/ghostl3-chain.json"
ROLLUP_SRC="$REPO_DIR/chains/ghostl3/chain.json"
if [ ! -f "$ROLLUP_DST" ]; then
  if [ -f "$ROLLUP_SRC" ]; then
    log "Copying GhostL3 chain metadata from repo..."
    cp "$ROLLUP_SRC" "$ROLLUP_DST"
    chmod 644 "$ROLLUP_DST"
  else
    log "WARNING: $ROLLUP_SRC not found. Copy GhostL3 chain metadata before starting services."
  fi
fi

# ── 6. Compose file ───────────────────────────────────────────────────────────
# Dedicated GhostL3 VM launches only the L3 custom service slice.
COMPOSE_FILE="$REPO_DIR/docker-compose.custom-rollup.yml"
COMPOSE_SERVICES="ghost-exec-l3 ghost-sequencer-l3 ghost-deriver-l3 ghost-settlement-l3 ghost-bridge-l3 ghost-proof-l3"
if [ ! -f "$COMPOSE_FILE" ]; then
  die "L3 compose file not found: $COMPOSE_FILE"
fi

log "Configuring systemd service: ${SVC_NAME}..."
cat > "/etc/systemd/system/${SVC_NAME}.service" <<SERVICE
[Unit]
Description=GhostL3 custom service plane — ENV=${ENV}
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

echo "=== GhostL3 health [${ENV}] \$(date -u +%H:%M:%SZ) ==="
rpc_check     "L3 base RPC         :39545" "http://localhost:39545"
service_check "ghost-exec-l3       :7270/status" "http://localhost:7270/status"
service_check "ghost-settlement-l3 :7273/status" "http://localhost:7273/status"
service_check "GhostL2 parent exec :7260/status" "http://${L2_VM_IP}:7260/status"

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
log "  L2 parent   : http://${L2_VM_IP}:7260"
log "  L3 RPC      : http://${VM_IP}:39545"
log "  GhostExec   : http://${VM_IP}:7270"
log "  Settlement  : http://${VM_IP}:7273"
log "  Service     : sudo journalctl -u ${SVC_NAME} -f"
log "  Health      : sudo ${HEALTH_BIN}"
log ""
log "  IMPORTANT before starting:"
log "    1. Ensure the local GhostL3 base RPC is available on :39545"
log "    2. Ensure GhostL3 metadata is at /etc/ghostl-stack/ghostl3-chain.json"
log "    3. Ensure the L2 parent service plane on ${L2_VM_IP}:7260 is healthy"
log ""
log "  Then: sudo systemctl start ${SVC_NAME}"
