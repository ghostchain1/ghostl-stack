"""
GhostDNS AI — ACME Certificate Manager

Automates TLS certificate lifecycle via the ACME protocol:

  • Checks certificate expiry for configured domains
  • Triggers renewal via certbot (subprocess, no shell=True)
  • Exposes expiry metrics to Prometheus
  • Notifies signing relay when manual intervention is needed

Security:
  - No shell=True in any subprocess call
  - certbot arguments built as explicit list (shlex-safe)
  - Certificate paths never interpolated from user input
  - Renewal only for explicitly allowlisted domains

Env vars:
  GHOSTDNS_CERTBOT_DOMAINS   — comma-separated domains to manage
  GHOSTDNS_CERTBOT_EMAIL     — ACME account email (required)
  GHOSTDNS_CERTBOT_WEBROOT   — webroot path for HTTP-01 challenge
  GHOSTDNS_CERT_DIR          — base directory for live certs (default /etc/letsencrypt/live)
  GHOSTDNS_CERT_RENEW_DAYS   — renew when fewer than N days remain (default 14)
"""

from __future__ import annotations

import datetime
import os
import ssl
import socket
import subprocess
from dataclasses import dataclass, field
from typing import Optional

from src.metrics import GHOSTDNS_CERT_EXPIRY_DAYS, GHOSTDNS_ANOMALY_DETECTED_TOTAL

# ── Config ────────────────────────────────────────────────────────────────────

_raw_domains = os.getenv("GHOSTDNS_CERTBOT_DOMAINS", "")
CERT_DOMAINS     = [d.strip() for d in _raw_domains.split(",") if d.strip()]
CERTBOT_EMAIL    = os.getenv("GHOSTDNS_CERTBOT_EMAIL", "")
CERTBOT_WEBROOT  = os.getenv("GHOSTDNS_CERTBOT_WEBROOT", "/var/www/certbot")
CERT_DIR         = os.getenv("GHOSTDNS_CERT_DIR", "/etc/letsencrypt/live")
RENEW_THRESHOLD  = int(os.getenv("GHOSTDNS_CERT_RENEW_DAYS", "14"))


@dataclass(slots=True)
class CertStatus:
    domain:      str
    expiry_days: Optional[float]
    severity:    str          # "ok" | "warning" | "critical" | "unknown"
    detail:      str
    renewed:     bool = False
    checked_at:  float = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).timestamp())


class AcmeManager:
    """Inspect and renew TLS certificates for CERT_DOMAINS."""

    def check_and_renew_all(self) -> list[CertStatus]:
        results: list[CertStatus] = []
        for domain in CERT_DOMAINS:
            status = self._check(domain)
            GHOSTDNS_CERT_EXPIRY_DAYS.labels(domain=domain).set(
                status.expiry_days if status.expiry_days is not None else -1
            )
            if status.expiry_days is not None and status.expiry_days < RENEW_THRESHOLD:
                renewed = self._renew(domain)
                status = CertStatus(
                    domain=domain,
                    expiry_days=status.expiry_days,
                    severity=status.severity,
                    detail=f"{status.detail} — renewal {'succeeded' if renewed else 'FAILED'}",
                    renewed=renewed,
                )
                if not renewed:
                    GHOSTDNS_ANOMALY_DETECTED_TOTAL.labels(kind="cert_renewal_failed").inc()
            results.append(status)
        return results

    def _check(self, domain: str) -> CertStatus:
        """Use TLS handshake to read certificate expiry (no external tools needed)."""
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((domain, 443), timeout=10) as raw_sock:
                with ctx.wrap_socket(raw_sock, server_hostname=domain) as tls_sock:
                    cert = tls_sock.getpeercert()
            expiry_str = cert["notAfter"]  # e.g. "Mar 10 12:00:00 2027 GMT"
            expiry_dt = datetime.datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z").replace(
                tzinfo=datetime.timezone.utc
            )
            now = datetime.datetime.now(datetime.timezone.utc)
            days_left = (expiry_dt - now).total_seconds() / 86400
            if days_left <= RENEW_THRESHOLD:
                sev = "critical" if days_left <= 3 else "warning"
                detail = f"expires in {days_left:.1f} days"
            else:
                sev, detail = "ok", f"expires in {days_left:.1f} days"
            return CertStatus(domain=domain, expiry_days=days_left, severity=sev, detail=detail)
        except ssl.SSLCertVerificationError as exc:
            GHOSTDNS_ANOMALY_DETECTED_TOTAL.labels(kind="cert_verification_failed").inc()
            return CertStatus(domain=domain, expiry_days=None, severity="critical", detail=f"cert verification failed: {exc}")
        except OSError as exc:
            return CertStatus(domain=domain, expiry_days=None, severity="unknown", detail=f"connection failed: {exc}")

    def _renew(self, domain: str) -> bool:
        """
        Trigger certbot renewal.  Uses explicit arg list — no shell=True.
        Returns True if renewal succeeded.
        """
        if not CERTBOT_EMAIL:
            return False  # cannot renew without contact email
        cmd = [
            "certbot", "certonly",
            "--webroot",
            "--webroot-path", CERTBOT_WEBROOT,
            "--non-interactive",
            "--agree-tos",
            "--email", CERTBOT_EMAIL,
            "--domain", domain,
            "--cert-name", domain,
            "--keep-until-expiring",
        ]
        try:
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
            )
            return result.returncode == 0
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False

    def all_statuses(self) -> list[dict]:
        return [
            {
                "domain":      s.domain,
                "expiry_days": s.expiry_days,
                "severity":    s.severity,
                "detail":      s.detail,
                "renewed":     s.renewed,
            }
            for s in self.check_and_renew_all()
        ]
