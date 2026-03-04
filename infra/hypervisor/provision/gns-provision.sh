#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gns-provision.sh — Ghost Name Service (GNS) VM provisioner
#
# Each GNS function is a separate libvirt VM, provisioned by this single
# script switched by GNS_ROLE.
#
# Replaces docker containers:
#   gns-bind9          → VM 10.50.99.30  (GNS_ROLE=bind9)
#   gns-kea-ctrl-agent )
#   gns-kea-dhcp4      }  → VM 10.50.99.31  (GNS_ROLE=kea)
#   gns-kea-ddns       )
#   gns-postgres       → VM 10.50.99.32  (GNS_ROLE=postgres)
#   gns-indexer        → VM 10.50.99.33  (GNS_ROLE=indexer)
#   gns-api            → VM 10.50.99.34  (GNS_ROLE=api)
#
# Usage (via cloud-init runcmd or direct):
#   GNS_ROLE=bind9    bash gns-provision.sh
#   GNS_ROLE=kea      bash gns-provision.sh
#   GNS_ROLE=postgres bash gns-provision.sh
#   GNS_ROLE=indexer  bash gns-provision.sh
#   GNS_ROLE=api      bash gns-provision.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GNS_ROLE="${GNS_ROLE:-}"
GHOSTL_STACK_REPO="https://github.com/ghostchain1/ghostl-stack.git"
GHOSTL_STACK_DIR="/opt/ghostl-stack"
GNS_INTERNAL_DOMAIN="${GNS_INTERNAL_DOMAIN:-ghostchain.internal}"
GNS_BIND9_IP="${GNS_BIND9_IP:-10.50.99.30}"
GNS_KEA_IP="${GNS_KEA_IP:-10.50.99.31}"
GNS_POSTGRES_IP="${GNS_POSTGRES_IP:-10.50.99.32}"
GNS_INDEXER_IP="${GNS_INDEXER_IP:-10.50.99.33}"
GNS_API_IP="${GNS_API_IP:-10.50.99.34}"
GNS_MGMT_CIDR="${GNS_MGMT_CIDR:-10.50.99.0/24}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
BIND9_IMAGE="${BIND9_IMAGE:-internetsystemsconsortium/bind9:9.20}"
KEA_IMAGE="${KEA_IMAGE:-ghcr.io/isc-projects/kea:2.6}"

UNIT_DIR="/etc/systemd/system"

log() { echo "[gns-provision/${GNS_ROLE:-?}] $(date -u +%H:%M:%SZ) $*"; }

if [ -z "$GNS_ROLE" ]; then
  echo "ERROR: GNS_ROLE must be set. Options: bind9 | kea | postgres | indexer | api"
  exit 1
fi

# ── Base packages ─────────────────────────────────────────────────────────────
log "Installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y \
  apt-transport-https ca-certificates curl gnupg lsb-release \
  git jq htop ufw python3 python3-pip

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

# Repo
if [ ! -d "$GHOSTL_STACK_DIR/.git" ]; then
  log "Cloning ghostl-stack..."
  git clone --depth 1 "$GHOSTL_STACK_REPO" "$GHOSTL_STACK_DIR"
else
  git -C "$GHOSTL_STACK_DIR" pull --ff-only || true
fi

# ── Role-specific provisioning ────────────────────────────────────────────────
case "$GNS_ROLE" in

# ── BIND9 authoritative DNS ───────────────────────────────────────────────────
bind9)
  log "Provisioning gns-bind9 (BIND9 authoritative + forwarding)..."
  install -d -m 750 /etc/gns/bind /var/lib/gns/bind

  # named.conf
  cat > /etc/gns/bind/named.conf <<'NAMED'
options {
    directory "/var/cache/bind";
    listen-on  { any; };
    listen-on-v6 { any; };
    allow-recursion { 10.50.99.0/24; 127.0.0.1; };
    allow-query    { any; };
    recursion yes;
    dnssec-validation auto;
    forwarders { 1.1.1.1; 8.8.8.8; };
    forward first;
};

// Internal GhostChain zone
zone "ghostchain.internal" IN {
    type primary;
    file "/etc/bind/zones/ghostchain.internal.db";
    allow-update { 10.50.99.31; };   // kea-ddns may update this
};

