"""
GhostStack — Validator Rebalancer
===================================
Monitors the GhostChain L1 validator set, computes regional distribution,
and submits advisory rebalancing proposals when concentration thresholds
are exceeded.

Design contract
---------------
* NEVER modifies the validator set or stake autonomously.
* All actions are proposals posted to the signing relay for human governance
  quorum ratification (matching the existing validator_rebalance.sh contract).
* GhostBrain Core provides region tags; without them the check degrades
  gracefully to "unknown" regions.
* Routing law: settlement always on L1 (chain_id 14000101).

Environment variables
---------------------
  COSMOS_LCD_URL              Cosmos SDK LCD endpoint (default: http://localhost:1317)
  GHOSTBRAIN_URL              GhostBrain Core URL  (default: http://localhost:7900)
  SIGNING_RELAY_URL           Signing relay URL    (default: http://localhost:7910)
  MAX_REGION_FRACTION_PCT     max % of total voting power in one region (default: 50)
  VALIDATOR_PROBE_TIMEOUT_S   HTTP timeout for LCD/relay calls (default: 10)
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("validator_rebalancer")

COSMOS_LCD               = os.getenv("COSMOS_LCD_URL", "http://localhost:1317")
GHOSTBRAIN_URL           = os.getenv("GHOSTBRAIN_URL", "http://localhost:7900").rstrip("/")
SIGNING_RELAY_URL        = os.getenv("SIGNING_RELAY_URL", "http://localhost:7910").rstrip("/")
MAX_REGION_FRACTION_PCT  = int(os.getenv("MAX_REGION_FRACTION_PCT", "50"))
PROBE_TIMEOUT_S          = int(os.getenv("VALIDATOR_PROBE_TIMEOUT_S", "10"))

# GhostChain L1 canonical constants
L1_CHAIN_ID = 14000101
GAS_TOKEN   = "GST"


# ── HTTP helpers ──────────────────────────────────────────────────────────────
def _get_json(url: str, timeout: int = PROBE_TIMEOUT_S) -> Optional[Any]:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        log.debug("GET %s failed: %s", url, exc)
        return None


def _post_json(url: str, payload: Dict, timeout: int = PROBE_TIMEOUT_S) -> bool:
    try:
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout):
            return True
    except Exception as exc:
        log.warning("POST %s failed: %s", url, exc)
        return False


# ── Data types ────────────────────────────────────────────────────────────────
@dataclass
class ValidatorInfo:
    operator_address: str
    moniker:          str
    tokens:           int      # uGST bonded tokens
    status:           str
    region:           str = "unknown"


@dataclass
class RegionSummary:
    region:    str
    power:     int
    power_pct: float
    count:     int


# ── Fetchers ──────────────────────────────────────────────────────────────────
def fetch_validators() -> List[ValidatorInfo]:
    """Pull bonded validator set from Cosmos SDK LCD."""
    data = _get_json(
        f"{COSMOS_LCD}/cosmos/staking/v1beta1/validators"
        "?status=BOND_STATUS_BONDED&pagination.limit=200"
    )
    if not data:
        return []
    validators = []
    for v in data.get("validators", []):
        try:
            validators.append(ValidatorInfo(
                operator_address=v["operator_address"],
                moniker=v.get("description", {}).get("moniker", "?"),
                tokens=int(v.get("tokens", "0")),
                status=v.get("status", ""),
            ))
        except (KeyError, ValueError) as exc:
            log.debug("Skipping malformed validator entry: %s", exc)
    log.info("Fetched %d bonded validators from LCD.", len(validators))
    return validators


def fetch_region_tags() -> Dict[str, str]:
    """Ask GhostBrain for operator_address → region mappings."""
    data = _get_json(f"{GHOSTBRAIN_URL}/validator/regions", timeout=5)
    if not isinstance(data, dict):
        log.debug("No region tags from GhostBrain — defaulting to 'unknown'.")
        return {}
    return data


# ── Distribution computation ──────────────────────────────────────────────────
def compute_distribution(
    validators: List[ValidatorInfo],
    region_tags: Dict[str, str],
) -> Tuple[List[RegionSummary], int]:
    """
    Returns (list of RegionSummary sorted by power desc, total_power).
    """
    total = sum(v.tokens for v in validators)
    if total == 0:
        return [], 0

    by_region: Dict[str, Dict[str, Any]] = {}
    for v in validators:
        region = region_tags.get(v.operator_address, "unknown")
        v.region = region
        entry = by_region.setdefault(region, {"power": 0, "count": 0})
        entry["power"] += v.tokens
        entry["count"] += 1

    summaries = [
        RegionSummary(
            region=r,
            power=d["power"],
            power_pct=round(100.0 * d["power"] / total, 2),
            count=d["count"],
        )
        for r, d in by_region.items()
    ]
    summaries.sort(key=lambda s: s.power, reverse=True)
    return summaries, total


# ── Proposal builder ──────────────────────────────────────────────────────────
def _build_proposal(
    summaries: List[RegionSummary],
    total:     int,
    dominant:  RegionSummary,
) -> Dict:
    return {
        "id":          f"vrebalance-{int(time.time())}",
        "type":        "validator_rebalance",
        "chain_id":    L1_CHAIN_ID,
        "gas_token":   GAS_TOKEN,
        "reason":      (
            f"Region '{dominant.region}' holds {dominant.power_pct:.1f}% of voting power "
            f"(threshold: {MAX_REGION_FRACTION_PCT}%). "
            "Advisory rebalance proposal — human ratification required."
        ),
        "distribution": [
            {
                "region":    s.region,
                "power_pct": s.power_pct,
                "count":     s.count,
            }
            for s in summaries
        ],
        "total_power":      total,
        "proposed_at":      int(time.time()),
        "requires_quorum":  True,
    }


# ── Main check ────────────────────────────────────────────────────────────────
def check_and_propose() -> bool:
    """
    Full rebalance cycle:
      1. Fetch validators
      2. Fetch GhostBrain region tags
      3. Compute distribution
      4. If any region exceeds MAX_REGION_FRACTION_PCT, post proposal to relay
    Returns True if a proposal was submitted, False otherwise.
    """
    validators = fetch_validators()
    if not validators:
        log.info("No validators returned — skipping rebalance check.")
        return False

    region_tags = fetch_region_tags()
    summaries, total = compute_distribution(validators, region_tags)

    if not summaries:
        log.info("Distribution computation returned empty set — nothing to do.")
        return False

    log.info(
        "Validator distribution (%d total, %d tokens):", len(validators), total
    )
    for s in summaries:
        log.info("  %-20s  %6.1f%%  (%d validators)", s.region, s.power_pct, s.count)

    # Find dominant region
    dominant = summaries[0]
    if dominant.power_pct <= MAX_REGION_FRACTION_PCT:
        log.info(
            "Distribution OK — dominant region '%s' at %.1f%% (max %d%%).",
            dominant.region, dominant.power_pct, MAX_REGION_FRACTION_PCT,
        )
        return False

    # Build and submit advisory proposal
    proposal = _build_proposal(summaries, total, dominant)
    log.warning(
        "Distribution threshold exceeded — submitting advisory proposal (id=%s).",
        proposal["id"],
    )

    url = f"{SIGNING_RELAY_URL}/proposals"
    ok  = _post_json(url, proposal)
    if ok:
        log.info("Proposal %s accepted by signing relay.", proposal["id"])
    else:
        log.error("Proposal %s rejected by signing relay — check relay logs.", proposal["id"])

    # Also notify GhostBrain
    _post_json(
        f"{GHOSTBRAIN_URL}/api/v1/signals",
        {
            "messageId": str(uuid.uuid4()),
            "subject": "infra.validator.rebalance.proposed",
            "correlationId": f"validator-rebalance:{proposal['id']}",
            "senderAgentId": "validator-rebalancer",
            "payload": {
                "source": "validator-rebalancer",
                "type": "validator.rebalance.proposed",
                "proposal": proposal["id"],
                "dominant": dominant.region,
                "pct": dominant.power_pct,
                "ts": int(time.time()),
            },
            "sentAt": datetime.now(timezone.utc).isoformat(),
        },
    )

    return ok


# ── Status snapshot (for REST API) ──────────────────────────────────────────
def get_status() -> Dict:
    """Return current distribution snapshot synchronously (for health endpoints)."""
    validators = fetch_validators()
    if not validators:
        return {"error": "no validators", "distribution": []}
    region_tags = fetch_region_tags()
    summaries, total = compute_distribution(validators, region_tags)
    return {
        "validator_count": len(validators),
        "total_power":     total,
        "distribution": [
            {
                "region":    s.region,
                "power_pct": s.power_pct,
                "count":     s.count,
            }
            for s in summaries
        ],
        "threshold_pct": MAX_REGION_FRACTION_PCT,
        "ts":            int(time.time()),
    }
