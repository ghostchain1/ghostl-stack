#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_BASE="$ROOT_DIR/ghost-helper-bots"
if [ ! -d "$OUT_BASE" ]; then
  OUT_BASE="$ROOT_DIR/ops"
fi

SBOM_DIR="$OUT_BASE/sbom"
ATTEST_DIR="$OUT_BASE/attestations"
CHECKSUMS="$OUT_BASE/evidence/checksums-$(date -u +%Y%m%d-%H%M%S).txt"

log() {
  printf '[ghostctl:attest] %s\n' "$*"
}

mkdir -p "$SBOM_DIR" "$ATTEST_DIR" "$(dirname "$CHECKSUMS")"

if command -v syft >/dev/null 2>&1; then
  SBOM_OUT="$SBOM_DIR/sbom-$(date -u +%Y%m%d-%H%M%S).spdx.json"
  log "Generating SBOM with syft"
  syft "dir:$ROOT_DIR" -o spdx-json > "$SBOM_OUT"
else
  log "syft not found"
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  log "Writing checksums"
  sha256sum "$SBOM_OUT" > "$CHECKSUMS"
else
  log "sha256sum not found"
  exit 1
fi

ATTEST_OUT="$ATTEST_DIR/attest-$(date -u +%Y%m%d-%H%M%S).json"
cat > "$ATTEST_OUT" <<JSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sbom": "$(basename "$SBOM_OUT")",
  "checksums": "$(basename "$CHECKSUMS")"
}
JSON

log "Attestation complete: $ATTEST_OUT"