// Reverse zone for 10.50.99.x
zone "99.50.10.in-addr.arpa" IN {
    type primary;
    file "/etc/bind/zones/99.50.10.in-addr.arpa.db";
    allow-update { 10.50.99.31; };
};
NAMED

  install -d -m 750 /etc/gns/bind/zones

  # Forward zone
  cat > /etc/gns/bind/zones/ghostchain.internal.db <<ZONE
\$ORIGIN ghostchain.internal.
\$TTL 300
@   IN  SOA  ns1.ghostchain.internal. admin.ghostchain.internal. (
    $(date +%Y%m%d01) ; serial
    3600               ; refresh
    1800               ; retry
    604800             ; expire
    300                ; minimum TTL
)
@           IN  NS   ns1.ghostchain.internal.
ns1         IN  A    ${GNS_BIND9_IP}
kea         IN  A    ${GNS_KEA_IP}
postgres    IN  A    ${GNS_POSTGRES_IP}
indexer     IN  A    ${GNS_INDEXER_IP}
api         IN  A    ${GNS_API_IP}
ghost-web   IN  A    10.50.99.10
ghostchain-bootnode IN A 10.50.99.20
ghostchain-node1    IN A 10.50.99.21
ghostchain-node2    IN A 10.50.99.22
l1          IN  A    10.50.99.21
devnet      IN  A    10.50.99.45
l2-testnet  IN  A    10.50.99.77
l3-testnet  IN  A    10.50.99.79
l2-mainnet  IN  A    10.50.99.76
l3-mainnet  IN  A    10.50.99.78
ZONE

  # Reverse zone
  cat > /etc/gns/bind/zones/99.50.10.in-addr.arpa.db <<RZONE
\$ORIGIN 99.50.10.in-addr.arpa.
\$TTL 300
@   IN  SOA  ns1.ghostchain.internal. admin.ghostchain.internal. (
    $(date +%Y%m%d01) ; serial
    3600 1800 604800 300
)
@   IN  NS ns1.ghostchain.internal.
10  IN  PTR ghost-web.ghostchain.internal.
20  IN  PTR ghostchain-bootnode.ghostchain.internal.
21  IN  PTR ghostchain-node1.ghostchain.internal.
22  IN  PTR ghostchain-node2.ghostchain.internal.
30  IN  PTR ns1.ghostchain.internal.
31  IN  PTR kea.ghostchain.internal.
32  IN  PTR postgres.ghostchain.internal.
33  IN  PTR indexer.ghostchain.internal.
34  IN  PTR api.ghostchain.internal.
45  IN  PTR devnet.ghostchain.internal.
RZONE

  docker pull "$BIND9_IMAGE"

  cat > "$UNIT_DIR/gns-bind9.service" <<UNIT
[Unit]
Description=GNS BIND9 Authoritative DNS
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
TimeoutStopSec=15
ExecStartPre=-/usr/bin/docker rm -f gns-bind9
ExecStart=/usr/bin/docker run --rm --name gns-bind9 \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges:true \
  -v /etc/gns/bind/named.conf:/etc/bind/named.conf:ro \
  -v /etc/gns/bind/zones:/etc/bind/zones:ro \
  -v /var/lib/gns/bind:/var/cache/bind \
  -p 53:53/udp -p 53:53/tcp \
  --memory=256m --cpus=0.5 \
  --label com.ghost.role=gns-bind9 \
  ${BIND9_IMAGE}
ExecStop=/usr/bin/docker stop gns-bind9

[Install]
WantedBy=multi-user.target
UNIT
  ;;

