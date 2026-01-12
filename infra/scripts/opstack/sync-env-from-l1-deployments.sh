#!/usr/bin/env bash
# Populate infra/opstack/.env with L1 contract addresses from config/l1-deployments.json.
# Only fills variables that are missing or set to a zero address.
#
# Usage:
#   bash infra/scripts/opstack/sync-env-from-l1-deployments.sh [env-file] [deployments-json]
# Defaults:
#   env-file: infra/opstack/.env
#   deployments-json: infra/opstack/config/l1-deployments.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ENV_FILE="${1:-$REPO_ROOT/infra/opstack/.env}"
DEPLOY_JSON="${2:-$REPO_ROOT/infra/opstack/config/l1-deployments.json}"

if [ ! -f "$ENV_FILE" ]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$DEPLOY_JSON" ]; then
  echo "deployments json not found: $DEPLOY_JSON" >&2
  exit 1
fi

python3 - "$ENV_FILE" "$DEPLOY_JSON" <<'PY'
import json, re, sys, pathlib

env_path = pathlib.Path(sys.argv[1])
deploy_path = pathlib.Path(sys.argv[2])

data = json.loads(deploy_path.read_text())

mapping = {
    "L2_PORTAL_ADDRESS": data.get("OptimismPortalProxy"),
    "OPTIMISM_PORTAL_ADDRESS": data.get("OptimismPortalProxy"),
    "L2_SYSTEM_CONFIG_ADDRESS": data.get("SystemConfigProxy"),
    "SYSTEM_CONFIG_ADDRESS": data.get("SystemConfigProxy"),
    "L2_GAME_FACTORY_ADDRESS": data.get("DisputeGameFactoryProxy"),
    "L2_OUTPUT_ORACLE_ADDRESS": data.get("L2OutputOracleProxy"),
    "L1_STANDARD_BRIDGE_ADDRESS": data.get("L1StandardBridgeProxy"),
    "L1_CROSS_DOMAIN_MESSENGER_ADDRESS": data.get("L1CrossDomainMessengerProxy"),
}

def is_zero(val: str) -> bool:
    return not val or re.fullmatch(r"0x0+", val.strip(), flags=re.IGNORECASE) is not None

lines = env_path.read_text().splitlines()
indices = {}
for idx, line in enumerate(lines):
    m = re.match(r"\s*([A-Za-z0-9_]+)\s*=\s*(.*)", line)
    if m:
        indices[m.group(1)] = idx

updated = False
for key, value in mapping.items():
    if not value:
        continue
    value = value.strip()
    if key in indices:
        idx = indices[key]
        cur = re.match(r"\s*"+re.escape(key)+r"\s*=\s*(.*)", lines[idx]).group(1).strip()
        if is_zero(cur):
            lines[idx] = f"{key}={value}"
            updated = True
    else:
        lines.append(f"{key}={value}")
        updated = True

if updated:
    env_path.write_text("\n".join(lines) + "\n")
    print(f"Updated {env_path}")
else:
    print("No changes needed; env already populated.")
PY
