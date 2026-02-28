#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

MANIFEST_PATH="${MANIFEST_PATH:-$ROOT_DIR/artifacts/release/release_manifest.json}"
SIGNATURE_PATH="${SIGNATURE_PATH:-$ROOT_DIR/artifacts/release/release_manifest.sig}"
PUBLIC_KEY_PATH="${PUBLIC_KEY_PATH:-$ROOT_DIR/artifacts/release/release_manifest.pub}"
PRIVATE_KEY_PATH="${PRIVATE_KEY_PATH:-${RELEASE_ATTESTATION_PRIVATE_KEY_FILE:-}}"

[[ -f "$MANIFEST_PATH" ]] || {
  echo "missing manifest: $MANIFEST_PATH" >&2
  exit 1
}

[[ -n "$PRIVATE_KEY_PATH" ]] || {
  echo "set RELEASE_ATTESTATION_PRIVATE_KEY_FILE (PEM private key)" >&2
  exit 1
}

[[ -f "$PRIVATE_KEY_PATH" ]] || {
  echo "missing private key: $PRIVATE_KEY_PATH" >&2
  exit 1
}

mkdir -p "$(dirname "$SIGNATURE_PATH")"

openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" -out "$SIGNATURE_PATH" "$MANIFEST_PATH"
openssl pkey -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH"

echo "release_manifest_signed:$SIGNATURE_PATH"
