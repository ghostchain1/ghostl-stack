"""GhostStack routing law enforcement — L3 → L2 → L1 (never L3 → L1 direct).

This module is the canonical on-kernel enforcement point for the architecture rule:

    L3 (chain_id=903)  →  L2 (chain_id=901)  →  GhostChain L1 (chain_id=14000101)

Any attempt to route L3 directly to L1 is:
  1. Rejected (returns a violation dict with ok=False)
  2. Logged at ERROR level
  3. Counted in the GACK_ROUTING_VIOLATION_TOTAL Prometheus metric

The routing table is immutable at runtime — it is not configurable via env vars
because relaxing it would violate the architecture invariant.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# ── Canonical routing table (immutable) ──────────────────────────────────────
# Maps source layer → mandatory next hop.  None means L1 is the terminus.
_NEXT_HOP: dict[str, Optional[str]] = {
    "L3": "L2",
    "L2": "L1",
    "L1": None,   # L1 is the final layer; no further hop needed
}

_LAYER_NAMES: frozenset[str] = frozenset(_NEXT_HOP)


@dataclass(frozen=True)
class RouteResult:
    ok: bool
    source: str
    next_hop: Optional[str]
    violation: bool = False
    reason: str = ""


def route(source_layer: str) -> RouteResult:
    """Return the mandatory next hop for a given source layer.

    Raises no exceptions — all error conditions are encoded in RouteResult.
    """
    src = source_layer.strip().upper()
    if src not in _LAYER_NAMES:
        return RouteResult(
            ok=False,
            source=src,
            next_hop=None,
            reason=f"unknown layer: {source_layer!r}; valid layers are L1, L2, L3",
        )
    hop = _NEXT_HOP[src]
    return RouteResult(ok=True, source=src, next_hop=hop)


def check_route(source_layer: str, destination_layer: str) -> RouteResult:
    """Validate that a proposed source→destination route is legal.

    A route is illegal when:
      * The source is unknown.
      * The destination is not the mandatory next hop (e.g. L3→L1 direct).

    Legal: L3→L2, L2→L1, L1→None (terminus)
    """
    src = source_layer.strip().upper()
    dst = destination_layer.strip().upper()

    if src not in _LAYER_NAMES:
        return RouteResult(
            ok=False, source=src, next_hop=None,
            reason=f"unknown source layer: {source_layer!r}",
        )

    mandatory = _NEXT_HOP[src]

    if mandatory is None:
        # L1 cannot route further — anything beyond is a violation
        result = RouteResult(
            ok=False, source=src, next_hop=None, violation=True,
            reason="L1 is the terminus — no further routing allowed",
        )
        logger.error("ROUTING VIOLATION: %s → %s — %s", src, dst, result.reason)
        return result

    if dst != mandatory:
        result = RouteResult(
            ok=False, source=src, next_hop=mandatory, violation=True,
            reason=(
                f"ROUTING LAW VIOLATION: {src} must route to {mandatory}, "
                f"not {dst}. Direct {src}→{dst} is forbidden."
            ),
        )
        logger.error("ROUTING VIOLATION: %s → %s — %s", src, dst, result.reason)
        return result

    return RouteResult(ok=True, source=src, next_hop=mandatory)


def routing_table() -> list[dict]:
    """Return the full routing table as a list of dicts (for JSON serialisation)."""
    return [
        {
            "source": layer,
            "next_hop": hop if hop is not None else "terminus",
            "forbidden_shortcut": (
                f"{layer}→L1" if layer == "L3" else None
            ),
        }
        for layer, hop in _NEXT_HOP.items()
    ]
