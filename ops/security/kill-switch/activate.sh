#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATUS_FILE="$ROOT_DIR/ops/security/kill-switch/status.json"
SNAPSHOT_DIR=""
MODE="dev"
REASON="manual"
DRY_RUN="false"

usage() {
  cat <<'USAGE'
Usage: activate.sh --snapshot <dir> [--reason <text>] [--mode dev|prod] [--dry-run]
USAGE
}

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --reason) REASON="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    --dry-run) DRY_RUN="true"; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
 done

if [[ -z "$SNAPSHOT_DIR" ]]; then
  echo "Missing --snapshot" >&2
  exit 1
fi

if [[ ! -f "$SNAPSHOT_DIR/chain-data-map.json" ]]; then
  echo "Missing chain-data-map.json in snapshot" >&2
  exit 1
fi

mapfile -t chain_services < <(python3 - "$SNAPSHOT_DIR/chain-data-map.json" <<'PY'
import json,sys
payload=json.load(open(sys.argv[1]))
services=set()
for entry in payload.get("entries",[]):
    if entry.get("chainCandidate"):
        services.add(entry.get("service"))
print("\n".join(sorted(services)))
PY
)

if [[ "$DRY_RUN" == "true" ]]; then
  log "Dry-run kill switch activation. Would stop non-chain services."
else
  running_services=$(docker ps --format '{{.Names}}')
  for svc in $running_services; do
    if printf '%s\n' "${chain_services[@]}" | rg -q "^${svc}$"; then
      continue
    fi
    log "Stopping non-chain service: $svc"
    docker stop "$svc" >/dev/null 2>&1 || true
  done
fi

python3 - "$STATUS_FILE" "$SNAPSHOT_DIR" "$MODE" "$REASON" <<'PY'
import json,sys,datetime

status_path=sys.argv[1]
snapshot=sys.argv[2]
mode=sys.argv[3]
reason=sys.argv[4]

payload={
  "status": "active",
  "activatedAt": datetime.datetime.utcnow().isoformat()+"Z",
  "releasedAt": None,
  "reason": reason,
  "snapshot": snapshot,
  "mode": mode
}

json.dump(payload,open(status_path,"w"),indent=2)
PY

if [[ "${KILL_SWITCH_K8S:-false}" == "true" ]]; then
  "$ROOT_DIR/ops/security/kill-switch/k8s-freeze.sh" \
    --namespace "${K8S_NAMESPACE:-default}" \
    ${K8S_SELECTOR:+--selector "$K8S_SELECTOR"} \
    ${K8S_SCALE_SELECTOR:+--scale-selector "$K8S_SCALE_SELECTOR"} || true
fi

log "Kill switch activated."
