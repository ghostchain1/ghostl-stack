#!/usr/bin/env bash
# GhostStack branding audit — fast ripgrep-based sweep
# Usage: brand-audit.sh [ROOT_DIR]
set -euo pipefail

ROOT="${1:-/home/ghost/ghostl-stack}"
cd "$ROOT"

echo "== GhostStack Branding Audit =="
echo "Root: $ROOT"
echo "Rule: Full branding Ghost/GST everywhere EXCEPT bridges"
echo

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) not found. Install: sudo apt-get install -y ripgrep"
  exit 1
fi

FAIL=0

# ---- Section A: Forbidden user-visible strings (code/config only, no docs) ----
echo "== A) Forbidden Branding (outside bridges, code/config files only) =="

# Docs (.md / .txt) legitimately reference forbidden terms in spec tables.
# The audit script itself is excluded to avoid self-flagging.
# Bridge directories: external naming is permitted here.
rg_forbidden() {
  rg -l --fixed-strings \
    --glob='!*.md' --glob='!*.txt' \
    --glob='!**/node_modules/**' --glob='!**/.git/**' \
    --glob='!**/dist/**' --glob='!**/build/**' \
    --glob='!**/out-codex/**' --glob='!**/out-legacy/**' \
    --glob='!**/.next/**' --glob='!**/.turbo/**' \
    --glob='!**/artifacts/**' --glob='!**/cache/**' \
    --glob='!**/cache-codex/**' --glob='!**/cache-legacy/**' \
    --glob='!**/coverage/**' --glob='!**/vendor/**' --glob='!**/lib/**' \
    --glob='!**/broadcast/**' --glob='!**/evidence/**' --glob='!**/backups/**' \
    --glob='!scripts/brand-audit.sh' \
    --glob='!**/contracts/src/bridge/**' \
    --glob='!**/contracts/bridge/**' --glob='!**/contracts/bridges/**' \
    --glob='!**/services/bridge/**' \
    --glob='!**/services/ghost-bridge/**' --glob='!**/apps/bridge/**' \
    "$1" . 2>/dev/null || true
}

for pattern in 'Insufficient ETH' 'Not enough ETH'; do
  result=$(rg_forbidden "$pattern")
  if [[ -n "$result" ]]; then
    echo "FAIL: Forbidden '$pattern' in:"
    echo "$result" | sed 's/^/    /'
    FAIL=1
  fi
done
echo "OK: Section A done."
echo

# ---- Section B: Required branding anchors (repo-wide) ----
echo "== B) Required Branding Anchors (repo-wide) =="
for anchor in "GhostChain" "GST"; do
  if rg -q --fixed-strings "$anchor" . 2>/dev/null; then
    echo "OK: '$anchor' present"
  else
    echo "FAIL: Missing required branding anchor: $anchor"
    FAIL=1
  fi
done
echo

# ---- Section C: Bridge allowlist report ----
echo "== C) Bridge Allowlist Report (informational) =="
for dir in \
  "./contracts/src/bridge" "./contracts/bridge" "./contracts/bridges" \
  "./services/bridge" "./services/ghost-bridge" "./apps/bridge"
do
  if [[ -d "$dir" ]]; then
    echo "OK: bridge allow-dir exists: $dir"
  else
    echo "INFO: bridge allow-dir not found (ok if unused): $dir"
  fi
done
echo

# ---- Section D: Numeric 'ether' literal in contracts/src (outside bridges) ----
echo "== D) Contracts/src: numeric 'ether' literal check (outside bridges) =="
ether_result=$(
  rg -n --pcre2 '[0-9_] ether\b' \
    --glob='!**/contracts/src/bridge/**' \
    ./contracts/src 2>/dev/null || true
)
if [[ -n "$ether_result" ]]; then
  echo "FAIL: Raw 'ether' literals in ./contracts/src (use GST_UNIT from GhostBrand.sol):"
  echo "$ether_result" | sed 's/^/    /'
  FAIL=1
else
  echo "OK: No numeric 'ether' literals in ./contracts/src."
fi
echo

# ---- Section E: nativeCurrency symbol guard (JSON config files only) ----
echo "== E) JSON config: nativeCurrency symbol guard =="
symeth_result=$(
  rg -n --pcre2 '"symbol"\s*:\s*"ETH"' \
    --glob='*.json' \
    --glob='!**/node_modules/**' --glob='!**/.git/**' \
    --glob='!**/contracts/lib/**' \
    --glob='!**/out-codex/**' --glob='!**/out-legacy/**' \
    --glob='!**/artifacts/**' --glob='!**/broadcast/**' \
    --glob='!**/contracts/src/bridge/**' \
    --glob='!**/docs/**' --glob='!**/evidence/**' --glob='!**/backups/**' \
    . 2>/dev/null || true
)
if [[ -n "$symeth_result" ]]; then
  echo "FAIL: '\"symbol\":\"ETH\"' in JSON config (should be GST):"
  echo "$symeth_result" | sed 's/^/    /'
  FAIL=1
else
  echo "OK: No '\"symbol\":\"ETH\"' in JSON config files."
fi
echo

# ---- Result ----
echo "== Result =="
if [[ "$FAIL" -eq 1 ]]; then
  echo "FAILED. Fix issues above."
  exit 1
fi
echo "PASSED."
