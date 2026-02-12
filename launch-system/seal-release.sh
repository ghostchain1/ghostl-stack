#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage:
  launch-system/seal-release.sh --release-id <id>

Turns an unsealed release directory into a sealed, checksummed release bundle.
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

[ -n "${RELEASE_ID}" ] || die "missing_release_id"

require_cmd git
require_cmd python3
require_cmd sha256sum
require_cmd find
require_cmd sort
require_cmd awk

"${SCRIPT_DIR}/validate-release.sh"

ROOT="$(repo_root)"
REL_DIR="${ROOT}/releases/${RELEASE_ID}"
[ -d "${REL_DIR}" ] || die "missing_release_dir:${REL_DIR}"

for f in genesis.l1.json rollup.l2.json rollup.l3.json env.testnet env.mainnet docker-compose.testnet.yml docker-compose.mainnet.yml images.lock; do
  [ -f "${REL_DIR}/${f}" ] || die "missing_release_file:${f}"
done

GIT_COMMIT="$(git -C "${ROOT}" rev-parse --short HEAD)"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

REL_ID_BYTES32="$(keccak256_str "${RELEASE_ID}")"
GENESIS_HASH="$(keccak256_file "${REL_DIR}/genesis.l1.json")"
ROLLUP_L2_HASH="$(keccak256_file "${REL_DIR}/rollup.l2.json")"
ROLLUP_L3_HASH="$(keccak256_file "${REL_DIR}/rollup.l3.json")"
IMAGES_LOCK_HASH="$(keccak256_file "${REL_DIR}/images.lock")"

mkdir -p "${REL_DIR}/governance" "${REL_DIR}/governance/attestations" "${REL_DIR}/scripts" "${REL_DIR}/scripts/lib"
mkdir -p "${REL_DIR}/dr"

# Copy python helpers into the sealed bundle so TESTNET/MAINNET can verify without the devnet working tree.
cp -a "${SCRIPT_DIR}/lib/hashutil.py" "${REL_DIR}/scripts/lib/hashutil.py"
cp -a "${SCRIPT_DIR}/lib/ethrpc.py" "${REL_DIR}/scripts/lib/ethrpc.py"
chmod 750 "${REL_DIR}/scripts/lib/hashutil.py" "${REL_DIR}/scripts/lib/ethrpc.py"

# Copy DR helpers into the sealed bundle (to be installed under /opt/ghoststack/dr on target VMs).
cp -a "${SCRIPT_DIR}/dr/." "${REL_DIR}/dr/"
chmod 750 "${REL_DIR}/dr/"*.sh 2>/dev/null || true

cat > "${REL_DIR}/INCIDENT-RESPONSE.md" <<'MD'
# Incident Response Checklist (Mainnet)

This is a template. Tailor it to your chain + hosting provider.

## Immediate triage

- Confirm host health: CPU, RAM, disk, network.
- Confirm container status: restart loops, OOM kills, unhealthy.
- Confirm chain signals:
  - block time deviation
  - peer count collapse
  - RPC latency p95/p99 spikes
  - finality delay / reorg depth

## Containment

- Stop external traffic if needed (rate limit / maintenance mode).
- Preserve logs + metrics snapshots.

## Recovery

- Prefer rollback to the last known-good sealed release.
- Validate genesis/chain IDs unchanged.

## Postmortem

- Record timeline, root cause, and corrective actions.
MD

cat > "${REL_DIR}/manifest.json" <<JSON
{
  "release_id": "${RELEASE_ID}",
  "release_id_bytes32": "${REL_ID_BYTES32}",
  "git_commit": "${GIT_COMMIT}",
  "created_at_utc": "${CREATED_AT}",
  "status": "sealed",
  "hashes": {
    "genesis_l1_keccak256": "${GENESIS_HASH}",
    "rollup_l2_keccak256": "${ROLLUP_L2_HASH}",
    "rollup_l3_keccak256": "${ROLLUP_L3_HASH}",
    "images_lock_keccak256": "${IMAGES_LOCK_HASH}"
  }
}
JSON

MANIFEST_HASH="$(keccak256_file "${REL_DIR}/manifest.json")"

cat > "${REL_DIR}/governance/launch-hashes.json" <<JSON
{
  "release_id": "${RELEASE_ID}",
  "release_id_bytes32": "${REL_ID_BYTES32}",
  "manifest_hash": "${MANIFEST_HASH}",
  "genesis_hash_l1": "${GENESIS_HASH}",
  "rollup_hash_l2": "${ROLLUP_L2_HASH}",
  "rollup_hash_l3": "${ROLLUP_L3_HASH}",
  "images_lock_hash": "${IMAGES_LOCK_HASH}",
  "created_at_utc": "${CREATED_AT}"
}
JSON

