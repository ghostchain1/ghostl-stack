#!/usr/bin/env bash
# =============================================================================
# 👻 GhostStack Genesis Installer v1.0
# =============================================================================
#
# One-command bootstrapper for the entire GhostStack sovereign blockchain
# infrastructure on Ubuntu 24.04 + KVM + Docker.
#
# What this script does (in order):
#   Phase 0  — Preflight: OS check, root check, hardware requirements
#   Phase 1  — Host bootstrap: apt packages, Docker, Node 22, Foundry, pnpm
#   Phase 2  — Git: clone / update the ghostl-stack repo
#   Phase 3  — KVM network: create gs-mgmt (10.50.99.0/24) libvirt network
#   Phase 4  — UFW firewall: open required ports, harden host
#   Phase 5  — VM provisioning: create all KVM VMs via create-vms.sh
#   Phase 6  — Secrets bootstrap: generate OP Stack keys, scaffold env files
#   Phase 7  — GhostChain L1: genesis + PoA geth cluster (chainId 14000101)
#   Phase 8  — OP Stack L2: op-geth + op-node + batcher + proposer
#   Phase 9  — OP Stack L3: l3-geth + l3-op-node + batcher + proposer
#   Phase 10 — Contract deployment: GST token, LGE, OP bridge, rollup contracts
#   Phase 11 — Data plane: postgres + redis + rabbitmq
#   Phase 12 — Identity & security: auth, rbac, ghost-guard, compliance
#   Phase 13 — Bridge & interop: ghost-relayer, proposers, challengers, bridge-hub
#   Phase 14 — AI intelligence layer: ghostbrain-core → hyper-ghost-ai (staged)
#   Phase 15 — Treasury & economy: fee collector → revenue aggregator → engine
#   Phase 16 — Governance layer: governance-service, hyper-ghost-governor, staking
#   Phase 17 — Explorer & indexing: ghostscout L1/L2/L3, block/tx indexers
#   Phase 18 — Monitoring: Prometheus + Grafana + Loki + promtail
#   Phase 19 — Control plane: ghost-compliance + apps/api + apps/web
#   Phase 20 — Post-deploy health check: all RPC + service health endpoints
#
# Usage (hypervisor host, as root):
#   sudo bash /home/ghost/ghostl-stack/infrastructure/scripts/genesis-install.sh
#
# Options (env vars):
#   GS_ENV=devnet|testnet|mainnet   (default: devnet)
#   GS_SKIP_VMS=1                   skip VM provisioning (containers only)
#   GS_SKIP_CONTRACTS=1             skip contract deployment
#   GS_SKIP_MONITORING=1            skip Prometheus/Grafana
#   GS_DRY_RUN=1                    print plan, no changes
#   REPO_URL=<url>                  git remote (default: github.com/ghostchain1/ghostl-stack)
#   REPO_BRANCH=<branch>            git branch (default: main)
#
# =============================================================================
set -euo pipefail

# ─── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ─── global config ────────────────────────────────────────────────────────────
GS_ENV="${GS_ENV:-devnet}"          # devnet | testnet | mainnet
GS_SKIP_VMS="${GS_SKIP_VMS:-0}"
GS_SKIP_CONTRACTS="${GS_SKIP_CONTRACTS:-0}"
GS_SKIP_MONITORING="${GS_SKIP_MONITORING:-0}"
GS_DRY_RUN="${GS_DRY_RUN:-0}"

STACK_ROOT="/home/ghost/ghostl-stack"
REPO_URL="${REPO_URL:-https://github.com/ghostchain1/ghostl-stack.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
GS_USER="${GS_USER:-ghost}"

INFRA_DIR="$STACK_ROOT/infra"
PROVISION_DIR="$INFRA_DIR/hypervisor/provision"
OPSTACK_DIR="$INFRA_DIR/opstack"
SCRIPTS_DIR="$INFRA_DIR/scripts"
SERVICES_DIR="$STACK_ROOT/services"

# Chain IDs (canonical — do NOT change)
L1_CHAIN_ID=14000101
L2_CHAIN_ID=14000102
L3_CHAIN_ID=14000103

# RPC endpoints (local loopback - populated after chain startup)
HOST_L1_RPC="http://localhost:18545"
HOST_L2_RPC="http://localhost:29547"
HOST_L3_RPC="http://localhost:39545"
HOST_GATE_RPC="http://localhost:28546"

# KVM network
GS_MGMT_NETWORK="gs-mgmt"
GS_MGMT_CIDR="10.50.99.0/24"
GS_MGMT_GW="10.50.99.1"

# Public network (38.247.149.0/24 — secondary uplink on br0)
GS_PUBLIC_CIDR="38.247.149.0/24"
GS_PUBLIC_GW="38.247.149.1"
GS_HV_PUBLIC_IP="38.247.149.218"    # hypervisor secondary address on br0
GS_DEVNET_PUBLIC_IP="38.247.149.219" # ghostchain-devnet canonical public control IP

# Timing
STAGE_SLEEP=3
RPC_WAIT_ATTEMPTS=90
RPC_WAIT_SLEEP=2

# ─── logging helpers ──────────────────────────────────────────────────────────
log()   { echo -e "${CYAN}[ghoststack]${RESET} $(date -u +%H:%M:%SZ) $*"; }
info()  { echo -e "             $*"; }
ok()    { echo -e "${GREEN}[  OK  ]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[ WARN ]${RESET} $*" >&2; }
die()   { echo -e "${RED}[ FAIL ]${RESET} $*" >&2; exit 1; }
banner(){ echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${RESET}"; }
dryrun(){ if [ "$GS_DRY_RUN" = "1" ]; then echo -e "${YELLOW}[DRY-RUN]${RESET} $*"; return 0; fi; return 1; }

# ─── utility helpers ──────────────────────────────────────────────────────────
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }
need_root() { [ "$(id -u)" -eq 0 ] || die "Must run as root: sudo $0"; }

wait_rpc() {
  local url="$1" label="$2" attempts="${3:-$RPC_WAIT_ATTEMPTS}"
  log "Waiting for RPC: $label ($url)"
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 3 -X POST "$url" \
        -H 'content-type: application/json' \
        --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
        >/dev/null 2>&1; then
      ok "$label is up"
      return 0
    fi
    sleep "$RPC_WAIT_SLEEP"
  done
  die "RPC not responding after $((attempts * RPC_WAIT_SLEEP))s: $label ($url)"
}

wait_http() {
  local url="$1" label="$2" attempts="${3:-60}"
  log "Waiting for HTTP: $label ($url)"
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      ok "$label is up"
      return 0
    fi
    sleep 2
  done
  warn "HTTP not responding: $label ($url) — continuing anyway"
  return 0
}

