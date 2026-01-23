#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
INV="$ROOT_DIR/infra/docker/audit/docker-inventory.json"
CORE="$ROOT_DIR/infra/docker/compose/docker-compose.core.yml"
SERVICES="$ROOT_DIR/infra/docker/compose/docker-compose.services.yml"
CFG="$ROOT_DIR/infra/docker/audit/docker-compose-configs.json"

fail() { echo "FAIL: $*"; exit 1; }

chain_services=$(jq -r '.services[] | select(.flags.is_chain_service==true and .runtime.running==true) | [.name, .composeFile] | @tsv' "$INV")

while IFS=$'\t' read -r svc svc_file; do
  [[ -z "$svc" ]] && continue
  # Ensure service exists in unified core file
  case "$svc_file" in
    infra/ghostchain/*|infra/opstack/*)
      target_compose="$CORE"
      ;;
    services/docker-compose.yml|core-service/docker-compose.yml|docker-compose.yml)
      target_compose="$SERVICES"
      ;;
    *)
      target_compose="$CORE"
      if ! jq -e --arg svc "$svc" '.services[$svc]' "$CORE" >/dev/null; then
        if jq -e --arg svc "$svc" '.services[$svc]' "$SERVICES" >/dev/null; then
          target_compose="$SERVICES"
        else
          fail "chain service missing in unified compose files: $svc"
        fi
      fi
      ;;
  esac

  # Compare container_name when defined
  orig_cn=$(jq -r --arg svc "$svc" --arg file "$svc_file" '.[] | select(.file==$file) | .config.services[$svc].container_name // empty' "$CFG")
  new_cn=$(jq -r --arg svc "$svc" '.services[$svc].container_name // empty' "$target_compose")
  if [[ -n "$orig_cn" && "$orig_cn" != "null" && "$orig_cn" != "$new_cn" ]]; then
    fail "container_name mismatch for $svc (orig=$orig_cn new=$new_cn)"
  fi

  # Compare ports (string compare of sorted JSON)
  orig_ports=$(jq -c --arg svc "$svc" --arg file "$svc_file" '.[] | select(.file==$file) | (.config.services[$svc].ports // []) | sort' "$CFG")
  new_ports=$(jq -c --arg svc "$svc" '(.services[$svc].ports // []) | sort' "$target_compose")
  if [[ "$orig_ports" != "$new_ports" ]]; then
    fail "ports mismatch for $svc"
  fi

  # Compare volumes (string compare of sorted JSON)
  orig_vols=$(jq -c --arg svc "$svc" --arg file "$svc_file" '.[] | select(.file==$file) | (.config.services[$svc].volumes // []) | sort' "$CFG")
  new_vols=$(jq -c --arg svc "$svc" '(.services[$svc].volumes // []) | sort' "$target_compose")
  if [[ "$orig_vols" != "$new_vols" ]]; then
    fail "volumes mismatch for $svc"
  fi

done <<< "$chain_services"

echo "PASS: compose diff checks ok"
