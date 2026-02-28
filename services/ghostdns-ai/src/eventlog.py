from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class EventLogger:
    hgop_url: str
    fallback_log: Path

    def emit(self, level: str, event_type: str, message: str, payload: dict | None = None) -> None:
        event = {
            "level": level,
            "type": event_type,
            "message": message,
            "payload": payload or {},
        }
        body = json.dumps(event).encode("utf-8")
        req = urllib.request.Request(
            url=f"{self.hgop_url.rstrip('/')}/ghostdns/events",
            data=body,
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=3):
                return
        except Exception:
            self.fallback_log.parent.mkdir(parents=True, exist_ok=True)
            with self.fallback_log.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(event) + "\n")
