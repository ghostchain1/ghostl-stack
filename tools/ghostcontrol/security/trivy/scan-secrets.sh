#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

TARGET_PATH="${1:-${ROOT_DIR}}"
ALLOWLIST_PATH="${ALLOWLIST_PATH:-${ROOT_DIR}/security/trivy/allowlist/ghostcontrol-secrets.json}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/evidence/scans}"
SCAN_PATH="${SCAN_PATH:-${OUT_DIR}/ghostcontrol-secret-scan.json}"
SUMMARY_PATH="${SUMMARY_PATH:-${OUT_DIR}/ghostcontrol-secret-gate-summary.json}"
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

trivy fs \
  --scanners secret \
  --format json \
  --output "${SCAN_PATH}" \
  "${TARGET_PATH}" >/dev/null

mapfile -t rows < <(jq -r '
  .Results[]? as $result
  | ($result.Target // "") as $target
  | $result.Secrets[]?
  | [(.RuleID // ""), (.Severity // "UNKNOWN"), $target]
  | @tsv
' "${SCAN_PATH}")

allowed=()
disallowed=()
expired_hits=()

for row in "${rows[@]}"; do
  IFS=$'\t' read -r rule severity target <<< "${row}"

  if jq -e \
    --arg rule "${rule}" \
    --arg severity "${severity}" \
    --arg target "${target}" \
    --arg today "${TODAY_UTC}" '
    .entries[]?
    | select(.rule_id == $rule)
    | select((.severity // "ANY") == "ANY" or .severity == $severity)
    | select(.expires_on >= $today)
    | select(any(.target_patterns[]?; $target | test(.)))
  ' "${ALLOWLIST_PATH}" >/dev/null; then
    allowed+=("${rule}|${severity}|${target}")
    continue
  fi

  disallowed+=("${rule}|${severity}|${target}")
  if jq -e \
    --arg rule "${rule}" \
    --arg severity "${severity}" \
    --arg target "${target}" \
    --arg today "${TODAY_UTC}" '
    .entries[]?
    | select(.rule_id == $rule)
    | select((.severity // "ANY") == "ANY" or .severity == $severity)
    | select(.expires_on < $today)
    | select(any(.target_patterns[]?; $target | test(.)))
  ' "${ALLOWLIST_PATH}" >/dev/null; then
    expired_hits+=("${rule}|${severity}|${target}")
  fi
done

json_array_from_lines() {
  if [[ "$#" -eq 0 ]]; then
    echo "[]"
    return 0
  fi
  printf '%s\n' "$@" | jq -R . | jq -s .
}

allowed_json="$(json_array_from_lines "${allowed[@]}")"
disallowed_json="$(json_array_from_lines "${disallowed[@]}")"
expired_json="$(json_array_from_lines "${expired_hits[@]}")"

jq -n \
  --arg target "${TARGET_PATH}" \
  --arg scan_file "${SCAN_PATH}" \
  --arg scanned_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson total "${#rows[@]}" \
  --argjson allowed "${allowed_json}" \
  --argjson disallowed "${disallowed_json}" \
  --argjson expired "${expired_json}" '
  {
    target: $target,
    scan_file: $scan_file,
    scanned_at: $scanned_at,
    total_findings: $total,
    allowed: $allowed,
    disallowed: $disallowed,
    expired_allowlist_matches: $expired
  }
' > "${SUMMARY_PATH}"

if [[ "${#disallowed[@]}" -gt 0 || "${#expired_hits[@]}" -gt 0 ]]; then
  echo "ghostcontrol_secret_gate=FAIL summary=${SUMMARY_PATH}"
  exit 1
fi

echo "ghostcontrol_secret_gate=PASS summary=${SUMMARY_PATH}"
