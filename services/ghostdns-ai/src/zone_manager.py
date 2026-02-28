from __future__ import annotations

import datetime as dt
import hashlib
import re
import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path

SERIAL_RE = re.compile(r"(?P<serial>\d{10})\s*;\s*serial", re.IGNORECASE)
LABEL_RE = re.compile(r"[^a-z0-9-]")


@dataclass(slots=True)
class ZoneState:
    serial: int
    records: dict[str, tuple[str, int]]
    rendered: str


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


def render_zone(domain: str, template_text: str, records: dict[str, tuple[str, int]]) -> ZoneState:
    current = parse_serial(template_text)
    next_serial = bump_serial(current)
    sorted_items = sorted(records.items(), key=lambda item: item[0])

    lines: list[str] = []
    normalized_domain = _normalize_fqdn(domain)
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

    body = SERIAL_RE.sub(f"{next_serial} ; serial", template_text, count=1)
    rendered = body + "\n" + "\n".join(lines) + "\n"
    return ZoneState(serial=next_serial, records=records, rendered=rendered)


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
