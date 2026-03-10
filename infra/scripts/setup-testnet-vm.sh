#!/usr/bin/env bash
# GhostStack — Testnet VM Bootstrap
#
# Run ONCE on a fresh Ubuntu 22.04/24.04 VM to prepare it to receive
# GhostStack TESTNET release bundles via push-release-to-testnet.sh.
#
# Usage (as root or with passwordless sudo):
#   sudo bash infra/scripts/setup-testnet-vm.sh
#
# What this script does:
#   1. Validates the VM hostname contains "testnet"
#   2. Installs Docker Engine + Compose plugin
#   3. Installs qemu-guest-agent (libvirt management)
#   4. Creates /opt/ghoststack/ directory hierarchy
#   5. Creates a dedicated 'ghoststack' service account
#   6. Configures UFW firewall rules
#   7. Sets system ulimits for the ghoststack user
#   8. Prints next steps
#
# After this script completes:
#   - On the DEVNET, run: push-release-to-testnet.sh --release-id <id> --ssh administrator@<VM_IP>
#   - On this VM, run:    sudo /opt/ghoststack/releases/<id>/scripts/deploy-testnet.sh
set -euo pipefail

# ── Guards ───────────────────────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root (or with sudo)" >&2
  exit 1
fi

HOSTNAME_VAL="$(hostname)"
if ! printf '%s' "${HOSTNAME_VAL}" | grep -qiE "testnet"; then
  echo "ERROR: hostname '${HOSTNAME_VAL}' does not contain 'testnet'." >&2
  echo "       This guard prevents accidental testnet setup on the wrong VM." >&2
  echo "       Override: SKIP_HOSTNAME_CHECK=1 bash $0" >&2
  [ "${SKIP_HOSTNAME_CHECK:-0}" = "1" ] || exit 1
fi

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
fi

log() { printf '[%s] testnet-vm-setup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# ── System packages ──────────────────────────────────────────────────────────

log "installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq \
  ca-certificates \
  curl \
  gnupg \
  jq \
  rsync \
  socat \
  qemu-guest-agent \
  ufw \
  fail2ban

# ── Docker Engine ────────────────────────────────────────────────────────────

if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}")"
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y -qq
  apt-get install -y -qq \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin
else
  log "Docker already installed: $(docker --version)"
fi

systemctl enable docker
systemctl start docker

# Smoke-test
docker info >/dev/null 2>&1 || die "docker info failed"
docker compose version >/dev/null 2>&1 || die "docker compose not available"
log "Docker ok: $(docker --version)"

# ── QEMU guest agent ─────────────────────────────────────────────────────────

systemctl enable qemu-guest-agent
systemctl start qemu-guest-agent 2>/dev/null || true
log "qemu-guest-agent enabled"

# ── Service account ──────────────────────────────────────────────────────────

GHOSTSTACK_USER="ghoststack"
if ! id "${GHOSTSTACK_USER}" >/dev/null 2>&1; then
  log "creating service account '${GHOSTSTACK_USER}'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin \
    --comment "GhostStack service account" "${GHOSTSTACK_USER}"
fi

# Add ghoststack user to docker group so hg_docker_init can run without sudo
usermod -aG docker "${GHOSTSTACK_USER}" 2>/dev/null || true

# ── Directory hierarchy ──────────────────────────────────────────────────────

log "creating /opt/ghoststack directory hierarchy..."
mkdir -p \
  /opt/ghoststack/bin \
  /opt/ghoststack/releases \
  /opt/ghoststack/dr \
  /data/testnet/l1 \
  /data/testnet/l2 \
  /data/testnet/l3 \
  /data/testnet/services \
  /data/testnet/secrets/l1 \
  /data/testnet/secrets/opstack \
  /data/testnet/secrets/services

chown -R root:root /opt/ghoststack
chmod 755 /opt/ghoststack /opt/ghoststack/bin /opt/ghoststack/releases

chown -R "${GHOSTSTACK_USER}:${GHOSTSTACK_USER}" /data/testnet
chmod 750 /data/testnet /data/testnet/l1 /data/testnet/l2 /data/testnet/l3
chmod 700 /data/testnet/secrets /data/testnet/secrets/l1 \
          /data/testnet/secrets/opstack /data/testnet/secrets/services

# ── System ulimits ───────────────────────────────────────────────────────────

