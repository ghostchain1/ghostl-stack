#!/usr/bin/env bash
# install-docker.sh — Install Docker CE, Docker Compose v2, and system dependencies
#
# Supports: Ubuntu 22.04+, Debian 12+
# Idempotent: safe to re-run; skips already-installed components.
#
# Required tools installed:
#   docker, docker compose (v2 plugin), git, curl, jq, bc

set -euo pipefail

GHOST_USER="${GHOST_USER:-$(id -un)}"

log() { echo "[install-docker] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

check_root_or_sudo() {
  if [[ "$EUID" -ne 0 ]]; then
    die "This script must be run as root or with sudo."
  fi
}

check_root_or_sudo

# ── Detect OS ─────────────────────────────────────────────────────────────────

if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  source /etc/os-release
  OS_ID="${ID:-}"
  OS_VERSION_CODENAME="${VERSION_CODENAME:-}"
else
  die "Cannot detect OS — /etc/os-release not found"
fi

case "$OS_ID" in
  ubuntu|debian) ;;
  *)
    log "WARNING: Unsupported OS '$OS_ID' — continuing anyway, install manually if this fails"
    ;;
esac

# ── System packages ───────────────────────────────────────────────────────────

log "Updating package index..."
apt-get update -qq

log "Installing base dependencies..."
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  jq \
  bc \
  gnupg \
  lsb-release \
  apt-transport-https \
  software-properties-common

# ── Docker CE ─────────────────────────────────────────────────────────────────

if command -v docker &>/dev/null; then
  DOCKER_VERSION="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"
  log "Docker already installed: v${DOCKER_VERSION} — skipping"
else
  log "Installing Docker CE via official repository..."

  install -m 0755 -d /etc/apt/keyrings

  case "$OS_ID" in
    ubuntu)
      curl -fsSL "https://download.docker.com/linux/ubuntu/gpg" \
        -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu ${OS_VERSION_CODENAME} stable" \
        | tee /etc/apt/sources.list.d/docker.list > /dev/null
      ;;
    debian)
      curl -fsSL "https://download.docker.com/linux/debian/gpg" \
        -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian ${OS_VERSION_CODENAME} stable" \
        | tee /etc/apt/sources.list.d/docker.list > /dev/null
      ;;
    *)
      log "Falling back to distribution docker.io package"
      apt-get install -y docker.io
      ;;
  esac

  if [[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" ]]; then
    apt-get update -qq
    apt-get install -y \
      docker-ce \
      docker-ce-cli \
      containerd.io \
      docker-buildx-plugin \
      docker-compose-plugin
  fi

  log "Docker installed: $(docker version --format '{{.Server.Version}}' 2>/dev/null)"
fi

# ── Docker Compose v2 ─────────────────────────────────────────────────────────

if docker compose version &>/dev/null 2>&1; then
  log "Docker Compose v2 already available: $(docker compose version)"
else
  die "Docker Compose v2 plugin not found after install — check logs above"
fi

# ── systemd socket activation ─────────────────────────────────────────────────

log "Enabling and starting Docker daemon..."
systemctl enable --now docker

# ── User group membership ─────────────────────────────────────────────────────

if [[ -n "$GHOST_USER" && "$GHOST_USER" != "root" ]]; then
  if ! id -nG "$GHOST_USER" | grep -qw docker; then
    log "Adding $GHOST_USER to the docker group..."
    usermod -aG docker "$GHOST_USER"
    log "NOTE: Log out and back in (or run 'newgrp docker') for group to take effect"
  else
    log "User $GHOST_USER already in docker group"
  fi
fi

# ── Sysctl tuning (optional but recommended) ──────────────────────────────────

log "Applying kernel parameters for container networking..."
cat > /etc/sysctl.d/99-ghoststack.conf <<'EOF'
# GhostStack kernel tuning
net.core.somaxconn = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_fin_timeout = 15
vm.swappiness = 10
EOF
sysctl -p /etc/sysctl.d/99-ghoststack.conf --quiet || true

log "System dependencies installed successfully."
