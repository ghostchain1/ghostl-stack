#!/bin/bash
set -euo pipefail

# Prefer docker-network RPC endpoints when explicitly provided.
# This avoids the `host.docker.internal -> published port -> NAT -> container` loop,
# which can cause confusing mismatches for contract code visibility.
if [ -n "${RPC_L1_DOCKER:-}" ]; then export RPC_L1="${RPC_L1_DOCKER}"; fi
if [ -n "${RPC_L2_DOCKER:-}" ]; then export RPC_L2="${RPC_L2_DOCKER}"; fi
if [ -n "${RPC_L3_DOCKER:-}" ]; then export RPC_L3="${RPC_L3_DOCKER}"; fi

if [ -n "${DEPENDENCY_HOSTS:-}" ]; then
  echo "Waiting for dependencies..."
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
        break
      fi
      if [ $SECONDS -ge $deadline ]; then
        echo "Dependency $dep not ready after ${timeout_sec}s" >&2
        exit 1
      fi
      sleep $interval_sec
    done
  done
fi

NODE_CMD=()

resolve_node_cmd() {
  local candidate
  for candidate in dist/server.js dist/worker.js dist/index.js index.mjs index.js src/index.js; do
    if [ -f "$candidate" ]; then
      NODE_CMD=(node "$candidate")
      return 0
    fi
    if [ -f "/app/$candidate" ]; then
      NODE_CMD=(node "/app/$candidate")
      return 0
    fi
  done

  if [ -f src/index.ts ] && [ -d node_modules/ts-node ]; then
    NODE_CMD=(node --loader ts-node/esm --no-warnings --experimental-specifier-resolution=node src/index.ts)
    return 0
  fi
  if [ -f /app/src/index.ts ] && [ -d /app/node_modules/ts-node ]; then
    NODE_CMD=(node --loader ts-node/esm --no-warnings --experimental-specifier-resolution=node /app/src/index.ts)
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
    echo "No command provided" >&2
    exit 1
  fi
fi

if [ "${1#-}" != "$1" ] && command -v socat >/dev/null 2>&1; then
  set -- socat "$@"
fi

exec "$@"
