#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# configure-ghostchain-nodes.sh — Full end-to-end configuration for the
# GhostChain L1 node cluster (bootnode, node1, node2) on VM IPs:
#   bootnode  10.50.99.20   ghost-ghostchain-bootnode-1
#   node1     10.50.99.21   ghost-ghostchain-node1-1
#   node2     10.50.99.22   ghost-ghostchain-node2-1
#
# Pushes gitignored secrets / chaindata and starts all three services.
#
# Prerequisites (on the hypervisor / devnet):
#   - VMs provisioned and running (reprovision-all.sh done)
#   - infra/ghostchain/secrets/jwtsecret   exists
#   - infra/ghostchain/geth/password.txt   exists
#   - infra/ghostchain/geth/genesis.json   exists
#   - infra/ghostchain/data/node1/         initialized chaindata
#   - infra/ghostchain/data/node2/         initialized chaindata
#
# Usage:
#   sudo bash configure-ghostchain-nodes.sh
#   SSH_KEY=/path/to/key bash configure-ghostchain-nodes.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"   # /opt/ghostl-stack or wherever

GHOSTCHAIN_DIR="${REPO_DIR}/infra/ghostchain"
GETH_CONFIG="${GHOSTCHAIN_DIR}/geth"
SECRETS_SRC="${GHOSTCHAIN_DIR}/secrets"
DATA_SRC="${GHOSTCHAIN_DIR}/data"

SSH_KEY="${SSH_KEY:-/home/ghost/.ssh/id_ed25519}"
SSH_USER="${SSH_USER:-ghost}"
SOPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=20 -o BatchMode=yes"

IP_BOOTNODE="10.50.99.20"
IP_NODE1="10.50.99.21"
IP_NODE2="10.50.99.22"

GETH_IMAGE="${GETH_IMAGE:-ghostchain/ghost-geth:alltools-v1.13.14}"

DATA_ROOT="/var/lib/ghostchain"
SECRETS_DEST="/etc/ghostchain/secrets"
GETH_CONF_DEST="/opt/ghostl-stack/infra/ghostchain/geth"

log()  { echo "[ghostchain-configure] $(date -u +%H:%M:%SZ) $*"; }
warn() { echo "[ghostchain-configure] WARN: $*" >&2; }
die()  { echo "[ghostchain-configure] FATAL: $*" >&2; exit 1; }

ssh_vm()  { ssh  $SOPTS -i "$SSH_KEY" "${SSH_USER}@$1" "${@:2}"; }
scp_to()  { scp  $SOPTS -i "$SSH_KEY" -r "$2" "${SSH_USER}@$1:$3"; }
rsync_to(){ rsync -az --exclude='LOCK' --exclude='*.ldb.tmp' \
              -e "ssh $SOPTS -i $SSH_KEY" "$2" "${SSH_USER}@${1}:${3}"; }

# ─────────────────────────────────────────────────────────────────────────────
# Preflight
# ─────────────────────────────────────────────────────────────────────────────
[ -f "${SECRETS_SRC}/jwtsecret" ] || die "Missing ${SECRETS_SRC}/jwtsecret"
[ -f "${GETH_CONFIG}/password.txt" ] || die "Missing ${GETH_CONFIG}/password.txt"
[ -f "${GETH_CONFIG}/genesis.json" ] || die "Missing ${GETH_CONFIG}/genesis.json"
[ -f "${GETH_CONFIG}/run-node.sh" ]  || die "Missing ${GETH_CONFIG}/run-node.sh"
[ -d "${DATA_SRC}/node1" ] || die "Missing ${DATA_SRC}/node1"
[ -d "${DATA_SRC}/node2" ] || die "Missing ${DATA_SRC}/node2"

JWT="$(cat "${SECRETS_SRC}/jwtsecret")"
log "JWT secret: ${JWT:0:8}... (OK)"

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Push JWT secret to all 3 VMs
# ─────────────────────────────────────────────────────────────────────────────
log "══════════════════════════════════════════════"
log "Step 1: Pushing JWT secret to all 3 VMs"
log "══════════════════════════════════════════════"
for ip in "$IP_BOOTNODE" "$IP_NODE1" "$IP_NODE2"; do
  log "  → $ip"
  ssh_vm "$ip" "sudo install -d -m 755 ${SECRETS_DEST} && sudo chown ghost:ghost ${SECRETS_DEST}"
  echo "$JWT" | ssh_vm "$ip" "sudo tee ${SECRETS_DEST}/jwtsecret > /dev/null && sudo chown ghost:ghost ${SECRETS_DEST}/jwtsecret && sudo chmod 600 ${SECRETS_DEST}/jwtsecret"
