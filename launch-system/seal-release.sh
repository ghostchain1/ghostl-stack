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
require_cmd sudo
require_cmd docker
require_cmd date

"${SCRIPT_DIR}/validate-release.sh"

ROOT="$(repo_root)"
REL_DIR="${ROOT}/releases/${RELEASE_ID}"
[ -d "${REL_DIR}" ] || die "missing_release_dir:${REL_DIR}"

if [ -f "${REL_DIR}/manifest.json" ]; then
  status="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8")).get("status",""))' "${REL_DIR}/manifest.json" 2>/dev/null || true)"
  if [ "${status}" = "sealed" ] && [ "${HYPERGHOST_ALLOW_RESEAL:-0}" != "1" ]; then
    die "release_already_sealed:${REL_DIR}"
  fi
fi
if [ -f "${REL_DIR}/checksums.txt" ] && [ "${HYPERGHOST_ALLOW_RESEAL:-0}" != "1" ]; then
  die "release_already_sealed:${REL_DIR}"
fi

required_release_paths=(
  "${REL_DIR}/genesis.l1.json"
  "${REL_DIR}/rollup.l2.json"
  "${REL_DIR}/rollup.l3.json"
  "${REL_DIR}/env.testnet"
  "${REL_DIR}/env.mainnet"
  "${REL_DIR}/images.lock"

  # L1
  "${REL_DIR}/infra/ghostchain/docker-compose.l1.yml"
  "${REL_DIR}/infra/ghostchain/geth/run-node.sh"

  # L2/L3
  "${REL_DIR}/infra/opstack/docker-compose.yml"
  "${REL_DIR}/infra/opstack/docker-compose.l3.yml"
  "${REL_DIR}/infra/opstack/docker-compose.challengers.yml"
  "${REL_DIR}/infra/opstack/config/rollup.json"
  "${REL_DIR}/infra/opstack/config/genesis-l2.json"
  "${REL_DIR}/infra/opstack/config/l1-chain.json"
  "${REL_DIR}/infra/opstack/l3/ghostl3/config/rollup.json"
  "${REL_DIR}/infra/opstack/l3/ghostl3/config/genesis.json"
  "${REL_DIR}/infra/opstack/l3/ghostl3/config/l1-chain.json"

  # Services
  "${REL_DIR}/docker-compose.phase3.yml"
  "${REL_DIR}/docker-compose.phase3.secrets.yml"
  "${REL_DIR}/infra/docker/ghost-mapper/mappings.phase3.hostports.json"
)

for p in "${required_release_paths[@]}"; do
  [ -f "${p}" ] || die "missing_release_file:${p##${REL_DIR}/}"
done

extract_challenger_assets() {
  local tag="$1"
  local image="local/op-challenger:${tag}"

  local op_program_out="${REL_DIR}/infra/opstack/optimism/op-program/bin/op-program"
  local cannon_out="${REL_DIR}/infra/opstack/optimism/cannon/bin/cannon"

  mkdir -p "$(dirname "${op_program_out}")" "$(dirname "${cannon_out}")"

  log "seal: extracting challenger assets from ${image}"
  (
    set -euo pipefail
    cid="$(sudo -n docker create "${image}")"
    trap 'sudo -n docker rm -f "${cid}" >/dev/null 2>&1 || true' EXIT
    sudo -n docker cp "${cid}:/usr/local/bin/op-program" "${op_program_out}"
    sudo -n docker cp "${cid}:/usr/local/bin/cannon" "${cannon_out}"
  )

  chmod 755 "${op_program_out}" "${cannon_out}" 2>/dev/null || true
}

MANIFEST_SRC="${REL_DIR}/manifest.json"
MANIFEST_RELEASE_ID=""
MANIFEST_GIT_COMMIT=""
MANIFEST_CREATED_AT=""
if [ -f "${MANIFEST_SRC}" ]; then
  MANIFEST_RELEASE_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8")).get("release_id",""))' "${MANIFEST_SRC}" 2>/dev/null || true)"
  MANIFEST_GIT_COMMIT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8")).get("git_commit",""))' "${MANIFEST_SRC}" 2>/dev/null || true)"
  MANIFEST_CREATED_AT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8")).get("created_at_utc",""))' "${MANIFEST_SRC}" 2>/dev/null || true)"
