from __future__ import annotations

"""
Background reconciler — runs discover → analyse → plan → apply on a timer.
"""

import logging
import threading
import time
from typing import Any

from core.analyser import analyse_snapshot
from core.apply_engine import apply_plan
from core.discovery import run_discovery
from core.metrics import (
    APPLY_ACTIONS_FAIL,
    APPLY_ACTIONS_OK,
    APPLY_TOTAL,
    DISCOVERY_ERRORS_TOTAL,
    DISCOVERY_TOTAL,
    FINDINGS_CRIT,
    FINDINGS_WARN,
    RECONCILE_DURATION,
    update_from_snapshot,
)
from core.planner import build_plan
from core.settings import apply_enabled, load_paths, reconcile_interval_seconds

log = logging.getLogger("ghost-storage-ai.reconciler")


class StorageReconciler:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_snapshot: dict[str, Any] = {}
        self._last_findings: list[dict[str, Any]] = []
        self._last_plan: dict[str, Any] = {}
        self._last_apply: dict[str, Any] = {}
        self._lock = threading.Lock()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, name="storage-reconciler", daemon=True)
        self._thread.start()
        log.info("StorageReconciler started (interval=%ds)", reconcile_interval_seconds())

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._reconcile_once()
            except Exception as exc:  # noqa: BLE001
                log.error("Reconcile error: %s", exc, exc_info=True)
            self._stop.wait(timeout=reconcile_interval_seconds())

    def _reconcile_once(self) -> None:
        paths = load_paths()
        with RECONCILE_DURATION.time():
            # 1. Discover
            DISCOVERY_TOTAL.inc()
            disc = run_discovery(paths.config_dir, paths.state_dir)
            snapshot = disc["snapshot"]

            errors = sum(1 for v in snapshot.get("vms", []) if v.get("error"))
            if errors:
                DISCOVERY_ERRORS_TOTAL.inc(errors)
            update_from_snapshot(snapshot)

            # 2. Analyse
            findings = analyse_snapshot(snapshot)
            crit = sum(1 for f in findings if f["severity"] == "crit")
            warn = sum(1 for f in findings if f["severity"] == "warn")
            FINDINGS_CRIT.set(crit)
            FINDINGS_WARN.set(warn)

            # 3. Plan
            plan = build_plan(findings, paths.plans_dir)

            # 4. Apply
            APPLY_TOTAL.inc()
            result = apply_plan(plan, paths.plans_dir, apply_enabled=apply_enabled())
            APPLY_ACTIONS_OK.inc(result.get("ok", 0))
            APPLY_ACTIONS_FAIL.inc(result.get("failed", 0))

        with self._lock:
            self._last_snapshot = snapshot
            self._last_findings = findings
            self._last_plan = plan
            self._last_apply = result

    @property
    def state(self) -> dict[str, Any]:
        with self._lock:
            return {
                "snapshot_ts": self._last_snapshot.get("timestamp"),
                "findings": self._last_findings,
                "plan": self._last_plan,
                "last_apply": self._last_apply,
            }
