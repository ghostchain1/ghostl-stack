#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ghostchain-node-provision.sh — Provision a GhostChain L1 node VM
#
# Replaces docker containers:
#   ghost-ghostchain-bootnode-1  (ROLE=bootnode)
#   ghost-ghostchain-node1-1     (ROLE=node)
#   ghost-ghostchain-node2-1     (ROLE=node)
#
# Environment variables (set by cloud-init runcmd):
#   ROLE          bootnode | node
#
# Usage (via cloud-init or direct):
#   ROLE=bootnode bash ghostchain-node-provision.sh
#   ROLE=node     bash ghostchain-node-provision.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROLE="${ROLE:-node}"
GHOSTL_STACK_REPO="https://github.com/ghostchain1/ghostl-stack.git"
GHOSTL_STACK_DIR="/opt/ghostl-stack"
GETH_IMAGE="${GETH_IMAGE:-ghostchain/ghost-geth:alltools-v1.13.14}"

DATA_ROOT="/var/lib/ghostchain"
SECRETS_DIR="/etc/ghostchain/secrets"
L1_CHAIN_ID="${L1_CHAIN_ID:-14000101}"

log() { echo "[ghostchain-node-provision] $(date -u +%H:%M:%SZ) $*"; }

# ── Prerequisites ─────────────────────────────────────────────────────────────
log "Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y \
  apt-transport-https ca-certificates curl gnupg lsb-release \
  git jq htop ufw

# Docker CE
if ! command -v docker &>/dev/null; then
  log "Installing Docker CE..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

# ── Repo clone ────────────────────────────────────────────────────────────────
if [ ! -d "$GHOSTL_STACK_DIR/.git" ]; then
  log "Cloning ghostl-stack repo..."
  git clone --depth 1 "$GHOSTL_STACK_REPO" "$GHOSTL_STACK_DIR"
else
  log "Repo already present; pulling latest..."
  git -C "$GHOSTL_STACK_DIR" pull --ff-only || true
fi

# ── Data directories ──────────────────────────────────────────────────────────
install -d -m 755 "$DATA_ROOT"/{bootnode,node1,node2} "$SECRETS_DIR"
# ghost user (uid 1001, gid 1001) owns data dirs — matches --user 1001:1001 in containers
chown -R ghost:ghost "$DATA_ROOT"/{bootnode,node1,node2}

# JWT secret (generated locally; operators must paste the canonical one)
if [ ! -f "$SECRETS_DIR/jwtsecret" ]; then
  log "Generating JWT secret..."
  openssl rand -hex 32 > "$SECRETS_DIR/jwtsecret"
  log "WARNING: Replace $SECRETS_DIR/jwtsecret with the canonical JWT before starting nodes."
fi
# Ensure secrets are readable by container user (ghost, uid 1001)
chmod 644 "$SECRETS_DIR/jwtsecret" 2>/dev/null || true
chmod 755 "$SECRETS_DIR"

# ── Pull geth image ───────────────────────────────────────────────────────────
log "Pulling geth image: $GETH_IMAGE..."
docker pull "$GETH_IMAGE"

# ── Ensure geth config dir is readable by ghost user (uid 1001) ──────────────────
GETH_CONFIG_BASE="$GHOSTL_STACK_DIR/infra/ghostchain/geth"
chmod -R o+r "$GETH_CONFIG_BASE" 2>/dev/null || true
find "$GETH_CONFIG_BASE" -type d -exec chmod o+x {} + 2>/dev/null || true

# ── Systemd unit per role ─────────────────────────────────────────────────────
UNIT_DIR="/etc/systemd/system"

case "$ROLE" in
  bootnode)
    log "Configuring: ghostchain-bootnode"
    cat > "$UNIT_DIR/ghostchain-bootnode.service" <<UNIT
