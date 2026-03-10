"""DNS failover engine — automatically promotes a backup backend to the
primary DNS record when a primary fails consecutive health checks.

All DNS mutations are applied by calling the injected ``on_record_change``
callback, which writes to ``runtime_records`` and triggers a Bind9
reconcile; the engine itself does not touch filesystem or network config.

Security notes:
  - No subprocess / shell=True.  Health probes use ``socket`` only.
  - IPs are validated as strings; they are never interpolated into commands.
"""
from __future__ import annotations

import socket
import threading
from dataclasses import dataclass, field
from typing import Callable, Optional

from src.metrics import GHOSTDNS_FAILOVER_TOTAL

PROBE_TIMEOUT_S: float = 2.0
CONSECUTIVE_FAILS_THRESHOLD: int = 3


@dataclass
class FailoverPolicy:
    fqdn: str            # DNS name to rewrite (e.g. "api.ghostchain.cloud")
    primary_ip: str
    backup_ip: str
    probe_port: int = 80
    # mutable runtime state — not part of the public config schema
    _fail_count: int = field(default=0, repr=False)
    _active_ip: str = field(default="", repr=False)

    def __post_init__(self) -> None:
        self._active_ip = self.primary_ip


class FailoverEngine:
    """Monitors primary IPs; promotes backups when primaries go down.

    The engine is designed to be called from the autonomous reconcile loop
    so it runs on the same cadence as the rest of the AI layer.
    """

    def __init__(self, on_record_change: Callable[[str, str], None]) -> None:
        """
        ``on_record_change(fqdn, new_ip)`` is invoked whenever the engine
        switches backends.  Caller is responsible for updating
        ``runtime_records`` and firing a reconcile.
        """
        self._policies: dict[str, FailoverPolicy] = {}
        self._on_change = on_record_change
        self._lock = threading.Lock()

    # ── Registration ──────────────────────────────────────────────────────────

    def register(self, policy: FailoverPolicy) -> None:
        with self._lock:
            self._policies[policy.fqdn] = policy

    def deregister(self, fqdn: str) -> bool:
        with self._lock:
            return self._policies.pop(fqdn, None) is not None

    def list_policies(self) -> list[dict]:
        with self._lock:
            return [
                {
                    "fqdn": p.fqdn,
                    "primary_ip": p.primary_ip,
                    "backup_ip": p.backup_ip,
                    "probe_port": p.probe_port,
                    "active_ip": p._active_ip,
                    "fail_count": p._fail_count,
                    "status": "failed_over" if p._active_ip == p.backup_ip else "primary",
                }
                for p in self._policies.values()
            ]

    def get_active_ip(self, fqdn: str) -> Optional[str]:
        with self._lock:
            p = self._policies.get(fqdn)
            return p._active_ip if p else None

    # ── Health probing ────────────────────────────────────────────────────────

    @staticmethod
    def _probe(ip: str, port: int) -> bool:
        try:
            with socket.create_connection((ip, port), timeout=PROBE_TIMEOUT_S):
                return True
        except OSError:
            return False

    # ── Main check loop ───────────────────────────────────────────────────────

    def run_checks(self) -> list[dict]:
        """Check all registered primaries.

        * If a primary fails ``CONSECUTIVE_FAILS_THRESHOLD`` times → switch to backup.
        * If a formerly-failed primary recovers → switch back (failback).

        Returns a list of event dicts for logging.
        """
        events: list[dict] = []
        with self._lock:
            policies = list(self._policies.values())

        for p in policies:
            primary_alive = self._probe(p.primary_ip, p.probe_port)

            if primary_alive:
                if p._fail_count >= CONSECUTIVE_FAILS_THRESHOLD and p._active_ip == p.backup_ip:
                    # Primary recovered — failback
                    with self._lock:
                        p._fail_count = 0
                        p._active_ip = p.primary_ip
                    self._on_change(p.fqdn, p.primary_ip)
                    GHOSTDNS_FAILOVER_TOTAL.inc()
                    events.append({
                        "fqdn": p.fqdn,
                        "event": "failback",
                        "active_ip": p.primary_ip,
                    })
                else:
                    with self._lock:
                        p._fail_count = 0
            else:
                with self._lock:
                    p._fail_count += 1
                if p._fail_count >= CONSECUTIVE_FAILS_THRESHOLD and p._active_ip != p.backup_ip:
                    with self._lock:
                        p._active_ip = p.backup_ip
                    self._on_change(p.fqdn, p.backup_ip)
                    GHOSTDNS_FAILOVER_TOTAL.inc()
                    events.append({
                        "fqdn": p.fqdn,
                        "event": "failover",
                        "active_ip": p.backup_ip,
                        "consecutive_fails": p._fail_count,
                    })

        return events
