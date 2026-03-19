#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${L2_SECRETS_DIR:-$ROOT_DIR/environments/devnet/secrets/ghostl2}"
VAULT_L2_PATH="${VAULT_L2_PATH:-ghostchain/l2}"

if ! command -v vault >/dev/null 2>&1; then
  echo "Missing vault CLI. Install Vault and retry." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

vault kv get -field=sequencer_key "$VAULT_L2_PATH" >"$OUT_DIR/sequencer.key"
vault kv get -field=batcher_key "$VAULT_L2_PATH" >"$OUT_DIR/batcher.key"
vault kv get -field=proposer_key "$VAULT_L2_PATH" >"$OUT_DIR/proposer.key"
vault kv get -field=challenger_key "$VAULT_L2_PATH" >"$OUT_DIR/challenger.key"
vault kv get -field=jwtsecret "$VAULT_L2_PATH" >"$OUT_DIR/jwtsecret"

chmod 600 \
  "$OUT_DIR/sequencer.key" \
  "$OUT_DIR/batcher.key" \
  "$OUT_DIR/proposer.key" \
  "$OUT_DIR/challenger.key" \
  "$OUT_DIR/jwtsecret"

echo "OK: rendered L2 secrets to $OUT_DIR"
