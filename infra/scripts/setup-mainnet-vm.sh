#!/usr/bin/env bash
# GhostStack — Mainnet VM Bootstrap
#
# Run ONCE on a fresh Ubuntu 22.04/24.04 VM to prepare it to receive
# GhostStack MAINNET release bundles via push-release-to-mainnet.sh.
#
# Usage (as root or with passwordless sudo):
#   sudo bash infra/scripts/setup-mainnet-vm.sh
#
# MAINNET HARDENING — this script enforces stricter controls than testnet:
#   - hostname must contain "mainnet"
#   - SSH password authentication is DISABLED (key-only)
#   - Ports are bound to management CIDR only (set MAINNET_MGMT_CIDR)
#   - Node signer keys are NEVER auto-generated — must be provisioned OOB
#   - MainnetLaunchGate + ReleaseGate addresses are required in /opt/ghoststack/env
#   - QEMU guest agent is required for libvirt management plane
#
# After this script completes:
#   - On the DEVNET, run: push-release-to-mainnet.sh --release-id <id> --ssh administrator@<VM_IP>
#   - On this VM (after governance ratification):
#       governance/verify-onchain-authorization.sh
#       sudo /opt/ghoststack/releases/<id>/scripts/deploy-mainnet.sh
set -euo pipefail

# ── Guards ───────────────────────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root (or with sudo)" >&2
  exit 1
fi

HOSTNAME_VAL="$(hostname)"
if ! printf '%s' "${HOSTNAME_VAL}" | grep -qiE "mainnet"; then
  echo "ERROR: hostname '${HOSTNAME_VAL}' does not contain 'mainnet'." >&2
  echo "       This guard prevents accidental mainnet setup on the wrong VM." >&2
  echo "       Override: SKIP_HOSTNAME_CHECK=1 bash $0" >&2
  [ "${SKIP_HOSTNAME_CHECK:-0}" = "1" ] || exit 1
fi

# Mainnet requires a management CIDR to be set (disallow world-open defaults)
: "${MAINNET_MGMT_CIDR:?Set MAINNET_MGMT_CIDR to your management IP/CIDR (e.g. 192.168.122.0/24)}"

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
fi

