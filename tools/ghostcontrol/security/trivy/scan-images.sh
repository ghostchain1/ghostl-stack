#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

ALLOWLIST_PATH="${ALLOWLIST_PATH:-${ROOT_DIR}/security/trivy/allowlist/ghostcontrol-images.json}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/evidence/scans}"
SUMMARY_PATH="${SUMMARY_PATH:-${OUT_DIR}/ghostcontrol-image-gate-summary.json}"
TODAY_UTC="${TODAY_UTC:-$(date -u +%F)}"

if ! command -v trivy >/dev/null 2>&1; then
  echo "missing_dependency: trivy not found" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "missing_dependency: jq not found" >&2
  exit 2
fi

if [[ ! -f "${ALLOWLIST_PATH}" ]]; then
  echo "missing_allowlist: ${ALLOWLIST_PATH}" >&2
  exit 2
fi

mkdir -p "${OUT_DIR}"

if [[ "$#" -gt 0 ]]; then
  IMAGES=("$@")
else
  IMAGES=(
    "compose-ghostcontrol-api"
    "compose-ghostcontrol-ui"
  )
fi

run_with_docker_group() {
  local command="$1"
  local socket_group=""
  local docker_group_candidate=""

  if [[ -S /var/run/docker.sock ]] && command -v stat >/dev/null 2>&1; then
    socket_group="$(stat -c '%G' /var/run/docker.sock 2>/dev/null || true)"
  fi
  docker_group_candidate="${DOCKER_SOCKET_GROUP:-${socket_group:-${GHOST_DOCKER_GROUP:-}}}"

  if command -v sg >/dev/null 2>&1; then
    if [[ -n "${docker_group_candidate}" ]] && getent group "${docker_group_candidate}" >/dev/null 2>&1; then
      sg "${docker_group_candidate}" -c "${command}"
      return $?
    fi
    if getent group docker >/dev/null 2>&1; then
      sg docker -c "${command}"
      return $?
    fi
  fi

  bash -lc "${command}"
}

json_array_from_lines() {
  if [[ "$#" -eq 0 ]]; then
    echo "[]"
    return 0
  fi
  printf '%s\n' "$@" | jq -R . | jq -s .
}

EXIT_CODE=0
SUMMARY_LINES=()

for image in "${IMAGES[@]}"; do
  safe_image="${image//\//_}"
  scan_file="${OUT_DIR}/trivy-image-${safe_image}.json"

  run_with_docker_group \
    "trivy image --scanners vuln --severity HIGH,CRITICAL --format json --output \"${scan_file}\" \"${image}\" >/dev/null"

  mapfile -t rows < <(jq -r '
    .Results[]?.Vulnerabilities[]?
    | select(.Severity == "HIGH" or .Severity == "CRITICAL")
    | [.VulnerabilityID, .Severity, .PkgName, (.InstalledVersion // ""), (.FixedVersion // "")]
    | @tsv
  ' "${scan_file}")

  allowed=()
  disallowed=()

  for row in "${rows[@]}"; do
    IFS=$'\t' read -r vid sev pkg installed fixed <<< "${row}"
    if jq -e \
      --arg vid "${vid}" \
      --arg sev "${sev}" \
      --arg image "${image}" \
      --arg today "${TODAY_UTC}" '
      .entries[]?
      | select(.id == $vid)
      | select((.severity // "ANY") == "ANY" or .severity == $sev)
      | select(.expires_on >= $today)
      | select(any(.image_patterns[]?; $image | test(.)))
    ' "${ALLOWLIST_PATH}" >/dev/null; then
      allowed+=("${vid}|${sev}|${pkg}|${installed}|${fixed}")
    else
      disallowed+=("${vid}|${sev}|${pkg}|${installed}|${fixed}")
    fi
  done

  mapfile -t expired < <(jq -r \
    --arg image "${image}" \
    --arg today "${TODAY_UTC}" '
    .entries[]?
    | select(.expires_on < $today)
    | select(any(.image_patterns[]?; $image | test(.)))
    | "\(.id)|\(.expires_on)|\(.severity // "ANY")"
  ' "${ALLOWLIST_PATH}")

  if [[ "${#disallowed[@]}" -gt 0 || "${#expired[@]}" -gt 0 ]]; then
    EXIT_CODE=1
  fi

  allowed_json="$(json_array_from_lines "${allowed[@]}")"
  disallowed_json="$(json_array_from_lines "${disallowed[@]}")"
  expired_json="$(json_array_from_lines "${expired[@]}")"

  summary_line="$(jq -c -n \
    --arg image "${image}" \
    --arg scan_file "${scan_file}" \
    --arg scanned_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson total "${#rows[@]}" \
    --argjson allowed "${allowed_json}" \
    --argjson disallowed "${disallowed_json}" \
    --argjson expired "${expired_json}" '
    {
      image: $image,
      scan_file: $scan_file,
      scanned_at: $scanned_at,
      total_high_critical: $total,
      allowed: $allowed,
      disallowed: $disallowed,
      expired_allowlist_entries: $expired
    }
  ')"
  SUMMARY_LINES+=("${summary_line}")
done

printf '%s\n' "${SUMMARY_LINES[@]}" | jq -s . > "${SUMMARY_PATH}"

if [[ "${EXIT_CODE}" -ne 0 ]]; then
  echo "ghostcontrol_image_gate=FAIL summary=${SUMMARY_PATH}"
  exit 1
fi

echo "ghostcontrol_image_gate=PASS summary=${SUMMARY_PATH}"
