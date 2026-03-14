"""Infrastructure AI — local heuristics + optional GhostBrain Core query.

The local analysis runs synchronously on every controller loop tick.
GhostBrain queries are on-demand via the /ai/brain/query endpoint so
the loop never blocks on an external HTTP call.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_GHOSTBRAIN_URL: str = os.getenv("GNMC_GHOSTBRAIN_URL", "http://127.0.0.1:7900")
_TIMEOUT_S: int = min(30, max(1, int(os.getenv("GNMC_BRAIN_TIMEOUT_S", "15"))))

# Memory below this threshold (bytes) is considered pressure
_MEM_PRESSURE_BYTES: int = int(
    os.getenv("GNMC_MEM_PRESSURE_BYTES", str(1 * 1024 * 1024 * 1024))  # 1 GiB default
)
# 1-min load average above this is considered CPU pressure
_CPU_PRESSURE_THRESHOLD: float = float(os.getenv("GNMC_CPU_PRESSURE_THRESHOLD", "4.0"))


@dataclass
class InfraAnalysis:
    memory_pressure: bool
    cpu_pressure: bool
    recommendations: list[str] = field(default_factory=list)
    health_score: float = 100.0


def analyze_infrastructure(health) -> InfraAnalysis:
    """Run local heuristic analysis against a SystemHealth snapshot.

    Returns an InfraAnalysis with recommendations but takes *no* automated
    action — callers decide whether to act on the recommendations.
    """
    recs: list[str] = []
    mem_pressure = health.memory_free_bytes < _MEM_PRESSURE_BYTES
    cpu_pressure = health.cpu_load_1m > _CPU_PRESSURE_THRESHOLD

    if mem_pressure:
        recs.append(
            f"memory_pressure: {health.memory_free_bytes // (1024**2)} MiB available "
            f"(threshold {_MEM_PRESSURE_BYTES // (1024**2)} MiB) — consider scale-down or eviction"
        )
    if cpu_pressure:
        recs.append(
            f"cpu_pressure: load_1m={health.cpu_load_1m:.2f} "
            f"(threshold {_CPU_PRESSURE_THRESHOLD}) — consider load redistribution"
        )

    score = 100.0
    if mem_pressure:
        score -= 30.0
    if cpu_pressure:
        score -= 30.0

    return InfraAnalysis(
        memory_pressure=mem_pressure,
        cpu_pressure=cpu_pressure,
        recommendations=recs,
        health_score=score,
    )


def query_ghostbrain(payload: dict) -> dict:
    """Forward an infrastructure analysis payload to GhostBrain Core.

    GhostBrain is queried only on explicit request — never called
    autonomously inside the controller loop to avoid blocking.
    """
    data = json.dumps(payload).encode("utf-8")
    try:
        req = urllib.request.Request(
            f"{_GHOSTBRAIN_URL}/api/v1/brain/classify",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as exc:
        logger.warning("GhostBrain query failed: %s", exc)
        return {"ok": False, "reason": str(exc)}
