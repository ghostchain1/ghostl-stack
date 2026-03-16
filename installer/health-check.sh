#!/usr/bin/env bash
# health-check.sh — Continuous GhostStack health monitor
#
# Runs periodic health checks across all service tiers.
# If a failure is detected, triggers repair-system.sh automatically.
#
# Usage:
#   bash installer/health-check.sh               # runs once
#   bash installer/health-check.sh --loop        # loops indefinitely
#   bash installer/health-check.sh --interval 60 # custom interval (seconds)
#
# This script is also invoked by the ghoststack-monitor systemd service.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

LOOP_MODE=0
INTERVAL="${HEALTH_CHECK_INTERVAL:-30}"
REPAIR_COOLDOWN="${REPAIR_COOLDOWN:-120}"  # seconds between auto-repairs
LAST_REPAIR_TIME=0

# ── Argument parsing ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --loop)              LOOP_MODE=1 ;;
    --interval)          INTERVAL="${2:?'--interval requires a value'}"; shift ;;
    --repair-cooldown)   REPAIR_COOLDOWN="${2:?'--repair-cooldown requires a value'}"; shift ;;
    --help|-h)
      echo "Usage: bash health-check.sh [--loop] [--interval N] [--repair-cooldown N]"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
  shift
done

log() { echo "[health-check] $(date '+%H:%M:%S') $*"; }

# ── Service check definitions ─────────────────────────────────────────────────
# Format: "label|url_or_port|type|required"
#   type: http | rpc | tcp
#   required: 1=critical, 0=warning

CHECKS=(
  # Blockchain (critical)
  "GhostChain L1 RPC|${L1_EVM_PORT:-18545}|rpc|1"
  "GhostL2 RPC|${L2_RPC_PORT:-29545}|rpc|1"
  "GhostL3 RPC|${L3_RPC_PORT:-39545}|rpc|0"

  # Applications (critical)
  "GhostStack API|http://localhost:${API_PORT:-4000}/health|http|1"

  # Sovereign services (warning)
  "Treasury Engine|http://localhost:${TREASURY_ENGINE_PORT:-7683}/health|http|0"
  "L3 Fee Collector|http://localhost:${L3_FEE_COLLECTOR_PORT:-7681}/health|http|0"
  "L2 Revenue Aggregator|http://localhost:${L2_REVENUE_AGGREGATOR_PORT:-7682}/health|http|0"
  "Reward Distributor|http://localhost:${REWARD_DISTRIBUTOR_PORT:-7684}/health|http|0"

  # GhostBrain AI (warning)
  "GhostBrain Core|http://localhost:${GHOSTBRAIN_CORE_PORT:-7900}/health|http|0"
  "GhostBrain Orchestrator|http://localhost:7895/health|http|0"

  # Infrastructure (warning)
  "Postgres|5432|tcp|0"
  "Redis|6379|tcp|0"
)

# ── Single pass health check ──────────────────────────────────────────────────

run_checks() {
  local failures=0
  local warnings=0

  for check in "${CHECKS[@]}"; do
    IFS='|' read -r label endpoint type required <<< "$check"
    local ok=0

    case "$type" in
      http)
        if curl -sf --max-time 6 "$endpoint" -o /dev/null 2>/dev/null; then
          ok=1
        fi
        ;;
      rpc)
        local port="$endpoint"
        local resp
        resp=$(curl -sf --max-time 6 \
          -X POST -H "Content-Type: application/json" \
          --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
          "http://localhost:${port}" 2>/dev/null || true)
        echo "$resp" | grep -q '"result"' && ok=1
        ;;
      tcp)
        local port="$endpoint"
        timeout 5 bash -c "echo > /dev/tcp/127.0.0.1/${port}" 2>/dev/null && ok=1
        ;;
    esac

    if [[ "$ok" -eq 1 ]]; then
      : # log "  OK: $label"
    else
      if [[ "$required" -eq 1 ]]; then
        log "CRITICAL: $label is not responding"
        (( failures++ ))
      else
        log "WARNING:  $label is not responding"
        (( warnings++ ))
      fi
    fi
  done

  echo "$failures $warnings"
}

# ── Repair trigger ─────────────────────────────────────────────────────────────

maybe_repair() {
  local failures="$1"
  local now
  now=$(date +%s)
  local elapsed=$(( now - LAST_REPAIR_TIME ))

  if [[ "$failures" -gt 0 ]]; then
    if [[ "$elapsed" -lt "$REPAIR_COOLDOWN" ]]; then
      log "Repair cooldown active — ${elapsed}s elapsed / ${REPAIR_COOLDOWN}s required"
      return 0
    fi

    log "Auto-repair triggered (${failures} critical failure(s))..."
    LAST_REPAIR_TIME="$now"

    if [[ -f "${SCRIPT_DIR}/repair-system.sh" ]]; then
      bash "${SCRIPT_DIR}/repair-system.sh" 2>&1 | \
        while IFS= read -r line; do log "  repair: $line"; done
    else
      log "ERROR: repair-system.sh not found at ${SCRIPT_DIR}/repair-system.sh"
    fi
  fi
}

# ── Main loop ─────────────────────────────────────────────────────────────────

log "GhostStack health monitor starting (loop=${LOOP_MODE}, interval=${INTERVAL}s)"

run_one_pass() {
  read -r failure_count warning_count <<< "$(run_checks)"
  if [[ "$failure_count" -eq 0 && "$warning_count" -eq 0 ]]; then
    log "All services healthy"
  elif [[ "$failure_count" -eq 0 ]]; then
    log "${warning_count} warning(s) — no critical failures"
  else
    log "${failure_count} critical failure(s), ${warning_count} warning(s)"
    maybe_repair "$failure_count"
  fi
}

if [[ "$LOOP_MODE" -eq 1 ]]; then
  while true; do
    run_one_pass
    sleep "$INTERVAL"
  done
else
  run_one_pass
fi
