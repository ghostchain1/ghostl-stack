"""Geo-aware backend router — region-preference selection over LoadBalancer.

Adds region-affinity on top of the existing latency-based ``LoadBalancer``.
``select_for_region()`` tries healthy backends in the preferred region first;
if none exist it falls back to the global lowest-latency selection.

No subprocess / shell=True.  Backends are queried from the LoadBalancer's
in-memory registry which is populated from authenticated API calls only.
"""
from __future__ import annotations

from typing import Optional

from src.lb.load_balancer import Backend, LoadBalancer
from src.metrics import GHOSTDNS_GEO_ROUTE_TOTAL


class GeoRouter:
    """Region-aware overlay on the shared ``LoadBalancer`` instance."""

    def __init__(self, lb: LoadBalancer) -> None:
        self._lb = lb

    # ── Selection ─────────────────────────────────────────────────────────────

    def select_for_region(self, service: str, preferred_region: str) -> Optional[Backend]:
        """Return the best healthy backend, preferring *preferred_region*.

        Falls back to the global lowest-latency selection if no backends in
        that region are reachable.
        """
        GHOSTDNS_GEO_ROUTE_TOTAL.labels(service=service, region=preferred_region).inc()

        with self._lb._lock:
            pool = self._lb._pools.get(service)
            if pool is None:
                return None
            region_candidates = [b for b in pool.backends if b.region == preferred_region]

        # Probe region backends first
        healthy_regional = [b for b in region_candidates if self._lb._probe(b)]
        if healthy_regional:
            return min(healthy_regional, key=lambda b: (b.latency_ms, -b.weight))

        # Fallback: global selection (probes all pools again internally)
        return self._lb.select_backend(service)

    def regions_for_service(self, service: str) -> list[str]:
        """Return the distinct region labels registered for *service*."""
        with self._lb._lock:
            pool = self._lb._pools.get(service)
            if pool is None:
                return []
            return sorted({b.region for b in pool.backends})

    def service_region_map(self) -> dict[str, list[str]]:
        """Return ``{service: [regions]}`` for all registered services."""
        with self._lb._lock:
            return {
                name: sorted({b.region for b in pool.backends})
                for name, pool in self._lb._pools.items()
            }
