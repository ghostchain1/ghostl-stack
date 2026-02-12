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
ENV_L1_SRC="${ROOT}/infra/ghostchain/.env"

cp -a "${GENESIS_SRC}" "${REL_DIR}/genesis.l1.json"
cp -a "${COMPOSE_L1_SRC}" "${REL_DIR}/docker-compose.testnet.yml"
cp -a "${COMPOSE_L1_SRC}" "${REL_DIR}/docker-compose.mainnet.yml"

OVERLAY_TESTNET="${ROOT}/environments/testnet/ghostchain.env"
OVERLAY_MAINNET="${ROOT}/environments/mainnet/ghostchain.env"

render_env() {
  local base_env="$1"
  local overlay_env="$2"
  local out="$3"
  local env_name="$4"

  [ -f "${base_env}" ] || die "missing_base_env:${base_env}"
  [ -f "${overlay_env}" ] || die "missing_overlay_env:${overlay_env}"

  {
    cat "${base_env}"
    printf '\n# --- overlay (%s): %s ---\n' "${env_name}" "${overlay_env}"
    cat "${overlay_env}"
    printf '\nHYPERGHOST_ENV=%s\n' "${env_name}"
  } > "${out}"
}

render_env "${ENV_L1_SRC}" "${OVERLAY_TESTNET}" "${REL_DIR}/env.testnet" testnet

render_env "${ENV_L1_SRC}" "${OVERLAY_MAINNET}" "${REL_DIR}/env.mainnet" mainnet

L1_CHAIN_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8"))["config"]["chainId"])' "${REL_DIR}/genesis.l1.json")"

env_int() {
  python3 - "$1" "$2" <<'PY'
import sys

path = sys.argv[1]
key = sys.argv[2]

def get_int(path: str, key: str):
    try:
        fh = open(path, "r", encoding="utf-8")
    except FileNotFoundError:
        return None
    with fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() != key:
                continue
            v = v.strip().strip('"').strip("'")
            if not v:
                return None
            try:
                return int(v, 0)
            except Exception:
                return None
    return None

val = get_int(path, key)
if val is None:
    raise SystemExit(1)
print(val)
PY
}

OPSTACK_ENV="${ROOT}/infra/opstack/.env"
OPSTACK_ENV_L3="${ROOT}/infra/opstack/.env.l3"
L2_CHAIN_ID="$(env_int "${OPSTACK_ENV}" L2_CHAIN_ID 2>/dev/null || true)"
L3_CHAIN_ID="$(env_int "${OPSTACK_ENV}" OP_L3_CHAIN_ID 2>/dev/null || true)"
if [ -z "${L2_CHAIN_ID}" ]; then
  L2_CHAIN_ID="901"
  log "build: warn: missing infra/opstack/.env:L2_CHAIN_ID; using ${L2_CHAIN_ID}"
fi
if [ -z "${L3_CHAIN_ID}" ]; then
  L3_CHAIN_ID="$(env_int "${OPSTACK_ENV_L3}" L3_CHAIN_ID 2>/dev/null || true)"
fi
if [ -z "${L3_CHAIN_ID}" ]; then
  L3_CHAIN_ID="903"
  log "build: warn: missing infra/opstack/.env:OP_L3_CHAIN_ID and infra/opstack/.env.l3:L3_CHAIN_ID; using ${L3_CHAIN_ID}"
fi

cat > "${REL_DIR}/rollup.l2.json" <<JSON
{
  \"note\": \"placeholder (generate from opstack tooling)\",
  \"environment\": \"testnet/mainnet\",
  \"chain_id\": ${L2_CHAIN_ID},
  \"l1_chain_id\": ${L1_CHAIN_ID}
}
JSON

cat > "${REL_DIR}/rollup.l3.json" <<JSON
{
  \"note\": \"placeholder (generate from opstack tooling)\",
  \"environment\": \"testnet/mainnet\",
  \"chain_id\": ${L3_CHAIN_ID},
  \"parent_chain_id\": ${L2_CHAIN_ID},
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
