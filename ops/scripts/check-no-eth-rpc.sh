#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[check-no-eth-rpc] %s\n' "$*"; }
fail() { printf '[check-no-eth-rpc][FAIL] %s\n' "$*" >&2; exit 1; }

if ! command -v rg >/dev/null 2>&1; then
  fail "missing required binary: rg (ripgrep)"
fi

# Baseline mode: fail only on *new* occurrences compared to the tracked baseline.
# This lets us tighten the canonical namespace progressively without breaking CI on day one.
BASELINE_FILE="${BASELINE_FILE:-ops/policy/no-eth-rpc-baseline.txt}"
MODE="${1:-check}"
if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  cat <<'USAGE'
Usage:
  bash ops/scripts/check-no-eth-rpc.sh              # check against baseline (CI default)
  bash ops/scripts/check-no-eth-rpc.sh --print      # print current findings (no baseline)
  bash ops/scripts/check-no-eth-rpc.sh --update-baseline  # overwrite baseline file

Env:
  BASELINE_FILE=ops/policy/no-eth-rpc-baseline.txt
USAGE
  exit 0
fi

# This is intentionally scoped to "eth_* JSON-RPC methods for which a gst_* canonical exists".
# It avoids flagging:
# - upstream OP/geth code under infra/opstack/
# - contracts/ and chain data
# - docs
# - eth_* methods with no gst_* equivalent (e.g., eth_syncing)
#
# If you extend the gst_* namespace in services/ghost-rpc-proxy/index.mjs, mirror the list here.
FORBIDDEN_METHODS=(
  eth_blockNumber
  eth_chainId
  eth_getBalance
  eth_getTransactionCount
  eth_getBlockByNumber
  eth_getBlockByHash
  eth_getCode
  eth_call
  eth_estimateGas
  eth_gasPrice
  eth_feeHistory
  eth_maxPriorityFeePerGas
)

SEARCH_DIRS=(
  services
  packages
  apps
  ghost-helper-bots
)

# Allow eth_* usage only in the proxy boundary + explicit compatibility layers.
ALLOW_PATHS=(
  '^services/ghost-rpc-proxy/'
  '^packages/sdk/src/index\.ts$'
)

ALLOW_RE="($(IFS='|'; echo "${ALLOW_PATHS[*]}"))"

findings=()
for method in "${FORBIDDEN_METHODS[@]}"; do
  while IFS= read -r line; do
    # Format: path<TAB>method<TAB>line
    path="${line%%:*}"
    if [[ "$path" =~ $ALLOW_RE ]]; then
      continue
    fi
    findings+=("${path}\t${method}\t${line#*:}")
  done < <(
    rg -n --no-heading --fixed-strings "$method" "${SEARCH_DIRS[@]}" \
      --glob '!**/node_modules/**' \
      --glob '!**/dist/**' \
      --glob '!**/.next/**' \
      --glob '!**/build/**' \
      --glob '!**/out/**' \
      --glob '!**/cache/**' \
      --glob '!**/artifacts/**' \
      --glob '!**/rollback/**' \
      --glob '!infra/opstack/**' \
      --glob '!contracts/**' \
      --glob '!chains/**' \
      --glob '!docs/**' \
      --glob '!**/*.md' \
      --glob '!**/*.json' \
      --glob '!**/*.lock' \
      --glob '!**/*.log' \
      --glob '!**/*.txt' \
      --glob '!**/*.yml' \
      --glob '!**/*.yaml' \
      --glob '!**/*.toml' \
      --glob '!**/*.env*' \
      --glob '!**/*.sh' \
    || true
  )
done

if [[ "$MODE" == "--print" ]]; then
  printf '%b\n' "${findings[@]}" | sort -u
  exit 0
fi

if [[ "$MODE" == "--update-baseline" ]]; then
  mkdir -p "$(dirname "$BASELINE_FILE")"
  printf '%b\n' "${findings[@]}" | sort -u >"$BASELINE_FILE"
  log "Wrote baseline: $BASELINE_FILE"
  exit 0
fi

if [ ! -f "$BASELINE_FILE" ]; then
  fail "missing baseline file: $BASELINE_FILE (run: bash ops/scripts/check-no-eth-rpc.sh --update-baseline)"
fi

current="$(mktemp)"
baseline="$(mktemp)"
printf '%b\n' "${findings[@]}" | sort -u >"$current"
sort -u "$BASELINE_FILE" >"$baseline"

new="$(comm -13 "$baseline" "$current" || true)"
if [ -z "$new" ]; then
  log "OK: no new forbidden eth_* RPC method usage (baseline enforced)."
  exit 0
fi

{
  echo "New forbidden eth_* JSON-RPC method usage detected (use gst_* canonical methods instead):"
  echo
  echo "$new" | head -n 200
  if [ "$(echo "$new" | wc -l | tr -d ' ')" -gt 200 ]; then
    echo "... (truncated)"
  fi
  echo
  echo "Baseline file: $BASELINE_FILE"
  echo "Allowed exceptions:"
  printf '  - %s\n' "${ALLOW_PATHS[@]}"
  echo
  echo "To intentionally refresh the baseline (not recommended unless you are accepting debt):"
  echo "  bash ops/scripts/check-no-eth-rpc.sh --update-baseline"
} >&2

exit 1
