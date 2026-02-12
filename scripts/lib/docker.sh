#!/usr/bin/env bash
# shellcheck shell=bash

# Docker wrapper for scripts that may run on hosts where the user is not in the
# `docker` group (common on fresh Ubuntu VMs). We:
# - Prefer `docker` when `docker info` works as the current user.
# - Fall back to `sudo -n docker` when available (non-interactive, won't prompt).
# - Refuse interactive sudo to avoid hanging automation.
#
# Usage:
#   # shellcheck source=scripts/lib/docker.sh
#   . "${ROOT_DIR}/scripts/lib/docker.sh"
#   hg_docker compose ps

HG_DOCKER_READY="${HG_DOCKER_READY:-0}"
HG_DOCKER_MODE="${HG_DOCKER_MODE:-}"
declare -a HG_DOCKER_CMD
HG_DOCKER_CMD=(docker)

hg_docker_init() {
  if [ "${HG_DOCKER_READY:-0}" = "1" ]; then
    return 0
  fi

  docker_bin="$(type -P docker 2>/dev/null || true)"
  if [ -z "${docker_bin}" ]; then
    echo "docker not found. Install Docker Engine + Docker Compose v2." >&2
    return 1
  fi

  if "${docker_bin}" info >/dev/null 2>&1; then
    HG_DOCKER_CMD=("${docker_bin}")
    HG_DOCKER_MODE="docker"
    HG_DOCKER_READY="1"
    return 0
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1 && sudo -n "${docker_bin}" info >/dev/null 2>&1; then
    HG_DOCKER_CMD=(sudo -n "${docker_bin}")
    HG_DOCKER_MODE="sudo"
    HG_DOCKER_READY="1"
    return 0
  fi

  err="$("${docker_bin}" info 2>&1 || true)"
  if printf '%s' "${err}" | grep -qi "permission denied"; then
    user="${USER:-$(id -un 2>/dev/null || echo user)}"
    echo "Docker is installed but not usable as '${user}' (permission denied)." >&2
    echo "Fix options:" >&2
    echo "  1) Add user to docker group (recommended): sudo usermod -aG docker ${user} && re-login" >&2
    echo "  2) Configure passwordless sudo for docker and re-run (scripts use sudo -n)" >&2
    echo "docker info error:" >&2
    echo "${err}" >&2
    return 1
  fi

  if printf '%s' "${err}" | grep -qi "Cannot connect to the Docker daemon"; then
    echo "Docker daemon not reachable. Start Docker and re-run." >&2
    echo "docker info error:" >&2
    echo "${err}" >&2
    return 1
  fi

  echo "Docker is installed but not usable from this shell." >&2
  echo "docker info error:" >&2
  echo "${err}" >&2
  return 1
}

hg_docker() {
  hg_docker_init
  "${HG_DOCKER_CMD[@]}" "$@"
}

hg_require_docker_compose() {
  hg_docker compose version >/dev/null 2>&1 || {
    echo "docker compose is required (Compose v2 plugin). Install/upgrade Docker." >&2
    return 1
  }
}
