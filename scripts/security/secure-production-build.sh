#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

MODE="${MODE:-production}"
SECRETS="${SECRETS:-vault}"
EXECUTE=0
ALLOW_FINALITY_FALLBACK=0
SKIP_LINT=0
SKIP_BUILD=0
SKIP_FOUNDRY=0

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

has_vault_auth() {
  local addr="${VAULT_ADDR:-}"
  local token="${VAULT_TOKEN:-}"
  local role_id="${VAULT_ROLE_ID:-}"
  local secret_id="${VAULT_SECRET_ID:-}"

  local token_file=""
  token_file="$(first_readable_file "${VAULT_TOKEN_FILE:-}" "$HOME/.vault-token")" || true

  local role_file=""
  role_file="$(first_readable_file "${VAULT_ROLE_ID_FILE:-}")" || true
  local secret_file=""
  secret_file="$(first_readable_file "${VAULT_SECRET_ID_FILE:-}")" || true

  [ -n "$addr" ] || return 1
  if [ -n "$token" ] || [ -n "$token_file" ]; then
    return 0
  fi
  if { [ -n "$role_id" ] || [ -n "$role_file" ]; } && { [ -n "$secret_id" ] || [ -n "$secret_file" ]; }; then
    return 0
  fi
  return 1
}

usage() {
  cat <<'USAGE'
Usage: secure-production-build.sh [options]

Hardened production build gate for GhostL stack.
Defaults to dry-run mode for safety.

Options:
  --mode=dev|staging|production   Configure mode (default: production)
  --secrets=dev|vault             Secrets source (default: vault)
  --execute                       Execute configure-build-ready (non-dry-run)
  --allow-finality-fallback       Pass through fallback flag to configure script
  --skip-lint                     Skip monorepo lint
  --skip-build                    Skip monorepo app build
  --skip-foundry                  Skip cascading finality Foundry suite
  -h, --help                      Show help

Examples:
  bash scripts/security/secure-production-build.sh
  bash scripts/security/secure-production-build.sh --execute
  bash scripts/security/secure-production-build.sh --mode=staging --secrets=vault --execute
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --mode=*) MODE="${arg#*=}" ;;
    --secrets=*) SECRETS="${arg#*=}" ;;
    --execute) EXECUTE=1 ;;
    --allow-finality-fallback) ALLOW_FINALITY_FALLBACK=1 ;;
    --skip-lint) SKIP_LINT=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-foundry) SKIP_FOUNDRY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage; exit 1 ;;
  esac
done

case "$MODE" in
  dev|staging|production) ;;
  *) echo "Invalid mode: $MODE" >&2; exit 1 ;;
esac

case "$SECRETS" in
  dev|vault) ;;
  *) echo "Invalid secrets source: $SECRETS" >&2; exit 1 ;;
esac

echo "[secure-build] node version gate"
npm run node:check

if [ "$SECRETS" = "vault" ] && ! has_vault_auth; then
  echo "[secure-build] ERROR: Vault credentials are required for --secrets=vault." >&2
  echo "[secure-build] Set VAULT_ADDR plus VAULT_TOKEN (or AppRole VAULT_ROLE_ID + VAULT_SECRET_ID)." >&2
  echo "[secure-build] Optional files: VAULT_TOKEN_FILE, VAULT_ROLE_ID_FILE, VAULT_SECRET_ID_FILE." >&2
  echo "[secure-build] For non-production local rehearsal, use: --mode=dev --secrets=dev" >&2
  exit 2
fi

echo "[secure-build] canonical namespace + branding preflight"
bash scripts/preflight.sh
bash ops/scripts/check-no-eth-rpc.sh

echo "[secure-build] deprecations gate"
npm run deprecations:check

if [ "$SKIP_LINT" -eq 0 ]; then
  echo "[secure-build] lint gate"
  npm run lint
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "[secure-build] monorepo build gate"
  npm run build
fi

if [ "$SKIP_FOUNDRY" -eq 0 ]; then
  echo "[secure-build] cascading finality suite gate"
  npm --prefix contracts run test:cascading-finality:ci
fi

CONFIG_ARGS=(
  "--mode=${MODE}"
  "--secrets=${SECRETS}"
)

if [ "$ALLOW_FINALITY_FALLBACK" -eq 1 ]; then
  CONFIG_ARGS+=("--allow-finality-fallback")
fi

if [ "$EXECUTE" -eq 0 ]; then
  echo "[secure-build] configure-build-ready (dry-run safety mode)"
  CONFIG_ARGS+=("--dry-run")
else
  echo "[secure-build] configure-build-ready (execute mode)"
fi

bash infra/scripts/production/configure-build-ready.sh "${CONFIG_ARGS[@]}"

echo "[secure-build] completed successfully"
