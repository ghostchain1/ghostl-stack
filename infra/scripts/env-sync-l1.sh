#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${L1_ENV_FILE:-$ROOT_DIR/infra/ghostchain/.env.l1}"
ENV_EXAMPLE="$ROOT_DIR/infra/ghostchain/.env.l1.example"
DERIVED_ENV="$ROOT_DIR/infra/ghostchain/.env"

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

require_var L1_ENV
require_var L1_GETH_IMAGE
require_var L1_CHAIN_ID
require_var L1_BOOTNODE_IP
require_var L1_BOOTNODE_PORT
require_var L1_RPC_HTTP_PORT
require_var L1_RPC_WS_PORT
require_var L1_RPC_AUTH_PORT
require_var L1_P2P_PORT
require_var L1_METRICS_PORT
require_var L1_SECRETS_SOURCE
require_var L1_SECRETS_DIR

HOST_UID="${L1_UID:-$(id -u)}"
HOST_GID="${L1_GID:-$(id -g)}"

if [ "$L1_SECRETS_SOURCE" = "dev" ]; then
  if [ "${ALLOW_DEV_SECRETS:-0}" != "1" ]; then
    echo "Dev secrets are blocked. Set ALLOW_DEV_SECRETS=1 for local-only use." >&2
    exit 1
  fi
elif [ "$L1_SECRETS_SOURCE" = "vault" ]; then
  require_var VAULT_ADDR
  if [ -z "${VAULT_TOKEN:-}" ] && { [ -z "${VAULT_ROLE_ID:-}" ] || [ -z "${VAULT_SECRET_ID:-}" ]; }; then
    echo "Vault auth missing. Set VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID." >&2
    exit 1
  fi
else
  echo "Invalid L1_SECRETS_SOURCE=$L1_SECRETS_SOURCE (use dev or vault)" >&2
  exit 1
fi

if printf '%s\n' \
  "${L1_GETH_IMAGE:-}" \
  "${VAULT_ADDR:-}" \
  "${VAULT_TOKEN:-}" \
  "${VAULT_ROLE_ID:-}" \
  "${VAULT_SECRET_ID:-}" \
  | rg -n "(changeme|change-me|example|ghostpass)" >/dev/null 2>&1; then
  echo "Weak default detected in env file. Refusing to continue." >&2
  exit 1
fi

if [ "$L1_SECRETS_SOURCE" = "vault" ]; then
  for f in boot.key node1.key node2.key jwtsecret; do
    if [ ! -f "$L1_SECRETS_DIR/$f" ]; then
      echo "Missing Vault-rendered secret: $L1_SECRETS_DIR/$f" >&2
      echo "Run infra/vault/render-l1-secrets.sh to materialize secrets." >&2
      exit 1
    fi
  done
fi

cat >"$DERIVED_ENV" <<EOF
L1_UID=$HOST_UID
L1_GID=$HOST_GID
GETH_IMAGE=$L1_GETH_IMAGE
CHAIN_ID=$L1_CHAIN_ID
BOOTNODE_IP=$L1_BOOTNODE_IP
BOOTNODE_PORT=$L1_BOOTNODE_PORT
L1_RPC_HTTP_PORT=$L1_RPC_HTTP_PORT
L1_RPC_WS_PORT=$L1_RPC_WS_PORT
L1_RPC_AUTH_PORT=$L1_RPC_AUTH_PORT
L1_P2P_PORT=$L1_P2P_PORT
L1_METRICS_PORT=$L1_METRICS_PORT
L1_GHOSTCHAIN_SUBNET=${L1_GHOSTCHAIN_SUBNET:-172.28.0.0/16}
L1_GHOSTCHAIN_BOOTNODE_IP=${L1_GHOSTCHAIN_BOOTNODE_IP:-$L1_BOOTNODE_IP}
L1_GHOSTCHAIN_NODE1_IP=${L1_GHOSTCHAIN_NODE1_IP:-172.28.0.22}
L1_GHOSTCHAIN_NODE2_IP=${L1_GHOSTCHAIN_NODE2_IP:-172.28.0.23}
L1_GHOSTCHAIN_RPC_PROXY_IP=${L1_GHOSTCHAIN_RPC_PROXY_IP:-172.28.0.30}
L1_GHOSTCHAIN_GHOSTSCOUT_IP=${L1_GHOSTCHAIN_GHOSTSCOUT_IP:-172.28.0.31}
AUTH_JWT_FILE=${L1_AUTH_JWT_FILE:-/secrets/jwtsecret}
L1_HTTP_APIS=${L1_HTTP_APIS:-eth,net,web3,debug,txpool}
L1_WS_APIS=${L1_WS_APIS:-eth,net,web3}
L1_HTTP_VHOSTS=${L1_HTTP_VHOSTS:-localhost,127.0.0.1}
L1_HTTP_CORS=${L1_HTTP_CORS:-http://localhost,http://127.0.0.1}
L1_WS_ORIGINS=${L1_WS_ORIGINS:-http://localhost,http://127.0.0.1}
L1_AUTHRPC_VHOSTS=${L1_AUTHRPC_VHOSTS:-localhost,127.0.0.1}
L1_RPC_AUTH_TOKEN=${L1_RPC_AUTH_TOKEN:-}
L1_RPC_REQUIRE_AUTH=${L1_RPC_REQUIRE_AUTH:-0}
L1_RPC_SENSITIVE_METHODS=${L1_RPC_SENSITIVE_METHODS:-personal_,debug_,txpool_,admin_}
L1_RPC_RATE_LIMIT_PER_MINUTE=${L1_RPC_RATE_LIMIT_PER_MINUTE:-120}
L1_RPC_RATE_LIMIT_BURST=${L1_RPC_RATE_LIMIT_BURST:-40}
L1_RPC_RATE_WINDOW_MS=${L1_RPC_RATE_WINDOW_MS:-60000}
L1_RPC_RATE_LIMIT_ALLOWLIST=${L1_RPC_RATE_LIMIT_ALLOWLIST:-127.0.0.1,::1,172.28.0.1}
L1_RPC_PROXY_LOG_REQUESTS=${L1_RPC_PROXY_LOG_REQUESTS:-0}
L1_RPC_CORS_ORIGINS=${L1_RPC_CORS_ORIGINS:-http://localhost,http://127.0.0.1}
EOF

echo "OK: wrote $DERIVED_ENV"
