from __future__ import annotations

import datetime as dt
import hashlib
import re
import shlex
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

SERIAL_RE = re.compile(r"(?P<serial>\d{10})\s*;\s*serial", re.IGNORECASE)
LABEL_RE = re.compile(r"[^a-z0-9-]")

# ── Record types ──────────────────────────────────────────────────────────────

RecordType = Literal["A", "AAAA", "CNAME", "TXT", "MX", "SRV", "CAA", "NS"]

# Validation patterns per record type (SSRF / injection prevention)
_VALUE_RE: dict[str, re.Pattern[str]] = {
    "A":     re.compile(r"^(\d{1,3}\.){3}\d{1,3}$"),
    "AAAA":  re.compile(r"^[0-9a-fA-F:]{2,39}$"),
    "CNAME": re.compile(r"^[a-zA-Z0-9._\-]{1,253}\.?$"),
    "NS":    re.compile(r"^[a-zA-Z0-9._\-]{1,253}\.?$"),
    # MX: "<priority> <host>"
    "MX":    re.compile(r"^\d{1,5}\s+[a-zA-Z0-9._\-]{1,253}\.?$"),
    # SRV: "<priority> <weight> <port> <host>"
    "SRV":   re.compile(r"^\d{1,5}\s+\d{1,5}\s+\d{1,5}\s+[a-zA-Z0-9._\-]{1,253}\.?$"),
    # CAA: "<flag> <tag> <value>"
    "CAA":   re.compile(r'^\d{1,3}\s+(issue|issuewild|iodef)\s+"[^"]{0,253}"$'),
    # TXT: printable ASCII, no shell metacharacters
    "TXT":   re.compile(r'^"[^"<>`;&|$\\\x00-\x1f]{0,255}"$'),
}


@dataclass(slots=True)
class DnsRecord:
    """A structured DNS record (any type)."""
    fqdn:   str
    rtype:  RecordType
    value:  str
    ttl:    int = 300

    def validate(self) -> None:
        """Raise ValueError if the record value is syntactically invalid."""
        pattern = _VALUE_RE.get(self.rtype)
        if pattern and not pattern.match(self.value):
            raise ValueError(f"invalid {self.rtype} value: {self.value!r}")


@dataclass(slots=True)
class ZoneState:
    serial: int
    records: dict[str, tuple[str, int]]
    rendered: str
    multi_records: list[DnsRecord] = field(default_factory=list)


def bump_serial(current: int, now: dt.datetime | None = None) -> int:
    now = now or dt.datetime.now(dt.timezone.utc)
    prefix = now.strftime("%Y%m%d")
    text = str(current)
    seq = int(text[-2:]) + 1 if text.startswith(prefix) else 1
    return int(f"{prefix}{seq:02d}")


def parse_serial(zone_text: str) -> int:
    match = SERIAL_RE.search(zone_text)
    if not match:
        raise ValueError("zone_serial_not_found")
    return int(match.group("serial"))


def render_zone(
    domain: str,
    template_text: str,
    records: dict[str, tuple[str, int]],
    multi_records: list[DnsRecord] | None = None,
) -> ZoneState:
    current = parse_serial(template_text)
    next_serial = bump_serial(current)
    sorted_items = sorted(records.items(), key=lambda item: item[0])

    lines: list[str] = []
    normalized_domain = _normalize_fqdn(domain)

    # ── A records (legacy dict format) ────────────────────────────────────────
    for fqdn, (value, ttl) in sorted_items:
        normalized_fqdn = _normalize_fqdn(fqdn)
        if not normalized_fqdn:
            continue
        if normalized_fqdn != normalized_domain and not normalized_fqdn.endswith(f".{normalized_domain}"):
            continue
        host = "@" if normalized_fqdn == normalized_domain else normalized_fqdn.removesuffix(f".{normalized_domain}")
        if not host:
            continue
        lines.append(f"{host:<35} {ttl} IN A {value}")

    # ── Multi-type records ────────────────────────────────────────────────────
    for rec in sorted(multi_records or [], key=lambda r: (r.rtype, r.fqdn)):
        rec.validate()
        normalized_fqdn = _normalize_fqdn(rec.fqdn)
        if not normalized_fqdn:
            continue
        if normalized_fqdn != normalized_domain and not normalized_fqdn.endswith(f".{normalized_domain}"):
            continue
        host = "@" if normalized_fqdn == normalized_domain else normalized_fqdn.removesuffix(f".{normalized_domain}")
        if not host:
            continue
        lines.append(f"{host:<35} {rec.ttl} IN {rec.rtype} {rec.value}")

    body = SERIAL_RE.sub(f"{next_serial} ; serial", template_text, count=1)
    rendered = body + "\n" + "\n".join(lines) + "\n"
    return ZoneState(serial=next_serial, records=records, rendered=rendered, multi_records=multi_records or [])


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_zone(zone_path: Path, rendered: str) -> None:
    zone_path.parent.mkdir(parents=True, exist_ok=True)
    zone_path.write_text(rendered, encoding="utf-8")


def validate_bind(named_checkconf: str, named_checkzone: str, zone: str, zone_path: Path) -> None:
    subprocess.run(shlex.split(named_checkconf), check=True, capture_output=True, text=True)
    subprocess.run(shlex.split(f"{named_checkzone} {zone} {zone_path}"), check=True, capture_output=True, text=True)


def safe_reload(reload_cmd: str) -> None:
    try:
        subprocess.run(shlex.split(reload_cmd), check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError:
        subprocess.run(["pkill", "-HUP", "named"], check=True, capture_output=True, text=True)


def _normalize_fqdn(value: str) -> str:
    labels: list[str] = []
    for raw_label in value.strip().lower().strip(".").split("."):
        cleaned = LABEL_RE.sub("-", raw_label).strip("-")
        cleaned = re.sub(r"-{2,}", "-", cleaned)
        if not cleaned:
            continue
        labels.append(cleaned)
    return ".".join(labels)
