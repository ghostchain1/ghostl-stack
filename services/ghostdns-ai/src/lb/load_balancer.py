"""Weighted / latency-aware load balancer for DNS backend selection.

Backends are registered per service name with an IP, port, and optional
weight (default 100).  A TCP-connect health probe is run on each candidate
so only reachable nodes are eligible.

Security notes:
  - No subprocess / shell=True.  Health checks use stdlib ``socket`` only.
  - Backend configs originate from authenticated API calls; untrusted input
    is never interpolated into anything executable.
"""
from __future__ import annotations

import socket
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from src.metrics import GHOSTDNS_LB_HEALTHY_BACKENDS, GHOSTDNS_LB_SELECTION_TOTAL

PROBE_TIMEOUT_S: float = 2.0


@dataclass
class Backend:
    ip: str
    port: int = 80
    weight: int = 100       # higher = preferred when latency is equal
    region: str = "default"
    latency_ms: float = 9999.0  # updated by the last probe


@dataclass
class _ServicePool:
    name: str
    backends: list[Backend] = field(default_factory=list)


class LoadBalancer:
    """Thread-safe in-memory load balancer.

    ``select_backend()`` probes all registered backends, filters the
    healthy ones, then returns the best node: lowest latency, with weight
    as a tiebreaker.
    """

    def __init__(self) -> None:
        self._pools: dict[str, _ServicePool] = {}
        self._lock = threading.Lock()

    # ── Registration ──────────────────────────────────────────────────────────

    def register(self, service: str, backend: Backend) -> None:
        with self._lock:
            pool = self._pools.setdefault(service, _ServicePool(name=service))
            pool.backends = [
                b for b in pool.backends
                if not (b.ip == backend.ip and b.port == backend.port)
            ]
            pool.backends.append(backend)

    def deregister(self, service: str, ip: str, port: int) -> int:
        """Returns the number of backends removed."""
        with self._lock:
            pool = self._pools.get(service)
            if pool is None:
                return 0
            before = len(pool.backends)
            pool.backends = [
                b for b in pool.backends
                if not (b.ip == ip and b.port == port)
            ]
            return before - len(pool.backends)

    def list_services(self) -> dict:
        with self._lock:
            return {
                name: [
                    {
                        "ip": b.ip,
                        "port": b.port,
                        "weight": b.weight,
                        "region": b.region,
                        "latency_ms": b.latency_ms,
                    }
                    for b in pool.backends
                ]
                for name, pool in self._pools.items()
            }

    # ── Selection ─────────────────────────────────────────────────────────────

    @staticmethod
    def _probe(backend: Backend) -> bool:
        """TCP-connect probe; updates ``backend.latency_ms`` in place."""
        t0 = time.monotonic()
        try:
            with socket.create_connection((backend.ip, backend.port), timeout=PROBE_TIMEOUT_S):
                pass
            backend.latency_ms = (time.monotonic() - t0) * 1000
            return True
        except OSError:
            backend.latency_ms = 9999.0
            return False

    def select_backend(self, service: str) -> Optional[Backend]:
        """Return the best healthy backend for *service*, or ``None``."""
        GHOSTDNS_LB_SELECTION_TOTAL.labels(service=service).inc()
        with self._lock:
            pool = self._pools.get(service)
            if pool is None:
                return None
            backends = list(pool.backends)  # snapshot under lock

        healthy = [b for b in backends if self._probe(b)]
        GHOSTDNS_LB_HEALTHY_BACKENDS.labels(service=service).set(len(healthy))

        if not healthy:
            return None
        # Primary sort key: latency ASC; secondary: weight DESC
        return min(healthy, key=lambda b: (b.latency_ms, -b.weight))

    def bulk_register_from_map(self, service_map: dict[str, list[dict]]) -> int:
        """Register multiple backends from a ``{service: [{ip, port, weight, region}]}`` dict.

        Returns total backends registered.
        """
        total = 0
        for service, entries in service_map.items():
            for entry in entries:
                self.register(
                    service,
                    Backend(
                        ip=entry["ip"],
                        port=int(entry.get("port", 80)),
                        weight=int(entry.get("weight", 100)),
                        region=str(entry.get("region", "local")),
                    ),
                )
                total += 1
        return total
