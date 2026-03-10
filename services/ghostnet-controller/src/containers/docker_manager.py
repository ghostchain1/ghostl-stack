"""Docker container management via the Docker SDK (no subprocess, no shell).

Security guarantees
-------------------
* Uses docker-py SDK exclusively — no subprocess or shell invocation.
* Auto-heal only operates on containers whose name starts with "ghost".
* When GNMC_CONTAINER_ALLOWLIST is set, only listed containers may be restarted.
* Per-container cooldown (GNMC_CONTAINER_COOLDOWN_S) and hourly circuit breaker
  (GNMC_CONTAINER_MAX_PER_HOUR) prevent restart storms.
* GNMC_CONTAINER_DRY_RUN=1 by default: no container is actually restarted
  until the operator explicitly sets it to 0.
"""
from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
_ALLOWLIST_RAW: str = os.getenv("GNMC_CONTAINER_ALLOWLIST", "")
# Empty frozenset → skip allowlist check (any ghost-* container may be healed),
# but still subject to DRY_RUN and rate limits.
_CONTAINER_ALLOWLIST: frozenset[str] = frozenset(
    n.strip() for n in _ALLOWLIST_RAW.split(",") if n.strip()
)
_COOLDOWN_S: int = max(30, int(os.getenv("GNMC_CONTAINER_COOLDOWN_S", "60")))
_MAX_PER_HOUR: int = max(1, int(os.getenv("GNMC_CONTAINER_MAX_PER_HOUR", "6")))
_DRY_RUN: bool = os.getenv("GNMC_CONTAINER_DRY_RUN", "1").strip() not in ("0", "false", "False")


# ── Rate / cooldown tracking ──────────────────────────────────────────────────
@dataclass
class ContainerInfo:
    id: str
    name: str
    status: str
    image: str


@dataclass
class _RestartRecord:
    timestamps: list[float] = field(default_factory=list)
    last_restart: float = 0.0


_restart_records: dict[str, _RestartRecord] = defaultdict(_RestartRecord)


def _check_rate(name: str) -> tuple[bool, str]:
    now = time.monotonic()
    rec = _restart_records[name]
    rec.timestamps = [t for t in rec.timestamps if now - t < 3600]
    if len(rec.timestamps) >= _MAX_PER_HOUR:
        return False, f"circuit breaker: {_MAX_PER_HOUR} restarts/hour exceeded"
    if now - rec.last_restart < _COOLDOWN_S:
        remaining = int(_COOLDOWN_S - (now - rec.last_restart))
        return False, f"cooldown: {remaining}s remaining"
    return True, ""


def _record_restart(name: str) -> None:
    now = time.monotonic()
    rec = _restart_records[name]
    rec.timestamps.append(now)
    rec.last_restart = now


# ── Public API ────────────────────────────────────────────────────────────────
def list_containers() -> list[ContainerInfo]:
    """Return all containers (running + stopped) visible to the Docker daemon."""
    try:
        import docker
        client = docker.from_env()
        result: list[ContainerInfo] = []
        for c in client.containers.list(all=True):
            name: str = c.name or c.short_id
            image_tag: str = c.image.tags[0] if c.image.tags else "unknown"
            result.append(ContainerInfo(
                id=c.short_id,
                name=name,
                status=c.status,
                image=image_tag,
            ))
        return result
    except Exception as exc:
        logger.warning("Docker list_containers error: %s", exc)
        return []


def restart_container(name: str) -> dict:
    """Restart a specific container by name, subject to allowlist + rate limits."""
    # Allowlist check (only enforced when list is non-empty)
    if _CONTAINER_ALLOWLIST and name not in _CONTAINER_ALLOWLIST:
        return {"ok": False, "reason": "not in allowlist"}

    allowed, reason = _check_rate(name)
    if not allowed:
        return {"ok": False, "reason": reason}

    if _DRY_RUN:
        logger.info("[DRY_RUN] Would restart container: %s", name)
        return {"ok": True, "dry_run": True, "container": name}

    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(name)
        container.restart(timeout=10)
        _record_restart(name)
        logger.info("Restarted container: %s", name)
        return {"ok": True, "container": name}
    except Exception as exc:
        logger.error("Container restart error for %s: %s", name, exc)
        return {"ok": False, "reason": str(exc)}


def heal_stopped_containers() -> list[dict]:
    """Find exited/dead containers prefixed with 'ghost' and attempt restart.

    Only acts on containers that start with 'ghost'.  If GNMC_CONTAINER_ALLOWLIST
    is set, further restricts to listed names.  DRY_RUN and rate limits apply.
    """
    events: list[dict] = []
    for c in list_containers():
        if c.status not in ("exited", "dead"):
            continue
        if not c.name.startswith("ghost"):
            continue
        result = restart_container(c.name)
        events.append({"container": c.name, **result})
    return events
