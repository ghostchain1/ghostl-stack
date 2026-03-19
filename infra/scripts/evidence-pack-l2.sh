#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_ROOT="${ROOT_DIR}/infra/evidence"
OUT_DIR="${EVIDENCE_DIR:-${EVIDENCE_ROOT}/out}"

usage() {
  cat <<'EOF'
Usage: infra/scripts/evidence-pack-l2.sh [--verify] [--out-dir=PATH]

Environment variables:
  EVIDENCE_TIMESTAMP  Optional. Fixed timestamp like 20260202T000000Z.
  EVIDENCE_EPOCH      Optional. Unix epoch seconds for deterministic mtimes.
  EVIDENCE_DIR        Optional. Override output directory (defaults to infra/evidence/out).
EOF
}

VERIFY=false
for arg in "$@"; do
  case "$arg" in
    --verify) VERIFY=true ;;
    --out-dir=*) OUT_DIR="${arg#*=}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: ${arg}" >&2; usage; exit 1 ;;
  esac
done

hash_dir() {
  local target="$1"
  if [[ ! -e "$target" ]]; then
    return 0
  fi
  if [[ -d "$target" ]]; then
    (cd "$target" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
  else
    sha256sum "$target"
  fi
}

copy_dir() {
  local src="$1"
  local dest="$2"
  mkdir -p "$dest"
  cp -a "${src}/." "$dest/"
}

create_zip() {
  local src_dir="$1"
  local zip_path="$2"

  if command -v zip >/dev/null 2>&1; then
    (cd "$(dirname "$src_dir")" && zip -X -r "$(basename "$zip_path")" "$(basename "$src_dir")" >/dev/null)
    return 0
  fi

  command -v python3 >/dev/null 2>&1 || {
    echo "zip or python3 is required to create evidence archives" >&2
    return 1
  }

  python3 - <<'PY' "$src_dir" "$zip_path"
import pathlib
import sys
import zipfile

src_dir = pathlib.Path(sys.argv[1]).resolve()
zip_path = pathlib.Path(sys.argv[2]).resolve()
root = src_dir.parent

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(p for p in src_dir.rglob("*") if p.is_file()):
        archive.write(path, arcname=str(path.relative_to(root)))
PY
}

build_pack() {
  local timestamp="$1"
  local out_dir="$2"
  local epoch="${EVIDENCE_EPOCH:-}"

  mkdir -p "$out_dir"
  local work_dir
  work_dir="$(mktemp -d)"
  trap 'rm -rf "$work_dir"' RETURN

  mkdir -p \
    "${work_dir}/hashes" \
    "${work_dir}/snapshots" \
    "${work_dir}/governance" \
    "${work_dir}/keys" \
    "${work_dir}/provenance"

  local snapshots=(
    "docker-compose.custom-rollup.yml"
    "infra/ghostchain/docker-compose.l1.yml"
    "chains/ghostl2/chain.json"
    "environments/devnet/ghostl2.env.example"
    "environments/devnet/ghostl2.env.generated"
    "infra/scripts/doctor-l2.sh"
    "infra/scripts/env-sync-l2.sh"
    "infra/scripts/gates/l2-go-no-go.sh"
    "docs/architecture/custom-ghost-multichain.md"
  )

  for item in "${snapshots[@]}"; do
    if [[ -e "${ROOT_DIR}/${item}" ]]; then
      mkdir -p "${work_dir}/snapshots/$(dirname "${item}")"
      if [[ -d "${ROOT_DIR}/${item}" ]]; then
        copy_dir "${ROOT_DIR}/${item}" "${work_dir}/snapshots/${item}"
      else
        cp "${ROOT_DIR}/${item}" "${work_dir}/snapshots/${item}"
      fi
    fi
  done

  if [[ -d "${ROOT_DIR}/ops/governance" ]]; then
    copy_dir "${ROOT_DIR}/ops/governance" "${work_dir}/governance/ops-governance"
  fi

  if [[ -f "${EVIDENCE_ROOT}/templates/governance-proposals.json" ]]; then
    cp "${EVIDENCE_ROOT}/templates/governance-proposals.json" \
      "${work_dir}/governance/governance-proposals.json"
  fi

  if [[ -f "${EVIDENCE_ROOT}/templates/key-rotation-log.json" ]]; then
    cp "${EVIDENCE_ROOT}/templates/key-rotation-log.json" \
      "${work_dir}/keys/key-rotation-log.json"
  fi

  {
    echo "# GhostL2 config snapshots"
    hash_dir "${work_dir}/snapshots"
  } > "${work_dir}/hashes/config.sha256"

  {
    echo "# GhostL2 contract sources"
    hash_dir "${ROOT_DIR}/contracts/src/l2"
    hash_dir "${ROOT_DIR}/contracts/src/bridge"
    hash_dir "${ROOT_DIR}/contracts/src/common"
    hash_dir "${ROOT_DIR}/contracts/src/ghost"
  } > "${work_dir}/hashes/contracts.sha256"

  {
    echo "# GhostL2 runtime services"
    hash_dir "${ROOT_DIR}/services/ghost-exec"
    hash_dir "${ROOT_DIR}/services/ghost-sequencer"
    hash_dir "${ROOT_DIR}/services/ghost-deriver"
    hash_dir "${ROOT_DIR}/services/ghost-settlement"
    hash_dir "${ROOT_DIR}/services/ghost-bridge"
    hash_dir "${ROOT_DIR}/services/ghost-proof"
  } > "${work_dir}/hashes/runtime.sha256"

  local git_commit git_branch git_dirty generated_at source_epoch
  git_commit="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
  git_branch="$(git -C "${ROOT_DIR}" rev-parse --abbrev-ref HEAD)"
  git_dirty="false"
  if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
    git_dirty="true"
  fi

  if [[ -n "$epoch" ]]; then
    source_epoch="$epoch"
    generated_at="$(date -u -d "@${epoch}" +"%Y-%m-%dT%H:%M:%SZ")"
  else
    source_epoch="$(date -u +%s)"
    generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  fi

  cat > "${work_dir}/provenance/provenance.json" <<EOF
{
  "schemaVersion": "1.0",
  "buildType": "ghostchain.l2.evidence-pack",
  "generatedAt": "${generated_at}",
  "sourceDateEpoch": ${source_epoch},
  "git": {
    "commit": "${git_commit}",
    "branch": "${git_branch}",
    "dirty": ${git_dirty}
  },
  "builder": {
    "tool": "infra/scripts/evidence-pack-l2.sh",
    "version": "2"
  }
}
EOF

  {
    echo "# Evidence pack manifest"
    hash_dir "${work_dir}/governance"
    hash_dir "${work_dir}/keys"
    hash_dir "${work_dir}/provenance"
  } > "${work_dir}/hashes/manifest.sha256"

  local pack_dir="${out_dir}/evidence-pack-l2-${timestamp}"
  rm -rf "$pack_dir"
  mkdir -p "$pack_dir"
  copy_dir "${work_dir}" "$pack_dir"

  if [[ -n "$epoch" ]]; then
    find "$pack_dir" -print0 | xargs -0 touch -d "@${epoch}"
  fi

  local zip_path="${out_dir}/evidence-pack-l2-${timestamp}.zip"
  create_zip "$pack_dir" "$zip_path"
  sha256sum "$zip_path" > "${zip_path}.sha256"

  echo "$zip_path"
}

if [[ "$VERIFY" == true ]]; then
  if [[ -z "${EVIDENCE_TIMESTAMP:-}" || -z "${EVIDENCE_EPOCH:-}" ]]; then
    echo "EVIDENCE_TIMESTAMP and EVIDENCE_EPOCH are required for --verify" >&2
    exit 1
  fi
  tmp1="$(mktemp -d)"
  tmp2="$(mktemp -d)"
  zip1="$(build_pack "${EVIDENCE_TIMESTAMP}" "$tmp1")"
  zip2="$(build_pack "${EVIDENCE_TIMESTAMP}" "$tmp2")"
  hash1="$(sha256sum "$zip1" | awk '{print $1}')"
  hash2="$(sha256sum "$zip2" | awk '{print $1}')"
  rm -rf "$tmp1" "$tmp2"
  if [[ "$hash1" != "$hash2" ]]; then
    echo "Evidence pack hashes differ: $hash1 vs $hash2" >&2
    exit 1
  fi
  echo "Reproducible evidence pack hash: $hash1"
  exit 0
fi

timestamp="${EVIDENCE_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
zip_path="$(build_pack "$timestamp" "$OUT_DIR")"
echo "Evidence pack created: ${zip_path}"
