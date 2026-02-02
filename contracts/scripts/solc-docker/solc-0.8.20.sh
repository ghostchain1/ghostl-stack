#!/usr/bin/env bash
set -euo pipefail

VERSION="0.8.20"
IMAGE="ethereum/solc:${VERSION}"

exec docker run --rm -i "$IMAGE" "$@"
