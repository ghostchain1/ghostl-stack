"""GACK kernel loop — one async iteration, called on a timer from main.py.

Each tick:
  1. Telemetry snapshot  (local + upstream services)
  2. VM scan             (read-only libvirt)
  3. Container self-heal (Docker SDK, DRY_RUN gated)
  4. Chain health checks (ghost_chainId + ghost_blockNumber for L1/L2/L3)
  5. AI decision         (local heuristics — no external HTTP call)
  6. VM scale proposal   (sent to signing relay only if decision == "scale_out")

No database writes.  All state is in-memory and surfaced via REST endpoints.
"""
from __future__ import annotations

import logging
import time

from metrics import (
    GACK_CHAIN_BLOCK_HEIGHT,
    GACK_CHAIN_ID_MISMATCH_TOTAL,
    GACK_CHAIN_UP,
    GACK_CONTAINER_COUNT,
    GACK_CONTAINER_HEALS_TOTAL,
    GACK_DECISION_TOTAL,
    GACK_HEALTH_SCORE,
    GACK_LOOP_DURATION_SECONDS,
    GACK_LOOP_TOTAL,
    GACK_SERVICES_DISCOVERED,
    GACK_VM_COUNT,
    GACK_VM_SCALE_PROPOSALS_TOTAL,
    GACK_VM_SCAN_TOTAL,
)
from src.ai.decision_engine import Decision, InfraSnapshot, decide
from src.blockchain.chain_orchestrator import check_all_chains
from src.infrastructure.container_healer import heal_containers
from src.infrastructure.vm_scaler import maybe_propose_scale_out, scan_vms
from src.monitoring.telemetry import TelemetrySnapshot, collect
from src.networking.service_discovery import discover_services

logger = logging.getLogger(__name__)


async def run_kernel_loop() -> dict:
    """Execute one full GACK kernel loop. Returns a summary dict."""
    start = time.perf_counter()
    GACK_LOOP_TOTAL.inc()
    result: dict = {}

    # ── 1. Telemetry ──────────────────────────────────────────────────────────
    snap: TelemetrySnapshot = collect()
    result["telemetry"] = {
        "cpu_load_1m": snap.cpu_load_1m,
        "memory_free_bytes": snap.memory_free_bytes,
        "memory_total_bytes": snap.memory_total_bytes,
        "uptime_s": snap.uptime_seconds,
        "hostname": snap.hostname,
        "gnmc_ok": snap.gnmc_ok,
        "ghostdns_ok": snap.ghostdns_ok,
    }

    # ── 2. VM scan ────────────────────────────────────────────────────────────
    vm_scan = scan_vms()
    GACK_VM_SCAN_TOTAL.inc()
    running_vms = vm_scan.get("running", 0)
    GACK_VM_COUNT.labels(state="running").set(running_vms)
    GACK_VM_COUNT.labels(state="total").set(vm_scan.get("total", 0))
    result["vms"] = vm_scan

    # ── 3. Container self-heal ────────────────────────────────────────────────
    heal_events = heal_containers()
    stopped_count = sum(1 for e in heal_events if e.get("ok"))
    GACK_CONTAINER_COUNT.labels(status="healed").set(stopped_count)
    for ev in heal_events:
        if ev.get("ok") and not ev.get("dry_run"):
            GACK_CONTAINER_HEALS_TOTAL.labels(name=ev.get("container", "unknown")).inc()
    result["container_heals"] = heal_events

    # ── 4. Service discovery ──────────────────────────────────────────────────
    services = discover_services()
    GACK_SERVICES_DISCOVERED.set(len(services))
    result["services_discovered"] = len(services)

    # ── 5. Chain health ───────────────────────────────────────────────────────
    chain_results = check_all_chains()
    unhealthy_chains: list[str] = []
    chain_summary: list[dict] = []
    for ch in chain_results:
        GACK_CHAIN_UP.labels(layer=ch.layer).set(1 if ch.ok else 0)
        GACK_CHAIN_BLOCK_HEIGHT.labels(layer=ch.layer).set(ch.block_number)
        if not ch.chain_id_ok and not ch.ok:
            GACK_CHAIN_ID_MISMATCH_TOTAL.labels(layer=ch.layer).inc()
        if not ch.ok:
            unhealthy_chains.append(ch.layer)
        chain_summary.append({
            "layer": ch.layer,
            "ok": ch.ok,
            "block_number": ch.block_number,
            "latency_ms": ch.latency_ms,
            "reason": ch.reason,
        })
    result["chains"] = chain_summary

    # ── 6. AI decision ────────────────────────────────────────────────────────
    inf_snap = InfraSnapshot(
        cpu_load_1m=snap.cpu_load_1m,
        memory_free_bytes=snap.memory_free_bytes,
        running_vms=running_vms,
        chains_unhealthy=unhealthy_chains,
        containers_unhealthy=stopped_count,
    )
    decision: Decision = decide(inf_snap)
    GACK_DECISION_TOTAL.labels(decision=decision.outcome).inc()
    GACK_HEALTH_SCORE.set(decision.health_score)
    result["decision"] = {
        "outcome": decision.outcome,
        "reasons": decision.reasons,
        "health_score": decision.health_score,
    }

    # ── 7. Scale-out proposal (if needed) ────────────────────────────────────
    if decision.outcome == "scale_out":
        proposal = maybe_propose_scale_out(vm_scan)
        if proposal is not None:
            status = "ok" if proposal.get("ok", proposal.get("dry_run")) else "error"
            GACK_VM_SCALE_PROPOSALS_TOTAL.labels(status=status).inc()
            result["scale_proposal"] = proposal

    elapsed = time.perf_counter() - start
    GACK_LOOP_DURATION_SECONDS.observe(elapsed)
    result["loop_duration_s"] = round(elapsed, 4)

    if unhealthy_chains:
        logger.warning("Unhealthy chains: %s", unhealthy_chains)
    logger.info(
        "GACK kernel loop: decision=%s health=%.0f duration=%.3fs",
        decision.outcome, decision.health_score, elapsed,
    )
    return result
