"""GhostStack Network Master Controller (GNMC) — FastAPI entry point.

Port:      GNMC_PORT (default 4060)
Auth:      HMAC governance header (X-HGOP-Timestamp + X-HGOP-Signature)
           enforced on all write endpoints when GNMC_MODE=prod.
Loop:      Autonomous controller loop runs every GNMC_LOOP_INTERVAL_S seconds.
Upstream:  ghostdns-ai (DNS / LB proxy), GhostBrain Core (AI queries),
           signing relay (VM provision proposals).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field

from metrics import (
    GNMC_BRAIN_QUERY_TOTAL,
    GNMC_CONTAINER_RESTARTS_TOTAL,
    GNMC_DNS_SYNC_TOTAL,
    GNMC_LB_SYNC_TOTAL,
    GNMC_VM_ACTION_TOTAL,
    GNMC_VM_PROVISION_PROPOSALS_TOTAL,
)
from src.ai.infra_ai import analyze_infrastructure, query_ghostbrain
from src.containers.docker_manager import (
    heal_stopped_containers,
    list_containers,
    restart_container,
)
from src.controller.core import run_loop
from src.infra.hypervisor import list_vms
from src.infra.vm_manager import propose_vm_provision, shutdown_vm, start_vm
from src.monitoring.system_health import get_system_health
from src.network.dns_sync import DnsRecord, get_zone, upsert_record
from src.network.load_balancer import list_lb_services, select_backend

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("gnmc.main")

# ── Config ────────────────────────────────────────────────────────────────────
GNMC_PORT: int = int(os.getenv("GNMC_PORT", "4060"))
GNMC_MODE: str = os.getenv("GNMC_MODE", "dev")
_SHARED_SECRET: str = os.getenv("HGOP_SHARED_SECRET", "")
GNMC_LOOP_INTERVAL_S: int = max(15, int(os.getenv("GNMC_LOOP_INTERVAL_S", "30")))


# ── Governance auth ───────────────────────────────────────────────────────────
def _auth_check(request: Request) -> bool:
    """Return True if the request carries a valid HMAC governance header.
    In dev mode always returns True.  In prod mode returns False if the
    HGOP_SHARED_SECRET env var is not set (fail-closed).
    """
    if GNMC_MODE != "prod":
        return True
    if not _SHARED_SECRET:
        return False
    ts = request.headers.get("X-HGOP-Timestamp", "")
    sig = request.headers.get("X-HGOP-Signature", "")
    if not ts or not sig:
        return False
    expected = hmac.new(
        _SHARED_SECRET.encode(), ts.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig)


# ── Autonomous loop ───────────────────────────────────────────────────────────
_loop_task: Optional[asyncio.Task] = None
_last_loop_result: dict = {}
_last_loop_ts: float = 0.0


async def _controller_loop() -> None:
    global _last_loop_result, _last_loop_ts
    while True:
        try:
            _last_loop_result = await run_loop()
            _last_loop_ts = time.time()
        except Exception as exc:
            logger.error("Unhandled error in controller loop: %s", exc)
        await asyncio.sleep(GNMC_LOOP_INTERVAL_S)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop_task
    _loop_task = asyncio.create_task(_controller_loop())
    logger.info(
        "GNMC started — port=%d mode=%s loop_interval=%ds",
        GNMC_PORT, GNMC_MODE, GNMC_LOOP_INTERVAL_S,
    )
    yield
    if _loop_task:
        _loop_task.cancel()
    logger.info("GNMC shutting down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ghostnet-controller",
    version="1.0.0",
    description="GhostStack Network Master Controller — autonomous infra orchestration",
    lifespan=lifespan,
)


# ── Pydantic request models ───────────────────────────────────────────────────
class VmActionBody(BaseModel):
    name: str = Field(..., pattern=r'^[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}$', max_length=63)


class VmProvisionBody(BaseModel):
    suggested_name: str = Field(..., pattern=r'^[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}$', max_length=63)
    reason: str = Field(..., min_length=10, max_length=500)


class ContainerRestartBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class DnsUpsertBody(BaseModel):
    name: str = Field(..., max_length=253)
    ip: str = Field(..., pattern=r'^\d{1,3}(\.\d{1,3}){3}$')
    ttl: int = Field(default=60, ge=1, le=86400)
    rtype: str = Field(default="A", pattern=r'^[A-Z]{1,10}$')


class BrainQueryBody(BaseModel):
    payload: dict


# ── Utility endpoints ─────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ghostnet-controller",
        "version": "1.0.0",
        "mode": GNMC_MODE,
        "loop_interval_s": GNMC_LOOP_INTERVAL_S,
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/status")
async def status():
    return {
        "last_loop": _last_loop_result,
        "last_loop_ts": _last_loop_ts,
    }


# ── VM endpoints ──────────────────────────────────────────────────────────────
@app.get("/infra/vms")
async def get_vms():
    """List all ghost-prefixed VMs visible in the hypervisor (read-only)."""
    vms = list_vms()
    return {"vms": [{"name": v.name, "state": v.state, "uuid": v.uuid} for v in vms]}


@app.post("/infra/vms/start")
async def vm_start(body: VmActionBody, request: Request):
    """Start a VM by name (allowlist + cooldown + DRY_RUN gated)."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    result = start_vm(body.name)
    GNMC_VM_ACTION_TOTAL.labels(name=body.name, action="start").inc()
    return result


