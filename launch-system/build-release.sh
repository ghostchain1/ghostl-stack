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
mkdir -p "${REL_DIR}/infra/ghostchain" "${REL_DIR}/infra/opstack" "${REL_DIR}/infra/docker"

GENESIS_SRC="${ROOT}/infra/ghostchain/geth/genesis.json"
L1_GETH_DIR="${ROOT}/infra/ghostchain/geth"
L1_COMPOSE_SRC="${ROOT}/infra/ghostchain/docker-compose.l1.yml"
ENV_L1_SRC="${ROOT}/infra/ghostchain/.env"

OPSTACK_COMPOSE_L2_SRC="${ROOT}/infra/opstack/docker-compose.yml"
OPSTACK_COMPOSE_L3_SRC="${ROOT}/infra/opstack/docker-compose.l3.yml"
OPSTACK_COMPOSE_CHALLENGERS_SRC="${ROOT}/infra/opstack/docker-compose.challengers.yml"
OPSTACK_CONFIG_DIR="${ROOT}/infra/opstack/config"
OPSTACK_L3_CONFIG_DIR="${ROOT}/infra/opstack/l3/ghostl3/config"

PHASE3_COMPOSE_SRC="${ROOT}/docker-compose.phase3.yml"
PHASE3_SECRETS_COMPOSE_SRC="${ROOT}/docker-compose.phase3.secrets.yml"
GHOST_MAPPER_CFG_DIR="${ROOT}/infra/docker/ghost-mapper"

cp -a "${GENESIS_SRC}" "${REL_DIR}/genesis.l1.json"
L1_CHAIN_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8"))["config"]["chainId"])' "${REL_DIR}/genesis.l1.json")"

# L1 (GhostChain)
mkdir -p "${REL_DIR}/infra/ghostchain"
cp -a "${L1_COMPOSE_SRC}" "${REL_DIR}/infra/ghostchain/docker-compose.l1.yml"
cp -a "${L1_GETH_DIR}" "${REL_DIR}/infra/ghostchain/geth"

# OP Stack (L2 + L3)
mkdir -p "${REL_DIR}/infra/opstack"
cp -a "${OPSTACK_COMPOSE_L2_SRC}" "${REL_DIR}/infra/opstack/docker-compose.yml"
cp -a "${OPSTACK_COMPOSE_L3_SRC}" "${REL_DIR}/infra/opstack/docker-compose.l3.yml"
cp -a "${OPSTACK_COMPOSE_CHALLENGERS_SRC}" "${REL_DIR}/infra/opstack/docker-compose.challengers.yml"
cp -a "${OPSTACK_CONFIG_DIR}" "${REL_DIR}/infra/opstack/config"
mkdir -p "${REL_DIR}/infra/opstack/l3/ghostl3"
cp -a "${OPSTACK_L3_CONFIG_DIR}" "${REL_DIR}/infra/opstack/l3/ghostl3/config"

# Do not copy ignored JWT secrets into the release bundle.
rm -f "${REL_DIR}/infra/opstack/config/jwt.txt" "${REL_DIR}/infra/opstack/l3/ghostl3/config/jwt.txt" 2>/dev/null || true

# Challenger assets (binaries are populated during sealing)
mkdir -p "${REL_DIR}/infra/opstack/optimism/op-program/bin" "${REL_DIR}/infra/opstack/optimism/cannon/bin"
cat > "${REL_DIR}/infra/opstack/optimism/README.md" <<'MD'
# Optimism Challenger Assets

This directory is populated during release sealing (DEVNET only) with minimal
challenger runtime binaries:

- op-program
- cannon
MD

# Services (Phase 3)
cp -a "${PHASE3_COMPOSE_SRC}" "${REL_DIR}/docker-compose.phase3.yml"
cp -a "${PHASE3_SECRETS_COMPOSE_SRC}" "${REL_DIR}/docker-compose.phase3.secrets.yml"
mkdir -p "${REL_DIR}/infra/docker"
cp -a "${GHOST_MAPPER_CFG_DIR}" "${REL_DIR}/infra/docker/ghost-mapper"

OVERLAY_TESTNET="${ROOT}/environments/testnet/ghostchain.env"
OVERLAY_MAINNET="${ROOT}/environments/mainnet/ghostchain.env"

render_env() {
  local overlay_env="$1"
  local out="$2"
  local env_name="$3"

  [ -f "${overlay_env}" ] || die "missing_overlay_env:${overlay_env}"

  # Derive chain IDs from the canonical rollup configs (tracked), not from local secret env files.
  local l2_rollup_src="${ROOT}/infra/opstack/config/rollup.json"
  local l3_rollup_src="${ROOT}/infra/opstack/l3/ghostl3/config/rollup.json"
  [ -f "${l2_rollup_src}" ] || die "missing_rollup_l2:${l2_rollup_src}"
  [ -f "${l3_rollup_src}" ] || die "missing_rollup_l3:${l3_rollup_src}"

  local l2_chain_id
  local l3_chain_id
  l2_chain_id="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1], "r", encoding="utf-8"))["l2_chain_id"]))' "${l2_rollup_src}")"
  l3_chain_id="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1], "r", encoding="utf-8"))["l2_chain_id"]))' "${l3_rollup_src}")"

  {
    cat "${ENV_L1_SRC}"
    printf '\n# --- base: %s ---\n' "${ROOT}/infra/opstack/.env.example"
    cat "${ROOT}/infra/opstack/.env.example"
    printf '\n# --- base: %s ---\n' "${ROOT}/infra/opstack/.env.l3.example"
    cat "${ROOT}/infra/opstack/.env.l3.example"
    printf '\n# --- overlay (%s): %s ---\n' "${env_name}" "${overlay_env}"
    cat "${overlay_env}"
    printf '\nHYPERGHOST_ENV=%s\n' "${env_name}"
    printf 'NET_ENV=%s\n' "${env_name}"
    printf 'STACK_ENV=%s\n' "${env_name}"
    printf 'OPSTACK_IMAGE_TAG=%s\n' "${RELEASE_ID}"
    printf 'L1_CHAIN_ID=%s\n' "${L1_CHAIN_ID}"
    printf 'L2_CHAIN_ID=%s\n' "${l2_chain_id}"
    printf 'L3_CHAIN_ID=%s\n' "${l3_chain_id}"
  } > "${out}"
}

render_env "${OVERLAY_TESTNET}" "${REL_DIR}/env.testnet" testnet

render_env "${OVERLAY_MAINNET}" "${REL_DIR}/env.mainnet" mainnet

# Release-canonical rollup configs (used for sealing + governance hashes)
cp -a "${ROOT}/infra/opstack/config/rollup.json" "${REL_DIR}/rollup.l2.json"
cp -a "${ROOT}/infra/opstack/l3/ghostl3/config/rollup.json" "${REL_DIR}/rollup.l3.json"

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
