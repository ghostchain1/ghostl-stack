from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

from core.apply_engine import apply_plan, rollback_plan
from core.brain_connector import publish_signal, start as brain_start
from core.common import read_yaml
from core.discovery import run_discovery
from core.planner import build_plan, load_latest_plan
from core.reconcile.network_reconciler import Reconciler
from core.settings import apply_enabled, load_paths, reconcile_interval_seconds
from core.verify_engine import run_verification

app = FastAPI(title="ghostvm-ai", version="1.0.0")

DISCOVERY_TOTAL = Counter("ghostnetsync_discovery_total", "Total discoveries")
PLAN_TOTAL = Counter("ghostnetsync_plan_total", "Total plan runs")
APPLY_TOTAL = Counter("ghostnetsync_apply_total", "Total apply runs")
VERIFY_TOTAL = Counter("ghostnetsync_verify_total", "Total verification runs")

paths = load_paths()


def _load_cfg() -> tuple[dict, dict]:
    ndsm = read_yaml(paths.config_dir / "network-desired-state.yaml")
    policy = read_yaml(paths.config_dir / "routing-policy.yaml")
    return ndsm, policy


def _reconcile_tick() -> dict:
    ndsm, policy = _load_cfg()
    discovery = run_discovery(paths.state_dir)
    plan = build_plan(ndsm, policy, discovery["snapshot"], paths.plans_dir)
    verify = run_verification(ndsm, policy, paths.evidence_dir, discovery["snapshot"])
    return {"ok": bool(plan.get("ok") and verify.get("ok")), "plan_id": plan["plan"]["id"], "verify": verify.get("ok")}


reconciler = Reconciler(reconcile_interval_seconds(), _reconcile_tick)


@app.on_event("startup")
def _startup() -> None:
    reconciler.start()
    brain_start()   # Register with GhostBrain Core + start heartbeat


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ghostvm-ai", "reconciler": reconciler.last_result}


@app.get("/metrics")
def metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest().decode("utf-8"), media_type=CONTENT_TYPE_LATEST)


@app.post("/discover")
def discover() -> dict:
    DISCOVERY_TOTAL.inc()
    result = run_discovery(paths.state_dir)
    publish_signal(service="ghostvm-ai", metric="discovery.run", value=1.0, anomaly=False,
                   log_line="ghostvm-ai discovery completed")
    return result


@app.post("/plan")
def plan() -> dict:
    PLAN_TOTAL.inc()
    ndsm, policy = _load_cfg()
    discovery = run_discovery(paths.state_dir)
    result = build_plan(ndsm, policy, discovery["snapshot"], paths.plans_dir)
    ok = bool(result.get("ok"))
    publish_signal(service="ghostvm-ai", metric="plan.run", value=1.0 if ok else 0.0,
                   anomaly=not ok, log_line=f"ghostvm-ai plan: ok={ok}")
    return result


@app.post("/apply")
def apply(dry_run: bool = True) -> dict:
    APPLY_TOTAL.inc()
    plan_data = load_latest_plan(paths.plans_dir)
    result = apply_plan(plan_data, paths.plans_dir, paths.governance_dir, apply_enabled=apply_enabled(), dry_run=dry_run)
    ok = bool(result.get("ok"))
    publish_signal(service="ghostvm-ai", metric="apply.run", value=1.0 if ok else 0.0,
                   anomaly=not ok, log_line=f"ghostvm-ai apply dry_run={dry_run}: ok={ok}")
    return result


@app.post("/verify")
def verify(context: str = "host", probe_source: str = "") -> dict:
    VERIFY_TOTAL.inc()
    ndsm, policy = _load_cfg()
    discovery = run_discovery(paths.state_dir)
    return run_verification(
        ndsm,
        policy,
        paths.evidence_dir,
        discovery["snapshot"],
        context=context,
        probe_source=probe_source or None,
    )


@app.post("/rollback")
def rollback() -> dict:
    plan_data = load_latest_plan(paths.plans_dir)
    return rollback_plan(plan_data, paths.plans_dir, dry_run=True)


@app.get("/status")
def status() -> dict:
    return {
        "ok": True,
        "apply_enabled": apply_enabled(),
        "paths": {
            "state": str(paths.state_dir),
            "plans": str(paths.plans_dir),
            "evidence": str(paths.evidence_dir),
            "governance": str(paths.governance_dir),
        },
        "reconciler": reconciler.last_result,
    }
