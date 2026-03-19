#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

REPORT_PATH="artifacts/compose-bundles-validation-report.md"
GENERATED_AT="$(date -u +"%Y-%m-%d %H:%M:%SZ")"

# Placeholder values for compose interpolation in config-only validation mode.
export ECON_GRAFANA_ADMIN_PASSWORD="${ECON_GRAFANA_ADMIN_PASSWORD:-validation-placeholder}"
export MAINNET_GATE_RPC="${MAINNET_GATE_RPC:-http://placeholder-rpc.invalid}"
export MAINNET_GATE_ADDRESS="${MAINNET_GATE_ADDRESS:-0x0000000000000000000000000000000000000001}"
export RECEIPT_SIGNING_SECRET="${RECEIPT_SIGNING_SECRET:-validation-placeholder}"
export SNAPSHOT_SIGNING_SECRET="${SNAPSHOT_SIGNING_SECRET:-validation-placeholder}"

CHECKS=(
  "docker-compose.yml::docker-compose.yml"
  "docker-compose.dev.yml::docker-compose.dev.yml"
  "docker-compose.econ.devnet.yml::docker-compose.econ.devnet.yml"
  "docker-compose.econ.testnet.yml::docker-compose.econ.testnet.yml"
  "docker-compose.econ.mainnet.yml::docker-compose.econ.mainnet.yml"
  "docker-compose.autonomy.yml::docker-compose.autonomy.yml"
  "docker-compose.phase3.yml::docker-compose.phase3.yml"
  "docker-compose.ai-consensus.yml::docker-compose.ai-consensus.yml"
  "docker-compose.agents.yml::docker-compose.agents.yml"
  "docker-compose.cascading-finality.yml::docker-compose.cascading-finality.yml"
  "docker-compose.phase3.secrets.yml (with phase3 base)::docker-compose.phase3.yml docker-compose.phase3.secrets.yml"
  "apps/docker-compose.yml::apps/docker-compose.yml"
  "apps/docker-compose.dev.yml::apps/docker-compose.dev.yml"
  "infra/opstack/docker-compose.yml::infra/opstack/docker-compose.yml"
  "infra/opstack/docker-compose.l3.yml (with opstack base)::infra/opstack/docker-compose.yml infra/opstack/docker-compose.l3.yml"
  "infra/opstack/docker-compose.network-manager.yml::infra/opstack/docker-compose.network-manager.yml"
  "infra/opstack/docker-compose.challengers.yml (with opstack+l3 bases)::infra/opstack/docker-compose.yml infra/opstack/docker-compose.l3.yml infra/opstack/docker-compose.challengers.yml"
)

TOTAL=0
PASS=0
FAIL=0

PASSED_BLOCKS=()
FAILED_BLOCKS=()

release_json_smoke_check() {
  local service_root="services/ghostvm-ai"
  local script_path="${service_root}/scripts/release_checklist.sh"

  if [[ ! -x "$script_path" ]]; then
    return 2
  fi

  local output
  if ! output="$(cd "$service_root" && ./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --no-tests --json 2>&1)"; then
    echo "$output"
    return 1
  fi

  if ! python3 - <<'PY' "$output"; then
import json
import sys

raw = sys.argv[1]
lines = raw.splitlines()
start = None
for idx, line in enumerate(lines):
    if line.strip().startswith("{"):
        start = idx
        break
if start is None:
    raise SystemExit("json_not_found")

payload = json.loads("\n".join(lines[start:]))
required_top = {"ok", "status", "bundle_dir", "archive", "output_dir", "options", "artifacts"}
missing_top = sorted(required_top - payload.keys())
if missing_top:
    raise SystemExit(f"missing_top_keys:{','.join(missing_top)}")

required_opts = {"run_tests", "build_bundle", "pr_comment", "dry_run", "depth"}
missing_opts = sorted(required_opts - payload["options"].keys())
if missing_opts:
    raise SystemExit(f"missing_option_keys:{','.join(missing_opts)}")

if "verify_jsonl" not in payload["artifacts"]:
    raise SystemExit("missing_artifact_key:verify_jsonl")

if payload["status"] != "pass" or payload["ok"] is not True:
    raise SystemExit("unexpected_status")

print("json_contract_ok")
PY
    echo "$output"
    return 1
  fi

  return 0
}

for entry in "${CHECKS[@]}"; do
  name="${entry%%::*}"
  file_list="${entry#*::}"

  compose_cmd=(docker compose)
  for file in $file_list; do
    compose_cmd+=( -f "$file" )
  done
  compose_cmd+=(config)

  TOTAL=$((TOTAL + 1))
  if output="$("${compose_cmd[@]}" 2>&1)"; then
    PASS=$((PASS + 1))
    warning_suffix=""
    if grep -Eiq "warn|warning" <<<"$output"; then
      warning_suffix=" _(warnings emitted)_"
    fi

    files_md=""
    sep=""
    for file in $file_list; do
      files_md+="${sep}\`${file}\`"
      sep=", "
    done

    PASSED_BLOCKS+=("- **${name}**${warning_suffix}\n  - Files: ${files_md}")
  else
    FAIL=$((FAIL + 1))

    files_md=""
    sep=""
    for file in $file_list; do
      files_md+="${sep}\`${file}\`"
      sep=", "
    done

    FAILED_BLOCKS+=("- **${name}**\n  - Files: ${files_md}\n  - Error:\n\n\`\`\`\n${output}\n\`\`\`")
  fi
done

TOTAL=$((TOTAL + 1))
if smoke_output="$(release_json_smoke_check 2>&1)"; then
  PASS=$((PASS + 1))
  PASSED_BLOCKS+=("- **ghostvm-ai release checklist json smoke**\n  - Files: \`services/ghostvm-ai/scripts/release_checklist.sh\`\n  - Result: ${smoke_output}")
else
  exit_code=$?
  if [[ "$exit_code" -eq 2 ]]; then
    PASSED_BLOCKS+=("- **ghostvm-ai release checklist json smoke** _(skipped)_\n  - Files: \`services/ghostvm-ai/scripts/release_checklist.sh\`\n  - Reason: script not executable or not present")
  else
    FAIL=$((FAIL + 1))
    FAILED_BLOCKS+=("- **ghostvm-ai release checklist json smoke**\n  - Files: \`services/ghostvm-ai/scripts/release_checklist.sh\`\n  - Error:\n\n\`\`\`\n${smoke_output}\n\`\`\`")
  fi
fi

{
  echo "# Compose Bundles Validation Report"
  echo
  echo "- Generated (UTC): ${GENERATED_AT}"
  echo "- Scope: top-level and major bundle compose validations with required base files for override-only compose files"
  echo "- Command: \`docker compose -f <file> [...] config\`"
  echo
  echo "## Summary"
  echo
  echo "- Total checks: **${TOTAL}**"
  echo "- Passed: **${PASS}**"
  echo "- Failed: **${FAIL}**"
  echo

  if (( PASS > 0 )); then
    echo "## Passed"
    echo
    for block in "${PASSED_BLOCKS[@]}"; do
      printf '%b\n' "$block"
    done
    echo
  fi

  if (( FAIL > 0 )); then
    echo "## Failed"
    echo
    for block in "${FAILED_BLOCKS[@]}"; do
      printf '%b\n' "$block"
      echo
    done
  fi
} > "$REPORT_PATH"

echo "Compose bundles validation complete: TOTAL=${TOTAL} PASS=${PASS} FAIL=${FAIL}"
echo "Report written to ${REPORT_PATH}"
