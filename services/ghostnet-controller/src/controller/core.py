"""GNMC central controller loop — one iteration per GNMC_LOOP_INTERVAL_S.

Each loop tick:
  1. VM scan  (read-only libvirt)
  2. Container scan + self-heal (Docker SDK, DRY_RUN gated)
  3. System health snapshot (psutil / /proc)
  4. AI analysis (local heuristics, no external call)

All mutations are gated by allowlists, cooldowns, and DRY_RUN flags.
No external HTTP calls happen inside the loop (GhostBrain queries are
requested on-demand via REST endpoints, not from the loop).
"""
from __future__ import annotations

import logging
import time

from metrics import (
    GNMC_VM_SCAN_TOTAL,
    GNMC_VM_COUNT,
    GNMC_CONTAINER_COUNT,
    GNMC_HEALTH_SCORE,
    GNMC_LOOP_DURATION_SECONDS,
    GNMC_SYSTEM_CPU_LOAD,
    GNMC_SYSTEM_MEMORY_FREE_BYTES,
)
from src.infra.hypervisor import list_vms
from src.containers.docker_manager import list_containers, heal_stopped_containers
from src.monitoring.system_health import SystemHealth, get_system_health
from src.ai.infra_ai import analyze_infrastructure

logger = logging.getLogger(__name__)


async def run_loop() -> dict:
    """Execute one GNMC controller loop iteration. Returns a status summary."""
    start = time.perf_counter()
    result: dict = {}
    health: SystemHealth | None = None

    # ── 1. VM discovery (read-only) ──────────────────────────────────────────
    try:
        vms = list_vms()
        GNMC_VM_SCAN_TOTAL.inc()
        running = sum(1 for v in vms if v.state == "running")
        stopped = len(vms) - running
        GNMC_VM_COUNT.labels(state="running").set(running)
        GNMC_VM_COUNT.labels(state="stopped").set(stopped)
        result["vms"] = [{"name": v.name, "state": v.state, "uuid": v.uuid} for v in vms]
        logger.debug("VM scan: %d running, %d stopped", running, stopped)
    except Exception as exc:
        logger.error("VM scan failed: %s", exc)
        result["vms"] = []

    # ── 2. Container scan + self-heal ────────────────────────────────────────
    try:
        containers = list_containers()
        running_c = sum(1 for c in containers if c.status == "running")
        GNMC_CONTAINER_COUNT.labels(status="running").set(running_c)
        GNMC_CONTAINER_COUNT.labels(status="total").set(len(containers))
        heal_events = heal_stopped_containers()
        result["containers"] = len(containers)
        result["heal_events"] = heal_events
        if heal_events:
            logger.info("Self-heal events: %s", heal_events)
    except Exception as exc:
        logger.error("Container operations failed: %s", exc)
        result["containers"] = 0
        result["heal_events"] = []

    # ── 3. System health ─────────────────────────────────────────────────────
    try:
        health = get_system_health()
        GNMC_SYSTEM_CPU_LOAD.set(health.cpu_load_1m)
        GNMC_SYSTEM_MEMORY_FREE_BYTES.set(health.memory_free_bytes)
        result["health"] = {
            "cpu_load_1m": health.cpu_load_1m,
            "memory_free_bytes": health.memory_free_bytes,
            "memory_total_bytes": health.memory_total_bytes,
            "memory_free_pct": round(
                health.memory_free_bytes / max(health.memory_total_bytes, 1) * 100, 1
            ),
            "uptime_s": health.uptime_seconds,
            "hostname": health.hostname,
        }
    except Exception as exc:
        logger.error("System health check failed: %s", exc)
        result["health"] = {}

    # ── 4. Local AI analysis ─────────────────────────────────────────────────
    if health is not None:
        try:
            analysis = analyze_infrastructure(health)
            if analysis.recommendations:
                logger.info("InfraAI: %s", analysis.recommendations)
            GNMC_HEALTH_SCORE.set(analysis.health_score)
            result["analysis"] = {
                "memory_pressure": analysis.memory_pressure,
                "cpu_pressure": analysis.cpu_pressure,
                "recommendations": analysis.recommendations,
                "health_score": analysis.health_score,
            }
        except Exception as exc:
            logger.error("AI analysis failed: %s", exc)

    elapsed = time.perf_counter() - start
    GNMC_LOOP_DURATION_SECONDS.observe(elapsed)
    result["loop_duration_s"] = round(elapsed, 4)
    logger.info("GNMC loop complete in %.3fs", elapsed)
    return result
