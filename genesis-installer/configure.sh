#!/usr/bin/env bash
# GhostStack Genesis Installer — System Configuration
#
# Installs system-level prerequisites and prepares the local env file.
# Requires: Ubuntu 22.04+ / Debian-based host, sudo access.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

info()  { echo "[$(date +%H:%M:%S)] [configure] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [configure] FATAL: $*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Node version guard — >=22.21.0 <23 (enforced by preinstall hook)
# ---------------------------------------------------------------------------

check_node_version() {
  if ! need_cmd node; then
    info "node not found — will install via NodeSource."
    return 0
  fi
  local ver
  ver="$(node --version | sed 's/v//')"
  local major="${ver%%.*}"
  if [[ "${major}" -lt 22 || "${major}" -ge 23 ]]; then
    fatal "Node.js ${ver} is unsupported. Required: >=22.21.0 <23."
  fi
  info "Node.js ${ver} OK."
}

# ---------------------------------------------------------------------------
# Docker version guard — Compose v2 required
# ---------------------------------------------------------------------------

check_docker() {
  need_cmd docker || fatal "Docker not found. Install Docker Engine first."

  if ! docker info >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
      info "Docker accessible via sudo."
    else
      fatal "Cannot reach Docker daemon. Check permissions or run with sudo."
    fi
  fi

  # Docker Compose v2 ships as 'docker compose' (plugin), not standalone.
  if ! docker compose version >/dev/null 2>&1; then
    fatal "Docker Compose v2 plugin not found. Install docker-compose-plugin."
  fi
  local cv
  cv="$(docker compose version --short 2>/dev/null || docker compose version | grep -oP '\d+\.\d+\.\d+')"
  info "Docker Compose ${cv} OK."
}

# ---------------------------------------------------------------------------
# Install system packages
# ---------------------------------------------------------------------------

install_packages() {
  if ! need_cmd apt-get; then
    info "apt not available — skipping package install (non-Debian host?)."
    return 0
  fi

  info "Updating apt package lists…"
  sudo apt-get update -qq

  local pkgs=(
    ca-certificates
    curl
    git
    build-essential
    jq
  )

  # Only install docker.io if docker is absent.
  if ! need_cmd docker; then
    pkgs+=(docker.io docker-compose-v2)
  fi

  info "Installing: ${pkgs[*]}"
  sudo apt-get install -y -qq "${pkgs[@]}"
  sudo systemctl enable docker 2>/dev/null || true
  sudo systemctl start  docker 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Install Node.js 22 via NodeSource if missing or wrong version
# ---------------------------------------------------------------------------

install_node() {
  if need_cmd node; then
    local ver major
    ver="$(node --version | sed 's/v//')"
    major="${ver%%.*}"
    if [[ "${major}" -ge 22 && "${major}" -lt 23 ]]; then
      info "Node.js ${ver} already satisfies >=22.21.0 <23."
      return 0
    fi
  fi

  info "Installing Node.js 22 via NodeSource…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
}

# ---------------------------------------------------------------------------
# Prepare .env file (fail-closed: refuse to overwrite with empty secrets)
# ---------------------------------------------------------------------------

prepare_env() {
  local env_file="${ROOT}/.env"
  local example="${ROOT}/stack.env.example"

  if [[ ! -f "${env_file}" ]]; then
    if [[ -f "${example}" ]]; then
      cp "${example}" "${env_file}"
      info "Copied stack.env.example → .env"
    else
      info ".env not found and no example file — creating minimal skeleton."
      cat > "${env_file}" <<'EOF'
# GhostStack env — fill in secrets before starting services.
POSTGRES_PASSWORD=
COMPLIANCE_JWT_SECRET=
EOF
    fi
  else
    info ".env already exists — skipping copy."
  fi

  # Fail-closed: ensure the two mandatory secrets are present in .env.
  local pg jwt
  pg="$(grep -E '^POSTGRES_PASSWORD=' "${env_file}" | cut -d= -f2- || true)"
  jwt="$(grep -E '^COMPLIANCE_JWT_SECRET=' "${env_file}" | cut -d= -f2- || true)"

  if [[ -z "${pg}" && -z "${POSTGRES_PASSWORD:-}" ]]; then
    fatal ".env has no POSTGRES_PASSWORD. Set it before running the installer."
  fi
  if [[ -z "${jwt}" && -z "${COMPLIANCE_JWT_SECRET:-}" ]]; then
    fatal ".env has no COMPLIANCE_JWT_SECRET. Set it before running the installer."
  fi

  info ".env secrets validated."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== System Configuration ==="

install_packages
install_node
check_node_version
check_docker
prepare_env

info "System configuration complete."
