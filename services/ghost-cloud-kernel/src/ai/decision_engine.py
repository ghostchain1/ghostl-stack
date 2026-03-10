"""AI decision engine — local heuristics + optional GhostBrain Core query.

Decisions are purely advisory.  No automated infrastructure mutation is
triggered from this module — callers receive a decision string and choose
whether to initiate a governance proposal.

Decision outcomes
-----------------
  "scale_out"   — VM count below threshold or CPU/mem pressure excessive
  "scale_in"    — excess VMs with very low utilisation (future)
  "investigate" — one or more chains unhealthy
  "stable"      — nothing requiring action
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_GHOSTBRAIN_URL: str = os.getenv("GACK_GHOSTBRAIN_URL", "http://127.0.0.1:7900")
_BRAIN_TIMEOUT_S: int = min(30, max(1, int(os.getenv("GACK_BRAIN_TIMEOUT_S", "15"))))

# Configurable thresholds
_CPU_PRESSURE: float = float(os.getenv("GACK_CPU_PRESSURE_THRESHOLD", "4.0"))
_MEM_PRESSURE_BYTES: int = int(
    os.getenv("GACK_MEM_PRESSURE_BYTES", str(1 * 1024 * 1024 * 1024))  # 1 GiB
)
_MIN_RUNNING_VMS: int = max(1, int(os.getenv("GACK_MIN_RUNNING_VMS", "4")))


@dataclass
class InfraSnapshot:
    """Aggregated infrastructure snapshot passed to the decision engine."""
    cpu_load_1m: float = 0.0
    memory_free_bytes: int = 0
    running_vms: int = 0
    chains_unhealthy: list[str] = field(default_factory=list)
    containers_unhealthy: int = 0


@dataclass
class Decision:
    outcome: str                  # "scale_out" | "investigate" | "stable"
    reasons: list[str] = field(default_factory=list)
    health_score: float = 100.0


def decide(snapshot: InfraSnapshot) -> Decision:
    """Run local heuristics and return a Decision. Never raises."""
    reasons: list[str] = []
    score = 100.0

    if snapshot.running_vms < _MIN_RUNNING_VMS:
        reasons.append(
            f"running VMs ({snapshot.running_vms}) below minimum ({_MIN_RUNNING_VMS})"
        )
        score -= 25.0

    if snapshot.cpu_load_1m > _CPU_PRESSURE:
        reasons.append(f"CPU load_1m={snapshot.cpu_load_1m:.2f} exceeds threshold {_CPU_PRESSURE}")
        score -= 20.0

    if snapshot.memory_free_bytes < _MEM_PRESSURE_BYTES:
        reasons.append(
            f"free memory {snapshot.memory_free_bytes // (1024**2)} MiB "
            f"below threshold {_MEM_PRESSURE_BYTES // (1024**2)} MiB"
        )
        score -= 20.0

    if snapshot.chains_unhealthy:
        reasons.append(f"unhealthy chains: {', '.join(snapshot.chains_unhealthy)}")
        score -= len(snapshot.chains_unhealthy) * 15.0

    if snapshot.containers_unhealthy > 0:
        reasons.append(f"{snapshot.containers_unhealthy} unhealthy container(s) detected")
        score -= min(snapshot.containers_unhealthy * 5.0, 20.0)

    score = max(0.0, score)

    if snapshot.chains_unhealthy:
        outcome = "investigate"
    elif snapshot.running_vms < _MIN_RUNNING_VMS or snapshot.cpu_load_1m > _CPU_PRESSURE:
        outcome = "scale_out"
    elif reasons:
        outcome = "investigate"
    else:
        outcome = "stable"

    return Decision(outcome=outcome, reasons=reasons, health_score=score)


def query_ghostbrain(payload: dict) -> dict:
    """Forward a snapshot payload to GhostBrain Core for advisory classification."""
    data = json.dumps(payload).encode("utf-8")
    try:
        req = urllib.request.Request(
            f"{_GHOSTBRAIN_URL}/api/v1/brain/classify",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=_BRAIN_TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as exc:
        logger.warning("GhostBrain query failed: %s", exc)
        return {"ok": False, "reason": str(exc)}
