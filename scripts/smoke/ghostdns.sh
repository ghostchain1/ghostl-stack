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

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    log "Missing file: $file"
    return 1
  fi
}

require_line() {
  local pattern="$1"
  local file="$2"
  if ! has_line "$pattern" "$file"; then
    log "Missing pattern '$pattern' in $file"
    return 1
  fi
}

missing=0

log "GhostDNS smoke: verifying required files"
require_file "$ROOT_DIR/services/ghostdns-indexer/src/server.ts" || missing=1
require_file "$ROOT_DIR/services/ghostdns-resolver/src/server.ts" || missing=1
require_file "$ROOT_DIR/services/ghostdns-ai-policy/src/server.ts" || missing=1
require_file "$ROOT_DIR/services/ghostdns-attestor/src/server.ts" || missing=1
require_file "$ROOT_DIR/contracts/src/ghostdns/GhostDNSRegistry.sol" || missing=1
require_file "$ROOT_DIR/contracts/src/ghostdns/GhostDNSPolicyAnchor.sol" || missing=1

log "GhostDNS smoke: verifying compose wiring"
AUTONOMY_COMPOSE="$ROOT_DIR/docker-compose.autonomy.yml"
require_file "$AUTONOMY_COMPOSE" || missing=1
require_line "^[[:space:]]*ghostdns-indexer:" "$AUTONOMY_COMPOSE" || missing=1
require_line "^[[:space:]]*ghostdns-resolver:" "$AUTONOMY_COMPOSE" || missing=1
require_line "^[[:space:]]*ghostdns-ai-policy:" "$AUTONOMY_COMPOSE" || missing=1
require_line "^[[:space:]]*ghostdns-attestor:" "$AUTONOMY_COMPOSE" || missing=1
require_line "^[[:space:]]*ghostdns-volume-init:" "$AUTONOMY_COMPOSE" || missing=1

log "GhostDNS smoke: verifying env defaults"
STACK_ENV_EXAMPLE="$ROOT_DIR/services/stack.env.example"
require_file "$STACK_ENV_EXAMPLE" || missing=1
require_line "^GHOSTDNS_POLICY_REQUIRED=" "$STACK_ENV_EXAMPLE" || missing=1
require_line "^GHOSTDNS_CONFIDENCE_FLOOR=" "$STACK_ENV_EXAMPLE" || missing=1
require_line "^GHOSTDNS_ADMIN_TOKEN=" "$STACK_ENV_EXAMPLE" || missing=1

if [ "$missing" -ne 0 ]; then
  log "GhostDNS smoke: FAILED"
  exit 1
fi

log "GhostDNS smoke: syntax checks"
node --check "$ROOT_DIR/packages/ghostdns-policy/index.js"
node --check "$ROOT_DIR/packages/ghostdns-types/index.js"

log "GhostDNS smoke: policy unit tests"
npm --prefix "$ROOT_DIR/packages/ghostdns-policy" test

log "GhostDNS smoke: compose render check"
STACK_ENV_FILE="$ROOT_DIR/services/stack.env"
if [ ! -f "$STACK_ENV_FILE" ]; then
  STACK_ENV_FILE="$ROOT_DIR/services/stack.env.example"
fi

docker compose --env-file "$STACK_ENV_FILE" -f "$ROOT_DIR/docker-compose.autonomy.yml" config >/tmp/ghostdns-ci-compose-config.txt

if [ "${GHOSTDNS_SMOKE_LIVE:-0}" = "1" ]; then
  log "GhostDNS smoke: live endpoint probes"
  IDX="${GHOSTDNS_INDEXER_HOST_PORT:-17811}"
  RES="${GHOSTDNS_RESOLVER_HOST_PORT:-17812}"
  POL="${GHOSTDNS_POLICY_HOST_PORT:-17813}"
  ATT="${GHOSTDNS_ATTESTOR_HOST_PORT:-17814}"
  TOKEN="$(grep '^GHOSTDNS_ADMIN_TOKEN=' "$STACK_ENV_FILE" | head -n1 | cut -d= -f2-)"

  if [ -z "$TOKEN" ]; then
    log "GhostDNS smoke: missing GHOSTDNS_ADMIN_TOKEN in ${STACK_ENV_FILE#$ROOT_DIR/}"
    exit 1
  fi

  curl -fsS "http://127.0.0.1:${POL}/health" >/dev/null
  curl -fsS "http://127.0.0.1:${IDX}/health" >/dev/null
  curl -fsS "http://127.0.0.1:${RES}/health" >/dev/null
  curl -fsS "http://127.0.0.1:${ATT}/health" >/dev/null

  log "GhostDNS smoke: live upsert"
  UPSERT_PAYLOAD='{"domain":"ci.example.ghost","target":"0x5FbDB2315678afecb367f032d93F642f64180aa3","layer":"L3","ttl":300,"source":"manual"}'
  curl -fsS -X POST "http://127.0.0.1:${IDX}/v1/records/upsert" \
    -H "content-type: application/json" \
    -H "authorization: Bearer ${TOKEN}" \
    -d "$UPSERT_PAYLOAD" \
    | grep -q '"ok":true'

  log "GhostDNS smoke: live resolve"
  curl -fsS "http://127.0.0.1:${RES}/v1/resolve/ci.example.ghost?layer=L1" \
    | grep -q '"ok":true'

  log "GhostDNS smoke: live attest"
  ATTEST_PAYLOAD='{"domain":"ci.example.ghost","target":"0x5FbDB2315678afecb367f032d93F642f64180aa3","requestLayer":"L1","recordLayer":"L3","confidence":0.95,"ttl":300,"version":1}'
  curl -fsS -X POST "http://127.0.0.1:${ATT}/v1/attest" \
    -H "content-type: application/json" \
    -H "authorization: Bearer ${TOKEN}" \
    -d "$ATTEST_PAYLOAD" \
    | grep -q '"ok":true'
fi

log "GhostDNS smoke: OK"
