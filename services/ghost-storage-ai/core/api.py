from __future__ import annotations

import logging
import threading

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from core.analyser import analyse_snapshot
from core.apply_engine import apply_plan
from core.discovery import run_discovery
from core.planner import build_plan, load_latest_plan
from core.reconciler import StorageReconciler
from core.settings import apply_enabled, load_paths

log = logging.getLogger("ghost-storage-ai.api")

app = FastAPI(title="ghost-storage-ai", version="1.0.0", description="AI-driven hypervisor storage manager")
_reconciler: StorageReconciler | None = None


@app.on_event("startup")
def on_startup() -> None:
    """Wire GhostBrain Core registration + heartbeat on FastAPI startup."""
    from core.ghostbrain_client import ghostbrain_register, ghostbrain_start_heartbeat
    threading.Thread(
        target=lambda: (ghostbrain_register(), ghostbrain_start_heartbeat()),
        daemon=True,
        name="ghostbrain-register",
    ).start()


def set_reconciler(r: StorageReconciler) -> None:
    global _reconciler
    _reconciler = r


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "ghost-storage-ai"}


# ── Metrics ───────────────────────────────────────────────────────────────────

@app.get("/metrics")
async def metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ── Status ────────────────────────────────────────────────────────────────────

@app.get("/status")
async def status() -> dict:
    if _reconciler is None:
        return {"reconciler": "not started"}
    return _reconciler.state


# ── Manual discovery ──────────────────────────────────────────────────────────

@app.post("/discover")
async def discover() -> dict:
    paths = load_paths()
    result = run_discovery(paths.config_dir, paths.state_dir)
    return result


# ── Findings ──────────────────────────────────────────────────────────────────

@app.get("/findings")
async def findings() -> dict:
    if _reconciler is None:
        raise HTTPException(status_code=503, detail="Reconciler not running")
    state = _reconciler.state
    return {
        "snapshot_ts": state.get("snapshot_ts"),
        "findings": state.get("findings", []),
    }


# ── Plan ─────────────────────────────────────────────────────────────────────

@app.post("/plan")
async def plan() -> dict:
    paths = load_paths()
    disc = run_discovery(paths.config_dir, paths.state_dir)
    findings_list = analyse_snapshot(disc["snapshot"])
    p = build_plan(findings_list, paths.plans_dir)
    return p


@app.get("/plan/latest")
async def plan_latest() -> dict:
    paths = load_paths()
    p = load_latest_plan(paths.plans_dir)
    if not p:
        raise HTTPException(status_code=404, detail="No plan found")
    return p


# ── Apply ─────────────────────────────────────────────────────────────────────

@app.post("/apply")
async def apply(dry_run: bool = True) -> dict:
    """Apply the latest plan. dry_run=true by default for safety."""
    paths = load_paths()
    p = load_latest_plan(paths.plans_dir)
    if not p:
        raise HTTPException(status_code=404, detail="No plan found — run /plan first")
    result = apply_plan(p, paths.plans_dir, apply_enabled=apply_enabled(), dry_run=dry_run)
    return result


# ── VM-specific findings ──────────────────────────────────────────────────────

@app.get("/vm/{vm_name}/findings")
async def vm_findings(vm_name: str) -> dict:
    if _reconciler is None:
        raise HTTPException(status_code=503, detail="Reconciler not running")
    state = _reconciler.state
    vm_findings_list = [f for f in state.get("findings", []) if f.get("vm") == vm_name]
    return {"vm": vm_name, "findings": vm_findings_list}
