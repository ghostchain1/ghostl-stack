#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

require_cmd git
require_cmd python3
require_cmd sha256sum
require_cmd tar

ROOT="$(repo_root)"

required_paths=(
  "${ROOT}/infra/ghostchain/geth/genesis.json"
  "${ROOT}/infra/ghostchain/geth/run-node.sh"
  "${ROOT}/infra/ghostchain/docker-compose.l1.yml"
  "${ROOT}/infra/ghostchain/.env"

  # OP Stack (L2 + L3)
  "${ROOT}/infra/opstack/docker-compose.yml"
  "${ROOT}/infra/opstack/docker-compose.l3.yml"
  "${ROOT}/infra/opstack/docker-compose.challengers.yml"
  "${ROOT}/infra/opstack/config/rollup.json"
  "${ROOT}/infra/opstack/config/genesis-l2.json"
  "${ROOT}/infra/opstack/config/l1-chain.json"
  "${ROOT}/infra/opstack/l3/ghostl3/config/rollup.json"
  "${ROOT}/infra/opstack/l3/ghostl3/config/genesis.json"
  "${ROOT}/infra/opstack/l3/ghostl3/config/l1-chain.json"
  "${ROOT}/infra/opstack/op-geth/Dockerfile"
  "${ROOT}/infra/opstack/optimism-upstream/go.mod"
  "${ROOT}/infra/opstack/optimism-upstream/third_party/archiver/go.mod"
  "${ROOT}/infra/opstack/optimism-upstream/ops/docker/op-stack-go/Dockerfile"
  "${ROOT}/infra/opstack/optimism-upstream/ops/docker/op-stack-go/Dockerfile.dockerignore"

  # Services (Phase 3 hardened container topology)
  "${ROOT}/docker-compose.phase3.yml"
  "${ROOT}/docker-compose.phase3.secrets.yml"
  "${ROOT}/infra/docker/ghost-mapper/mappings.phase3.hostports.json"
)

for p in "${required_paths[@]}"; do
  [ -f "${p}" ] || die "missing_required_file:${p}"
done

log "validate: repo_root=${ROOT}"
log "validate: ok"
