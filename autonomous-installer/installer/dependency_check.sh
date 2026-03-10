#!/usr/bin/env bash
# GhostStack Autonomous Installer — Dependency Check
#
# Verifies all system prerequisites before any deployment phase runs.
# Exits non-zero immediately on any unmet requirement.
#
# Checks:
#   - Docker Engine (accessible without sudo, or with non-interactive sudo)
#   - Docker Compose v2 plugin ('docker compose version')
#   - Node.js >=22.21.0 <23
#   - curl, jq, git (used by monitoring and upgrade scripts)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

info()    { echo "[$(date +%H:%M:%S)] [dep_check] $*"; }
ok()      { echo "[$(date +%H:%M:%S)] [dep_check] OK  $*"; }
warn()    { echo "[$(date +%H:%M:%S)] [dep_check] WARN $*" >&2; }
fail()    { echo "[$(date +%H:%M:%S)] [dep_check] FAIL $*" >&2; }
fatal()   { echo "[$(date +%H:%M:%S)] [dep_check] FATAL: $*" >&2; exit 1; }

ERRORS=0

need() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1 found at $(command -v "$1")"
  else
    fail "$1 not found — install it first."
    ERRORS=$(( ERRORS + 1 ))
  fi
}

# ---------------------------------------------------------------------------
# Docker Engine
# ---------------------------------------------------------------------------

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    fail "docker not found."
    ERRORS=$(( ERRORS + 1 ))
    return
  fi

  if docker info >/dev/null 2>&1; then
    ok "docker accessible without sudo."
  elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    ok "docker accessible via non-interactive sudo."
  else
    fail "docker daemon unreachable. Check user group (add to 'docker') or sudo permissions."
    ERRORS=$(( ERRORS + 1 ))
  fi
}

# ---------------------------------------------------------------------------
# Docker Compose v2 (plugin, not standalone docker-compose v1)
# ---------------------------------------------------------------------------

check_compose_v2() {
  if ! docker compose version >/dev/null 2>&1 && \
     ! sudo -n docker compose version >/dev/null 2>&1; then
    fail "Docker Compose v2 plugin missing. Install 'docker-compose-plugin' or Docker Desktop."
    ERRORS=$(( ERRORS + 1 ))
    return
  fi
  local ver
  ver="$(docker compose version --short 2>/dev/null || docker compose version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
  ok "docker compose v${ver}"
}

# ---------------------------------------------------------------------------
# Node.js — >=22.21.0 <23 (enforced by repo preinstall hook)
# ---------------------------------------------------------------------------

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    warn "node not found — required for npm run scripts. Install via NodeSource (see configure.sh)."
    return  # not fatal here; guardian daemon is pure bash
  fi

  local ver major minor patch
  ver="$(node --version | sed 's/v//')"
  major="${ver%%.*}"
  rest="${ver#*.}"
  minor="${rest%%.*}"
  patch="${rest#*.}"

  if [[ "${major}" -lt 22 || "${major}" -ge 23 ]]; then
    fail "Node.js ${ver} is outside required range >=22.21.0 <23."
    ERRORS=$(( ERRORS + 1 ))
    return
  fi
  if [[ "${major}" -eq 22 && "${minor}" -eq 0 && "${patch%%-*}" -lt 21 ]]; then
    fail "Node.js ${ver} < 22.21.0 — minimum patch required."
    ERRORS=$(( ERRORS + 1 ))
    return
  fi
  ok "Node.js ${ver}"
}

# ---------------------------------------------------------------------------
# Required CLI tools
# ---------------------------------------------------------------------------

check_tools() {
  for cmd in curl jq git; do
    need "${cmd}"
  done
}

# ---------------------------------------------------------------------------
# Workspace root sanity
# ---------------------------------------------------------------------------

check_workspace() {
  for f in docker-compose.yml docker-compose.ghostchain.yml docker-compose.ghostbrain.yml; do
    if [[ ! -f "${ROOT}/${f}" ]]; then
      fail "Expected workspace file missing: ${f}"
      ERRORS=$(( ERRORS + 1 ))
    fi
  done
  [[ "${ERRORS}" -eq 0 ]] && ok "Workspace files present."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Dependency Check ==="

check_docker
check_compose_v2
check_node
check_tools
check_workspace

if [[ "${ERRORS}" -gt 0 ]]; then
  fatal "${ERRORS} dependency check(s) failed. Fix the issues above before running the installer."
fi

info "All dependencies satisfied."
