#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
STACK_ENV="${STACK_ENV:-$ROOT_DIR/services/stack.env}"
POLICY_OUT="${AI_VAULT_POLICY_OUT:-$ROOT_DIR/services/ai-vault/policy.generated.json}"

SECRET_PATHS="${AI_VAULT_SECRET_PATHS:-}"
ROTATE_PATHS="${AI_VAULT_ROTATE_PATHS:-}"

if [ -z "$SECRET_PATHS" ] && [ -f "$STACK_ENV" ]; then
  SECRET_PATHS="$(python3 - <<'PY' "$STACK_ENV"
import sys
path = sys.argv[1]
value = ""
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k == "AI_VAULT_SECRET_PATHS":
            value = v.strip()
            break
print(value)
PY
)"
fi

if [ -z "$ROTATE_PATHS" ] && [ -f "$STACK_ENV" ]; then
  ROTATE_PATHS="$(python3 - <<'PY' "$STACK_ENV"
import sys
path = sys.argv[1]
value = ""
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k == "AI_VAULT_ROTATE_PATHS":
            value = v.strip()
            break
print(value)
PY
)"
fi

SECRET_PATHS="${SECRET_PATHS:-ghostchain/services}"

python3 - <<'PY' "$SECRET_PATHS" "$ROTATE_PATHS" "$POLICY_OUT"
import json, sys
secret_paths = [p.strip() for p in sys.argv[1].split(",") if p.strip()]
rotate_paths = [p.strip() for p in sys.argv[2].split(",") if p.strip()]
out_path = sys.argv[3]

def to_prefix(mount_path, kind):
    if "/" not in mount_path:
        mount = mount_path
        path = ""
    else:
        mount, path = mount_path.split("/", 1)
    base = f"/v1/{mount}/{kind}"
    return f"{base}/{path}" if path else base

allow = []
for p in secret_paths:
    allow.append({"pathPrefix": to_prefix(p, "data"), "methods": ["GET", "LIST"]})
    allow.append({"pathPrefix": to_prefix(p, "metadata"), "methods": ["GET", "LIST"]})

rotate = []
for p in rotate_paths:
    if "/" in p:
        mount, path = p.split("/", 1)
    else:
        mount, path = p, ""
    rotate.append({
        "mount": mount,
        "path": path,
        "kvVersion": 2,
        "keys": [],
        "encoding": "base64",
        "intervalMinutes": 1440
    })

policy = {
    "allow": allow,
    "deny": [
        {"pathPrefix": "/v1/secret/prod", "methods": ["PUT", "DELETE"]}
    ],
    "rotate": rotate,
    "anomaly": {
        "rateLimitPerMinute": 120,
        "burst": 40,
        "blockMs": 300000
    }
}

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(policy, f, indent=2)
    f.write("\n")
print(f"OK: wrote {out_path}")
PY
