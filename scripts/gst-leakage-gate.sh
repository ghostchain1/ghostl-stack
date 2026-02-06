#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[gst-leakage-gate] %s\n' "$*"; }
fail() { printf '[gst-leakage-gate][FAIL] %s\n' "$*" >&2; exit 1; }

if ! command -v rg >/dev/null 2>&1; then
  fail "missing required binary: rg (ripgrep)"
fi

ALLOWLIST_FILE="${ALLOWLIST_FILE:-$ROOT_DIR/config/gst-allowlist.txt}"

rg_globs=(
	--hidden
	--glob '!.git/**'
	--glob '!docs/gst-migration/**'
	--glob '!scripts/gst-leakage-gate.sh'
	--glob '!config/gst-allowlist.txt'
	--glob '!ops/snapshots/**'
	--glob '!ops/preflight/**'
	--glob '!backups/**'
	--glob '!infra/docker/_backup/**'
	--glob '!docs/autonomy/**'
	--glob '!ops/STACK_CANONICAL.yml'
	--glob '!scripts/health/baseline_report.md'
	--glob '!tree.txt'
	--glob '!**/node_modules/**'
	--glob '!**/dist/**'
	--glob '!**/.next/**'
	--glob '!**/build/**'
  --glob '!**/out/**'
  --glob '!**/cache/**'
  --glob '!**/artifacts/**'
  --glob '!infra/opstack/optimism-upstream/**'
  --glob '!infra/opstack/op-geth/**'
  --glob '!contracts/lib/**'
)

if [ -f "$ALLOWLIST_FILE" ]; then
  while IFS= read -r raw; do
    line="$(printf '%s' "$raw" | sed 's/#.*$//' | xargs || true)"
    if [ -z "$line" ]; then
      continue
    fi
    rg_globs+=(--glob "!$line")
  done <"$ALLOWLIST_FILE"
fi

# Policy:
# - Business/branding legacy EVM-mainnet token semantics are forbidden.
	# - JSON-RPC `eth_*` method names are allowed for compatibility and are NOT checked here.
	#
	# This gate intentionally focuses on user-facing tokens and common identifier patterns.
PATTERN='(\bETH\b|\bEthereum\b|\bEther\b|Ξ|(?i:\b[a-z0-9-]+\.eth\b)|\bETH_[A-Z0-9_]+\b|\b[A-Za-z0-9]+_eth\b|\bnativeEth\b|\bethAmount\b|\bethBalance\b|\bETH_DECIMALS\b|\bETHERSCAN\b|\bALCHEMY_ETH\b|\bINFURA_ETH\b)'

matches="$(rg -n --no-heading --pcre2 "$PATTERN" . "${rg_globs[@]}" || true)"
if [ -z "$matches" ]; then
  log "OK: no forbidden ETH branding tokens found."
  exit 0
fi

{
  echo "Forbidden ETH branding tokens detected (GST-native policy violation):"
  echo
  printf '%s\n' "$matches" | sed -n '1,200p'
  if [ "$(printf '%s\n' "$matches" | wc -l | tr -d ' ')" -gt 200 ]; then
    echo "... (truncated)"
  fi
  echo
  if [ -f "$ALLOWLIST_FILE" ]; then
    echo "Allowlist file: ${ALLOWLIST_FILE#$ROOT_DIR/}"
  else
    echo "Allowlist file missing (optional): ${ALLOWLIST_FILE#$ROOT_DIR/}"
  fi
} >&2

exit 1
