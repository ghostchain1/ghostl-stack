#!/usr/bin/env bash
set -euo pipefail

IMAGE="${SOLC_IMAGE:-ghcr.io/argotorg/solc@sha256:e56ef5e376ae846f06b919d7ca4ed0c271f7fb0900daa6c660d53451f5bfd9db}"

exec docker run --rm -i "$IMAGE" "$@"