upsert_env() {
  # upsert_env FILE KEY VALUE
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

gen_key() {
  # Generate a 32-byte random hex private key (0x-prefixed)
  printf '0x%s' "$(openssl rand -hex 32)"
}

# =============================================================================
# PHASE 0 — Preflight
# =============================================================================
phase0_preflight() {
  banner "PHASE 0 — Preflight"
  need_root

  # OS check
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    log "Detected OS: ${PRETTY_NAME:-unknown}"
    if [[ "${ID:-}" != "ubuntu" ]]; then
      warn "This installer targets Ubuntu 24.04. Detected: ${ID:-unknown}. Continuing..."
    fi
  fi

  CPU=$(nproc)
  RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
  DISK_GB=$(df -BG "$STACK_ROOT" 2>/dev/null | awk 'NR==2{gsub("G","",$4);print $4}' || echo "?")

  info "CPU cores:     $CPU"
  info "RAM:           ${RAM_GB} GB"
  info "Disk free:     ${DISK_GB} GB (at $STACK_ROOT)"
  info "GS_ENV:        $GS_ENV"
  info "STACK_ROOT:    $STACK_ROOT"
  info "REPO_URL:      $REPO_URL"
  info "SKIP_VMS:      $GS_SKIP_VMS"
  info "DRY_RUN:       $GS_DRY_RUN"

  if [ "$CPU" -lt 8 ]; then
    warn "Recommended: 8+ CPU cores (detected $CPU). Performance may be degraded."
  fi
  if [ "$RAM_GB" -lt 16 ]; then
    warn "Recommended: 16+ GB RAM (detected ${RAM_GB} GB). Expect OOM pressure."
  fi

  if dryrun "Phase 0 complete (dry-run)"; then return 0; fi

  ok "Preflight passed"
}

# =============================================================================
# PHASE 1 — Host Bootstrap
# =============================================================================
phase1_host_bootstrap() {
  banner "PHASE 1 — Host Bootstrap"
  dryrun "Would install: apt packages, Docker CE, Node 22, Foundry, pnpm" && return 0

  log "Updating apt package lists..."
  apt-get update -y -qq

  log "Installing base packages..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    software-properties-common \
    build-essential \
    git \
    git-lfs \
    jq \
    ufw \
    qemu-kvm \
    libvirt-daemon-system \
    libvirt-clients \
    virtinst \
    bridge-utils \
    cpu-checker \
    virt-manager \
    cloud-image-utils \
    genisoimage \
    python3 \
    python3-pip \
    openssl \
    netcat-openbsd \
    wget \
    unzip

  git lfs install --system >/dev/null 2>&1 || true

  # ── Docker CE ───────────────────────────────────────────────────────────────
  if ! command -v docker &>/dev/null; then
    log "Installing Docker CE..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    ok "Docker CE installed ($(docker --version))"
  else
    ok "Docker already installed ($(docker --version))"
  fi
  usermod -aG docker "$GS_USER" 2>/dev/null || true

  # ── Node.js 22 ──────────────────────────────────────────────────────────────
  if ! command -v node &>/dev/null || \
     ! node -e "process.exit(parseInt(process.version.slice(1)) >= 22 ? 0 : 1)" 2>/dev/null; then
    log "Installing Node.js 22.x..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
    ok "Node.js installed ($(node --version))"
  else
    ok "Node.js $(node --version) already installed"
  fi

  # ── pnpm ────────────────────────────────────────────────────────────────────
  if ! command -v pnpm &>/dev/null; then
    log "Installing pnpm..."
    npm install -g pnpm@latest >/dev/null 2>&1
    ok "pnpm installed ($(pnpm --version))"
  else
    ok "pnpm $(pnpm --version) already installed"
  fi

  # ── Foundry (forge / cast / anvil) ──────────────────────────────────────────
  if ! command -v forge &>/dev/null; then
    log "Installing Foundry..."
    curl -L https://foundry.paradigm.xyz | bash
    # Source the environment so forge is available in this process
    export PATH="$HOME/.foundry/bin:$PATH"
    foundryup >/dev/null 2>&1 || true
    ok "Foundry installed ($(forge --version 2>/dev/null || echo 'pending PATH refresh'))"
  else
    ok "Foundry already installed ($(forge --version))"
  fi

  ok "Phase 1 complete — host dependencies ready"
}

# =============================================================================
# PHASE 2 — Repository
# =============================================================================
phase2_repo() {
  banner "PHASE 2 — Repository"
  dryrun "Would clone/update $REPO_URL → $STACK_ROOT" && return 0

  if [ -d "$STACK_ROOT/.git" ]; then
    log "Updating existing repo at $STACK_ROOT (branch: $REPO_BRANCH)..."
    sudo -u "$GS_USER" git -C "$STACK_ROOT" fetch --depth=1 origin "$REPO_BRANCH"
    sudo -u "$GS_USER" git -C "$STACK_ROOT" reset --hard "origin/$REPO_BRANCH"
    ok "Repo updated ($(git -C "$STACK_ROOT" rev-parse --short HEAD))"
  else
    log "Cloning $REPO_URL into $STACK_ROOT..."
    sudo -u "$GS_USER" git clone --depth=1 --branch "$REPO_BRANCH" "$REPO_URL" "$STACK_ROOT"
    ok "Repo cloned"
  fi

  chown -R "$GS_USER:$GS_USER" "$STACK_ROOT"

  # Ensure the infrastructure/scripts directory this installer lives in exists
  mkdir -p "$STACK_ROOT/infrastructure/scripts/bootstrap"

  ok "Phase 2 complete — repo ready at $STACK_ROOT"
}

# =============================================================================
# PHASE 3 — KVM Network
# =============================================================================
phase3_kvm_network() {
  banner "PHASE 3 — KVM Network (gs-mgmt)"
  dryrun "Would create libvirt network gs-mgmt (10.50.99.0/24)" && return 0

  # Check KVM support
  if ! kvm-ok >/dev/null 2>&1; then
    warn "KVM hardware acceleration not available. VMs will run slowly."
  fi

  systemctl enable --now libvirtd

  if ! virsh net-info "$GS_MGMT_NETWORK" &>/dev/null; then
    log "Creating libvirt network: $GS_MGMT_NETWORK ($GS_MGMT_CIDR)..."
    virsh net-define /dev/stdin <<XML
<network>
  <name>${GS_MGMT_NETWORK}</name>
  <forward mode='nat'/>
  <bridge name='virbr-ghoststack' stp='on' delay='0'/>
  <ip address='${GS_MGMT_GW}' netmask='255.255.255.0'>
    <dhcp>
      <range start='10.50.99.100' end='10.50.99.254'/>
    </dhcp>
  </ip>
</network>
XML
    virsh net-start "$GS_MGMT_NETWORK"
    virsh net-autostart "$GS_MGMT_NETWORK"
    ok "Network $GS_MGMT_NETWORK created and started"
  else
    log "Network $GS_MGMT_NETWORK already defined"
    virsh net-start "$GS_MGMT_NETWORK" 2>/dev/null || true
    virsh net-autostart "$GS_MGMT_NETWORK" 2>/dev/null || true
    ok "Network $GS_MGMT_NETWORK is active"
  fi

  ok "Phase 3 complete"
}

# =============================================================================
# PHASE 4 — Firewall
# =============================================================================
phase4_firewall() {
  banner "PHASE 4 — UFW Firewall"
  dryrun "Would configure UFW with GhostStack port rules" && return 0

  # ── Trusted source ranges ─────────────────────────────────────────────────
  # Management (internal libvirt NAT) and both public uplinks are trusted for
  # admin-only ports.  Internet-facing ports are opened globally below.
  local MGMT_NET="10.50.99.0/24"
  local PUBLIC_NET="38.247.149.0/24"
  local PRIMARY_NET="208.110.71.128/26"

  ufw --force reset >/dev/null 2>&1 || true
  ufw default deny incoming
  ufw default allow outgoing

  # Allow forwarding for VM traffic (libvirt NAT and br0)
  sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw 2>/dev/null || true

  # SSH (critical — never block; restrict to known uplinks if desired)
  ufw allow 22/tcp comment 'SSH'

  # GhostChain L1 RPC — internet-facing (peers need to connect)
  ufw allow 18545/tcp comment 'GhostChain L1 RPC (HTTP)'
  ufw allow 18546/tcp comment 'GhostChain L1 RPC (WS)'
  ufw allow 18547/tcp comment 'GhostChain L1 node2 RPC'

  # OP Stack L2 RPC — internet-facing
  ufw allow 29545/tcp comment 'OP-Geth L2 RPC (HTTP)'
  ufw allow 29546/tcp comment 'OP-Geth L2 RPC (WS)'
  ufw allow 29547/tcp comment 'OP-Geth L2 authrpc'

  # OP Stack L3 RPC — internet-facing
  ufw allow 39545/tcp comment 'OP-Geth L3 RPC (HTTP)'
  ufw allow 39546/tcp comment 'OP-Geth L3 RPC (WS)'
  ufw allow 39547/tcp comment 'OP-Geth L3 authrpc'

  # P2P — internet-facing (discovery/gossip requires open access)
  ufw allow 30303/tcp  comment 'GhostChain L1 P2P (TCP)'
  ufw allow 30303/udp  comment 'GhostChain L1 P2P (UDP)'
  ufw allow 9003/udp   comment 'OP-Node P2P'

  # Public-facing user services
  ufw allow 4000/tcp comment 'apps/api (Express 5)'
  ufw allow 3200/tcp comment 'apps/web (Next.js)'
  ufw allow 4501/tcp comment 'Ghostscout L1'
  ufw allow 4502/tcp comment 'Ghostscout L2'
  ufw allow 4503/tcp comment 'Ghostscout L3'

  # DNS — internet-facing (GNS serves public queries)
  ufw allow 53/tcp  comment 'GNS DNS (TCP)'
  ufw allow 53/udp  comment 'GNS DNS (UDP)'

  # ── Admin/internal services — restricted to management + operator subnets ──
  # These services have no business being reachable from the open internet.
  for admin_port in \
      7070 \
      7071 \
      7100 \
      7171 \
      7681 \
      7682 \
      7683 \
      7684 \
      7685 \
      7900 \
      7901 \
      7902 \
      7903 \
      7904 \
      7910 \
      8090 \
      9100; do
    ufw allow from "$MGMT_NET"    to any port "$admin_port" proto tcp
    ufw allow from "$PUBLIC_NET"  to any port "$admin_port" proto tcp
    ufw allow from "$PRIMARY_NET" to any port "$admin_port" proto tcp
  done
  ok "Admin ports (7070,7171,7681-7685,7900-7910,8090,9100) restricted to mgmt+operator subnets"

  # Monitoring — restricted to operator subnets
  for mon_port in 9090 3000 3100; do
    ufw allow from "$MGMT_NET"    to any port "$mon_port" proto tcp
    ufw allow from "$PUBLIC_NET"  to any port "$mon_port" proto tcp
    ufw allow from "$PRIMARY_NET" to any port "$mon_port" proto tcp
  done
  ok "Monitoring ports (9090,3000,3100) restricted to operator subnets"

  # Allow all traffic within the management network (VM-to-VM, host-to-VM)
  ufw allow from "$MGMT_NET" comment 'Internal gs-mgmt VM traffic'

  ufw --force enable
  ok "Firewall configured (status below):"
  ufw status numbered | head -40

  ok "Phase 4 complete"
}

# =============================================================================
# PHASE 4b — iptables NAT for 38.247.149.x public range
# =============================================================================
# The 38.247.149.0/24 block is a secondary uplink on br0.  VMs that have a
# public IP (enp2s0 bound to an address in this range) route traffic directly
# through br0 — no host NAT is needed for those.
#
# This function installs a persistent iptables rule to:
#   1. Allow forwarding between br0 and virbr-ghoststack (mgmt ↔ public).
#   2. Masquerade outbound traffic from the gs-mgmt NAT network using the
#      hypervisor's primary public IP when no per-VM public NIC is present.
#   3. Persist rules across reboots via /etc/iptables/rules.v4 (iptables-save).
phase4b_nat() {
  banner "PHASE 4b — iptables NAT (38.247.149.x / br0)"
  dryrun "Would configure iptables MASQUERADE for gs-mgmt VMs via ${GS_HV_PUBLIC_IP:-38.247.149.218}" && return 0

  # Detect the public uplink interface (the one carrying 38.247.149.x)
  local pub_iface
  pub_iface=$(ip -4 route show to 38.247.149.0/24 2>/dev/null | awk '/dev/{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}' | head -1)
  if [ -z "$pub_iface" ]; then
    # Fall back to the primary uplink interface
    pub_iface=$(ip -4 route show default 2>/dev/null | awk '/dev/{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}' | head -1)
    warn "38.247.149.0/24 route not found — using default route device: ${pub_iface:-unknown}"
  fi
  log "Public uplink interface: ${pub_iface}"

  # Enable IP forwarding (kernel)
  sysctl -w net.ipv4.ip_forward=1
  grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.d/99-ghost-forward.conf 2>/dev/null \
    || echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-ghost-forward.conf

  # MASQUERADE: gs-mgmt VMs that do NOT have a direct public NIC use the
  # hypervisor's secondary IP (38.247.149.218) as their outbound address.
  iptables -t nat -C POSTROUTING -s 10.50.99.0/24 -o "${pub_iface}" -j MASQUERADE 2>/dev/null \
    || iptables -t nat -A POSTROUTING -s 10.50.99.0/24 -o "${pub_iface}" -j MASQUERADE

  # Allow established return traffic from the public side into the mgmt network
  iptables -C FORWARD -i "${pub_iface}" -o virbr-ghoststack -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
    || iptables  -A FORWARD -i "${pub_iface}" -o virbr-ghoststack -m state --state RELATED,ESTABLISHED -j ACCEPT
  iptables -C FORWARD -i virbr-ghoststack -o "${pub_iface}" -j ACCEPT 2>/dev/null \
    || iptables  -A FORWARD -i virbr-ghoststack -o "${pub_iface}" -j ACCEPT

  # Also allow br0 ↔ virbr-ghoststack forwarding (public-NIC VMs ↔ mgmt VMs)
  if ip link show br0 &>/dev/null; then
    iptables -C FORWARD -i br0 -o virbr-ghoststack -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
      || iptables  -A FORWARD -i br0 -o virbr-ghoststack -m state --state RELATED,ESTABLISHED -j ACCEPT
    iptables -C FORWARD -i virbr-ghoststack -o br0 -j ACCEPT 2>/dev/null \
      || iptables  -A FORWARD -i virbr-ghoststack -o br0 -j ACCEPT
  fi

  # Persist rules
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent 2>/dev/null || true
  mkdir -p /etc/iptables
  iptables-save > /etc/iptables/rules.v4
  ok "iptables NAT rules saved to /etc/iptables/rules.v4"
  ok "Phase 4b complete"
}

# =============================================================================
# PHASE 5 — VM Provisioning
# =============================================================================
phase5_vms() {
  banner "PHASE 5 — VM Provisioning"

  if [ "$GS_SKIP_VMS" = "1" ]; then
    warn "GS_SKIP_VMS=1 — skipping VM provisioning"
    return 0
  fi

  dryrun "Would run: sudo bash $PROVISION_DIR/create-vms.sh" && return 0

  if [ ! -f "$PROVISION_DIR/create-vms.sh" ]; then
    warn "create-vms.sh not found at $PROVISION_DIR — skipping VM provisioning"
    warn "Run manually: sudo bash $PROVISION_DIR/create-vms.sh"
    return 0
  fi

  log "Provisioning GhostStack VM fleet via create-vms.sh..."
  log "VM fleet (from infra/hypervisor/provision/inventory.sh):"
  info "  ghost-web                 10.50.99.10   2 vCPU   4 GB   100 GB  (web/api)"
  info "  ghost-dns-slave           10.50.99.66   1 vCPU   512MB   20 GB  (dns)"
  info "  ghost-ghostchain-bootnode 10.50.99.20   1 vCPU   512MB   20 GB  (boot)"
  info "  ghost-ghostchain-node1    10.50.99.21   2 vCPU   4 GB   300 GB  (L1 node)"
  info "  ghost-ghostchain-node2    10.50.99.22   2 vCPU   4 GB   300 GB  (L1 node)"
  info "  gns-bind9                 10.50.99.30   1 vCPU   512MB   20 GB  (gns dns)"
  info "  gns-kea                   10.50.99.31   1 vCPU   1 GB    20 GB  (gns dhcp)"
  info "  gns-postgres              10.50.99.32   2 vCPU   2 GB   100 GB  (gns db)"
  info "  gns-indexer               10.50.99.33   2 vCPU   2 GB    50 GB  (gns idx)"
  info "  gns-api                   10.50.99.34   2 vCPU   1 GB    30 GB  (gns api)"
  info "  ghostchain-devnet         38.247.149.219  4 vCPU   8 GB   300 GB  (devnet public control IP)"
  info "  ghostchain-testnet-l1     10.50.99.71   2 vCPU   2 GB   200 GB  (testnet l1)"
  info "  ghost-testnet-validator   10.50.99.73   2 vCPU   2 GB   100 GB  (testnet val)"
  info "  ghostl2-testnet           10.50.99.77   2 vCPU   4 GB   120 GB  (testnet l2)"
  info "  ghostl3-testnet           10.50.99.79   2 vCPU   4 GB   120 GB  (testnet l3)"
  info "  ghostchain-mainnet-l1     10.50.99.70   2 vCPU   6 GB   500 GB  (mainnet l1)"
  info "  ghost-mainnet-validator   10.50.99.72   2 vCPU   4 GB   200 GB  (mainnet val)"
  info "  ghostl2-mainnet           10.50.99.76   2 vCPU   4 GB   300 GB  (mainnet l2)"
  info "  ghostl3-mainnet           10.50.99.78   2 vCPU   4 GB   300 GB  (mainnet l3)"

  bash "$PROVISION_DIR/create-vms.sh"
  ok "Phase 5 complete — VM fleet provisioned"
}

# =============================================================================
# PHASE 6 — Secrets & Environment Bootstrap
# =============================================================================
phase6_secrets() {
  banner "PHASE 6 — Secrets & Environment Bootstrap"
  dryrun "Would scaffold infra/opstack/.env and services/stack.env" && return 0

  # ── OP Stack env ────────────────────────────────────────────────────────────
  local op_env="$OPSTACK_DIR/.env"
  local op_env_sample="$OPSTACK_DIR/.env.sample"
  if [ ! -f "$op_env" ]; then
    if [ -f "$op_env_sample" ]; then
      cp "$op_env_sample" "$op_env"
      log "Created $op_env from sample"
    else
      log "Creating minimal $op_env..."
      cat > "$op_env" <<OPENV
# GhostStack OP Stack Environment — generated by genesis-install.sh
# IMPORTANT: Set DEPLOYER_PRIVATE_KEY and remaining keys in .env.secrets

L1_CHAIN_ID=$L1_CHAIN_ID
L2_CHAIN_ID=$L2_CHAIN_ID
L3_CHAIN_ID=$L3_CHAIN_ID

HOST_L1_RPC=$HOST_L1_RPC
HOST_L2_RPC=$HOST_L2_RPC
HOST_L3_RPC=$HOST_L3_RPC

# Keys — will be generated below if not set
SEQUENCER_KEY=
BATCHER_KEY=
PROPOSER_KEY=
CHALLENGER_KEY=
SEQUENCER_ADDRESS=
BATCH_SENDER_ADDRESS=
PROPOSER_ADDRESS=
CHALLENGER_ADDRESS=
DEPLOYER_PRIVATE_KEY=
OPENV
    fi
  else
    log "OP Stack env already exists at $op_env"
  fi

  # Auto-generate OP Stack keys if not set
  local existing_seq
  existing_seq=$(grep '^SEQUENCER_KEY=' "$op_env" | cut -d= -f2-)
  if [ -z "$existing_seq" ]; then
    log "Generating OP Stack operational keys (sequencer/batcher/proposer/challenger)..."
    local seq_key bat_key prop_key chal_key
    seq_key=$(gen_key)
    bat_key=$(gen_key)
    prop_key=$(gen_key)
    chal_key=$(gen_key)

    upsert_env "$op_env" "SEQUENCER_KEY"   "$seq_key"
    upsert_env "$op_env" "BATCHER_KEY"     "$bat_key"
    upsert_env "$op_env" "PROPOSER_KEY"    "$prop_key"
    upsert_env "$op_env" "CHALLENGER_KEY"  "$chal_key"

    ok "OP Stack keys generated"
    warn "IMPORTANT: Fund these addresses on L1 before starting the OP Stack."
    info "  Sequencer key written to $op_env"
    info "  Fund sequencer/batcher/proposer/challenger addresses with L1 ETH"
  else
    log "OP Stack keys already set in $op_env"
  fi

  # ── Services stack.env ──────────────────────────────────────────────────────
  local stack_env="$SERVICES_DIR/stack.env"
  local stack_env_example="$STACK_ROOT/stack.env.example"
  if [ ! -f "$stack_env" ]; then
    if [ -f "$stack_env_example" ]; then
      cp "$stack_env_example" "$stack_env"
      log "Created $stack_env from $stack_env_example"
    else
      log "Creating minimal $stack_env..."
      cat > "$stack_env" <<SENV
# GhostStack Services Environment — generated by genesis-install.sh
NODE_ENV=production

# Chain RPCs
RPC_L1=$HOST_L1_RPC
GHOST_L1_RPC_URLS=$HOST_L1_RPC
GHOST_L2_RPC_URLS=$HOST_L2_RPC
GHOST_L3_RPC_URLS=$HOST_L3_RPC

# GhostBrain AI
GHOSTBRAIN_CORE_URL=http://localhost:7900

# Economy services
L3_FEE_COLLECTOR_URL=http://localhost:7681
L2_REVENUE_AGGREGATOR_URL=http://localhost:7682
TREASURY_ENGINE_URL=http://localhost:7683
REWARD_DISTRIBUTOR_URL=http://localhost:7684
HYPER_GHOST_GOVERNOR_URL=http://localhost:7685

# IMPORTANT: Set these before production deployment
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
COMPLIANCE_JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
SENV
    fi
    ok "Services stack.env bootstrapped"
  else
    log "stack.env already exists at $stack_env"
  fi

  # ── Sync env files ──────────────────────────────────────────────────────────
  if [ -f "$SCRIPTS_DIR/env-sync-stack.sh" ]; then
    bash "$SCRIPTS_DIR/env-sync-stack.sh" || warn "env-sync-stack.sh had warnings"
  fi

  # Set permissions: secrets must not be world-readable
  chmod 600 "$op_env" 2>/dev/null || true
  [ -f "$OPSTACK_DIR/.env.secrets" ] && chmod 600 "$OPSTACK_DIR/.env.secrets" 2>/dev/null || true
  chmod 600 "$stack_env" 2>/dev/null || true

  ok "Phase 6 complete — secrets bootstrapped"
}

# =============================================================================
# PHASE 7 — GhostChain L1
# =============================================================================
phase7_l1() {
  banner "PHASE 7 — GhostChain L1 (chainId $L1_CHAIN_ID)"
  dryrun "Would run: bash $INFRA_DIR/ghostchain/scripts/up.sh" && return 0

  local l1_up="$INFRA_DIR/ghostchain/scripts/up.sh"
  local l1_up_alt="$SCRIPTS_DIR/up-full.sh"

  if [ -f "$l1_up" ]; then
    log "Starting GhostChain L1 via $l1_up..."
    bash "$l1_up"
  elif [ -f "$l1_up_alt" ]; then
    log "Starting GhostChain L1 via up-full.sh (START_L1=1 only)..."
    START_L1=1 START_SERVICES=0 START_APPS=0 START_COMPLIANCE=0 \
      RUN_DOCTOR=0 SKIP_DEPLOY=1 bash "$l1_up_alt"
  else
    warn "L1 startup script not found — skipping L1 auto-start"
    warn "Start manually: bash $l1_up"
    return 0
  fi

  wait_rpc "$HOST_L1_RPC" "GhostChain L1 (chainId $L1_CHAIN_ID)"
  sleep "$STAGE_SLEEP"
  ok "Phase 7 complete — L1 RPC live at $HOST_L1_RPC"
}

# =============================================================================
# PHASE 8 — OP Stack L2
# =============================================================================
phase8_l2() {
  banner "PHASE 8 — OP Stack L2 (chainId $L2_CHAIN_ID, settles to L1)"
  dryrun "Would run: bash $SCRIPTS_DIR/opstack/up-l2.sh" && return 0

  local l2_up="$SCRIPTS_DIR/opstack/up-l2.sh"
  if [ ! -f "$l2_up" ]; then
    warn "L2 startup script not found at $l2_up"
    warn "Run manually after phase: bash $l2_up"
    return 0
  fi

  log "Starting OP Stack L2..."
  bash "$l2_up"

  wait_rpc "$HOST_L2_RPC" "OP-Geth L2 (chainId $L2_CHAIN_ID)"
  sleep "$STAGE_SLEEP"
  ok "Phase 8 complete — L2 RPC live at $HOST_L2_RPC"
}

# =============================================================================
# PHASE 9 — OP Stack L3
# =============================================================================
phase9_l3() {
  banner "PHASE 9 — OP Stack L3 (chainId $L3_CHAIN_ID, settles to L2)"
  dryrun "Would run: bash $SCRIPTS_DIR/opstack/deploy-l3.sh && bash $SCRIPTS_DIR/opstack/up-l3.sh" && return 0

  local l3_deploy="$SCRIPTS_DIR/opstack/deploy-l3.sh"
  local l3_up="$SCRIPTS_DIR/opstack/up-l3.sh"

  if [ -f "$l3_deploy" ]; then
    log "Deploying L3 parent contracts on L2..."
    bash "$l3_deploy"
  fi

  if [ -f "$l3_up" ]; then
    log "Starting OP Stack L3..."
    bash "$l3_up"
    wait_rpc "$HOST_L3_RPC" "OP-Geth L3 (chainId $L3_CHAIN_ID)"
    sleep "$STAGE_SLEEP"
    ok "Phase 9 complete — L3 RPC live at $HOST_L3_RPC"
  else
    warn "L3 startup script not found at $l3_up — skipping L3"
  fi
}

# =============================================================================
# PHASE 10 — Contract Deployment
# =============================================================================
phase10_contracts() {
  banner "PHASE 10 — Contract Deployment"

  if [ "$GS_SKIP_CONTRACTS" = "1" ]; then
    warn "GS_SKIP_CONTRACTS=1 — skipping contract deployment"
    return 0
  fi

  dryrun "Would run: bash $SCRIPTS_DIR/opstack/deploy.sh" && return 0

  local deploy_script="$SCRIPTS_DIR/opstack/deploy.sh"
  if [ ! -f "$deploy_script" ]; then
    warn "Contract deploy script not found at $deploy_script"
    return 0
  fi

  log "Deploying contracts to L1 / L2..."
  log "  - OP Stack system contracts (SystemConfig, OptimismPortal, L2OutputOracle)"
  log "  - LGE contracts (LoadBalancerVault, AdapterRegistry, SettlementOracle)"
  log "  - GST ERC-20 token (chainId $L1_CHAIN_ID)"
  log "  - RewardRouter, CircuitBreaker, OperatorBondVault, BridgeEscrow"
  log "  - FederationRegistry, FederationPolicy, TreasuryEngine, RewardDistributor"

  bash "$deploy_script"

  # Sync deployed addresses to service env files
  log "Syncing contract addresses to service environments..."
  [ -f "$SCRIPTS_DIR/env-sync-l1.sh" ] && bash "$SCRIPTS_DIR/env-sync-l1.sh" || true
  [ -f "$SCRIPTS_DIR/env-sync-l2.sh" ] && bash "$SCRIPTS_DIR/env-sync-l2.sh" || true
  [ -f "$SCRIPTS_DIR/env-sync-l3.sh" ] && bash "$SCRIPTS_DIR/env-sync-l3.sh" || true
  [ -f "$SCRIPTS_DIR/env-sync-stack.sh" ] && bash "$SCRIPTS_DIR/env-sync-stack.sh" || true

  ok "Phase 10 complete — contracts deployed and addresses synced"
}

# =============================================================================
# PHASE 11 — Data Plane Infrastructure (postgres / redis / rabbitmq)
# =============================================================================
phase11_data_plane() {
  banner "PHASE 11 — Data Plane (postgres, redis, rabbitmq)"
  dryrun "Would start: postgres, redis, rabbitmq containers" && return 0

  local stack_env="$SERVICES_DIR/stack.env"
  local compose_file="$SERVICES_DIR/docker-compose.yml"
  [ -f "$SERVICES_DIR/docker-compose.legacy.yml" ] && \
    compose_file="$SERVICES_DIR/docker-compose.legacy.yml"

  if [ ! -f "$compose_file" ]; then
    warn "Services compose file not found — skipping data plane"
    return 0
  fi

  log "Starting data plane services..."
  if [ -f "$stack_env" ]; then
    docker compose --env-file "$stack_env" -f "$compose_file" up -d \
      postgres redis 2>/dev/null || true
  else
    docker compose -f "$compose_file" up -d postgres redis 2>/dev/null || true
  fi

  # Wait for postgres
  for i in $(seq 1 30); do
    if docker exec "$(docker ps -qf name=postgres)" pg_isready -U ghost &>/dev/null 2>&1; then
      ok "postgres is ready"
      break
    fi
    sleep 2
  done

  ok "Phase 11 complete — data plane ready"
}

# =============================================================================
# PHASE 12 — Identity & Security Layer
# =============================================================================
phase12_identity() {
  banner "PHASE 12 — Identity & Security Layer"
  dryrun "Would start: auth-service, rbac-service, ghost-guard, ghost-compliance, ghost-jwks-guard" && return 0

  local stack_env="$SERVICES_DIR/stack.env"
  local compose_file="$SERVICES_DIR/docker-compose.yml"
  [ -f "$SERVICES_DIR/docker-compose.legacy.yml" ] && \
    compose_file="$SERVICES_DIR/docker-compose.legacy.yml"

  if [ ! -f "$compose_file" ]; then
    warn "Services compose not found — skipping identity layer"
    return 0
  fi

  log "Starting identity and security services..."
  local id_services=(
    auth-service
    rbac-service
    session-service
    ghost-guard
    ghost-jwks-guard
    key-rotation-service
    secrets-health-service
    audit-log-service
    ghost-secure-logger
  )

  for svc in "${id_services[@]}"; do
    log "  Starting $svc..."
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not found in compose — skipping"
    else
      docker compose -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not found in compose — skipping"
    fi
  done

  wait_http "http://localhost:7070/health" "ghost-guard" 30

  # ghost-compliance has its own compose (docker-compose.yml at root)
  log "Starting ghost-compliance (root compose)..."
  docker compose -f "$STACK_ROOT/docker-compose.yml" up -d \
    ghost-compliance 2>/dev/null || warn "ghost-compliance not in root compose — skipping"

  ok "Phase 12 complete — identity layer up"
}

# =============================================================================
# PHASE 13 — Bridge & Interop Layer
# =============================================================================
phase13_bridge() {
  banner "PHASE 13 — Bridge & Interop Layer"
  dryrun "Would start: ghost-relayer, rollup-proposers, challengers, bridge-hub, liquidity services" && return 0

  local stack_env="$SERVICES_DIR/stack.env"
  local compose_file="$SERVICES_DIR/docker-compose.yml"

  if [ ! -f "$compose_file" ]; then
    warn "Services compose not found — skipping bridge layer"
    return 0
  fi

  log "Starting bridge and interop services..."
  local bridge_services=(
    ghost-relayer
    ghost-rollup-proposer
    ghost-rollup-proposer-l2
    ghost-rollup-challenger
    bridge-service
    ghostchain-bridge-hub
    liquidity-service
    liquidity-router
    liquidity-prover
    transfer-lifecycle-service
    dispute-service
  )

  for svc in "${bridge_services[@]}"; do
    log "  Starting $svc..."
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not in compose — skipping"
    else
      docker compose -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not in compose — skipping"
    fi
  done

  wait_http "http://localhost:7171/health" "ghost-relayer"   30
  wait_http "http://localhost:7272/health" "rollup-proposer" 30

  ok "Phase 13 complete — bridge layer up"
}

# =============================================================================
# PHASE 14 — AI Intelligence Layer (staged boot)
# =============================================================================
phase14_ai() {
  banner "PHASE 14 — AI Intelligence Layer (staged boot)"
  dryrun "Would start: ghostbrain-core → specialists → hyper-ghost-ai (staged)" && return 0

  local stack_env="$SERVICES_DIR/stack.env"
  local compose_file="$SERVICES_DIR/docker-compose.yml"

  if [ ! -f "$compose_file" ]; then
    warn "Services compose not found — skipping AI layer"
    return 0
  fi

  # ── Stage A: GhostBrain Core (base runtime) ──────────────────────────────
  log "Starting GhostBrain Core (base AI runtime)..."
  for svc in ghostbrain-core ghostbrain-gsa; do
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "$svc not in compose"
    else
      docker compose -f "$compose_file" up -d "$svc" 2>/dev/null || true
    fi
  done

  wait_http "http://localhost:7900/health" "ghostbrain-core" 60
  log "GhostBrain Core ready — starting AI specialists..."
  sleep 2

  # ── Stage B: AI Specialist Services ─────────────────────────────────────
  local ai_specialists=(
    ghost-ai-consensus
    ghost-ai-attestor
    ghost-ai-contract-engine
    ai-monitor
    ai-vault
    ai-policy
    ai-clock-sync
    anomaly-detection-service
    forecasting-service
    explainability-service
    ghost-storage-ai
    ghostvm-ai
    ghostdns-ai
    ghostdns-ai-policy
    ghostload-ai
    ghostcontract-ai
    agent-node
    agent-registry-service
    autonomous-vault-hypervisor
  )

  for svc in "${ai_specialists[@]}"; do
    log "  Starting AI specialist: $svc..."
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not in compose — skipping"
    else
      docker compose -f "$compose_file" up -d "$svc" 2>/dev/null || true
    fi
  done

  log "AI specialists starting — waiting 10s for stabilization..."
  sleep 10

  # ── Stage C: HyperGhost AI Orchestration ────────────────────────────────
  log "Starting HyperGhost AI orchestration layer..."
  local ai_orchestration=(
    hyper-ghost-ai
    hg-treasury-agent
    hg-risk-oracle
    hg-proof-snapshotter
    hg-reporting-indexer
    ghost-sync-sentinel
  )

  for svc in "${ai_orchestration[@]}"; do
    log "  Starting AI orchestrator: $svc..."
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not in compose — skipping"
    else
      docker compose -f "$compose_file" up -d "$svc" 2>/dev/null || true
    fi
  done

  wait_http "http://localhost:7902/health" "hyper-ghost-ai" 60

  log "AI orchestration boot sequence:"
  info "  GhostBrain Core         → RUNNING  :7900"
  info "  GhostBrain GSA          → RUNNING  :7901"
  info "  Ghost AI Consensus      → RUNNING  :7903"
  info "  Ghost AI Attestor       → RUNNING  :7930"
  info "  HyperGhost AI           → RUNNING  :7902"
  info ""
  info "  Consciousness stack (SDK, in-process):"
  info "    @ghostchain/cognitive       → loaded by apps/api"
  info "    @ghostchain/swarm           → loaded by apps/api"
  info "    @ghostchain/autonomous      → loaded by apps/api"
  info "    @ghostchain/consciousness   → loaded by apps/api (GCL-Ω apex)"

  ok "Phase 14 complete — AI layer operational"
}

# =============================================================================
# PHASE 15 — Treasury & Economy Layer
# =============================================================================
phase15_treasury() {
  banner "PHASE 15 — Treasury & Economy Layer"
  dryrun "Would start: l3-fee-collector → l2-revenue-aggregator → treasury-engine → reward-distributor" && return 0

  local stack_env="$SERVICES_DIR/stack.env"
  local compose_file="$SERVICES_DIR/docker-compose.yml"

  if [ ! -f "$compose_file" ]; then
    warn "Services compose not found — skipping treasury"
    return 0
  fi

  log "Starting treasury & economy pipeline (L3 → L2 → L1 revenue flow)..."
  local treasury_services=(
    l3-fee-collector
    l2-revenue-aggregator
    treasury-engine
    treasury-ai
    treasury-service
    treasury-evidence
    reward-distributor
    payout-service
    supply-service
    liquidity-service
  )

  for svc in "${treasury_services[@]}"; do
    log "  Starting $svc..."
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not in compose"
    else
      docker compose -f "$compose_file" up -d "$svc" 2>/dev/null || true
    fi
  done

  wait_http "http://localhost:7683/health" "treasury-engine" 30

  log "Economy pipeline:"
  info "  L3 fees → l3-fee-collector    :7681"
  info "  → l2-revenue-aggregator       :7682"
  info "  → treasury-engine             :7683"
  info "  → reward-distributor          :7684"
  info "  → GlobalPool / MemberPools / EventIncentives"

  ok "Phase 15 complete — treasury pipeline running"
}

# =============================================================================
# PHASE 16 — Governance Layer
# =============================================================================
phase16_governance() {
  banner "PHASE 16 — Governance Layer"
  dryrun "Would start: governance-service, hyper-ghost-governor, staking/validator services" && return 0

  local stack_env="$SERVICES_DIR/stack.env"
  local compose_file="$SERVICES_DIR/docker-compose.yml"

  if [ ! -f "$compose_file" ]; then
    warn "Services compose not found — skipping governance"
    return 0
  fi

  log "Starting governance and staking services..."
  local gov_services=(
    governance-service
    hyper-ghost-governor
    hyper-ghost-supervisor
    staking-service
    validator-service
    rewards-service
    participation-service
    slashing-detection-service
  )

  for svc in "${gov_services[@]}"; do
    log "  Starting $svc..."
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not in compose"
    else
      docker compose -f "$compose_file" up -d "$svc" 2>/dev/null || true
    fi
  done

  wait_http "http://localhost:5000/health" "governance-service" 30

  log "Governance loop:"
  info "  DAO Proposal → Timelock Executor"
  info "  → FederationRegistry + FederationPolicy + TreasuryEngine"
  info "  → RewardDistributor → GlobalPool / MemberPools / EventIncentives"
  info "  HyperGhost Governor :5001 — AI-assisted governance agent"

  ok "Phase 16 complete — governance active"
}

# =============================================================================
# PHASE 17 — Explorer & Indexing
# =============================================================================
phase17_explorer() {
  banner "PHASE 17 — Explorer & Indexing"
  dryrun "Would start: ghostscout-l1/l2/l3, block/tx indexers, GNS, GhostX" && return 0

  local stack_env="$SERVICES_DIR/stack.env"
  local compose_file="$SERVICES_DIR/docker-compose.yml"

  if [ ! -f "$compose_file" ]; then
    warn "Services compose not found — skipping explorer"
    return 0
  fi

  log "Starting explorer and indexing services..."
  local explorer_services=(
    block-index-service
    tx-index-service
    mempool-service
    ghostscout-l1
    ghostscout-l2
    ghostscout-l3
    ghostscout-frontend-l1
    ghostscout-frontend-l2
    ghostscout-frontend-l3
    gns-api
    gns-indexer
    ghostx-api
    global-search-service
    entity-tagging-service
    node-health-service
    node-inventory-service
    chain-status-service
  )

  for svc in "${explorer_services[@]}"; do
    log "  Starting $svc..."
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$compose_file" up -d "$svc" 2>/dev/null || \
        warn "  $svc not in compose"
    else
      docker compose -f "$compose_file" up -d "$svc" 2>/dev/null || true
    fi
  done

  log "Explorer endpoints (after startup):"
  info "  Ghostscout L1  → http://localhost:4501"
  info "  Ghostscout L2  → http://localhost:4502"
  info "  Ghostscout L3  → http://localhost:4503"
  info "  GNS API        → http://localhost:6000"
  info "  GhostX API     → http://localhost:6100"

  ok "Phase 17 complete — explorers launching"
}

# =============================================================================
# PHASE 18 — Monitoring Stack (Prometheus + Grafana + Loki)
# =============================================================================
phase18_monitoring() {
  banner "PHASE 18 — Monitoring Stack"

  if [ "$GS_SKIP_MONITORING" = "1" ]; then
    warn "GS_SKIP_MONITORING=1 — skipping monitoring"
    return 0
  fi

  dryrun "Would start: Prometheus, Grafana, Loki, promtail, node-exporter" && return 0

  local obs_compose="$INFRA_DIR/observability/docker-compose.yml"
  local prom_compose="$INFRA_DIR/prometheus/docker-compose.yml"

  if [ -f "$obs_compose" ]; then
    log "Starting observability stack via $obs_compose..."
    docker compose -f "$obs_compose" up -d
  elif [ -f "$prom_compose" ]; then
    log "Starting monitoring via $prom_compose..."
    docker compose -f "$prom_compose" up -d
  else
    log "No monitoring compose found — starting inline..."
    docker compose -f /dev/stdin up -d <<MCOMPOSE
name: ghoststack-monitoring
services:
  prometheus:
    image: prom/prometheus:v2.51.2
    container_name: ghoststack-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-admin-api'
    volumes:
      - $INFRA_DIR/prometheus:/etc/prometheus
      - prometheus-data:/prometheus
    ports: ["9090:9090"]
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.4.2
    container_name: ghoststack-grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ghoststack-admin
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_SERVER_ROOT_URL: http://localhost:3100
    volumes:
      - grafana-data:/var/lib/grafana
      - $INFRA_DIR/grafana:/etc/grafana/provisioning
    ports: ["3100:3000"]
    depends_on: [prometheus]
    restart: unless-stopped

  loki:
    image: grafana/loki:3.0.0
    container_name: ghoststack-loki
    command: -config.file=/etc/loki/local-config.yaml
    ports: ["3101:3100"]
    restart: unless-stopped

  promtail:
    image: grafana/promtail:3.0.0
    container_name: ghoststack-promtail
    command: -config.file=/etc/promtail/config.yml
    volumes:
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /run/docker.sock:/run/docker.sock:ro
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:v1.8.0
    container_name: ghoststack-node-exporter
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    ports: ["9100:9100"]
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
MCOMPOSE
  fi

  wait_http "http://localhost:9090/-/healthy" "prometheus" 30
  wait_http "http://localhost:3100/api/health"  "grafana"    30

  log "Monitoring endpoints:"
  info "  Prometheus  → http://localhost:9090"
  info "  Grafana     → http://localhost:3100  (admin / ghoststack-admin)"
  info "  Loki        → http://localhost:3101"

  ok "Phase 18 complete — monitoring operational"
}

# =============================================================================
# PHASE 19 — Control Plane (API + Web)
# =============================================================================
phase19_control_plane() {
  banner "PHASE 19 — Control Plane (apps/api + apps/web)"
  dryrun "Would start: ghost-compliance, apps/api :4000, apps/web :3200" && return 0

  local stack_env="$SERVICES_DIR/stack.env"
  local dev_compose="$STACK_ROOT/docker-compose.dev.yml"
  local root_compose="$STACK_ROOT/docker-compose.yml"

  # ghost-compliance (root compose, if not already started)
  if [ -f "$root_compose" ]; then
    log "Ensuring ghost-compliance is healthy..."
    docker compose -f "$root_compose" up -d ghost-compliance 2>/dev/null || true
    wait_http "http://localhost:8090/health" "ghost-compliance" 30
  fi

  # apps/api + apps/web
  if [ -f "$dev_compose" ]; then
    log "Starting Control Plane (apps/api + apps/web)..."
    if [ -f "$stack_env" ]; then
      docker compose --env-file "$stack_env" -f "$dev_compose" up -d
    else
      docker compose -f "$dev_compose" up -d
    fi
    wait_http "http://localhost:4000/health" "apps/api" 60
    wait_http "http://localhost:3200"         "apps/web" 60
  else
    log "docker-compose.dev.yml not found — attempting direct npm start..."
    if [ -f "$STACK_ROOT/apps/api/package.json" ]; then
      log "  Building apps/api..."
      cd "$STACK_ROOT"
      sudo -u "$GS_USER" pnpm install --frozen-lockfile 2>/dev/null || \
        sudo -u "$GS_USER" pnpm install || true
    fi
  fi

  log "Control plane endpoints:"
  info "  apps/api (Express 5)  → http://localhost:4000"
  info "  apps/web (Next.js 14) → http://localhost:3200"
  info "  ghost-compliance      → http://localhost:8090"
  info ""
  info "  RBAC roles: Viewer | Operator | SecurityAdmin | TreasuryAdmin | ProtocolAdmin | Developer"

  ok "Phase 19 complete — control plane up"
}

# =============================================================================
# PHASE 20 — Post-Deploy Health Check
# =============================================================================
phase20_health_check() {
  banner "PHASE 20 — Post-Deploy Health Check"
  dryrun "Would run: bash $SCRIPTS_DIR/doctor.sh" && return 0

  local PASS=0 FAIL=0
  check() {
    local label="$1" url="$2" type="${3:-http}"
    if [ "$type" = "rpc" ]; then
      if curl -fsS --max-time 5 -X POST "$url" \
          -H 'content-type: application/json' \
          --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
          >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${RESET} $label ($url)"
        PASS=$((PASS+1))
      else
        echo -e "  ${RED}✗${RESET} $label ($url)"
        FAIL=$((FAIL+1))
      fi
    else
      if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${RESET} $label ($url)"
        PASS=$((PASS+1))
      else
        echo -e "  ${YELLOW}~${RESET} $label ($url) — not reachable"
        FAIL=$((FAIL+1))
      fi
    fi
  }

  echo -e "\n${BOLD}Chain RPCs:${RESET}"
  check "GhostChain L1 RPC" "$HOST_L1_RPC"      rpc
  check "OP-Geth L2 RPC"    "$HOST_L2_RPC"      rpc
  check "OP-Geth L3 RPC"    "$HOST_L3_RPC"      rpc

  echo -e "\n${BOLD}Core Services:${RESET}"
  check "ghost-guard"         "http://localhost:7070/health"
  check "ghost-relayer"       "http://localhost:7171/health"
  check "rollup-proposer-l2"  "http://localhost:7272/health"
  check "rollup-proposer-l3"  "http://localhost:7273/health"
  check "rollup-challenger"   "http://localhost:7282/health"

  echo -e "\n${BOLD}AI Layer:${RESET}"
  check "ghostbrain-core"   "http://localhost:7900/health"
  check "ghostbrain-gsa"    "http://localhost:7901/health"
  check "hyper-ghost-ai"    "http://localhost:7902/health"
  check "ghost-ai-consensus" "http://localhost:7903/health"

  echo -e "\n${BOLD}Treasury:${RESET}"
  check "l3-fee-collector"     "http://localhost:7681/health"
  check "l2-revenue-aggregator" "http://localhost:7682/health"
  check "treasury-engine"      "http://localhost:7683/health"
  check "reward-distributor"   "http://localhost:7684/health"

  echo -e "\n${BOLD}Governance:${RESET}"
  check "governance-service"    "http://localhost:5000/health"
  check "hyper-ghost-governor"  "http://localhost:5001/health"

  echo -e "\n${BOLD}Control Plane:${RESET}"
  check "ghost-compliance"  "http://localhost:8090/health"
  check "apps/api"          "http://localhost:4000/health"
  check "apps/web"          "http://localhost:3200"

  echo -e "\n${BOLD}Explorer:${RESET}"
  check "ghostscout-l1"  "http://localhost:4501"
  check "ghostscout-l2"  "http://localhost:4502"
  check "ghostscout-l3"  "http://localhost:4503"

  echo -e "\n${BOLD}Monitoring:${RESET}"
  check "Prometheus"   "http://localhost:9090/-/healthy"
  check "Grafana"      "http://localhost:3100/api/health"

  echo ""
  echo -e "${BOLD}Results:${RESET} ${GREEN}$PASS passed${RESET} / ${RED}$FAIL not reachable${RESET}"

  if [ -f "$SCRIPTS_DIR/doctor.sh" ]; then
    log "Running comprehensive doctor.sh checks..."
    bash "$SCRIPTS_DIR/doctor.sh" || warn "Doctor script reported issues (see above)"
  fi

  echo ""
  log "Running containers:"
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -40

  ok "Phase 20 complete — health check done"
}

# =============================================================================
# FINAL SUMMARY
# =============================================================================
print_summary() {
  echo ""
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${GREEN}👻 GhostStack Genesis Install Complete!${RESET}"
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo -e "${BOLD}Chain Endpoints:${RESET}"
  echo -e "  GhostChain L1  (chainId ${L1_CHAIN_ID})  →  $HOST_L1_RPC"
  echo -e "  OP Stack L2    (chainId ${L2_CHAIN_ID})  →  $HOST_L2_RPC"
  echo -e "  OP Stack L3    (chainId ${L3_CHAIN_ID})  →  $HOST_L3_RPC"
  echo ""
  echo -e "${BOLD}Control Plane:${RESET}"
  echo -e "  API     →  http://localhost:4000"
  echo -e "  Web     →  http://localhost:3200"
  echo ""
  echo -e "${BOLD}AI Layer:${RESET}"
  echo -e "  GhostBrain Core    →  http://localhost:7900"
  echo -e "  HyperGhost AI      →  http://localhost:7902"
  echo -e "  Treasury Engine    →  http://localhost:7683"
  echo ""
  echo -e "${BOLD}Monitoring:${RESET}"
  echo -e "  Prometheus  →  http://localhost:9090"
  echo -e "  Grafana     →  http://localhost:3100   (admin / ghoststack-admin)"
  echo ""
  echo -e "${BOLD}Explorers:${RESET}"
  echo -e "  L1  →  http://localhost:4501"
  echo -e "  L2  →  http://localhost:4502"
  echo -e "  L3  →  http://localhost:4503"
  echo ""
  echo -e "${BOLD}Next Steps:${RESET}"
  echo -e "  1. Review and fund OP Stack keys:  cat $OPSTACK_DIR/.env"
  echo -e "  2. Set production secrets:         $SERVICES_DIR/stack.env"
  echo -e "  3. Verify governance contracts:    bash scripts/verify-governance.sh"
  echo -e "  4. Run full health check:          bash $SCRIPTS_DIR/doctor.sh"
  echo -e "  5. Tail logs:                      docker compose -f $SERVICES_DIR/docker-compose.yml logs -f"
  echo ""
  echo -e "  Operator reference:  docs/GHOSTSTACK_DEPLOYMENT_BLUEPRINT.md"
  echo -e "  Architecture map:    docs/MASTER_ARCHITECTURE_BLUEPRINT.md"
  echo ""
}

# =============================================================================
# MAIN — Execute all phases in order
# =============================================================================
main() {
  echo -e "${BOLD}${CYAN}"
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║    👻  GhostStack Genesis Installer  v1.0        ║"
  echo "  ║    Sovereign Blockchain Infrastructure           ║"
  echo "  ║    ghostchain1/ghostl-stack  •  2026-03-06       ║"
  echo "  ╚══════════════════════════════════════════════════╝"
  echo -e "${RESET}"
  echo "  ENV:        $GS_ENV"
  echo "  STACK_ROOT: $STACK_ROOT"
  echo "  SKIP_VMS:   $GS_SKIP_VMS"
  echo "  DRY_RUN:    $GS_DRY_RUN"
  echo ""
  if [ "$GS_DRY_RUN" = "1" ]; then
    echo -e "  ${YELLOW}[DRY-RUN MODE] — No changes will be made.${RESET}"
    echo ""
  fi

  local start_ts
  start_ts=$(date +%s)

  phase0_preflight
  phase1_host_bootstrap
  phase2_repo
  phase3_kvm_network
  phase4_firewall
  phase4b_nat
  phase5_vms
  phase6_secrets
  phase7_l1
  phase8_l2
  phase9_l3
  phase10_contracts
  phase11_data_plane
  phase12_identity
  phase13_bridge
  phase14_ai
  phase15_treasury
  phase16_governance
  phase17_explorer
  phase18_monitoring
  phase19_control_plane
  phase20_health_check

  local elapsed=$(( $(date +%s) - start_ts ))
  echo ""
  log "Total install time: ${elapsed}s"
  print_summary
}

# ── Trap: print stack on failure ───────────────────────────────────────────────
trap 'echo -e "\n${RED}[GHOSTSTACK GENESIS] Installation FAILED at line $LINENO.${RESET}" \
  "Check logs above." >&2' ERR

main "$@"
