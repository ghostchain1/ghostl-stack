#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

MANIFEST_PATH="${MANIFEST_PATH:-$ROOT_DIR/artifacts/release/release_manifest.json}"
SIGNATURE_PATH="${SIGNATURE_PATH:-$ROOT_DIR/artifacts/release/release_manifest.sig}"
PUBLIC_KEY_PATH="${PUBLIC_KEY_PATH:-$ROOT_DIR/artifacts/release/release_manifest.pub}"
OUT_PATH="${OUT_PATH:-$ROOT_DIR/artifacts/release/attestation_verification.json}"

[[ -f "$MANIFEST_PATH" ]] || {
  echo "missing manifest: $MANIFEST_PATH" >&2
  exit 1
}
[[ -f "$SIGNATURE_PATH" ]] || {
  echo "missing signature: $SIGNATURE_PATH" >&2
  exit 1
}
[[ -f "$PUBLIC_KEY_PATH" ]] || {
  echo "missing public key: $PUBLIC_KEY_PATH" >&2
  exit 1
}

manifest_hash="$(sha256sum "$MANIFEST_PATH" | awk '{print $1}')"

if ! openssl dgst -sha256 -verify "$PUBLIC_KEY_PATH" -signature "$SIGNATURE_PATH" "$MANIFEST_PATH" >/dev/null 2>&1; then
  echo "attestation verification failed" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_PATH")"
cat >"$OUT_PATH" <<JSON
{
  "ok": true,
  "manifestPath": "$MANIFEST_PATH",
  "signaturePath": "$SIGNATURE_PATH",
  "publicKeyPath": "$PUBLIC_KEY_PATH",
  "manifestHash": "sha256:$manifest_hash",
  "verifiedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON

echo "release_attestation_verify:PASS"
