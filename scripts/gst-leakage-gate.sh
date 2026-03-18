#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[gst-leakage-gate] %s\n' "$*"; }
fail() { printf '[gst-leakage-gate][FAIL] %s\n' "$*" >&2; exit 1; }

BASELINE_FILE="${BASELINE_FILE:-$ROOT_DIR/config/gst-leakage-baseline.txt}"
MODE="${1:-check}"

if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  cat <<'USAGE'
Usage:
  bash scripts/gst-leakage-gate.sh
  bash scripts/gst-leakage-gate.sh --print
  bash scripts/gst-leakage-gate.sh --update-baseline

Env:
  BASELINE_FILE=config/gst-leakage-baseline.txt
USAGE
  exit 0
fi

HAS_RG=0
if command -v rg >/dev/null 2>&1; then
  HAS_RG=1
else
  log "WARN: rg (ripgrep) not found; using grep fallback (slower)"
fi

ALLOWLIST_FILE="${ALLOWLIST_FILE:-$ROOT_DIR/config/gst-allowlist.txt}"
allowlist_globs=()

rg_globs=(
	--hidden
	--glob '!.git/**'
	--glob '!docs/gst-migration/**'
	--glob '!scripts/gst-leakage-gate.sh'
	--glob '!config/gst-allowlist.txt'
	--glob '!config/gst-leakage-baseline.txt'
	--glob '!config/gst-symbol-baseline.txt'
	--glob '!ops/policy/no-eth-rpc-baseline.txt'
	--glob '!backups/**'
	--glob '!infra/docker/_backup/**'
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
  --glob '!**/package-lock.json'
)

if [ -f "$ALLOWLIST_FILE" ]; then
  while IFS= read -r raw; do
    line="$(printf '%s' "$raw" | sed 's/#.*$//' | xargs || true)"
    if [ -z "$line" ]; then
      continue
    fi
    rg_globs+=(--glob "!$line")
    allowlist_globs+=("$line")
  done <"$ALLOWLIST_FILE"
fi

# Policy:
# - Business/branding legacy EVM-mainnet token semantics are forbidden.
# - JSON-RPC `eth_*` method names are allowed for compatibility and are NOT checked here.
#
# This gate intentionally focuses on user-facing tokens and common identifier patterns.
PATTERN='(\bETH\b|(?i:\bethereum\b)|\bEther\b|Ξ|(?i:\b[a-z0-9-]+\.eth\b)|\bETH_[A-Z0-9_]+\b|\b[A-Z0-9_]+_ETH\b|\b[A-Za-z0-9_]+_eth\b|(?<![A-Za-z0-9])_eth\b|\bnativeEth\b|\bethAmount\b|\bethBalance\b|\bETH_DECIMALS\b|\bghostCAN\b|\bALCHEMY_ETH\b|\bINFURA_ETH\b)'
PATTERN_GREP='(^|[^A-Za-z0-9_])ETH([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])[Ee]thereum([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])Ether([^A-Za-z0-9_]|$)|Ξ|[A-Za-z0-9-]+\.eth([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ETH_[A-Z0-9_]+([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])[A-Z0-9_]+_ETH([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])[A-Za-z0-9_]+_eth([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])_eth([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])nativeEth([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ethAmount([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ethBalance([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ETH_DECIMALS([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ghostCAN([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ALCHEMY_ETH([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])INFURA_ETH([^A-Za-z0-9_]|$)'

if [ "$HAS_RG" -eq 1 ]; then
  matches="$(rg -n --no-heading --pcre2 "$PATTERN" . "${rg_globs[@]}" || true)"
else
  matches="$(
    git grep -n -I -E "$PATTERN_GREP" -- . \
      ':!docs/gst-migration/**' \
      ':!scripts/gst-leakage-gate.sh' \
      ':!config/gst-allowlist.txt' \
      ':!config/gst-leakage-baseline.txt' \
      ':!config/gst-symbol-baseline.txt' \
      ':!ops/policy/no-eth-rpc-baseline.txt' \
      ':!backups/**' \
      ':!infra/docker/_backup/**' \
      ':!infra/opstack/optimism-upstream/**' \
      ':!infra/opstack/op-geth/**' \
      ':!contracts/lib/**' \
      ':!**/node_modules/**' \
      ':!**/dist/**' \
      ':!**/.next/**' \
      ':!**/build/**' \
      ':!**/out/**' \
      ':!**/cache/**' \
      ':!**/artifacts/**' \
      ':!**/package-lock.json' || true
  )"
