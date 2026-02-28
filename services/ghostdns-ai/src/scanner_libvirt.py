from __future__ import annotations

import json
from pathlib import Path
from typing import Dict


def scan_libvirt_records(domain: str, leases_file: Path) -> Dict[str, str]:
    if not leases_file.exists():
        return {}
    try:
        payload = json.loads(leases_file.read_text(encoding="utf-8"))
    except Exception:
        return {}

    records: Dict[str, str] = {}
    for item in payload if isinstance(payload, list) else []:
        hostname = str(item.get("hostname") or item.get("name") or "").strip().lower()
        ip = str(item.get("ip") or "").strip()
        if not hostname or not ip:
            continue
        records[f"{hostname}.{domain}"] = ip
    return records