fi

if [ -n "${MANIFEST_RELEASE_ID}" ] && [ "${MANIFEST_RELEASE_ID}" != "${RELEASE_ID}" ]; then
  die "release_id_mismatch:manifest=${MANIFEST_RELEASE_ID}:arg=${RELEASE_ID}"
fi

GIT_COMMIT_CURRENT="$(git -C "${ROOT}" rev-parse --short HEAD)"
if [ -n "${MANIFEST_GIT_COMMIT}" ] && [ "${MANIFEST_GIT_COMMIT}" != "${GIT_COMMIT_CURRENT}" ]; then
  die "repo_head_mismatch:built=${MANIFEST_GIT_COMMIT}:current=${GIT_COMMIT_CURRENT}"
fi

GIT_COMMIT="${MANIFEST_GIT_COMMIT:-${GIT_COMMIT_CURRENT}}"
CREATED_AT="${MANIFEST_CREATED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
SEALED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Populate images.lock with immutable IDs/digests (DEVNET only).
# Targets must deploy with --no-build.
ENV_SRC="${REL_DIR}/env.testnet"

L1_COMPOSE_SRC="${ROOT}/infra/ghostchain/docker-compose.l1.yml"
OPSTACK_COMPOSE_L2_SRC="${ROOT}/infra/opstack/docker-compose.yml"
OPSTACK_COMPOSE_L3_SRC="${ROOT}/infra/opstack/docker-compose.l3.yml"
OPSTACK_COMPOSE_CHALLENGERS_SRC="${ROOT}/infra/opstack/docker-compose.challengers.yml"
PHASE3_COMPOSE_SRC="${ROOT}/docker-compose.phase3.yml"

REL_L1_COMPOSE_SRC="${REL_DIR}/infra/ghostchain/docker-compose.l1.yml"
REL_OPSTACK_COMPOSE_L2_SRC="${REL_DIR}/infra/opstack/docker-compose.yml"
REL_OPSTACK_COMPOSE_L3_SRC="${REL_DIR}/infra/opstack/docker-compose.l3.yml"
REL_OPSTACK_COMPOSE_CHALLENGERS_SRC="${REL_DIR}/infra/opstack/docker-compose.challengers.yml"
REL_PHASE3_COMPOSE_SRC="${REL_DIR}/docker-compose.phase3.yml"

assert_same_file() {
  local root_src="$1"
  local rel_copy="$2"

  [ -f "${root_src}" ] || die "missing_root_file:${root_src}"
  [ -f "${rel_copy}" ] || die "missing_release_file:${rel_copy##${REL_DIR}/}"

  local root_hash=""
  local rel_hash=""
  root_hash="$(sha256sum "${root_src}" | awk '{print $1}')"
  rel_hash="$(sha256sum "${rel_copy}" | awk '{print $1}')"
  if [ "${root_hash}" != "${rel_hash}" ]; then
    die "release_snapshot_mismatch:${rel_copy##${REL_DIR}/}"
  fi
}

log "seal: verifying release snapshot matches repo sources"
assert_same_file "${L1_COMPOSE_SRC}" "${REL_L1_COMPOSE_SRC}"
assert_same_file "${OPSTACK_COMPOSE_L2_SRC}" "${REL_OPSTACK_COMPOSE_L2_SRC}"
assert_same_file "${OPSTACK_COMPOSE_L3_SRC}" "${REL_OPSTACK_COMPOSE_L3_SRC}"
assert_same_file "${OPSTACK_COMPOSE_CHALLENGERS_SRC}" "${REL_OPSTACK_COMPOSE_CHALLENGERS_SRC}"
assert_same_file "${PHASE3_COMPOSE_SRC}" "${REL_PHASE3_COMPOSE_SRC}"

