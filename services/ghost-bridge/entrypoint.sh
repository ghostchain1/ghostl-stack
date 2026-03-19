#!/usr/bin/env bash
set -euo pipefail
exec node --loader ts-node/esm --no-warnings --experimental-specifier-resolution=node src/index.ts
