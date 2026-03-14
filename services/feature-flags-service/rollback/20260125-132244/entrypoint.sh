#!/bin/bash
set -euo pipefail

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

if [ "$#" -eq 0 ]; then
  echo "No command provided" >&2
  exit 1
fi

exec "$@"
