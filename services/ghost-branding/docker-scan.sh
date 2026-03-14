#!/usr/bin/env bash
# GhostStack Docker Branding Firewall
# Fails CI if any Ethereum-branded Docker images are present.

set -euo pipefail

echo "GhostStack Docker Branding Scanner — checking running images..."

VIOLATIONS=0

check_image() {
  local name="$1"
  if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qi "$name"; then
    echo "[VIOLATION] Banned Docker image found: $name"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

check_image "ethereum"
check_image "parity"
check_image "besu"
check_image "nethermind"
check_image "erigon"

# Geth is allowed only if renamed to ghost-geth
if docker images --format "{{.Repository}}" | grep -qi "^geth$"; then
  echo "[VIOLATION] Plain 'geth' image found — rename to ghost-geth or use GhostChain image."
  VIOLATIONS=$((VIOLATIONS + 1))
fi

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "[FAILED] $VIOLATIONS Docker branding violation(s). Use Ghost-native images only."
  exit 1
else
  echo "[PASSED] Docker environment is Ghost-native."
fi
