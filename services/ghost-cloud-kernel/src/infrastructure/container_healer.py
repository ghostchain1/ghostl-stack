"""Container self-healing via Docker SDK — no subprocess, no shell.

Security fixes vs spec
----------------------
The original TypeScript healed ALL non-running containers regardless of name
or origin.  This implementation adds:
  * Name-prefix filter: only 'ghost-*' containers are eligible.
  * GACK_CONTAINER_ALLOWLIST: optional comma-separated explicit allowlist.
    When set, only listed names are touched.
  * Per-container cooldown (GACK_CONTAINER_COOLDOWN_S, default 60 s).
  * Hourly circuit breaker (GACK_CONTAINER_MAX_PER_HOUR, default 6).
  * GACK_CONTAINER_DRY_RUN=1 by default — no restarts until disabled.
"""
from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_ALLOWLIST_RAW: str = os.getenv("GACK_CONTAINER_ALLOWLIST", "")
_CONTAINER_ALLOWLIST: frozenset[str] = frozenset(
    n.strip() for n in _ALLOWLIST_RAW.split(",") if n.strip()
)
_COOLDOWN_S: int = max(30, int(os.getenv("GACK_CONTAINER_COOLDOWN_S", "60")))
_MAX_PER_HOUR: int = max(1, int(os.getenv("GACK_CONTAINER_MAX_PER_HOUR", "6")))
_DRY_RUN: bool = os.getenv("GACK_CONTAINER_DRY_RUN", "1").strip() not in ("0", "false", "False")


@dataclass
class _RestartRecord:
    timestamps: list[float] = field(default_factory=list)
    last_restart: float = 0.0


_records: dict[str, _RestartRecord] = defaultdict(_RestartRecord)


def _allowed(name: str) -> tuple[bool, str]:
    """Return (allowed, reason).  Checks allowlist, cooldown, circuit breaker."""
    if _CONTAINER_ALLOWLIST and name not in _CONTAINER_ALLOWLIST:
        return False, "not in allowlist"
    now = time.monotonic()
    rec = _records[name]
    rec.timestamps = [t for t in rec.timestamps if now - t < 3600]
    if len(rec.timestamps) >= _MAX_PER_HOUR:
        return False, f"circuit breaker: {_MAX_PER_HOUR} restarts/hour exceeded"
    if now - rec.last_restart < _COOLDOWN_S:
        return False, f"cooldown: {int(_COOLDOWN_S - (now - rec.last_restart))}s remaining"
    return True, ""


def _record(name: str) -> None:
    now = time.monotonic()
    _records[name].timestamps.append(now)
    _records[name].last_restart = now


def heal_containers() -> list[dict]:
    """Scan for stopped ghost-* containers and restart eligible ones.

    Returns a list of heal event dicts for monitoring / Prometheus.
    """
    events: list[dict] = []
    try:
        import docker
        client = docker.from_env()
    except Exception as exc:
        logger.warning("Docker client unavailable: %s", exc)
        return [{"ok": False, "reason": str(exc)}]

    try:
        containers = client.containers.list(all=True)
    except Exception as exc:
        logger.error("Container list failed: %s", exc)
        return [{"ok": False, "reason": str(exc)}]

    for c in containers:
        if c.status not in ("exited", "dead"):
            continue
        name: str = c.name or c.short_id
        if not name.startswith("ghost"):
            continue

        ok, reason = _allowed(name)
        if not ok:
            logger.debug("Skip heal for %s: %s", name, reason)
            continue

        if _DRY_RUN:
            logger.info("[DRY_RUN] Would restart container: %s", name)
            events.append({"container": name, "ok": True, "dry_run": True})
            continue

        try:
            c.restart(timeout=10)
            _record(name)
            logger.info("Healed container: %s", name)
            events.append({"container": name, "ok": True})
        except Exception as exc:
            logger.error("Container heal failed for %s: %s", name, exc)
            events.append({"container": name, "ok": False, "reason": str(exc)})

    return events
