#!/bin/bash
set -euo pipefail

# Wait for optional upstream dependencies before starting.
if [ -n "${DEPENDENCY_HOSTS:-}" ]; then
  echo "[ghostcontract-ai] Waiting for dependencies..."
  timeout_sec=${DEPENDENCY_TIMEOUT_SEC:-120}
  interval_sec=${DEPENDENCY_INTERVAL_SEC:-5}
  deadline=$((SECONDS + timeout_sec))
  for dep in $DEPENDENCY_HOSTS; do
    host=${dep%%:*}
    port=${dep##*:}
    if [ -z "$host" ] || [ -z "$port" ] || [ "$host" = "$port" ]; then
      continue
    fi
    while true; do
      if (echo >/dev/tcp/$host/$port) >/dev/null 2>&1; then
        echo "[ghostcontract-ai] $dep ready"
        break
      fi
      if [ $SECONDS -ge $deadline ]; then
        echo "[ghostcontract-ai] Dependency $dep not ready after ${timeout_sec}s" >&2
        exit 1
      fi
      sleep $interval_sec
    done
  done
fi

NODE_CMD=()

resolve_node_cmd() {
  local candidate
  for candidate in dist/index.js dist/server.js index.mjs src/index.ts; do
    if [ -f "$candidate" ]; then
      NODE_CMD=(node "$candidate")
      return 0
    fi
    if [ -f "/app/$candidate" ]; then
      NODE_CMD=(node "/app/$candidate")
      return 0
    fi
  done
  # TypeScript fallback (for dev mode with ts-node)
  if [ -f src/index.ts ] && [ -d node_modules/ts-node ]; then
    NODE_CMD=(node --loader ts-node/esm --no-warnings src/index.ts)
    return 0
  fi
  if [ -f /app/src/index.ts ] && [ -d /app/node_modules/ts-node ]; then
    NODE_CMD=(node --loader ts-node/esm --no-warnings /app/src/index.ts)
    return 0
  fi
  return 1
}

if [ "$#" -eq 0 ]; then
  if [ -n "${DEFAULT_CMD:-}" ]; then
    set -- ${DEFAULT_CMD}
  elif command -v node >/dev/null 2>&1 && resolve_node_cmd; then
    set -- "${NODE_CMD[@]}"
  else
    echo "[ghostcontract-ai] No command resolved" >&2
    exit 1
  fi
fi

echo "[ghostcontract-ai] Starting: $*"
exec "$@"
