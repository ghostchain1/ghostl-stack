#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

STRICT_MODE=0
if [ "${SLITHER_STRICT:-0}" = "1" ] || [ -n "${CI:-}" ] || [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  STRICT_MODE=1
fi

warn() { echo "WARN: $*" >&2; }
fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "[trivy-image] $*"; }

is_docker_daemon_unavailable() {
  local msg="${1:-}"
  msg="$(printf '%s' "$msg" | tr '[:upper:]' '[:lower:]')"
  case "$msg" in
    *"permission denied while trying to connect to the docker api"* ) return 0 ;;
    *"permission denied while trying to connect to the docker daemon socket"* ) return 0 ;;
    *"got permission denied while trying to connect to the docker daemon socket"* ) return 0 ;;
    *"cannot connect to the docker daemon"* ) return 0 ;;
    *"is the docker daemon running"* ) return 0 ;;
    *"error during connect"*docker.sock* ) return 0 ;;
    *dial\ unix*docker.sock*permission\ denied* ) return 0 ;;
    *dial\ unix*docker.sock*operation\ not\ permitted* ) return 0 ;;
    *dial\ unix*docker.sock*no\ such\ file\ or\ directory* ) return 0 ;;
    *) return 1 ;;
  esac
}

skip_or_fail() {
  local message="$1"
  local detail="${2:-}"
  if [ "$STRICT_MODE" = "1" ]; then
    if [ -n "$detail" ]; then
      fail "$message: $detail"
    fi
    fail "$message"
  fi
  warn "SKIPPED: $message"
  if [ -n "$detail" ]; then
    warn "$detail"
  fi
  exit 0
}

need_bin() { command -v "$1" >/dev/null 2>&1 || fail "missing required binary: $1"; }

COMPOSE_FILE="${1:-$ROOT_DIR/infra/docker/compose/docker-compose.core.yml}"
if [ ! -f "$COMPOSE_FILE" ]; then
  fail "missing compose file: $COMPOSE_FILE"
fi

need_bin trivy
need_bin docker

docker_out=""
if ! docker_out="$(docker version --format '{{.Server.Version}}' 2>&1)"; then
  if is_docker_daemon_unavailable "$docker_out"; then
    skip_or_fail "docker daemon/socket not reachable" "$docker_out"
  fi
  skip_or_fail "docker version failed" "$docker_out"
fi

if ! docker compose version >/dev/null 2>&1; then
  skip_or_fail "docker compose not available"
fi

images="$(docker compose -f "$COMPOSE_FILE" config --images 2>/dev/null | sed '/^$/d' | sort -u || true)"
if [ -z "$images" ]; then
  fail "no images discovered from compose file: $COMPOSE_FILE"
fi

severity="${TRIVY_IMAGE_SEVERITY:-HIGH,CRITICAL}"
timeout="${TRIVY_IMAGE_TIMEOUT:-30m}"

info "scanning images from ${COMPOSE_FILE#$ROOT_DIR/} (severity=$severity)"
while IFS= read -r image; do
  [ -z "$image" ] && continue
  info "trivy image: $image"
  trivy image \
    --timeout "$timeout" \
    --severity "$severity" \
    --exit-code 1 \
    --ignore-unfixed \
    --skip-db-update \
    --skip-version-check \
    "$image"
done <<<"$images"

info "OK"
