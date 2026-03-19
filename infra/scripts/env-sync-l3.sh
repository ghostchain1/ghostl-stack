#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${L3_ENV_FILE:-$ROOT_DIR/environments/devnet/ghostl3.env}"
ENV_EXAMPLE="${L3_ENV_EXAMPLE:-$ROOT_DIR/environments/devnet/ghostl3.env.example}"
DERIVED_ENV="${L3_DERIVED_ENV:-$ROOT_DIR/environments/devnet/ghostl3.env.generated}"

upsert_env_kv() {
  local file="$1"
  local key="$2"
  local value="$3"

  if rg -n "^${key}=" "$file" >/dev/null 2>&1; then
    python3 - <<'PY' "$file" "$key" "$value"
import sys
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
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "Missing canonical template: $ENV_EXAMPLE" >&2
  exit 1
fi

mkdir -p "$(dirname "$ENV_FILE")"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "OK: created $ENV_FILE from $ENV_EXAMPLE"
fi

upsert_env_kv "$ENV_FILE" CHAIN_NAME GhostL3
upsert_env_kv "$ENV_FILE" CHAIN_ID 903
upsert_env_kv "$ENV_FILE" SETTLEMENT_CHAIN_ID 901
upsert_env_kv "$ENV_FILE" RPC_PUBLIC_URL http://localhost:39545

cp "$ENV_FILE" "$DERIVED_ENV"
echo "OK: wrote $DERIVED_ENV"
