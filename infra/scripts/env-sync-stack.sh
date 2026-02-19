#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
STACK_ENV_FILE="${STACK_ENV_FILE:-$ROOT_DIR/services/stack.env}"
STACK_ENV_EXAMPLE="${STACK_ENV_EXAMPLE:-$ROOT_DIR/services/stack.env.example}"
STACK_ENV_CREATE_IF_MISSING="${STACK_ENV_CREATE_IF_MISSING:-1}"
STACK_ENV_REQUIRED="${STACK_ENV_REQUIRED:-1}"

if [ ! -f "$STACK_ENV_EXAMPLE" ]; then
  echo "Missing canonical template: $STACK_ENV_EXAMPLE" >&2
  exit 1
fi

if [ ! -f "$STACK_ENV_FILE" ]; then
  if [ "$STACK_ENV_CREATE_IF_MISSING" = "1" ]; then
    cp "$STACK_ENV_EXAMPLE" "$STACK_ENV_FILE"
    echo "OK: created $STACK_ENV_FILE from $STACK_ENV_EXAMPLE"
  elif [ "$STACK_ENV_REQUIRED" = "1" ]; then
    echo "Missing $STACK_ENV_FILE (run infra/scripts/env-sync-stack.sh or copy from $STACK_ENV_EXAMPLE)" >&2
    exit 1
  else
    echo "WARN: $STACK_ENV_FILE not found; skipping stack env sync." >&2
    exit 0
  fi
fi

read_env_value() {
  local file="$1"
  local key="$2"
  python3 - <<'PY' "$file" "$key"
import sys
path, key = sys.argv[1], sys.argv[2]
value = ""
with open(path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if not line or line.startswith("#"):
            continue
        if line.startswith(key + "="):
            value = line.split("=", 1)[1]
            break
print(value)
PY
}

upsert_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  python3 - <<'PY' "$file" "$key" "$value"
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]

lines = path.read_text(encoding="utf-8").splitlines()
updated = False
for idx, line in enumerate(lines):
    if line.startswith(key + "="):
        lines[idx] = f"{key}={value}"
        updated = True
        break
if not updated:
    lines.append(f"{key}={value}")

path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

equals_ignore_case() {
  local left="$1"
  local right="$2"
  [ "${left,,}" = "${right,,}" ]
}

changed=0
for key in L1_TOKEN_ADDRESS L2_TOKEN_ADDRESS L3_TOKEN_ADDRESS; do
  expected="$(read_env_value "$STACK_ENV_EXAMPLE" "$key")"
  if [ -z "$expected" ]; then
    echo "Missing $key in canonical template: $STACK_ENV_EXAMPLE" >&2
    exit 1
  fi
  current="$(read_env_value "$STACK_ENV_FILE" "$key")"
  if [ -z "$current" ] || ! equals_ignore_case "$current" "$expected"; then
    upsert_env_value "$STACK_ENV_FILE" "$key" "$expected"
    echo "OK: enforced $key=$expected in $STACK_ENV_FILE"
    changed=1
  fi
done

if [ "$changed" = "0" ]; then
  echo "OK: stack env token addresses already canonical ($STACK_ENV_FILE)"
fi
