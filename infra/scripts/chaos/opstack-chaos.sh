#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/opstack/docker-compose.yml}"
ACTION="${1:-}"
DURATION_SEC="${CHAOS_DURATION_SEC:-60}"

usage() {
  cat <<'USAGE'
Usage: opstack-chaos.sh <action> [duration_sec]

Actions:
  disconnect-l1   Stop l1-rpc-proxy to simulate L1 RPC loss
  pause-proposer  Stop op-proposer temporarily
  lag-batcher     Pause op-batcher temporarily (freezes process)
  restore         Start/resume services stopped by chaos actions

Env:
  COMPOSE_FILE        Override compose file (default infra/opstack/docker-compose.yml)
  CHAOS_DURATION_SEC  Default duration for pause/stop actions (default 60s)
USAGE
}

if [[ -z "$ACTION" ]]; then
  usage
  exit 1
fi

if [[ -n "${2:-}" ]]; then
  DURATION_SEC="$2"
fi

dc() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

case "$ACTION" in
  disconnect-l1)
    log "Stopping l1-rpc-proxy (simulate L1 RPC loss)..."
    dc stop l1-rpc-proxy
    ;;
  pause-proposer)
    log "Stopping op-proposer for ${DURATION_SEC}s..."
    dc stop op-proposer
    sleep "$DURATION_SEC"
    log "Starting op-proposer..."
    dc start op-proposer
    ;;
  lag-batcher)
    log "Pausing op-batcher for ${DURATION_SEC}s..."
    docker pause op-batcher || dc pause op-batcher
    sleep "$DURATION_SEC"
    log "Unpausing op-batcher..."
    docker unpause op-batcher || dc unpause op-batcher
    ;;
  restore)
    log "Restoring op-batcher/op-proposer/l1-rpc-proxy..."
    dc start l1-rpc-proxy op-proposer op-batcher || true
    docker unpause op-batcher >/dev/null 2>&1 || true
    ;;
  *)
    usage
    exit 1
    ;;
esac
