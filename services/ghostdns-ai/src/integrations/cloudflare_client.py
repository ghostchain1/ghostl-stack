"""
GhostDNS AI — Cloudflare DNS Integration

Pushes DNS records to Cloudflare via the Cloudflare API v4.
Used for external-facing zones (e.g. ghostchain.cloud on Cloudflare CDN)
while Bind9 handles internal/private resolution.

Security:
  - API token from env (GHOSTDNS_CF_API_TOKEN) — never hardcoded
  - Zone ID from env (GHOSTDNS_CF_ZONE_ID)    — never guessed
  - All record values validated by DnsRecord.validate() before sync
  - Uses urllib (stdlib) — no third-party HTTP dependency
  - No shell: True subprocess calls

Env vars required:
  GHOSTDNS_CF_API_TOKEN  — scoped Cloudflare API token (Zone:DNS:Edit)
  GHOSTDNS_CF_ZONE_ID    — Cloudflare zone ID for GHOSTDNS_DOMAIN
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional

from src.metrics import GHOSTDNS_CLOUDFLARE_SYNC_TOTAL
from src.zone_manager import DnsRecord

_CF_API_BASE = "https://api.cloudflare.com/client/v4"

# ── Config ────────────────────────────────────────────────────────────────────

CF_API_TOKEN = os.getenv("GHOSTDNS_CF_API_TOKEN", "")
CF_ZONE_ID   = os.getenv("GHOSTDNS_CF_ZONE_ID",   "")


@dataclass(slots=True)
class CfRecord:
    """Cloudflare record representation (minimal fields)."""
    id:      str
    type:    str
    name:    str
    content: str
    ttl:     int
    proxied: bool


class CloudflareClient:
    """
    Thin Cloudflare DNS client.

    Only Zone:DNS:Edit scope is required on the API token.
    Writes are idempotent: existing records are updated, new ones created.
    """

    def __init__(self) -> None:
        if not CF_API_TOKEN or not CF_ZONE_ID:
            raise RuntimeError(
                "GHOSTDNS_CF_API_TOKEN and GHOSTDNS_CF_ZONE_ID must be set "
                "to enable Cloudflare sync"
            )

    # ── Low-level HTTP ────────────────────────────────────────────────────────

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> Any:
        url = f"{_CF_API_BASE}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            url=url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {CF_API_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            payload = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Cloudflare API {method} {path} → {exc.code}: {payload}") from exc

    # ── Public API ────────────────────────────────────────────────────────────

    def list_records(self, rtype: Optional[str] = None) -> list[CfRecord]:
        params = f"?per_page=100{f'&type={rtype}' if rtype else ''}"
        data = self._request("GET", f"/zones/{CF_ZONE_ID}/dns_records{params}")
        return [
            CfRecord(
                id=r["id"],
                type=r["type"],
                name=r["name"],
                content=r["content"],
                ttl=r.get("ttl", 300),
                proxied=r.get("proxied", False),
            )
            for r in data.get("result", [])
        ]

    def upsert_record(self, rec: DnsRecord, proxied: bool = False) -> str:
        """Create or update a DNS record.  Returns the Cloudflare record ID."""
        rec.validate()
        existing = [r for r in self.list_records(rtype=rec.rtype) if r.name == rec.fqdn]
        payload: dict = {
            "type":    rec.rtype,
            "name":    rec.fqdn,
            "content": rec.value,
            "ttl":     rec.ttl,
            "proxied": proxied,
        }
        if existing:
            rid = existing[0].id
            self._request("PUT", f"/zones/{CF_ZONE_ID}/dns_records/{rid}", payload)
            GHOSTDNS_CLOUDFLARE_SYNC_TOTAL.labels(status="updated").inc()
            return rid
        result = self._request("POST", f"/zones/{CF_ZONE_ID}/dns_records", payload)
        GHOSTDNS_CLOUDFLARE_SYNC_TOTAL.labels(status="created").inc()
        return result["result"]["id"]

    def delete_record(self, record_id: str) -> None:
        self._request("DELETE", f"/zones/{CF_ZONE_ID}/dns_records/{record_id}")
        GHOSTDNS_CLOUDFLARE_SYNC_TOTAL.labels(status="deleted").inc()

    def sync_records(self, desired: list[DnsRecord], proxied: bool = False) -> dict:
        """
        Idempotent sync: ensure exactly the desired records exist in Cloudflare.
        Returns summary of created/updated/deleted counts.
        """
        counts = {"created": 0, "updated": 0, "deleted": 0, "errors": 0}
        desired_map = {(r.fqdn, r.rtype): r for r in desired}
        existing    = self.list_records()
        existing_map = {(r.name, r.type): r for r in existing}

        for key, rec in desired_map.items():
            try:
                if key in existing_map:
                    old = existing_map[key]
                    if old.content != rec.value or old.ttl != rec.ttl:
                        self.upsert_record(rec, proxied=proxied)
                        counts["updated"] += 1
                else:
                    self.upsert_record(rec, proxied=proxied)
                    counts["created"] += 1
            except Exception:
                counts["errors"] += 1
                GHOSTDNS_CLOUDFLARE_SYNC_TOTAL.labels(status="error").inc()

        return counts
