#!/usr/bin/env bash
set -euo pipefail

VERSION="0.8.24"
IMAGE="${SOLC_IMAGE:-ghostl/solc:${VERSION}}"

exec docker run --rm -i "$IMAGE" "$@"