# ── Kea DHCP + DDNS + ctrl-agent (all on one VM) ─────────────────────────────
kea)
  log "Provisioning gns-kea (kea-dhcp4 + kea-ddns + kea-ctrl-agent)..."
  install -d -m 750 /etc/gns/kea /var/lib/gns/kea

  # kea-dhcp4.conf
  cat > /etc/gns/kea/kea-dhcp4.conf <<'KEA4'
{
  "Dhcp4": {
    "interfaces-config": { "interfaces": ["*"] },
    "lease-database": {
      "type": "memfile",
      "persist": true,
      "name": "/var/lib/kea/kea-leases4.csv"
    },
    "valid-lifetime": 3600,
    "renew-timer": 1800,
    "rebind-timer": 2700,
    "subnet4": [{
      "id": 1,
      "subnet": "10.50.99.0/24",
      "pools": [{ "pool": "10.50.99.100 - 10.50.99.200" }],
      "option-data": [
        { "name": "routers",             "data": "10.50.99.1" },
        { "name": "domain-name-servers", "data": "10.50.99.30" },
        { "name": "domain-search",       "data": "ghostchain.internal" }
      ],
      "reservations": [
        { "hw-address": "52:54:00:00:01:0a", "ip-address": "10.50.99.10",  "hostname": "ghost-web" },
        { "hw-address": "52:54:00:00:01:14", "ip-address": "10.50.99.20",  "hostname": "ghost-ghostchain-bootnode-1" },
        { "hw-address": "52:54:00:00:01:15", "ip-address": "10.50.99.21",  "hostname": "ghost-ghostchain-node1-1" },
        { "hw-address": "52:54:00:00:01:16", "ip-address": "10.50.99.22",  "hostname": "ghost-ghostchain-node2-1" },
        { "hw-address": "52:54:00:00:01:1e", "ip-address": "10.50.99.30",  "hostname": "gns-bind9" },
        { "hw-address": "52:54:00:00:01:1f", "ip-address": "10.50.99.31",  "hostname": "gns-kea" },
        { "hw-address": "52:54:00:00:01:20", "ip-address": "10.50.99.32",  "hostname": "gns-postgres" },
        { "hw-address": "52:54:00:00:01:21", "ip-address": "10.50.99.33",  "hostname": "gns-indexer" },
        { "hw-address": "52:54:00:00:01:22", "ip-address": "10.50.99.34",  "hostname": "gns-api" },
        { "hw-address": "52:54:00:00:01:66", "ip-address": "10.50.99.66",  "hostname": "ghost-dns-slave" },
        { "hw-address": "52:54:00:00:01:70", "ip-address": "10.50.99.70",  "hostname": "ghostchain-mainnet-l1" },
        { "hw-address": "52:54:00:00:01:71", "ip-address": "10.50.99.71",  "hostname": "ghostchain-testnet-l1" },
        { "hw-address": "52:54:00:00:01:72", "ip-address": "10.50.99.72",  "hostname": "ghost-mainnet-validator" },
        { "hw-address": "52:54:00:00:01:73", "ip-address": "10.50.99.73",  "hostname": "ghost-testnet-validator" },
        { "hw-address": "52:54:00:00:01:76", "ip-address": "10.50.99.76",  "hostname": "ghostl2-mainnet" },
        { "hw-address": "52:54:00:00:01:77", "ip-address": "10.50.99.77",  "hostname": "ghostl2-testnet" },
        { "hw-address": "52:54:00:00:01:78", "ip-address": "10.50.99.78",  "hostname": "ghostl3-mainnet" },
        { "hw-address": "52:54:00:00:01:79", "ip-address": "10.50.99.79",  "hostname": "ghostl3-testnet" }
      ]
    }],
    "ddns-send-updates": true,
    "ddns-qualifying-suffix": "ghostchain.internal.",
    "dhcp-ddns": {
      "enable-updates": true,
      "server-ip": "127.0.0.1",
      "server-port": 53001
    },
    "control-socket": {
      "socket-type": "unix",
      "socket-name": "/var/lib/kea/kea4-ctrl.sock"
    },
    "loggers": [{ "name": "kea-dhcp4", "output_options": [{"output": "stdout"}], "severity": "INFO" }]
  }
}
KEA4

  # kea-ddns.conf
  cat > /etc/gns/kea/kea-dhcp-ddns.conf <<'KEADDNS'
{
  "DhcpDdns": {
    "ip-address": "127.0.0.1",
    "port": 53001,
    "forward-ddns": {
      "ddns-domains": [{
        "name": "ghostchain.internal.",
        "dns-servers": [{ "ip-address": "10.50.99.30", "port": 53 }]
      }]
    },
    "reverse-ddns": {
      "ddns-domains": [{
        "name": "99.50.10.in-addr.arpa.",
        "dns-servers": [{ "ip-address": "10.50.99.30", "port": 53 }]
      }]
    },
    "loggers": [{ "name": "kea-dhcp-ddns", "output_options": [{"output": "stdout"}], "severity": "INFO" }]
  }
}
KEADDNS

  # kea-ctrl-agent.conf
  cat > /etc/gns/kea/kea-ctrl-agent.conf <<'KEACTL'
{
  "Control-agent": {
    "http-host": "0.0.0.0",
    "http-port": 8000,
    "control-sockets": {
      "dhcp4": { "socket-type": "unix", "socket-name": "/var/lib/kea/kea4-ctrl.sock" }
    },
    "loggers": [{ "name": "kea-ctrl-agent", "output_options": [{"output": "stdout"}], "severity": "INFO" }]
  }
}
KEACTL

  # Install Kea via native apt packages (Ubuntu 24.04 noble universe).
  # ghcr.io/isc-projects/kea requires registry auth; apt is more reliable.
  log "Installing isc-kea packages via apt..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    isc-kea-dhcp4-server isc-kea-dhcp-ddns-server isc-kea-ctrl-agent

  # Install the configs we generated above into /etc/kea/ (the native location)
  install -d -m 750 /etc/kea
  cp /etc/gns/kea/kea-dhcp4.conf      /etc/kea/kea-dhcp4.conf
  cp /etc/gns/kea/kea-dhcp-ddns.conf  /etc/kea/kea-dhcp-ddns.conf
  cp /etc/gns/kea/kea-ctrl-agent.conf /etc/kea/kea-ctrl-agent.conf
  chmod 640 /etc/kea/kea-dhcp4.conf /etc/kea/kea-dhcp-ddns.conf /etc/kea/kea-ctrl-agent.conf
  ;;

