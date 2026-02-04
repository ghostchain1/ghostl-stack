#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/ops/security"
OUT_FILE="$OUT_DIR/trivy-fs.json"
SECRET_CONFIG="$ROOT_DIR/trivy-secret.yaml"

log() {
  printf '[ghostctl:scan] %s\n' "$*"
}

if ! command -v trivy >/dev/null 2>&1; then
  log "trivy is required"
  exit 1
fi

mkdir -p "$OUT_DIR"

log "Running trivy fs scan"
trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --exit-code 1 \
  --format json -o "$OUT_FILE" \
  --skip-dirs node_modules,contracts/node_modules,dist,artifacts,cache,backups,ops/snapshots,ops/preflight,contracts/out-codex,contracts/cache-codex,infra/ghostchain/data,infra/ghostchain/secrets,infra/opstack/data,infra/opstack/broadcast,infra/opstack/secrets,infra/opstack/l3/secrets,chains \
  --skip-files ops/security/trivy-fs.json,contracts/reports/formal/scribble/scribble.json,contracts/artifacts/build-info/*.json,infra/opstack/op-geth/signer/fourbyte/4byte.json \
  --secret-config "$SECRET_CONFIG" \
  "$ROOT_DIR"

log "Scan complete: $OUT_FILE"
