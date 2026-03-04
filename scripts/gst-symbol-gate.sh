#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[gst-symbol-gate] %s\n' "$*"; }
fail() { printf '[gst-symbol-gate][FAIL] %s\n' "$*" >&2; exit 1; }

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
  ':!backups/**'
  ':!infra/docker/_backup/**'
  ':!infra/docker/runtime/**'
  ':!infra/docker/audit/**'
  ':!infra/opstack/broadcast/**'
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
  ':!docs/**'
  ':!evidence/**'
  ':!backups/**'
  ':!node_modules/**'
  ':!contracts/lib/**'
  ':!infra/opstack/broadcast/**'
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

if [ -z "$matches" ] && [ -z "$eth_matches" ] && [ -z "$ether_sol_matches" ]; then
  log "OK: no forbidden legacy GHOST symbol tokens found. GATE PASSED"
  exit 0
fi

if [ -n "$matches" ]; then
  {
    echo "Forbidden legacy/non-canonical gas token symbols detected (GST-native policy violation):"
    echo "  Banned: GHOST, gGHOST, GTK, GTL2, GTL3 — all layers must use GST (Ghost) as native currency."
    echo
    echo "$matches" | head -n 200
    if [ "$(echo "$matches" | wc -l | tr -d ' ')" -gt 200 ]; then
      echo "... (truncated)"
    fi
    echo
    echo "If this is an intentional historical reference, move it under docs/gst-migration/ or docs/rollback/."
  } >&2
fi

if [ -n "$eth_matches" ]; then
  {
    echo "ETH used as native currency symbol in config file (GST-native policy violation):"
    echo "  All chains must declare nativeCurrency symbol = GST, not ETH."
    echo "  Note: CLI flag names (--l1-eth-rpc) and RPC namespaces (eth_chainId) are NOT flagged by this rule."
    echo
    echo "$eth_matches" | head -n 50
    echo
    echo "Fix: set COIN=GST, GAS_TOKEN_SYMBOL=GST, or nativeCurrency.symbol=GST."
  } >&2
fi

if [ -n "$ether_sol_matches" ]; then
  {
    echo "Raw 'ether' unit keyword found in Solidity src (GST branding policy violation):"
    echo "  Use GST_UNIT (from GhostBrand.sol) instead of '1 ether' so branding stays sovereign and auditable."
    echo
    echo "$ether_sol_matches" | head -n 50
    echo
    echo "Fix: import GhostBrand.sol, inherit it, and use GST_UNIT in place of ether literals."
  } >&2
fi

exit 1
