#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ghostchain-devnet-provision.sh
# KVM VM 45 — ghostchain-devnet (10.50.99.45)
#
# ROLE: Full local devnet — L1 + L2 + L3 all-in-one.
#       This is the build/test box.  Contracts are developed and tested here
#       first, then promoted to testnet (VMs 71/73/77/79) and finally to
#       mainnet (70/72/76/78) via push-to-vm.sh.
#
# Usage:
#   sudo bash ghostchain-devnet-provision.sh            # first boot
#   sudo bash ghostchain-devnet-provision.sh --update   # re-run to refresh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ghostchain1/ghostl-stack.git}"
REPO_DIR="${REPO_DIR:-/opt/ghostl-stack}"
ENV_FILE="${ENV_FILE:-/etc/ghostl-stack/devnet.env}"
VM_IP="10.50.99.45"
UPDATE="${1:-}"

log() { echo "[devnet-provision] $(date -u +%H:%M:%SZ) $*"; }

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

# ── 3. devnet.env ─────────────────────────────────────────────────────────────
mkdir -p /etc/ghostl-stack

if [ ! -f "$ENV_FILE" ] || [ "$UPDATE" = "--update" ]; then
  log "Writing $ENV_FILE..."
  cat > "$ENV_FILE" <<'DEVENV'
# ghostchain-devnet — VM 45 — 10.50.99.45
# All chains run locally.  Secrets are dev-grade only; no real funds.

GHOST_ENV=devnet
REPO_DIR=/opt/ghostl-stack

# ── L1 GhostChain (IBFT, geth-based) ─────────────────────────────────────────
L1_CHAIN_ID=14000101
L1_RPC_HTTP_PORT=18545
L1_RPC_WS_PORT=18546
L1_RPC_AUTH_PORT=18552
L1_P2P_PORT=18551
L1_METRICS_PORT=18660

# ── L2 (OP-Stack rollup on L1) ────────────────────────────────────────────────
L2_CHAIN_ID=901
L2_GETH_HTTP_PORT=29547
L2_GETH_WS_PORT=29546
L2_GETH_AUTH_PORT=29551
L2_GETH_P2P_PORT=30306
L2_OP_NODE_RPC_PORT=29545
L2_BATCHER_RPC_PORT=29548
L2_PROPOSER_RPC_PORT=29549
L2_METRICS_PORT=29660

# ── L3 (OP-Stack rollup on L2) ────────────────────────────────────────────────
L3_CHAIN_ID=903
L3_GETH_HTTP_PORT=39545
L3_GETH_WS_PORT=39546
L3_GETH_AUTH_PORT=39551
L3_GETH_P2P_PORT=30307
L3_OP_NODE_RPC_PORT=39546
L3_BATCHER_RPC_PORT=39551
L3_PROPOSER_RPC_PORT=39560
L3_METRICS_PORT=39660

# ── RPC URLs (local, used by services referencing the devnet) ─────────────────
RPC_L1=http://localhost:18545
RPC_L2=http://localhost:29547
RPC_L3=http://localhost:39545

# ── Contract addresses (ghostl2 devnet deployment, from contracts/deployments) ─
L2_OUTPUT_ORACLE=0x8198f5d8F8CfFE8f9C413d98a0A55aEB8ab9FbB7
BRIDGE_L2L3=0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
L2L3_BRIDGE_ADDRESS=0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
L1_ROLLUP_L2_ADDRESS=0xad32D5C2Da9f4159C4cc98686C005852b3905355
L2_ROLLUP_L3_ADDRESS=0x130A46b6E41DB6E1e18fb9c759F223c459190e90
L1_FINALITY_ORACLE_ADDRESS=0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422
L2_FINALITY_ORACLE_ADDRESS=0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A
L3_FINALITY_ORACLE_ADDRESS=0x87F850cbC2cFfac086F20d0d7307E12d06fA2127
GOVERNOR_L1=0xfbC22278A96299D91d41C453234d97b4F5Eb9B2d
GAS_TOKEN=0x5FbDB2315678afecb367f032d93F642f64180aa3

# ── Ghost Guard / AI ──────────────────────────────────────────────────────────
GHOST_GUARD_PORT=7070
AI_CONSENSUS_PORT=17715

# ── Ghost services (devnet defaults — override with real wallet keys) ──────────
# Never commit real private keys.  Dev keys match Hardhat/Anvil account #0-#9.
ADMIN_TOKEN=REPLACE_WITH_LOCAL_ADMIN_TOKEN
PRIVATE_KEY=REPLACE_WITH_DEV_PRIVATE_KEY

# ── Vault (disabled on devnet) ────────────────────────────────────────────────
VAULT_ADDR=
VAULT_TOKEN=
DEVENV
  chmod 600 "$ENV_FILE"
  log "devnet.env written."
else
  log "devnet.env already exists — skipping (use --update to overwrite)"
fi

# ── 4. SSH deploy key for push-to-vm.sh ─────────────────────────────────────
DEPLOY_KEY="/home/ghost/.ssh/ghostchain_deploy"
if [ ! -f "${DEPLOY_KEY}" ]; then
  log "Generating ghostchain_deploy SSH keypair..."
  sudo -u ghost ssh-keygen -t ed25519 -N "" -C "ghostchain-devnet-deploy" -f "${DEPLOY_KEY}"
