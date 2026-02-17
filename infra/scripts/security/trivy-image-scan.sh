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

resolve_image_refs() {
  local ref="$1"
  local tags=""
  if [[ "$ref" =~ ^sha256:[0-9a-f]{64}$ || "$ref" =~ ^[0-9a-f]{12,64}$ ]]; then
    tags="$(docker image inspect "$ref" --format '{{join .RepoTags "\n"}}' 2>/dev/null || true)"
    if [ -n "$tags" ] && [ "$tags" != "<no value>" ]; then
      printf '%s\n' "$tags"
      return 0
    fi
  fi
  printf '%s\n' "$ref"
}

compose_err_file="$(mktemp)"
images="$(docker compose -f "$COMPOSE_FILE" config --images 2>"$compose_err_file" | sed '/^$/d' | sort -u || true)"
compose_err="$(cat "$compose_err_file" || true)"
rm -f "$compose_err_file"

if [ -z "$images" ]; then
  if [ -n "$compose_err" ]; then
    warn "compose image discovery failed for $COMPOSE_FILE"
    warn "$compose_err"
  else
    warn "compose image discovery returned no images for $COMPOSE_FILE"
  fi
  images="$(docker ps --format '{{.Image}}' | sed '/^$/d' | sort -u || true)"
  if [ -z "$images" ]; then
    fail "no running container images discovered for trivy image scan fallback"
  fi
  warn "falling back to scanning running container images"
fi

severity="${TRIVY_IMAGE_SEVERITY:-HIGH,CRITICAL}"
timeout="${TRIVY_IMAGE_TIMEOUT:-30m}"
scanners="${TRIVY_IMAGE_SCANNERS:-vuln}"
pkg_types="${TRIVY_IMAGE_PKG_TYPES:-os}"
include_regex_default='^(local/|ghostl/|ghostchain([-/].*)?|compose-ghostcontrol-)'
include_regex="${TRIVY_IMAGE_INCLUDE_REGEX:-$include_regex_default}"
exclude_regex="${TRIVY_IMAGE_EXCLUDE_REGEX:-}"

normalized_images="$(
  while IFS= read -r image; do
    [ -z "$image" ] && continue
    resolve_image_refs "$image"
  done <<<"$images" | sed '/^$/d;/^<none>:<none>$/d' | sort -u
)"

filtered_images="$normalized_images"
if [ -n "$include_regex" ]; then
  filtered_images="$(printf '%s\n' "$filtered_images" | grep -E "$include_regex" || true)"
fi
if [ -n "$exclude_regex" ]; then
  filtered_images="$(printf '%s\n' "$filtered_images" | grep -E -v "$exclude_regex" || true)"
fi
if [ -z "$filtered_images" ]; then
  fail "no container images selected for trivy scan after filtering"
fi

info "scanning images from ${COMPOSE_FILE#$ROOT_DIR/} (severity=$severity scanners=$scanners pkg_types=$pkg_types)"
while IFS= read -r image; do
  [ -z "$image" ] && continue
  info "trivy image: $image"
  trivy image \
    --scanners "$scanners" \
    --pkg-types "$pkg_types" \
    --timeout "$timeout" \
    --severity "$severity" \
    --exit-code 1 \
    --ignore-unfixed \
    --skip-db-update \
    --skip-version-check \
    "$image"
done <<<"$filtered_images"

info "OK"
