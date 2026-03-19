#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

has_line() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pattern" "$file"
  else
    grep -Eq "$pattern" "$file"
  fi
}

require_dir() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    log "Missing directory: $dir"
    return 1
  fi
}

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    log "Missing file: $file"
    return 1
  fi
}

require_service() {
  local compose="$1"
  local service="$2"
  if ! has_line "^[[:space:]]*${service}:" "$compose"; then
    log "Missing service '${service}' in ${compose}"
    return 1
  fi
}

log "AI stability check: verifying service directories"
missing=0
for svc in ai-monitor ghost-gas-engine ghost-gas-engine-worker ghost-compliance ghost-compliance-worker ghost-pil ghost-pil-worker; do
  require_dir "$ROOT_DIR/services/$svc" || missing=1
  require_file "$ROOT_DIR/services/$svc/Dockerfile" || missing=1
done

log "AI stability check: verifying compose definitions"
AI_RUNTIME_COMPOSE="$ROOT_DIR/services/docker-compose.legacy.yml"
COMPLIANCE_COMPOSE="$ROOT_DIR/docker-compose.yml"
SERVICES_COMPOSE="$ROOT_DIR/services/docker-compose.legacy.yml"

require_file "$AI_RUNTIME_COMPOSE" || missing=1
require_file "$COMPLIANCE_COMPOSE" || missing=1
require_file "$SERVICES_COMPOSE" || missing=1

require_service "$AI_RUNTIME_COMPOSE" "ghost-gas-engine" || missing=1
require_service "$AI_RUNTIME_COMPOSE" "ghost-gas-engine-worker" || missing=1
require_service "$AI_RUNTIME_COMPOSE" "gas-engine-postgres" || missing=1
require_service "$AI_RUNTIME_COMPOSE" "gas-engine-redis" || missing=1

require_service "$COMPLIANCE_COMPOSE" "ghost-compliance" || missing=1
require_service "$COMPLIANCE_COMPOSE" "ghost-compliance-worker" || missing=1
require_service "$COMPLIANCE_COMPOSE" "postgres" || missing=1
require_service "$COMPLIANCE_COMPOSE" "redis" || missing=1

require_service "$SERVICES_COMPOSE" "ai-monitor" || missing=1
require_service "$SERVICES_COMPOSE" "ghost-pil" || missing=1
require_service "$SERVICES_COMPOSE" "ghost-pil-worker" || missing=1

log "AI stability check: verifying Prometheus scrape targets"
PROM_CONFIG="$ROOT_DIR/infra/docker/compose/prometheus.yml"
require_file "$PROM_CONFIG" || missing=1
if ! has_line "ghost-gas-engine" "$PROM_CONFIG"; then
  log "Missing ghost-gas-engine scrape in $PROM_CONFIG"
  missing=1
fi
if ! has_line "ghost-compliance" "$PROM_CONFIG"; then
  log "Missing ghost-compliance scrape in $PROM_CONFIG"
  missing=1
fi
if ! has_line "ghost-pil" "$PROM_CONFIG"; then
  log "Missing ghost-pil scrape in $PROM_CONFIG"
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  log "AI stability check: FAILED"
  exit 1
fi

if [ "${AI_STABILITY_RUN_HEALTHCHECK:-0}" = "1" ]; then
  log "AI stability check: running live health checks"
  curl -fsS http://localhost:7575/health >/dev/null
  curl -fsS http://localhost:3210/ready >/dev/null
  curl -fsS http://localhost:3210/metrics >/dev/null
  curl -fsS http://localhost:8090/health >/dev/null
  curl -fsS http://localhost:8090/metrics >/dev/null
  curl -fsS http://localhost:3220/health >/dev/null
  curl -fsS http://localhost:3220/metrics >/dev/null
fi

log "AI stability check: OK"
