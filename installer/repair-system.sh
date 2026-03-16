#!/usr/bin/env bash
# repair-system.sh — GhostStack self-healing repair script
#
# Called automatically by health-check.sh or the ghoststack-monitor systemd service
# when critical failures are detected.
#
# Repair strategy:
#   1. Identify which compose stacks have stopped/unhealthy containers
#   2. Restart only the affected stacks (targeted — not a full restart)
#   3. Verify health after restart
#
# SECURITY:
#   - Does not accept user-supplied service names (no injection vector)
#   - All docker compose args are literal shell constants
#   - Does not use eval or shell=True

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPAIR_LOG="${STACK_DIR}/installer/repair.log"

[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] [repair] $*" | tee -a "$REPAIR_LOG"
}

# ── Compose stack definitions ─────────────────────────────────────────────────
# Format: "label|compose_file|critical"
# critical=1 → restart blocking, critical=0 → best-effort

declare -A STACK_FILES=(
  [ghostchain]="${STACK_DIR}/docker-compose.ghostchain.yml"
  [compliance]="${STACK_DIR}/docker-compose.yml"
  [sovereign]="${STACK_DIR}/docker-compose.sovereign.yml"
  [ghostbrain]="${STACK_DIR}/docker-compose.ghostbrain.yml"
  [supervisor]="${STACK_DIR}/docker-compose.supervisor.yml"
  [portal]="${STACK_DIR}/docker-compose.portal.yml"
)

declare -A STACK_LABELS=(
  [ghostchain]="GhostChain L1 + Hermes"
  [compliance]="Postgres + Redis + Compliance"
  [sovereign]="Sovereign economic services"
  [ghostbrain]="GhostBrain AI stack"
  [supervisor]="Infrastructure Supervisor"
  [portal]="NOC AI Portal"
)

declare -A STACK_CRITICAL=(
  [ghostchain]=1
  [compliance]=1
  [sovereign]=0
  [ghostbrain]=0
  [supervisor]=0
  [portal]=0
)

# ── Helper: check if a compose stack has unhealthy/exited containers ──────────

stack_needs_repair() {
  local compose_file="$1"
  local unhealthy

  [[ -f "$compose_file" ]] || return 1

  unhealthy=$(docker compose -f "$compose_file" ps 2>/dev/null \
    | grep -cE "(Exit|exited|unhealthy|dead)" || true)

  [[ "$unhealthy" -gt 0 ]]
}

# ── Helper: restart a single compose stack ────────────────────────────────────

restart_stack() {
  local key="$1"
  local compose_file="${STACK_FILES[$key]}"
  local label="${STACK_LABELS[$key]}"

  if [[ ! -f "$compose_file" ]]; then
    log "Skipping '$label' — compose file not found"
    return 0
  fi

  log "Restarting: $label"
  docker compose -f "$compose_file" up -d --remove-orphans 2>&1 | \
    while IFS= read -r line; do log "  $line"; done

  log "Restarted: $label"
}

# ── Repair pass ───────────────────────────────────────────────────────────────

log "Starting repair pass..."
REPAIRED=0
FAILED=0

for key in ghostchain compliance sovereign ghostbrain supervisor portal; do
  compose_file="${STACK_FILES[$key]:-}"
  label="${STACK_LABELS[$key]:-$key}"
  critical="${STACK_CRITICAL[$key]:-0}"

  if [[ ! -f "${compose_file:-}" ]]; then
    continue
  fi

  if stack_needs_repair "$compose_file"; then
    log "Unhealthy containers detected in: $label"
    if restart_stack "$key"; then
      (( REPAIRED++ ))
    else
      log "ERROR: Failed to restart $label"
      if [[ "$critical" -eq 1 ]]; then
        (( FAILED++ ))
      fi
    fi
  fi
done

# ── Special case: RPC health check after L1 repair ────────────────────────────

if docker compose -f "${STACK_DIR}/docker-compose.ghostchain.yml" ps 2>/dev/null \
    | grep -q "ghostchaind"; then
  RPC_WAIT=30
  log "Verifying L1 RPC after repair (${RPC_WAIT}s timeout)..."
  deadline=$(( $(date +%s) + RPC_WAIT ))
  while true; do
    resp=$(curl -sf --max-time 5 \
      -X POST -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
      "http://localhost:${L1_EVM_PORT:-18545}" 2>/dev/null || true)
    if echo "$resp" | grep -q '"result"'; then
      log "L1 RPC responding after repair"
      break
    fi
    if [[ $(date +%s) -gt $deadline ]]; then
      log "WARNING: L1 RPC still not responding after repair"
      break
    fi
    sleep 5
  done
fi

# ── Summary ───────────────────────────────────────────────────────────────────

log "Repair complete: ${REPAIRED} stacks restarted, ${FAILED} critical failure(s)"

if [[ "$FAILED" -gt 0 ]]; then
  log "ALERT: Critical stack(s) failed to recover — manual intervention required"
  exit 1
fi

exit 0