[Unit]
Description=GhostChain L1 Bootnode
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=30
ExecStartPre=-/usr/bin/docker rm -f ghostchain-bootnode
ExecStart=/usr/bin/docker run --rm --name ghostchain-bootnode \
  --user 1000:1001 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -v ${DATA_ROOT}/bootnode:/config \
  -p 30301:30301/udp \
  --memory=256m --cpus=0.5 \
  --label com.ghost.role=ghostchain-bootnode \
  ${GETH_IMAGE} \
  bootnode --nodekey /config/boot.key --addr :30301
ExecStop=/usr/bin/docker stop ghostchain-bootnode

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable ghostchain-bootnode.service
    log "Enabled ghostchain-bootnode.service"
    ;;

  node)
    # Determine node index from hostname (node1-1 → node1, node2-1 → node2)
    HOSTNAME_VAL="$(hostname)"
    case "$HOSTNAME_VAL" in
      *node2*) NODE_NUM=2; NODE_DATA="${DATA_ROOT}/node2"; P2P_PORT=30304; HTTP_PORT=18545; AUTH_PORT=18551; SIGNER="0x70997970c51812dc3a010c7d01b50e0d17dc79c8" ;;
      *)       NODE_NUM=1; NODE_DATA="${DATA_ROOT}/node1"; P2P_PORT=30303; HTTP_PORT=18545; AUTH_PORT=18551; SIGNER="0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" ;;
    esac
    log "Configuring: ghostchain-node${NODE_NUM}"

    GETH_CONFIG_DIR="$GHOSTL_STACK_DIR/infra/ghostchain/geth"

    cat > "$UNIT_DIR/ghostchain-node.service" <<UNIT
[Unit]
Description=GhostChain L1 Node ${NODE_NUM}
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=15
TimeoutStartSec=90
TimeoutStopSec=30
ExecStartPre=-/usr/bin/docker rm -f ghostchain-node${NODE_NUM}
ExecStart=/usr/bin/docker run --rm --name ghostchain-node${NODE_NUM} \
  --user 1000:1001 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -v ${NODE_DATA}:/data \
  -v ${GETH_CONFIG_DIR}:/config:ro \
  -v ${DATA_ROOT}/bootnode:/run/bootnode:ro \
  -v ${SECRETS_DIR}:/secrets:ro \
  -p ${HTTP_PORT}:8545 \
  -p 18546:8546 \
  -p ${AUTH_PORT}:8551 \
  -p ${P2P_PORT}:30303 \
  -e CHAIN_ID=${L1_CHAIN_ID} \
  -e SIGNER_ADDRESS=${SIGNER} \
  -e MINING_ENABLED=1 \
  -e HTTP_PORT=8545 \
  -e WS_PORT=8546 \
  -e AUTH_PORT=8551 \
  -e P2P_PORT=30303 \
  -e AUTH_JWT_FILE=/secrets/jwtsecret \
  -e HTTP_APIS=eth,net,web3,debug,txpool,admin \
  -e WS_APIS=eth,net,web3 \
  -e HTTP_VHOSTS="*" \
  -e HTTP_CORS="*" \
  --memory=2g --cpus=1.5 \
  --label com.ghost.role=ghostchain-node \
  --label com.ghost.node=${NODE_NUM} \
  ${GETH_IMAGE} \
  /bin/sh /config/run-node.sh
ExecStop=/usr/bin/docker stop ghostchain-node${NODE_NUM}

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable ghostchain-node.service
    log "Enabled ghostchain-node.service (node${NODE_NUM})"
    ;;

  *)
    log "ERROR: Unknown ROLE='${ROLE}'. Use: bootnode | node"
    exit 1
    ;;
esac

# ── Firewall ──────────────────────────────────────────────────────────────────
log "Configuring ufw..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from 10.50.99.0/24
ufw allow 22/tcp
ufw allow 30303/udp
ufw allow 30304/udp
ufw allow 30301/udp
ufw --force enable

log "GhostChain ${ROLE} provision complete."
log "Start service: systemctl start ghostchain-${ROLE}.service"
