"""Load-balancer proxy — delegates to ghostdns-ai REST API.

GNMC does not implement its own LB algorithm; it proxies through the
ghostdns-ai weighted load balancer endpoint so state stays in one place.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

_GHOSTDNS_URL: str = os.getenv(
    "GNMC_GHOSTDNS_URL",
    os.getenv("GHOSTDNS_BASE_URL", "http://127.0.0.1:18089"),
)
_TIMEOUT_S: int = min(30, max(1, int(os.getenv("GNMC_DNS_TIMEOUT_S", "10"))))


def select_backend(service: str) -> dict:
    """Ask ghostdns-ai to select the best backend for the given service."""
    try:
        req = urllib.request.Request(f"{_GHOSTDNS_URL}/lb/select/{service}")
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        logger.warning("LB select failed for service=%s: %s", service, exc)
        return {"ok": False, "reason": str(exc)}


def list_lb_services() -> dict:
    """Return all registered load-balanced services from ghostdns-ai."""
    try:
        req = urllib.request.Request(f"{_GHOSTDNS_URL}/lb/services")
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        logger.warning("LB list_services failed: %s", exc)
        return {"ok": False, "reason": str(exc)}