fi
if [ -n "$matches" ]; then
  # Allowlist a handful of technical-only occurrences that are not business/branding semantics.
  #
  # Hyperledger Besu uses `ETH` as the RPC module name in `--rpc-http-api=...` lists.
  # We still forbid other uses of `ETH` in strings/identifiers.
  if [ "$HAS_RG" -eq 1 ]; then
    matches="$(printf '%s\n' "$matches" | rg -v --pcre2 '(--rpc-http-api=|rpc-http-api[:=]\s*)ETH(,|\b)' || true)"
    # Allow technical dependency import paths that are not branding semantics.
    matches="$(printf '%s\n' "$matches" | rg -v --pcre2 'github\.com/ethereum(-optimism)?/' || true)"
    # Allow upstream Docker image references (technical dependency, not user-facing branding).
    matches="$(printf '%s\n' "$matches" | rg -v --pcre2 'ethereum/client-go[:@]' || true)"
  else
    matches="$(printf '%s\n' "$matches" | grep -E -v '(--rpc-http-api=|rpc-http-api[:=][[:space:]]*)ETH(,|[^A-Za-z0-9_]|$)' || true)"
    # Allow technical dependency import paths that are not branding semantics.
    matches="$(printf '%s\n' "$matches" | grep -E -v 'github\.com/ethereum(-optimism)?/' || true)"
    # Allow upstream Docker image references (technical dependency, not user-facing branding).
    matches="$(printf '%s\n' "$matches" | grep -E -v 'ethereum/client-go[:@]' || true)"
  fi
fi

if [ -n "$matches" ] && [ "${#allowlist_globs[@]}" -gt 0 ]; then
  filtered=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    path="${line%%:*}"
    path="${path#./}"
    skip=0
    for allow in "${allowlist_globs[@]}"; do
      if [[ "$path" == $allow ]]; then
        skip=1
        break
      fi
    done
    if [ "$skip" -eq 0 ]; then
      filtered+="$line"$'\n'
    fi
  done <<<"$matches"
  matches="${filtered%$'\n'}"
fi
if [ -z "$matches" ]; then
  findings=""
else
  findings="$(printf '%s\n' "$matches" | sed -E 's#^\./##; s#^([^:]+):[0-9]+:#\1\t#' | sort -u)"
fi

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
  fail "missing baseline file: ${BASELINE_FILE#$ROOT_DIR/} (run: bash scripts/gst-leakage-gate.sh --update-baseline)"
fi

current="$(mktemp)"
baseline="$(mktemp)"
printf '%s\n' "$findings" | sed '/^$/d' | sort -u >"$current"
sed 's#^\./##' "$BASELINE_FILE" | sort -u >"$baseline"

new="$(comm -13 "$baseline" "$current" || true)"
if [ -z "$new" ]; then
  log "OK: no new forbidden ETH branding tokens found."
  exit 0
fi

{
  echo "New forbidden ETH branding tokens detected (GST-native policy violation):"
  echo
  printf '%s\n' "$new" | sed -n '1,200p'
  if [ "$(printf '%s\n' "$new" | wc -l | tr -d ' ')" -gt 200 ]; then
    echo "... (truncated)"
  fi
  echo
  if [ -f "$ALLOWLIST_FILE" ]; then
    echo "Allowlist file: ${ALLOWLIST_FILE#$ROOT_DIR/}"
  else
    echo "Allowlist file missing (optional): ${ALLOWLIST_FILE#$ROOT_DIR/}"
  fi
  echo "Baseline file: ${BASELINE_FILE#$ROOT_DIR/}"
} >&2

exit 1
