#!/usr/bin/env bash
set -Eeuo pipefail

L3_URL="${L3_FEE_COLLECTOR_URL:-http://localhost:7681}"
L2_URL="${L2_REVENUE_AGGREGATOR_URL:-http://localhost:7682}"
TREASURY_URL="${TREASURY_ENGINE_URL:-http://localhost:7683}"
REWARDS_URL="${REWARD_DISTRIBUTOR_URL:-http://localhost:7684}"
GOVERNOR_URL="${HYPER_GHOST_GOVERNOR_URL:-http://localhost:7685}"
PROPOSAL_ID="${GOVERNANCE_PROPOSAL_ID:-}"

[[ -n "$PROPOSAL_ID" ]] || {
  echo "GOVERNANCE_PROPOSAL_ID is required" >&2
  exit 2
}

log() {
  printf '[sovereign-smoke] %s\n' "$*"
}

req() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" -H 'content-type: application/json' --data "$body" "$url"
  else
    curl -fsS -X "$method" "$url"
  fi
}

log "health checks"
req GET "$L3_URL/health" >/dev/null
req GET "$L2_URL/health" >/dev/null
req GET "$TREASURY_URL/health" >/dev/null
req GET "$REWARDS_URL/health" >/dev/null
req GET "$GOVERNOR_URL/health" >/dev/null

EVENT_ID="smoke-$(date +%s)"
log "submit L3 revenue event: $EVENT_ID"
req POST "$L3_URL/v1/revenue/fees" "{\"eventId\":\"$EVENT_ID\",\"sourceType\":\"gas\",\"amountWei\":\"100000000000000000\",\"destinationLayer\":\"L2\",\"destinationChainId\":901,\"destinationBridgeAddress\":\"${L2_REVENUE_BRIDGE_ADDRESS:-0x0000000000000000000000000000000000000901}\"}" >/dev/null

log "flush L2 batch"
req POST "$L2_URL/v1/revenue/flush" '{}' >/dev/null || true

log "verify treasury intake status"
req GET "$TREASURY_URL/v1/treasury/status" >/dev/null

log "simulate + execute allocation"
req POST "$TREASURY_URL/v1/treasury/allocation/simulate" '{"principalWei":"50000000000000000","stable_asset_ratio":60,"yield_ratio":40,"risk_cap":7500}' >/dev/null
req POST "$TREASURY_URL/v1/treasury/allocation/execute" "{\"allocationId\":\"alloc-$EVENT_ID\",\"governanceProposalId\":\"$PROPOSAL_ID\",\"deployedAmountWei\":\"10000000000000000\",\"expectedApyBps\":700,\"riskScoreBps\":2500,\"destinationType\":\"validator_staking\",\"destinationChainId\":14000101,\"target\":\"l1:validator\"}" >/dev/null

log "queue + execute reward cycle"
req POST "$REWARDS_URL/v1/reward/cycles" "{\"cycleId\":\"cycle-$EVENT_ID\",\"governanceProposalId\":\"$PROPOSAL_ID\",\"netYieldWei\":\"1000000000000000\",\"operationalReserveBps\":2000,\"validatorBps\":3000,\"ecosystemBps\":3000,\"l2l3Bps\":2000,\"timelockSeconds\":0}" >/dev/null
req POST "$REWARDS_URL/v1/reward/cycles/cycle-$EVENT_ID/execute" "{\"governanceProposalId\":\"$PROPOSAL_ID\"}" >/dev/null

log "draft hyper ghost governor proposal"
req POST "$GOVERNOR_URL/proposals/draft" "{\"proposalId\":\"hg-$EVENT_ID\",\"volatilityBand\":\"medium\",\"riskCapBps\":7200,\"maxProtocolConcentrationBps\":4500,\"policyVersion\":\"federation-v1\"}" >/dev/null

log "smoke_passed"
