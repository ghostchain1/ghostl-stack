#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INV="$ROOT_DIR/infra/docker/audit/docker-inventory.json"
CORE="$ROOT_DIR/infra/docker/compose/docker-compose.core.yml"
CFG="$ROOT_DIR/infra/docker/audit/docker-compose-configs.json"

fail() { echo "FAIL: $*"; exit 1; }

chain_services=$(jq -r '.services[] | select(.flags.is_chain_service==true) | .name' "$INV")

for svc in $chain_services; do
  # Ensure service exists in unified core file
  if ! jq -e --arg svc "$svc" '.services[$svc]' "$CORE" >/dev/null; then
    fail "chain service missing in core compose: $svc"
  fi

  # Compare container_name when defined
  orig_cn=$(jq -r --arg svc "$svc" '[.[] | .config.services[$svc].container_name // empty] | .[0]' "$CFG")
  new_cn=$(jq -r --arg svc "$svc" '.services[$svc].container_name // empty' "$CORE")
  if [[ -n "$orig_cn" && "$orig_cn" != "$new_cn" ]]; then
    fail "container_name mismatch for $svc (orig=$orig_cn new=$new_cn)"
  fi

  # Compare ports (string compare of sorted JSON)
  orig_ports=$(jq -c --arg svc "$svc" '[.[] | .config.services[$svc].ports // []] | add | sort' "$CFG")
  new_ports=$(jq -c --arg svc "$svc" '(.services[$svc].ports // []) | sort' "$CORE")
  if [[ "$orig_ports" != "$new_ports" ]]; then
    fail "ports mismatch for $svc"
  fi

  # Compare volumes (string compare of sorted JSON)
  orig_vols=$(jq -c --arg svc "$svc" '[.[] | .config.services[$svc].volumes // []] | add | sort' "$CFG")
  new_vols=$(jq -c --arg svc "$svc" '(.services[$svc].volumes // []) | sort' "$CORE")
  if [[ "$orig_vols" != "$new_vols" ]]; then
    fail "volumes mismatch for $svc"
  fi

done

echo "PASS: compose diff checks ok"
