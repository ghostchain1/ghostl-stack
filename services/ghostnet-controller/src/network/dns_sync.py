"""DNS record sync — delegates to ghostdns-ai REST API.

Security guarantees
-------------------
* Never writes to /etc/bind/ directly; all mutations go through the
  ghostdns-ai service (which owns Bind9 reconciliation).
* Record names and IP values are validated here before any network call.
* HMAC governance header forwarded when HGOP_SHARED_SECRET is set.
"""
from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_GHOSTDNS_URL: str = os.getenv(
    "GNMC_GHOSTDNS_URL",
    os.getenv("GHOSTDNS_BASE_URL", "http://127.0.0.1:18089"),
)
_TIMEOUT_S: int = min(30, max(1, int(os.getenv("GNMC_DNS_TIMEOUT_S", "10"))))
_SHARED_SECRET: str = os.getenv("HGOP_SHARED_SECRET", "")

# Simple DNS label validation (RFC 1035 relaxed)
_FQDN_RE = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.?$')
_IPV4_RE = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')


@dataclass
class DnsRecord:
    name: str
    ip: str
    ttl: int = 60
    rtype: str = "A"


def _auth_headers() -> dict[str, str]:
    if not _SHARED_SECRET:
        return {}
    import hashlib
    import hmac
    import time as _time
    ts = str(int(_time.time()))
    sig = hmac.new(_SHARED_SECRET.encode(), ts.encode(), hashlib.sha256).hexdigest()
    return {"X-HGOP-Timestamp": ts, "X-HGOP-Signature": sig}


def _validate_record(record: DnsRecord) -> str | None:
    """Return an error string if validation fails, else None."""
    if not _FQDN_RE.match(record.name):
        return f"invalid DNS name: {record.name!r}"
    if not _IPV4_RE.match(record.ip):
        return f"invalid IPv4 address: {record.ip!r}"
    octets = [int(o) for o in record.ip.split(".")]
    if any(o > 255 for o in octets):
        return f"IPv4 octet out of range: {record.ip!r}"
    if not (1 <= record.ttl <= 86400):
        return f"TTL out of range: {record.ttl}"
    return None


def upsert_record(record: DnsRecord) -> dict:
    """Push a DNS record to ghostdns-ai via its /records/upsert endpoint."""
    err = _validate_record(record)
    if err:
        return {"ok": False, "reason": err}

    payload = json.dumps({
        "name": record.name,
        "rtype": record.rtype,
        "value": record.ip,
        "ttl": record.ttl,
    }).encode("utf-8")

    try:
        headers = {"Content-Type": "application/json", **_auth_headers()}
        req = urllib.request.Request(
            f"{_GHOSTDNS_URL}/records/upsert",
            data=payload,
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return {"ok": True, "status": resp.status}
    except urllib.error.URLError as exc:
        logger.warning("ghostdns-ai upsert failed: %s", exc)
        return {"ok": False, "reason": str(exc)}


def get_zone() -> dict:
    """Fetch the current DNS zone state from ghostdns-ai."""
    try:
        req = urllib.request.Request(f"{_GHOSTDNS_URL}/zone")
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        logger.warning("ghostdns-ai zone fetch failed: %s", exc)
        return {}
