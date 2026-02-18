#!/usr/bin/env bash
set -euo pipefail

if [ -n "${NODE_OPTIONS:-}" ]; then
  export NODE_OPTIONS
fi

exec "$@"