PHASE3_PROFILES="${PHASE3_PROFILES-interchain}"
phase3_profile_args=()
if [ -n "${PHASE3_PROFILES}" ]; then
  for p in ${PHASE3_PROFILES//,/ }; do
    [ -n "${p}" ] || continue
    phase3_profile_args+=(--profile "${p}")
  done
fi

log "seal: images.lock: pulling images (devnet)"
sudo -n docker compose -f "${L1_COMPOSE_SRC}" --env-file "${ENV_SRC}" pull --ignore-pull-failures || true
sudo -n docker compose -f "${OPSTACK_COMPOSE_L2_SRC}" -f "${OPSTACK_COMPOSE_L3_SRC}" -f "${OPSTACK_COMPOSE_CHALLENGERS_SRC}" --env-file "${ENV_SRC}" pull --ignore-pull-failures || true
sudo -n docker compose -f "${PHASE3_COMPOSE_SRC}" "${phase3_profile_args[@]}" --env-file "${ENV_SRC}" pull --ignore-pull-failures || true

log "seal: images.lock: building local images (devnet)"
sudo -n docker compose -f "${L1_COMPOSE_SRC}" --env-file "${ENV_SRC}" build || true
sudo -n docker compose -f "${OPSTACK_COMPOSE_L2_SRC}" -f "${OPSTACK_COMPOSE_L3_SRC}" -f "${OPSTACK_COMPOSE_CHALLENGERS_SRC}" --env-file "${ENV_SRC}" build || true
sudo -n docker compose -f "${PHASE3_COMPOSE_SRC}" "${phase3_profile_args[@]}" --env-file "${ENV_SRC}" build || true

log "seal: images.lock: building opstack core images (devnet)"
OPSTACK_IMAGE_TAG="${RELEASE_ID}" bash "${ROOT}/infra/scripts/opstack/build.sh"

extract_challenger_assets "${RELEASE_ID}"

for p in \
  "${REL_DIR}/infra/opstack/optimism/op-program/bin/op-program" \
  "${REL_DIR}/infra/opstack/optimism/cannon/bin/cannon"; do
  [ -f "${p}" ] || die "missing_release_file:${p##${REL_DIR}/}"
done

log "seal: images.lock: inspecting images"
HG_ROOT="${ROOT}" \
HG_RELEASE_ID="${RELEASE_ID}" \
HG_ENV_SRC="${ENV_SRC}" \
HG_L1_COMPOSE_SRC="${L1_COMPOSE_SRC}" \
HG_OPSTACK_COMPOSE_L2_SRC="${OPSTACK_COMPOSE_L2_SRC}" \
HG_OPSTACK_COMPOSE_L3_SRC="${OPSTACK_COMPOSE_L3_SRC}" \
HG_OPSTACK_COMPOSE_CHALLENGERS_SRC="${OPSTACK_COMPOSE_CHALLENGERS_SRC}" \
HG_PHASE3_COMPOSE_SRC="${PHASE3_COMPOSE_SRC}" \
HG_PHASE3_PROFILES="${PHASE3_PROFILES}" \
python3 - <<'PY' > "${REL_DIR}/images.lock"
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

root = os.environ["HG_ROOT"]
release_id = os.environ["HG_RELEASE_ID"]
env_src = os.environ["HG_ENV_SRC"]
l1_compose = os.environ["HG_L1_COMPOSE_SRC"]
opstack_l2 = os.environ["HG_OPSTACK_COMPOSE_L2_SRC"]
opstack_l3 = os.environ["HG_OPSTACK_COMPOSE_L3_SRC"]
opstack_chall = os.environ["HG_OPSTACK_COMPOSE_CHALLENGERS_SRC"]
phase3 = os.environ["HG_PHASE3_COMPOSE_SRC"]
phase3_profiles = [
    p for p in os.environ.get("HG_PHASE3_PROFILES", "").replace(",", " ").split() if p
]

def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"cmd_failed rc={p.returncode} cmd={cmd} stderr={p.stderr.strip()}")
    return p.stdout

compose_sets: list[dict] = [
    {"name": "l1", "files": [l1_compose], "profiles": []},
    {"name": "opstack", "files": [opstack_l2, opstack_l3, opstack_chall], "profiles": []},
    {"name": "phase3", "files": [phase3], "profiles": phase3_profiles},
]

seen: set[str] = set()
for spec in compose_sets:
    cmd = ["sudo", "-n", "docker", "compose"]
    for f in spec["files"]:
        cmd += ["-f", f]
    for profile in spec.get("profiles") or []:
        cmd += ["--profile", profile]
    cmd += ["--env-file", env_src, "config", "--images"]
    images_raw = run(cmd)
    for line in images_raw.splitlines():
        img = line.strip()
        if not img:
            continue
        if img in seen:
            continue
        seen.add(img)