# ── PostgreSQL (GNS backing DB) ───────────────────────────────────────────────
postgres)
  log "Provisioning gns-postgres (PostgreSQL 16)..."
  install -d -m 700 /var/lib/gns/postgres
  install -d -m 750 /etc/gns

  GNS_POSTGRES_PASSWORD="${GNS_POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"
  echo "GNS_POSTGRES_PASSWORD=${GNS_POSTGRES_PASSWORD}" > /etc/gns/postgres.env
  chmod 600 /etc/gns/postgres.env
  log "Postgres password written to /etc/gns/postgres.env — back this up!"

  docker pull "$POSTGRES_IMAGE"

  cat > "$UNIT_DIR/gns-postgres.service" <<UNIT
[Unit]
Description=GNS PostgreSQL Database
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
TimeoutStopSec=30
ExecStartPre=-/usr/bin/docker rm -f gns-postgres
ExecStart=/usr/bin/docker run --rm --name gns-postgres \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -v /var/lib/gns/postgres:/var/lib/postgresql/data \
  -p 5432:5432 \
  -e POSTGRES_USER=gns \
  -e POSTGRES_PASSWORD=${GNS_POSTGRES_PASSWORD} \
  -e POSTGRES_DB=gns \
  -e PGDATA=/var/lib/postgresql/data \
  --memory=2g --cpus=1.5 \
  --label com.ghost.role=gns-postgres \
  ${POSTGRES_IMAGE} \
  postgres -c shared_buffers=256MB -c max_connections=100 -c wal_level=minimal
ExecStop=/usr/bin/docker stop gns-postgres

[Install]
WantedBy=multi-user.target
UNIT
  ;;

# ── GNS Indexer ───────────────────────────────────────────────────────────────
indexer)
  log "Provisioning gns-indexer..."
  GNS_INDEXER_IMAGE="${GNS_INDEXER_IMAGE:-ghostl/gns-indexer:latest}"
  docker pull "$GNS_INDEXER_IMAGE" 2>/dev/null || true

  cat > "$UNIT_DIR/gns-indexer.service" <<UNIT
