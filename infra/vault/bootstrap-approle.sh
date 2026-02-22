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
POLICY_NAME="${VAULT_POLICY_NAME:-ghost-api}"
POLICY_FILE="${VAULT_POLICY_FILE:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/policies/ghost-api.hcl}"
TOKEN_TTL="${VAULT_TOKEN_TTL:-1h}"
TOKEN_MAX_TTL="${VAULT_TOKEN_MAX_TTL:-24h}"
SECRET_ID_TTL="${VAULT_SECRET_ID_TTL:-24h}"
SECRET_ID_USES="${VAULT_SECRET_ID_NUM_USES:-0}"
EVIDENCE_DIR="${VAULT_EVIDENCE_DIR:-/home/ghost/ghostl-stack/evidence/phase2}"

mkdir -p "${EVIDENCE_DIR}"
OUT_JSON="${EVIDENCE_DIR}/vault-approle-bootstrap.json"

if [[ ! -f "${POLICY_FILE}" ]]; then
  echo "policy_file_not_found=${POLICY_FILE}" >&2
  exit 2
fi

vault write -address="${VAULT_ADDR}" -token="${VAULT_TOKEN}" "sys/policies/acl/${POLICY_NAME}" policy=@"${POLICY_FILE}" >/dev/null

vault write -address="${VAULT_ADDR}" -token="${VAULT_TOKEN}" "auth/approle/role/${ROLE_NAME}" \
  token_policies="${POLICY_NAME}" \
  token_ttl="${TOKEN_TTL}" \
  token_max_ttl="${TOKEN_MAX_TTL}" \
  secret_id_ttl="${SECRET_ID_TTL}" \
  secret_id_num_uses="${SECRET_ID_USES}" >/dev/null

ROLE_ID="$(vault read -address="${VAULT_ADDR}" -token="${VAULT_TOKEN}" -field=role_id "auth/approle/role/${ROLE_NAME}/role-id")"
SECRET_ID="$(vault write -address="${VAULT_ADDR}" -token="${VAULT_TOKEN}" -field=secret_id -f "auth/approle/role/${ROLE_NAME}/secret-id")"

cat > "${OUT_JSON}" <<JSON
{
  "roleName": "${ROLE_NAME}",
  "policyName": "${POLICY_NAME}",
  "vaultAddr": "${VAULT_ADDR}",
  "vaultAuthPath": "auth/approle/login",
  "vaultRoleId": "${ROLE_ID}",
  "vaultSecretId": "${SECRET_ID}",
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON

echo "bootstrap_written=${OUT_JSON}"
