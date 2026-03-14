"""Transaction routing enforcer — wraps routing_engine for blockchain-context calls.

Maps service/transaction layer labels to mandatory next hops and rejects any
attempt to route L3 traffic directly to L1. This is a logical routing layer;
it does not submit transactions on-chain.

Routing law (immutable)
-----------------------
  L3  →  L2  (never L3 → L1)
  L2  →  L1
  L1  →  (terminus, no further hop)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from src.networking.routing_engine import check_route, route, RouteResult

logger = logging.getLogger(__name__)

# RPC endpoint registry (mirrors chain_orchestrator.CHAINS but without circular import)
import os

_ENDPOINTS: dict[str, str] = {
    "L1": os.getenv("GACK_L1_RPC_URL", "http://127.0.0.1:18545"),
    "L2": os.getenv("GACK_L2_RPC_URL", "http://127.0.0.1:29545"),
    "L3": os.getenv("GACK_L3_RPC_URL", "http://127.0.0.1:39545"),
}


@dataclass
class TxRoute:
    ok: bool
    source: str
    next_hop: str | None          # layer label ("L1", "L2", etc.)
    next_hop_rpc: str | None      # RPC URL of the next hop
    violation: bool = False
    reason: str = ""


def route_transaction(source_layer: str, destination_layer: str | None = None) -> TxRoute:
    """Determine where a transaction originating from source_layer must be sent.

    If destination_layer is supplied it is validated against the routing law.
    If omitted the mandatory next hop is returned without a violation check.

    Returns a TxRoute with ok=False and violation=True for any illegal route.
    """
    src = source_layer.strip().upper()

    if destination_layer is not None:
        result: RouteResult = check_route(src, destination_layer.strip().upper())
    else:
        result = route(src)

    if not result.ok:
        if result.violation:
            logger.error(
                "TX ROUTING VIOLATION: %s → %s  — %s",
                src, destination_layer, result.reason,
            )
        return TxRoute(
            ok=False,
            source=result.source,
            next_hop=result.next_hop,
            next_hop_rpc=_ENDPOINTS.get(result.next_hop) if result.next_hop else None,
            violation=result.violation,
            reason=result.reason,
        )

    hop = result.next_hop
    return TxRoute(
        ok=True,
        source=result.source,
        next_hop=hop,
        next_hop_rpc=_ENDPOINTS.get(hop) if hop else None,
    )


def describe_routing_law() -> list[dict[str, Any]]:
    """Return a human-readable description of the routing law for /blockchain/route."""
    from src.networking.routing_engine import routing_table
    rows = routing_table()
    for row in rows:
        row["next_hop_rpc"] = _ENDPOINTS.get(row["next_hop"]) if row["next_hop"] != "terminus" else None
    return rows
