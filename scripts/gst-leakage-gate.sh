#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[gst-leakage-gate] %s\n' "$*"; }
fail() { printf '[gst-leakage-gate][FAIL] %s\n' "$*" >&2; exit 1; }

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
PATTERN='(\bETH\b|(?i:\bethereum\b)|\bEther\b|Ξ|(?i:\b[a-z0-9-]+\.eth\b)|\bETH_[A-Z0-9_]+\b|\b[A-Z0-9_]+_ETH\b|\b[A-Za-z0-9_]+_eth\b|(?<![A-Za-z0-9])_eth\b|\bnativeEth\b|\bethAmount\b|\bethBalance\b|\bETH_DECIMALS\b|\bETHERSCAN\b|\bALCHEMY_ETH\b|\bINFURA_ETH\b)'
PATTERN_GREP='(^|[^A-Za-z0-9_])ETH([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])[Ee]thereum([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])Ether([^A-Za-z0-9_]|$)|Ξ|[A-Za-z0-9-]+\.eth([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ETH_[A-Z0-9_]+([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])[A-Z0-9_]+_ETH([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])[A-Za-z0-9_]+_eth([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])_eth([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])nativeEth([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ethAmount([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ethBalance([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ETH_DECIMALS([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ETHERSCAN([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])ALCHEMY_ETH([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])INFURA_ETH([^A-Za-z0-9_]|$)'

if [ "$HAS_RG" -eq 1 ]; then
  matches="$(rg -n --no-heading --pcre2 "$PATTERN" . "${rg_globs[@]}" || true)"
else
  matches="$(
    while IFS= read -r -d '' file; do
      # Skip submodule/gitlink entries and other non-file paths.
      [ -f "$file" ] || continue
      case "$file" in
        docs/gst-migration/*|scripts/gst-leakage-gate.sh|config/gst-allowlist.txt|backups/*|infra/docker/_backup/*|infra/opstack/optimism-upstream/*|infra/opstack/op-geth/*|contracts/lib/*|*/node_modules/*|*/dist/*|*/.next/*|*/.next-*/*|*/build/*|*/out/*|*/out-*/*|*/cache/*|*/cache-*/*|*/artifacts/*|*/.foundry-out/*|package-lock.json|*/package-lock.json)
          continue
          ;;
      esac
      printf '%s\0' "$file"
    done < <(git ls-files -z -- .) \
      | xargs -0 -r grep -n -I -E "$PATTERN_GREP" || true
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