else
  log "Deploy key already exists at ${DEPLOY_KEY}"
fi
log ""
log "  ══════════════════════════════════════════════════════════════════"
log "  IMPORTANT — add this public key to all target VMs' authorized_keys"
log "  (ghostchain-testnet-l1, ghost-testnet-validator, ghostl2-testnet,"
log "   ghostl3-testnet, ghostchain-mainnet-l1, ghost-mainnet-validator,"
log "   ghostl2-mainnet, ghostl3-mainnet)"
log ""
log "  Public key:"
cat "${DEPLOY_KEY}.pub"
log ""
log "  From the hypervisor run:"
log "    bash push-to-vm.sh --target testnet --dry-run   # (uses id_ed25519 until key distributed)"
log "  Or distribute via inject-devnet-key.sh on the hypervisor."
log "  ══════════════════════════════════════════════════════════════════"
log ""

# ── 5. Tooling (Foundry + Node) ───────────────────────────────────────────────
if ! command -v forge &>/dev/null; then
  log "Installing Foundry..."
  curl -fsSL https://foundry.paradigm.xyz | bash
  # shellcheck disable=SC1090
  source "${HOME}/.bashrc" 2>/dev/null || true
  foundryup
else
  log "Foundry already installed ($(forge --version 2>/dev/null | head -1))"
fi

if ! command -v node &>/dev/null; then
  log "Installing Node.js 22 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pnpm &>/dev/null; then
  log "Installing pnpm..."
  npm install -g pnpm
fi

# ── 6. Systemd — ghostdevnet (docker compose full stack) ─────────────────────
COMPOSE_FILE="$REPO_DIR/infra/docker/compose/docker-compose.core.yml"

# Fallback if the core compose lives elsewhere
if [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE="$REPO_DIR/docker-compose.yml"
fi

log "Configuring ghostdevnet systemd service..."
cat > /etc/systemd/system/ghostdevnet.service <<SERVICE
[Unit]
Description=GhostChain Devnet — L1 + L2 + L3 all-in-one (VM 45)
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
SyslogIdentifier=ghostdevnet

[Install]
WantedBy=multi-user.target
SERVICE

# ── 7. Health check ───────────────────────────────────────────────────────────
cat > /usr/local/bin/ghostdevnet-health <<'HEALTH'
#!/usr/bin/env bash
set -euo pipefail
ok=0; fail=0

check() {
  local name="$1" url="$2"
  local code
  code=$(curl -sSo /dev/null -w "%{http_code}" --max-time 4 "$url" 2>/dev/null || echo 000)
  if echo "$code" | grep -qE "^[23]"; then
    echo "  OK   ${name} (HTTP ${code})"
    (( ok++ )) || true
  else
    echo "  FAIL ${name} (HTTP ${code:-timeout})" >&2
    (( fail++ )) || true
  fi
}

rpc_check() {
  local name="$1" url="$2"
  local res
  res=$(curl -sSf --max-time 4 -X POST "$url" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' 2>/dev/null || echo "")
  if echo "$res" | grep -q '"result"'; then
    local block
    block=$(echo "$res" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))" 2>/dev/null || echo "?")
    echo "  OK   ${name} block=${block}"
    (( ok++ )) || true
  else
    echo "  FAIL ${name} (no response)" >&2
    (( fail++ )) || true
  fi
}

echo "=== ghostdevnet health ($(date -u +%H:%M:%SZ)) ==="
rpc_check "L1 :18545" "http://localhost:18545"
rpc_check "L2 :29547" "http://localhost:29547"
rpc_check "L3 :39545" "http://localhost:39545"
check "ghost-guard :7070" "http://localhost:7070/health"

echo "--- ok=${ok} fail=${fail} ---"
[ "$fail" -eq 0 ]
HEALTH
chmod +x /usr/local/bin/ghostdevnet-health

# ── 8. Health timer ───────────────────────────────────────────────────────────
cat > /etc/systemd/system/ghostdevnet-health.service <<HSVC
[Unit]
Description=GhostDevnet health check
After=ghostdevnet.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/ghostdevnet-health
HSVC

cat > /etc/systemd/system/ghostdevnet-health.timer <<HTIMER
[Unit]
Description=Run GhostDevnet health check every minute
After=ghostdevnet.service

[Timer]
OnBootSec=120
OnUnitActiveSec=60
Unit=ghostdevnet-health.service

[Install]
WantedBy=timers.target
HTIMER

# ── 9. Reload + enable ────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable ghostdevnet.service
systemctl enable ghostdevnet-health.timer

log "Devnet provision complete."
log "  VM IP   : ${VM_IP}"
log "  L1 RPC  : http://${VM_IP}:18545"
log "  L2 RPC  : http://${VM_IP}:29547"
log "  L3 RPC  : http://${VM_IP}:39545"
log "  Service : sudo journalctl -u ghostdevnet -f"
log "  Health  : sudo /usr/local/bin/ghostdevnet-health"
log ""
log "  Next: run push-to-vm.sh --target testnet to promote to VMs 71/73/77/79"
