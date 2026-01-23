#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATUS_FILE="$ROOT_DIR/ops/security/kill-switch/status.json"
MODE="dev"
REASON="manual_release"

usage() {
  cat <<'USAGE'
Usage: release.sh [--mode dev|prod] [--reason <text>]
USAGE
}

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2;;
    --reason) REASON="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
 done

python3 - "$STATUS_FILE" "$MODE" "$REASON" <<'PY'
import json,sys,datetime
status_path=sys.argv[1]
mode=sys.argv[2]
reason=sys.argv[3]

payload={
  "status": "released",
  "activatedAt": None,
  "releasedAt": datetime.datetime.utcnow().isoformat()+"Z",
  "reason": reason,
  "snapshot": None,
  "mode": mode
}

json.dump(payload,open(status_path,"w"),indent=2)
PY

if [[ "${KILL_SWITCH_K8S:-false}" == "true" ]]; then
  "$ROOT_DIR/ops/security/kill-switch/k8s-release.sh" \
    --namespace "${K8S_NAMESPACE:-default}" \
    ${K8S_SELECTOR:+--selector "$K8S_SELECTOR"} || true
fi

log "Kill switch released."
