#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${L1_SECRETS_DIR:-$ROOT_DIR/infra/ghostchain/secrets}"
VAULT_L1_PATH="${VAULT_L1_PATH:-ghostchain/l1}"

if ! command -v vault >/dev/null 2>&1; then
  echo "Missing vault CLI. Install Vault and retry." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

vault kv get -field=bootnode_key "$VAULT_L1_PATH" >"$OUT_DIR/boot.key"
vault kv get -field=node1_key "$VAULT_L1_PATH" >"$OUT_DIR/node1.key"
vault kv get -field=node2_key "$VAULT_L1_PATH" >"$OUT_DIR/node2.key"
vault kv get -field=jwtsecret "$VAULT_L1_PATH" >"$OUT_DIR/jwtsecret"

chmod 600 "$OUT_DIR/boot.key" "$OUT_DIR/node1.key" "$OUT_DIR/node2.key" "$OUT_DIR/jwtsecret"

echo "OK: rendered L1 secrets to $OUT_DIR"
