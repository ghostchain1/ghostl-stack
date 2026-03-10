#!/usr/bin/env bash
# GhostStack Autonomous Installer — Validator Rebalance
#
# Queries the GhostChain L1 Cosmos LCD for the current validator set,
# checks regional distribution, and submits an advisory rebalance
# proposal to the signing relay when distribution exceeds thresholds.
#
# SAFETY INVARIANTS
# -----------------
# 1. Never modifies the validator set autonomously.
# 2. All recommendations are advisory proposals — human governance quorum
#    is required to execute any rebalance.
# 3. MAX_REGION_FRACTION invariant: no single region may hold more than
#    50% of total voting power.

set -euo pipefail

# shellcheck disable=SC2034
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

info() { echo "[$(date +%H:%M:%S)] [validator_rebalance] $*"; }
warn() { echo "[$(date +%H:%M:%S)] [validator_rebalance] WARN  $*" >&2; }

COSMOS_LCD="${COSMOS_LCD_URL:-http://localhost:1317}"
COSMOS_TIMEOUT_S="${VALIDATOR_COSMOS_TIMEOUT_S:-10}"
RELAY_URL="${SIGNING_RELAY_URL:-http://localhost:7910}"
RELAY_TIMEOUT_S="${VALIDATOR_RELAY_TIMEOUT_S:-8}"

# Fraction of total voting power that triggers a rebalance proposal
# when any single region exceeds it (expressed as integer percent).
MAX_REGION_FRACTION_PCT="${MAX_REGION_FRACTION_PCT:-50}"

# GhostBrain AI core can provide region tags for validators.
# When GHOSTBRAIN_REGIONS=0 the script skips the regional check.
GHOSTBRAIN_URL="${GHOSTBRAIN_API_URL:-http://localhost:7900}"
GHOSTBRAIN_TIMEOUT_S="${GHOSTBRAIN_TIMEOUT_S:-5}"
GHOSTBRAIN_REGIONS="${GHOSTBRAIN_REGIONS:-1}"

# ---------------------------------------------------------------------------
# Fetch active validators from Cosmos SDK LCD
# ---------------------------------------------------------------------------

fetch_validators() {
  curl -sf --max-time "${COSMOS_TIMEOUT_S}" \
    "${COSMOS_LCD}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=200" \
    2>/dev/null
}

# ---------------------------------------------------------------------------
# Ask GhostBrain for region tags (validator_address -> region label)
# Returns JSON object { "<addr>": "<region>", ... }
# ---------------------------------------------------------------------------

fetch_region_tags() {
  curl -sf --max-time "${GHOSTBRAIN_TIMEOUT_S}" \
    "${GHOSTBRAIN_URL}/validator/regions" 2>/dev/null || echo '{}'
}

# ---------------------------------------------------------------------------
# Compute regional distribution from validator list + region tags
# Output: JSON array [{"region":"<r>","power_pct":<n>}, ...]
# ---------------------------------------------------------------------------

compute_distribution() {
  local validators_json="$1"
  local region_tags_json="$2"

  # Sum tokens per region; report the highest fraction.
  echo "${validators_json}" | jq \
    --argjson regions "${region_tags_json}" \
    '
    .validators
    | reduce .[] as $v (
        {total: 0, by_region: {}};
        .total += ($v.tokens | tonumber) |
        (($regions[$v.operator_address] // "unknown") as $r |
         .by_region[$r] += ($v.tokens | tonumber))
      )
    | . as $agg
    | $agg.by_region
    | to_entries
    | map({
        region: .key,
        tokens: .value,
        power_pct: (if $agg.total > 0 then (.value * 100 / $agg.total | floor) else 0 end)
      })
    | sort_by(-.power_pct)
    '
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Validator Rebalance Check ==="

validators_json="$(fetch_validators)" || {
  warn "Could not reach Cosmos LCD at ${COSMOS_LCD}. Skipping rebalance check."
  exit 0
}

validator_count="$(echo "${validators_json}" | jq '.validators | length')"
info "Active validators: ${validator_count}"

if [[ "${validator_count}" -eq 0 ]]; then
  warn "No bonded validators found — skipping."
  exit 0
fi

if [[ "${GHOSTBRAIN_REGIONS}" == "1" ]]; then
  region_tags="$(fetch_region_tags)"
else
  region_tags='{}'
fi

distribution="$(compute_distribution "${validators_json}" "${region_tags}")"

# Find highest-fraction region.
top_region="$(echo "${distribution}" | jq -r '.[0].region')"
top_pct="$(echo "${distribution}" | jq -r '.[0].power_pct')"
top_pct_int="${top_pct%.*}"

info "Top region: ${top_region} — ${top_pct_int}% of voting power."

if (( top_pct_int <= MAX_REGION_FRACTION_PCT )); then
  info "Distribution OK (max region fraction = ${top_pct_int}% ≤ threshold ${MAX_REGION_FRACTION_PCT}%). No action needed."
  exit 0
fi

warn "INVARIANT BREACH: Region '${top_region}' holds ${top_pct_int}% of voting power (threshold: ${MAX_REGION_FRACTION_PCT}%)."
info "Submitting advisory rebalance proposal to signing relay…"

PROPOSAL="$(jq -n \
  --arg id   "valbal-$(date +%s)" \
  --arg rgn  "${top_region}" \
  --argjson pct "${top_pct_int}" \
  --argjson thr "${MAX_REGION_FRACTION_PCT}" \
  --argjson dist "${distribution}" \
  '{
    proposal_id: $id,
    type: "validator_rebalance",
    chain_id: 14000101,
    gas_token: "GST",
    from: "ghostbrain-guardian",
    invariant: "max_region_fraction",
    breach: {
      region: $rgn,
      power_pct: $pct,
      threshold: $thr
    },
    distribution: $dist,
    advisory_only: true
  }')"

resp="$(curl -sf --max-time "${RELAY_TIMEOUT_S}" \
  -X POST \
  -H "Content-Type: application/json" \
  --data "${PROPOSAL}" \
  "${RELAY_URL}/relay/validator/rebalance/propose" 2>/dev/null)" || {
  warn "Signing relay unavailable — rebalance proposal not submitted."
  exit 1
}

proposal_id="$(echo "${resp}" | jq -r '.proposal_id // "unknown"' 2>/dev/null)"
info "Rebalance proposal submitted (id=${proposal_id}). Awaiting governance ratification."
exit 0