log() { printf '[%s] mainnet-vm-setup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
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
  fail2ban \
  unattended-upgrades \
  auditd

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

docker info >/dev/null 2>&1 || die "docker info failed"
docker compose version >/dev/null 2>&1 || die "docker compose not available"
log "Docker ok: $(docker --version)"

# ── QEMU guest agent ─────────────────────────────────────────────────────────

systemctl enable qemu-guest-agent
systemctl start qemu-guest-agent 2>/dev/null || true
log "qemu-guest-agent enabled"

# ── SSH hardening (mainnet-only) ─────────────────────────────────────────────

log "hardening SSH (key-only auth)..."
SSHD_CFG=/etc/ssh/sshd_config

# Disable password authentication — mainnet MUST use key-only access
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "${SSHD_CFG}"
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "${SSHD_CFG}"
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' "${SSHD_CFG}"
grep -q "^PasswordAuthentication no" "${SSHD_CFG}" \
  || echo "PasswordAuthentication no" >> "${SSHD_CFG}"

systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
log "SSH password authentication disabled"

# ── Service account ──────────────────────────────────────────────────────────

GHOSTSTACK_USER="ghoststack"
if ! id "${GHOSTSTACK_USER}" >/dev/null 2>&1; then
  log "creating service account '${GHOSTSTACK_USER}'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin \
    --comment "GhostStack service account" "${GHOSTSTACK_USER}"
fi
usermod -aG docker "${GHOSTSTACK_USER}" 2>/dev/null || true

# ── Directory hierarchy ──────────────────────────────────────────────────────

log "creating /opt/ghoststack directory hierarchy..."
mkdir -p \
  /opt/ghoststack/bin \
  /opt/ghoststack/releases \
  /opt/ghoststack/dr \
  /opt/ghoststack/env \
  /data/mainnet/l1 \
  /data/mainnet/l2 \
  /data/mainnet/l3 \
  /data/mainnet/services \
  /data/mainnet/secrets/l1 \
  /data/mainnet/secrets/opstack \
  /data/mainnet/secrets/services \
  /data/mainnet/snapshots

chown -R root:root /opt/ghoststack
chmod 755 /opt/ghoststack /opt/ghoststack/bin /opt/ghoststack/releases
chmod 700 /opt/ghoststack/env   # contains gate addresses / HMACs

chown -R "${GHOSTSTACK_USER}:${GHOSTSTACK_USER}" /data/mainnet
chmod 750 /data/mainnet /data/mainnet/l1 /data/mainnet/l2 /data/mainnet/l3
chmod 700 /data/mainnet/secrets /data/mainnet/secrets/l1 \
          /data/mainnet/secrets/opstack /data/mainnet/secrets/services
chmod 750 /data/mainnet/snapshots

# ── Governance env placeholder ───────────────────────────────────────────────

MAINNET_ENV_FILE=/opt/ghoststack/env/mainnet.env
if [ ! -f "${MAINNET_ENV_FILE}" ]; then
  log "creating governance env placeholder at ${MAINNET_ENV_FILE}"
  cat > "${MAINNET_ENV_FILE}" <<'ENV'
# GhostStack Mainnet — governance gate addresses
# Set these BEFORE running deploy-mainnet.sh.
# Source this file or export these env vars in the deploy shell.
#
# Required:
#   RPC_L1=http://127.0.0.1:18545
#   MAINNET_LAUNCH_GATE_ADDRESS=0x<deployed-MainnetLaunchGate>
#   MAINNET_RELEASE_GATE_ADDRESS=0x<deployed-ReleaseGate>
#
RPC_L1=
MAINNET_LAUNCH_GATE_ADDRESS=
MAINNET_RELEASE_GATE_ADDRESS=
ENV
  chmod 600 "${MAINNET_ENV_FILE}"
  log "IMPORTANT: populate ${MAINNET_ENV_FILE} before deploying"
fi

# ── System ulimits ───────────────────────────────────────────────────────────

log "configuring ulimits..."
cat > /etc/security/limits.d/ghoststack.conf <<'LIMITS'
ghoststack   soft   nofile   65535
ghoststack   hard   nofile   65535
ghoststack   soft   nproc    32768
ghoststack   hard   nproc    32768
*            soft   nofile   65535
*            hard   nofile   65535
LIMITS

mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'DAEMON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "10" },
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65535, "Soft": 65535 }
  },
  "live-restore": true,
  "userns-remap": ""
}
DAEMON
  systemctl reload docker 2>/dev/null || systemctl restart docker
else
  log "docker daemon.json exists — skipping (review /etc/docker/daemon.json manually)"
fi

# ── Firewall (mainnet — strict) ──────────────────────────────────────────────

log "configuring UFW firewall (management CIDR=${MAINNET_MGMT_CIDR})..."
ufw --force reset
ufw default deny incoming
ufw default deny outgoing
ufw default allow routed

# SSH — management CIDR only
ufw allow in from "${MAINNET_MGMT_CIDR}" to any port 22 proto tcp comment "SSH management"

# Outbound: Docker hub, apt, DNS, NTP
ufw allow out 53  comment "DNS"
ufw allow out 123 comment "NTP"
ufw allow out 443 comment "HTTPS (Docker pull, package updates)"
ufw allow out 80  comment "HTTP (apt)"

# GhostChain L1 P2P — public (nodes need to peer)
ufw allow in 18551/tcp comment "GhostChain L1 P2P tcp"
ufw allow in 18551/udp comment "GhostChain L1 P2P udp"
ufw allow out 18551/tcp comment "GhostChain L1 P2P tcp out"
ufw allow out 18551/udp comment "GhostChain L1 P2P udp out"

# GhostChain L1 RPC — management CIDR only
ufw allow in from "${MAINNET_MGMT_CIDR}" to any port 18545 proto tcp comment "GhostChain L1 HTTP RPC"
ufw allow in from "${MAINNET_MGMT_CIDR}" to any port 18546 proto tcp comment "GhostChain L1 WS RPC"