images = sorted(seen)

items: list[dict] = []
missing: list[str] = []
for img in images:
    p = subprocess.run(
        ["sudo", "-n", "docker", "image", "inspect", img],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if p.returncode != 0:
        missing.append(img)
        continue

    info = json.loads(p.stdout)[0]
    items.append(
        {
            "image": img,
            "id": info.get("Id", ""),
            "repo_tags": sorted(info.get("RepoTags") or []),
            "repo_digests": sorted(info.get("RepoDigests") or []),
        }
    )

if missing:
    raise SystemExit("missing_images:" + ",".join(sorted(missing)))

compose_sets_out: list[dict] = []
for spec in compose_sets:
    compose_sets_out.append(
        {
            "name": spec["name"],
            "files": [os.path.relpath(f, root) for f in spec["files"]],
            "profiles": spec.get("profiles") or [],
        }
    )

lock = {
    "release_id": release_id,
    "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "env_source": os.path.basename(env_src),
    "compose_sets": compose_sets_out,
    "images": items,
}
sys.stdout.write(json.dumps(lock, indent=2, sort_keys=True) + "\n")
PY

if [ "${HYPERGHOST_BUNDLE_IMAGES:-0}" = "1" ]; then
  require_cmd gzip
  mkdir -p "${REL_DIR}/images"

  HG_REL_DIR="${REL_DIR}" python3 - <<'PY' > "${REL_DIR}/images/images.txt"
import json
import os
from pathlib import Path

rel_dir = Path(os.environ["HG_REL_DIR"])
lock = json.loads((rel_dir / "images.lock").read_text(encoding="utf-8"))
for item in lock.get("images", []):
    img = (item.get("image") or "").strip()
    if img:
        print(img)
PY

  log "seal: images.bundle: ${REL_DIR}/images/docker-images.tar.gz"
  sudo -n docker save $(tr '\n' ' ' < "${REL_DIR}/images/images.txt") | gzip -1 > "${REL_DIR}/images/docker-images.tar.gz"
fi

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

# Copy docker helper so deploy scripts can run even when the user is not in the `docker` group.
cp -a "${ROOT}/scripts/lib/docker.sh" "${REL_DIR}/scripts/lib/docker.sh"
chmod 750 "${REL_DIR}/scripts/lib/docker.sh"

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
  "sealed_at_utc": "${SEALED_AT}",
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
  "created_at_utc": "${CREATED_AT}",
  "sealed_at_utc": "${SEALED_AT}"
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
created_at_utc=${SEALED_AT}
release_created_at_utc=${CREATED_AT}
TXT

cat > "${REL_DIR}/attestations/image-digest-attestation.txt" <<TXT
release_id=${RELEASE_ID}
images_lock_keccak256=${IMAGES_LOCK_HASH}
created_at_utc=${SEALED_AT}
release_created_at_utc=${CREATED_AT}
note=images.lock populated during sealing (image IDs + repo digests when available)
TXT

cat > "${REL_DIR}/scripts/validate-release.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"

cd "${REL_DIR}"
for f in \
  manifest.json \
  genesis.l1.json \
  rollup.l2.json \
  rollup.l3.json \
  images.lock \
  env.testnet \
  env.mainnet \
  docker-compose.phase3.yml \
  docker-compose.phase3.secrets.yml \
  infra/ghostchain/docker-compose.l1.yml \
  infra/opstack/docker-compose.yml \
  infra/opstack/docker-compose.l3.yml \
  infra/opstack/docker-compose.challengers.yml \
  infra/opstack/config/rollup.json \
  infra/opstack/config/genesis-l2.json \
  infra/opstack/config/l1-chain.json \
  infra/opstack/l3/ghostl3/config/rollup.json \
  infra/opstack/l3/ghostl3/config/genesis.json \
  infra/opstack/l3/ghostl3/config/l1-chain.json \
  infra/opstack/optimism/op-program/bin/op-program \
  infra/opstack/optimism/cannon/bin/cannon \
  infra/docker/ghost-mapper/mappings.phase3.hostports.json \
  checksums.txt; do
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

# shellcheck source=lib/docker.sh
. "${REL_DIR}/scripts/lib/docker.sh"
hg_require_docker_compose

ENV=testnet
DATA_ROOT="/data/${ENV}"

ensure_symlink() {
  local target="$1"
  local link="$2"

  if [ -L "$link" ]; then
    ln -sfn "$target" "$link"
    return
  fi
  if [ -e "$link" ]; then
    echo "refusing: ${link} exists and is not a symlink" >&2
    exit 1
  fi
  ln -s "$target" "$link"
}

env_get() {
  local key="$1"
  local def="${2:-}"
  local file="${3:-${REL_DIR}/env.${ENV}}"

  if [ -f "$file" ]; then
    local val=""
    val="$(grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2- || true)"
    val="${val%$'\r'}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -n "$val" ]; then
      printf '%s' "$val"
      return
    fi
  fi
  printf '%s' "$def"
}

ensure_jwt_hex_file() {
  local path="$1"
  if [ -f "$path" ]; then
    return
  fi
  mkdir -p "$(dirname "$path")"
  python3 - <<'PY' > "$path"
import secrets
print(secrets.token_hex(32))
PY
  chmod 600 "$path" || true
}

mkdir -p "${DATA_ROOT}/l1" "${DATA_ROOT}/l2" "${DATA_ROOT}/l3" "${DATA_ROOT}/services"
mkdir -p "${DATA_ROOT}/secrets/l1" "${DATA_ROOT}/secrets/opstack" "${DATA_ROOT}/secrets/services"

cd "${REL_DIR}"
sha256sum -c checksums.txt >/dev/null

# Root env file is used for compose interpolation defaults.
cp -a "env.${ENV}" ".env"

# Component-local env files (some compose stacks use env_file: ./.env).
cp -a "env.${ENV}" "infra/ghostchain/.env"
cp -a "env.${ENV}" "infra/opstack/.env"

# Persist data/secrets under /data/<env>, not inside the release bundle.
ensure_symlink "${DATA_ROOT}/l1" "infra/ghostchain/data"
ensure_symlink "${DATA_ROOT}/secrets/l1" "infra/ghostchain/secrets"
ensure_symlink "${DATA_ROOT}/l2" "infra/opstack/data"
ensure_symlink "${DATA_ROOT}/services" "services"
mkdir -p "infra/docker"
ensure_symlink "${DATA_ROOT}/secrets/services" "infra/docker/secrets"

L3_NAME="$(env_get L3_NAME ghostl3)"
L3_CHAIN_ID="$(env_get L3_CHAIN_ID 903)"
L3_DATA_PROFILE="$(env_get L3_DATA_PROFILE "")"
suffix=""
if [ -n "${L3_DATA_PROFILE}" ]; then
  suffix="-${L3_DATA_PROFILE}"
fi

if [ ! -d "infra/opstack/l3/${L3_NAME}/config" ]; then
  echo "missing_l3_config_dir: infra/opstack/l3/${L3_NAME}/config" >&2
  exit 1
fi

mkdir -p "${DATA_ROOT}/l3/${L3_NAME}"
mkdir -p "infra/opstack/l3/${L3_NAME}"
ensure_symlink "${DATA_ROOT}/l3/${L3_NAME}/data-${L3_CHAIN_ID}${suffix}" "infra/opstack/l3/${L3_NAME}/data-${L3_CHAIN_ID}${suffix}"
ensure_symlink "${DATA_ROOT}/l3/${L3_NAME}/data" "infra/opstack/l3/${L3_NAME}/data"

# JWT secrets (generate if missing; keep the canonical copy under /data).
ensure_jwt_hex_file "${DATA_ROOT}/secrets/l1/jwtsecret"
ensure_jwt_hex_file "${DATA_ROOT}/secrets/opstack/jwt.l2.txt"
ensure_jwt_hex_file "${DATA_ROOT}/secrets/opstack/jwt.l3.txt"

cp -a "${DATA_ROOT}/secrets/opstack/jwt.l2.txt" "infra/opstack/config/jwt.txt"
chmod 600 "infra/opstack/config/jwt.txt" || true
cp -a "${DATA_ROOT}/secrets/opstack/jwt.l3.txt" "infra/opstack/l3/${L3_NAME}/config/jwt.txt"
chmod 600 "infra/opstack/l3/${L3_NAME}/config/jwt.txt" || true

if [ -f "${REL_DIR}/images/docker-images.tar.gz" ]; then
  gzip -dc "${REL_DIR}/images/docker-images.tar.gz" | hg_docker load
fi

# L1
(
  cd "${REL_DIR}/infra/ghostchain"
  hg_docker compose -f docker-compose.l1.yml --env-file .env --project-name ghostchain-l1 config >/dev/null
  hg_docker compose -f docker-compose.l1.yml --env-file .env --project-name ghostchain-l1 up -d --no-build
)

# L2 + L3 + challengers
(
  cd "${REL_DIR}/infra/opstack"
  hg_docker compose -f docker-compose.yml -f docker-compose.l3.yml -f docker-compose.challengers.yml --env-file .env --project-name ghostchain-opstack config >/dev/null
  hg_docker compose -f docker-compose.yml -f docker-compose.l3.yml -f docker-compose.challengers.yml --env-file .env --project-name ghostchain-opstack up -d --no-build
)

# Services (Phase 3)
phase3_files=(-f docker-compose.phase3.yml)
if [ "${PHASE3_WITH_SECRETS:-0}" = "1" ]; then
  phase3_files+=(-f docker-compose.phase3.secrets.yml)
fi
phase3_profiles=()
if [ -n "${PHASE3_PROFILES:-}" ]; then
  for p in ${PHASE3_PROFILES//,/ }; do
    [ -n "${p}" ] || continue
    phase3_profiles+=(--profile "${p}")
  done
fi
hg_docker compose "${phase3_files[@]}" "${phase3_profiles[@]}" --env-file "env.${ENV}" config >/dev/null
hg_docker compose "${phase3_files[@]}" "${phase3_profiles[@]}" --env-file "env.${ENV}" up -d --no-build
echo "deployed:${ENV}"
SH
chmod 750 "${REL_DIR}/scripts/deploy-testnet.sh"

cat > "${REL_DIR}/scripts/validate-testnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

: "${RPC_L1:=http://127.0.0.1:18545}"
: "${RPC_L2:=http://127.0.0.1:29547}"
: "${RPC_L3:=http://127.0.0.1:39545}"

rpc_chain_id() {
  local url="$1"
  local out
  out="$(curl -fsS -H 'Content-Type: application/json' --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}' \"${url}\")"
  printf '%s' "${out}" | jq -r .result
}

echo "chain_id_l1=$(rpc_chain_id "${RPC_L1}")"
echo "chain_id_l2=$(rpc_chain_id "${RPC_L2}")"
echo "chain_id_l3=$(rpc_chain_id "${RPC_L3}")"
SH
chmod 750 "${REL_DIR}/scripts/validate-testnet.sh"

cat > "${REL_DIR}/scripts/rollback-testnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "${REL_DIR}"
# shellcheck source=lib/docker.sh
. "${REL_DIR}/scripts/lib/docker.sh"
hg_require_docker_compose
ENV=testnet
cp -a "env.${ENV}" ".env" 2>/dev/null || true
cp -a "env.${ENV}" "infra/ghostchain/.env" 2>/dev/null || true
cp -a "env.${ENV}" "infra/opstack/.env" 2>/dev/null || true

phase3_files=(-f docker-compose.phase3.yml)
if [ "${PHASE3_WITH_SECRETS:-0}" = "1" ]; then
  phase3_files+=(-f docker-compose.phase3.secrets.yml)
fi
phase3_profiles=()
if [ -n "${PHASE3_PROFILES:-}" ]; then
  for p in ${PHASE3_PROFILES//,/ }; do
    [ -n "${p}" ] || continue
    phase3_profiles+=(--profile "${p}")
  done
fi
hg_docker compose "${phase3_files[@]}" "${phase3_profiles[@]}" --env-file "env.${ENV}" down || true
(
  cd "${REL_DIR}/infra/opstack"
  hg_docker compose -f docker-compose.yml -f docker-compose.l3.yml -f docker-compose.challengers.yml --env-file .env --project-name ghostchain-opstack down || true
)
(
  cd "${REL_DIR}/infra/ghostchain"
  hg_docker compose -f docker-compose.l1.yml --env-file .env --project-name ghostchain-l1 down || true
)
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

# shellcheck source=lib/docker.sh
. "${REL_DIR}/scripts/lib/docker.sh"
hg_require_docker_compose

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

ensure_symlink() {
  local target="$1"
  local link="$2"

  if [ -L "$link" ]; then
    ln -sfn "$target" "$link"
    return
  fi
  if [ -e "$link" ]; then
    echo "refusing: ${link} exists and is not a symlink" >&2
    exit 1
  fi
  ln -s "$target" "$link"
}

env_get() {
  local key="$1"
  local def="${2:-}"
  local file="${3:-${REL_DIR}/env.${ENV}}"

  if [ -f "$file" ]; then
    local val=""
    val="$(grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2- || true)"
    val="${val%$'\r'}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -n "$val" ]; then
      printf '%s' "$val"
      return
    fi
  fi
  printf '%s' "$def"
}

ensure_jwt_hex_file() {
  local path="$1"
  if [ -f "$path" ]; then
    return
  fi
  mkdir -p "$(dirname "$path")"
  python3 - <<'PY' > "$path"
import secrets
print(secrets.token_hex(32))
PY
  chmod 600 "$path" || true
}

mkdir -p "${DATA_ROOT}/l1" "${DATA_ROOT}/l2" "${DATA_ROOT}/l3" "${DATA_ROOT}/services"
mkdir -p "${DATA_ROOT}/secrets/l1" "${DATA_ROOT}/secrets/opstack" "${DATA_ROOT}/secrets/services"

cd "${REL_DIR}"
sha256sum -c checksums.txt >/dev/null

# Root env file is used for compose interpolation defaults.
cp -a "env.${ENV}" ".env"

# Component-local env files (some compose stacks use env_file: ./.env).
cp -a "env.${ENV}" "infra/ghostchain/.env"
cp -a "env.${ENV}" "infra/opstack/.env"

# Persist data/secrets under /data/<env>, not inside the release bundle.
ensure_symlink "${DATA_ROOT}/l1" "infra/ghostchain/data"
ensure_symlink "${DATA_ROOT}/secrets/l1" "infra/ghostchain/secrets"
ensure_symlink "${DATA_ROOT}/l2" "infra/opstack/data"
ensure_symlink "${DATA_ROOT}/services" "services"
mkdir -p "infra/docker"
ensure_symlink "${DATA_ROOT}/secrets/services" "infra/docker/secrets"

L3_NAME="$(env_get L3_NAME ghostl3)"
L3_CHAIN_ID="$(env_get L3_CHAIN_ID 903)"
L3_DATA_PROFILE="$(env_get L3_DATA_PROFILE "")"
suffix=""
if [ -n "${L3_DATA_PROFILE}" ]; then
  suffix="-${L3_DATA_PROFILE}"
fi

if [ ! -d "infra/opstack/l3/${L3_NAME}/config" ]; then
  echo "missing_l3_config_dir: infra/opstack/l3/${L3_NAME}/config" >&2
  exit 1
fi

mkdir -p "${DATA_ROOT}/l3/${L3_NAME}"
mkdir -p "infra/opstack/l3/${L3_NAME}"
ensure_symlink "${DATA_ROOT}/l3/${L3_NAME}/data-${L3_CHAIN_ID}${suffix}" "infra/opstack/l3/${L3_NAME}/data-${L3_CHAIN_ID}${suffix}"
ensure_symlink "${DATA_ROOT}/l3/${L3_NAME}/data" "infra/opstack/l3/${L3_NAME}/data"

# JWT secrets (generate if missing; keep the canonical copy under /data).
ensure_jwt_hex_file "${DATA_ROOT}/secrets/l1/jwtsecret"
ensure_jwt_hex_file "${DATA_ROOT}/secrets/opstack/jwt.l2.txt"
ensure_jwt_hex_file "${DATA_ROOT}/secrets/opstack/jwt.l3.txt"

cp -a "${DATA_ROOT}/secrets/opstack/jwt.l2.txt" "infra/opstack/config/jwt.txt"
chmod 600 "infra/opstack/config/jwt.txt" || true
cp -a "${DATA_ROOT}/secrets/opstack/jwt.l3.txt" "infra/opstack/l3/${L3_NAME}/config/jwt.txt"
chmod 600 "infra/opstack/l3/${L3_NAME}/config/jwt.txt" || true

if [ -f "${REL_DIR}/images/docker-images.tar.gz" ]; then
  gzip -dc "${REL_DIR}/images/docker-images.tar.gz" | hg_docker load
fi

# L1
(
  cd "${REL_DIR}/infra/ghostchain"
  hg_docker compose -f docker-compose.l1.yml --env-file .env --project-name ghostchain-l1 config >/dev/null
  hg_docker compose -f docker-compose.l1.yml --env-file .env --project-name ghostchain-l1 up -d --no-build
)

# L2 + L3 + challengers
(
  cd "${REL_DIR}/infra/opstack"
  hg_docker compose -f docker-compose.yml -f docker-compose.l3.yml -f docker-compose.challengers.yml --env-file .env --project-name ghostchain-opstack config >/dev/null
  hg_docker compose -f docker-compose.yml -f docker-compose.l3.yml -f docker-compose.challengers.yml --env-file .env --project-name ghostchain-opstack up -d --no-build
)

# Services (Phase 3)
phase3_files=(-f docker-compose.phase3.yml)
if [ "${PHASE3_WITH_SECRETS:-0}" = "1" ]; then
  phase3_files+=(-f docker-compose.phase3.secrets.yml)
fi
phase3_profiles=()
if [ -n "${PHASE3_PROFILES:-}" ]; then
  for p in ${PHASE3_PROFILES//,/ }; do
    [ -n "${p}" ] || continue
    phase3_profiles+=(--profile "${p}")
  done
fi
hg_docker compose "${phase3_files[@]}" "${phase3_profiles[@]}" --env-file "env.${ENV}" config >/dev/null
hg_docker compose "${phase3_files[@]}" "${phase3_profiles[@]}" --env-file "env.${ENV}" up -d --no-build

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
: "${RPC_L1:=http://127.0.0.1:18545}"
: "${RPC_L2:=http://127.0.0.1:29547}"
: "${RPC_L3:=http://127.0.0.1:39545}"

rpc_chain_id() {
  local url="$1"
  local out
  out="$(curl -fsS -H 'Content-Type: application/json' --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}' \"${url}\")"
  printf '%s' "${out}" | jq -r .result
}

echo "chain_id_l1=$(rpc_chain_id "${RPC_L1}")"
echo "chain_id_l2=$(rpc_chain_id "${RPC_L2}")"
echo "chain_id_l3=$(rpc_chain_id "${RPC_L3}")"
SH
chmod 750 "${REL_DIR}/scripts/validate-mainnet.sh"

cat > "${REL_DIR}/scripts/rollback-mainnet.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "${REL_DIR}"
# shellcheck source=lib/docker.sh
. "${REL_DIR}/scripts/lib/docker.sh"
hg_require_docker_compose
ENV=mainnet
cp -a "env.${ENV}" ".env" 2>/dev/null || true
cp -a "env.${ENV}" "infra/ghostchain/.env" 2>/dev/null || true
cp -a "env.${ENV}" "infra/opstack/.env" 2>/dev/null || true

phase3_files=(-f docker-compose.phase3.yml)
if [ "${PHASE3_WITH_SECRETS:-0}" = "1" ]; then
  phase3_files+=(-f docker-compose.phase3.secrets.yml)
fi
phase3_profiles=()
if [ -n "${PHASE3_PROFILES:-}" ]; then
  for p in ${PHASE3_PROFILES//,/ }; do
    [ -n "${p}" ] || continue
    phase3_profiles+=(--profile "${p}")
  done
fi
hg_docker compose "${phase3_files[@]}" "${phase3_profiles[@]}" --env-file "env.${ENV}" down || true
(
  cd "${REL_DIR}/infra/opstack"
  hg_docker compose -f docker-compose.yml -f docker-compose.l3.yml -f docker-compose.challengers.yml --env-file .env --project-name ghostchain-opstack down || true
)
(
  cd "${REL_DIR}/infra/ghostchain"
  hg_docker compose -f docker-compose.l1.yml --env-file .env --project-name ghostchain-l1 down || true
)
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