done
log "JWT deployed."

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Push password.txt to node VMs (needed for keystore unlock)
# ─────────────────────────────────────────────────────────────────────────────
log "══════════════════════════════════════════════"
log "Step 2: Pushing password.txt"
log "══════════════════════════════════════════════"
PASS="$(cat "${GETH_CONFIG}/password.txt")"
for ip in "$IP_NODE1" "$IP_NODE2"; do
  log "  → $ip"
  echo "$PASS" | ssh_vm "$ip" \
    "sudo tee ${GETH_CONF_DEST}/password.txt > /dev/null && sudo chown ghost:ghost ${GETH_CONF_DEST}/password.txt && sudo chmod 600 ${GETH_CONF_DEST}/password.txt"
done
log "Password pushed."

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Bootstrap the bootnode
# ─────────────────────────────────────────────────────────────────────────────
log "══════════════════════════════════════════════"
log "Step 3: Bootstrapping bootnode (${IP_BOOTNODE})"
log "══════════════════════════════════════════════"

# Copy existing boot.key if present (preserves peer identity)
if [ -f "${DATA_SRC}/bootnode/boot.key" ]; then
  log "  Pushing existing boot.key..."
  ssh_vm "$IP_BOOTNODE" "sudo install -d -m 755 ${DATA_ROOT}/bootnode && sudo chown ghost:ghost ${DATA_ROOT}/bootnode"
  cat "${DATA_SRC}/bootnode/boot.key" | ssh_vm "$IP_BOOTNODE" \
    "sudo tee ${DATA_ROOT}/bootnode/boot.key > /dev/null && sudo chown ghost:ghost ${DATA_ROOT}/bootnode/boot.key && sudo chmod 600 ${DATA_ROOT}/bootnode/boot.key"
  log "  boot.key pushed."
else
  log "  No existing boot.key — bootnode will auto-generate one on first start."
fi

log "  Starting ghostchain-bootnode.service..."
ssh_vm "$IP_BOOTNODE" "sudo systemctl restart ghostchain-bootnode.service"
sleep 6

# Wait for the bootnode to write its enode
log "  Waiting for bootnode-enode.txt..."
ENODE=""
for i in $(seq 1 20); do
  ENODE=$(ssh_vm "$IP_BOOTNODE" "cat ${DATA_ROOT}/bootnode/bootnode-enode.txt 2>/dev/null" || true)
  if [ -n "$ENODE" ]; then
    break
  fi
  sleep 3
done

if [ -z "$ENODE" ]; then
  # Derive enode directly from boot.key
  log "  enode file not yet written — deriving from boot.key..."
  BOOT_ID=$(ssh_vm "$IP_BOOTNODE" \
    "sudo docker run --rm -v ${DATA_ROOT}/bootnode:/config ${GETH_IMAGE} bootnode --nodekey /config/boot.key --writeaddress 2>/dev/null" || true)
  if [ -n "$BOOT_ID" ]; then
    ENODE="enode://${BOOT_ID}@${IP_BOOTNODE}:30301"
    ssh_vm "$IP_BOOTNODE" "echo '${ENODE}' | sudo tee ${DATA_ROOT}/bootnode/bootnode-enode.txt > /dev/null"
    log "  Derived enode: ${ENODE}"
  else
    die "Could not determine bootnode enode. Check: journalctl -u ghostchain-bootnode"
  fi
fi

# Fix IP if enode still has old docker network IP
ENODE="${ENODE/172.28.0.21/${IP_BOOTNODE}}"
ENODE="${ENODE/127.0.0.1/${IP_BOOTNODE}}"
log "  Enode: ${ENODE}"

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Push chain data to node VMs
# ─────────────────────────────────────────────────────────────────────────────
log "══════════════════════════════════════════════"
log "Step 4: Pushing chain data to node1 + node2"
log "══════════════════════════════════════════════"

for pair in "node1:$IP_NODE1" "node2:$IP_NODE2"; do
  NODE="${pair%%:*}"
  IP="${pair##*:}"
  log "  Syncing ${DATA_SRC}/${NODE}/ → ${IP}:${DATA_ROOT}/${NODE}/"

  ssh_vm "$IP" "sudo install -d -m 755 ${DATA_ROOT}/${NODE} && sudo chown ghost:ghost ${DATA_ROOT}/${NODE}"

  # rsync as ghost user then fix ownership
  rsync_to "$IP" "${DATA_SRC}/${NODE}/" "~/${NODE}-staging/"

  ssh_vm "$IP" "
    sudo rsync -a --exclude='LOCK' ~/${NODE}-staging/ ${DATA_ROOT}/${NODE}/
    sudo rm -rf ~/${NODE}-staging
    sudo chown -R ghost:ghost ${DATA_ROOT}/${NODE}
  "
  log "  ${NODE} data pushed."