# OP Stack P2P — public discovery
ufw allow in 9003/tcp comment "GhostL2 P2P tcp"
ufw allow in 9003/udp comment "GhostL2 P2P udp"
ufw allow in 9013/tcp comment "GhostL3 P2P tcp"
ufw allow in 9013/udp comment "GhostL3 P2P udp"
ufw allow out 9003/tcp comment "GhostL2 P2P tcp out"
ufw allow out 9003/udp comment "GhostL2 P2P udp out"

# Metrics — management CIDR only
ufw allow in from "${MAINNET_MGMT_CIDR}" to any port 9090 proto tcp comment "Prometheus"

ufw --force enable
ufw status verbose
log "UFW enabled (strict outbound policy)"

# ── fail2ban ─────────────────────────────────────────────────────────────────

systemctl enable fail2ban
systemctl start fail2ban 2>/dev/null || true

# ── Unattended security upgrades ─────────────────────────────────────────────

log "enabling unattended security upgrades..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
APT

# ── Sysctl tuning ────────────────────────────────────────────────────────────

log "applying sysctl tuning..."
cat > /etc/sysctl.d/99-ghoststack.conf <<'SYSCTL'
net.core.somaxconn=32768
net.ipv4.tcp_max_syn_backlog=8192
net.ipv4.ip_local_port_range=1024 65535
vm.max_map_count=262144
fs.file-max=200000
# Disable IPv6 on mainnet (single-stack; revisit if needed)
net.ipv6.conf.all.disable_ipv6=1
SYSCTL
sysctl -p /etc/sysctl.d/99-ghoststack.conf >/dev/null

# ── Auditd rules ─────────────────────────────────────────────────────────────

log "configuring auditd..."
cat >> /etc/audit/rules.d/ghoststack.rules <<'AUDIT' 2>/dev/null || true
# GhostStack mainnet audit rules
-w /opt/ghoststack -p rwxa -k ghoststack
-w /data/mainnet/secrets -p rwxa -k ghoststack-secrets
-w /etc/docker/daemon.json -p rwxa -k docker-config
AUDIT
service auditd restart 2>/dev/null || true

# ── Summary ──────────────────────────────────────────────────────────────────

log "mainnet VM bootstrap complete"
echo
echo "══════════════════════════════════════════════════════════════════════"
echo "  MAINNET VM READY — Required Steps Before Deploy"
echo "══════════════════════════════════════════════════════════════════════"
echo
echo "  1. Provision node signer keys OUT-OF-BAND (NEVER auto-generated):"
echo "       /data/mainnet/secrets/l1/node1.key"
echo "       /data/mainnet/secrets/l1/node2.key"
echo "       /data/mainnet/secrets/l1/password.txt"
echo
echo "  2. Set governance gate addresses in:"
echo "       ${MAINNET_ENV_FILE}"
echo "       (RPC_L1, MAINNET_LAUNCH_GATE_ADDRESS, MAINNET_RELEASE_GATE_ADDRESS)"
echo
echo "  3. On DEVNET:"
echo "       launch-system/build-release.sh  --release-id <id>"
echo "       launch-system/seal-release.sh   --release-id <id>"
echo "       launch-system/push-release-to-mainnet.sh \\"
echo "         --release-id <id> --ssh administrator@<THIS_VM_IP>"
echo
echo "  4. On this VM — verify governance authorization:"
echo "       source ${MAINNET_ENV_FILE}"
echo "       /opt/ghoststack/releases/<id>/governance/verify-onchain-authorization.sh"
echo
echo "  5. Only after governance confirmation:"
echo "       sudo -E /opt/ghoststack/releases/<id>/scripts/deploy-mainnet.sh"
echo "       /opt/ghoststack/releases/<id>/scripts/validate-mainnet.sh"
echo
echo "  WARNING: do NOT run deploy-mainnet.sh without governance ratification."
echo "          deploy-mainnet.sh enforces on-chain gate checks and will refuse"
echo "          if MainnetLaunchGate has not authorized the release."
echo
echo "══════════════════════════════════════════════════════════════════════"
