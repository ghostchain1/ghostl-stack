"""
Load Balancer — validator node load distribution.

Provides a pure-Python load selection algorithm. Actual traffic routing
(iptables, HAProxy, etc.) is performed externally based on the returned target.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class ValidatorNode:
    name:        str
    cpu_percent: float   = 0.0
    mem_percent: float   = 0.0
    connections: int     = 0
    healthy:     bool    = True

    def composite_score(
        self,
        w_cpu:  float = 0.5,
        w_mem:  float = 0.3,
        w_conn: float = 0.2,
        max_conn: int = 1000,
    ) -> float:
        """Lower score = less loaded = preferred."""
        conn_norm = min(self.connections / max(max_conn, 1), 1.0) * 100
        return w_cpu * self.cpu_percent + w_mem * self.mem_percent + w_conn * conn_norm


# ---------------------------------------------------------------------------
# LoadBalancer
# ---------------------------------------------------------------------------

class LoadBalancer:
    """Selects the least-loaded eligible validator node."""

    def rebalance(self, validators: list[ValidatorNode]) -> Optional[ValidatorNode]:
        """
        Return the node with the lowest composite load score.
        Unhealthy nodes are excluded.

        Returns None if no healthy nodes are available.
        """
        healthy = [v for v in validators if v.healthy]
        if not healthy:
            logger.error("No healthy validator nodes available for rebalancing.")
            return None

        healthy.sort(key=lambda v: v.composite_score())
        target = healthy[0]

        logger.info(
            "Load balancer selected %r (score=%.1f, cpu=%.1f%%, mem=%.1f%%)",
            target.name,
            target.composite_score(),
            target.cpu_percent,
            target.mem_percent,
        )
        return target

    def report(self, validators: list[ValidatorNode]) -> list[dict]:
        """Return a sorted report of all validators by load score."""
        return sorted(
            [
                {
                    "name":    v.name,
                    "score":   round(v.composite_score(), 2),
                    "cpu":     v.cpu_percent,
                    "mem":     v.mem_percent,
                    "conns":   v.connections,
                    "healthy": v.healthy,
                }
                for v in validators
            ],
            key=lambda r: r["score"],
        )
