#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage:
  launch-system/build-release.sh [--release-id <id>]

Creates a release directory under:
  releases/<release-id>/

This is the DEVNET-only step. TESTNET/MAINNET must deploy only from
the sealed release artifacts.
USAGE
}

RELEASE_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --release-id)
      RELEASE_ID="${2:-}"; shift 2;;
    -h|--help)
      usage; exit 0;;
    *)
      die "unknown_arg:$1";;
  esac
done

require_cmd git
require_cmd python3
require_cmd mkdir
require_cmd cp
require_cmd date

"${SCRIPT_DIR}/validate-release.sh"

ROOT="$(repo_root)"
GIT_COMMIT="$(git -C "${ROOT}" rev-parse --short HEAD)"

if [ -z "${RELEASE_ID}" ]; then
  RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)-${GIT_COMMIT}"
fi

REL_DIR="${ROOT}/releases/${RELEASE_ID}"
if [ -e "${REL_DIR}" ]; then
  die "release_dir_exists:${REL_DIR}"
fi

log "build: creating ${REL_DIR}"
mkdir -p "${REL_DIR}/attestations" "${REL_DIR}/scripts" "${REL_DIR}/governance/attestations"

GENESIS_SRC="${ROOT}/infra/ghostchain/geth/genesis.json"
COMPOSE_L1_SRC="${ROOT}/infra/ghostchain/docker-compose.l1.yml"
ENV_L1_SRC="${ROOT}/infra/ghostchain/.env.l1"

cp -a "${GENESIS_SRC}" "${REL_DIR}/genesis.l1.json"
cp -a "${COMPOSE_L1_SRC}" "${REL_DIR}/docker-compose.testnet.yml"
cp -a "${COMPOSE_L1_SRC}" "${REL_DIR}/docker-compose.mainnet.yml"

cp -a "${ENV_L1_SRC}" "${REL_DIR}/env.testnet"
printf '\nHYPERGHOST_ENV=testnet\n' >> "${REL_DIR}/env.testnet"

cp -a "${ENV_L1_SRC}" "${REL_DIR}/env.mainnet"
printf '\nHYPERGHOST_ENV=mainnet\n' >> "${REL_DIR}/env.mainnet"

L1_CHAIN_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8"))["config"]["chainId"])' "${REL_DIR}/genesis.l1.json")"

cat > "${REL_DIR}/rollup.l2.json" <<JSON
{
  \"note\": \"placeholder (generate from opstack tooling)\",
  \"environment\": \"testnet/mainnet\",
  \"chain_id\": 901,
  \"l1_chain_id\": ${L1_CHAIN_ID}
}
JSON

cat > "${REL_DIR}/rollup.l3.json" <<JSON
{
  \"note\": \"placeholder (generate from opstack tooling)\",
  \"environment\": \"testnet/mainnet\",
  \"chain_id\": 903,
  \"l1_chain_id\": ${L1_CHAIN_ID}
}
JSON

cat > "${REL_DIR}/images.lock" <<'LOCK'
{
  "note": "Populate with docker image digests or immutable image IDs during sealing.",
  "services": []
}
LOCK

cat > "${REL_DIR}/manifest.json" <<JSON
{
  "release_id": "${RELEASE_ID}",
  "git_commit": "${GIT_COMMIT}",
  "created_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "unsealed"
}
JSON

cat > "${REL_DIR}/attestations/build-attestation.txt" <<TXT
release_id=${RELEASE_ID}
git_commit=${GIT_COMMIT}
created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
builder_host=$(hostname)
TXT

log "build: created ${REL_DIR}"
log "build: next: launch-system/seal-release.sh --release-id ${RELEASE_ID}"
