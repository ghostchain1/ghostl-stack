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
  "${ROOT}/infra/ghostchain/docker-compose.l1.yml"
  "${ROOT}/infra/ghostchain/.env.l1"
)

for p in "${required_paths[@]}"; do
  [ -f "${p}" ] || die "missing_required_file:${p}"
done

log "validate: repo_root=${ROOT}"
log "validate: ok"

