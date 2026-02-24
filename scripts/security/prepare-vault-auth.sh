#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_ENV_FILE="$ROOT_DIR/ops/security/vault-auth.env"

ENV_FILE="${VAULT_ENV_FILE:-$DEFAULT_ENV_FILE}"
WRITE_EXAMPLE=0

usage() {
  cat <<'USAGE'
Usage: prepare-vault-auth.sh [options]

Validates and prepares Vault auth inputs required by production preflight.

Options:
  --env-file <path>      Path to Vault auth env file (default: ops/security/vault-auth.env)
  --write-example        Write a non-secret template file if it does not exist
  -h, --help             Show help

Accepted auth modes:
  1) Token mode:
     - VAULT_ADDR + (VAULT_TOKEN or VAULT_TOKEN_FILE)
  2) AppRole mode:
     - VAULT_ADDR + (VAULT_ROLE_ID or VAULT_ROLE_ID_FILE) + (VAULT_SECRET_ID or VAULT_SECRET_ID_FILE)

Examples:
  bash scripts/security/prepare-vault-auth.sh --write-example
  VAULT_ENV_FILE=ops/security/vault-auth.env bash scripts/security/prepare-vault-auth.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --write-example)
      WRITE_EXAMPLE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

first_readable_file() {
  for p in "$@"; do
    [ -n "${p:-}" ] || continue
    if [ -f "$p" ] && [ -r "$p" ]; then
      printf '%s' "$p"
      return 0
    fi
  done
  return 1
}

if [ "$WRITE_EXAMPLE" -eq 1 ] && [ ! -f "$ENV_FILE" ]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  cat >"$ENV_FILE" <<'EOF'
# Vault auth for production preflight/build
# Fill either token mode OR AppRole mode.

VAULT_ADDR=

# Token mode
VAULT_TOKEN=
# VAULT_TOKEN_FILE=/absolute/path/to/token-file

# AppRole mode
VAULT_ROLE_ID=
VAULT_SECRET_ID=
# VAULT_ROLE_ID_FILE=/absolute/path/to/role-id-file
# VAULT_SECRET_ID_FILE=/absolute/path/to/secret-id-file
EOF
  echo "[vault-auth] wrote template: $ENV_FILE"
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  export VAULT_ENV_FILE="$ENV_FILE"
  echo "[vault-auth] loaded env file: $ENV_FILE"
else
  echo "[vault-auth] env file not found: $ENV_FILE"
fi

addr="${VAULT_ADDR:-}"
token="${VAULT_TOKEN:-}"
role_id="${VAULT_ROLE_ID:-}"
secret_id="${VAULT_SECRET_ID:-}"

token_file="$(first_readable_file "${VAULT_TOKEN_FILE:-}" "$HOME/.vault-token" || true)"
role_file="$(first_readable_file "${VAULT_ROLE_ID_FILE:-}" || true)"
secret_file="$(first_readable_file "${VAULT_SECRET_ID_FILE:-}" || true)"

if [ -z "$addr" ]; then
  echo "[vault-auth] ERROR: VAULT_ADDR is required" >&2
  exit 2
fi

if [ -n "$token" ] || [ -n "$token_file" ]; then
  echo "[vault-auth] auth mode: token"
  echo "[vault-auth] VAULT_ADDR is set"
  if [ -n "$token_file" ]; then
    echo "[vault-auth] token file detected: $token_file"
  else
    echo "[vault-auth] VAULT_TOKEN is set"
  fi
  exit 0
fi

if { [ -n "$role_id" ] || [ -n "$role_file" ]; } && { [ -n "$secret_id" ] || [ -n "$secret_file" ]; }; then
  echo "[vault-auth] auth mode: approle"
  echo "[vault-auth] VAULT_ADDR is set"
  if [ -n "$role_file" ]; then
    echo "[vault-auth] role_id file detected: $role_file"
  else
    echo "[vault-auth] VAULT_ROLE_ID is set"
  fi
  if [ -n "$secret_file" ]; then
    echo "[vault-auth] secret_id file detected: $secret_file"
  else
    echo "[vault-auth] VAULT_SECRET_ID is set"
  fi
  exit 0
fi

echo "[vault-auth] ERROR: no valid Vault auth found" >&2
echo "[vault-auth] required: VAULT_ADDR + (VAULT_TOKEN or VAULT_TOKEN_FILE)" >&2
echo "[vault-auth]    or : VAULT_ADDR + (VAULT_ROLE_ID or VAULT_ROLE_ID_FILE) + (VAULT_SECRET_ID or VAULT_SECRET_ID_FILE)" >&2
exit 2
