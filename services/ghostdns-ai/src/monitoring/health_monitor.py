"""HTTP health monitor — per-URL liveness and latency tracking.

Probes each registered target with a plain GET request via stdlib
``urllib`` (no third-party HTTP library).  Results are stored in-process
and exposed via the API; Prometheus metrics are updated after each probe.

Security notes:
  - Only ``http://`` and ``https://`` schemes are accepted.  Any other
    scheme (e.g. ``file://``, ``ftp://``) is rejected at registration.
  - Timeout is capped at ``MAX_TIMEOUT_S`` to prevent probe thread
    monopolisation.
  - Redirects are NOT followed automatically — urllib default.
  - No credentials are accepted in URLs.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

from src.metrics import GHOSTDNS_HEALTH_CHECK_LATENCY_MS, GHOSTDNS_HEALTH_CHECK_UP

_ALLOWED_SCHEMES = frozenset({"http", "https"})
MAX_TIMEOUT_S: float = 30.0


@dataclass
class HealthTarget:
    name: str
    url: str
    timeout_s: float = 5.0
    expected_status: int = 200


@dataclass
class HealthResult:
    name: str
    url: str
    up: bool
    status_code: Optional[int]
    latency_ms: float
    error: Optional[str]


def _parse_scheme(url: str) -> str:
    return url.split("://")[0].lower() if "://" in url else ""


class HealthMonitor:
    """Manages a list of HTTP health targets and probes them on demand."""

    def __init__(self) -> None:
        self._targets: dict[str, HealthTarget] = {}
        self._last_results: dict[str, dict] = {}
        self._load_from_env()

    def _load_from_env(self) -> None:
        """Initialise targets from GHOSTDNS_HEALTH_TARGETS JSON env var.

        Expected format: ``[{"name":"svc","url":"http://...","timeout_s":5}]``
        """
        raw = os.getenv("GHOSTDNS_HEALTH_TARGETS", "[]")
        try:
            entries = json.loads(raw)
        except json.JSONDecodeError:
            return

        if not isinstance(entries, list):
            return

        for e in entries:
            url = str(e.get("url", ""))
            if _parse_scheme(url) not in _ALLOWED_SCHEMES:
                continue
            name = str(e.get("name", url))
            timeout = min(float(e.get("timeout_s", 5.0)), MAX_TIMEOUT_S)
            self._targets[name] = HealthTarget(
                name=name,
                url=url,
                timeout_s=timeout,
                expected_status=int(e.get("expected_status", 200)),
            )

    # ── Registration ──────────────────────────────────────────────────────────

    def register(self, target: HealthTarget) -> None:
        if _parse_scheme(target.url) not in _ALLOWED_SCHEMES:
            raise ValueError(f"Only http/https URLs allowed — got: {target.url!r}")
        target.timeout_s = min(target.timeout_s, MAX_TIMEOUT_S)
        self._targets[target.name] = target

    def deregister(self, name: str) -> bool:
        removed = name in self._targets
        self._targets.pop(name, None)
        self._last_results.pop(name, None)
        return removed

    def list_targets(self) -> list[dict]:
        return [
            {
                "name": t.name,
                "url": t.url,
                "timeout_s": t.timeout_s,
                "expected_status": t.expected_status,
            }
            for t in self._targets.values()
        ]

    # ── Probing ───────────────────────────────────────────────────────────────

    def _probe(self, target: HealthTarget) -> HealthResult:
        t0 = time.monotonic()
        try:
            req = urllib.request.Request(target.url, method="GET")
            with urllib.request.urlopen(req, timeout=target.timeout_s) as resp:
                latency_ms = (time.monotonic() - t0) * 1000.0
                up = resp.status == target.expected_status
                GHOSTDNS_HEALTH_CHECK_UP.labels(target=target.name).set(1 if up else 0)
                GHOSTDNS_HEALTH_CHECK_LATENCY_MS.labels(target=target.name).observe(latency_ms)
                return HealthResult(
                    name=target.name, url=target.url,
                    up=up, status_code=resp.status,
                    latency_ms=latency_ms, error=None,
                )
        except Exception as exc:
            latency_ms = (time.monotonic() - t0) * 1000.0
            GHOSTDNS_HEALTH_CHECK_UP.labels(target=target.name).set(0)
            GHOSTDNS_HEALTH_CHECK_LATENCY_MS.labels(target=target.name).observe(latency_ms)
            return HealthResult(
                name=target.name, url=target.url,
                up=False, status_code=None,
                latency_ms=latency_ms, error=str(exc),
            )

    def check_all(self) -> list[HealthResult]:
        results = [self._probe(t) for t in self._targets.values()]
        self._last_results = {
            r.name: {
                "name": r.name, "url": r.url, "up": r.up,
                "status_code": r.status_code,
                "latency_ms": round(r.latency_ms, 2),
                "error": r.error,
            }
            for r in results
        }
        return results

    def last_results(self) -> list[dict]:
        return list(self._last_results.values())