[Unit]
Description=GNS Indexer
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=15
TimeoutStopSec=30
EnvironmentFile=-/etc/gns/indexer.env
ExecStartPre=-/usr/bin/docker rm -f gns-indexer
ExecStart=/usr/bin/docker run --rm --name gns-indexer \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -p 8080:8080 \
  -e DATABASE_URL=postgresql://gns:\${GNS_POSTGRES_PASSWORD}@${GNS_POSTGRES_IP}:5432/gns \
  -e L1_RPC_URL=http://10.50.99.21:18545 \
  -e L2_RPC_URL=http://10.50.99.77:29547 \
  -e L3_RPC_URL=http://10.50.99.79:39545 \
  -e LOG_LEVEL=info \
  --memory=2g --cpus=1.5 \
  --label com.ghost.role=gns-indexer \
  ${GNS_INDEXER_IMAGE}
ExecStop=/usr/bin/docker stop gns-indexer

[Install]
WantedBy=multi-user.target
UNIT

  install -d -m 750 /etc/gns
  # Placeholder env — operator fills in password
  cat > /etc/gns/indexer.env <<'ENV'
# GNS Indexer environment
GNS_POSTGRES_PASSWORD=CHANGE_ME
ENV
  chmod 600 /etc/gns/indexer.env
  ;;

# ── GNS API ───────────────────────────────────────────────────────────────────
api)
  log "Provisioning gns-api..."
  GNS_API_IMAGE="${GNS_API_IMAGE:-ghostl/gns-api:latest}"
  docker pull "$GNS_API_IMAGE" 2>/dev/null || true

  cat > "$UNIT_DIR/gns-api.service" <<UNIT
[Unit]
Description=GNS API Server
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=15
TimeoutStopSec=30
EnvironmentFile=-/etc/gns/api.env
ExecStartPre=-/usr/bin/docker rm -f gns-api
ExecStart=/usr/bin/docker run --rm --name gns-api \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://gns:\${GNS_POSTGRES_PASSWORD}@${GNS_POSTGRES_IP}:5432/gns \
  -e INDEXER_URL=http://${GNS_INDEXER_IP}:8080 \
  -e LOG_LEVEL=info \
  -e NODE_ENV=production \
  --memory=1g --cpus=1.0 \
  --label com.ghost.role=gns-api \
  ${GNS_API_IMAGE}
ExecStop=/usr/bin/docker stop gns-api

[Install]
WantedBy=multi-user.target
UNIT

  install -d -m 750 /etc/gns
  cat > /etc/gns/api.env <<'ENV'
# GNS API environment
GNS_POSTGRES_PASSWORD=CHANGE_ME
ENV
  chmod 600 /etc/gns/api.env
  ;;

*)
  log "ERROR: Unknown GNS_ROLE='${GNS_ROLE}'"
  echo "Options: bind9 | kea | postgres | indexer | api"
  exit 1
  ;;
esac

# ── Firewall ──────────────────────────────────────────────────────────────────
log "Configuring ufw for role=${GNS_ROLE}..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from "${GNS_MGMT_CIDR}"
ufw allow 22/tcp

case "$GNS_ROLE" in
  bind9)    ufw allow 53/udp; ufw allow 53/tcp ;;
  kea)      ufw allow 67/udp; ufw allow 8000/tcp ;;
  postgres) ufw allow from "${GNS_MGMT_CIDR}" to any port 5432 ;;
  indexer)  ufw allow 8080/tcp ;;
  api)      ufw allow 3000/tcp ;;
esac
ufw --force enable

# ── Enable & summarise ────────────────────────────────────────────────────────
systemctl daemon-reload

case "$GNS_ROLE" in
  bind9)
    systemctl enable --now gns-bind9.service
    log "gns-bind9 enabled and started."
    ;;
  kea)
    systemctl enable --now isc-kea-dhcp4-server isc-kea-dhcp-ddns-server isc-kea-ctrl-agent
    log "isc-kea-dhcp4-server, isc-kea-dhcp-ddns-server, isc-kea-ctrl-agent enabled and started."
    ;;
  postgres)
    systemctl enable --now gns-postgres.service
    log "gns-postgres enabled and started."
    ;;
  indexer)
    systemctl enable --now gns-indexer.service
    log "gns-indexer enabled and started."
    ;;
  api)
    systemctl enable --now gns-api.service
    log "gns-api enabled and started."
    ;;
esac

log "GNS ${GNS_ROLE} provision complete."