cat > "${REL_DIR}/governance/proposal.md" <<MD
# Mainnet Launch Proposal (Release ${RELEASE_ID})

This proposal authorizes **exactly one** mainnet release:

- release_id_bytes32: \`${REL_ID_BYTES32}\`
- manifest_hash: \`${MANIFEST_HASH}\`

The mainnet deploy script MUST refuse to run unless the on-chain gate reports this tuple as authorized.
MD

# Calldata for MainnetLaunchGate.authorizeMainnetLaunch(...)
python3 "${REL_DIR}/scripts/lib/hashutil.py" keccak256-str 'authorizeMainnetLaunch(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)' >/dev/null
python3 - <<PY > "${REL_DIR}/governance/calldata.txt"
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path("${REL_DIR}/scripts/lib").resolve()))
from hashutil import keccak256  # type: ignore

data = json.loads(Path("${REL_DIR}/governance/launch-hashes.json").read_text(encoding="utf-8"))
def b32(x: str) -> bytes:
    x = x[2:] if x.startswith("0x") else x
    raw = bytes.fromhex(x)
    if len(raw) != 32:
        raise SystemExit(f"expected 32 bytes, got {len(raw)}")
    return raw

selector = keccak256(b"authorizeMainnetLaunch(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)")[:4]
calldata = selector + b32(data["release_id_bytes32"]) + b32(data["manifest_hash"]) + b32(data["genesis_hash_l1"]) + b32(data["rollup_hash_l2"]) + b32(data["rollup_hash_l3"]) + b32(data["images_lock_hash"])
print("0x" + calldata.hex())
PY

cat > "${REL_DIR}/governance/propose-mainnet-launch.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"

echo "This bundle does not auto-submit governance proposals."
echo
echo "Inputs:"
echo "- launch hashes: ${REL_DIR}/governance/launch-hashes.json"
echo "- calldata:      ${REL_DIR}/governance/calldata.txt"
echo
echo "Next steps (human/governance):"
echo "1) Submit a governance proposal that calls Timelock -> MainnetLaunchGate.authorizeMainnetLaunch(...)"
echo "2) Vote/queue/execute according to your governance process"
echo "3) Re-run verify-onchain-authorization.sh"
SH
chmod 750 "${REL_DIR}/governance/propose-mainnet-launch.sh"

cat > "${REL_DIR}/governance/verify-onchain-authorization.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"

: "${RPC_L1:?set RPC_L1 (e.g. http://127.0.0.1:18545)}"
: "${MAINNET_LAUNCH_GATE_ADDRESS:?set MAINNET_LAUNCH_GATE_ADDRESS (0x...)}"

release_id_b32="$(jq -r .release_id_bytes32 "${REL_DIR}/governance/launch-hashes.json")"
manifest_hash="$(jq -r .manifest_hash "${REL_DIR}/governance/launch-hashes.json")"

python3 "${REL_DIR}/scripts/lib/ethrpc.py" is-launch-authorized \
  --rpc "${RPC_L1}" \
  --gate "${MAINNET_LAUNCH_GATE_ADDRESS}" \
  --release-id-bytes32 "${release_id_b32}" \
  --manifest-hash-bytes32 "${manifest_hash}"
SH
chmod 750 "${REL_DIR}/governance/verify-onchain-authorization.sh"

cat > "${REL_DIR}/attestations/genesis-attestation.txt" <<TXT
release_id=${RELEASE_ID}
genesis_l1_keccak256=${GENESIS_HASH}
created_at_utc=${CREATED_AT}
TXT

cat > "${REL_DIR}/attestations/image-digest-attestation.txt" <<TXT
release_id=${RELEASE_ID}
images_lock_keccak256=${IMAGES_LOCK_HASH}
created_at_utc=${CREATED_AT}
note=populate images.lock with immutable digests before production
TXT

cat > "${REL_DIR}/scripts/validate-release.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"

cd "${REL_DIR}"
for f in manifest.json genesis.l1.json rollup.l2.json rollup.l3.json images.lock env.testnet env.mainnet docker-compose.testnet.yml docker-compose.mainnet.yml checksums.txt; do
  [ -f "${f}" ] || { echo "missing:${f}" >&2; exit 1; }
done

sha256sum -c checksums.txt >/dev/null
echo "ok"
SH
chmod 750 "${REL_DIR}/scripts/validate-release.sh"

cat > "${REL_DIR}/scripts/seal-release.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "This release is already sealed. Sealing happens on DEVNET only."
SH
chmod 750 "${REL_DIR}/scripts/seal-release.sh"

cat > "${REL_DIR}/scripts/deploy-testnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
PREFIX="/opt/ghoststack/releases/"
case "${REL_DIR}/" in
  ${PREFIX}*) ;;
  *) echo "refusing: must deploy from ${PREFIX}<release-id> (got ${REL_DIR})" >&2; exit 1;;
esac

ENV=testnet
DATA_ROOT="/data/${ENV}"
mkdir -p "${DATA_ROOT}/l1" "${DATA_ROOT}/l2" "${DATA_ROOT}/l3"

cd "${REL_DIR}"
sha256sum -c checksums.txt >/dev/null

docker compose -f docker-compose.testnet.yml --env-file env.testnet config >/dev/null
docker compose -f docker-compose.testnet.yml --env-file env.testnet up -d
echo "deployed:${ENV}"
SH
chmod 750 "${REL_DIR}/scripts/deploy-testnet.sh"

cat > "${REL_DIR}/scripts/validate-testnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

: "${RPC_L1:=http://127.0.0.1:18545}"

out="$(curl -fsS -H 'Content-Type: application/json' --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}' \"${RPC_L1}\")"
chain_id_hex="$(printf '%s' \"${out}\" | jq -r .result)"
echo "chain_id=${chain_id_hex}"
SH
chmod 750 "${REL_DIR}/scripts/validate-testnet.sh"

cat > "${REL_DIR}/scripts/rollback-testnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "${REL_DIR}"
docker compose -f docker-compose.testnet.yml --env-file env.testnet down
echo "rolled_back:testnet (containers stopped)"
SH
chmod 750 "${REL_DIR}/scripts/rollback-testnet.sh"

cat > "${REL_DIR}/scripts/deploy-mainnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
PREFIX="/opt/ghoststack/releases/"
case "${REL_DIR}/" in
  ${PREFIX}*) ;;
  *) echo "refusing: must deploy from ${PREFIX}<release-id> (got ${REL_DIR})" >&2; exit 1;;
esac

: "${RPC_L1:?set RPC_L1 (e.g. http://127.0.0.1:18545)}"
: "${MAINNET_LAUNCH_GATE_ADDRESS:?set MAINNET_LAUNCH_GATE_ADDRESS (0x...)}"

release_id_b32="$(jq -r .release_id_bytes32 "${REL_DIR}/governance/launch-hashes.json")"
manifest_hash="$(jq -r .manifest_hash "${REL_DIR}/governance/launch-hashes.json")"

authorized="$(python3 "${REL_DIR}/scripts/lib/ethrpc.py" is-launch-authorized --rpc "${RPC_L1}" --gate "${MAINNET_LAUNCH_GATE_ADDRESS}" --release-id-bytes32 "${release_id_b32}" --manifest-hash-bytes32 "${manifest_hash}")"

if [ "${authorized}" != "true" ]; then
  echo "MAINNET DEPLOY BLOCKED: No on-chain authorization found for release-id + manifestHash." >&2
  echo "Required: execute governance proposal that calls authorizeMainnetLaunch(...)." >&2
  exit 1
fi

ENV=mainnet
DATA_ROOT="/data/${ENV}"
mkdir -p "${DATA_ROOT}/l1" "${DATA_ROOT}/l2" "${DATA_ROOT}/l3"

cd "${REL_DIR}"
sha256sum -c checksums.txt >/dev/null

docker compose -f docker-compose.mainnet.yml --env-file env.mainnet config >/dev/null
docker compose -f docker-compose.mainnet.yml --env-file env.mainnet up -d

mkdir -p "${REL_DIR}/governance"
cat > "${REL_DIR}/governance/launch-proof.txt" <<EOF
release_id_bytes32=${release_id_b32}
manifest_hash=${manifest_hash}
authorization_verified_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
rpc_l1=${RPC_L1}
note=record timelock execute tx hash and block number here
EOF

echo "deployed:${ENV}"
SH
chmod 750 "${REL_DIR}/scripts/deploy-mainnet.sh"

cat > "${REL_DIR}/scripts/validate-mainnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "TODO: add RPC latency, peer count, block time checks"
SH
chmod 750 "${REL_DIR}/scripts/validate-mainnet.sh"

cat > "${REL_DIR}/scripts/rollback-mainnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "${REL_DIR}"
docker compose -f docker-compose.mainnet.yml --env-file env.mainnet down
echo "rolled_back:mainnet (containers stopped)"
SH
chmod 750 "${REL_DIR}/scripts/rollback-mainnet.sh"

# Checksums last (covers everything).
(
  cd "${REL_DIR}"
  find . -type f ! -name 'checksums.txt' -print0 | sort -z | xargs -0 sha256sum
) > "${REL_DIR}/checksums.txt"

log "seal: sealed ${REL_DIR}"
log "seal: manifest_hash=${MANIFEST_HASH}"
