#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${L3_ENV_FILE:-$ROOT_DIR/infra/opstack/.env.l3}"
ENV_EXAMPLE="$ROOT_DIR/infra/opstack/.env.l3.example"
SECRETS_FILE="${L3_SECRETS_FILE:-$ROOT_DIR/infra/opstack/.env.secrets}"
DERIVED_ENV="$ROOT_DIR/infra/opstack/.env.l3.generated"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy from $ENV_EXAMPLE and edit values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

read_json_field() {
  local file="$1"
  local key="$2"
  python3 - <<'PY' "$file" "$key"
import json, sys
path = sys.argv[1]
key = sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
for part in key.split("."):
    if isinstance(data, dict) and part in data:
        data = data[part]
    else:
        data = None
        break
print("" if data is None else data)
PY
}

upsert_env_kv() {
  local file="$1"
  local key="$2"
  local value="$3"

  if rg -n "^${key}=" "$file" >/dev/null 2>&1; then
    python3 - <<'PY' "$file" "$key" "$value"
import io, os, sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
out = []
with open(path, "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith(key + "="):
            out.append(f"{key}={value}\n")
        else:
            out.append(line)
with open(path, "w", encoding="utf-8") as f:
    f.writelines(out)
PY
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$file"
  fi
}

L3_NAME="${L3_NAME:-ghostl3}"
L3_ROLLUP_JSON="${L3_ROLLUP_JSON:-$ROOT_DIR/infra/opstack/l3/${L3_NAME}/config/rollup.json}"
if [ -f "$L3_ROLLUP_JSON" ]; then
  rollup_batch_inbox="$(read_json_field "$L3_ROLLUP_JSON" "batch_inbox_address")"
  if [ -n "$rollup_batch_inbox" ] && [ "$rollup_batch_inbox" != "null" ]; then
    if [ -z "${BATCH_INBOX_ADDRESS:-}" ] || [ "${BATCH_INBOX_ADDRESS,,}" != "${rollup_batch_inbox,,}" ]; then
      # Keep a single source of truth: rollup.json. Update ENV_FILE so doctors/gates don't drift.
      upsert_env_kv "$ENV_FILE" "BATCH_INBOX_ADDRESS" "$rollup_batch_inbox"
      export BATCH_INBOX_ADDRESS="$rollup_batch_inbox"
      echo "OK: synced BATCH_INBOX_ADDRESS from rollup.json ($L3_ROLLUP_JSON)"
    fi
  fi
fi

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "$value" ]; then
    echo "Missing required env: $name" >&2
    exit 1
  fi
}

require_var L3_ENV
require_var L3_SECRETS_SOURCE
require_var L3_SECRETS_DIR
require_var PARENT_L2_RPC
require_var PARENT_L2_CHAIN_ID
require_var L3_CHAIN_ID
require_var L3_RPC
require_var L3_PORTAL_ADDRESS
require_var L3_SYSTEM_CONFIG_ADDRESS
require_var L3_DISPUTE_GAME_FACTORY_ADDRESS
require_var L3_GAME_FACTORY_ADDRESS
require_var BATCH_INBOX_ADDRESS
require_var OPSTACK_IMAGE_TAG

if [ "$L3_SECRETS_SOURCE" = "dev" ]; then
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
elif [ "$L3_SECRETS_SOURCE" = "vault" ]; then
  require_var VAULT_ADDR
  if [ -z "${VAULT_TOKEN:-}" ] && { [ -z "${VAULT_ROLE_ID:-}" ] || [ -z "${VAULT_SECRET_ID:-}" ]; }; then
    echo "Vault auth missing. Set VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID." >&2
    exit 1
  fi
  for f in sequencer.key batcher.key proposer.key challenger.key jwtsecret; do
    if [ ! -f "$L3_SECRETS_DIR/$f" ]; then
      echo "Missing Vault-rendered secret: $L3_SECRETS_DIR/$f" >&2
      exit 1
    fi
  done
else
  echo "Invalid L3_SECRETS_SOURCE=$L3_SECRETS_SOURCE (use dev or vault)" >&2
  exit 1
fi

if printf '%s\n' "$(cat "$ENV_FILE")" | rg -n "(changeme|change-me|example)" >/dev/null 2>&1; then
  echo "Weak default detected in env file. Refusing to continue." >&2
  exit 1
fi

cp "$ENV_FILE" "$DERIVED_ENV"
echo "OK: wrote $DERIVED_ENV"
