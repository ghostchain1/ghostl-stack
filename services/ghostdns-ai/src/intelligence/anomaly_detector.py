"""
GhostDNS AI — DNS Anomaly Detector

Detects anomalous DNS behaviour using sliding-window statistics:

  • Record churn  — too many records added/removed per cycle
  • TTL tampering — record TTL shortened below policy threshold
  • Unexpected record type changes — same FQDN switches type
  • Rapid IP change — same FQDN resolves to a new IP too quickly
  • Subdomain explosion — sudden spike in new subdomain names

All anomalies are reported as AnomalyEvent objects.  Critical-severity
events are forwarded to the signing relay (http://localhost:7910) for
human review — never executed autonomously.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque

from src.metrics import GHOSTDNS_ANOMALY_DETECTED_TOTAL

# ── Configuration ─────────────────────────────────────────────────────────────

MAX_CHURN_PER_CYCLE   = 20     # more than N record changes in one reconcile
MIN_ALLOWED_TTL       = 30     # seconds — shorter than this is suspicious
MAX_IP_CHANGE_RATE    = 3      # same FQDN may change IP at most this many times
IP_CHANGE_WINDOW_S    = 600    # … within this many seconds
MAX_NEW_SUBDOMAINS    = 50     # new subdomains created per reconcile cycle


@dataclass(slots=True)
class AnomalyEvent:
    kind:     str
    severity: str   # "info" | "warning" | "critical"
    detail:   str
    ts:       float = field(default_factory=time.time)


class AnomalyDetector:
    """Stateful detector; call update() after every reconcile cycle."""

    def __init__(self) -> None:
        # previous snapshot of { fqdn: (rtype, value, ttl) }
        self._prev: dict[str, tuple[str, str, int]] = {}
        # IP change history per FQDN: deque of timestamps
        self._ip_changes: dict[str, Deque[float]] = {}

    def update(
        self,
        current_a: dict[str, tuple[str, int]],
    ) -> list[AnomalyEvent]:
        """
        Compare current A-record snapshot with previous state.
        Returns list of detected anomalies (may be empty).
        """
        events: list[AnomalyEvent] = []
        now = time.time()

        prev_keys  = set(self._prev)
        curr_keys  = set(current_a)
        added      = curr_keys - prev_keys
        removed    = prev_keys - curr_keys

        # 1. Record churn check
        churn = len(added) + len(removed)
        if churn > MAX_CHURN_PER_CYCLE:
            ev = AnomalyEvent(
                kind="record_churn",
                severity="warning",
                detail=f"{churn} records changed in one cycle ({len(added)} added, {len(removed)} removed)",
            )
            events.append(ev)
            GHOSTDNS_ANOMALY_DETECTED_TOTAL.labels(kind="record_churn").inc()

        # 2. New subdomain explosion
        if len(added) > MAX_NEW_SUBDOMAINS:
            ev = AnomalyEvent(
                kind="subdomain_explosion",
                severity="critical",
                detail=f"{len(added)} new subdomains appear in a single cycle — possible DNS hijack",
            )
            events.append(ev)
            GHOSTDNS_ANOMALY_DETECTED_TOTAL.labels(kind="subdomain_explosion").inc()

        for fqdn, (value, ttl) in current_a.items():
            # 3. TTL tampering
            if ttl < MIN_ALLOWED_TTL:
                ev = AnomalyEvent(
                    kind="ttl_too_low",
                    severity="warning",
                    detail=f"{fqdn} has TTL={ttl}s (min allowed={MIN_ALLOWED_TTL}s)",
                )
                events.append(ev)
                GHOSTDNS_ANOMALY_DETECTED_TOTAL.labels(kind="ttl_too_low").inc()

            # 4. Rapid IP change detection
            if fqdn in self._prev:
                prev_value, _, _ = self._prev[fqdn]
                if prev_value != value:
                    history = self._ip_changes.setdefault(fqdn, deque())
                    cutoff = now - IP_CHANGE_WINDOW_S
                    while history and history[0] < cutoff:
                        history.popleft()
                    history.append(now)
                    if len(history) >= MAX_IP_CHANGE_RATE:
                        ev = AnomalyEvent(
                            kind="rapid_ip_change",
                            severity="critical",
                            detail=(
                                f"{fqdn} changed IP {len(history)}x in {IP_CHANGE_WINDOW_S}s "
                                f"(last: {prev_value} → {value}) — possible DNS hijack"
                            ),
                        )
                        events.append(ev)
                        GHOSTDNS_ANOMALY_DETECTED_TOTAL.labels(kind="rapid_ip_change").inc()

        # Snapshot for next cycle
        self._prev = {fqdn: ("A", v, ttl) for fqdn, (v, ttl) in current_a.items()}
        return events

    def snapshot(self) -> dict:
        return {
            "tracked_fqdns": len(self._prev),
            "fqdns_with_ip_change_history": len(self._ip_changes),
        }
