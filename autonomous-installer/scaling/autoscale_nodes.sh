#!/usr/bin/env bash
# GhostStack Autonomous Installer — Autoscale Nodes
#
# Reads the current metrics snapshot and emits an advisory scaling
# recommendation to the signing relay for human ratification.
#
# SAFETY INVARIANTS
# -----------------
# This script NEVER adds or removes nodes autonomously.
# All recommendations are proposals posted to the signing relay;
# they require a governance quorum to execute.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
METRICS_FILE="${ROOT}/.tmp/metrics_snapshot.json"

info() { echo "[$(date +%H:%M:%S)] [autoscale_nodes] $*"; }
warn() { echo "[$(date +%H:%M:%S)] [autoscale_nodes] WARN  $*" >&2; }

RELAY_URL="${SIGNING_RELAY_URL:-http://localhost:7910}"
RELAY_TIMEOUT_S="${AUTOSCALE_RELAY_TIMEOUT_S:-8}"

# Thresholds (all as integers — bash arithmetic)
# CPU idle < 20  => >80% utilisation => scale-up candidate
# CPU idle > 70  => <30% utilisation => scale-down candidate
SCALE_UP_CPU_IDLE_THRESHOLD="${AUTOSCALE_SCALE_UP_CPU_IDLE:-20}"
SCALE_DOWN_CPU_IDLE_THRESHOLD="${AUTOSCALE_SCALE_DOWN_CPU_IDLE:-70}"
RAM_SCALE_UP_USED_THRESHOLD="${AUTOSCALE_RAM_UP_PCT:-85}"
L2_LAG_SCALE_UP_THRESHOLD="${AUTOSCALE_L2_LAG_BLOCKS:-50}"
L3_LAG_SCALE_UP_THRESHOLD="${AUTOSCALE_L3_LAG_BLOCKS:-100}"

# ---------------------------------------------------------------------------
# Read metrics snapshot
# ---------------------------------------------------------------------------

if [[ ! -f "${METRICS_FILE}" ]]; then
  warn "Metrics snapshot not found at ${METRICS_FILE}. Run metrics_collector.sh first."
  exit 1
fi

read_metric() {
  local key="$1"
  jq -r "${key}" "${METRICS_FILE}" 2>/dev/null
}

cpu_idle="$(read_metric '.cpu_idle_pct')"
ram_used="$(read_metric '.ram_used_pct')"
l2_lag="$(read_metric '.l2_lag_blocks')"
l3_lag="$(read_metric '.l3_lag_blocks')"
ts="$(read_metric '.timestamp')"

# Validate — if any metric is null/"", skip.
if [[ -z "${cpu_idle}" || "${cpu_idle}" == "null" ]]; then
  warn "cpu_idle_pct missing from metrics snapshot — skipping autoscale check."
  exit 0
fi

# Convert to integers for bash arithmetic (strip decimals if present).
cpu_idle_int="${cpu_idle%.*}"
ram_used_int="${ram_used%.*}"
l2_lag_int="${l2_lag:-0}"
l3_lag_int="${l3_lag:-0}"

info "Metrics @ ${ts}: cpu_idle=${cpu_idle_int}% ram_used=${ram_used_int}% l2_lag=${l2_lag_int} l3_lag=${l3_lag_int}"

# ---------------------------------------------------------------------------
# Decide recommendation
# ---------------------------------------------------------------------------

RECOMMENDATION="none"
REASON=""

if (( cpu_idle_int < SCALE_UP_CPU_IDLE_THRESHOLD || ram_used_int >= RAM_SCALE_UP_USED_THRESHOLD ||
      l2_lag_int >= L2_LAG_SCALE_UP_THRESHOLD     || l3_lag_int >= L3_LAG_SCALE_UP_THRESHOLD )); then
  RECOMMENDATION="scale_up"
  REASON="High load: cpu_idle=${cpu_idle_int}% ram_used=${ram_used_int}% l2_lag=${l2_lag_int} l3_lag=${l3_lag_int}"
elif (( cpu_idle_int > SCALE_DOWN_CPU_IDLE_THRESHOLD && ram_used_int < 40 )); then
  RECOMMENDATION="scale_down"
  REASON="Low load: cpu_idle=${cpu_idle_int}% ram_used=${ram_used_int}%"
fi

if [[ "${RECOMMENDATION}" == "none" ]]; then
  info "Load is within normal range — no scaling proposal needed."
  exit 0
fi

info "Scaling recommendation: ${RECOMMENDATION} — ${REASON}"
info "Submitting advisory proposal to signing relay (human ratification required)…"

PROPOSAL="$(jq -n \
  --arg id  "scale-$(date +%s)" \
  --arg rec "${RECOMMENDATION}" \
  --arg rs  "${REASON}" \
  --argjson ci "14000101" \
  --argjson cpu_i "${cpu_idle_int}" \
  --argjson ram_u "${ram_used_int}" \
  --argjson l2l   "${l2_lag_int}" \
  --argjson l3l   "${l3_lag_int}" \
  '{
    proposal_id: $id,
    type: "scaling",
    recommendation: $rec,
    reason: $rs,
    chain_id: $ci,
    gas_token: "GST",
    from: "ghostbrain-autoscaler",
    metrics: {
      cpu_idle_pct: $cpu_i,
      ram_used_pct: $ram_u,
      l2_lag_blocks: $l2l,
      l3_lag_blocks: $l3l
    },
    advisory_only: true
  }')"

resp="$(curl -sf --max-time "${RELAY_TIMEOUT_S}" \
  -X POST \
  -H "Content-Type: application/json" \
  --data "${PROPOSAL}" \
  "${RELAY_URL}/relay/scaling/propose" 2>/dev/null)" || {
  warn "Signing relay unavailable — scaling proposal not submitted."
  exit 1
}

proposal_id="$(echo "${resp}" | jq -r '.proposal_id // "unknown"' 2>/dev/null)"
info "Scaling proposal submitted (id=${proposal_id}). Awaiting governance ratification."
exit 0
