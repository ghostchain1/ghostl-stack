#!/usr/bin/env bash
set -euo pipefail

require() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "missing_env=${key}" >&2
    exit 2
  fi
}

require VAULT_ADDR
require VAULT_TOKEN

ROLE_NAME="${VAULT_APPROLE_NAME:-ghost-api}"
EVIDENCE_DIR="${VAULT_EVIDENCE_DIR:-/home/ghost/ghostl-stack/evidence/phase2}"
mkdir -p "${EVIDENCE_DIR}"
OUT_JSON="${EVIDENCE_DIR}/vault-approle-rotation.json"

ROLE_ID="$(vault read -address="${VAULT_ADDR}" -token="${VAULT_TOKEN}" -field=role_id "auth/approle/role/${ROLE_NAME}/role-id")"
SECRET_ID="$(vault write -address="${VAULT_ADDR}" -token="${VAULT_TOKEN}" -field=secret_id -f "auth/approle/role/${ROLE_NAME}/secret-id")"

cat > "${OUT_JSON}" <<JSON
{
  "roleName": "${ROLE_NAME}",
  "vaultAddr": "${VAULT_ADDR}",
  "vaultAuthPath": "auth/approle/login",
  "vaultRoleId": "${ROLE_ID}",
  "vaultSecretId": "${SECRET_ID}",
  "rotatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON

echo "rotation_written=${OUT_JSON}"
