#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

TAG="${OPSTACK_IMAGE_TAG:-devnet}"

echo "Building local OP Stack images (op-geth, op-node, op-batcher, op-proposer) with tag '${TAG}'..."

echo "-> op-geth"
docker build -t "local/op-geth:${TAG}" "$OP_DIR/op-geth"

DOCKERFILE="$OP_DIR/optimism/ops/docker/op-stack-go/Dockerfile"
CONTEXT="$OP_DIR/optimism"

build_target() {
  local target="$1"
  local tag="$2"
  echo "-> $tag (target: $target)"
  docker build -f "$DOCKERFILE" --target "$target" -t "$tag" "$CONTEXT"
}

build_target op-node-target "local/op-node:${TAG}"
build_target op-batcher-target "local/op-batcher:${TAG}"
build_target op-proposer-target "local/op-proposer:${TAG}"

echo "Images ready:"
docker images | grep "local/op-" | awk '{printf("  %s:%s\n", $1, $2)}'
