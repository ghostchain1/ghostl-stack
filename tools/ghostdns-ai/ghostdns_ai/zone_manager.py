from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from shutil import copy2
from tempfile import NamedTemporaryFile
from typing import Dict


SERIAL_PATTERN = re.compile(r"(?P<serial>\d+)\s*;\s*serial", re.IGNORECASE)
A_RECORD_PATTERN = re.compile(r"^(?P<host>\S+)\s+IN\s+A\s+(?P<ip>\S+)\s*$", re.IGNORECASE)


@dataclass(slots=True)
class ZoneContent:
    header_lines: list[str]
    serial: int
    records: Dict[str, str]


class ZoneManager:
    def __init__(self, zone_file: Path, backup_dir: Path, zone_name: str) -> None:
        self.zone_file = zone_file
        self.backup_dir = backup_dir
        self.zone_name = zone_name.rstrip(".")

    def load(self) -> ZoneContent:
        lines = self.zone_file.read_text(encoding="utf-8").splitlines()
        serial = None
        records: Dict[str, str] = {}
        header_lines: list[str] = []

        for line in lines:
            stripped = line.strip()
            serial_match = SERIAL_PATTERN.search(stripped)
            if serial_match:
                serial = int(serial_match.group("serial"))
                header_lines.append(line)
                continue

            rec_match = A_RECORD_PATTERN.match(stripped)
            if rec_match:
                host = rec_match.group("host")
                if host == "@":
                    fqdn = self.zone_name
                elif host.endswith("."):
                    fqdn = host.rstrip(".")
                else:
                    fqdn = f"{host}.{self.zone_name}"
                records[fqdn] = rec_match.group("ip")
            else:
                header_lines.append(line)

        if serial is None:
            raise ValueError("zone_serial_not_found")

        return ZoneContent(header_lines=header_lines, serial=serial, records=records)

    @staticmethod
    def next_serial(current_serial: int) -> int:
        today_prefix = datetime.now(timezone.utc).strftime("%Y%m%d")
        current = str(current_serial)
        if current.startswith(today_prefix):
            sequence = int(current[-2:]) + 1
        else:
            sequence = 1
        return int(f"{today_prefix}{sequence:02d}")

    def render(self, zone: ZoneContent, records: Dict[str, str]) -> str:
        next_serial = self.next_serial(zone.serial)
        rendered_header = []
        replaced = False
        for line in zone.header_lines:
            if SERIAL_PATTERN.search(line) and not replaced:
                rendered_header.append(SERIAL_PATTERN.sub(f"{next_serial} ; serial", line))
                replaced = True
            else:
                rendered_header.append(line)

        sorted_records = sorted(records.items(), key=lambda item: item[0])
        zone_lines = rendered_header + [""]
        for fqdn, ip in sorted_records:
            if fqdn == self.zone_name:
                host = "@"
            elif fqdn.endswith(f".{self.zone_name}"):
                host = fqdn[: -len(f".{self.zone_name}")]
            else:
                host = f"{fqdn}."
            zone_lines.append(f"{host:<35} IN A {ip}")
        return "\n".join(zone_lines) + "\n"

    def backup_current(self) -> Path:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        backup = self.backup_dir / f"db.ghostchain.cloud.{timestamp}.bak"
        copy2(self.zone_file, backup)
        return backup

    def write_atomic(self, content: str) -> None:
        self.zone_file.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile("w", delete=False, dir=str(self.zone_file.parent), encoding="utf-8") as handle:
            handle.write(content)
            temp_path = Path(handle.name)
        temp_path.replace(self.zone_file)
