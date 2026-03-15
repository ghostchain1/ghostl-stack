"""Self-healing infrastructure controller — Docker container recovery.

Monitors containers in the allowlist; if one is not in the ``running``
state it restarts it via the Docker SDK (never subprocess / shell=True).

VM scale-out is handled EXCLUSIVELY via governance proposals sent to the
signing relay at :7910 — this module NEVER calls virt-install or any other
VM management command.  Autonomous VM creation requires human ratification.

Safety controls (matching the GAIS supervisor pattern):
  - ``GHOSTDNS_HEAL_CONTAINER_ALLOWLIST`` — empty = no action
  - Per-container restart cooldown: ``COOLDOWN_S`` (default 120 s)
  - Circuit breaker: ``MAX_PER_HOUR`` restarts per container per hour
  - ``GHOSTDNS_HEAL_DRY_RUN=1`` — dry-run, logs only (never restarts)
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from src.metrics import GHOSTDNS_HEALER_RESTARTS_TOTAL

COOLDOWN_S: int = int(os.getenv("GHOSTDNS_HEAL_COOLDOWN_S", "120"))
MAX_PER_HOUR: int = int(os.getenv("GHOSTDNS_HEAL_MAX_PER_HOUR", "4"))
_HOUR_S: int = 3600
DRY_RUN: bool = os.getenv("GHOSTDNS_HEAL_DRY_RUN", "0") == "1"


@dataclass
class _ContainerState:
    last_restart: float = 0.0
    restart_times: list[float] = field(default_factory=list)


class SelfHealer:
    """Docker container self-healer with allowlist, cooldown, circuit breaker."""

    def __init__(self, signing_relay_url: str) -> None:
        self._signing_relay_url = signing_relay_url
        self._allowlist: set[str] = self._load_allowlist()
        self._state: dict[str, _ContainerState] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _load_allowlist() -> set[str]:
        raw = os.getenv("GHOSTDNS_HEAL_CONTAINER_ALLOWLIST", "")
        return {name.strip() for name in raw.split(",") if name.strip()}

    def _get_state(self, name: str) -> _ContainerState:
        if name not in self._state:
            self._state[name] = _ContainerState()
        return self._state[name]

    def _can_restart(self, name: str) -> tuple[bool, str]:
        """Returns (allowed, reason_if_denied).  Caller must hold _lock."""
        state = self._get_state(name)
        now = time.monotonic()

        if now - state.last_restart < COOLDOWN_S:
            remaining = int(COOLDOWN_S - (now - state.last_restart))
            return False, f"cooldown:{remaining}s_remaining"

        recent = [t for t in state.restart_times if now - t < _HOUR_S]
        state.restart_times = recent  # prune old entries
        if len(recent) >= MAX_PER_HOUR:
            return False, f"circuit_breaker:{len(recent)}_restarts_in_last_hour"

        return True, ""

    # ── Main check ────────────────────────────────────────────────────────────

    def run_checks(self) -> list[dict]:
        """Check all allowlisted containers; restart the crashed ones.

        Returns action dicts for event logging.
        """
        if not self._allowlist:
            return []

        try:
            import docker as docker_sdk  # lazy import: keeps startup fast if not used
            client = docker_sdk.from_env()
        except Exception as exc:
            return [{"error": "docker_unavailable", "detail": str(exc)}]

        events: list[dict] = []

        for name in sorted(self._allowlist):
            try:
                container = client.containers.get(name)
                status = container.status
                if status == "running":
                    continue

                with self._lock:
                    allowed, reason = self._can_restart(name)

                if not allowed:
                    events.append({"container": name, "status": status,
                                   "action": "skipped", "reason": reason})
                    continue

                if DRY_RUN:
                    events.append({"container": name, "status": status,
                                   "action": "dry_run_restart"})
                else:
                    container.restart(timeout=10)
                    with self._lock:
                        state = self._get_state(name)
                        now = time.monotonic()
                        state.last_restart = now
                        state.restart_times.append(now)
                    GHOSTDNS_HEALER_RESTARTS_TOTAL.labels(target=name).inc()
                    events.append({"container": name, "status": status, "action": "restarted"})

            except Exception as exc:
                events.append({"container": name, "action": "error", "error": str(exc)})

        return events

    # ── VM scale-out proposal (NEVER autonomous) ──────────────────────────────

    def propose_vm_scale_out(self, reason: str, suggested_name: str) -> dict:
        """Send a VM scale-out PROPOSAL to the signing relay for human ratification.

        This method NEVER calls virt-install or any hypervisor command.
        Autonomous VM creation is a governance action — humans must approve.
        """
        payload = json.dumps({
            "type": "vm_scale_out_proposal",
            "reason": reason,
            "suggested_name": suggested_name,
            "source": "ghostdns-ai-self-healer",
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self._signing_relay_url}/proposals",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return {"ok": True, "relay_status": resp.status}
        except urllib.error.URLError as exc:
            return {"ok": False, "error": str(exc)}

    # ── Allowlist management ──────────────────────────────────────────────────

    def add_to_allowlist(self, name: str) -> None:
        with self._lock:
            self._allowlist.add(name)

    def remove_from_allowlist(self, name: str) -> bool:
        with self._lock:
            before = name in self._allowlist
            self._allowlist.discard(name)
            return before

    def healer_status(self) -> dict:
        now = time.monotonic()
        with self._lock:
            return {
                "dry_run": DRY_RUN,
                "cooldown_s": COOLDOWN_S,
                "max_restarts_per_hour": MAX_PER_HOUR,
                "allowlist": sorted(self._allowlist),
                "container_states": {
                    name: {
                        "last_restart_ago_s": int(now - s.last_restart) if s.last_restart > 0 else None,
                        "restarts_last_hour": len([t for t in s.restart_times if now - t < _HOUR_S]),
                    }
                    for name, s in self._state.items()
                },
            }