@app.post("/infra/vms/shutdown")
async def vm_shutdown(body: VmActionBody, request: Request):
    """Gracefully shut down a VM by name (allowlist + cooldown + DRY_RUN gated)."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    result = shutdown_vm(body.name)
    GNMC_VM_ACTION_TOTAL.labels(name=body.name, action="shutdown").inc()
    return result


@app.post("/infra/vms/propose-provision")
async def vm_propose_provision(body: VmProvisionBody, request: Request):
    """Submit a VM provisioning proposal to the governance signing relay.
    This endpoint NEVER creates a VM — only sends a proposal for human ratification.
    """
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    result = propose_vm_provision(reason=body.reason, suggested_name=body.suggested_name)
    GNMC_VM_PROVISION_PROPOSALS_TOTAL.labels(
        status="ok" if result.get("ok") else "error"
    ).inc()
    return result


# ── Container endpoints ───────────────────────────────────────────────────────
@app.get("/containers")
async def get_containers():
    """List all containers visible to the Docker daemon."""
    containers = list_containers()
    return {
        "containers": [
            {"id": c.id, "name": c.name, "status": c.status, "image": c.image}
            for c in containers
        ]
    }


@app.post("/containers/restart")
async def container_restart(body: ContainerRestartBody, request: Request):
    """Restart a specific container (allowlist + cooldown + DRY_RUN gated)."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    result = restart_container(body.name)
    if result.get("ok"):
        GNMC_CONTAINER_RESTARTS_TOTAL.labels(name=body.name).inc()
    return result


@app.post("/containers/heal")
async def container_heal(request: Request):
    """Trigger an immediate self-heal pass for all stopped ghost-* containers."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    events = heal_stopped_containers()
    for ev in events:
        if ev.get("ok"):
            GNMC_CONTAINER_RESTARTS_TOTAL.labels(name=ev.get("container", "unknown")).inc()
    return {"events": events}


# ── Network / DNS endpoints ───────────────────────────────────────────────────
@app.get("/network/zone")
async def get_network_zone():
    """Fetch current DNS zone from ghostdns-ai (read-only proxy)."""
    zone = get_zone()
    GNMC_DNS_SYNC_TOTAL.labels(status="ok" if zone else "error").inc()
    return zone


@app.post("/network/dns/upsert")
async def dns_upsert(body: DnsUpsertBody, request: Request):
    """Push a DNS A record to ghostdns-ai (validation + auth gated)."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    record = DnsRecord(name=body.name, ip=body.ip, ttl=body.ttl, rtype=body.rtype)
    result = upsert_record(record)
    GNMC_DNS_SYNC_TOTAL.labels(status="ok" if result.get("ok") else "error").inc()
    return result


# ── Load balancer proxy endpoints ─────────────────────────────────────────────
@app.get("/network/lb/services")
async def lb_services():
    """List all LB-registered services from ghostdns-ai."""
    data = list_lb_services()
    GNMC_LB_SYNC_TOTAL.labels(status="ok" if data.get("ok", True) else "error").inc()
    return data


@app.get("/network/lb/select/{service}")
async def lb_select(service: str):
    """Ask ghostdns-ai to select the best backend for a given service."""
    return select_backend(service)


# ── Monitoring endpoints ──────────────────────────────────────────────────────
@app.get("/monitoring/health")
async def monitoring_health():
    """Return current host system health metrics."""
    h = get_system_health()
    return {
        "cpu_load_1m": h.cpu_load_1m,
        "memory_free_bytes": h.memory_free_bytes,
        "memory_total_bytes": h.memory_total_bytes,
        "memory_free_pct": round(
            h.memory_free_bytes / max(h.memory_total_bytes, 1) * 100, 1
        ),
        "uptime_seconds": h.uptime_seconds,
        "hostname": h.hostname,
    }


# ── AI endpoints ──────────────────────────────────────────────────────────────
@app.get("/ai/analysis")
async def ai_analysis():
    """Run local infrastructure analysis against current system health."""
    h = get_system_health()
    a = analyze_infrastructure(h)
    return {
        "memory_pressure": a.memory_pressure,
        "cpu_pressure": a.cpu_pressure,
        "recommendations": a.recommendations,
        "health_score": a.health_score,
    }


@app.post("/ai/brain/query")
async def ai_brain_query(body: BrainQueryBody, request: Request):
    """Forward an analysis payload to GhostBrain Core and return the response."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    result = query_ghostbrain(body.payload)
    GNMC_BRAIN_QUERY_TOTAL.labels(
        status="ok" if result.get("ok", True) else "error"
    ).inc()
    return result


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=GNMC_PORT, log_level="info")
