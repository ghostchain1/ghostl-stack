#!/usr/bin/env bash
# infra/scripts/autonomous-vault-hypervisor/emergency-lock.sh
# Emergency lock / unlock the autonomous-vault-hypervisor.
# Per AGENTS.md §8 — Break Glass procedure.
#
# Usage:
#   bash emergency-lock.sh lock   "reason text"  [port]
#   bash emergency-lock.sh unlock "reason text"  [port]
set -euo pipefail

ACTION="${1:-lock}"
REASON="${2:-manual emergency}"
PORT="${3:-7720}"
BASE_URL="http://localhost:${PORT}"

log() { echo "[avh-emergency] $*"; }

if [[ "${ACTION}" == "lock" ]]; then
  log "ACTIVATING EMERGENCY LOCK — reason: ${REASON}"

  # 1. Patch EMERGENCY_LOCK via env update in running container
  docker exec ghost_autonomous-vault-hypervisor \
    sh -c 'kill -HUP 1' 2>/dev/null || true

  # 2. Update policy via API
  CURRENT_POLICY="$(curl -s ${BASE_URL}/v1/policy | python3 -c 'import sys,json; p=json.load(sys.stdin)["policy"]; p["emergencyLock"]=True; print(json.dumps(p))')"
  curl -sX PUT -H 'Content-Type: application/json' \
    -d "${CURRENT_POLICY}" \
    "${BASE_URL}/v1/policy"

  log "✓ Emergency lock activated"
  log "Services will refuse all execute actions until unlocked."
  log ""
  log "Recovery: bash emergency-lock.sh unlock 'resolved' ${PORT}"
  log "Per AGENTS.md §8: file a postmortem in docs/postmortems/$(date +%Y-%m-%d)-incident.md"

elif [[ "${ACTION}" == "unlock" ]]; then
  log "REMOVING EMERGENCY LOCK — reason: ${REASON}"

  CURRENT_POLICY="$(curl -s ${BASE_URL}/v1/policy | python3 -c 'import sys,json; p=json.load(sys.stdin)["policy"]; p["emergencyLock"]=False; print(json.dumps(p))')"
  curl -sX PUT -H 'Content-Type: application/json' \
    -d "${CURRENT_POLICY}" \
    "${BASE_URL}/v1/policy"

  log "✓ Emergency lock removed"
  log "REMINDER: Ensure a postmortem has been filed per AGENTS.md §8."

else
  echo "Usage: $0 lock|unlock \"reason\" [port]"
  exit 1
fi