done

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Push bootnode enode to node VMs + write static-nodes.json
# ─────────────────────────────────────────────────────────────────────────────
log "══════════════════════════════════════════════"
log "Step 5: Distributing bootnode enode + static-nodes.json"
log "══════════════════════════════════════════════"

# Derive P2P host ports from the systemd unit files (node1=30303, node2=30304)
NODE1_P2P=30303
NODE2_P2P=30304

# Get node enodes via admin_nodeInfo after node services are up (populated in step 6)
# For now just write the bootnode enode; static peers are added after geth is up

for ip in "$IP_NODE1" "$IP_NODE2"; do
  log "  → $ip: writing bootnode-enode.txt"
  ssh_vm "$ip" "
    sudo install -d -m 755 ${DATA_ROOT}/bootnode
    sudo chown ghost:ghost ${DATA_ROOT}/bootnode
    echo '${ENODE}' | sudo tee ${DATA_ROOT}/bootnode/bootnode-enode.txt > /dev/null
    sudo chown ghost:ghost ${DATA_ROOT}/bootnode/bootnode-enode.txt
    sudo chmod 644 ${DATA_ROOT}/bootnode/bootnode-enode.txt
    sudo chmod -R o+r ${GETH_CONF_DEST}/ 2>/dev/null || true
    sudo find ${GETH_CONF_DEST}/ -type d -exec sudo chmod o+x {} + 2>/dev/null || true
  "
done
log "Enode distributed."

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Initialise geth (if needed) and start node services
# ─────────────────────────────────────────────────────────────────────────────
log "══════════════════════════════════════════════"
log "Step 6: Init + start node1 and node2"
log "══════════════════════════════════════════════"

for pair in "node1:$IP_NODE1" "node2:$IP_NODE2"; do
  NODE="${pair%%:*}"
  IP="${pair##*:}"

  log "  Checking geth init on ${NODE} (${IP})..."
  INITIALIZED=$(ssh_vm "$IP" \
    "[ -f '${DATA_ROOT}/${NODE}/geth/chaindata/CURRENT' ] && echo yes || echo no")

  if [ "$INITIALIZED" = "no" ]; then
    log "  Chain not initialized — running geth init on ${NODE}..."
    ssh_vm "$IP" "
      sudo docker run --rm \
        -v ${DATA_ROOT}/${NODE}:/data \
        -v ${GETH_CONF_DEST}:/config:ro \
        ${GETH_IMAGE} \
        geth --datadir /data init /config/genesis.json 2>&1
    " | sed "s/^/  [${NODE}] /"
  else
    log "  ${NODE} already initialized (chaindata/CURRENT present) — skipping init."
  fi

  log "  Starting ghostchain-node.service on ${NODE} (${IP})..."
  ssh_vm "$IP" "sudo systemctl restart ghostchain-node.service"
  sleep 4

  STATUS=$(ssh_vm "$IP" "systemctl is-active ghostchain-node.service 2>/dev/null || echo inactive")
  log "  ${NODE} service status: ${STATUS}"
done

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Summary
# ─────────────────────────────────────────────────────────────────────────────
log ""
log "══════════════════════════════════════════════"
log "GhostChain Node Configuration Complete"
log "══════════════════════════════════════════════"
log ""
log "  Bootnode:  enode = ${ENODE}"
log ""
log "Service status:"
for pair in "bootnode:$IP_BOOTNODE" "node1:$IP_NODE1" "node2:$IP_NODE2"; do
  NAME="${pair%%:*}"
  IP="${pair##*:}"
  SVC="ghostchain-${NAME}.service"
  STATUS=$(ssh_vm "$IP" "systemctl is-active ${SVC} 2>/dev/null || echo inactive")
  log "  ${IP}  ${SVC}  → ${STATUS}"
done
log ""
log "Check logs:"
log "  ssh ${SSH_USER}@${IP_BOOTNODE} 'sudo journalctl -u ghostchain-bootnode -f'"
log "  ssh ${SSH_USER}@${IP_NODE1}    'sudo journalctl -u ghostchain-node -f'"
log "  ssh ${SSH_USER}@${IP_NODE2}    'sudo journalctl -u ghostchain-node -f'"
log ""
log "Check block height:"
for ip in "$IP_NODE1" "$IP_NODE2"; do
  HEIGHT=$(curl -sf -X POST -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    "http://${ip}:18545" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(int(d['result'],16))" 2>/dev/null || echo "not-ready-yet")
  log "  ${ip}:18545  block = ${HEIGHT}"
done
