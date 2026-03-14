#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${L2_ENV_FILE:-$ROOT_DIR/infra/opstack/.env.l2}"
ENV_EXAMPLE="$ROOT_DIR/infra/opstack/.env.l2.example"
SECRETS_FILE="${L2_SECRETS_FILE:-$ROOT_DIR/infra/opstack/.env.secrets}"
DERIVED_ENV="$ROOT_DIR/infra/opstack/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy from $ENV_EXAMPLE and edit values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "$value" ]; then
    echo "Missing required env: $name" >&2
    exit 1
  fi
}

require_var L2_ENV
require_var L2_SECRETS_SOURCE
require_var L2_SECRETS_DIR
require_var L1_CHAIN_ID
require_var L2_CHAIN_ID
require_var HOST_L1_RPC
require_var HOST_L2_RPC
require_var OPSTACK_IMAGE_TAG

if [ "$L2_SECRETS_SOURCE" = "dev" ]; then
  if [ "${ALLOW_DEV_SECRETS:-0}" != "1" ]; then
    echo "Dev secrets are blocked. Set ALLOW_DEV_SECRETS=1 for local-only use." >&2
    exit 1
  fi
  if [ ! -f "$SECRETS_FILE" ]; then
    echo "Missing $SECRETS_FILE. Copy from infra/opstack/.env.secrets.sample and edit values." >&2
    exit 1
  fi
  if printf '%s\n' "$(cat "$SECRETS_FILE")" | rg -n "(changeme|change-me|example|REPLACE_ME|0xaaaa|0xdddd|0xeeee)" >/dev/null 2>&1; then
    echo "Weak default detected in secrets file. Refusing to continue." >&2
    exit 1
  fi
elif [ "$L2_SECRETS_SOURCE" = "vault" ]; then
  require_var VAULT_ADDR
  if [ -z "${VAULT_TOKEN:-}" ] && { [ -z "${VAULT_ROLE_ID:-}" ] || [ -z "${VAULT_SECRET_ID:-}" ]; }; then
    echo "Vault auth missing. Set VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID." >&2
    exit 1
  fi
  for f in sequencer.key batcher.key proposer.key challenger.key jwtsecret; do
    if [ ! -f "$L2_SECRETS_DIR/$f" ]; then
      echo "Missing Vault-rendered secret: $L2_SECRETS_DIR/$f" >&2
      exit 1
    fi
  done
else
  echo "Invalid L2_SECRETS_SOURCE=$L2_SECRETS_SOURCE (use dev or vault)" >&2
  exit 1
fi

if printf '%s\n' "$(cat "$ENV_FILE")" | rg -n "(changeme|change-me|example|ghostpass)" >/dev/null 2>&1; then
  echo "Weak default detected in env file. Refusing to continue." >&2
  exit 1
fi

cp "$ENV_FILE" "$DERIVED_ENV"
echo "OK: wrote $DERIVED_ENV"
