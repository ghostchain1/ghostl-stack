#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_ROOT="${ROOT_DIR}/infra/evidence"
OUT_DIR="${EVIDENCE_DIR:-${EVIDENCE_ROOT}/out}"

usage() {
  cat <<'EOF'
Usage: infra/scripts/evidence-pack-ai-governance.sh [--verify] [--out-dir=PATH]

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
  if [ ! -e "$target" ]; then
    return 0
  fi
  if [ -d "$target" ]; then
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
    "${work_dir}/contracts" \
    "${work_dir}/scripts" \
    "${work_dir}/evidence" \
    "${work_dir}/provenance"

  local snapshots=(
    "docs/architecture/ghostchain-ai-governance-whitepaper.md"
    "docs/ai-core/architecture.md"
    "docs/ai-core/invariants.md"
    "docs/ai-core/invariant-registry.json"
    "docs/security/ai-governance-invariants.yaml"
    "docs/ai-core/ratification.md"
    "docs/ai-core/federation.md"
    "docs/ai-core/failure-mode-drills.md"
    "docs/ghostchain/ratification-package.md"
    "docs/security/README.md"
  )

  for item in "${snapshots[@]}"; do
    if [ -e "${ROOT_DIR}/${item}" ]; then
      mkdir -p "${work_dir}/snapshots/$(dirname "${item}")"
      cp "${ROOT_DIR}/${item}" "${work_dir}/snapshots/${item}"
    fi
  done

  local contract_dirs=(
    "contracts/src/governance"
    "contracts/src/ai"
    "contracts/src/common"
  )

  for dir in "${contract_dirs[@]}"; do
    if [ -d "${ROOT_DIR}/${dir}" ]; then
      mkdir -p "${work_dir}/contracts/$(dirname "${dir}")"
      copy_dir "${ROOT_DIR}/${dir}" "${work_dir}/contracts/${dir}"
    fi
  done

  local script_files=(
    "contracts/scripts/ai/build_ai_action_ratification.ts"
    "contracts/scripts/governance/export_policy_checkpoint.ts"
    "scripts/smoke/ai-governance-failure-modes.sh"
    "scripts/smoke/federation-invariants.sh"
    "infra/scripts/evidence-pack-l1.sh"
    "infra/scripts/evidence-pack-l2.sh"
  )

  for file in "${script_files[@]}"; do
    if [ -f "${ROOT_DIR}/${file}" ]; then
      mkdir -p "${work_dir}/scripts/$(dirname "${file}")"
      cp "${ROOT_DIR}/${file}" "${work_dir}/scripts/${file}"
    fi
  done

  if [ -d "${EVIDENCE_ROOT}/templates" ]; then
    copy_dir "${EVIDENCE_ROOT}/templates" "${work_dir}/evidence/templates"
  fi

  local evidence_dirs=(
    "services/ghost-gas-engine/data/evidence"
    "services/ghost-gas-engine/data/proposals"
    "services/ai-monitor/data/evidence"
    "infra/evidence/out"
  )

  for dir in "${evidence_dirs[@]}"; do
    if [ -d "${ROOT_DIR}/${dir}" ]; then
      mkdir -p "${work_dir}/evidence/$(dirname "${dir}")"
      copy_dir "${ROOT_DIR}/${dir}" "${work_dir}/evidence/${dir}"
    fi
  done

  {
    echo "# AI governance snapshots"
    hash_dir "${work_dir}/snapshots"
  } > "${work_dir}/hashes/snapshots.sha256"

  {
    echo "# AI governance contract sources"
    hash_dir "${work_dir}/contracts"
  } > "${work_dir}/hashes/contracts.sha256"

  {
    echo "# AI governance scripts"
    hash_dir "${work_dir}/scripts"
  } > "${work_dir}/hashes/scripts.sha256"

  {
    echo "# Evidence artifacts"
    hash_dir "${work_dir}/evidence"
  } > "${work_dir}/hashes/evidence.sha256"

  local git_commit git_branch git_dirty generated_at source_epoch
  git_commit="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
  git_branch="$(git -C "${ROOT_DIR}" rev-parse --abbrev-ref HEAD)"
  git_dirty="false"
  if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
    git_dirty="true"
  fi

  if [ -n "$epoch" ]; then
    source_epoch="$epoch"
    generated_at="$(date -u -d "@${epoch}" +"%Y-%m-%dT%H:%M:%SZ")"
  else
    source_epoch="$(date -u +%s)"
    generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  fi

  cat > "${work_dir}/provenance/provenance.json" <<EOF
{
  "schemaVersion": "1.0",
  "buildType": "ghostchain.ai-governance.evidence-pack",
  "generatedAt": "${generated_at}",
  "sourceDateEpoch": ${source_epoch},
  "git": {
    "commit": "${git_commit}",
    "branch": "${git_branch}",
    "dirty": ${git_dirty}
  },
  "builder": {
    "tool": "infra/scripts/evidence-pack-ai-governance.sh",
    "version": "1"
  }
}
EOF

  {
    echo "# Evidence pack manifest"
    hash_dir "${work_dir}/provenance"
  } > "${work_dir}/hashes/manifest.sha256"

  local pack_dir="${out_dir}/evidence-pack-ai-governance-${timestamp}"
  rm -rf "$pack_dir"
  mkdir -p "$pack_dir"
  copy_dir "${work_dir}" "$pack_dir"

  if [ -n "$epoch" ]; then
    find "$pack_dir" -print0 | xargs -0 touch -d "@${epoch}"
  fi

  local zip_path="${out_dir}/evidence-pack-ai-governance-${timestamp}.zip"
  (cd "$out_dir" && zip -X -r "$(basename "$zip_path")" "$(basename "$pack_dir")" >/dev/null)
  sha256sum "$zip_path" > "${zip_path}.sha256"

  echo "$zip_path"
}

if [ "$VERIFY" = true ]; then
  if [ -z "${EVIDENCE_TIMESTAMP:-}" ] || [ -z "${EVIDENCE_EPOCH:-}" ]; then
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
  if [ "$hash1" != "$hash2" ]; then
    echo "Evidence pack hashes differ: $hash1 vs $hash2" >&2
    exit 1
  fi
  echo "Reproducible evidence pack hash: $hash1"
  exit 0
fi

timestamp="${EVIDENCE_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
zip_path="$(build_pack "$timestamp" "$OUT_DIR")"
echo "Evidence pack created: ${zip_path}"
