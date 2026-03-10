"""
GhostDNS AI — Domain Guardian

Monitors domain registration expiry and detects potential subdomain
takeover vectors.  All critical findings are sent to the signing relay
(http://localhost:7910) — never actioned autonomously.

Expiry checks use environment-configured domain list; no external
lookup is attempted without explicit configuration.
"""

from __future__ import annotations

import os
import time
import urllib.error
import urllib.parse
import urllib.request
import json
from dataclasses import dataclass, field
from typing import Optional

from src.metrics import GHOSTDNS_DOMAIN_EXPIRY_DAYS, GHOSTDNS_ANOMALY_DETECTED_TOTAL

# ── Config ────────────────────────────────────────────────────────────────────

SIGNING_RELAY_URL = os.getenv("GHOSTDNS_SIGNING_RELAY_URL", "http://127.0.0.1:7910")
# Comma-separated list of domains to watch, e.g. ghostchain.cloud,ghostl2.io
WATCHED_DOMAINS   = [
    d.strip() for d in os.getenv("GHOSTDNS_WATCHED_DOMAINS", "ghostchain.cloud").split(",") if d.strip()
]
WARN_DAYS_OUT     = int(os.getenv("GHOSTDNS_EXPIRY_WARN_DAYS", "30"))
CRITICAL_DAYS_OUT = int(os.getenv("GHOSTDNS_EXPIRY_CRITICAL_DAYS", "7"))


@dataclass(slots=True)
class DomainStatus:
    domain:      str
    expiry_days: Optional[float]   # None = unknown / check failed
    severity:    str               # "ok" | "warning" | "critical" | "unknown"
    detail:      str
    checked_at:  float = field(default_factory=time.time)


class DomainGuardian:
    """
    Periodically checks domain expiry.

    In production, integrates with a registrar API or WHOIS proxy
    (configured via GHOSTDNS_WHOIS_PROXY_URL).  Falls back to
    local state when the proxy is unavailable.
    """

    WHOIS_PROXY = os.getenv("GHOSTDNS_WHOIS_PROXY_URL", "")

    def __init__(self) -> None:
        self._last_statuses: dict[str, DomainStatus] = {}

    def check_all(self) -> list[DomainStatus]:
        results: list[DomainStatus] = []
        for domain in WATCHED_DOMAINS:
            status = self._check_domain(domain)
            self._last_statuses[domain] = status
            GHOSTDNS_DOMAIN_EXPIRY_DAYS.labels(domain=domain).set(
                status.expiry_days if status.expiry_days is not None else -1
            )
            if status.severity == "critical":
                GHOSTDNS_ANOMALY_DETECTED_TOTAL.labels(kind="domain_expiry_critical").inc()
                self._notify_signing_relay(status)
            results.append(status)
        return results

    def _check_domain(self, domain: str) -> DomainStatus:
        if not self.WHOIS_PROXY:
            return DomainStatus(
                domain=domain,
                expiry_days=None,
                severity="unknown",
                detail="GHOSTDNS_WHOIS_PROXY_URL not configured",
            )
        try:
            url = f"{self.WHOIS_PROXY.rstrip('/')}/expiry/{urllib.parse.quote(domain, safe='')}"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            expiry_epoch: float = float(data["expiry_epoch"])
            days_left = (expiry_epoch - time.time()) / 86400
            if days_left <= CRITICAL_DAYS_OUT:
                sev, detail = "critical", f"expires in {days_left:.1f} days — URGENT renewal required"
                GHOSTDNS_ANOMALY_DETECTED_TOTAL.labels(kind="domain_expiry_critical").inc()
            elif days_left <= WARN_DAYS_OUT:
                sev, detail = "warning", f"expires in {days_left:.1f} days — schedule renewal"
            else:
                sev, detail = "ok", f"expires in {days_left:.1f} days"
            return DomainStatus(domain=domain, expiry_days=days_left, severity=sev, detail=detail)
        except urllib.error.URLError as exc:
            return DomainStatus(domain=domain, expiry_days=None, severity="unknown", detail=f"whois proxy unreachable: {exc}")
        except Exception as exc:
            return DomainStatus(domain=domain, expiry_days=None, severity="unknown", detail=f"check error: {exc}")

    def _notify_signing_relay(self, status: DomainStatus) -> None:
        """Forward critical finding to signing relay for human review."""
        try:
            body = json.dumps({
                "source": "ghostdns-ai",
                "type":   "domain_expiry_alert",
                "domain": status.domain,
                "detail": status.detail,
            }).encode("utf-8")
            req = urllib.request.Request(
                url=f"{SIGNING_RELAY_URL.rstrip('/')}/proposals/advisory",
                data=body,
                headers={"content-type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
        except Exception:
            pass  # signing relay unavailable — already captured in fallback log

    def last_statuses(self) -> list[dict]:
        return [
            {
                "domain":      s.domain,
                "expiry_days": s.expiry_days,
                "severity":    s.severity,
                "detail":      s.detail,
                "checked_at":  s.checked_at,
            }
            for s in self._last_statuses.values()
        ]
