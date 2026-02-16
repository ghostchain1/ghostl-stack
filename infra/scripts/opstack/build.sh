#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_docker_init

TAG="${OPSTACK_IMAGE_TAG:-devnet}"

echo "Enforcing GST-native leakage gates before image build..."
bash "${ROOT}/scripts/gst-leakage-gate.sh"
bash "${ROOT}/scripts/gst-symbol-gate.sh"

echo "Building local OP Stack images (op-geth, op-node, op-batcher, op-proposer, op-challenger) with tag '${TAG}'..."

echo "-> op-geth"
hg_docker build -t "local/op-geth:${TAG}" "$OP_DIR/op-geth"

CONTEXT="$OP_DIR/optimism-upstream"
DOCKERFILE="$CONTEXT/ops/docker/op-stack-go/Dockerfile"

[ -f "$DOCKERFILE" ] || { echo "missing_dockerfile:${DOCKERFILE}" >&2; exit 1; }
[ -d "$CONTEXT" ] || { echo "missing_build_context:${CONTEXT}" >&2; exit 1; }

build_target() {
  local target="$1"
  local tag="$2"
  echo "-> $tag (target: $target)"
  hg_docker build -f "$DOCKERFILE" --target "$target" -t "$tag" "$CONTEXT"
}

build_target op-node-target "local/op-node:${TAG}"
build_target op-batcher-target "local/op-batcher:${TAG}"
build_target op-proposer-target "local/op-proposer:${TAG}"
build_target op-challenger-target "local/op-challenger:${TAG}"

echo "Images ready:"
hg_docker images | grep "local/op-" | awk '{printf("  %s:%s\n", $1, $2)}'