log "configuring ulimits..."
cat > /etc/security/limits.d/ghoststack.conf <<'LIMITS'
# GhostStack — raised limits for geth / op-geth / Docker containers
ghoststack   soft   nofile   65535
ghoststack   hard   nofile   65535
ghoststack   soft   nproc    32768
ghoststack   hard   nproc    32768
*            soft   nofile   65535
*            hard   nofile   65535
LIMITS

# Docker daemon ulimit defaults
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'DAEMON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65535, "Soft": 65535 }
  },
  "live-restore": true
}
DAEMON
  systemctl reload docker 2>/dev/null || systemctl restart docker
else
  log "docker daemon.json already exists — skipping (review /etc/docker/daemon.json manually)"
fi

# ── Firewall ─────────────────────────────────────────────────────────────────

log "configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH (keep management access)
ufw allow 22/tcp comment "SSH management"

# GhostChain L1 P2P
ufw allow 18551/tcp comment "GhostChain L1 P2P tcp"
ufw allow 18551/udp comment "GhostChain L1 P2P udp"

# GhostChain L1 RPC (testnet: allow from LAN/VPN only — adjust CIDR as needed)
# Use environment variable TESTNET_MGMT_CIDR to restrict; defaults to localhost
MGMT_CIDR="${TESTNET_MGMT_CIDR:-127.0.0.1}"
if [ "${MGMT_CIDR}" = "0.0.0.0/0" ]; then
  log "WARNING: TESTNET_MGMT_CIDR=0.0.0.0/0 — L1 RPC will be world-accessible"
fi
ufw allow from "${MGMT_CIDR}" to any port 18545 comment "GhostChain L1 HTTP RPC"
ufw allow from "${MGMT_CIDR}" to any port 18546 comment "GhostChain L1 WS RPC"

# OP Stack P2P
ufw allow 9003/tcp comment "GhostL2 op-node P2P"
ufw allow 9003/udp comment "GhostL2 op-node P2P"
ufw allow 9013/tcp comment "GhostL3 op-node P2P"
ufw allow 9013/udp comment "GhostL3 op-node P2P"

# Metrics (Prometheus) — management CIDR only
ufw allow from "${MGMT_CIDR}" to any port 9090 comment "Prometheus metrics"

ufw --force enable
ufw status verbose
log "UFW enabled"

# ── fail2ban ─────────────────────────────────────────────────────────────────

systemctl enable fail2ban
systemctl start fail2ban 2>/dev/null || true

# ── Sysctl tuning ────────────────────────────────────────────────────────────

log "applying sysctl tuning..."
cat > /etc/sysctl.d/99-ghoststack.conf <<'SYSCTL'
# GhostStack network/VM tuning
net.core.somaxconn=32768
net.ipv4.tcp_max_syn_backlog=8192
net.ipv4.ip_local_port_range=1024 65535
vm.max_map_count=262144
fs.file-max=200000
SYSCTL
sysctl -p /etc/sysctl.d/99-ghoststack.conf >/dev/null

# ── Summary ──────────────────────────────────────────────────────────────────

log "testnet VM bootstrap complete"
echo
echo "══════════════════════════════════════════════════════════════════════"
echo "  TESTNET VM READY — Next Steps"
echo "══════════════════════════════════════════════════════════════════════"
echo
echo "  On DEVNET (ghostchain-devnet):"
echo "    1. Build + seal a release:"
echo "         launch-system/build-release.sh --release-id <id>"
echo "         launch-system/seal-release.sh  --release-id <id>"
echo "    2. Push to this VM:"
echo "         launch-system/push-release-to-testnet.sh \\"
echo "           --release-id <id> --ssh administrator@<THIS_VM_IP>"
echo
echo "  On this VM:"
echo "    3. Deploy:"
echo "         sudo /opt/ghoststack/releases/<id>/scripts/deploy-testnet.sh"
echo "    4. Validate:"
echo "         /opt/ghoststack/releases/<id>/scripts/validate-testnet.sh"
echo
echo "  Secrets that must be provisioned OUT-OF-BAND (never in the release bundle):"
echo "    /data/testnet/secrets/l1/jwtsecret           — L1 JWT (auto-generated on first deploy)"
echo "    /data/testnet/secrets/opstack/jwt.l2.txt     — L2 JWT"
echo "    /data/testnet/secrets/opstack/jwt.l3.txt     — L3 JWT"
echo "    Node signer keys → /data/testnet/secrets/l1/node1.key etc."
echo
echo "══════════════════════════════════════════════════════════════════════"
