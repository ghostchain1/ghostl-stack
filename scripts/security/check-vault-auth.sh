#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[vault-check] validating Vault auth prerequisites"

if bash scripts/security/prepare-vault-auth.sh; then
  echo "[vault-check] OK: vault auth material is present"
  exit 0
fi

echo "[vault-check] ERROR: vault auth validation failed" >&2
echo "[vault-check] Prepare credentials with:" >&2
echo "[vault-check]   npm run security:vault:prepare" >&2
echo "[vault-check] Then validate with:" >&2
echo "[vault-check]   VAULT_ENV_FILE=ops/security/vault-auth.env npm run security:vault:check" >&2
exit 2
