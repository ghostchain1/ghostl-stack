#!/usr/bin/env sh
set -eu

# Ports we want to keep free for host-level RPC publishes.
PORTS="28545 28546 29545"

echo "[net-mgr] starting; monitoring ports: $PORTS"

while true; do
  for port in $PORTS; do
    # Kill any lingering docker-proxy for this port.
    pids=$(pgrep -f "docker-proxy.*${port}") || true
    if [ -n "${pids:-}" ]; then
      for pid in $pids; do
        echo "[net-mgr] killing docker-proxy pid=$pid on port $port"
        kill -9 "$pid" 2>/dev/null || true
      done
    fi
  done
  sleep 5
done
