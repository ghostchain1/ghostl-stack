#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_docker_init

TAG="${OPSTACK_IMAGE_TAG:-devnet}"
OP_GETH_VERSION="${OP_GETH_VERSION:-v1.101511.1}"
OP_NODE_BASE_IMAGE="${OP_NODE_BASE_IMAGE:-us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:v1.10.0}"
OP_BATCHER_BASE_IMAGE="${OP_BATCHER_BASE_IMAGE:-us-docker.pkg.dev/oplabs-tools-artifacts/images/op-batcher:v1.10.0}"
OP_PROPOSER_BASE_IMAGE="${OP_PROPOSER_BASE_IMAGE:-us-docker.pkg.dev/oplabs-tools-artifacts/images/op-proposer:v1.10.0}"
OP_CHALLENGER_BASE_IMAGE="${OP_CHALLENGER_BASE_IMAGE:-us-docker.pkg.dev/oplabs-tools-artifacts/images/op-challenger:v1.10.0}"
BUILD_OP_CHALLENGER="${BUILD_OP_CHALLENGER:-0}"

echo "Enforcing GST-native leakage gates before image build..."
bash "${ROOT}/scripts/gst-leakage-gate.sh"
bash "${ROOT}/scripts/gst-symbol-gate.sh"

echo "Building local OP Stack images (op-geth, op-node, op-batcher, op-proposer, op-challenger) with tag '${TAG}'..."

echo "-> op-geth (base ${OP_GETH_VERSION})"
hg_docker build --build-arg OP_GETH_VERSION="${OP_GETH_VERSION}" -t "local/op-geth:${TAG}" "$OP_DIR/op-geth"
echo "-> op-node (base ${OP_NODE_BASE_IMAGE})"
hg_docker build --build-arg OP_NODE_BASE_IMAGE="${OP_NODE_BASE_IMAGE}" -t "local/op-node:${TAG}" "$OP_DIR/op-node"
echo "-> op-batcher (base ${OP_BATCHER_BASE_IMAGE})"
hg_docker build --build-arg OP_BATCHER_BASE_IMAGE="${OP_BATCHER_BASE_IMAGE}" -t "local/op-batcher:${TAG}" "$OP_DIR/op-batcher"
echo "-> op-proposer (base ${OP_PROPOSER_BASE_IMAGE})"
hg_docker build --build-arg OP_PROPOSER_BASE_IMAGE="${OP_PROPOSER_BASE_IMAGE}" -t "local/op-proposer:${TAG}" "$OP_DIR/op-proposer"
if [ "$BUILD_OP_CHALLENGER" = "1" ]; then
  echo "-> op-challenger (base ${OP_CHALLENGER_BASE_IMAGE})"
  hg_docker build --build-arg OP_CHALLENGER_BASE_IMAGE="${OP_CHALLENGER_BASE_IMAGE}" -t "local/op-challenger:${TAG}" "$OP_DIR/op-challenger"
else
  echo "-> op-challenger skipped (set BUILD_OP_CHALLENGER=1 to build it)"
fi

echo "Images ready:"
hg_docker images | grep "local/op-" | awk '{printf("  %s:%s\n", $1, $2)}'
