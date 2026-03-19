#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[gst-symbol-gate] %s\n' "$*"; }
fail() { printf '[gst-symbol-gate][FAIL] %s\n' "$*" >&2; exit 1; }

BASELINE_FILE="${BASELINE_FILE:-$ROOT_DIR/config/gst-symbol-baseline.txt}"
MODE="${1:-check}"

if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  cat <<'USAGE'
Usage:
  bash scripts/gst-symbol-gate.sh
  bash scripts/gst-symbol-gate.sh --print
  bash scripts/gst-symbol-gate.sh --update-baseline

Env:
  BASELINE_FILE=config/gst-symbol-baseline.txt
USAGE
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  fail "missing required binary: git"
fi

# Enforce that the legacy gas token symbol "GHOST" does not appear in first-party, user-facing
# code/config/docs. Generated artifacts and migration inventories are excluded.
EXCLUDES=(
  ':!contracts/reports/formal/**'
  ':!docs/gst-migration/**'
  ':!docs/rollback/**'
  ':!scripts/gst-symbol-gate.sh'
  ':!config/gst-symbol-baseline.txt'
  ':!config/gst-leakage-baseline.txt'
  ':!backups/**'
  ':!infra/docker/_backup/**'
  ':!infra/docker/runtime/**'
  ':!infra/docker/audit/**'
  ':!evidence/**'
)

matches="$(
  {
    git grep -n -I -w 'GHOST' -- . "${EXCLUDES[@]}" || true
    git grep -n -I 'gGHOST' -- . "${EXCLUDES[@]}" || true
    # Block legacy non-canonical native token symbols used as fallbacks.
    # All layers must use GST as native currency; GTK/GTL2/GTL3 are deprecated.
    git grep -n -I -w 'GTK' -- . "${EXCLUDES[@]}" || true
    git grep -n -I -w 'GTL2' -- . "${EXCLUDES[@]}" || true
    git grep -n -I -w 'GTL3' -- . "${EXCLUDES[@]}" || true
  } | sed '/^$/d' | sort -u
)"

# --- ETH-as-currency guard ---
# Detect "ETH" used as a native currency symbol or COIN value in config files (JSON/YAML/env).
# Binary CLI flag names like --l1-eth-rpc and JSON-RPC namespaces like eth_chainId are excluded
# by scoping this check only to .json, .yml, .yaml, and .env* files, and using value-context patterns.
ETH_CURRENCY_EXCLUDES=(
  ':!scripts/gst-symbol-gate.sh'
  ':!config/gst-symbol-baseline.txt'
  ':!config/gst-leakage-baseline.txt'
  ':!docs/**'
  ':!evidence/**'
  ':!backups/**'
  ':!node_modules/**'
  ':!contracts/lib/**'
)
eth_matches="$(
  {
    # JSON: "symbol": "ETH" or "nativeCurrency": {..., "symbol": "ETH"}
    git grep -n -I '"symbol"[[:space:]]*:[[:space:]]*"ETH"' -- '*.json' "${ETH_CURRENCY_EXCLUDES[@]}" || true
    # JSON: "currency": "ETH"
    git grep -n -I '"currency"[[:space:]]*:[[:space:]]*"ETH"' -- '*.json' "${ETH_CURRENCY_EXCLUDES[@]}" || true
    # YAML: COIN: ETH (standalone value, not inside a string with other content)
    git grep -n -I -E '^[[:space:]]*COIN[[:space:]]*:[[:space:]]*ETH[[:space:]]*$' -- '*.yml' '*.yaml' "${ETH_CURRENCY_EXCLUDES[@]}" || true
    # YAML: symbol: ETH
    git grep -n -I -E '^[[:space:]]*symbol[[:space:]]*:[[:space:]]*ETH[[:space:]]*$' -- '*.yml' '*.yaml' "${ETH_CURRENCY_EXCLUDES[@]}" || true
    # env files: COIN=ETH or GAS_TOKEN_SYMBOL=ETH
    git grep -n -I -E '^(COIN|GAS_TOKEN_SYMBOL|NATIVE_CURRENCY_SYMBOL)[[:space:]]*=[[:space:]]*ETH[[:space:]]*$' -- '*.env' '*.env.*' '.env*' "${ETH_CURRENCY_EXCLUDES[@]}" || true
  } | sed '/^$/d' | sort -u
)"

# --- `ether` unit keyword guard in Solidity source (not tests/lib/scripts) ---
# Developers must use GST_UNIT (from GhostBrand.sol) instead of the raw `ether`
# keyword so that branding remains sovereign and searchable.
ETHER_SOL_EXCLUDES=(
  ':!scripts/gst-symbol-gate.sh'
  ':!config/gst-symbol-baseline.txt'
  ':!config/gst-leakage-baseline.txt'
  ':!contracts/lib/**'
  ':!contracts/test/**'
  ':!contracts/script/**'
  ':!docs/**'
  ':!evidence/**'
  ':!backups/**'
  ':!node_modules/**'
)
ether_sol_matches="$(
  git grep -n -I -E '[0-9_] ether\b' -- 'contracts/src/**/*.sol' "${ETHER_SOL_EXCLUDES[@]}" || true
)"

normalize_findings() {
  local category="$1"
  local raw="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" | sed '/^$/d' | sed -E "s#^\./##; s#^([^:]+):[0-9]+:#\\1\t${category}\t#"
}

findings="$(
  {
    normalize_findings "legacy_symbol" "$matches"
    normalize_findings "eth_currency" "$eth_matches"
    normalize_findings "ether_unit" "$ether_sol_matches"
  } | sort -u
)"

if [[ "$MODE" == "--print" ]]; then
  printf '%s\n' "$findings"
  exit 0
fi

if [[ "$MODE" == "--update-baseline" ]]; then
  mkdir -p "$(dirname "$BASELINE_FILE")"
  printf '%s\n' "$findings" >"$BASELINE_FILE"
  log "Wrote baseline: ${BASELINE_FILE#$ROOT_DIR/}"
  exit 0
fi

if [ ! -f "$BASELINE_FILE" ]; then
  fail "missing baseline file: ${BASELINE_FILE#$ROOT_DIR/} (run: bash scripts/gst-symbol-gate.sh --update-baseline)"
fi

current="$(mktemp)"
baseline="$(mktemp)"
printf '%s\n' "$findings" | sed '/^$/d' | sort -u >"$current"
sed 's#^\./##' "$BASELINE_FILE" | sort -u >"$baseline"

new="$(comm -13 "$baseline" "$current" || true)"
if [ -z "$new" ]; then
  log "OK: no new forbidden legacy GHOST symbol tokens found. GATE PASSED"
  exit 0
fi

if [ -n "$matches" ]; then
  :
fi

{
  echo "New forbidden legacy/non-canonical gas token findings detected (GST-native policy violation):"
  echo "  Banned: GHOST, gGHOST, GTK, GTL2, GTL3. Config ETH symbols and raw Solidity ether units are also blocked."
  echo
  printf '%s\n' "$new" | head -n 200
  if [ "$(printf '%s\n' "$new" | wc -l | tr -d ' ')" -gt 200 ]; then
    echo "... (truncated)"
  fi
  echo
  echo "Baseline file: ${BASELINE_FILE#$ROOT_DIR/}"
} >&2

exit 1
