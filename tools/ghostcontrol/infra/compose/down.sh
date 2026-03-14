#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

COMPOSE_CMD="docker compose -f '${SCRIPT_DIR}/docker-compose.yml' down"

SOCKET_GROUP=""
if [[ -S /var/run/docker.sock ]] && command -v stat >/dev/null 2>&1; then
  SOCKET_GROUP="$(stat -c '%G' /var/run/docker.sock 2>/dev/null || true)"
fi
DOCKER_GROUP_CANDIDATE="${DOCKER_SOCKET_GROUP:-${SOCKET_GROUP:-${GHOST_DOCKER_GROUP:-}}}"

if command -v sg >/dev/null 2>&1; then
  if [[ -n "${DOCKER_GROUP_CANDIDATE}" ]] && getent group "${DOCKER_GROUP_CANDIDATE}" >/dev/null 2>&1; then
    exec sg "${DOCKER_GROUP_CANDIDATE}" -c "${COMPOSE_CMD}"
  fi
  if getent group docker >/dev/null 2>&1; then
    exec sg docker -c "${COMPOSE_CMD}"
  fi
fi

exec bash -lc "${COMPOSE_CMD}"
